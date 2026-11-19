import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { createEdificioOrion } from "../src/edificio-orion.js";
import { footprint } from "../src/placement.js";

test("the Orion terraces produce finite geometry inside the 40 × 30 m site", () => {
  const model = createEdificioOrion();
  const bounds = new THREE.Box3().setFromObject(model);
  const dimensions = [40, 56, 30];
  bounds.getSize(new THREE.Vector3()).toArray().forEach((size, axis) => {
    assert.ok(Math.abs(size - dimensions[axis]) < 0.01);
  });
  model.traverse(({ geometry }) => {
    if (geometry) assert.ok(geometry.attributes.position.array.every(Number.isFinite));
  });
  assert.deepEqual(footprint("edificioOrion"), [48, 36]);
  assert.deepEqual(footprint("edificioOrion", 1), [36, 48]);
});
