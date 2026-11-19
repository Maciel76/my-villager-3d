import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { DEFAULT_AREA_SIZE, BUILD_LIMIT, getBuildAreaSize, isAreaSize, nextAreaSize, setBuildAreaSize } from "../src/build-area.js";
import { canPlace, readSave } from "../src/placement.js";
import { canBuildRoad, readRoads, roadLots } from "../src/road-layout.js";
import { isVillageWorld } from "../src/village-data.js";
import { createWalker } from "../src/walking.js";
import { buildArea } from "../src/village-area.js";

test("directional expansion, the enlarged base, paving, free light heights and treasury share one save", () => {
  const world = { version: 1, areaSize: 360, expansion: { east: 2, north: 1 },
    economy: { coins: 12345, progressMs: 12000 }, houses: [
      { type: "pavingConcrete", x: 240, z: 0, rotation: 0 },
      { type: "lightBlock", x: 240.25, y: 18, z: 0, rotation: 0 },
    ], roads: [{ x: 240, z: 24, order: 2 }] };
  const bounds = buildArea(world.expansion, world.areaSize);
  assert.deepEqual(bounds, { minX: -177, maxX: 249, minZ: -213, maxZ: 177 });
  assert.equal(isVillageWorld(world), true);
  assert.equal(readSave(world).length, 2);
  assert.equal(readSave(world)[1].y, 18);
  assert.equal(readRoads(world.roads, readSave(world), 3, bounds).size, 1);
  assert.equal(isVillageWorld({ ...world, expansion: { east: 9 } }), false);
  assert.equal(isVillageWorld({ ...world, economy: { coins: -1, progressMs: 0 } }), false);
});

test("the doubled terrain can grow repeatedly and all placement boundaries update live", () => {
  try {
    assert.equal(DEFAULT_AREA_SIZE, 360);
    setBuildAreaSize(180);
    assert.equal(canPlace(120, 0, []), false);
    assert.equal(canBuildRoad(120, 0, [], new Map()), false);
    setBuildAreaSize(nextAreaSize(getBuildAreaSize()));
    assert.equal(BUILD_LIMIT, 177);
    assert.equal(canPlace(120, 0, []), true);
    assert.equal(canBuildRoad(120, 0, [], new Map()), true);
    assert.equal(canBuildRoad(180, 0, [], new Map()), false);
    setBuildAreaSize(nextAreaSize(getBuildAreaSize()));
    assert.equal(BUILD_LIMIT, 267);
    assert.equal(canPlace(240, 0, []), true);
    assert.equal(roadLots(new Map([["252,0", { x: 252, z: 0 }]])).has("264,0"), true);
    setBuildAreaSize(18000);
    assert.equal(canBuildRoad(8004, 0, [], new Map()), true);
    for (const size of [null, "360", NaN, Infinity, 0, -180, 181, 360.5, Number.MAX_SAFE_INTEGER]) {
      assert.equal(isAreaSize(size), false);
      assert.throws(() => setBuildAreaSize(size));
    }
  } finally { setBuildAreaSize(DEFAULT_AREA_SIZE); }
});

test("expanded saves retain outlying houses, lights and roads while legacy and malformed sizes stay bounded", () => {
  const world = { version: 1, areaSize: 540, houses: [
    { type: "cottage", x: 240, z: 0, rotation: 0 },
    { type: "lightBlock", x: -250.25, y: 15, z: 0, rotation: 0 },
  ], houseOrder: [7, 8], roads: [{ x: 264, z: 24, order: 9 }] };
  // Readers must use the saved size, independently of another world's live size.
  setBuildAreaSize(180);
  try {
    assert.equal(isVillageWorld(world), true);
    assert.equal(readSave(world).length, 2);
    assert.equal(readSave(world)[1].y, 15);
    assert.deepEqual([...readRoads(world.roads, readSave(world), 10, world.areaSize).values()], world.roads);
    const legacy = { ...world }; delete legacy.areaSize;
    assert.equal(isVillageWorld(legacy), false);
    assert.equal(readSave(legacy).length, 0);
    for (const size of [null, "540", -540, 541, 1e20]) {
      assert.equal(isVillageWorld({ ...world, areaSize: size }), false);
      assert.throws(() => readSave({ ...world, areaSize: size }));
    }
    assert.equal(isVillageWorld({ version: 1, houses: [{ type: "cottage", x: 0, z: 0, rotation: 0 }] }), true);
  } finally { setBuildAreaSize(DEFAULT_AREA_SIZE); }
});

test("walking entry recognizes the newly available terrain instead of resetting to the old city", () => {
  setBuildAreaSize(540);
  try {
    const walker = createWalker(() => 0, 410);
    walker.enter(new THREE.Vector3(240, 0, 0), new THREE.Vector3(0, 0, -1), [], {}, []);
    assert.deepEqual(walker.camera.position.toArray(), [240, 1.68, 0]);
  } finally { setBuildAreaSize(DEFAULT_AREA_SIZE); }
});
