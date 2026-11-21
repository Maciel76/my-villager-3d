import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { prepareFirefightersMonument, firefightersMonument } from "../src/monumento-bombeiros.js";
import { optimizeBuildingTemplates } from "../src/building-batches.js";
import { BUILDING_TYPES } from "../src/house-types.js";
import { canPlace, footprint, readSave } from "../src/placement.js";
import { canBuildHouse, roadLots, tileKey } from "../src/road-layout.js";
import { economyProfile } from "../src/economy.js";
import { isVillageWorld } from "../src/village-data.js";

const type = "monumentoBombeiros";
test("the web monument retains the final sculptures, dimensions and night lighting without studio helpers", async () => {
  const url = new URL("../src/assets/models/optimized/monumento-bombeiros.glb", import.meta.url);
  const bytes = await readFile(url);
  const { scene } = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    .parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
  const projectUV = geometry => geometry.setAttribute("uv",
    new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
  const model = prepareFirefightersMonument(scene, projectUV);
  const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
  assert(Math.abs(bounds.min.y) < .001);
  assert(Math.abs(size.x - firefightersMonument.width) < .03, `width ${size.x}`);
  assert(Math.abs(size.z - firefightersMonument.depth) < .03, `depth ${size.z}`);
  assert(Math.abs(size.y - firefightersMonument.height) < .10, `height ${size.y}`);
  for (const prefix of ["06A v2", "06B v2", "06C v2"])
    assert(model.children.some(part => part.userData.monumentSection?.startsWith(prefix)), prefix);
  assert(model.children.some(part => /rosto anatomico/.test(part.name)));
  assert(model.children.some(part => /luva anatomica/.test(part.name)));
  assert(model.children.every(part => !/Arquivo|Piso externo|Referencia original/.test(part.name)));
  assert.equal(model.userData.lampEmitters.length, 5);
  assert(model.children.some(part => part.material.userData.nightGlow?.strength > 0));
  let triangles = 0;
  model.traverse(part => { if (part.isMesh) triangles += (part.geometry.index?.count ?? part.geometry.attributes.position.count) / 3; });
  assert(triangles < 450000, `triangle budget: ${triangles}`);
  assert((await stat(url)).size < 8_000_000);
  optimizeBuildingTemplates({ [type]: model });
  assert(model.children.length < 110, `draw meshes: ${model.children.length}`);
  assert.equal(model.userData.lampEmitters.length, 5);
  assert(model.children.some(part => part.userData.groundCover));
  assert(model.children.some(part => part.material.userData.nightGlow));
});

test("the monument uses the existing landmark economy, rotated lots, collisions and saved villages", () => {
  assert.equal(BUILDING_TYPES[type].category, "landmarks");
  assert.equal(BUILDING_TYPES[type].label, "Monumento Corpo de Bombeiros");
  assert.deepEqual(footprint(type), [24, 12]);
  assert.deepEqual(footprint(type, 1), [12, 24]);
  assert.equal(economyProfile(type).price, 1070);
  const roads = new Map([0, 12].map(x => [tileKey(x, 0), { x, z: 0 }]));
  assert(canBuildHouse(6, 12, [], roads, roadLots(roads), null, type, 0));
  const house = { type, x: 6, z: 12, rotation: 0 };
  assert.equal(canPlace(6, 12, [house], null, type, 0), false);
  assert.equal(canBuildHouse(6, 0, [], roads, roadLots(roads), null, type, 0), false);
  const save = { version: 1, houses: [house], houseOrder: [4], roads: [...roads.values()], economy: { coins: 48930, progressMs: 0 } };
  assert(isVillageWorld(save));
  const restored = readSave(save);
  assert.deepEqual(restored.map(({ order, ...value }) => value), [house]);
  assert.equal(restored[0].order, 4);
});
