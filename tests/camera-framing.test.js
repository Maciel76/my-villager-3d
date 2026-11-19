import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { villageOverview } from "../src/camera-framing.js";
import { createCityPlan } from "../src/city-plan.js";

test("the full city stays within the overview on desktop and portrait screens", () => {
  const world = createCityPlan();
  for (const aspect of [16 / 9, 16 / 11, 1, 0.46]) {
    const overview = villageOverview(world.houses, world.roads, aspect);
    const camera = new THREE.PerspectiveCamera(47, aspect, 0.5, overview.distance + 190);
    camera.position.copy(overview.position);
    camera.lookAt(overview.target);
    camera.updateMatrixWorld();
    for (const x of [-90, 162]) for (const z of [-162, 90]) for (const y of [0, 180]) {
      const projected = new THREE.Vector3(x, y, z).project(camera);
      assert.ok(Math.abs(projected.x) <= 0.841);
      assert.ok(Math.abs(projected.y) <= 0.761);
      assert.ok(projected.z < 1);
    }
  }
  assert.equal(villageOverview([], [], 1), null);
});

test("a single giant tower receives an overview even with a compact ground footprint", () => {
  for (const aspect of [16 / 9, .46]) {
    const overview = villageOverview([{type:"lexCorp",x:6,z:6,rotation:0}], [], aspect);
    assert.ok(overview);
    const camera = new THREE.PerspectiveCamera(47, aspect, .5, overview.distance + 190);
    camera.position.copy(overview.position);camera.lookAt(overview.target);camera.updateMatrixWorld();
    for (const x of [-18,30]) for (const z of [-18,30]) for (const y of [0,180]) {
      const p = new THREE.Vector3(x,y,z).project(camera);
      assert.ok(Math.abs(p.x) <= .841 && Math.abs(p.y) <= .761 && p.z < 1);
    }
  }
  assert.equal(villageOverview([{type:"cottage",x:0,z:0,rotation:0}],[],1),null);
});
