import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { PLANTING_BED_TYPES } from "../src/planting-bed-types.js";
import { TREE_TYPES } from "../src/tree-types.js";
import { prepareDecorationModels } from "../src/decorations.js";
import { canPlace, plantingBedUnder, treeFitsPlantingBed, readSave } from "../src/placement.js";
import { canBuildHouse, roadLots, readRoads, tileKey } from "../src/road-layout.js";

test("six SolidCraft planting beds have flat usable soil at their configured tree height", async () => {
  const bytes = await readFile(new URL("../src/assets/models/optimized/planting-beds.glb", import.meta.url));
  const { scene } = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    .parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
  const models = prepareDecorationModels(scene, PLANTING_BED_TYPES);
  assert.equal(Object.keys(models).length, 6);
  for (const [type, model] of Object.entries(models)) {
    const soil = new THREE.Box3();
    model.children.filter(part => part.name.includes("-soil-")).forEach(part => soil.union(new THREE.Box3().setFromObject(part)));
    assert.ok(Math.abs(soil.max.y - PLANTING_BED_TYPES[type].plantingBed.height) < .001, `${type}: soil height`);
    assert.ok(Math.abs(new THREE.Box3().setFromObject(model).min.y) < .001);
  }
});

test("all tree species fit in each bed, respecting rims, soil regions and both rotation orders", () => {
  for (const [type, details] of Object.entries(PLANTING_BED_TYPES)) for (const treeType of Object.keys(TREE_TYPES)) {
    for (let rotation = 0; rotation < 4; rotation++) {
      const bed = { type, x: 12, z: 12, rotation };
      const region = details.plantingBed.regions[0], localZ = region.z ?? 0;
      const tree = { type: treeType, x: 12 + [0,1,0,-1][rotation] * localZ, z: 12 + [1,0,-1,0][rotation] * localZ, rotation: 0 };
      assert.equal(treeFitsPlantingBed(tree, bed), true, `${treeType} in ${type}, rotation ${rotation}`);
      assert.equal(canPlace(tree.x, tree.z, [bed], null, tree.type, 0), true);
      assert.equal(canPlace(bed.x, bed.z, [tree], null, bed.type, rotation), true);
      assert.equal(plantingBedUnder(tree, [bed]), bed);
      for (const houses of [[tree, bed], [bed, tree]]) assert.equal(readSave({version:1,houses}).length, 2);
    }
  }
  const bed = { type: "bedSquare", x: 0, z: 0, rotation: 0 };
  assert.equal(canPlace(.9, 0, [bed], null, "treeOak", 0), false, "tree cannot straddle a concrete rim");
  assert.equal(canPlace(0, 0, [bed], null, "decorBench", 0), false, "soil support only permits trees");
  assert.equal(canPlace(0, 0, [bed, {type:"treeOak",x:0,z:0,rotation:0}], null, "treePalm", 0), false);
});

test("beds occupy the middle of road tiles and preserve roads and stacked trees on reload", () => {
  const roads = new Map([[tileKey(0, 0), {x:0,z:0,order:0}]]), lots = roadLots(roads);
  const bed = { type: "bedMedian", x: 0, z: 0, rotation: 1 }, tree = {type:"treePalm",x:0,z:0,rotation:0};
  assert.equal(canBuildHouse(0, 0, [], roads, lots, null, bed.type, 1), true);
  assert.equal(canBuildHouse(0, 0, [bed], roads, lots, null, tree.type, 0), true);
  assert.equal(readRoads([...roads.values()], [tree,bed], 1).size, 1);
});
