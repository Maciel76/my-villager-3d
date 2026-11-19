import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { createLexCorpSearchlight } from "../src/lexcorp-searchlight.js";

function setup() {
  const scene=new THREE.Scene(),ship=new THREE.Group();ship.position.set(8,40,-6);scene.add(ship);
  const effect=createLexCorpSearchlight(scene,ship),pose={landed:false,rotorSpeed:1,yaw:.5};
  return{scene,ship,effect,pose};
}

test("the searchlight sweeps the ground with a real spotlight and a visible beam",()=>{
  const{effect,pose,ship}=setup();effect.update(pose,1,1);
  assert.ok(effect.light.isSpotLight&&effect.light.intensity>1000&&effect.beam.visible);
  assert.ok(Math.abs(effect.light.target.position.y-.035)<.001);
  const first=effect.status.target.clone();effect.update(pose,7,1);
  assert.ok(effect.status.target.distanceTo(first)>8);
  const beamAxis=new THREE.Vector3(0,-1,0).applyQuaternion(effect.beam.quaternion);
  assert.ok(beamAxis.dot(effect.status.target.clone().sub(effect.status.source).normalize())>.99999);
  assert.ok(Math.abs(effect.beam.scale.y-effect.status.distance)<1e-9);
  ship.position.x+=15;effect.update(pose,7.1,1);
  const lens=ship.getObjectByName("LexCorp searchlight lens").getWorldPosition(new THREE.Vector3());
  assert.ok(lens.distanceTo(effect.status.source)<.04,"the light follows the lamp without a frame of lag");
  effect.update({...pose,landed:true},8,1);
  assert.equal(effect.light.intensity,0);assert.equal(effect.beam.visible,false);
  effect.dispose();assert.equal(effect.root.parent,null);
});

test("a roof intercepts the beam before it reaches the street below",()=>{
  const{scene,effect,pose}=setup();
  const roof=new THREE.Mesh(new THREE.BoxGeometry(160,1,160),new THREE.MeshStandardMaterial());roof.position.y=16;scene.add(roof);scene.updateMatrixWorld(true);
  effect.update(pose,2,1,[roof]);
  assert.equal(effect.status.hit,roof);assert.ok(Math.abs(effect.status.target.y-16.5)<.001);
  assert.ok(effect.light.distance<effect.status.source.y);
  effect.update(pose,2,0,[roof]);const day=effect.light.intensity;
  effect.update(pose,2,1,[roof]);assert.ok(effect.light.intensity>day);
  effect.hide();assert.equal(effect.light.intensity,0);
  effect.dispose();
});
