import * as THREE from "three";
import { ASPHALT_Y, DIRECTIONS, tileKey, WALK_Y } from "./road-layout.js";
import { LOT_SIZE } from "./village-area.js";

const CAR_LIMIT = 36;
const WALKER_LIMIT = 56;
const RIGHT_LANE = 1.55;
const SIDEWALK = 4.55;
const HALF = LOT_SIZE / 2;

const choice = (items) => items[Math.floor(Math.random() * items.length)];
const carColors = ["#dd6550", "#ecb658", "#519da3", "#6380a3", "#e4e3d5", "#768868"];
const coats = ["#ad604d", "#d09948", "#427685", "#685b93", "#507655", "#b75983"];
const skinTones = ["#e1b38f", "#bc8160", "#89543a", "#eed0ac"];

export function streetGraph(roads) {
  const tiles = new Map();
  for (const road of roads.values()) {
    tiles.set(tileKey(road.x, road.z), {
      x: road.x, z: road.z, neighbors: [],
      corners: [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => ({
        x: road.x + sx * SIDEWALK, z: road.z + sz * SIDEWALK, sx, sz, neighbors: [],
      })),
    });
  }
  for (const tile of tiles.values()) {
    tile.corners.forEach((corner, i) => {
      corner.neighbors.push(tile.corners[(i + 1) % 4], tile.corners[(i + 3) % 4]);
    });
    for (const { x, z } of DIRECTIONS) {
      const adjacent = tiles.get(tileKey(tile.x + x * LOT_SIZE, tile.z + z * LOT_SIZE));
      if (!adjacent) continue;
      tile.neighbors.push(adjacent);
      for (const corner of tile.corners) {
        if ((x && corner.sx !== x) || (z && corner.sz !== z)) continue;
        corner.neighbors.push(adjacent.corners.find(
          (other) => other.sx === (x ? -x : corner.sx) && other.sz === (z ? -z : corner.sz),
        ));
      }
    }
  }
  return [...tiles.values()];
}

function nextRoad(tile, from) {
  const onward = tile.neighbors.filter((neighbor) => neighbor !== from);
  const straight = onward.find((item) => item.x === 2 * tile.x - from.x && item.z === 2 * tile.z - from.z);
  if (straight && Math.random() < 0.65) return straight;
  return onward.length ? choice(onward) : from;
}

export function carCurve(tile, from, to) {
  const dx = (tile.x - from.x) / LOT_SIZE;
  const dz = (tile.z - from.z) / LOT_SIZE;
  const ex = (to.x - tile.x) / LOT_SIZE;
  const ez = (to.z - tile.z) / LOT_SIZE;
  const start = new THREE.Vector3(tile.x - dx * HALF - dz * RIGHT_LANE, 0, tile.z - dz * HALF + dx * RIGHT_LANE);
  const end = new THREE.Vector3(tile.x + ex * HALF - ez * RIGHT_LANE, 0, tile.z + ez * HALF + ex * RIGHT_LANE);
  const bend = to === from ? 9 : 5;
  const curve = new THREE.CubicBezierCurve3(start,
    new THREE.Vector3(start.x + dx * bend, 0, start.z + dz * bend),
    new THREE.Vector3(end.x - ex * bend, 0, end.z - ez * bend),
    end,
  );
  curve.arcLengthDivisions = 12;
  return curve;
}

function startDrive(car, tile, from) {
  car.tile = tile;
  car.to = nextRoad(tile, from);
  car.curve = carCurve(tile, from, car.to);
  car.length = car.curve.getLength();
  car.distance = 0;
}

function drivePose(car, point, tangent) {
  const fraction = Math.min(1, car.distance / car.length);
  car.curve.getPointAt(fraction, point);
  car.curve.getTangentAt(fraction, tangent);
  car.yaw = Math.atan2(tangent.x, tangent.z);
  car.position.copy(point);
  car.position.y = ASPHALT_Y;
}

function startWalk(person, from, to) {
  person.from = from;
  person.to = to;
  person.length = Math.hypot(to.x - from.x, to.z - from.z);
  person.yaw = Math.atan2(to.x - from.x, to.z - from.z);
  person.distance = 0;
}

function walkPose(person, heightAt) {
  const fraction = Math.min(1, person.distance / person.length);
  const x = THREE.MathUtils.lerp(person.from.x, person.to.x, fraction);
  const z = THREE.MathUtils.lerp(person.from.z, person.to.z, fraction);
  person.position.set(x, heightAt(x, z) ?? WALK_Y, z);
}

function meshes(root, limit, specs) {
  const worldMatrix = new THREE.Matrix4();
  const localMatrix = new THREE.Matrix4();
  const result = new THREE.Matrix4();
  const color = new THREE.Color();
  const parts = specs.map(({ geometry, finish, offsets, colorKey, step }) => {
    const material = finish instanceof THREE.Material ? finish
      : new THREE.MeshStandardMaterial({ color: finish, flatShading: true, roughness: 0.8 });
    const mesh = new THREE.InstancedMesh(geometry, material, limit * offsets.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    root.add(mesh);
    return { mesh, offsets, colorKey, step };
  });
  return (agents, animate) => {
    for (const part of parts) {
      const { mesh, offsets, colorKey, step } = part;
      for (const [i, agent] of agents.entries()) {
        worldMatrix.makeRotationY(agent.yaw);
        worldMatrix.setPosition(agent.position);
        for (const [j, offset] of offsets.entries()) {
          if (step && animate) {
            const swing = Math.sin(agent.stride) * (j ? -0.45 : 0.45);
            localMatrix.makeRotationX(swing);
            localMatrix.setPosition(offset[0], offset[1] + Math.abs(swing) * 0.055,
              offset[2] + Math.sin(swing) * step);
          } else {
            localMatrix.makeTranslation(...offset);
          }
          const index = i * offsets.length + j;
          mesh.setMatrixAt(index, result.multiplyMatrices(worldMatrix, localMatrix));
          if (colorKey) mesh.setColorAt(index, color.set(agent[colorKey]));
        }
      }
      mesh.count = agents.length * offsets.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  };
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

export function createTraffic(scene, heightAt) {
  const root = new THREE.Group();
  root.name = "Tráfego da cidade";
  root.visible = false;
  scene.add(root);
  const paintCars = meshes(root, CAR_LIMIT, [
    { geometry: box(1.64, .57, 3.45), finish: "#ffffff", colorKey: "color", offsets: [[0,.59,0]] },
    { geometry: box(1.36, .42, 1.62), finish: "#26394b", offsets: [[0,1.06,-.15]] },
    { geometry: box(1.41, .12, 1.33), finish: "#ffffff", colorKey: "color", offsets: [[0,1.32,-.15]] },
    { geometry: new THREE.CylinderGeometry(.33,.33,.25,10).rotateZ(Math.PI/2), finish: "#282c2b",
      offsets: [[-.77,.34,-1.09],[.77,.34,-1.09],[-.77,.34,1.08],[.77,.34,1.08]] },
    { geometry: box(.27,.13,.035), finish: new THREE.MeshBasicMaterial({color:"#f8e4a3"}),
      offsets: [[-.59,.62,1.735],[.59,.62,1.735]] },
    { geometry: box(.26,.13,.035), finish: new THREE.MeshBasicMaterial({color:"#d94a37"}),
      offsets: [[-.59,.6,-1.735],[.59,.6,-1.735]] },
  ]);
  const paintPeople = meshes(root, WALKER_LIMIT, [
    { geometry: new THREE.CylinderGeometry(.205,.155,.62,8), finish:"#ffffff", colorKey:"color", offsets:[[0,1.075,0]] },
    { geometry: new THREE.SphereGeometry(.16,10,7), finish:"#ffffff", colorKey:"skin", offsets:[[0,1.56,0]] },
    { geometry: new THREE.SphereGeometry(.168,10,5,0,Math.PI*2,0,Math.PI*.48), finish:"#43362c", offsets:[[0,1.58,-.015]] },
    { geometry: box(.125,.67,.16), finish:"#34445b", step:.32, offsets:[[-.09,.43,0],[.09,.43,0]] },
    { geometry: box(.14,.14,.24), finish:"#594334", step:.46, offsets:[[-.09,.09,.025],[.09,.09,.025]] },
    { geometry: new THREE.CylinderGeometry(.065,.06,.44,6), finish:"#ffffff", colorKey:"color", step:-.20,
      offsets:[[-.23,1.05,0],[.23,1.05,0]] },
  ]);
  const point = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const probe = new THREE.Vector3();
  let tiles = [];
  let cars = [];
  let people = [];
  let demand = { residents: 0, employed: 0 };
  let anchor = null;
  let activeRadius = 0;
  let lastAnimated;

  function populate(focus, radius) {
    const distance = (item) => Math.hypot(item.x - focus.x, item.z - focus.z);
    const visible = tiles.filter(tile => distance(tile) <= radius);
    // Small villages get proportionately less traffic; spawn away from the viewer.
    const near = visible.filter(tile => distance(tile) >= 12);
    const sources = near.length ? near : visible;
    const drivable = sources.filter(tile => tile.neighbors.length);
    const carCount = Math.min(CAR_LIMIT, Math.ceil(visible.length / 5),
      Math.ceil(demand.residents / 32 + demand.employed / 12));
    const pedestrianCount = Math.min(WALKER_LIMIT, visible.length,
      Math.ceil(demand.residents / 12 + demand.employed / 10));
    cars = cars.filter(car => distance(car.position) <= radius + 20).slice(0, carCount);
    people = people.filter(person => distance(person.position) <= radius + 20).slice(0, pedestrianCount);
    for (let attempt = 0; drivable.length && cars.length < carCount && attempt < carCount * 6; attempt++) {
      const tile = choice(drivable);
      const car = { position: new THREE.Vector3(), speed: 6 + Math.random() * 2.4, color: choice(carColors) };
      startDrive(car, tile, choice(tile.neighbors));
      car.distance = car.length * (.12 + Math.random() * .76);
      drivePose(car, point, tangent);
      if (!cars.some(other => other.position.distanceToSquared(car.position) < 17)) cars.push(car);
    }
    while (sources.length && people.length < pedestrianCount) {
      const from = choice(choice(sources).corners);
      const person = { position: new THREE.Vector3(), speed: 1.2 + Math.random() * .6,
        stride: Math.random() * Math.PI * 2, color: choice(coats), skin: choice(skinTones) };
      startWalk(person, from, choice(from.neighbors));
      person.distance = Math.random() * person.length;
      walkPose(person, heightAt);
      people.push(person);
    }
  }

  function advanceCar(car, dt) {
    const next = Math.min(car.distance + car.speed * dt, car.length);
    car.curve.getPointAt(next / car.length, probe);
    for (const other of cars) {
      if (other === car) continue;
      const approaching = probe.distanceToSquared(other.position) < car.position.distanceToSquared(other.position);
      if (!approaching) continue;
      if (probe.distanceToSquared(other.position) < 2.7 ** 2) return;
      const dx = other.position.x - probe.x, dz = other.position.z - probe.z;
      const tx = Math.sin(car.yaw), tz = Math.cos(car.yaw);
      const ahead = dx * tx + dz * tz;
      if (ahead > 0 && ahead < 3.9 && Math.abs(dx * tz - dz * tx) < 1.0 &&
          Math.cos(other.yaw - car.yaw) > 0.8) return;
    }
    car.distance = next;
    drivePose(car, point, tangent);
    if (next === car.length) startDrive(car, car.to, car.tile);
  }

  return {
    setRoads(roads) {
      tiles = streetGraph(roads);
      cars = [];
      people = [];
      anchor = null;
    },
    setDemand(residents, employed) {
      if (residents !== demand.residents || employed !== demand.employed) {
        demand = { residents, employed };
        anchor = null;
      }
    },
    update(focus, zoom, dt, animate) {
      root.visible = tiles.length > 0 && zoom < 430 && demand.residents > 0;
      if (!root.visible) return false;
      const radius = THREE.MathUtils.clamp(77 + zoom * .48, 77, 215);
      const repopulate = !anchor || Math.hypot(focus.x - anchor.x, focus.z - anchor.z) > 24 ||
        Math.abs(radius - activeRadius) > 30;
      if (repopulate) {
        anchor = { x: focus.x, z: focus.z };
        activeRadius = radius;
        populate(focus, radius);
      }
      if (animate) {
        for (const car of cars) advanceCar(car, dt);
        for (const person of people) {
          const distance = person.speed * dt;
          person.distance += distance;
          person.stride += distance * 6;
          if (person.distance >= person.length) {
            const { from, to } = person;
            const onward = to.neighbors.filter(node => node !== from);
            startWalk(person, to, onward.length ? choice(onward) : from);
          }
          walkPose(person, heightAt);
        }
      }
      if (animate || repopulate || lastAnimated !== animate) {
        paintCars(cars, animate);
        paintPeople(people, animate);
      }
      lastAnimated = animate;
      return animate && (cars.length > 0 || people.length > 0);
    },
  };
}
