import * as THREE from "three";
import { ASPHALT_Y } from "./road-layout.js";
import { policeCarPositions, updatePoliceSignals } from "./posto-policial.js";

function roundedPath(points){
  const path=new THREE.CurvePath();let cursor=points[0];
  for(let i=1;i<points.length-1;i++){
    const center=points[i],before=points[i-1],after=points[i+1];
    const radius=Math.min(2.1,center.distanceTo(before)*.4,center.distanceTo(after)*.4);
    const entry=center.clone().addScaledVector(before.clone().sub(center).normalize(),radius);
    const exit=center.clone().addScaledVector(after.clone().sub(center).normalize(),radius);
    path.add(new THREE.LineCurve3(cursor,entry));path.add(new THREE.QuadraticBezierCurve3(entry,center,exit));cursor=exit;
  }
  path.add(new THREE.LineCurve3(cursor,points.at(-1)));path.arcLengthDivisions=120;return path;
}

export function policeDepartureCurve(name,matrix,roadHeight=ASPHALT_Y){
  const home=policeCarPositions[name],points=[new THREE.Vector3(...home)];
  if(name.startsWith("car-garage"))points.push(new THREE.Vector3(home[0],.1,10),new THREE.Vector3(-15.5,.1,10));
  else if(name.startsWith("car-parked"))points.push(new THREE.Vector3(home[0],.1,22.2),new THREE.Vector3(-15.5,.1,22.2));
  points.push(new THREE.Vector3(-15.5,.1,26),new THREE.Vector3(-15.5,.1,30));
  const world=points.map(p=>p.applyMatrix4(matrix));world.at(-1).y=roadHeight-.18;
  return roundedPath(world);
}

export function createPoliceFleet(engine,{random=Math.random,heightAt=()=>ASPHALT_Y}={}){
  const stations=new Map(),local=new THREE.Vector3();let tiles=[];
  function restore(state){
    for(const car of state.cars)engine.remove(car);state.cars=[];
    if(state.exitTile){engine.removeAccess(state.exitTile);state.exitTile=null;}
    for(const [name,position]of Object.entries(policeCarPositions)){
      const model=state.model.getObjectByName(name);if(model){model.position.fromArray(position);model.rotation.set(0,0,0);}
    }
    state.model.getObjectByName("Police gate").position.x=-20.1;
    state.model.getObjectByName("Police barrier").rotation.z=0;state.openness=0;
  }
  function initialize(state){
    restore(state);state.model.updateWorldMatrix(true,false);state.matrix=state.model.matrixWorld.clone();state.inverse=state.matrix.clone().invert();
    state.yaw=new THREE.Euler().setFromQuaternion(state.model.getWorldQuaternion(new THREE.Quaternion()),"YXZ").y;
    const gate=new THREE.Vector3(-15.5,0,30).applyMatrix4(state.matrix),forward=new THREE.Vector3(0,0,1).transformDirection(state.matrix);
    const candidates=tiles.filter(tile=>{
      const dx=tile.x-gate.x,dz=tile.z-gate.z,along=dx*forward.x+dz*forward.z,across=Math.abs(dx*forward.z-dz*forward.x);
      return tile.neighbors.length&&along>3&&along<9&&across<5.7;
    }).sort((a,b)=>Math.hypot(a.x-gate.x,a.z-gate.z)-Math.hypot(b.x-gate.x,b.z-gate.z));
    const exitTile=candidates[0];if(!exitTile)return;
    engine.addAccess(exitTile);state.exitTile=exitTile;state.gate=gate;
    const access={x:exitTile.x-Math.round(forward.x)*12,z:exitTile.z-Math.round(forward.z)*12,entryPoint:gate};
    const order=Object.keys(policeCarPositions).filter(name=>name!=="car-patrol"&&state.model.getObjectByName(name));
    // Each car receives its own dispatch slot, speed and route generator.
    for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
    // Clear the access lane first; its patrol car must not block cars leaving the bays.
    if(state.model.getObjectByName("car-patrol"))order.unshift("car-patrol");
    let delay=1+random()*1.5;
    for(const name of order){
      const surface=heightAt(gate.x,gate.z)??ASPHALT_Y;
      const car=engine.addDeparture({kind:"police",name,model:state.model.getObjectByName(name),station:state.model,
        exitTile,access,curve:policeDepartureCurve(name,state.matrix,surface),speed:6.1+random()*2.2,readyAt:engine.time+delay});
      state.cars.push(car);delay+=5+random()*6;
    }
  }
  return {
    get states(){return [...stations.values()];},
    add(model){
      if(stations.has(model))return;
      model.userData.policeFleetActive=true;stations.set(model,{model,matrix:null,cars:[],openness:0});
    },
    remove(model){const state=stations.get(model);if(!state)return;restore(state);delete model.userData.policeFleetActive;stations.delete(model);},
    setTiles(next,preserve=false){
      tiles=next;
      for(const state of stations.values()){
        if(preserve&&state.cars.length){state.exitTile=tiles.find(t=>t.x===state.exitTile.x&&t.z===state.exitTile.z);continue;}
        restore(state);state.matrix=null;
      }
    },
    prepare(dt,construction=new Map()){
      let active=false;
      for(const state of stations.values()){
        if(!state.model.visible||construction.has(state.model)){
          if(state.matrix){restore(state);state.matrix=null;}continue;
        }
        state.model.updateWorldMatrix(true,false);
        if(!state.matrix?.equals(state.model.matrixWorld))initialize(state);
        if(!state.cars.length)continue;active=true;
        let opening=false;
        for(const car of state.cars){
          local.copy(car.position).applyMatrix4(state.inverse);
          const departing=car.mode!=="parked"||engine.time+.8>=car.readyAt;
          if(departing&&(car.mode==="driveway"&&local.x<0&&local.z>9||car.position.distanceTo(state.gate)<9))opening=true;
          const blockedByGate=state.openness<.95&&car.mode==="driveway"&&local.x< -7&&local.z>18&&local.z<29;
          car.stopAt=blockedByGate?car.distance:undefined;
        }
        state.openness=THREE.MathUtils.damp(state.openness,Number(opening),4,Math.min(dt,.15));
        state.model.getObjectByName("Police gate").position.x=-20.1-10.3*state.openness;
        state.model.getObjectByName("Police barrier").rotation.z=-Math.PI*.46*state.openness;
      }
      return active;
    },
    sync(){
      for(const state of stations.values()){
        if(!state.matrix)continue;
        for(const car of state.cars){car.model.position.copy(car.position).applyMatrix4(state.inverse);car.model.rotation.y=car.yaw-state.yaw;}
        if(state.cars.length)updatePoliceSignals(state.model,engine.time);
      }
    },
  };
}
