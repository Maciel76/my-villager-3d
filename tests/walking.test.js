import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createWalker } from "../src/walking.js";

function fixture() {
  const templates = {
    cottage: new THREE.Mesh(new THREE.BoxGeometry(9, 5, 9).translate(0, 2.5, 0)),
    lampUrban: new THREE.Mesh(new THREE.BoxGeometry(.6, 4, .6).translate(0, 2, 0)),
    decorBench: new THREE.Mesh(new THREE.BoxGeometry(3, 1, 2).translate(0, .5, 0)),
  };
  const walker = createWalker(() => 0, 410);
  walker.enter(new THREE.Vector3(), new THREE.Vector3(0, 0, -1), [], templates, []);
  return { walker, templates };
}

test("building in first person cannot enclose the player and respects rotated object bounds", () => {
  const { walker, templates } = fixture();
  assert.equal(walker.canBuildAt("cottage", 0, 0, 0, templates), false);
  assert.equal(walker.canBuildAt("cottage", 12, 0, 0, templates), true);
  assert.equal(walker.canBuildAt("decorBench", 0, 1.5, 0, templates), true);
  assert.equal(walker.canBuildAt("decorBench", 0, 1.5, 1, templates), false);
  assert.equal(walker.canBuildAt("lampUrban", 0, 0, 0, templates), false);
  assert.equal(walker.canBuildAt("lampUrban", 1, 0, 0, templates), true);
});

test("live collision updates preserve the walking camera and include newly built and removed houses", () => {
  const { walker, templates } = fixture();
  const model = templates.cottage.clone();
  model.position.z = -12;
  const house = { type: "cottage", x: 0, z: -12, rotation: 0, model };
  const pose = walker.camera.position.clone(), orientation = walker.camera.quaternion.clone();
  walker.updateObstacles([house], templates);
  assert.ok(walker.camera.position.equals(pose));
  assert.ok(walker.camera.quaternion.equals(orientation));
  const forward = new THREE.Vector3(0, 0, -1);
  for (let i = 0; i < 100; i++) walker.advance(forward, .04);
  assert.ok(walker.camera.position.z >= -7.2);
  assert.ok(walker.camera.position.z < -6.9);
  walker.updateObstacles([], templates);
  for (let i = 0; i < 30; i++) walker.advance(forward, .04);
  assert.ok(walker.camera.position.z < -12);
  assert.equal(walker.active, true);
});
