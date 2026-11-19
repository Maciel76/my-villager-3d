import assert from "node:assert/strict";
import test from "node:test";
import { canPlace, pavingUnderBuilding, readSave, setDecorationObstacles } from "../src/placement.js";
import { PAVING_HEIGHT, PAVING_TYPES, pavingHeightAt } from "../src/paving-types.js";
import { canBuildHouse, canBuildRoad, canMoveRoad, houseSite, tileKey } from "../src/road-layout.js";

const concrete = { type: "pavingConcrete", x: 0, z: 0, rotation: 0 };
const brick = { type: "pavingBrick", x: 2, z: 0, rotation: 1 };
const bench = { type: "decorBench", x: 0, z: 0, rotation: 0 };
const lamp = { type: "lampColonial", x: 2, z: 0, rotation: 0 };

test("modular paving snaps to adjacent cells, while benches and lamps can share its position", () => {
  assert.deepEqual(houseSite(2.9, -0.8, new Map(), "pavingMosaic"), { x: 2, z: 0 });
  assert.ok(canPlace(2, 0, [concrete, lamp], null, brick.type, 1));
  assert.ok(canPlace(0, 0, [concrete], null, bench.type, 0));
  assert.ok(canPlace(2, 0, [brick], null, lamp.type, 0));
  assert.ok(!canPlace(0, 0, [concrete], null, brick.type, 1));
  assert.ok(!canPlace(1, 0, [concrete], null, brick.type, 1));
  assert.ok(!canPlace(178, 0, [], null, brick.type, 1));

  const houses = [bench, concrete, brick, lamp];
  const saved = { version: 1, houses };
  assert.deepEqual(readSave(saved).map(({ order, ...object }) => object), houses);
});

test("paving fits open commercial lots and avoids their actual walls", () => {
  setDecorationObstacles("cafe", [[-2, -2, 2, 2]]);
  try {
    const houses = [{ type: "cafe", x: 0, z: 0, rotation: 0 }];
    assert.ok(!canPlace(0, 0, houses, null, concrete.type, 0));
    assert.ok(canPlace(4, 0, houses, null, concrete.type, 0));
  } finally {
    setDecorationObstacles("cafe", null);
  }
});

test("a house and the paving beneath it survive loading in either order", () => {
  const cottage = { type: "cottage", x: 0, z: 0, rotation: 0 };
  setDecorationObstacles(cottage.type, [[-3, -3, 3, 3]]);
  try {
    assert.ok(canBuildHouse(0, 0, [concrete], new Map(), new Map(), null, cottage.type, 0));
    assert.ok(!canPlace(0, 0, [concrete, cottage], null, "modern", 0));
    for (const houses of [[concrete, cottage], [cottage, concrete]]) {
      assert.deepEqual(readSave({ version: 1, houses }).map(({ order, ...item }) => item), houses);
    }
  } finally {
    setDecorationObstacles(cottage.type, null);
  }
});

test("the lot covers older paving and leaves later garden paving above it in all four building categories", () => {
  for (const type of ["cottage", "varandas", "rotunda", "bakery"]) {
    const building = { type, x: 0, z: 0, rotation: 0, order: 2 };
    const older = { ...concrete, x: -4, z: 4, order: 1 };
    const newer = { ...older, x: 4, order: 3 };
    setDecorationObstacles(type, [[-2, -2, 2, 2]]);
    try {
      assert.ok(canBuildHouse(0, 0, [{ ...concrete, order: 1 }], new Map(), new Map(), null, type, 0));
      assert.ok(pavingUnderBuilding(older, building));
      assert.ok(!pavingUnderBuilding(newer, building));
      assert.ok(canPlace(4, 4, [building], null, newer.type, 0));
      assert.ok(!canPlace(0, 0, [building], null, concrete.type, 0));
      assert.ok(pavingUnderBuilding({ ...newer, x: 0, z: 0 }, building));
      const saved = readSave({ version: 1, houses: [newer, building, older], houseOrder: [3, 2, 1] });
      assert.deepEqual(saved.map(h => h.order), [3, 2, 1]);
    } finally {
      setDecorationObstacles(type, null);
    }
  }
});

test("paving joins a sidewalk, and road changes cannot turn existing blocks into a traffic lane", () => {
  const roads = new Map([[tileKey(0, 0), { x: 0, z: 0 }]]);
  const canPave = (x, z) => canBuildHouse(x, z, [], roads, new Map(), null, concrete.type, 0);
  assert.ok(canPave(0, 6));
  assert.ok(!canPave(0, 4));
  assert.ok(!canPave(0, 0));
  const paving = [{ ...concrete, x: 0, z: 6 }];
  assert.ok(!canBuildRoad(0, 12, paving, roads));
  assert.ok(canBuildRoad(12, 0, paving, roads));
  const source = { x: 12, z: 0 };
  assert.ok(!canMoveRoad(0, 12, source, paving, new Map([...roads, ["12,0", source]])));
});

test("support height is continuous at the seam and follows removal of individual blocks", () => {
  assert.equal(Object.keys(PAVING_TYPES).length, 4);
  const blocks = new Map([["0,0", PAVING_HEIGHT], ["2,0", PAVING_HEIGHT]]);
  assert.equal(pavingHeightAt(1, 0, blocks), PAVING_HEIGHT);
  assert.equal(pavingHeightAt(-1.01, 0, blocks), 0);
  blocks.delete("0,0");
  assert.equal(pavingHeightAt(0, 0, blocks), 0);
  assert.equal(pavingHeightAt(1, 0, blocks), PAVING_HEIGHT);
});
