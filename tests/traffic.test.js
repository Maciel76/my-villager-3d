import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {createRoadTraffic,vehiclesOverlap} from "../src/traffic-driving.js";
import {createPoliceFleet} from "../src/police-fleet.js";
import {policeCarPositions} from "../src/posto-policial.js";
import {createTraffic,streetGraph} from "../src/traffic.js";
import {createGardenCityPlan} from "../src/garden-city-plan.js";

function seeded(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function graph(roads){return streetGraph(new Map(roads.map(r=>[`${r.x},${r.z}`,r])));}
function station(plot={x:0,z:0,rotation:0}){
  const model=new THREE.Group();model.position.set(plot.x,0,plot.z);model.rotation.y=plot.rotation*Math.PI/2;
  for(const [name,position]of Object.entries(policeCarPositions)){const part=new THREE.Group();part.name=name;part.position.fromArray(position);model.add(part);}
  for(const name of["Police gate","Police barrier"]){const part=new THREE.Group();part.name=name;model.add(part);}
  return model;
}
function populate(engine,tiles,count,random){
  for(let attempt=0;attempt<2000&&engine.vehicles.filter(c=>c.kind==="civilian").length<count;attempt++){
    const tile=tiles[Math.floor(random()*tiles.length)];if(!tile.neighbors.length)continue;
    engine.addRoadVehicle(tile,tile.neighbors[Math.floor(random()*tile.neighbors.length)],random(),{kind:"civilian"});
  }
}
function noOverlaps(cars){
  for(let i=0;i<cars.length;i++)for(let j=i+1;j<cars.length;j++)
    assert.equal(vehiclesOverlap(cars[i],cars[j],0),false,`Vehicles ${cars[i].id}/${cars[j].id} collided`);
}

test("collision clearance uses the whole vehicle, including angled SUVs",()=>{
  const car={position:new THREE.Vector3(),yaw:0,halfLength:2.45,halfWidth:1.2};
  assert.equal(vehiclesOverlap(car,{...car,position:new THREE.Vector3(0,0,4)},0),true);
  assert.equal(vehiclesOverlap(car,{...car,position:new THREE.Vector3(3.1,0,0)}),false);
  assert.equal(vehiclesOverlap(car,{...car,position:new THREE.Vector3(2,0,2),yaw:Math.PI/2},0),true);
});

test("ten police vehicles leave individually, take different routes and share collision avoidance with civilian traffic",()=>{
  const random=seeded(123),world=createGardenCityPlan(),tiles=graph(world.roads),engine=createRoadTraffic({random});
  const fleet=createPoliceFleet(engine,{random}),model=station(world.houses.find(h=>h.type==="policeStation"));
  fleet.setTiles(tiles);fleet.add(model);fleet.prepare(1/30);populate(engine,tiles,36,random);
  assert.equal(fleet.states[0].cars.length,10);
  const dispatch=fleet.states[0].cars.map(c=>c.readyAt).sort((a,b)=>a-b);
  for(let i=1;i<dispatch.length;i++)assert.ok(dispatch[i]-dispatch[i-1]>=5);
  const departures=new Map(),routes=new Map();let waits=0;
  for(let frame=0;frame<9000;frame++){
    fleet.prepare(1/30);engine.update(1/30);fleet.sync();noOverlaps(engine.vehicles);
    for(const car of engine.vehicles){
      if(car.kind==="police"&&car.mode==="road"){departures.set(car.name,departures.get(car.name)??engine.time);routes.set(car.name,car.history.join("|"));}
      if(engine.time>180)waits=Math.max(waits,car.wait);
    }
  }
  assert.equal(departures.size,10);assert.ok(Math.max(...departures.values())<180);
  assert.ok(new Set(routes.values()).size>=8,"Cars should not repeat a common convoy route");
  assert.ok(waits<25,`Traffic remained blocked for ${waits}s`);
  for(const car of engine.vehicles)assert.ok(car.meters>300,`Vehicle ${car.id} failed to circulate`);
});

test("dead ends, four-way crossings and dense grids keep moving without collisions, including long frames",()=>{
  const layouts=[
    Array.from({length:9},(_,i)=>({x:(i-4)*12,z:0})),
    [...Array.from({length:9},(_,i)=>({x:(i-4)*12,z:0})),...[-48,-36,-24,-12,12,24,36,48].map(z=>({x:0,z}))],
    Array.from({length:25},(_,i)=>({x:(i%5-2)*12,z:(Math.floor(i/5)-2)*12})),
  ];
  for(const [index,roads]of layouts.entries())for(const seed of[17,429]){
    const random=seeded(seed),tiles=graph(roads),engine=createRoadTraffic({random});populate(engine,tiles,index===0?5:10,random);
    assert.ok(engine.vehicles.length>=5);
    for(let frame=0;frame<3600;frame++){engine.update(frame%79===0?.15:1/30);noOverlaps(engine.vehicles);}
    for(const car of engine.vehicles)assert.ok(car.meters>120,`${index}/${seed}: vehicle ${car.id} remained blocked (${car.wait}s)`);
  }
});

test("fleet pauses with reduced motion, resets after road edits and follows moved or rotated stations",()=>{
  const scene=new THREE.Scene(),traffic=createTraffic(scene,()=>.045,{random:seeded(10)}),model=station();scene.add(model);
  const roads=new Map();for(let x=-48;x<=48;x+=12)roads.set(`${x},36`,{x,z:36});
  traffic.addPoliceStation(model);traffic.setRoads(roads);
  const focus=new THREE.Vector3();traffic.update(focus,140,.04,true);
  for(let i=0;i<300;i++)traffic.update(focus,140,.04,true);
  const before=traffic.vehicles.map(c=>c.position.clone());
  for(let i=0;i<100;i++)traffic.update(focus,140,.04,false);
  traffic.vehicles.forEach((c,i)=>assert.ok(c.position.equals(before[i])));
  const extended=new Map(roads);extended.set("60,36",{x:60,z:36});traffic.setRoads(extended);traffic.update(focus,140,0,false);
  traffic.vehicles.forEach((c,i)=>assert.ok(c.position.equals(before[i]),"Extending a street must preserve current patrol positions"));
  traffic.setRoads(new Map());traffic.update(focus,140,.04,true);assert.equal(traffic.vehicles.length,0);
  for(const [name,home]of Object.entries(policeCarPositions))assert.deepEqual(model.getObjectByName(name).position.toArray(),home);
  model.position.set(100,0,100);model.rotation.y=Math.PI/2;
  const rotated=new Map();for(let z=52;z<=148;z+=12)rotated.set(`136,${z}`,{x:136,z});
  traffic.setRoads(rotated);traffic.update(focus,140,.04,true);
  assert.equal(traffic.vehicles.filter(c=>c.kind==="police").length,10);
  traffic.update(focus,140,.04,true,true,undefined,new Map([[model,{}]]));assert.equal(traffic.vehicles.length,0);
  traffic.update(focus,140,.04,true);assert.equal(traffic.vehicles.length,10);
  traffic.removePoliceStation(model);assert.equal(traffic.vehicles.length,0);assert.equal(model.userData.policeFleetActive,undefined);
});
