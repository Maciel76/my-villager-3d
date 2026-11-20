import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { policeStation, samplePolicePatrol, posePoliceStation, createPoliceStationAnimation } from "../src/posto-policial.js";
import { createLexCorpFlightPlan, sampleLexCorpFlight } from "../src/lexcorp-flight.js";
import { createGardenCityPlan } from "../src/garden-city-plan.js";

function station(){
  const owner=new THREE.Group(),heli=new THREE.Group();heli.name="Police helicopter";owner.add(heli);
  for(const name of policeStation.rotorNames){const rotor=new THREE.Group();rotor.name=name;heli.add(rotor);}
  for(const name of["car-patrol","Police gate","Police barrier","Police architecture"]){const group=new THREE.Group();group.name=name;owner.add(group);}
  return owner;
}

test("police helicopter patrols the complete city and lands on its own rotated helipad",()=>{
  const owner=station();owner.position.set(42,2,132);owner.rotation.y=Math.PI;
  const plan=createLexCorpFlightPlan(owner,createGardenCityPlan().houses,policeStation),tour=plan.stages.find(s=>s.name==="tour");
  const dock=new THREE.Vector3(...policeStation.dock).applyMatrix4(owner.matrixWorld);
  assert.ok(plan.dock.distanceTo(dock)<1e-8);
  assert.equal(plan.cruise,34);
  for(let t=tour.start;t<tour.end;t+=.2){
    const pose=sampleLexCorpFlight(plan,t);
    assert.ok(pose.position.y>=34);
    for(const box of plan.noFly)assert.ok(!(pose.position.x>box.minX&&pose.position.x<box.maxX&&pose.position.z>box.minZ&&pose.position.z<box.maxZ));
    assert.ok(plan.flightBounds.containsPoint(pose.position));
  }
  for(const stage of plan.stages){
    assert.ok(sampleLexCorpFlight(plan,stage.end-1e-5).position.distanceTo(sampleLexCorpFlight(plan,stage.end+1e-5).position)<.001);
  }
  posePoliceStation(owner,plan.duration,plan);
  assert.ok(owner.getObjectByName("Police helicopter").position.distanceTo(new THREE.Vector3(...policeStation.dock))<1e-8);
  assert.ok(Math.abs(policeStation.dock[1]+.11-17.25)<1e-8,"skids match the real deck height");
});

test("SUV patrol clears the offices, parked vehicles, walls and helipad columns",()=>{
  for(let t=0;t<=36;t+=.05){
    const {position:p,yaw}=samplePolicePatrol(t);
    assert.ok(p.x>-31&&p.x<-14.5&&p.z>-7&&p.z<23);
    assert.ok(Number.isFinite(yaw));
    // Conservative rectangle including mirrors and bumpers, in patrol-local coordinates.
    for(const x of[-1.2,1.2])for(const z of[-2.5,2.5]){
      const corner=new THREE.Vector3(x,0,z).applyAxisAngle(new THREE.Vector3(0,1,0),yaw).add(p);
      assert.ok(corner.x<-12.1,"SUV stays west of the headquarters");
      for(const cx of[-28.9,-21.1])for(const cz of[-16.9,-9.1])assert.ok(Math.abs(corner.x-cx)>1.1||Math.abs(corner.z-cz)>1.1,"SUV clears pad columns");
      assert.ok(corner.x>-34&&corner.z<27.9,"SUV clears perimeter walls");
    }
  }
  assert.ok(samplePolicePatrol(0).position.distanceTo(samplePolicePatrol(36).position)<1e-9);
});

test("police animation pauses during construction and follows a relocated campus",()=>{
  const owner=station(),scene=new THREE.Scene();scene.add(owner);
  const controller=createPoliceStationAnimation(null),camera=new THREE.PerspectiveCamera(60,1,.1,2000);camera.position.set(50,80,140);camera.lookAt(0,10,0);camera.updateProjectionMatrix();
  controller.add(owner);controller.setCity([]);controller.update(camera,0,new Map(),true);
  const first=owner.getObjectByName("car-patrol").position.clone();controller.update(camera,100,new Map(),true);
  assert.ok(first.distanceTo(owner.getObjectByName("car-patrol").position)>.1);
  const paused=owner.getObjectByName("car-patrol").position.clone();controller.update(camera,200,new Map([[owner,{}]]),true);assert.deepEqual(owner.getObjectByName("car-patrol").position,paused);
  owner.position.set(100,0,-30);owner.rotation.y=Math.PI/2;controller.update(camera,300,new Map(),true);
  assert.ok(owner.getObjectByName("Police helicopter").position.distanceTo(new THREE.Vector3(...policeStation.dock))<1e-8);
  controller.remove(owner);
});

test("the police helicopter retains its own flight rig when an outage holds it or returns it to the pad",()=>{
  const owner=station(),controller=createPoliceStationAnimation(null);
  const ship=owner.getObjectByName("Police helicopter"),dock=new THREE.Vector3(...policeStation.dock);
  const camera=new THREE.PerspectiveCamera(60,1,.1,2000);
  camera.position.set(50,80,140);camera.lookAt(0,10,0);
  controller.add(owner);controller.setCity([]);
  assert.equal(controller.update(camera,0,new Map(),true,0,false),false);
  assert.equal(controller.update(camera,15000,new Map(),true,0,false),false);
  assert.ok(ship.position.distanceTo(dock)<1e-8);
  let time=15000;
  for(;time<=45000;time+=100)controller.update(camera,time,new Map(),true);
  assert.ok(ship.position.distanceTo(dock)>5);
  const limit=time+Math.ceil(createLexCorpFlightPlan(owner,[],policeStation).duration*1000);
  for(;time<limit;time+=100){
    if(!controller.update(camera,time,new Map(),true,0,false))break;
  }
  assert.ok(time<limit,"The patrol must finish landing during the outage");
  assert.ok(ship.position.distanceTo(dock)<1e-8);
  assert.equal(controller.update(camera,time+15000,new Map(),true,0,false),false);
});
