import * as THREE from "three";
import { BUILDING_TYPES } from "./house-types.js";
import { footprint, isBuilding } from "./placement.js";

// The skids extend 0.11 m below the aircraft's authored rig origin.
// Their resting height matches the helipad's top surface at 89.13 m.
export const LEXCORP_DOCK = Object.freeze([17.4, 89.02, 0]);
const TAU = Math.PI * 2;
const smooth = t => t * t * (3 - 2 * t);
const angleBetween = (from, to, t) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * t;
const heading = vector => Math.atan2(vector.x, vector.z);
export const LEXCORP_PATROL_HEIGHT = 38;

function inside(point, box) {
  return point.x > box.minX && point.x < box.maxX && point.z > box.minZ && point.z < box.maxZ;
}

function crosses(a, b, box) {
  let near = 0, far = 1;
  for (const [axis, min, max] of [["x",box.minX,box.maxX],["z",box.minZ,box.maxZ]]) {
    const d = b[axis]-a[axis];
    if (Math.abs(d)<1e-9) {if(a[axis]<=min||a[axis]>=max)return false;continue;}
    const t0=(min-a[axis])/d,t1=(max-a[axis])/d;
    near=Math.max(near,Math.min(t0,t1));far=Math.min(far,Math.max(t0,t1));
    if(near>=far)return false;
  }
  return far>0 && near<1;
}

function outsideTowers(point, boxes) {
  if(!boxes.some(box=>inside(point,box)))return point.clone();
  const exits=[];
  for(const box of boxes) {
    for(const x of[box.minX-13,box.maxX+13])exits.push(new THREE.Vector3(x,0,point.z));
    for(const z of[box.minZ-13,box.maxZ+13])exits.push(new THREE.Vector3(point.x,0,z));
    for(const x of[box.minX-13,box.maxX+13])for(const z of[box.minZ-13,box.maxZ+13])exits.push(new THREE.Vector3(x,0,z));
  }
  return exits.filter(exit=>!boxes.some(box=>inside(exit,box))).sort((a,b)=>a.distanceToSquared(point)-b.distanceToSquared(point))[0];
}

function detour(from, to, boxes) {
  const nodes=[from,to];
  for(const b of boxes)for(const x of[b.minX-13,b.maxX+13])for(const z of[b.minZ-13,b.maxZ+13]) {
    const point=new THREE.Vector3(x,0,z);if(!boxes.some(box=>inside(point,box)))nodes.push(point);
  }
  const distance=nodes.map(()=>Infinity),previous=nodes.map(()=>-1),done=new Set();distance[0]=0;
  for(let step=0;step<nodes.length;step++) {
    let current=-1;for(let i=0;i<nodes.length;i++)if(!done.has(i)&&(current<0||distance[i]<distance[current]))current=i;
    if(current<0||!Number.isFinite(distance[current]))break;
    if(current===1)break;done.add(current);
    for(let i=0;i<nodes.length;i++)if(!done.has(i)&&!boxes.some(box=>crosses(nodes[current],nodes[i],box))) {
      const next=distance[current]+nodes[current].distanceTo(nodes[i]);
      if(next<distance[i]){distance[i]=next;previous[i]=current;}
    }
  }
  if(!Number.isFinite(distance[1]))throw new Error("Não foi possível traçar o voo da LexCorp entre as torres");
  const result=[];for(let i=1;i>=0;i=previous[i]){result.push(nodes[i]);if(i===0)break;}
  return result.reverse();
}

function roundedRoute(points) {
  const route=new THREE.CurvePath();let cursor=points[0];
  for(let i=1;i<points.length-1;i++) {
    const center=points[i],before=points[i-1],after=points[i+1];
    const radius=Math.min(8,center.distanceTo(before)*.2,center.distanceTo(after)*.2);
    const entry=center.clone().addScaledVector(before.clone().sub(center).normalize(),radius);
    const exit=center.clone().addScaledVector(after.clone().sub(center).normalize(),radius);
    if(cursor.distanceTo(entry)>.001)route.add(new THREE.LineCurve3(cursor,entry));
    route.add(new THREE.QuadraticBezierCurve3(entry,center,exit));cursor=exit;
  }
  route.add(new THREE.LineCurve3(cursor,points.at(-1)));return route;
}

class PatrolCurve extends THREE.Curve {
  constructor(horizontal,heightAt) {super();this.horizontal=horizontal;this.heightAt=heightAt;this.arcLengthDivisions=500;}
  getPoint(t,target=new THREE.Vector3()) {this.horizontal.getPointAt(t,target);target.y=this.heightAt(target);return target;}
}

export function createLexCorpFlightPlan(owner, city = []) {
  owner.updateWorldMatrix(true, false);
  const ownerMatrix = owner.matrixWorld.clone(), inverse = ownerMatrix.clone().invert();
  const rotation = owner.getWorldQuaternion(new THREE.Quaternion());
  const dock = new THREE.Vector3(...LEXCORP_DOCK).applyMatrix4(ownerMatrix);
  const tower = owner.getWorldPosition(new THREE.Vector3());
  const bounds = new THREE.Box3(
    new THREE.Vector3(tower.x - 24, tower.y, tower.z - 24),
    new THREE.Vector3(tower.x + 24, tower.y + 180, tower.z + 24),
  );
  let maxRoof = bounds.max.y;
  const rooftops=[];
  for (const building of city) {
    if (!isBuilding(building.type)) continue;
    const position = building.model
      ? building.model.getWorldPosition(new THREE.Vector3())
      : new THREE.Vector3(building.x, 0, building.z);
    const [width, depth] = footprint(building.type, building.rotation ?? 0);
    const top = BUILDING_TYPES[building.type].height !== undefined
      ? position.y+BUILDING_TYPES[building.type].height
      : building.model ? new THREE.Box3().setFromObject(building.model).max.y : position.y+28;
    bounds.expandByPoint(new THREE.Vector3(position.x - width / 2, position.y, position.z - depth / 2));
    bounds.expandByPoint(new THREE.Vector3(position.x + width / 2, top, position.z + depth / 2));
    maxRoof = Math.max(maxRoof, top);
    rooftops.push({minX:position.x-width/2,maxX:position.x+width/2,minZ:position.z-depth/2,maxZ:position.z+depth/2,top});
  }
  if(!rooftops.some(roof=>tower.x>=roof.minX&&tower.x<=roof.maxX&&tower.z>=roof.minZ&&tower.z<=roof.maxZ&&roof.top>=tower.y+180))
    rooftops.push({minX:tower.x-24,maxX:tower.x+24,minZ:tower.z-24,maxZ:tower.z+24,top:tower.y+180});
  const noFly=rooftops.filter(roof=>roof.top>tower.y+80).map(roof=>({...roof,minX:roof.minX-11,maxX:roof.maxX+11,minZ:roof.minZ-11,maxZ:roof.maxZ+11}));
  const cruise = tower.y+LEXCORP_PATROL_HEIGHT;
  function heightAt(point) {
    let height=cruise;
    for(const roof of rooftops) {
      if(roof.top>tower.y+80)continue;
      const distance=Math.hypot(Math.max(roof.minX-point.x,0,point.x-roof.maxX),Math.max(roof.minZ-point.z,0,point.z-roof.maxZ));
      const influence=1-smooth(THREE.MathUtils.clamp((distance-8)/45,0,1));
      height=Math.max(height,cruise+Math.max(0,roof.top+12-cruise)*influence);
    }
    return height;
  }
  const lift = dock.clone().add(new THREE.Vector3(0, 14, 0));
  let entry,entryAngle=0;
  for(const radius of[52,75,105,150]) {
    for(const angle of[0,Math.PI/3,-Math.PI/3,Math.PI*2/3,-Math.PI*2/3,Math.PI]) {
      const candidate=new THREE.Vector3(radius*Math.cos(angle),0,radius*Math.sin(angle)).applyMatrix4(ownerMatrix);candidate.y=0;
      if(!noFly.some(box=>inside(candidate,box))){entry=candidate;entryAngle=angle;break;}
    }
    if(entry)break;
  }
  entry ??= outsideTowers(new THREE.Vector3(tower.x+160,0,tower.z),noFly);entry.y=heightAt(entry);
  const aboveDock = dock.clone();
  const departure={minX:Math.min(dock.x,entry.x)-7,maxX:Math.max(dock.x,entry.x)+7,minZ:Math.min(dock.z,entry.z)-7,maxZ:Math.max(dock.z,entry.z)+7};
  let transferHeight=lift.y+4;
  for(const roof of rooftops)if(!(tower.x>=roof.minX&&tower.x<=roof.maxX&&tower.z>=roof.minZ&&tower.z<=roof.maxZ))
    if(departure.minX<roof.maxX&&departure.maxX>roof.minX&&departure.minZ<roof.maxZ&&departure.maxZ>roof.minZ)transferHeight=Math.max(transferHeight,roof.top+18);
  if(entryAngle!==0)transferHeight=Math.max(transferHeight,maxRoof+18);
  aboveDock.y=transferHeight;const staging=entry.clone();staging.y=transferHeight;
  const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
  const rx = Math.max(65, size.x * .38), rz = Math.max(65, size.z * .38);
  const districts = [[.95,.1],[.45,.82],[-.55,.68],[-.92,-.25],[-.25,-.83],[.65,-.72]]
    .map(([x,z]) => outsideTowers(new THREE.Vector3(center.x+x*rx,0,center.z+z*rz),noFly));
  let first = 0;
  for (let i = 1; i < districts.length; i++)
    if (Math.hypot(districts[i].x-entry.x,districts[i].z-entry.z) < Math.hypot(districts[first].x-entry.x,districts[first].z-entry.z)) first = i;
  const ordered = districts.slice(first).concat(districts.slice(0, first));
  const stops=[entry.clone().setY(0),...ordered,entry.clone().setY(0)],points=[stops[0]];
  for(let i=1;i<stops.length;i++)points.push(...detour(stops[i-1],stops[i],noFly).slice(1));
  const route = new PatrolCurve(roundedRoute(points.filter((point,i)=>!i||point.distanceTo(points[i-1])>.01)),heightAt);
  const climbTime = Math.max(2,(transferHeight-lift.y)/6),patrolTransition=Math.max(5,Math.abs(transferHeight-entry.y)/7);
  const stages = [];
  let duration = 0;
  for (const [name, seconds] of [
    ["parked",6],["startup",3],["takeoff",6],["depart",climbTime+5],
    ["descend",patrolTransition],["tour",Math.max(38,route.getLength()/16)],["climb",patrolTransition],["approach",5],
    ["align",climbTime],["landing",8],["shutdown",4],
  ]) {
    stages.push({name,start:duration,end:duration+seconds,duration:seconds});duration += seconds;
  }
  const flightBounds = bounds.clone();
  for (const point of route.getPoints(128)) flightBounds.expandByPoint(point);
  flightBounds.expandByPoint(staging);flightBounds.expandByScalar(8);
  const forward = new THREE.Vector3(0,0,1).applyQuaternion(rotation);
  return {
    ownerMatrix,inverse,rotation,dock,lift,aboveDock,staging,entry,route,stages,duration,flightBounds,climbTime,
    maxRoof,cruise,transferHeight,rooftops,noFly,heightAt,parkYaw:heading(forward),
    startYaw:heading(route.getTangentAt(0)),endYaw:heading(route.getTangentAt(1)),
  };
}

export function sampleLexCorpFlight(plan, seconds) {
  const cycles = Math.floor(Math.max(0,seconds) / plan.duration);
  const time = Math.max(0,seconds) % plan.duration;
  const stage = plan.stages.find(part => time < part.end) ?? plan.stages[0];
  const elapsed = time - stage.start, t = THREE.MathUtils.clamp(elapsed/stage.duration,0,1), u = smooth(t);
  const position = plan.dock.clone();
  let yaw = plan.parkYaw, pitch = 0, bank = 0;
  switch (stage.name) {
    case "takeoff":
      position.lerpVectors(plan.dock,plan.lift,u);break;
    case "depart": {
      // Clear the skyline vertically before translating away from the pad.
      // This also keeps the tail rotor away from the tower during the turn.
      if (elapsed < plan.climbTime) position.lerpVectors(plan.lift,plan.aboveDock,smooth(elapsed/plan.climbTime));
      else {
        const leg = smooth((elapsed-plan.climbTime)/5);
        position.lerpVectors(plan.aboveDock,plan.staging,leg);yaw = angleBetween(plan.parkYaw,plan.startYaw,leg);
      }
      pitch = -.035*Math.sin(Math.PI*t);break;
    }
    case "descend":
      position.lerpVectors(plan.staging,plan.entry,u);yaw=plan.startYaw;break;
    case "tour": {
      plan.route.getPointAt(u,position);
      const tangent = plan.route.getTangentAt(u), after = plan.route.getTangentAt(Math.min(1,u+.008));
      yaw = heading(tangent);pitch = -.045*Math.sin(Math.PI*t);
      const turn = Math.atan2(tangent.x*after.z-tangent.z*after.x,tangent.x*after.x+tangent.z*after.z);
      bank = THREE.MathUtils.clamp(turn*2,-.13,.13)*Math.sin(Math.PI*t);break;
    }
    case "climb":
      position.lerpVectors(plan.entry,plan.staging,u);yaw=plan.endYaw;break;
    case "approach":
      position.lerpVectors(plan.staging,plan.aboveDock,u);yaw = angleBetween(plan.endYaw,plan.parkYaw,u);break;
    case "align":
      position.lerpVectors(plan.aboveDock,plan.lift,u);break;
    case "landing":
      position.lerpVectors(plan.lift,plan.dock,u);break;
  }
  // Integrate the rotor's acceleration/deceleration analytically. The blades
  // stop without a phase jump when the flight loops back to the parking stage.
  let rotorSeconds = 0, cycleRotorSeconds = 0, rotorSpeed = 0;
  for (const part of plan.stages) {
    const active = Math.max(0,Math.min(time-part.start,part.duration)), v = active/part.duration;
    if (part.name === "parked") continue;
    const accelerating = part.name === "startup", decelerating = part.name === "shutdown";
    cycleRotorSeconds += part.duration * (accelerating || decelerating ? .5 : 1);
    rotorSeconds += accelerating ? part.duration*(v**3-.5*v**4)
      : decelerating ? part.duration*(v-v**3+.5*v**4) : active;
    if (part === stage) rotorSpeed = accelerating ? smooth(t) : decelerating ? 1-smooth(t) : 1;
  }
  const rotorAngle = (cycles*cycleRotorSeconds+rotorSeconds)*31;
  return {phase:stage.name,position,yaw,pitch,bank,rotorAngle,rotorSpeed,landed:["parked","startup","shutdown"].includes(stage.name)};
}

export function applyLexCorpFlight(helicopter, plan, seconds) {
  const pose = sampleLexCorpFlight(plan,seconds);
  helicopter.position.copy(pose.position).applyMatrix4(plan.inverse);
  const worldRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(pose.pitch,pose.yaw,pose.bank,"YXZ"));
  helicopter.quaternion.copy(plan.rotation).invert().multiply(worldRotation);
  helicopter.getObjectByName("LexCorp main rotor").rotation.y = pose.rotorAngle % TAU;
  helicopter.getObjectByName("LexCorp tail rotor").rotation.x = (pose.rotorAngle*59/31) % TAU;
  return pose;
}
