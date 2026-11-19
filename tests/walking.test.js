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

test("flight clears roofs, blocks descent through them, and lands in open ground", () => {
  const { walker, templates } = fixture();
  const model = templates.cottage.clone();
  model.position.z = -12;
  const house = { type: "cottage", x: 0, z: -12, rotation: 0, model };
  const idle = new THREE.Vector3();
  const forward = new THREE.Vector3(0, 0, -1);
  walker.updateObstacles([house], templates);
  walker.toggleFlight();
  assert.equal(walker.flying, true);
  for (let frame = 0; frame < 60; frame++) walker.advance(idle, .04);
  assert.equal(walker.camera.position.y, 26);
  assert.equal(walker.inTransition, false);
  for (let frame = 0; frame < 13; frame++) walker.advance(forward, .04);
  assert.ok(walker.camera.position.z < -11);
  for (let frame = 0; frame < 60; frame++) walker.advance(idle, .04, -1);
  assert.ok(walker.camera.position.y >= 6.98);
  const height = walker.camera.position.y;
  walker.updateObstacles([house], templates);
  assert.equal(walker.camera.position.y, height);
  walker.toggleFlight();
  assert.equal(walker.landing, true);
  for (let frame = 0; frame < 60; frame++) walker.advance(idle, .04);
  assert.equal(walker.flying, false);
  assert.equal(walker.active, true);
  assert.equal(walker.camera.position.y, 1.68);
  assert.ok(Math.abs(walker.camera.position.x) >= 4.8 ||
    Math.abs(walker.camera.position.z + 12) >= 4.8);
});

test("vertical input is bounded and leaving the view resets flight", () => {
  const { walker, templates } = fixture();
  const idle = new THREE.Vector3();
  walker.toggleFlight();
  for (let frame = 0; frame < 250; frame++) walker.advance(idle, .04, 1);
  assert.equal(walker.camera.position.y, 140);
  walker.look(0, 1000);
  assert.ok(walker.camera.rotation.x < -Math.PI / 2 + .03);
  walker.leave();
  walker.toggleFlight();
  assert.equal(walker.flying, false);
  walker.enter(idle, new THREE.Vector3(0, 0, -1), [], templates, []);
  assert.equal(walker.camera.position.y, 1.68);
});
