import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { optimizeBuildingTemplates, createBuildingBatches } from "../src/building-batches.js";
import { buildLightGrid } from "../src/clustered-lights.js";
import { createNightLights, addLampEmitter } from "../src/night-lights.js";

test("repeated buildings share batches while picking, transforms, animation and undo remain independent", () => {
  const template = new THREE.Group();
  const material = new THREE.MeshStandardMaterial();
  for (const x of [-.5, .5]) {
    const part = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), material);
    part.position.set(x, 1, 0);
    part.castShadow = part.receiveShadow = true;
    template.add(part);
  }
  optimizeBuildingTemplates({ house: template });
  assert.equal(template.children.length, 1);
  assert.equal(template.children[0].geometry.getAttribute("position").count, 48);
  assert.equal(template.children[0].geometry.index.count, 72);
  const scene = new THREE.Scene();
  const first = { type: "house", model: template.clone() };
  const second = { type: "house", model: template.clone() };
  second.model.position.x = 10;
  scene.add(first.model, second.model);
  scene.updateMatrixWorld(true);
  const batches = createBuildingBatches(scene, { house: template });
  const animations = new Map();
  batches.sync([first, second], animations);
  const [batch] = batches.root.children;
  assert.equal(batch.count, 2);
  const ray = new THREE.Raycaster(new THREE.Vector3(10, 1, 5), new THREE.Vector3(0, 0, -1));
  ray.layers.enable(1);
  assert.ok(ray.intersectObject(second.model, true).length);
  const before = batches.stats.rebuilds;
  batches.sync([first, second], animations);
  assert.equal(batches.stats.rebuilds, before);
  second.model.position.x = -10;
  second.model.rotation.y = Math.PI / 2;
  second.model.updateMatrixWorld();
  batches.sync([first, second], animations);
  const matrix = new THREE.Matrix4();
  batch.getMatrixAt(1, matrix);
  assert.deepEqual(matrix.elements, second.model.matrixWorld.elements);
  second.model.visible = false;
  batches.sync([first, second], animations);
  assert.equal(batch.count, 1);
  second.model.visible = true;
  animations.set(second.model, {});
  batches.sync([first, second], animations);
  assert.equal(batch.count, 1);
  assert.equal(second.model.children[0].layers.mask, 1);
  animations.clear();
  batches.sync([first, second], animations);
  assert.equal(batch.count, 2);
  batches.sync([first], animations);
  assert.equal(batch.count, 1);
  batches.sync([first, second], animations);
  assert.equal(batch.count, 2);
});

test("the light grid never drops an influencing light, even in a dense cluster", () => {
  const lights = Array.from({ length: 180 }, (_, i) => ({
    position: new THREE.Vector3((i % 15) * 2 - 14, i % 20, Math.floor(i / 15) * 2 - 12), range: 11,
  }));
  const grid = buildLightGrid(lights);
  assert.ok(grid.maxLights > 32);
  for (let x = -24; x <= 24; x += 3) for (let z = -24; z <= 24; z += 3) {
    const column = Math.floor(x / 12) - grid.minX;
    const row = Math.floor(z / 12) - grid.minZ;
    const ids = grid.cells[row * grid.width + column];
    lights.forEach((light, index) => {
      if (Math.hypot(light.position.x - x, light.position.z - z) <= light.range)
        assert.ok(ids.includes(index), `Missing emitter ${index} at ${x},${z}`);
    });
  }
});

test("transparent glass preserves individual sorting and render order beside instanced opaque walls", () => {
  const template = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial());
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshPhysicalMaterial({
    transparent: true, opacity: .5, depthWrite: false, clearcoat: .8,
  }));
  glass.position.z = 1.01;
  glass.renderOrder = 3;
  template.add(wall, glass);
  optimizeBuildingTemplates({ house: template });
  const scene = new THREE.Scene();
  const houses = [0, 10].map(x => {
    const model = template.clone();
    model.position.x = x;
    scene.add(model);
    return { type: "house", model };
  });
  scene.updateMatrixWorld(true);
  const batch = createBuildingBatches(scene, { house: template });
  batch.sync(houses, new Map());
  assert.equal(batch.root.children.length, 1);
  assert.equal(batch.root.children[0].count, 2);
  for (const { model } of houses) {
    const pane = model.children.find(m => m.material.transparent);
    assert.equal(pane.layers.mask, 1);
    assert.equal(pane.renderOrder, 3);
    assert.equal(pane.material.opacity, .5);
  }
});

test("clustered lighting preserves all emitters and reuses GPU textures when only the camera or hour changes", () => {
  const scene = new THREE.Scene(), model = new THREE.Group();
  const parent = new THREE.Group();
  scene.add(parent); parent.add(model);
  parent.position.set(5, 2, 3);
  parent.rotation.y = Math.PI / 2;
  addLampEmitter(model, [2, 3, 0], {color: "#ffbe77", intensity: 36, range: 8.5, halo: 2});
  const night = createNightLights(scene, { clustered: true });
  const camera = new THREE.PerspectiveCamera();
  const houses = [{ model }];
  night.update(houses, camera, 1);
  const data = night.uniforms.cityLights.value.image.data;
  assert.ok(new THREE.Vector3(...data.slice(0, 3)).distanceTo(new THREE.Vector3(5, 5, 1)) < 1e-6);
  assert.equal(night.stats.emitters, 1);
  const texture = night.uniforms.cityLights.value;
  const rebuilds = night.stats.rebuilds;
  camera.position.x = 1000;
  night.update(houses, camera, 0);
  night.update(houses, camera, .5);
  assert.equal(night.stats.emitters, 1);
  assert.equal(night.stats.rebuilds, rebuilds);
  assert.equal(night.uniforms.cityLights.value, texture);
  assert.equal(night.uniforms.cityPower.value, .5);
  assert.equal(scene.children.filter(p => p.isPointLight || p.isSpotLight).length, 0);
  let disposed = false;
  texture.addEventListener("dispose", () => { disposed = true; });
  model.visible = false;
  night.update(houses, camera, 1);
  assert.equal(night.stats.emitters, 0);
  assert.equal(disposed, true);
  model.visible = true;
  night.update(houses, camera, 1);
  assert.equal(night.stats.emitters, 1);
});

