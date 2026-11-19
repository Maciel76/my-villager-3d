import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { DECORATION_TYPES } from "../src/decoration-types.js";
import { prepareDecorationModels } from "../src/decorations.js";
import { optimizeBuildingTemplates } from "../src/building-batches.js";
import { BUILD_LIMIT, canPlace, footprint, readSave } from "../src/placement.js";
import { canBuildHouse, canBuildRoad, houseSite, roadLots, tileKey } from "../src/road-layout.js";

test("all twenty SolidCraft decorations load, fit their placement areas and keep their night light", async () => {
  const data = await readFile(new URL("../src/assets/models/optimized/decorations.glb", import.meta.url));
  const { scene } = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    .parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), "");
  const models = prepareDecorationModels(scene);
  assert.equal(Object.keys(models).length, 20);
  optimizeBuildingTemplates(models);
  for (const [type, model] of Object.entries(models)) {
    const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
    const [width, depth] = DECORATION_TYPES[type].size;
    assert.ok(size.x <= width + .015, `${type}: ${size.x} exceeds width ${width}`);
    assert.ok(size.z <= depth + .015, `${type}: ${size.z} exceeds depth ${depth}`);
    assert.ok(Math.abs(bounds.min.y) < .001, `${type} must sit on the ground`);
    assert.ok(size.y > .1 && size.y < 5);
    assert.ok(model.children.every(part => part.geometry && part.material));
  }
  assert.equal(models.decorFirepit.userData.lampEmitters.length, 1);
});

test("decorations use fine placement between parcels and on roads, with clearance from other pieces", () => {
  const roads = new Map([[tileKey(0, 0), { x: 0, z: 0 }]]), lots = roadLots(roads);
  assert.deepEqual(houseSite(11.3, 2.8, lots, "decorBench", 0), { x: 11.25, z: 2.75 });
  assert.equal(canBuildHouse(11, 3, [], roads, lots, null, "decorBench", 0), true);
  assert.equal(canBuildHouse(5, 0, [], roads, lots, null, "decorBench", 0), true);
  const bench = { type: "decorBench", x: 11, z: 3, rotation: 0 };
  assert.equal(canBuildHouse(12, 3, [bench], roads, lots, null, "decorPlanter", 0), false);
  assert.equal(canBuildRoad(12, 0, [bench], roads), true);
  assert.deepEqual(footprint("decorBridge", 1), [5.25, 2.25]);
  assert.equal(canPlace(BUILD_LIMIT + 1, 0, [], null, "decorBridge", 1), false);
  assert.equal(canPlace(12.5, 3, [], null, "decorBench", 0), true);
});

test("all twenty decorations survive save and reload with their positions and rotations", () => {
  const houses = Object.keys(DECORATION_TYPES).map((type, index) => ({
    type, x: (index % 5 - 2) * 9, z: (Math.floor(index / 5) - 2) * 9, rotation: index % 4,
  }));
  const restored = readSave({ version: 1, houses });
  assert.deepEqual(restored.map(({ order, ...house }) => house), houses);
});
