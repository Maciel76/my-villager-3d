import assert from "node:assert/strict";
import test from "node:test";
import { pavingLine, planPavingLine } from "../src/paving-line.js";
import { canBuildHouse } from "../src/road-layout.js";
import { setDecorationObstacles } from "../src/placement.js";

test("paving lines include both ends, snap to the 2 m grid and reverse consistently for every direction", () => {
  assert.deepEqual(pavingLine({ x: .2, z: .3 }, { x: 6.1, z: .4 }),
    [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 4, z: 0 }, { x: 6, z: 0 }]);
  assert.deepEqual(pavingLine({ x: -2, z: -2 }, { x: -2, z: -2 }), [{ x: -2, z: -2 }]);
  for (let x = -18; x <= 18; x += 2) for (let z = -18; z <= 18; z += 2) {
    const start = { x: -4, z: 2 }, end = { x, z };
    const cells = pavingLine(start, end);
    assert.deepEqual(cells, pavingLine(end, start).reverse());
    assert.deepEqual(cells[0], start); assert.deepEqual(cells.at(-1), end);
    assert.equal(new Set(cells.map(p => `${p.x},${p.z}`)).size, cells.length);
    for (let i = 1; i < cells.length; i++) {
      assert.equal(Math.max(Math.abs(cells[i].x - cells[i - 1].x), Math.abs(cells[i].z - cells[i - 1].z)), 2);
    }
  }
});

test("clipping bounds huge lines to buildable cells without changing their slope", () => {
  const bounds = { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };
  assert.deepEqual(pavingLine({ x: -1e9, z: 0 }, { x: 1e9, z: 0 }, bounds).map(p => p.x), [-4, -2, 0, 2, 4]);
  assert.deepEqual(pavingLine({ x: -20, z: 12 }, { x: 20, z: 12 }, bounds), []);
  assert.deepEqual(pavingLine({ x: NaN, z: 0 }, { x: 2, z: 2 }, bounds), []);
  const diagonal = pavingLine({ x: -100, z: -100 }, { x: 100, z: 100 }, bounds);
  assert.equal(diagonal.length, 5);
  assert.ok(diagonal.every(p => p.x === p.z && Math.abs(p.x) <= 4));
});

test("blocked ends and obstacles are skipped while valid cells after them are still filled and charged", () => {
  setDecorationObstacles("cottage", [[-2, -2, 2, 2]]);
  try {
    const houses = [{ type: "cottage", x: 0, z: 0, rotation: 0 },
      { type: "pavingConcrete", x: -6, z: 0, rotation: 0 }];
    const roads = new Map([["12,0", { x: 12, z: 0 }]]);
    const plan = planPavingLine({ x: -6, z: 0 }, { x: 12, z: 0 }, {
      canBuild: (x, z) => canBuildHouse(x, z, houses, roads, new Map(), null, "pavingConcrete", 0),
      unitPrice: 10, balance: 1000,
    });
    assert.equal(plan.cells[0].state, "blocked");
    assert.equal(plan.cells.at(-1).state, "blocked");
    assert.ok(plan.ready.some(p => p.x === -4));
    assert.ok(plan.ready.some(p => p.x === 4), "A building cannot stop the rest of the line");
    assert.ok(!plan.ready.some(p => Math.abs(p.x) <= 2));
    assert.ok(!plan.ready.some(p => p.x >= 8), "Road lanes cannot be paved over");
    assert.equal(plan.cost, plan.ready.length * 10);
    assert.equal(houses.length, 2, "Preview planning must not modify the world");
  } finally { setDecorationObstacles("cottage", null); }
});

test("the line respects the budget, skipping obstacles without charging for them", () => {
  const plan = planPavingLine({ x: 0, z: 0 }, { x: 12, z: 0 }, {
    canBuild: x => x !== 2 && x !== 6, unitPrice: 15, balance: 31,
  });
  assert.deepEqual(plan.ready.map(p => p.x), [0, 4]);
  assert.equal(plan.cost, 30);
  assert.equal(plan.blocked, 2);
  assert.equal(plan.unaffordable, 3);
  assert.equal(plan.cells.at(-1).state, "unaffordable");
});
