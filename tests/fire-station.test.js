import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { fireStation, prepareFireStationModel } from '../src/fire-station.js';
import { footprint, readSave } from '../src/placement.js';
import { economyProfile } from '../src/economy.js';
import { createCityPlan } from '../src/city-plan.js';
import { createGardenCityPlan } from '../src/garden-city-plan.js';

test('SolidCraft export retains four vehicles, lettering and full site dimensions after GPU batching', async () => {
  const file = await readFile(new URL('../src/assets/models/optimized/base-bombeiros.glb', import.meta.url));
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    .parseAsync(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), '');
  const rigs = new Set(); let letters = 0;
  const facade = new THREE.Box3(), fascia = new THREE.Box3(), emergency = new THREE.Box3(), brises = new THREE.Box3();
  gltf.scene.traverse(part => {
    if (/^truck\d-/.test(part.name)) rigs.add(part.name.split('-')[0]);
    if (/FacadeLettering|EmergencyLettering/.test(part.name)) letters++;
    if (/FacadeLettering/.test(part.name)) facade.union(new THREE.Box3().setFromObject(part));
    if (/GarageFrontFascia/.test(part.name)) fascia.union(new THREE.Box3().setFromObject(part));
    if (/EmergencyLettering/.test(part.name)) emergency.union(new THREE.Box3().setFromObject(part));
    if (/SunshadeFin/.test(part.name)) brises.union(new THREE.Box3().setFromObject(part));
  });
  assert.equal(rigs.size, 4); assert.equal(letters, 30);
  assert.ok(facade.min.z > fascia.max.z + .005, 'all facade letters clear the roof fascia');
  assert.ok(emergency.min.z > brises.max.z + .1, 'emergency text clears every brise');
  const materials = { asphalt: new THREE.MeshStandardMaterial(), plaza: new THREE.MeshStandardMaterial() };
  const model = prepareFireStationModel(gltf.scene, materials, geometry => {
    const position = geometry.getAttribute('position');
    const uv = new Float32Array(position.count * 2);
    for (let i = 0; i < position.count; i++) uv.set([position.getX(i), position.getZ(i)], i * 2);
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  });
  const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
  for (const [value, expected] of [[size.x, 60], [size.z, 48], [size.y, fireStation.height]])
    assert.ok(Math.abs(value - expected) < .003, `${value} versus ${expected}`);
  assert.ok(Math.abs(bounds.min.y) < 1e-5);
  assert.ok(model.userData.hasMovingParts, 'GPU batching must retain truck and door pivots');
  assert.equal(model.getObjectByName('truck2').scale.x, .84);
  assert.ok(model.children.length <= 35, 'static finishes batch while moving rigs stay separate');
  let triangles = 0;
  model.traverse(part => {
    if (!part.isMesh) return;
    assert.ok(part.geometry.attributes.position.array instanceof Float32Array);
    for (const value of part.geometry.attributes.position.array) assert.ok(Number.isFinite(value));
    triangles += part.geometry.index.count / 3;
  });
  assert.ok(triangles < 160000); assert.ok(triangles > 50000);
  assert.equal(model.userData.lampEmitters.length, 14);
  for (const light of model.userData.lampEmitters) {
    assert.ok(Number.isFinite(light.range) && light.range > 0, 'clustered lights require a finite range');
    assert.ok(Number.isFinite(light.intensity) && light.intensity > 0);
  }
  assert.ok(model.getObjectByName('fire-station-warm').material.userData.nightGlow);
  assert.ok(model.getObjectByName('fire-station-sign').material.color.r > .8);
  const sign = new THREE.Box3().setFromObject(model.getObjectByName('fire-station-sign'));
  assert.ok(sign.max.z > 3.4, 'garage lettering projects past the roof trim');
});

test('fire station has a purchasable, rotatable plot and survives both city layouts', () => {
  assert.deepEqual(footprint('fireStation', 0), [60, 48]);
  assert.deepEqual(footprint('fireStation', 1), [48, 60]);
  assert.deepEqual(economyProfile('fireStation'), { price: 5750, residents: 0, jobs: 60 });
  for (const createPlan of [createCityPlan, createGardenCityPlan]) {
    const world = createPlan();
    const fire = world.houses.find(h => h.type === 'fireStation');
    const police = world.houses.find(h => h.type === 'policeStation');
    assert.ok(fire && police); assert.equal(fire.rotation, police.rotation);
    assert.equal(police.x - fire.x, 78);
    assert.equal(police.z - 30, fire.z - 24, 'same street frontage');
    assert.ok(readSave(world).some(h => h.type === 'fireStation' && h.x === fire.x && h.z === fire.z));
  }
});
