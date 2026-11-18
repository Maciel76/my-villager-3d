import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { addPalaceLights } from "../src/palace-lights.js";
import { createDaylight } from "../src/daylight.js";
import { createNightLights } from "../src/night-lights.js";

async function palace() {
  const data = await readFile(new URL("../src/assets/models/palacio-oriental.glb", import.meta.url));
  const { scene } = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    .parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), "");
  addPalaceLights(scene);
  return scene;
}

test("the exported palace gets one light per lantern, including the upper floors and garden", async () => {
  const model = await palace();
  const emitters = model.userData.lampEmitters;
  assert.equal(emitters.length, 14);
  assert.equal(new Set(emitters.map(({ position }) => position.join(","))).size, 14);
  assert.equal(emitters.filter(({ position }) => position[1] < 2).length, 4);
  assert.equal(emitters.filter(({ position }) => position[1] > 10).length, 4);
  model.traverse((part) => {
    if (!part.isMesh) return;
    const finish = part.name.split("-")[1];
    if (finish === "lantern") assert.equal(part.material.userData.nightGlow.strength, 3.6);
    else if (finish === "window") assert.equal(part.material.userData.nightGlow.strength, 1.55);
    else assert.equal(part.material.userData.nightGlow, undefined);
  });
});

test("multiple placed palaces light up at night and switch off by day", async () => {
  const template = await palace();
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog();
  const daylight = createDaylight(scene, { shadowMap: {} }, { palace: template });
  const night = createNightLights(scene);
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(40, 30, 50);
  const first = template.clone();
  const second = template.clone();
  second.position.x = 45;
  second.rotation.y = Math.PI / 2;
  scene.add(first, second);
  const houses = [{ model: first }, { model: second }];
  daylight.setHour(23);
  night.update(houses, camera, daylight.lampPower);
  const lights = scene.children.filter((part) => part.isPointLight);
  assert.equal(lights.length, 28);
  assert.ok(lights.every((light) => light.visible && light.intensity > 0));
  const expected = new THREE.Vector3(...second.userData.lampEmitters[0].position)
    .applyMatrix4(second.matrixWorld);
  assert.ok(lights[14].position.distanceTo(expected) < 1e-10);
  daylight.setHour(12);
  night.update(houses, camera, daylight.lampPower);
  assert.ok(lights.every((light) => !light.visible && light.intensity === 0));
  template.traverse((part) => {
    if (part.material?.userData.nightGlow) assert.equal(part.material.emissiveIntensity, 0);
  });
});
