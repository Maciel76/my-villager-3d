import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { createLexCorpFlightPlan, sampleLexCorpFlight, LEXCORP_DOCK } from "../src/lexcorp-flight.js";
import { createLexCorpAnimation } from "../src/torre-lexcorp.js";

function aircraft() {
  const owner = new THREE.Group(), ship = new THREE.Group();ship.name = "LexCorp helicopter";
  ship.position.fromArray(LEXCORP_DOCK);
  for (const name of ["LexCorp main rotor","LexCorp tail rotor"]) {const rotor = new THREE.Group();rotor.name = name;ship.add(rotor);}
  owner.add(ship);return owner;
}

const city = [
  {type:"lexCorp",x:-66,z:-138,rotation:0},
  {type:"edificioOrion",x:-18,z:-144,rotation:0},
  {type:"supermarket",x:48,z:48,rotation:0},
  {type:"aurora",x:-6,z:-54,rotation:2},
  {type:"church",x:54,z:-6,rotation:2},
];

test("the full flight patrols low, avoids tall towers and returns to a real touchdown", () => {
  const owner = aircraft();owner.position.set(-66,2,-138);
  const plan = createLexCorpFlightPlan(owner,city);
  const phase = name => plan.stages.find(stage => stage.name === name);
  const parked = sampleLexCorpFlight(plan,0);
  assert.equal(parked.phase,"parked");assert.ok(parked.position.distanceTo(plan.dock)<1e-9);
  assert.equal(parked.rotorSpeed,0);
  const start = phase("tour").start, end = phase("tour").end;
  for (let time=0;time<start;time+=.2) {
    const pose=sampleLexCorpFlight(plan,time);
    if(pose.phase==="takeoff")
      assert.ok(Math.hypot(pose.position.x-plan.dock.x,pose.position.z-plan.dock.z)<1e-8,"climb vertically before leaving the pad");
  }
  for (let time=phase("align").start;time<plan.duration;time+=.2) {
    const pose=sampleLexCorpFlight(plan,time);
    assert.ok(Math.hypot(pose.position.x-plan.dock.x,pose.position.z-plan.dock.z)<1e-8,"descend vertically above the pad");
  }
  const travelled = new THREE.Box3();
  for (let time=start;time<end;time+=.25) {
    const pose = sampleLexCorpFlight(plan,time);
    assert.ok(pose.position.y >= plan.cruise-.001 && pose.position.y < 80,"patrol stays near the neighborhoods");
    for(const roof of plan.rooftops) {
      const gap=Math.hypot(Math.max(roof.minX-pose.position.x,0,pose.position.x-roof.maxX),Math.max(roof.minZ-pose.position.z,0,pose.position.z-roof.maxZ));
      if(gap<7)assert.ok(pose.position.y>=roof.top+11.9,"the rotor clears nearby roofs");
    }
    for(const box of plan.noFly)assert.ok(!(pose.position.x>box.minX&&pose.position.x<box.maxX&&pose.position.z>box.minZ&&pose.position.z<box.maxZ),"low patrol detours around skyscrapers");
    assert.ok(Number.isFinite(pose.yaw) && Math.abs(pose.bank)<.15);
    travelled.expandByPoint(pose.position);
  }
  const extent = travelled.getSize(new THREE.Vector3());
  assert.ok(extent.x>110 && extent.z>110,"the aircraft crosses several districts");
  const landed = sampleLexCorpFlight(plan,phase("shutdown").start);
  assert.ok(landed.position.distanceTo(plan.dock)<1e-9);
  assert.equal(landed.landed,true);
  assert.equal(sampleLexCorpFlight(plan,plan.duration+.5).rotorSpeed,0);
  assert.ok(sampleLexCorpFlight(plan,plan.duration+.5).position.distanceTo(plan.dock)<1e-9);
  assert.ok(Math.abs(LEXCORP_DOCK[1]+.11-89.13)<1e-9,"skids touch the helipad");
});

test("low patrol finds a clear route around adjacent tall buildings",()=>{
  const owner=aircraft(),neighbors=[{type:"lexCorp",x:0,z:0,rotation:0},{type:"lexCorp",x:48,z:0,rotation:0},{type:"lexCorp",x:0,z:48,rotation:0}];
  const plan=createLexCorpFlightPlan(owner,neighbors),tour=plan.stages.find(stage=>stage.name==="tour");
  for(let time=tour.start;time<tour.end;time+=.2) {
    const point=sampleLexCorpFlight(plan,time).position;
    assert.ok(point.y<60);
    for(const box of plan.noFly)assert.ok(!(point.x>box.minX&&point.x<box.maxX&&point.z>box.minZ&&point.z<box.maxZ));
  }
});

test("phase boundaries and repeated laps have continuous positions and blade angles", () => {
  const plan = createLexCorpFlightPlan(aircraft(),city), eps=.00001;
  const deltaAngle = (a,b) => Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
  for (const edge of plan.stages.map(stage=>stage.end)) {
    const before=sampleLexCorpFlight(plan,edge-eps),after=sampleLexCorpFlight(plan,edge+eps);
    assert.ok(before.position.distanceTo(after.position)<.001,`position at ${edge}`);
    assert.ok(deltaAngle(before.yaw,after.yaw)<.001,`heading at ${edge}`);
    assert.ok(deltaAngle(before.rotorAngle,after.rotorAngle)<.001,`rotor at ${edge}`);
    assert.ok(Math.abs(before.rotorSpeed-after.rotorSpeed)<.001);
  }
});

test("translated and rotated towers receive the aircraft in their own helipad frame", () => {
  for (const rotation of [0,Math.PI/2,Math.PI,Math.PI*1.5]) {
    const owner=aircraft();owner.position.set(60,5,-90);owner.rotation.y=rotation;
    const plan=createLexCorpFlightPlan(owner,city),pose=sampleLexCorpFlight(plan,plan.duration+.1);
    owner.updateWorldMatrix(true,false);
    const local=pose.position.clone().applyMatrix4(owner.matrixWorld.clone().invert());
    assert.ok(local.distanceTo(new THREE.Vector3(...LEXCORP_DOCK))<1e-8);
    assert.ok(Math.abs(Math.atan2(Math.sin(pose.yaw-rotation),Math.cos(pose.yaw-rotation)))<1e-8);
  }
});

test("a city flight keeps moving when the tower itself is outside the camera view", () => {
  const owner=aircraft();owner.position.set(-66,0,-138);
  const controller=createLexCorpAnimation();controller.setCity(city);controller.add(owner);
  const camera=new THREE.PerspectiveCamera(35,1,.1,220);
  camera.position.set(70,210,160);camera.lookAt(40,210,0);camera.updateMatrixWorld();
  const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  assert.equal(frustum.intersectsBox(new THREE.Box3(new THREE.Vector3(-90,0,-162),new THREE.Vector3(-42,180,-114))),false);
  for(let time=0;time<=40000;time+=100)assert.equal(controller.update(camera,time,new Set(),true),true);
  assert.ok(owner.getObjectByName("LexCorp helicopter").position.distanceTo(new THREE.Vector3(...LEXCORP_DOCK))>40);
  const held=owner.getObjectByName("LexCorp helicopter").position.clone();
  assert.equal(controller.update(camera,41000,new Set(),false),false);
  assert.ok(owner.getObjectByName("LexCorp helicopter").position.equals(held));
});

test("moving a tower resets the trip onto its relocated pad and layout changes replan on the ground", () => {
  const owner=aircraft(),controller=createLexCorpAnimation();controller.add(owner);controller.setCity(city);
  const camera=new THREE.PerspectiveCamera(60,1,.1,1200);camera.position.set(80,220,400);camera.lookAt(0,90,0);
  for(let time=0;time<=40000;time+=100)controller.update(camera,time,new Set(),true);
  owner.position.set(60,3,-36);owner.rotation.y=Math.PI/2;
  controller.update(camera,40100,new Set(),true);
  assert.ok(owner.getObjectByName("LexCorp helicopter").position.distanceTo(new THREE.Vector3(...LEXCORP_DOCK))<1e-8);
  controller.setCity([...city,{type:"lexCorp",x:120,z:100,rotation:0}]);
  controller.update(camera,40200,new Set(),true);
  assert.ok(owner.getObjectByName("LexCorp helicopter").position.distanceTo(new THREE.Vector3(...LEXCORP_DOCK))<1e-8);
});
