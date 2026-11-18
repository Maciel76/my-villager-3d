import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { addLampEmitter, createNightLights } from "../src/night-lights.js";

function fixture(pointCount = 1, spotCount = 0) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(47, 1, 0.5, 410);
  camera.position.set(0, 8, 20);
  camera.lookAt(0, 0, 0);
  const model = new THREE.Group();
  scene.add(model);
  for (let i = 0; i < pointCount + spotCount; i++) {
    addLampEmitter(model, [i * 3, 3, 0], {
      color: "#ffbe77", intensity: 36, range: 8.5, halo: 2.8,
      ...(i >= pointCount ? { direction: [0, -1, 0], angle: 0.9 } : {}),
    });
  }
  const night = createNightLights(scene);
  const houses = [{ model }];
  const lights = () => scene.children.filter((part) => part.isLight);
  const halos = () => scene.children.filter((part) => part.isSprite);
  const update = (power = 1) => night.update(houses, camera, power);
  return { scene, camera, model, houses, lights, halos, update };
}

test("all emitters work beyond the old point, spot and per-building limits", () => {
  const f = fixture(40, 20);
  f.update();
  assert.equal(f.lights().filter((light) => light.isPointLight).length, 40);
  assert.equal(f.lights().filter((light) => light.isSpotLight).length, 20);
  assert.ok(f.lights().every((light) => light.visible && light.intensity === 63));
  assert.equal(f.halos().filter((halo) => halo.visible).length, 60);
});

test("off-camera emitters stay on and camera movement reuses the same lights", () => {
  const f = fixture();
  f.model.position.x = 100;
  f.update();
  const [light] = f.lights();
  assert.ok(light?.visible);
  assert.equal(light.position.x, 100);
  f.camera.position.set(-100, 8, 20);
  f.camera.lookAt(-100, 0, 0);
  f.update();
  assert.equal(f.lights()[0], light);
  assert.equal(light.intensity, 63);
});

test("night brightness follows the hour and all lights and halos turn off by day", () => {
  const f = fixture(12, 5);
  f.update(0.5);
  const lights = f.lights();
  assert.ok(lights.every((light) => light.intensity === 31.5));
  assert.ok(f.halos().every((halo) => halo.material.opacity === 0.35));
  f.update(0);
  assert.ok(lights.every((light) => !light.visible && light.intensity === 0));
  assert.ok(f.halos().every((halo) => !halo.visible));
  f.update();
  assert.deepEqual(f.lights(), lights);
  assert.ok(lights.every((light) => light.visible && light.intensity === 63));
});

test("lights and spot targets follow moved and rotated buildings and their parents", () => {
  const f = fixture(0, 1);
  const parent = new THREE.Group();
  f.scene.add(parent);
  parent.add(f.model);
  parent.position.set(10, 2, 5);
  parent.rotation.z = Math.PI / 2;
  f.model.position.set(2, 0, 0);
  f.update();
  const [light] = f.lights();
  assert.ok(light.position.distanceTo(new THREE.Vector3(7, 4, 5)) < 1e-10);
  assert.ok(light.target.position.distanceTo(new THREE.Vector3(8, 4, 5)) < 1e-10);
  assert.equal(light.angle, 0.9);
  assert.equal(light.penumbra, 0.78);
});

test("hiding or removing buildings releases lights, halos and spot targets", () => {
  const f = fixture(2, 2);
  f.update();
  const lights = f.lights();
  const halos = f.halos();
  let disposed = 0;
  for (const halo of halos) halo.material.addEventListener("dispose", () => disposed++);
  f.model.visible = false;
  f.update();
  assert.equal(f.lights().length, 0);
  assert.equal(f.halos().length, 0);
  assert.equal(disposed, 4);
  assert.ok(lights.every((light) => !light.parent && (!light.isSpotLight || !light.target.parent)));
  f.model.visible = true;
  f.update();
  assert.equal(f.lights().length, 4);
  f.houses.length = 0;
  f.update();
  assert.equal(f.scene.children.length, 1);
});
