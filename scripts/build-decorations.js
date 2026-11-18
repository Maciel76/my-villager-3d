// Generate the reproducible SolidCraft MCP build plan. CAD units: millimetres.
// Each item is laid out on the workbench; the game separates and grounds them.
import { mkdir, writeFile } from "node:fs/promises";
import { DECORATION_TYPES } from "../src/decoration-types.js";

const palette = {
  wood: ["#98633d", .86, 0], lightwood: ["#d6ac70", .82, 0],
  iron: ["#334c49", .5, .65], stone: ["#aaa99a", .94, 0],
  pale: ["#e4dac0", .9, 0], copper: ["#537e75", .53, .55],
  gold: ["#ceaa55", .48, .55], water: ["#3fa5b1", .23, .18],
  leaf: ["#42734d", .96, 0], leaflight: ["#739553", .95, 0],
  pink: ["#e782a3", .8, 0], yellow: ["#f4ca59", .79, 0],
  red: ["#bd5142", .8, 0], blue: ["#4b91ba", .65, .12],
  cream: ["#f7e8c3", .87, 0], soil: ["#493a2c", 1, 0],
  fire: ["#ffb83e", .6, 0], orange: ["#e88135", .85, 0],
};
const stages = [];
const manifest = [];
let commands = [{ command: "parameters.add", params: { name: "decorScale", expression: "1", unit: "" } }];
let volume = 0, count = 0;
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
let type, origin, serial, colors;
const expr = n => `${Number((n * 1000).toFixed(5))} * decorScale`;
const point = p => p.map(expr);
function bounds(lo, hi) {
  for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], lo[i] * 1000); max[i] = Math.max(max[i], hi[i] * 1000); }
}
function shape(command, params, finish, v, lo, hi) {
  const name = `${type}-${finish}-${++serial}`;
  commands.push({ command, params: { ...params, operation: "new", name, body_name: name } });
  (colors[finish] ??= []).push(name);
  volume += v * 1e9; count++;
  bounds(lo, hi);
  return name;
}
function B(f, x, y, z, l, w, h, angle = 0, axis = [0, 0, 1]) {
  const c = [x + origin[0], y + origin[1], z];
  // Boxes may be rotated around local Y (slide) or Z (roof/paddles).
  const a = angle * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  const corners = [];
  for (const dx of [-l/2,l/2]) for (const dy of [-w/2,w/2]) for (const dz of [-h/2,h/2]) {
    const p = axis[1] ? [dx*ca+dz*sa, dy, -dx*sa+dz*ca] : axis[0] ? [dx,dy*ca-dz*sa,dy*sa+dz*ca] : [dx*ca-dy*sa,dx*sa+dy*ca,dz];
    corners.push(p.map((n,i)=>n+c[i]));
  }
  const lo = c.map((_,i)=>Math.min(...corners.map(p=>p[i]))), hi = c.map((_,i)=>Math.max(...corners.map(p=>p[i])));
  const name = shape("solid.box", { center: point(c), length: expr(l), width: expr(w), height: expr(h) }, f, l*w*h, lo, hi);
  if(angle) commands.push({command:"solid.move",params:{bodies:[name],origin:point(c),axis,angle:`${angle} deg`,name:`${name}-rotate`}});
  return name;
}
function C(f,x,y,z,r,h,axis=[0,0,1],rt=r) {
  const base=[x+origin[0],y+origin[1],z], norm=Math.hypot(...axis), d=axis.map(n=>n/norm);
  const end=base.map((n,i)=>n+d[i]*h), radial=d.map(n=>Math.sqrt(Math.max(0,1-n*n)));
  const lo=base.map((n,i)=>Math.min(n-r*radial[i],end[i]-rt*radial[i]));
  const hi=base.map((n,i)=>Math.max(n+r*radial[i],end[i]+rt*radial[i]));
  const params={base:point(base),radius:expr(r),height:expr(h),axis};
  if(rt!==r) params.top_radius=expr(rt);
  return shape(rt===r?"solid.cylinder":"solid.cone",params,f,Math.PI*h*(r*r+r*rt+rt*rt)/3,lo,hi);
}
function R(f,a,b,r) { const d=b.map((n,i)=>n-a[i]); return C(f,...a,r,Math.hypot(...d),d); }
function S(f,x,y,z,r) {
  const c=[x+origin[0],y+origin[1],z];
  return shape("solid.sphere",{center:point(c),radius:expr(r)},f,4*Math.PI*r**3/3,c.map(n=>n-r),c.map(n=>n+r));
}
function T(f,x,y,z,major,minor) {
  const c=[x+origin[0],y+origin[1],z], r=major+minor;
  return shape("solid.torus",{center:point(c),major:expr(major),minor:expr(minor)},f,2*Math.PI**2*major*minor**2,[c[0]-r,c[1]-r,z-minor],[c[0]+r,c[1]+r,z+minor]);
}
function flower(x,y,z,f="pink",s=1) {
  C("leaf",x,y,z,.025*s,.26*s);
  S("leaf",x+.08*s,y,z+.13*s,.1*s);
  for(let i=0;i<5;i++){const a=i*Math.PI*2/5;S(f,x+Math.cos(a)*.09*s,y+Math.sin(a)*.09*s,z+.3*s,.08*s);}
  S("yellow",x,y,z+.34*s,.055*s);
}
function pot(x,y,z,r=.25) { C("red",x,y,z,r*.76,.38,[0,0,1],r); T("lightwood",x,y,z+.36,r,.035); C("soil",x,y,z+.365,r*.89,.025); }
function roof(x,y,z,w,d) {
  const angle=25, pitch=Math.tan(angle*Math.PI/180), half=w/2;
  B("red",x-half/2,y,z+half*pitch/2,half/Math.cos(angle*Math.PI/180)+.13,d,.1,-angle,[0,1,0]);
  B("red",x+half/2,y,z+half*pitch/2,half/Math.cos(angle*Math.PI/180)+.13,d,.1,angle,[0,1,0]);
  R("gold",[x,y-d/2,z+half*pitch+.055],[x,y+d/2,z+half*pitch+.055],.06);
}
const builders = [
  () => { // 01: slatted bench, iron arms and decorative fasteners.
    for(const x of [-.9,.9]) { B("iron",x,0,.25,.12,.64,.5); B("iron",x,.31,.72,.1,.1,.85); B("iron",x,-.04,.69,.11,.64,.08); }
    for(let i=0;i<5;i++)B("wood",0,-.26+i*.13,.51,2.35,.105,.09);
    for(let i=0;i<3;i++) B("lightwood",0,.33,.8+i*.16,2.35,.08,.12);
    for(const x of [-.9,.9])for(const z of [.82,1.12]) S("gold",x,.275,z,.028);
  },
  () => { // 02: cedar planter with corner straps, soil and a mixed bouquet.
    B("wood",0,0,.16,2.15,.78,.22); B("soil",0,0,.55,1.95,.6,.08);
    for(const y of [-.37,.37])for(let i=0;i<3;i++)B("lightwood",0,y,.26+i*.15,2.2,.08,.12);
    for(const x of [-1.06,1.06])B("wood",x,0,.41,.09,.79,.58);
    for(const x of [-.9,.9])for(const y of [-.425,.425])B("iron",x,y,.4,.07,.025,.5);
    for(let i=0;i<7;i++)flower(-.83+i*.275,(i%2-.5)*.2,.59,i%2?"yellow":"pink",.8);
  },
  () => { // 03: two-tier fountain with water, lips and a crown jet.
    C("stone",0,0,0,1.65,.16); C("pale",0,0,.16,1.5,.17); C("water",0,0,.33,1.36,.035);
    T("pale",0,0,.39,1.43,.1); C("stone",0,0,.34,.23,.86,[0,0,1],.16);
    C("pale",0,0,1.08,.38,.22,[0,0,1],.83); T("gold",0,0,1.32,.8,.055); C("water",0,0,1.30,.76,.035);
    C("stone",0,0,1.33,.105,.6); C("pale",0,0,1.86,.19,.13,[0,0,1],.43);
    T("pale",0,0,2,.4,.045); C("water",0,0,1.99,.36,.02); C("water",0,0,2.01,.028,.37); S("water",0,0,2.4,.06);
    for(let i=0;i<8;i++){const a=i*Math.PI/4; C("water",Math.cos(a)*.69,Math.sin(a)*.69,.4,.014,.86);}
  },
  () => { // 04: well, masonry ring, tiled gable, windlass and bucket.
    C("stone",0,0,0,1.07,.13); C("water",0,0,.14,.76,.03); T("pale",0,0,.84,.88,.12);
    for(let row=0;row<3;row++)for(let i=0;i<12;i++) { const a=(i+row%2*.5)*Math.PI/6; B(row%2?"pale":"stone",Math.cos(a)*.87,Math.sin(a)*.87,.25+row*.22,.43,.22,.2,a*180/Math.PI+90); }
    for(const x of [-1.08,1.08])B("wood",x,0,1.16,.16,.18,2.32);
    R("lightwood",[-1.18,0,1.45],[1.18,0,1.45],.09); R("iron",[1.18,0,1.45],[1.18,0,1.14],.04);
    C("lightwood",0,0,.82,.014,.69); C("iron",0,0,.55,.18,.25,[0,0,1],.22); T("gold",0,0,.8,.21,.025);
    roof(0,0,2.25,2.55,2.25);
  },
  () => { // 05: pergola, trellis sides and hanging flowering vines.
    for(const x of [-1.9,1.9])for(const y of [-1.45,1.45]){B("stone",x,y,.09,.36,.36,.18); B("wood",x,y,1.42,.17,.17,2.65);}
    for(const x of [-1.9,1.9])B("wood",x,0,2.76,.2,3.7,.22);
    for(let i=0;i<8;i++)B("lightwood",0,-1.65+i*.47,2.95,4.65,.14,.19);
    for(const x of [-1.9,1.9])for(let i=0;i<5;i++)B("wood",x,-1.1+i*.55,1.05,.06,.06,1.6);
    for(const x of [-1.92,1.92])for(let i=0;i<3;i++)B("lightwood",x,0,.55+i*.4,.075,2.95,.06);
    for(let i=0;i<7;i++) { S(i%2?"leaf":"leaflight",-1.7+i*.55,-1.46,3.05,.28); if(i%2===0) flower(-1.7+i*.55,-1.6,3.08,"pink",.65); }
  },
  () => { // 06: garden pavilion, raised floor, six posts, conical copper roof.
    C("stone",0,0,0,2.22,.14); C("wood",0,0,.14,2.05,.17); C("lightwood",0,0,.31,2.0,.045);
    for(let i=0;i<6;i++){const a=i*Math.PI/3,x=Math.cos(a)*1.85,y=Math.sin(a)*1.85; C("cream",x,y,.34,.09,2.55); C("gold",x,y,.34,.14,.15); if(i!==4) {const b=(i+1)*Math.PI/3; R("wood",[x,y,1.1],[Math.cos(b)*1.85,Math.sin(b)*1.85,1.1],.055);}}
    C("copper",0,0,2.88,2.55,1.25,[0,0,1],.08); T("gold",0,0,2.88,2.46,.05); S("gold",0,0,4.2,.12);
    C("wood",0,0,.35,.12,.65); C("lightwood",0,0,.97,.65,.09);
  },
  () => { // 07: picnic table and benches with dishes and a fruit bowl.
    for(const y of [-.82,.82]){ B("wood",0,y,.49,2.5,.35,.11); for(const x of [-.85,.85])B("iron",x,y,.23,.1,.27,.46); }
    for(const x of [-.82,.82]) { B("wood",x,0,.52,.13,.8,.98); B("wood",x,0,.3,.16,1.9,.1); }
    for(let i=0;i<6;i++)B("lightwood",0,-.4+i*.16,1.03,2.55,.14,.1);
    for(const x of [-.65,.65])C("cream",x,0,1.09,.19,.025);
    C("copper",0,0,1.1,.15,.12,[0,0,1],.24); for(const x of [-.09,.08])S("red",x,0,1.26,.085);
  },
  () => { // 08: A-frame double swing with ropes, seats and foot plates.
    for(const x of [-1.6,1.6])for(const y of [-1.2,1.2]){C("stone",x,y,0,.2,.1);R("copper",[x,y,.1],[x,0,2.6],.07);}
    R("yellow",[-1.75,0,2.6],[1.75,0,2.6],.1);
    for(const x of [-.74,.74]){for(const dx of [-.26,.26])R("iron",[x+dx,0,.65],[x+dx,0,2.55],.018); B("red",x,0,.6,.67,.36,.1);}
  },
  () => { // 09: play tower with ladder, guardrails and inclined slide.
    for(const x of [-.55,.55])for(const y of [.5,1.5]) B("copper",x,y,.9,.09,.09,1.8);
    B("lightwood",0,1,1.8,1.3,1.25,.12);
    for(const x of [-.6,.6]){B("red",x,1,2.15,.075,1.25,.65);R("iron",[x,1.65,.12],[x,1.5,1.8],.045);}
    for(let i=0;i<7;i++)R("yellow",[-.6,1.64-i*.02,.18+i*.24],[.6,1.64-i*.02,.18+i*.24],.035);
    // Incline down from the raised deck toward the front.
    const a=[0,.35,1.82],b=[0,-2,.13],delta=b.map((n,i)=>n-a[i]),len=Math.hypot(...delta),angle=Math.atan2(-delta[2],-delta[1])*180/Math.PI;
    B("yellow",0,-.825,.975,.86,len,.08,angle,[1,0,0]);
    for(const x of [-.48,.48])R("red",[x,.35,1.94],[x,-2,.25],.07);
  },
  () => { // 10: seesaw with hinge, grips and contrasting seats.
    for(const x of [-.24,.24])B("copper",x,0,.32,.15,.7,.64);
    R("gold",[-.45,0,.7],[.45,0,.7],.09);
    B("lightwood",0,0,.76,3.35,.22,.14,6,[0,1,0]);
    for(const sign of [-1,1]){const x=sign*1.35,z=.76-x*Math.sin(Math.PI/30); B(sign<0?"red":"blue",x,0,z+.1,.53,.44,.1); R("iron",[x-sign*.3,0,z+.1],[x-sign*.3,0,z+.52],.035);R("iron",[x-sign*.3,-.16,z+.52],[x-sign*.3,.16,z+.52],.035);}
  },
  () => { // 11: striped market awning, counter, crates and fresh produce.
    for(const x of [-1.35,1.35])for(const y of [-.9,.9])B("wood",x,y,1.25,.095,.095,2.5);
    B("wood",0,-.3,.52,2.75,1.1,.98); for(let i=0;i<10;i++)B("lightwood",-1.25+i*.28,-.87,.53,.22,.05,.88);
    B("lightwood",0,-.3,1.06,2.94,1.3,.12);
    for(let i=0;i<10;i++){ B(i%2?"cream":"red",-1.44+i*.32,0,2.55,.32,2.3,.1); B(i%2?"cream":"red",-1.44+i*.32,-1.12,2.37,.32,.055,.32); }
    for(let i=0;i<3;i++){const x=-.86+i*.86;B("wood",x,-.3,1.16,.72,.65,.15);for(let j=0;j<4;j++)S(i===0?"red":i===1?"orange":"leaflight",x+(j%2-.5)*.27,-.3+(Math.floor(j/2)-.5)*.25,1.34,.13);}
  },
  () => { // 12: stone birdbath and two tiny birds.
    C("stone",0,0,0,.57,.13); C("pale",0,0,.13,.22,.97,[0,0,1],.13);
    C("pale",0,0,1.08,.23,.19,[0,0,1],.69); T("stone",0,0,1.3,.65,.06); C("water",0,0,1.27,.6,.025);
    for(const sign of [-1,1]){S(sign<0?"blue":"yellow",sign*.53,0,1.45,.11);S(sign<0?"blue":"yellow",sign*.53,-.06,1.58,.075);C("orange",sign*.53,-.11,1.58,.035,.1,[0,-1,0],0);}
  },
  () => { // 13: sundial with twelve bronze hour marks.
    B("stone",0,0,.1,1.12,1.12,.2); C("pale",0,0,.2,.34,.88,[0,0,1],.23); C("gold",0,0,1.1,.7,.09); T("copper",0,0,1.2,.65,.025);
    for(let i=0;i<12;i++){const a=i*Math.PI/6; B("iron",Math.cos(a)*.53,Math.sin(a)*.53,1.17,.12,.025,.015,i*30);}
    R("gold",[0,0,1.16],[0,.37,1.68],.035); R("gold",[0,.37,1.68],[0,.44,1.16],.035);
  },
  () => { // 14: ornamental windmill with four radial wooden sails.
    C("stone",0,0,0,.85,.12); C("cream",0,0,.12,.68,2.15,[0,0,1],.4); C("red",0,0,2.27,.69,.65,[0,0,1],0);
    B("wood",0,-.62,.52,.34,.08,.68); S("gold",.08,-.68,.55,.027);
    C("iron",0,-.55,2.05,.14,.28,[0,-1,0]);
    for(let i=0;i<4;i++) {const a=(i*90+35)*Math.PI/180,dx=Math.cos(a),dz=Math.sin(a);R("wood",[0,-.85,2.05],[dx*1.65,-.85,2.05+dz*1.65],.04);for(let j=0;j<5;j++){const t=.62+j*.2;R("lightwood",[dx*t-dz*.2,-.85,2.05+dz*t+dx*.2],[dx*t+dz*.2,-.85,2.05+dz*t-dx*.2],.035);}}
  },
  () => { // 15: wheeled flower cart, handles and flowers in clay pots.
    B("wood",0,0,.63,1.65,.85,.2);for(const y of [-.46,.46])B("lightwood",0,y,.88,1.78,.08,.4);
    for(const x of [-.86,.86])B("lightwood",x,0,.88,.08,.9,.4);
    for(const y of [-.58,.58]){C("iron",.3,y,.38,.35,.1,[0,1,0]);C("gold",.3,y-.015,.38,.12,.13,[0,1,0]);R("wood",[-.65,y,.63],[-1.35,y,.88],.045);}
    for(const x of [-.55,0,.55]){pot(x,0,.75,.2);flower(x,0,1.13,x===0?"yellow":"pink",.85);}
    B("wood",-.7,0,.3,.08,.55,.6);
  },
  () => { // 16: four durable steel bicycle stands.
    B("stone",0,0,.05,3.6,1.35,.1);
    for(let i=0;i<4;i++){const x=-1.35+i*.9; for(const y of [-.43,.43]){C("iron",x,y,.1,.045,.87);C("gold",x,y,.1,.105,.06);}R("copper",[x,-.43,.97],[x,.43,.97],.045);}
  },
  () => { // 17: four recycling bins with hinged lids, slots and handles.
    B("stone",0,0,.05,2.7,1.15,.1);
    for(let i=0;i<4;i++){const x=-.975+i*.65,f=["blue","red","leaf","yellow"][i]; B(f,x,0,.53,.54,.62,.85);B("iron",x,0,.99,.59,.69,.09); B("soil",x,-.352,.77,.3,.025,.11); B("cream",x,-.32,.49,.18,.02,.14);for(const y of [-.22,.22])C("iron",x,y,.13,.07,.06,[1,0,0]);}
  },
  () => { // 18: gently arched timber bridge with segmented handrails.
    for(let i=0;i<17;i++){const y=-2.45+i*.30625,z=.12+.48*Math.sin((i/16)*Math.PI);B("lightwood",0,y,z,2.05,.285,.12);}
    for(const x of [-1.02,1.02]){ for(let i=0;i<5;i++){const y=-2.4+i*1.2,z=.12+.48*Math.sin(i*Math.PI/4); B("wood",x,y,z+.43,.11,.11,.95);if(i<4){const ny=y+1.2,nz=.12+.48*Math.sin((i+1)*Math.PI/4); R("wood",[x,y,z+.95],[x,ny,nz+.95],.06); R("wood",[x,y,z+.47],[x,ny,nz+.47],.04);}} }
  },
  () => { // 19: stone fire ring, stacked logs, warm coals and four seats.
    C("soil",0,0,0,.8,.06); for(let i=0;i<12;i++){const a=i*Math.PI/6;S("stone",Math.cos(a)*.72,Math.sin(a)*.72,.17,.19);}
    for(const y of [-.2,.2])R("wood",[-.5,y,.18],[.5,y,.18],.1); for(const x of [-.22,.22])R("wood",[x,-.43,.33],[x,.43,.33],.09);
    for(let i=0;i<5;i++){const a=i*Math.PI*2/5;C(i%2?"fire":"orange",Math.cos(a)*.19,Math.sin(a)*.19,.34,.13,.42+i%2*.16,[0,0,1],0);}
    for(let i=0;i<4;i++){const a=i*Math.PI/2;C("wood",Math.cos(a)*1.65,Math.sin(a)*1.65,0,.3,.42);C("lightwood",Math.cos(a)*1.65,Math.sin(a)*1.65,.42,.31,.06);}
  },
  () => { // 20: framed welcome board, engraved-style leaf motif and flowers.
    for(const x of [-.83,.83]) {B("stone",x,0,.08,.28,.3,.16); B("wood",x,0,1.15,.13,.14,2.3);S("gold",x,0,2.35,.09);}
    B("wood",0,0,1.79,2.25,.18,.88);B("lightwood",0,-.105,1.79,2.07,.035,.69);
    // Three gold lines and a tree crest; the game adds readable lettering.
    for(const x of [-.9,.9])B("gold",x,-.13,1.79,.025,.025,.53);
    R("copper",[-.7,-.15,1.6],[-.7,-.15,1.96],.02);for(const x of [-.82,-.58])S("leaf",x,-.16,1.96,.1);
    for(const x of [-.85,.85]){pot(x,-.22,.15,.25);flower(x,-.22,.53,"yellow",.8);}
  },
];

for (const [index, key] of Object.keys(DECORATION_TYPES).entries()) {
  type=key; origin=[(index%5-2)*8,(Math.floor(index/5)-1.5)*8]; serial=0; colors={};
  builders[index]();
  for(const [finish,bodies] of Object.entries(colors)){const [color,roughness,metallic]=palette[finish];commands.push({command:"appearance.assign",params:{bodies,color,pbr:{roughness,metallic,dielectric_ior:1.5}}});}
  manifest.push({type,parts:serial,origin_mm:origin.map(n=>n*1000)});
  if(index%5===4){stages.push({commands,expect:{bodies:count,volume_mm3:volume,tol:.004,bbox:{min:[...min],max:[...max]}}});commands=[];}
}
await mkdir("models/decorations",{recursive:true});
for(const [index,stage]of stages.entries())await writeFile(`models/decorations/stage-${index+1}.json`,JSON.stringify(stage,null,2));
await writeFile("models/decorations/collection.json", JSON.stringify({commands:stages.flatMap(stage=>stage.commands)},null,2));
await writeFile("models/decorations/manifest.json",JSON.stringify({units:"mm",source:"SolidCraft MCP",items:manifest},null,2));
console.log(JSON.stringify(stages.map((s,i)=>({stage:i+1,commands:s.commands.length,expect:s.expect})),null,2));
