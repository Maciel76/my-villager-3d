import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { groundObstacles, registerDecorationObstacles, decorationSurfaceHeight } from "../src/decoration-obstacles.js";
import { canPlace, readSave, setDecorationObstacles } from "../src/placement.js";
import { canBuildHouse, canBuildRoad, houseSite, readRoads, roadLots, tileKey } from "../src/road-layout.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

test("real house solids leave empty gardens and gaps within a reserved lot available", () => {
  const model = new THREE.Group();
  // Two separate wings in one material batch, with a courtyard between them.
  const geometry = mergeGeometries([
    new THREE.BoxGeometry(3, 4, 4).translate(-3, 2, 0),
    new THREE.BoxGeometry(3, 4, 4).translate(3, 2, 0),
  ]);
  model.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()));
  const lawn = new THREE.Mesh(new THREE.BoxGeometry(12, .2, 12), new THREE.MeshStandardMaterial());
  lawn.userData.groundCover = true; model.add(lawn);
  const obstacles = groundObstacles(model);
  assert.ok(obstacles.length > 0);
  setDecorationObstacles("modern", obstacles);
  try {
    const house = { type: "modern", x: 0, z: 0, rotation: 0 };
    const place = (x, z, rotation = 0) => canPlace(x, z, [house], null, "treeApple", rotation);
    assert.equal(place(0, 0), true, "empty courtyard inside the house's 12 m lot");
    assert.equal(place(3, 0), false, "solid wing");
    assert.equal(place(5.25, 4.75), true, "garden corner");
    house.rotation = 1;
    assert.equal(place(0, 3), false, "solid wing rotates with the house");
    assert.equal(place(0, 0), true);
    const tree = { type: "treeApple", x: 0, z: 0, rotation: 0 };
    assert.equal(canPlace(0, 0, [tree], null, "modern", 1), true, "placement is symmetric");
    assert.equal(canPlace(0, 3, [tree], null, "modern", 1), false);
    for (const houses of [[house, tree], [tree, house]])
      assert.equal(readSave({ version: 1, houses }).length, 2, "save order cannot remove a courtyard tree");
  } finally { setDecorationObstacles("modern", null); }
});

test("fine positioning, ignored movement source, roads under decorations and save reload agree", () => {
  const roads = new Map([[tileKey(0, 0), { x: 0, z: 0, order: 0 }]]), lots = roadLots(roads);
  const bench = { type: "decorBench", x: 4.25, z: .75, rotation: 1 };
  assert.deepEqual(houseSite(4.24, .8, lots, bench.type, 1), { x: 4.25, z: .75 });
  assert.equal(canBuildHouse(4.25, .75, [bench], roads, lots, bench, bench.type, 1), true);
  assert.equal(canBuildHouse(4.25, .75, [bench], roads, lots, null, "treePalm", 0), false);
  assert.equal(readRoads([...roads.values()], [bench], 1).size, 1);
  assert.equal(canBuildRoad(12, 0, [{ ...bench, x: 12 }], roads), true);
  assert.equal(readSave({ version: 1, houses: [bench] })[0].x, 4.25);
});

test("decorations sit on actual raised garden surfaces and follow moved or rotated lots", () => {
  const model = new THREE.Group();
  const paving = new THREE.Mesh(new THREE.BoxGeometry(3, .3, 2), new THREE.MeshStandardMaterial());
  paving.position.set(3, .15, 0); paving.userData.groundCover = true;
  model.add(paving);
  registerDecorationObstacles({ chalet: model });
  try {
    const house = { type: "chalet", x: 10, z: 5, rotation: 1 };
    assert.ok(Math.abs(decorationSurfaceHeight(10, 2, [house]) - .3) < 1e-6);
    assert.equal(decorationSurfaceHeight(13, 5, [house]), 0);
    house.x = 20;
    assert.equal(decorationSurfaceHeight(10, 2, [house]), 0);
  } finally { setDecorationObstacles("chalet", null); }
});
