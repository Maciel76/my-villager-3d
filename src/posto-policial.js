import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { markNightLight } from "./daylight.js";
import { addLampEmitter } from "./night-lights.js";
import { createLexCorpAnimation } from "./torre-lexcorp.js";
import { createLexCorpFlightPlan, applyLexCorpFlight } from "./lexcorp-flight.js";
import { addLexCorpSearchlightFixture } from "./lexcorp-searchlight.js";

export const policeStation = Object.freeze({
  footprint:[72,60],height:28.18,dock:[-25,17.14,-13],patrolHeight:32,
  rotorNames:["Police main rotor","Police tail rotor"],
});
const previews=new WeakMap(), signals=new WeakMap();
const carPositions={};
for(let i=0;i<4;i++)carPositions[`car-parked${i}`]=[5.2+i*5.3,.1,17.5];
for(let i=0;i<5;i++)carPositions[`car-garage${i}`]=[19.2+i*3.06,.1,-1.8];
carPositions['car-patrol']=[-15.5,.1,12];
// Patrol stays in the circulation lane, away from the offices, pad legs and parked cars.
export const policePatrolRoute=new THREE.CatmullRomCurve3([
  [-17,.1,21],[-17,.1,1],[-19,.1,-5],[-28,.1,-5],[-28,.1,17],[-23,.1,21],
].map(p=>new THREE.Vector3(...p)),true,"centripetal");

function labelTexture(text){
  const canvas=document.createElement("canvas");canvas.width=1024;canvas.height=256;
  const c=canvas.getContext("2d");c.fillStyle="#ecf1f2";c.fillRect(0,0,1024,256);
  c.fillStyle="#103b6c";c.fillRect(0,204,1024,52);c.font="bold 156px Arial";c.textAlign="center";c.fillText(text,512,163);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;return map;
}
function environment(){
  const faces=Array.from({length:6},()=>{const c=document.createElement("canvas");c.width=c.height=256;const x=c.getContext("2d"),g=x.createLinearGradient(0,0,0,256);g.addColorStop(0,"#4c8cb9");g.addColorStop(.46,"#cde6f5");g.addColorStop(.52,"#6d8794");g.addColorStop(1,"#344b41");x.fillStyle=g;x.fillRect(0,0,256,256);return c;});
  const texture=new THREE.CubeTexture(faces);texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;return texture;
}

export function preparePoliceStationModel(scene,materials,projectTexture){
  scene.updateMatrixWorld(true);
  const model=new THREE.Group();model.name="Complexo Policial";model.userData.hasMovingParts=true;
  const architecture=new THREE.Group();architecture.name="Police architecture";model.add(architecture);
  const helicopter=new THREE.Group();helicopter.name="Police helicopter";helicopter.position.fromArray(policeStation.dock);model.add(helicopter);
  const rotor=new THREE.Group();rotor.name=policeStation.rotorNames[0];rotor.position.set(0,2.95,0);
  const tail=new THREE.Group();tail.name=policeStation.rotorNames[1];tail.position.set(-.3,2.37,-4.75);helicopter.add(rotor,tail);
  const gate=new THREE.Group();gate.name="Police gate";gate.position.set(-20.1,.28,29);model.add(gate);
  const barrier=new THREE.Group();barrier.name="Police barrier";barrier.position.set(-10.1,1.48,23.15);model.add(barrier);
  const rigs={architecture,helicopter,mainRotor:rotor,tailRotor:tail,gate,barrier};
  for(const [key,position]of Object.entries(carPositions)){const group=new THREE.Group();group.name=key;group.position.fromArray(position);rigs[key]=group;model.add(group);}
  const env=environment(),finishes=new Map(),groups=new Map();
  scene.traverse(part=>{
    if(!part.isMesh)return;
    const finish=part.name.split("-")[1],rig=part.userData.policeRig;
    if(!rigs[rig])throw Error(`Peça policial sem grupo: ${part.name}`);
    if(!finishes.has(finish)){
      let m=part.material.clone();
      if(["glass","blueGlass"].includes(finish)){
        m=new THREE.MeshPhysicalMaterial({color:finish==="glass"?"#6fa9cc":"#5598be",metalness:.32,roughness:.16,envMap:env,envMapIntensity:.65,clearcoat:1,transparent:true,opacity:finish==="glass"?.5:.78,depthWrite:false,side:THREE.DoubleSide});
        markNightLight(m,.24);m.emissive.set("#6e9caf");
      }else if(finish==="asphalt")m=materials.asphalt;
      else if(finish==="paving")m=materials.plaza;
      else if(finish==="grass")m=materials.lawn;
      else if(finish==="carGlass"){m.envMap=env;m.envMapIntensity=1.1;m.metalness=.5;m.roughness=.12;}
      else if(["warm","amber"].includes(finish)){markNightLight(m,1.2);m.emissive.copy(m.color);}
      else if(["sirenRed","sirenBlue"].includes(finish)){m.emissive.copy(m.color);m.emissiveIntensity=.4;}
      finishes.set(finish,m);
    }
    let geometry=part.geometry.clone().applyMatrix4(part.matrixWorld);
    if(/helicopter-(fuselage|cockpit)$/.test(part.name)){geometry.deleteAttribute("normal");geometry.deleteAttribute("uv");const smooth=mergeVertices(geometry,.0001);geometry.dispose();geometry=smooth;geometry.computeVertexNormals();}
    if(finishes.get(finish).map||!geometry.getAttribute("uv"))projectTexture(geometry);
    // Remove optional CAD attributes so finish batching has one consistent contract.
    for(const key of Object.keys(geometry.attributes))if(!["position","normal","uv"].includes(key))geometry.deleteAttribute(key);
    const offset=new THREE.Vector3();
    if(rig.startsWith("car-"))offset.set(carPositions[rig][0],0,carPositions[rig][2]);
    else if(["helicopter","mainRotor","tailRotor"].includes(rig)){
      offset.fromArray(policeStation.dock);if(rig==="mainRotor")offset.add(rotor.position);if(rig==="tailRotor")offset.add(tail.position);
    }else if(["gate","barrier"].includes(rig))offset.copy(rigs[rig].position);
    geometry.translate(-offset.x,-offset.y,-offset.z);
    const key=`${rig}:${finish}`;
    if(!groups.has(key))groups.set(key,{rig,finish,parts:[]});groups.get(key).parts.push(geometry);
  });
  for(const {rig,finish,parts}of groups.values()){
    const geometry=mergeGeometries(parts);if(!geometry)throw Error(`Falha no acabamento policial ${rig}/${finish}`);
    parts.forEach(g=>g.dispose());const material=finishes.get(finish),mesh=new THREE.Mesh(geometry,material);
    mesh.name=`police-${finish}`;mesh.castShadow=rig==="architecture"&&!material.transparent;mesh.receiveShadow=true;
    mesh.renderOrder=material.transparent?2:0;
    mesh.userData.groundCover=["asphalt","paving","grass"].includes(finish);mesh.userData.lowGroundCover=mesh.userData.groundCover;
    rigs[rig].add(mesh);
  }
  const decal=new THREE.MeshStandardMaterial({map:labelTexture("POLÍCIA"),roughness:.65});
  for(const [rig,group]of Object.entries(rigs)){
    if(!rig.startsWith("car-")&&rig!=="helicopter")continue;
    for(const side of[-1,1]){
      const plane=new THREE.Mesh(new THREE.PlaneGeometry(rig==="helicopter"?1.8:2,.42),decal);
      plane.position.set(side*(rig==="helicopter"?1.065:1.016),rig==="helicopter"?1.55:1.25,-.25);plane.rotation.y=side*Math.PI/2;group.add(plane);
    }
  }
  for(const [x,z]of[[-21,20],[30,20],[-30,8],[-19,-26],[26,-24]])addLampEmitter(model,[x,6.7,z],{color:"#ffe8bd",intensity:28,range:17,halo:.2});
  for(const [x,z]of[[-32,25],[32,25]])addLampEmitter(model,[x,8.8,z],{color:"#deefff",intensity:18,range:14,halo:.1});
  addLexCorpSearchlightFixture(helicopter);
  return model;
}

export function samplePolicePatrol(seconds){
  const t=((seconds/36)%1+1)%1,position=policePatrolRoute.getPointAt(t),tangent=policePatrolRoute.getTangentAt(t);
  return {position,yaw:Math.atan2(tangent.x,tangent.z),gateOpen:position.z>17};
}
export function posePoliceStation(model,seconds,plan){
  if(!plan){model.updateWorldMatrix(true,false);if(!previews.has(model)||!previews.get(model).ownerMatrix.equals(model.matrixWorld))previews.set(model,createLexCorpFlightPlan(model,[],policeStation));plan=previews.get(model);}
  const pose=applyLexCorpFlight(model.getObjectByName("Police helicopter"),plan,seconds),car=samplePolicePatrol(seconds);
  const patrol=model.getObjectByName("car-patrol");patrol.position.copy(car.position);patrol.rotation.y=car.yaw;
  // Open before the patrol reaches the gate area, with a smooth mechanical motion.
  const openness=THREE.MathUtils.smoothstep(car.position.z,14,19);
  model.getObjectByName("Police gate").position.x=-20.1-10.3*openness;
  model.getObjectByName("Police barrier").rotation.z=-Math.PI*.46*openness;
  if(!signals.has(model)){
    const list=[];model.traverse(part=>{if(part.isMesh&&["police-sirenRed","police-sirenBlue"].includes(part.name)){part.material=part.material.clone();list.push(part);}});signals.set(model,list);
  }
  for(const part of signals.get(model)){
    const phase=seconds*3.7+(part.name.endsWith("Blue")?.5:0),flash=phase%1<.16||phase%1>.24&&phase%1<.4;
    part.material.emissiveIntensity=flash?3.8:.12;
  }
  return pose;
}
export function createPoliceStationAnimation(scene,options={}){
  return createLexCorpAnimation(scene,{...options,helicopterName:"Police helicopter",pose:posePoliceStation,flightSpecification:policeStation});
}
