// Reproducible SolidCraft MCP commands. Coordinates below are metres; CAD is mm/Z up.
import { mkdir, writeFile } from "node:fs/promises";
import { TREE_TYPES } from "../src/tree-types.js";

const palette = {
  trunk: "#785137", bark: "#ac8354", dark: "#244e39", leaf: "#42744a", lime: "#75944f",
  gold: "#edc347", amber: "#eaa534", purple: "#9858ad", lilac: "#c383cb",
  pink: "#e9a7bb", blush: "#f6cfce", red: "#bb563a", orange: "#d68139",
  apple: "#c74037", fruit: "#ee9c31", palm: "#527d42", pale: "#9ab362",
};
const stages = [], manifest = [];
let commands = [{command:"parameters.add",params:{name:"treeScale",expression:"1",unit:""}}];
let type, origin, serial, paints, totalVolume = 0, bodyCount = 0;
const min = [Infinity,Infinity,Infinity], max = [-Infinity,-Infinity,-Infinity];
const ex = n => `${Number((n*1000).toFixed(5))} * treeScale`;
const point = p => p.map(ex);
function add(command, params, finish, volume, lo, hi) {
  const name = `${type}-${finish}-${++serial}`;
  commands.push({command,params:{...params,operation:"new",name,body_name:name}});
  (paints[finish]??=[]).push(name); bodyCount++; totalVolume += volume*1e9;
  for(let i=0;i<3;i++){min[i]=Math.min(min[i],lo[i]*1000);max[i]=Math.max(max[i],hi[i]*1000);}
  return name;
}
function rod(f,a,b,r,top=r) {
  const base=[a[0]+origin[0],a[1]+origin[1],a[2]], d=b.map((n,i)=>n-a[i]),h=Math.hypot(...d),axis=d.map(n=>n/h);
  const end=base.map((n,i)=>n+d[i]),radial=axis.map(n=>Math.sqrt(Math.max(0,1-n*n)));
  const lo=base.map((n,i)=>Math.min(n-r*radial[i],end[i]-top*radial[i]));
  const hi=base.map((n,i)=>Math.max(n+r*radial[i],end[i]+top*radial[i]));
  return add(top===r?"solid.cylinder":"solid.cone",{base:point(base),radius:ex(r),top_radius:ex(top),height:ex(h),axis},f,Math.PI*h*(r*r+r*top+top*top)/3,lo,hi);
}
function ellipsoid(f,x,y,z,rx,ry,rz,yaw=0) {
  const c=[x+origin[0],y+origin[1],z],a=yaw*Math.PI/180;
  const dx=Math.hypot(rx*Math.cos(a),ry*Math.sin(a)),dy=Math.hypot(rx*Math.sin(a),ry*Math.cos(a));
  const name=add("solid.sphere",{center:[0,0,0],radius:ex(1)},f,4*Math.PI*rx*ry*rz/3,[c[0]-dx,c[1]-dy,z-rz],[c[0]+dx,c[1]+dy,z+rz]);
  commands.push({command:"solid.scale",params:{bodies:[name],factors:[rx,ry,rz],origin:[0,0,0],name:`${name}-form`}});
  commands.push({command:"solid.move",params:{bodies:[name],translate:point(c),axis:[0,0,1],angle:`${yaw} deg`,name:`${name}-position`}});
  return name;
}
function trunk(height=3,r=.22) {
  rod("trunk",[0,0,0],[.09,0,height],r,r*.6);
  for(let i=0;i<5;i++){const a=i*Math.PI*2/5;rod("trunk",[0,0,.36],[Math.cos(a)*r*2.3,Math.sin(a)*r*2.3,.06],r*.4,.015);}
}
function crown(finishes,z=4.1,width=1.25,spread=1.1,n=7) {
  for(let i=0;i<n;i++) {
    const a=i*Math.PI*2/n,x=Math.cos(a)*spread,y=Math.sin(a)*spread,h=z+(i%3)*.27;
    rod("trunk",[.05,0,z-1.65],[x,y,h-.22],.085,.028);
    ellipsoid(finishes[i%finishes.length],x,y,h,width*(1+(i%2)*.08),width*.9,width*.86,i*33);
  }
  ellipsoid(finishes[0],0,0,z+.75,width*1.1,width,width*.9);
}
function blossom(f1,f2) {
  trunk(3.4,.18);crown([f1,f2,f1],4.1,1.12,1.05,6);
  for(let i=0;i<9;i++){const a=i*2.399;ellipsoid(i%2?f1:f2,Math.cos(a)*1.9,Math.sin(a)*1.65,4.0+(i%3)*.32,.3,.27,.27);}
}
const builders = [
  ()=>{trunk(3.8,.25);crown(["leaf","dark","lime"],4.65,1.5,1.25,7);},
  ()=>{trunk(3.3,.19);crown(["red","orange","amber"],4.1,1.3,1.05,7);},
  ()=>blossom("gold","amber"),
  ()=>blossom("purple","lilac"),
  ()=>{trunk(2.6,.17);crown(["pink","blush"],3.5,1.2,1.05,7);for(let i=0;i<7;i++){const a=i*2.399;ellipsoid("blush",Math.cos(a)*1.8,Math.sin(a)*1.65,3.5,.3,.25,.22);}},
  ()=>{trunk(5.1,.2);for(let i=0;i<5;i++){const z=1.25+i*.95,r=2.05-i*.32;rod(i%2?"leaf":"dark",[0,0,z],[0,0,z+2.1],r,.045);}},
  ()=>{trunk(6.5,.21);for(let tier=0;tier<3;tier++){const h=4.25+tier*.95,r=2.4-tier*.55;for(let i=0;i<6;i++){const a=(i+tier*.35)*Math.PI/3,x=Math.cos(a)*r,y=Math.sin(a)*r;rod("trunk",[0,0,h-.7],[x,y,h],.065,.022);ellipsoid(tier%2?"leaf":"dark",x,y,h+.13,.7,.55,.36,i*60);}}ellipsoid("lime",0,0,6.65,.8,.8,.4);},
  ()=>{trunk(2.4,.14);for(let i=0;i<4;i++)ellipsoid(i%2?"leaf":"dark",0,0,2.4+i*.9,.75-i*.1,.68-i*.08,1.45);rod("dark",[0,0,5.4],[0,0,6.7],.39,.015);},
  ()=>{ // Ringed trunk with radial, flattened fronds and coconuts.
    for(let i=0;i<10;i++){const z=i*.46,x=Math.sin(i*.11)*.33;rod(i%2?"bark":"trunk",[x,0,z],[Math.sin((i+1)*.11)*.33,0,z+.49],.19-i*.004,.18-i*.004);}
    for(let i=0;i<9;i++){const a=i*2*Math.PI/9,x=Math.cos(a),y=Math.sin(a);rod("palm",[.3,0,4.65],[.3+x*2.65,y*2.65,4.2],.045,.012);ellipsoid(i%2?"palm":"leaf",.3+x*1.45,y*1.45,4.56,1.4,.26,.12,i*40);ellipsoid("pale",.3+x*2.4,y*2.4,4.25,.45,.14,.1,i*40);}
    for(let i=0;i<3;i++)ellipsoid("trunk",.3+Math.cos(i*2.1)*.28,Math.sin(i*2.1)*.28,4.4,.17,.16,.19);
  },
  ()=>{trunk(2.5,.16);crown(["leaf","lime"],3.25,1.05,.82,6);for(let i=0;i<13;i++){const a=i*2.399;ellipsoid("apple",Math.cos(a)*1.5,Math.sin(a)*1.45,3.0+(i%4)*.29,.13,.13,.14);}},
  ()=>{trunk(2.25,.16);crown(["dark","leaf"],3.0,1.12,.8,6);for(let i=0;i<15;i++){const a=i*2.399;ellipsoid("fruit",Math.cos(a)*1.6,Math.sin(a)*1.45,2.85+(i%4)*.28,.13,.13,.13);}},
  ()=>{trunk(3.5,.22);crown(["leaf","lime"],4.3,1.35,1.05,7);for(let i=0;i<14;i++){const a=i*Math.PI/7,x=Math.cos(a)*2.0,y=Math.sin(a)*2.0;ellipsoid(i%2?"lime":"pale",x,y,3.0+(i%3)*.16,.32,.34,1.28,i*26);}},
];

for(const [i,key] of Object.keys(TREE_TYPES).entries()) {
  type=key;origin=[(i%4-1.5)*10,28+Math.floor(i/4)*10];serial=0;paints={};
  builders[i]();
  for(const[finish,bodies]of Object.entries(paints))commands.push({command:"appearance.assign",params:{bodies,color:palette[finish],pbr:{metallic:0,roughness:finish==="trunk"?.95:.88,dielectric_ior:1.5}}});
  manifest.push({type,parts:serial,origin_mm:origin.map(n=>n*1000)});
  if(i%4===3){stages.push({commands,expect:{bodies:bodyCount,volume_mm3:totalVolume,tol:.004,bbox:{min:[...min],max:[...max]}}});commands=[];}
}
await mkdir("models/trees",{recursive:true});
for(const[i,stage]of stages.entries())await writeFile(`models/trees/stage-${i+1}.json`,JSON.stringify(stage,null,2));
await writeFile("models/trees/collection.json",JSON.stringify({commands:stages.flatMap(s=>s.commands)},null,2));
await writeFile("models/trees/manifest.json",JSON.stringify({units:"mm",source:"SolidCraft MCP",items:manifest},null,2));
console.log(JSON.stringify(stages.map((s,i)=>({stage:i+1,commands:s.commands.length,expect:s.expect})),null,2));
