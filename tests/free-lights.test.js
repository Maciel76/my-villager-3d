import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { BUILD_LIMIT, canPlace, readSave, FREE_LIGHT_DEFAULT_Y } from "../src/placement.js";
import { isVillageWorld } from "../src/village-data.js";
import { canBuildHouse, canMoveRoad, canRemoveRoad, houseSite, roadLots, tileKey } from "../src/road-layout.js";
import { createLampModels } from "../src/lamp-models.js";
import { createNightLights } from "../src/night-lights.js";
import { createWalker } from "../src/walking.js";
import { createBuildingBatches, optimizeBuildingTemplates } from "../src/building-batches.js";

const light=(y=3)=>({type:"lightBlock",x:0,z:0,rotation:0,y});
test("free lights coexist with occupied parcels, roads, other lights and arbitrary sub-metre positions",()=>{
  const roads=new Map([[tileKey(0,0),{x:0,z:0}]]),lots=roadLots(roads);
  assert.equal(canBuildHouse(.25,.75,[{type:"cottage",x:0,z:0,rotation:0},light()],roads,lots,null,"lightBlock",0),true);
  assert.equal(canPlace(0,0,[light()],null,"cottage",0),true);
  assert.deepEqual(houseSite(2.31,4.69,lots,"lightBlock",0),{x:2.25,z:4.75});
  assert.equal(canRemoveRoad(0,0,[light()],roads),true);
  assert.equal(canMoveRoad(12,0,roads.get("0,0"),[light()],roads),true);
  assert.equal(canPlace(BUILD_LIMIT+1,0,[],null,"lightBlock",0),false);
});

test("the save schema persists absolute light height and rejects invalid or unrelated height fields",()=>{
  const world={version:1,houses:[light(-2),{...light(18),x:1},{type:"cottage",x:0,z:0,rotation:0}]};
  assert.equal(isVillageWorld(world),true);
  assert.equal(readSave(world).length,3);
  assert.deepEqual(readSave(world).slice(0,2).map(h=>h.y),[-2,18]);
  const legacy=light();delete legacy.y;
  assert.equal(readSave({version:1,houses:[legacy]})[0].y,FREE_LIGHT_DEFAULT_Y);
  for(const y of [NaN,Infinity,-21,101,"4",null]){
    assert.equal(isVillageWorld({version:1,houses:[light(y)]}),false);
    assert.equal(readSave({version:1,houses:[light(y)]}).length,0);
  }
  assert.equal(isVillageWorld({version:1,houses:[{type:"cottage",x:0,z:0,rotation:0,y:3}]}),false);
});

test("the light block uses the same warm point-light effect at its saved 3D position and never blocks walking",()=>{
  const templates=createLampModels(),model=templates.lightBlock.clone(),scene=new THREE.Scene();
  const emitter=model.userData.lampEmitters[0];
  assert.equal(emitter.intensity,templates.lampColonial.userData.lampEmitters[0].intensity);
  assert.equal(emitter.range,templates.lampColonial.userData.lampEmitters[0].range);
  assert.equal(emitter.color,templates.lampColonial.userData.lampEmitters[0].color);
  const bounds=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  assert.ok(bounds.x<.2&&bounds.y<.2&&bounds.z<.2);
  model.position.set(5,12,-3);scene.add(model);
  const camera=new THREE.PerspectiveCamera(),night=createNightLights(scene,{clustered:true});
  night.update([{model}],camera,1);
  assert.deepEqual([...night.uniforms.cityLights.value.image.data.slice(0,3)],[5,12,-3]);
  model.position.y=-2;night.update([{model}],camera,1);
  assert.equal(night.uniforms.cityLights.value.image.data[1],-2);
  const walker=createWalker(()=>0,410);
  model.position.set(0,0,0);
  walker.enter(new THREE.Vector3(),new THREE.Vector3(0,0,-1),[{...light(),model}],templates,[]);
  assert.deepEqual(walker.camera.position.toArray(),[0,1.68,0]);
  assert.equal(walker.canBuildAt("lightBlock",0,0,0,templates),true);
  assert.equal(walker.advance(new THREE.Vector3(0,0,-1),.04),true);
});

test("light markers respect scene depth and distant handles disappear without switching off their emitters",()=>{
  const templates=createLampModels();
  const marker=templates.lightBlock.children[0];
  assert.equal(marker.material.depthTest,true);
  assert.equal(marker.material.depthWrite,true);
  assert.equal(marker.renderOrder,0);
  assert.equal(templates.lightBlock.userData.lampEmitters[0].halo,0,"An invisible light needs no floating halo");
  optimizeBuildingTemplates(templates);
  const scene=new THREE.Scene(),model=templates.lightBlock.clone();scene.add(model);
  const houses=[{type:"lightBlock",model}],camera=new THREE.PerspectiveCamera(62,1,.08,410);
  const night=createNightLights(scene,{clustered:true}),batches=createBuildingBatches(scene,templates);
  camera.position.set(0,0,10);scene.updateMatrixWorld(true);
  batches.sync(houses,new Map(),camera);night.update(houses,camera,1);
  const batch=batches.root.children[0];
  assert.equal(batch.count,1);
  const data=night.uniforms.cityLights.value,rebuilds=night.stats.rebuilds;
  camera.position.set(0,0,80);
  batches.sync(houses,new Map(),camera);night.update(houses,camera,1);
  assert.equal(batch.count,0);
  assert.equal(model.visible,true);
  assert.equal(night.stats.emitters,1);
  assert.equal(night.uniforms.cityLights.value,data);
  assert.equal(night.stats.rebuilds,rebuilds);
  camera.position.set(0,0,10);
  batches.sync(houses,new Map(),camera);night.update(houses,camera,1);
  assert.equal(batch.count,1);
  assert.equal(night.uniforms.cityLights.value,data);
});
