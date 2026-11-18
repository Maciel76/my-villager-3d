import * as THREE from "three";
import { BUILD_LIMIT, LAMP_BASE_RADIUS, LOT_SIZE, footprint, isLamp } from "./placement.js";

const PLAYER_RADIUS = 0.3;
const WALK_SPEED = 5.2;
const CITY_EDGE = BUILD_LIMIT + LOT_SIZE / 2;

const EYE_HEIGHT = 1.68;
const LOOK_SENSITIVITY = 0.004;
const PITCH_LIMIT = THREE.MathUtils.degToRad(85);

export function createWalker(getHeight, viewDistance) {
  const camera = new THREE.PerspectiveCamera(62, 1, 0.08, viewDistance);
  camera.rotation.order = "YXZ";
  const { position } = camera;
  const templateBounds = new Map();
  let obstacles = [];
  let active = false;

  function isFree(x, z) {
    return obstacles.every(({ min, max }) =>
      x <= min.x - PLAYER_RADIUS || x >= max.x + PLAYER_RADIUS ||
      z <= min.z - PLAYER_RADIUS || z >= max.z + PLAYER_RADIUS,
    );
  }

  function spawnNear(x, z, roads) {
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
    return { x: (Math.sign(x) || 1) * (CITY_EDGE + 1), z };
  }

  function enter(focus, direction, houses, templates, roads) {
    obstacles = houses.map(({ type, model, x, z, rotation }) => {
      if (!templateBounds.has(type))
        templateBounds.set(type, new THREE.Box3().setFromObject(templates[type]));
      model.updateWorldMatrix(true, false);
      const bounds = templateBounds.get(type).clone().applyMatrix4(model.matrixWorld);
      // Keep the space beyond the lot, including the sidewalk, open to walking.
      const [halfWidth, halfDepth] = isLamp(type)
        ? [LAMP_BASE_RADIUS, LAMP_BASE_RADIUS]
        : footprint(type, rotation).map((size) => size / 2);
      bounds.min.x = Math.max(bounds.min.x, x - halfWidth);
      bounds.max.x = Math.min(bounds.max.x, x + halfWidth);
      bounds.min.z = Math.max(bounds.min.z, z - halfDepth);
      bounds.max.z = Math.min(bounds.max.z, z + halfDepth);
      return bounds;
    });
    const insideCity = Math.max(Math.abs(focus.x), Math.abs(focus.z)) <= CITY_EDGE;
    const { x, z } = spawnNear(insideCity ? focus.x : 0, insideCity ? focus.z : 0, roads);
    position.set(x, getHeight(x, z) + EYE_HEIGHT, z);
    camera.rotation.set(-0.07, Math.atan2(-direction.x, -direction.z), 0);
    active = true;
  }

  function advance(direction, delta) {
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
    camera.rotation.y -= dx * LOOK_SENSITIVITY;
    camera.rotation.x = THREE.MathUtils.clamp(
      camera.rotation.x - dy * LOOK_SENSITIVITY,
      -PITCH_LIMIT,
      PITCH_LIMIT,
    );
  }

  return {
    get active() {
      return active;
    },
    camera,
    enter,
    advance,
    look,
    leave() {
      active = false;
    },
  };
}
