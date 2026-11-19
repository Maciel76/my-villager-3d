import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { optimizeBuildingTemplates, createBuildingBatches } from "../src/building-batches.js";
import { setPavingGroundCover } from "../src/ground-cover.js";
import { startConstruction, updateConstruction, finishConstruction } from "../src/construction.js";
import { registerDecorationObstacles, decorationSurfaceHeight } from "../src/decoration-obstacles.js";
import { setDecorationObstacles } from "../src/placement.js";

function template() {
  const root = new THREE.Group();
  const grass = new THREE.Mesh(mergeGeometries([
    new THREE.BoxGeometry(12, .1, 12).translate(0, .05, 0),
    new THREE.BoxGeometry(4, .1, 4).translate(0, 5.05, 0),
  ]), new THREE.MeshStandardMaterial({ color: "green" }));
  grass.userData.groundCover = true;
  const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 5, 4).translate(0, 2.5, 0), new THREE.MeshStandardMaterial());
  root.add(grass, wall);
  optimizeBuildingTemplates({ cottage: root });
  return root;
}

test("paving replaces only the low lawn and retains rooftop gardens, walls, textures and triangle counts", () => {
  const model = template();
  const low = model.children.find(part => part.userData.lowGroundCover);
  const roof = model.children.find(part => part.userData.groundCover && !part.userData.lowGroundCover);
  assert.ok(low && roof);
  low.geometry.computeBoundingBox(); roof.geometry.computeBoundingBox();
  assert.ok(low.geometry.boundingBox.max.y < .11);
  assert.ok(roof.geometry.boundingBox.min.y > 4.9);
  assert.equal(low.geometry.index.count + roof.geometry.index.count, 72);
  for (const part of [low, roof]) {
    assert.ok(part.geometry.getAttribute("uv"));
    assert.ok(part.geometry.getAttribute("normal"));
  }
  setPavingGroundCover(model, true);
  assert.equal(low.visible, false);
  assert.equal(roof.visible, true);
  assert.equal(model.children.find(part => !part.userData.groundCover).visible, true);
  const sequence = startConstruction(model);
  updateConstruction(sequence, sequence.started + 1500);
  finishConstruction(sequence);
  assert.equal(low.visible, false, "Finishing construction must not cover the pavement again");
  assert.equal(roof.visible, true);
  setPavingGroundCover(model, false);
  assert.equal(low.visible, true);
  assert.equal(low.layers.mask, 1, "Native animated models also restore their rendering layer");
});

test("batches and picking distinguish identical houses on paving and grass, including moves and undo", () => {
  const source = template(), scene = new THREE.Scene();
  const first = { type: "cottage", model: source.clone() };
  const second = { type: "cottage", model: source.clone() };
  second.model.position.x = 20;
  setPavingGroundCover(first.model, false);
  setPavingGroundCover(second.model, true);
  scene.add(first.model, second.model); scene.updateMatrixWorld(true);
  const batches = createBuildingBatches(scene, { cottage: source });
  const animations = new Map();
  batches.sync([first, second], animations);
  const ground = batches.root.children.find(mesh => mesh.userData.lowGroundCover);
  assert.equal(ground.count, 1);
  assert.ok(batches.root.children.filter(mesh => !mesh.userData.lowGroundCover).every(mesh => mesh.count === 2));
  const ray = new THREE.Raycaster(new THREE.Vector3(25, 1, 5), new THREE.Vector3(0, -1, 0));
  ray.layers.enable(1);
  assert.equal(ray.intersectObject(second.model, true).length, 0, "Hidden lawn cannot intercept selection of the paving");
  setPavingGroundCover(second.model, false);
  batches.sync([first, second], animations);
  assert.equal(ground.count, 2, "Removing paving or moving the building restores its original lawn");
  assert.ok(ray.intersectObject(second.model, true).length);
  setPavingGroundCover(second.model, true);
  batches.sync([first, second], animations);
  assert.equal(ground.count, 1);
});

test("decorations use the paving instead of an invisible raised lawn", () => {
  const model = template();
  registerDecorationObstacles({ cottage: model });
  try {
    const house = { type: "cottage", x: 0, z: 0, rotation: 0, model };
    assert.ok(decorationSurfaceHeight(5, 5, [house]) > .09);
    setPavingGroundCover(model, true); model.position.y = .12;
    assert.equal(decorationSurfaceHeight(5, 5, [house]), 0);
    setPavingGroundCover(model, false); model.position.y = 0;
    assert.ok(decorationSurfaceHeight(5, 5, [house]) > .09);
  } finally { setDecorationObstacles("cottage", null); }
});
