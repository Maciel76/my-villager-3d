import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { TREE_TYPES } from "../src/tree-types.js";
import { prepareDecorationModels } from "../src/decorations.js";
import { optimizeBuildingTemplates } from "../src/building-batches.js";
import { footprint, readSave } from "../src/placement.js";

test("twelve distinct CAD trees load, remain grounded and reserve only their planting areas", async () => {
  const bytes = await readFile(new URL("../src/assets/models/optimized/trees.glb", import.meta.url));
  const { scene } = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    .parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
  const models = prepareDecorationModels(scene, TREE_TYPES);
  assert.equal(Object.keys(models).length, 12);
  optimizeBuildingTemplates(models);
  for (const [type, model] of Object.entries(models)) {
    const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
    assert.ok(Math.abs(bounds.min.y) < .002, type);
    assert.ok(size.y > 3 && size.y < 9, `${type}: height ${size.y}`);
    assert.ok(size.x <= TREE_TYPES[type].size[0] + .02 && size.z <= TREE_TYPES[type].size[1] + .02, `${type}: crown clearance`);
    assert.ok(footprint(type)[0] <= 1.2, type);
    assert.ok(model.children.every(part => part.castShadow && part.receiveShadow));
  }
});

test("trees in existing building lots retain fractional positions and rotations in saves", () => {
  const houses = Object.keys(TREE_TYPES).map((type, i) => ({type, x: (i % 4) * 2 + .25, z: Math.floor(i / 4) * 2 + .75, rotation: i % 4}));
  houses.push({type:"palace",x:0,z:6,rotation:0});
  const restored = readSave({version:1,houses});
  assert.deepEqual(restored.map(({order,...house})=>house), houses);
});
