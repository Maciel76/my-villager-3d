import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRoadTraffic, vehiclesOverlap } from '../src/traffic-driving.js';
import { createFireFleet } from '../src/fire-fleet.js';
import { fireTruckHomes } from '../src/fire-station.js';
import { createTraffic, streetGraph } from '../src/traffic.js';
import { createGardenCityPlan } from '../src/garden-city-plan.js';
import { createPoliceFleet } from '../src/police-fleet.js';
import { policeCarPositions } from '../src/posto-policial.js';

function seeded(seed) { return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296); }
function station(plot = { x: 0, z: 0, rotation: 0 }) {
  const model = new THREE.Group(); model.position.set(plot.x, 0, plot.z); model.rotation.y = plot.rotation * Math.PI / 2;
  for (const [name, home] of Object.entries(fireTruckHomes)) {
    const part = new THREE.Group(); part.name = name; part.position.fromArray(home); model.add(part);
  }
  for (let i = 0; i < 4; i++) { const door = new THREE.Group(); door.name = `Fire garage door ${i}`; model.add(door); }
  return model;
}

test('four fire trucks open their doors and share collision avoidance with city traffic', () => {
  const world = createGardenCityPlan(), random = seeded(53);
  const tiles = streetGraph(new Map(world.roads.map(r => [`${r.x},${r.z}`, r])));
  const engine = createRoadTraffic({ random }), fleet = createFireFleet(engine, { random });
  const model = station(world.houses.find(h => h.type === 'fireStation'));
  fleet.add(model); fleet.setTiles(tiles); fleet.prepare(0);
  const police = new THREE.Group(), plot = world.houses.find(h => h.type === 'policeStation');
  police.position.set(plot.x, 0, plot.z); police.rotation.y = plot.rotation * Math.PI / 2;
  for (const [name, home] of Object.entries(policeCarPositions)) {
    const part = new THREE.Group(); part.name = name; part.position.fromArray(home); police.add(part);
  }
  for (const name of ['Police gate', 'Police barrier']) { const part = new THREE.Group(); part.name = name; police.add(part); }
  const policeFleet = createPoliceFleet(engine, { random });
  policeFleet.add(police); policeFleet.setTiles(tiles); policeFleet.prepare(0);
  assert.equal(fleet.states[0].cars.length, 4);
  assert.ok(fleet.states[0].cars.every(c => c.halfLength === 3.55 && c.halfWidth === 1.32));
  for (let i = 0; i < 120; i++) {
    const tile = tiles[Math.floor(random() * tiles.length)];
    if (engine.vehicles.length >= 22 || !tile.neighbors.length) continue;
    engine.addRoadVehicle(tile, tile.neighbors[0], random(), { kind: 'civilian' });
  }
  const departed = new Set(); let opened = false;
  for (let frame = 0; frame < 5400; frame++) {
    fleet.prepare(1 / 30); policeFleet.prepare(1 / 30);
    engine.update(1 / 30); fleet.sync(); policeFleet.sync();
    opened ||= model.getObjectByName('Fire garage door 3').scale.y < .2;
    const cars = engine.vehicles;
    for (const car of cars) if (car.kind === 'fire' && car.mode === 'road') departed.add(car.name);
    for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++)
      assert.equal(vehiclesOverlap(cars[i], cars[j], 0), false, `Collision ${cars[i].name}/${cars[j].name}`);
  }
  assert.equal(departed.size, 4); assert.ok(opened);
  for (const car of fleet.states[0].cars) assert.ok(car.meters > 150, `${car.name} failed to circulate: ${car.meters}`);
});

test('fire fleet pauses, preserves departures when roads grow and resets after construction, relocation or removal', () => {
  const scene = new THREE.Scene(), model = station(), traffic = createTraffic(scene, () => .045, { random: seeded(9) });
  scene.add(model); traffic.addFireStation(model);
  const roads = new Map(); for (let x = -48; x <= 48; x += 12) roads.set(`${x},30`, { x, z: 30 });
  traffic.setRoads(roads);
  for (let i = 0; i < 200; i++) traffic.update(new THREE.Vector3(), 140, 1 / 30, true);
  assert.equal(traffic.vehicles.length, 4);
  const before = traffic.vehicles.map(c => c.position.clone());
  for (let i = 0; i < 50; i++) traffic.update(new THREE.Vector3(), 140, 1 / 30, false);
  traffic.vehicles.forEach((c, i) => assert.ok(c.position.equals(before[i])));
  roads.set('60,30', { x: 60, z: 30 }); traffic.setRoads(roads); traffic.update(new THREE.Vector3(), 140, 0, false);
  traffic.vehicles.forEach((c, i) => assert.ok(c.position.equals(before[i])));
  traffic.update(new THREE.Vector3(), 140, .04, true, true, undefined, new Map([[model, {}]]));
  assert.equal(traffic.vehicles.length, 0);
  for (const [name, home] of Object.entries(fireTruckHomes)) assert.deepEqual(model.getObjectByName(name).position.toArray(), home);
  model.position.set(6, 0, 0); model.rotation.y = Math.PI / 2;
  const rotated = new Map(); for (let z = -48; z <= 48; z += 12) rotated.set(`36,${z}`, { x: 36, z });
  traffic.setRoads(rotated); traffic.update(new THREE.Vector3(), 140, .04, true);
  assert.equal(traffic.vehicles.length, 4);
  traffic.removeFireStation(model); assert.equal(traffic.vehicles.length, 0);
});
