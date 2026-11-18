import assert from "node:assert/strict";
import test from "node:test";
import { canMoveRoad, canRemoveRoad, lampSiteHeight, tileKey } from "../src/road-layout.js";

function roadMap(...positions) {
  return new Map(positions.map(([x, z], order) => [tileKey(x, z), { x, z, order }]));
}

test("moving a road accepts free grid tiles without mutating the saved layout", () => {
  const roads = roadMap([0, 0], [0, 12]);
  const source = roads.get("0,12");
  const before = [...roads.entries()];
  assert.equal(canMoveRoad(12, 0, source, [], roads), true);
  assert.equal(canMoveRoad(0, 12, source, [], roads), true);
  assert.deepEqual([...roads.entries()], before);
});

test("road moves reject occupied tiles, buildings, off-grid locations and map boundaries", () => {
  const roads = roadMap([0, 0], [0, 12]);
  const source = roads.get("0,12");
  assert.equal(canMoveRoad(0, 0, source, [], roads), false);
  assert.equal(canMoveRoad(12, 0, source, [{ x: 12, z: 0, type: "cottage" }], roads), false);
  assert.equal(canMoveRoad(6, 0, source, [], roads), false);
  assert.equal(canMoveRoad(96, 0, source, [], roads), false);
  assert.equal(canMoveRoad(24, 0, { x: -12, z: 0 }, [], roads), false);
});

test("moving a road cannot turn a neighboring lamp's sidewalk into asphalt", () => {
  const roads = roadMap([0, 0], [0, 12]);
  const lamps = [{ type: "lampColonial", x: 4, z: 0 }];
  assert.equal(lampSiteHeight(4, 0, roads), 0.13);
  assert.equal(canMoveRoad(12, 0, roads.get("0,12"), lamps, roads), false);
  assert.equal(canMoveRoad(0, -12, roads.get("0,12"), lamps, roads), true);
});

test("roads may be deleted and moved while preserving valid lamp sites on the final layout", () => {
  const roads = roadMap([0, 0]);
  const lamps = [{ type: "lampSolar", x: 4, z: 0 }];
  assert.equal(canRemoveRoad(0, 0, lamps, roads), true);
  assert.equal(canRemoveRoad(12, 0, lamps, roads), false);
  assert.equal(canMoveRoad(24, 0, roads.get("0,0"), lamps, roads), true);
});
