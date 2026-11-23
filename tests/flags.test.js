import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { FLAG_COUNTRIES, FLAG_TYPES } from "../src/flag-types.js";
import { createFlagModels, createFlagAnimation, poseFlagCloth } from "../src/flags.js";
import { BUILDING_TYPES } from "../src/house-types.js";
import { canPlace, readSave } from "../src/placement.js";
import { optimizeBuildingTemplates, createBuildingBatches } from "../src/building-batches.js";

test("twenty flags use local artwork and preserve the source proportions", async () => {
  assert.equal(Object.keys(FLAG_TYPES).length, 20);
  assert.equal(new Set(FLAG_COUNTRIES.map(c => c.code)).size, 20);
  for (const {type,code,aspect} of FLAG_COUNTRIES) {
    assert.equal(BUILDING_TYPES[type].category, "decoration");
    assert.equal(BUILDING_TYPES[type].family, "flags");
    const svg = await readFile(new URL(`../src/assets/flags/${code}.svg`, import.meta.url), "utf8");
    const view = svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
    assert.ok(Math.abs(view[2] / view[3] - aspect) < .0001, code);
    assert.ok(!/<script\b/i.test(svg));
  }
});

test("fabric waves around a fixed hoist, with finite normals and conservative bounds", () => {
  const models = createFlagModels();
  optimizeBuildingTemplates(models);
  for (const [type,model] of Object.entries(models)) {
    assert.equal(model.userData.hasMovingParts, true);
    const cloth = model.getObjectByName("Tecido da bandeira");
    assert.equal(cloth.material.side, THREE.DoubleSide);
    const positions = cloth.geometry.attributes.position, uvs = cloth.geometry.attributes.uv;
    const before = positions.array.slice();
    poseFlagCloth(cloth.geometry, FLAG_TYPES[type].aspect, 2.5, .1);
    let freeEdgeChanged = false;
    for (let i = 0; i < positions.count; i++) {
      if (uvs.getX(i) === 0) for (let axis = 0; axis < 3; axis++)
        assert.ok(Math.abs(positions.array[i*3+axis] - before[i*3+axis]) < 1e-7);
      if (uvs.getX(i) === 1 && Math.abs(positions.getZ(i) - before[i*3+2]) > .01) freeEdgeChanged = true;
      assert.ok(cloth.geometry.boundingBox.containsPoint(new THREE.Vector3().fromBufferAttribute(positions, i)));
    }
    assert.ok(freeEdgeChanged, type);
    assert.ok(cloth.geometry.attributes.normal.array.every(Number.isFinite));
    const bounds = new THREE.Box3().setFromObject(model);
    assert.ok(Math.abs(bounds.min.y) < .001 && bounds.max.y > 6.5 && bounds.max.y < 6.6);
  }
});

test("placed copies animate independently, pause offscreen or for reduced motion, and resume after undo", () => {
  const template = createFlagModels().flagBrazil, a = template.clone(), b = template.clone();
  b.position.x = 4; a.updateMatrixWorld(true); b.updateMatrixWorld(true);
  const templateCloth = template.getObjectByName("Tecido da bandeira");
  const original = templateCloth.geometry.attributes.position.array.slice();
  const animation = createFlagAnimation(); animation.add(a); animation.add(b); animation.add(a);
  assert.equal(animation.count, 2);
  const aCloth = a.getObjectByName("Tecido da bandeira"), bCloth = b.getObjectByName("Tecido da bandeira");
  assert.notEqual(aCloth.geometry, bCloth.geometry);
  assert.notEqual(aCloth.geometry, templateCloth.geometry);
  const camera = new THREE.PerspectiveCamera(50, 2, .1, 200);
  camera.position.set(2,5,16); camera.lookAt(2,3,0); camera.updateMatrixWorld();
  assert.equal(animation.update(camera,0,new Map(),true), true);
  animation.update(camera,100,new Map(),true);
  assert.notDeepEqual(aCloth.geometry.attributes.position.array, bCloth.geometry.attributes.position.array);
  assert.deepEqual(templateCloth.geometry.attributes.position.array, original);
  const frozen = aCloth.geometry.attributes.position.array.slice();
  assert.equal(animation.update(camera,200,new Map(),false), false);
  assert.deepEqual(aCloth.geometry.attributes.position.array, frozen);
  animation.update(camera,300,new Map([[a,{}],[b,{}]]),true);
  assert.deepEqual(aCloth.geometry.attributes.position.array, frozen);
  a.visible = b.visible = false;
  assert.equal(animation.update(camera,400,new Map(),true), false);
  a.visible = true; camera.lookAt(2,5,100); camera.updateMatrixWorld();
  assert.equal(animation.update(camera,500,new Map(),true), false);
  animation.remove(a); assert.equal(animation.count,1);
  animation.add(a); assert.equal(animation.count,2);
  camera.lookAt(2,3,0); camera.updateMatrixWorld();
  animation.update(camera,600,new Map(),true); animation.update(camera,700,new Map(),true);
  assert.ok(a.getObjectByName("Tecido da bandeira").geometry.attributes.position.array.every(Number.isFinite));
  const scene = new THREE.Scene();scene.add(a);
  const batches = createBuildingBatches(scene,{flagBrazil:template});
  batches.sync([{type:"flagBrazil",model:a}],new Map(),camera);
  assert.equal(batches.stats.drawBatches,0, "moving fabric stays visible as an independent model");
});

test("flagpoles fit small spaces and every country survives saved village reload", () => {
  const houses = FLAG_COUNTRIES.map(({type},i)=>({type,x:(i%5)*2+.25,z:Math.floor(i/5)*2+.75,rotation:i%4}));
  assert.equal(canPlace(.25,.75,[],null,"flagBrazil",0), true);
  assert.equal(canPlace(.25,.75,[houses[0]],null,"flagPortugal",0), false);
  assert.deepEqual(readSave({version:1,houses}).map(({order,...house})=>house),houses);
});
