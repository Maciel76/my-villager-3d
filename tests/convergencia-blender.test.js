import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {prepareRefinedConvergence,cloneConvergenceHardware} from '../src/convergencia-hardware.js';
import {createUnlitConvergence,convergence} from '../src/convergencia.js';
import {createConvergenceAnimation} from '../src/convergencia-efeitos.js';
import {createStellarTimeline} from '../src/stellar-timeline.js';
import {createClusteredLights} from '../src/clustered-lights.js';
import {sampleContainmentInjection} from '../src/convergencia-injecao.js';
import {STELLAR_DRAIN_DURATION,STELLAR_SHUTDOWN,STELLAR_EVENT_DURATION,STELLAR_RELIGHT,STELLAR_LAUNCH} from '../src/stellar-event.js';

async function asset() {
  const self=globalThis.self,bitmap=globalThis.createImageBitmap;
  globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:512,height:512,close(){}});
  try {
    const url=new URL('../src/assets/models/optimized/convergencia-refinada.glb',import.meta.url),b=await readFile(url);
    const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
    return prepareRefinedConvergence(gltf,g=>g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(g.attributes.position.count*2),2)));
  } finally {globalThis.self=self;globalThis.createImageBitmap=bitmap;}
}
test('the Blender monument retains its footprint, six true hinges, PBR maps and compact geometry',async()=>{
  const model=await asset(),box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3());
  assert(Math.abs(size.x-71.4)<.02&&Math.abs(size.z-71.4)<.02,JSON.stringify(size));
  assert(Math.abs(box.min.y)<.003&&box.max.y<44,JSON.stringify(box));
  const arms=model.children.filter(o=>o.userData.hinge);assert.equal(arms.length,6);
  assert.equal(model.children.filter(o=>o.userData.injectorArm).length,3);
  assert.equal(model.children.filter(o=>o.userData.energyPod).length,3);
  assert(arms.every(o=>o.userData.hinge.axis.length===3&&o.userData.hinge.travel>0));
  assert(model.userData.lampEmitters.length>15);
  let meshes=0,triangles=0,mapped=0,normalMapped=0;
  model.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;
    if(o.material.map)mapped++;if(o.material.normalMap)normalMapped++;
    assert(o.geometry.attributes.position.array instanceof Float32Array);
    assert(o.geometry.attributes.position.array.every(Number.isFinite));
  }});
  assert(meshes<200,`draw meshes ${meshes}`);assert(triangles<275000,`triangles ${triangles}`);
  assert(mapped>15&&normalMapped>15);assert((await stat(new URL('../src/assets/models/optimized/convergencia-refinada.glb',import.meta.url))).size<9_000_000);
  for(const slot of ['ORBIT_1','ORBIT_2','ORBIT_3','CROWN']) {
    const component=cloneConvergenceHardware(slot);assert(component&&component.powered.length>2);
    const bounds=new THREE.Box3().setFromObject(component.model);
    assert(Math.abs(bounds.getCenter(new THREE.Vector3()).y)<.2,slot+' must remain centered on its runtime pivot');
    component.model.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
  }
});

test('the refined hardware follows launch, blackout, docking and reactivation without changing the show',async()=>{
  const model=await asset(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(47,1.5,.5,1200);
  model.position.set(6,2,6);model.rotation.y=Math.PI/2;scene.add(model);
  camera.position.set(20,65,150);camera.lookAt(6,25,6);
  const unlit=createUnlitConvergence(model),fx=createConvergenceAnimation(scene,createStellarTimeline(),unlit.materials),construction=new Set();
  const started=1_800_000_000_000,show=started+STELLAR_DRAIN_DURATION*1000;
  fx.add(model,started);fx.update(camera,1500,construction,true,show+1500);
  const root=scene.getObjectByName('Luz da Convergência'),orbits=[1,2,3].map(i=>root.getObjectByName(`Órbita ${i}`));
  assert(orbits.every(o=>o.children.length>3));
  const orbitMat=orbits[0].children.find(o=>o.isMesh&&o.material.emissive.getHex()>0).material;
  assert(orbitMat.emissiveIntensity>0);
  const small=model.children.filter(o=>o.userData.injectorArm),pods=model.children.filter(o=>o.userData.energyPod);
  fx.update(camera,6000,construction,true,started+6000);
  assert(small.every(o=>o.quaternion.w<1));assert.equal(root.getObjectByName('Mini-sol').visible,true);
  assert(root.getObjectByName('Mini-sol').scale.x>.97);
  const firstEmission=pods[0].children.find(o=>o.isMesh).material.emissiveIntensity;
  fx.update(camera,11000,construction,true,started+11000);
  assert(pods[0].children.find(o=>o.isMesh).material.emissiveIntensity>firstEmission);
  assert(root.getObjectByName('Transferência dos acumuladores').visible);
  fx.update(camera,14000,construction,true,started+14000);
  assert(pods.every(o=>o.scale.y<.1));
  const arms=model.children.filter(o=>o.userData.hinge);
  fx.update(camera,STELLAR_LAUNCH*1000,construction,true,show+STELLAR_LAUNCH*1000);
  assert(arms.every(o=>o.quaternion.w<.999));
  assert(orbits.every(o=>o.rotation.x===0&&o.rotation.z===0));
  assert(orbits.every(o=>o.position.y>convergence.sunY));
  const cutoff=show+STELLAR_SHUTDOWN*1000;
  fx.syncPower(cutoff);fx.update(camera,100000,construction,true,cutoff);
  assert.equal(orbitMat.emissiveIntensity,0);assert.equal(model.userData.lampEmitters,undefined);
  fx.update(camera,110000,construction,true,started+STELLAR_EVENT_DURATION*1000);
  assert(orbits.every(o=>o.position.y<5));
  const crown=root.getObjectByName('Coroa de luz');
  assert.equal(crown.position.y,1.75);assert.equal(crown.scale.x,1);assert.equal(crown.userData.containmentRadius,34.7);
  const finish=started+STELLAR_EVENT_DURATION*1000;
  fx.setEvent(model,undefined,finish);fx.update(camera,0,construction,true,finish+20000);
  fx.syncPower(finish+STELLAR_RELIGHT*1000);
  assert(model.userData.lampEmitters.length>15);assert(orbitMat.emissiveIntensity>0);
  assert.equal(root.getObjectByName('Coroa de luz').children.some(o=>o.name==='Confinamento | CROWN'),true);
  assert.equal(scene.getObjectByName('Luz do mini-sol').intensity>0,true);
  assert(pods.every(o=>o.scale.y===1));assert.equal(crown.userData.containmentRadius,convergence.crownRadius);
  fx.remove(model);assert.equal(scene.getObjectByName('Luz da Convergência'),undefined);
});

test('energy injection keeps the sun visible and the crown expands before descending outside the arms',()=>{
  assert(sampleContainmentInjection(-6).charge<sampleContainmentInjection(-1).charge);
  for(const t of [-12,-11.5,-6,-1,0,.5,1,2,3,4,10,30,59])assert.equal(sampleContainmentInjection(t).ignition,1);
  assert(sampleContainmentInjection(-1).transfer.some(p=>p>0&&p<1));
  assert.equal(sampleContainmentInjection(2).retract,1);
  assert.equal(sampleContainmentInjection(4).ignition,1);
  const timeline=createStellarTimeline();
  const above=timeline.sample(101);assert.equal(above.crownDescent,0);assert.equal(above.crownRetraction,0);
  const wide=timeline.sample(102.7);assert.equal(wide.crownRetraction,1);assert.equal(wide.crownDescent,0);
  const descent=timeline.sample(106);assert.equal(descent.crownRetraction,1);assert(descent.crownDescent>0);
  const rising=timeline.reactivationPose(15);assert(rising.crownLift>0);assert.equal(rising.crownOpen,0);
  const top=timeline.reactivationPose(17);assert.equal(top.crownLift,1);assert(top.crownOpen>0);
});

test('stored accumulator emission stays independent from the grid while regular lights still drain',()=>{
  const scene=new THREE.Scene(),system=createClusteredLights(scene,new THREE.Texture());
  const regular=new THREE.MeshStandardMaterial(),stored=regular.clone();stored.userData.storedEnergy=true;
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(),regular),new THREE.Mesh(new THREE.BoxGeometry(),stored));
  system.bind(scene);
  const shader=()=>({uniforms:{},vertexShader:'#include <worldpos_vertex>',fragmentShader:'#include <lights_fragment_begin>'});
  const a=shader(),b=shader();regular.onBeforeCompile(a,{});stored.onBeforeCompile(b,{});
  assert(a.fragmentShader.includes('totalEmissiveRadiance *= citySupply'));
  assert(!b.fragmentShader.includes('totalEmissiveRadiance *= citySupply'));
  assert.notEqual(regular.customProgramCacheKey(),stored.customProgramCacheKey());
});
