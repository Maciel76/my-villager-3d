import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { createLexCorpAnimation, lexCorp } from "../src/torre-lexcorp.js";
import { footprint, readSave } from "../src/placement.js";

function rig() {
  const root = new THREE.Group();
  const ship = new THREE.Group();ship.name = "LexCorp helicopter";ship.position.fromArray(lexCorp.landing);
  for (const name of ["LexCorp main rotor","LexCorp tail rotor"]) {
    const group = new THREE.Group();group.name = name;ship.add(group);
  }
  root.add(ship);return root;
}

function camera() {
  const view = new THREE.PerspectiveCamera(47, 1.5, .1, 1500);
  view.position.set(70, 110, 300);view.lookAt(0, 85, 0);return view;
}

test("LexCorp animates its aircraft while keeping each placed tower and unregistered clone fixed", () => {
  const tower = rig(), other = tower.clone(), animation = createLexCorpAnimation(), view = camera();
  tower.position.set(12, 3, -12);tower.rotation.y = Math.PI / 2;
  const position = tower.position.clone(), rotation = tower.rotation.clone();
  const rotor = tower.getObjectByName("LexCorp main rotor"), tail = tower.getObjectByName("LexCorp tail rotor");
  const ship = tower.getObjectByName("LexCorp helicopter");
  animation.add(tower);animation.add(tower);
  for (let t = 0; t <= 30000; t += 100) animation.update(view, t, new Set(), true);
  assert.notEqual(rotor.rotation.y, 0);assert.notEqual(tail.rotation.x, 0);
  assert.ok(ship.position.distanceTo(new THREE.Vector3(...lexCorp.landing)) > 30);
  assert.ok(tower.position.equals(position));assert.ok(tower.rotation.equals(rotation));
  assert.equal(other.getObjectByName("LexCorp main rotor").rotation.y, 0);
  assert.equal(other.getObjectByName("LexCorp helicopter").position.y, lexCorp.landing[1]);
  const pose = rotor.rotation.y;
  assert.equal(animation.update(view, 31000, new Set(), false), false);
  assert.equal(rotor.rotation.y, pose);
  assert.equal(animation.update(view, 120000, new Set(), true), true);
  assert.equal(rotor.rotation.y, pose, "resuming starts from the frozen pose");
  assert.deepEqual(footprint("lexCorp"), [48, 48]);
  const saved = {version:1,houses:[{type:"lexCorp",x:6,z:6,rotation:1}]};
  assert.equal(readSave(saved)[0].type, "lexCorp");
});

test("construction, hidden towers, offscreen views and removal pause the LexCorp animation", () => {
  const tower = rig(), animation = createLexCorpAnimation(), view = camera(), rotor = tower.getObjectByName("LexCorp main rotor");
  animation.add(tower);
  assert.equal(animation.update(view, 0, new Set([tower]), true), false);
  assert.equal(rotor.rotation.y, 0);
  animation.update(view, 100, new Set(), true);animation.update(view, 200, new Set(), true);
  const pose = rotor.rotation.y;tower.visible = false;
  assert.equal(animation.update(view, 300, new Set(), true), false);assert.equal(rotor.rotation.y, pose);
  tower.visible = true;view.lookAt(500,110,600);
  assert.equal(animation.update(view, 400, new Set(), true), false);assert.equal(rotor.rotation.y, pose);
  animation.remove(tower);view.lookAt(0,85,0);
  assert.equal(animation.update(view, 500, new Set(), true), false);
  animation.add(tower);animation.update(view, 600, new Set(), true);animation.update(view,700,new Set(),true);
  assert.ok(Number.isFinite(rotor.rotation.y));
});
