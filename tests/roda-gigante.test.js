import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { createFerrisWheel, createFerrisWheelAnimation, ferrisWheel } from "../src/roda-gigante.js";
import { footprint } from "../src/placement.js";

test("the rotating wheel keeps all cabins level and attached to their own hinges", () => {
  const model = createFerrisWheel();
  const clone = model.clone();
  const wheel = model.getObjectByName("Rotor da roda-gigante");
  const windows = model.getObjectByName("Cabines panorâmicas").children[0];
  const otherWindows = clone.getObjectByName("Cabines panorâmicas").children[0];
  const animation = createFerrisWheelAnimation();
  const camera = new THREE.PerspectiveCamera(47, 16 / 9, .5, 410);
  camera.position.set(20, 30, 90);
  camera.lookAt(0, 17, 0);
  const construction = new Set([model]);
  const matrix = new THREE.Matrix4();
  const still = new THREE.Matrix4();
  const level = new THREE.Vector3(0, 1, 0);
  const hinge = new THREE.Vector3();

  assert.deepEqual(footprint("rodaGigante"), [36, 24]);
  assert.deepEqual(footprint("rodaGigante", 1), [24, 36]);
  assert.equal(windows.count, ferrisWheel.cabinCount);
  const bounds = new THREE.Box3().setFromObject(model);
  assert.ok(bounds.max.y <= ferrisWheel.height && bounds.min.y > -.001);
  animation.add(model);
  assert.equal(animation.update(camera, 0, construction, true), false);
  construction.clear();
  assert.equal(animation.update(camera, 100, construction, true), true);

  for (let time = 200; time <= 58200; time += 100) {
    animation.update(camera, time, construction, true);
    for (let i = 0; i < windows.count; i++) {
      windows.getMatrixAt(i, matrix);
      const angle = i * 2 * Math.PI / windows.count;
      hinge.set(Math.sin(angle), Math.cos(angle), 0).multiplyScalar(ferrisWheel.radius);
      hinge.applyEuler(wheel.rotation);
      assert.ok(hinge.distanceTo(new THREE.Vector3().setFromMatrixPosition(matrix)) < .00001);
      assert.deepEqual(new THREE.Vector3(0, 1, 0).transformDirection(matrix).toArray(), level.toArray());
    }
  }

  windows.getMatrixAt(0, still);
  otherWindows.getMatrixAt(0, matrix);
  assert.notDeepEqual(matrix.elements, still.elements);
  assert.equal(animation.update(camera, 65000, construction, false), false);
  assert.equal(animation.update(camera, 75000, construction, true), true);
  windows.getMatrixAt(0, matrix);
  assert.deepEqual(matrix.elements, still.elements);

  const beforeOutage = wheel.rotation.z;
  assert.equal(animation.update(camera, 75010, construction, true, true, () => 0), false);
  assert.equal(animation.update(camera, 75020, construction, true, false), false);
  assert.equal(wheel.rotation.z, beforeOutage);
  assert.equal(animation.update(camera, 75030, construction, true), true);
  assert.equal(wheel.rotation.z, beforeOutage);
  animation.update(camera, 75090, construction, true);
  assert.notEqual(wheel.rotation.z, beforeOutage);

  model.visible = false;
  assert.equal(animation.update(camera, 75100, construction, true), false);
  model.visible = true;
  animation.remove(model);
  assert.equal(animation.update(camera, 75200, construction, true), false);
  animation.add(model);
  assert.equal(animation.update(camera, 75300, construction, true), true);
});
