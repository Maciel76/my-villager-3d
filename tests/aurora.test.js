import assert from "node:assert/strict";
import test from "node:test";
import { BUILDING_TYPES } from "../src/house-types.js";
import { canPlace, footprint, readSave } from "../src/placement.js";
import { canBuildHouse, roadLots, tileKey } from "../src/road-layout.js";

test("Aurora occupies four lots and survives a village save round trip", () => {
  const building = { type: "aurora", x: 6, z: 6, rotation: 1 };
  assert.equal(BUILDING_TYPES.aurora.category, "apartments");
  assert.deepEqual(footprint("aurora", 1), [24, 24]);
  const restored = readSave({ version: 1, houses: [building], houseOrder: [18] });
  assert.deepEqual(restored, [{ ...building, order: 18 }]);
  assert.equal(canPlace(18, 6, restored, null, "modern", 0), false);
  assert.equal(canPlace(24, 6, restored, null, "modern", 0), true);
});

test("Aurora's footprint respects streets, lot alignment and the village boundary", () => {
  const roads = new Map([[tileKey(0, 0), { x: 0, z: 0 }]]);
  const lots = roadLots(roads);
  const valid = (x, z) => canBuildHouse(x, z, [], roads, lots, null, "aurora", 0);
  assert.equal(valid(6, 18), true);
  assert.equal(valid(6, 6), false);
  assert.equal(valid(0, 18), false);
  assert.equal(valid(90, 18), true);
  assert.equal(valid(174, 18), false);
});
