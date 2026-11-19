import * as THREE from "three";
import { LAMP_BASE_RADIUS, LOT_SIZE, footprint, isLamp, isPaving } from "./placement.js";
import { BASE_AREA, containsPoint } from "./village-area.js";

const PLAYER_RADIUS = 0.3;
const WALK_SPEED = 8.4;
const FLIGHT_SPEED = 23;
const VERTICAL_SPEED = 18;
const TAKEOFF_HEIGHT = 26;
const FLIGHT_LIMIT = 140;

const EYE_HEIGHT = 1.68;
const LOOK_SENSITIVITY = 0.004;
const PITCH_LIMIT = THREE.MathUtils.degToRad(85);
const FLIGHT_PITCH_LIMIT = THREE.MathUtils.degToRad(89);

function outsideColumn(x, z, { min, max }) {
  return x <= min.x - PLAYER_RADIUS || x >= max.x + PLAYER_RADIUS ||
    z <= min.z - PLAYER_RADIUS || z >= max.z + PLAYER_RADIUS;
}

function fitsAt(x, z, eye, bounds) {
  return outsideColumn(x, z, bounds) || eye - EYE_HEIGHT >= bounds.max.y + PLAYER_RADIUS;
}

const approach = (current, target, step) =>
  Math.abs(target - current) <= step ? target : current + Math.sign(target - current) * step;

export function createWalker(getHeight, viewDistance) {
  const camera = new THREE.PerspectiveCamera(62, 1, 0.08, viewDistance);
  camera.rotation.order = "YXZ";
  const { position } = camera;
  const templateBounds = new Map();
  let obstacles = [];
  let active = false;
  let flying = false;
  let takeoffHeight = null;
  let landing = null;
  let area = BASE_AREA;

  function isFree(x, z, eye) {
    return obstacles.every(bounds => eye === undefined
      ? outsideColumn(x, z, bounds)
      : fitsAt(x, z, eye, bounds));
  }

  function spawnNear(x, z, roads, area) {
    let nearest = 18;
    let nearbyRoad = null;
    for (const road of roads) {
      const distance = Math.hypot(x - road.x, z - road.z);
      if (distance < nearest && isFree(road.x, road.z)) {
        nearest = distance;
        nearbyRoad = road;
      }
    }
    if (nearbyRoad) return nearbyRoad;
    if (isFree(x, z)) return { x, z };
    for (let radius = 1; radius <= LOT_SIZE * 2; radius++) {
      for (let step = 0; step < 16; step++) {
        const angle = step * Math.PI / 8;
        const px = x + Math.cos(angle) * radius;
        const pz = z + Math.sin(angle) * radius;
        if (isFree(px, pz)) return { x: px, z: pz };
      }
    }
    return { x: area.maxX + LOT_SIZE / 2 + 1, z };
  }

  function obstacleBounds(type, x, z, rotation, matrix, templates) {
    if (!templateBounds.has(type))
      templateBounds.set(type, new THREE.Box3().setFromObject(templates[type]));
    const bounds = templateBounds.get(type).clone().applyMatrix4(matrix);
    const [halfWidth, halfDepth] = isLamp(type)
      ? [LAMP_BASE_RADIUS, LAMP_BASE_RADIUS]
      : footprint(type, rotation).map((size) => size / 2);
    bounds.min.x = Math.max(bounds.min.x, x - halfWidth);
    bounds.max.x = Math.min(bounds.max.x, x + halfWidth);
    bounds.min.z = Math.max(bounds.min.z, z - halfDepth);
    bounds.max.z = Math.min(bounds.max.z, z + halfDepth);
    return bounds;
  }

  function updateObstacles(houses, templates) {
    obstacles = houses.filter(({ type }) => !isPaving(type)).map(({ type, model, x, z, rotation }) => {
      model.updateWorldMatrix(true, false);
      // Keep the space beyond the lot, including the sidewalk, open to walking.
      return obstacleBounds(type, x, z, rotation, model.matrixWorld, templates);
    });
    if (landing) landing = planLanding();
    if (active && !flying) position.y = getHeight(position.x, position.z) + EYE_HEIGHT;
  }

  function canBuildAt(type, x, z, rotation, templates, height = 0) {
    if (isPaving(type)) return true;
    const matrix = new THREE.Matrix4().makeRotationY(rotation * Math.PI / 2);
    matrix.setPosition(x, height, z);
    const bounds = obstacleBounds(type, x, z, rotation, matrix, templates);
    return flying ? fitsAt(position.x, position.z, position.y, bounds)
      : outsideColumn(position.x, position.z, bounds);
  }

  function enter(focus, direction, houses, templates, roads, bounds = BASE_AREA) {
    area = bounds;
    flying = false;
    takeoffHeight = landing = null;
    updateObstacles(houses, templates);
    const insideCity = containsPoint(area, focus.x, focus.z, LOT_SIZE / 2);
    const { x, z } = spawnNear(insideCity ? focus.x : 0, insideCity ? focus.z : 0, roads, area);
    position.set(x, getHeight(x, z) + EYE_HEIGHT, z);
    camera.rotation.set(-0.07, Math.atan2(-direction.x, -direction.z), 0);
    active = true;
  }

  function planLanding() {
    const { x, z } = spawnNear(position.x, position.z, [], area);
    let cruiseHeight = position.y;
    if (x !== position.x || z !== position.z) {
      const left = Math.min(x, position.x) - PLAYER_RADIUS;
      const right = Math.max(x, position.x) + PLAYER_RADIUS;
      const front = Math.min(z, position.z) - PLAYER_RADIUS;
      const back = Math.max(z, position.z) + PLAYER_RADIUS;
      for (const { min, max } of obstacles) {
        if (min.x < right && max.x > left && min.z < back && max.z > front)
          cruiseHeight = Math.max(cruiseHeight, max.y + EYE_HEIGHT + PLAYER_RADIUS * 2);
      }
    }
    return { x, z, cruiseHeight };
  }

  function toggleFlight() {
    if (!active) return;
    if (flying && !landing) {
      takeoffHeight = null;
      landing = planLanding();
      return;
    }
    if (!flying) {
      takeoffHeight = getHeight(position.x, position.z) + TAKEOFF_HEIGHT;
      if (Math.abs(camera.rotation.x) < .15) camera.rotation.x = -.48;
    }
    flying = true;
    landing = null;
  }

  function followLanding(delta) {
    const { x, z, cruiseHeight } = landing;
    const step = VERTICAL_SPEED * delta;
    if (position.y < cruiseHeight && (position.x !== x || position.z !== z)) {
      position.y = approach(position.y, cruiseHeight, step);
    } else if (position.x !== x || position.z !== z) {
      const dx = x - position.x, dz = z - position.z;
      const distance = Math.hypot(dx, dz);
      const fraction = Math.min(1, FLIGHT_SPEED * delta / distance);
      position.x = fraction === 1 ? x : position.x + dx * fraction;
      position.z = fraction === 1 ? z : position.z + dz * fraction;
    } else {
      const ground = getHeight(x, z) + EYE_HEIGHT;
      position.y = approach(position.y, ground, step);
      if (position.y === ground) {
        flying = false;
        landing = null;
        camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x, -PITCH_LIMIT, PITCH_LIMIT);
      }
    }
    return true;
  }

  function fly(direction, delta, lift) {
    const { x, y, z } = position;
    const altitude = getHeight(x, z);
    const step = VERTICAL_SPEED * delta;
    if (lift) takeoffHeight = null;
    const target = THREE.MathUtils.clamp(
      takeoffHeight ?? y + lift * step, altitude + EYE_HEIGHT, altitude + FLIGHT_LIMIT,
    );
    const nextY = approach(y, target, step);
    if (isFree(x, z, nextY)) position.y = nextY;
    if (takeoffHeight !== null && position.y === target) takeoffHeight = null;
    const distance = FLIGHT_SPEED * delta;
    const nextX = x + direction.x * distance;
    const nextZ = z + direction.z * distance;
    const nextXHeight = Math.max(position.y, getHeight(nextX, z) + EYE_HEIGHT);
    if (isFree(nextX, z, nextXHeight)) position.set(nextX, nextXHeight, z);
    const nextZHeight = Math.max(position.y, getHeight(position.x, nextZ) + EYE_HEIGHT);
    if (isFree(position.x, nextZ, nextZHeight)) position.set(position.x, nextZHeight, nextZ);
    return position.x !== x || position.y !== y || position.z !== z;
  }

  function advance(direction, delta, lift = 0) {
    if (landing) return followLanding(delta);
    if (flying) return fly(direction, delta, lift);
    if (direction.lengthSq() === 0) return false;
    const { x, z } = position;
    const distance = WALK_SPEED * delta;
    const nextX = x + direction.x * distance;
    const nextZ = z + direction.z * distance;
    if (isFree(nextX, z)) position.x = nextX;
    if (isFree(position.x, nextZ)) position.z = nextZ;
    if (position.x === x && position.z === z) return false;
    position.y = getHeight(position.x, position.z) + EYE_HEIGHT;
    return true;
  }

  function look(dx, dy) {
    const limit = flying ? FLIGHT_PITCH_LIMIT : PITCH_LIMIT;
    camera.rotation.y -= dx * LOOK_SENSITIVITY;
    camera.rotation.x = THREE.MathUtils.clamp(
      camera.rotation.x - dy * LOOK_SENSITIVITY,
      -limit,
      limit,
    );
  }

  return {
    get active() {
      return active;
    },
    get flying() {
      return flying;
    },
    get landing() {
      return landing !== null;
    },
    get inTransition() {
      return takeoffHeight !== null || landing !== null;
    },
    camera,
    enter,
    toggleFlight,
    updateObstacles,
    canBuildAt,
    advance,
    look,
    leave() {
      active = false;
      flying = false;
      takeoffHeight = landing = null;
    },
  };
}
