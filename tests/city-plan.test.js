import assert from "node:assert/strict";
import test from "node:test";
import { createCityPlan, cityPlanSummary } from "../src/city-plan.js";
import { BUILDING_TYPES } from "../src/house-types.js";
import { footprint, isDecoration, isLamp, isFreeLight, isPaving, readSave } from "../src/placement.js";
import { canBuildHouse, lampSiteHeight, readRoads, roadLots, tileKey } from "../src/road-layout.js";
import { isVillageWorld } from "../src/village-data.js";
import { buildArea } from "../src/village-area.js";

test("the complete city survives the game's save loader with every building and lighting model", () => {
  const world = createCityPlan();
  assert.equal(isVillageWorld(world), true);
  assert.equal(readSave(world).length, world.houses.length);
  assert.equal(readRoads(world.roads, world.houses, 0, buildArea(world.expansion)).size, world.roads.length);
  assert.deepEqual(new Set(world.houses.map(h => h.type)), new Set(Object.keys(BUILDING_TYPES)
    .filter(type => !isDecoration(type) && !isPaving(type) && !isFreeLight(type))));
  const orders = [...world.houseOrder, ...world.roads.map(r => r.order)];
  assert.equal(new Set(orders).size, orders.length);
});

test("every parcel fits without overlapping a neighbour, street, or map boundary", () => {
  const world = createCityPlan();
  const area = buildArea(world.expansion);
  const roads = new Map(world.roads.map(r => [tileKey(r.x, r.z), r]));
  const lots = roadLots(roads, area);
  for (const house of world.houses) {
    assert.equal(canBuildHouse(house.x, house.z, world.houses, roads, lots, house, house.type, house.rotation, area), true,
      `${house.type} at ${house.x},${house.z}`);
    if (isLamp(house.type)) assert.notEqual(lampSiteHeight(house.x, house.z, roads), null);
  }
  assert.equal(cityPlanSummary(world).occupiedParcels + world.roads.length, 318);
});

test("every road connects to one network and all buildings face a street", () => {
  const world = createCityPlan();
  const roads = new Map(world.roads.map(r => [tileKey(r.x, r.z), r]));
  const visited = new Set();
  const queue = [world.roads[0]];
  while (queue.length) {
    const road = queue.pop();
    const key = tileKey(road.x, road.z);
    if (visited.has(key)) continue;
    visited.add(key);
    for (const [dx, dz] of [[12, 0], [-12, 0], [0, 12], [0, -12]]) {
      const neighbour = roads.get(tileKey(road.x + dx, road.z + dz));
      if (neighbour) queue.push(neighbour);
    }
  }
  assert.equal(visited.size, roads.size);
  for (const h of world.houses.filter(h => !isLamp(h.type))) {
    const [w, d] = footprint(h.type, h.rotation);
    const [dx, dz] = [[0, 1], [1, 0], [0, -1], [-1, 0]][h.rotation];
    const frontage = world.roads.some(r => dx
      ? r.x === h.x + dx * (w / 2 + 6) && Math.abs(r.z - h.z) < d / 2
      : r.z === h.z + dz * (d / 2 + 6) && Math.abs(r.x - h.x) < w / 2);
    assert.equal(frontage, true, `Entrada sem rua: ${h.type} em ${h.x},${h.z}`);
  }
});

test("lighting reaches every road module and every quarter of the map", () => {
  const world = createCityPlan();
  const lamps = world.houses.filter(h => isLamp(h.type));
  for (const road of world.roads)
    assert.ok(lamps.some(l => Math.hypot(l.x - road.x, l.z - road.z) < 6));
  for (const x of [-1, 1]) for (const z of [-1, 1])
    assert.ok(lamps.some(l => l.x * x > 60 && l.z * z > 60));
});
