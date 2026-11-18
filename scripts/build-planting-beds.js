import { mkdir, writeFile } from "node:fs/promises";
import { PLANTING_BED_TYPES } from "../src/planting-bed-types.js";

const commands = [{command:"parameters.add",params:{name:"bedScale",expression:"1",unit:""}}];
const palette = { stone:"#b4b7ac", rim:"#e1ddcb", soil:"#546a3a", reflector:"#f2cd68", dark:"#45534b" };
let type, origin, serial, colors, volume=0, bodies=0;
const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
const ex = n => `${Number((n*1000).toFixed(5))} * bedScale`;
function add(command,params,finish,v,lo,hi) {
  const name=`${type}-${finish}-${++serial}`;
  commands.push({command,params:{...params,operation:"new",name,body_name:name}});
  (colors[finish]??=[]).push(name);volume+=v*1e9;bodies++;
  for(let i=0;i<3;i++){min[i]=Math.min(min[i],lo[i]*1000);max[i]=Math.max(max[i],hi[i]*1000);}
}
function box(f,x,y,z,w,d,h) {
  const c=[origin[0]+x,origin[1]+y,z],dims=[w,d,h];
  add("solid.box",{center:c.map(ex),length:ex(w),width:ex(d),height:ex(h)},f,w*d*h,c.map((n,i)=>n-dims[i]/2),c.map((n,i)=>n+dims[i]/2));
}
function cylinder(f,x,y,z,r,h) {
  const c=[origin[0]+x,origin[1]+y,z];
  add("solid.cylinder",{base:c.map(ex),radius:ex(r),height:ex(h)},f,Math.PI*r*r*h,[c[0]-r,c[1]-r,z],[c[0]+r,c[1]+r,z+h]);
}
function torus(f,x,y,z,major,minor) {
  const c=[origin[0]+x,origin[1]+y,z],r=major+minor;
  add("solid.torus",{center:c.map(ex),major:ex(major),minor:ex(minor)},f,2*Math.PI**2*major*minor*minor,[c[0]-r,c[1]-r,z-minor],[c[0]+r,c[1]+r,z+minor]);
}
function rectangle(w,d) {
  box("stone",0,0,.045,w,d,.09);
  box("soil",0,0,.21,w-.36,d-.36,.2);
  for(const x of [-w/2+.09,w/2-.09])box("rim",x,0,.23,.18,d,.3);
  for(const y of [-d/2+.09,d/2-.09])box("rim",0,y,.23,w-.36,.18,.3);
  for(const x of [-w/2-.006,w/2+.006])for(const y of [-d*.3,d*.3])box("reflector",x,y,.23,.015,.2,.09);
}
function capsule(f,r,length,z,h) {
  box(f,0,0,z+h/2,r*2,length,h);
  cylinder(f,0,-length/2,z,r,h);cylinder(f,0,length/2,z,r,h);
}
const builders=[
  ()=>rectangle(2.4,2.4),
  ()=>rectangle(2.2,4.4),
  ()=>{cylinder("stone",0,0,0,1.5,.32);cylinder("soil",0,0,.28,1.3,.05);torus("rim",0,0,.3,1.4,.1);},
  ()=>{rectangle(1.8,6);for(const y of [-2.95,2.95])box("dark",0,y,.19,1.1,.12,.16);},
  ()=>{capsule("stone",1.1,2.4,0,.32);capsule("soil",.93,2.4,.28,.05);for(const x of [-1.105,1.105])for(const y of [-.7,.7])box("reflector",x,y,.22,.015,.2,.09);},
  ()=>{rectangle(2.4,5.6);box("rim",0,0,.235,2.04,.18,.29);},
];
const items=[];
for(const[i,key]of Object.keys(PLANTING_BED_TYPES).entries()) {
  type=key;origin=[(i%3-1)*7,62+Math.floor(i/3)*8];serial=0;colors={};builders[i]();
  for(const[finish,names]of Object.entries(colors))commands.push({command:"appearance.assign",params:{bodies:names,color:palette[finish],pbr:{roughness:finish==="reflector"?.45:.94,metallic:finish==="reflector"?.25:0,dielectric_ior:1.5}}});
  items.push({type,parts:serial});
}
await mkdir("models/planting-beds",{recursive:true});
const expect={bodies,volume_mm3:volume,tol:.004,bbox:{min,max}};
await writeFile("models/planting-beds/collection.json",JSON.stringify({commands,expect},null,2));
await writeFile("models/planting-beds/manifest.json",JSON.stringify({source:"SolidCraft MCP",items,expect},null,2));
console.log(JSON.stringify({commands:commands.length,expect}));
