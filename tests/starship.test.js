import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,stat } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { prepareStarshipModel,starshipMissionClip } from '../src/starship.js';
import { createStarshipAnimation } from '../src/starship-effects.js';
import { sampleStarshipMission,starshipBusy,STARSHIP_DURATION } from '../src/starship-mission.js';
import { isVillageWorld } from '../src/village-data.js';
import { footprint,readSave,canPlace } from '../src/placement.js';
import { economyProfile } from '../src/economy.js';

test('the shared mission trajectory is continuous, stages separate, both vehicles return and supports deploy',()=>{
  let previous=sampleStarshipMission(0);
  for(let t=.05;t<=STARSHIP_DURATION+.05;t+=.05) {
    const s=sampleStarshipMission(t);
    for(const key of ['booster','ship','armL','armR','quickDisconnect']) {
      assert(s[key].position.every(Number.isFinite));
      const distance=Math.hypot(...s[key].position.map((v,i)=>v-previous[key].position[i]));
      assert(distance<9,`${key} jumps ${distance} m at ${t}`);
    }
    previous=s;
  }
  assert.equal(sampleStarshipMission(15).booster.position[1],8.5);
  assert(sampleStarshipMission(30).booster.position[1]>200);
  assert(sampleStarshipMission(48).ship.position[1]-sampleStarshipMission(48).booster.position[1]>400);
  assert.deepEqual(sampleStarshipMission(64).booster.position,[-5,8.5,0]);
  const end=sampleStarshipMission(STARSHIP_DURATION);
  assert.deepEqual(end.ship.position,[21,3.56,6.5]);
  assert.equal(end.deployment,1);assert.equal(end.shipThrust,0);assert.equal(end.boosterThrust,0);assert(end.done);
});

test('the 30-lot launch base and timestamp survive validation, purchase rules and save loading',()=>{
  const launchAt=Date.now(),house={type:'starship',x:0,z:30,rotation:1,launchAt};
  const world={version:1,houses:[house],economy:{coins:12000,progressMs:0}};
  assert.deepEqual(footprint('starship'),[72,60]);assert.deepEqual(footprint('starship',1),[60,72]);
  assert.equal(economyProfile('starship').price,8350);
  assert(isVillageWorld(world));assert.equal(readSave(world)[0].launchAt,launchAt);
  assert.equal(isVillageWorld({...world,houses:[{...house,type:'cottage'}]}),false);
  for(const value of [-1,0,NaN,Infinity,'123',1.5])
    assert.equal(isVillageWorld({...world,houses:[{...house,launchAt:value}]}),false);
  assert(starshipBusy(house,launchAt+33000));assert.equal(starshipBusy(house,launchAt+108000),false);
  assert.equal(canPlace(0,30,[house],null,'starship',1),false);
});

test('the optimized Blender clip controls real pivots after batching, cloning, rotation and reload',async()=>{
  // Decode the real embedded image buffers without a GPU in the Node test process.
  const originalBitmap=globalThis.createImageBitmap,originalSelf=globalThis.self;
  globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:512,height:512,close(){}});
  try {
    const url=new URL('../src/assets/models/optimized/starship.glb',import.meta.url),b=await readFile(url);
    const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
    const project=g=>g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
    const template=prepareStarshipModel(gltf,project),bounds=new THREE.Box3().setFromObject(template);
    assert(Math.abs(bounds.max.y-139.9)<.05);
    const below=[];template.traverse(o=>{if(o.isMesh){const b=new THREE.Box3().setFromObject(o);if(b.min.y<-.01)below.push({name:o.name,parent:o.parent.name,min:b.min.toArray(),pos:o.position.toArray(),scale:o.scale.toArray()});}});
    assert(Math.abs(bounds.min.y)<.01,JSON.stringify(below));
    assert(Math.abs(bounds.max.x-bounds.min.x-72)<.05);
    assert(Math.abs(bounds.max.z-bounds.min.z-60)<.05);
    let meshes=0,triangles=0;template.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
    assert(meshes<125,`draw meshes: ${meshes}`);assert(triangles<200000,`triangles: ${triangles}`);
    assert((await stat(url)).size<6_000_000);
    assert.equal(starshipMissionClip().tracks.length,13);assert.equal(starshipMissionClip().duration,108);
    assert.equal(template.userData.hasMovingParts,true);assert.equal(template.userData.lampEmitters.length,9);
    const scene=new THREE.Scene(),model=template.clone();scene.add(model);model.position.set(30,2,48);model.rotation.y=Math.PI/2;
    const controller=createStarshipAnimation(scene),launchAt=Date.now(),construction=new Map();
    controller.add(model,launchAt);
    for(const t of [0,16,22,34,48,62,82,90,98,108]) {
      controller.update(launchAt+t*1000,construction,false);
      const s=sampleStarshipMission(t);
      for(const [name,key] of [['BOOSTER','booster'],['SHIP','ship'],['ARM_L','armL'],['ARM_R','armR'],['QD','quickDisconnect']]) {
        assert(model.getObjectByName(name).position.distanceTo(new THREE.Vector3(...s[key].position))<.01,`${name} at ${t}`);
      }
    }
    const ship=model.getObjectByName('SHIP'),expected=model.localToWorld(new THREE.Vector3(21,3.56,6.5));
    assert(ship.getWorldPosition(new THREE.Vector3()).distanceTo(expected)<.01);
    assert.equal(model.getObjectByName('LEG_0').scale.x,1);
    assert.equal(controller.entries.get(model).fx.root.visible,false);
    controller.remove(model);assert.equal(controller.entries.size,0);assert.equal(scene.children.length,1);
  } finally {globalThis.createImageBitmap=originalBitmap;globalThis.self=originalSelf;}
});
