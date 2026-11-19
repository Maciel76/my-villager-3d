import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { convergence, createConvergencia } from "../src/convergencia.js";
import { createConvergenceAnimation } from "../src/convergencia-efeitos.js";
import { footprint } from "../src/placement.js";

test("the animated sky beam has a separate lifetime and leaves the monument's building bounds finite", () => {
  const monument = createConvergencia();
  const scene = new THREE.Scene();
  const animation = createConvergenceAnimation(scene);
  const camera = new THREE.PerspectiveCamera(47, 16 / 9, 0.5, 420);
  const construction = new Set();
  camera.position.set(38, 84, 245);
  camera.lookAt(6, 60, -17);
  monument.position.set(6, 2, -17);
  monument.rotation.y = Math.PI / 2;
  scene.add(monument);
  animation.add(monument);
  const effects = scene.getObjectByName("Luz da Convergência");
  const beam = effects.getObjectByName("Feixe até o céu");
  const orbit = effects.getObjectByName("Órbita 1");
  const bounds = new THREE.Box3().setFromObject(monument);

  assert.deepEqual(footprint("convergencia"), [72, 72]);
  assert.ok(bounds.max.y < 44);
  assert.ok(beam.geometry.parameters.height > camera.far);
  assert.ok(Math.abs(beam.position.y + beam.geometry.parameters.height / 2 - convergence.beamHeight) < .01);
  assert.equal(animation.update(camera, 2000, construction, true), true);
  assert.deepEqual(effects.position.toArray(), monument.position.toArray());
  const firstAngle = orbit.rotation.y;
  animation.update(camera, 3200, construction, true);
  assert.notEqual(orbit.rotation.y, firstAngle);
  assert.equal(animation.update(camera, 4200, construction, false), false);
  const frozenAngle = orbit.rotation.y;
  animation.update(camera, 5200, construction, false);
  assert.equal(orbit.rotation.y, frozenAngle);

  construction.add(monument);
  assert.equal(animation.update(camera, 6200, construction, true), false);
  assert.equal(effects.visible, false);
  construction.delete(monument);
  monument.visible = false;
  assert.equal(animation.update(camera, 7200, construction, true), false);

  animation.remove(monument);
  assert.equal(scene.getObjectByName("Luz da Convergência"), undefined);
  assert.equal(animation.update(camera, 8200, construction, true), false);
});
