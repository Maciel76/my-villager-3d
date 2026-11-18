import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { projectTexture } from "./assets.js";
import { markNightLight } from "./daylight.js";
import { addLampEmitter } from "./night-lights.js";

const paint = (color, roughness = 0.85) =>
  new THREE.MeshStandardMaterial({ color, roughness });
const boxShape = new THREE.BoxGeometry().toNonIndexed();
const rockShape = new THREE.IcosahedronGeometry(1, 0);
const crownShape = new THREE.IcosahedronGeometry(1, 1);
const postShape = new THREE.CylinderGeometry(1, 1, 1, 8).toNonIndexed();
const potShape = new THREE.LatheGeometry(
  [[0, 0], [.54, 0], [.8, .22], [1, .62], [.86, .85], [.49, .94], [.54, 1],
    [.37, 1], [.35, .87], [0, .75]].map(([x, y]) => new THREE.Vector2(x, y)),
  14,
).toNonIndexed();
const vertical = new THREE.Vector3(0, 1, 0);

function makeBuilder(parent) {
  const batches = new Map();
  function insert(geometry, material) {
    if (material.map) projectTexture(geometry);
    if (!batches.has(material)) batches.set(material, []);
    batches.get(material).push(geometry);
  }
  function part(shape, material, scale, point, yaw = 0) {
    insert(shape.clone().scale(...scale).rotateY(yaw).translate(...point), material);
  }
  function beam(material, from, to, width, depth = width, shape = boxShape) {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const direction = end.clone().sub(start);
    const length = direction.length();
    const rotation = new THREE.Quaternion().setFromUnitVectors(vertical, direction.normalize());
    insert(
      shape.clone().scale(width, length, depth).applyQuaternion(rotation)
        .translate(...start.lerp(end, .5).toArray()),
      material,
    );
  }
  function tube(material, points, radius, sides = 5) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    const source = new THREE.TubeGeometry(curve, Math.max(4, points.length * 2), radius, sides);
    insert(source.toNonIndexed(), material);
    source.dispose();
  }
  function finish() {
    for (const [material, geometries] of batches) {
      const geometry = mergeGeometries(geometries);
      for (const part of geometries) part.dispose();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
    }
  }
  return {
    part, beam, tube, finish,
    box: (material, w, h, d, x, y, z, yaw = 0) =>
      part(boxShape, material, [w, h, d], [x, y, z], yaw),
    rock: (material, scale, center, yaw = 0) =>
      part(rockShape, material, scale, center, yaw),
    crown: (material, scale, center, yaw = 0) =>
      part(crownShape, material, scale, center, yaw),
  };
}

function addRoofTiles(model, tile) {
  const roof = makeBuilder(model);
  const tileColors = ["#34465c", "#3b4d63", "#2b394d"].map((color) => paint(color));
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const target = new THREE.Vector3();

  function panel(id, eaveLeft, eaveRight, ridgeLeft, ridgeRight, spacing) {
    const mesh = model.children.find((child) => child.name === `oriental-graphite-${id}`);
    if (!mesh) return;
    const length = Math.hypot(eaveLeft[0] - eaveRight[0], eaveLeft[1] - eaveRight[1]);
    const count = Math.round(length / spacing);
    const xy = (a, b, t) => a.map((value, i) => THREE.MathUtils.lerp(value, b[i], t));
    for (let i = 0; i < count; i++) {
      const across = (i + .5) / count;
      const base = xy(eaveLeft, eaveRight, across);
      const tip = xy(ridgeLeft, ridgeRight, across);
      const points = [];
      for (let j = 0; j <= 9; j++) {
        const [x, z] = xy(base, tip, j / 9);
        target.set(x, 13, z);
        ray.set(target, down);
        const hit = ray.intersectObject(mesh, false)[0];
        if (hit) points.push([x, hit.point.y + .019, z]);
      }
      if (points.length > 1)
        roof.tube(tileColors[i % tileColors.length], points, Math.min(spacing * .29, .071));
    }
  }

  function gable(id, width, near, far, ridge, spacing) {
    const half = width / 2 - .022;
    for (const z of [near, far])
      panel(id, [-half, z], [half, z], [-half, ridge], [half, ridge], spacing);
  }
  function hip(id, cx, cz, w, d, ridgeW, ridgeD, spacing) {
    for (const side of [-1, 1]) {
      panel(id, [cx-w, cz+side*d], [cx+w, cz+side*d],
        [cx-ridgeW, cz+side*ridgeD], [cx+ridgeW, cz+side*ridgeD], spacing);
      panel(id, [cx+side*w, cz-d], [cx+side*w, cz+d],
        [cx+side*ridgeW, cz-ridgeD], [cx+side*ridgeW, cz+ridgeD], spacing);
    }
  }
  model.updateMatrixWorld(true);
  hip("telhado-baixo", 0, -4.45, 5.75, 4.82, 3.38, 2.50, .225);
  hip("pagode-telhado", 7.97, -5.58, 2.12, 2.12, .22, .22, .215);
  gable("telhado-superior", 8.24, -7.83, -1.47, -4.65, .19);
  gable("portao-telhado", 5.46, 9.60, 11.52, 10.56, .17);

  for (const side of [-1, 1]) {
    panel("telhado-do-frontao", [side*2.77,-2.45], [side*2.77,1.34],
      [0,-2.45], [0,1.34], .175);
    const ends = side === 1 ? [2.34, 11.35] : [-11.35, -2.34];
    for (const z of [10.13, 10.99])
      panel(`muro-telhas-${side}`, [ends[0],z], [ends[1],z],
        [ends[0],10.56], [ends[1],10.56], .19);
  }
  roof.box(tile, 5.55, .12, .18, 0, 3.47, 10.56);
  roof.box(tile, .18, .14, 3.92, 0, 4.52, -.56);
  roof.finish();
}

function compactCadMeshes(model, cadMeshes) {
  const batches = new Map();
  for (const mesh of cadMeshes) {
    if (mesh.userData.groundCover) continue;
    mesh.geometry.computeBoundingBox();
    const { min, max } = mesh.geometry.boundingBox;
    const height = (min.y + max.y) / 2;
    const stage = height < .6 ? "base" : height < 4 ? "walls" : "roof";
    const key = `${mesh.material.id}-${stage}`;
    if (!batches.has(key)) batches.set(key, { material: mesh.material, meshes: [] });
    batches.get(key).meshes.push(mesh);
  }
  for (const { material, meshes } of batches.values()) {
    if (meshes.length < 2) continue;
    const parts = meshes.map(({ geometry }) => geometry.index ? geometry.toNonIndexed() : geometry);
    const mesh = new THREE.Mesh(mergeGeometries(parts), material);
    mesh.castShadow = mesh.receiveShadow = true;
    model.remove(...meshes).add(mesh);
    parts.forEach((geometry, index) => {
      if (geometry !== meshes[index].geometry) geometry.dispose();
      meshes[index].geometry.dispose();
    });
  }
}

export function addOrientalGarden(model, materials) {
  const { cedar: wood, vermilion: red, stone, fieldstone, ink, roofEdge: tile } = materials;
  const paper = markNightLight(paint("#ffd08a"), 1.85);
  const sandLine = paint("#b39d78");
  const path = [paint("#b5a08a"), paint("#c4b4a0"), paint("#d4c4ae"), stone];
  const leaves = ["#315b34", "#527745", "#648847", "#87a45a"].map((color) => paint(color));
  const blossoms = ["#aa405d", "#d35b7d", "#ec81a0", "#f7a6ba", "#ffd0d4"].map((color) => paint(color));
  const stem = paint("#545333");
  const bambooGreen = paint("#72813c");
  const bark = paint("#5d4131");
  const amber = paint("#c89653");
  const ceramic = paint("#8e5d44", .52);
  const jade = paint("#40895d", .54);
  const foam = paint("#a3e9dc", .46);
  const waterLine = paint("#59bdad", .46);
  const lily = paint("#397343", .66);
  const koiIvory = paint("#eac595", .45);
  const koiOrange = paint("#db683e", .47);
  const plaster = paint("#d3bfa4");
  let seed = 74997;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const cadMeshes = [...model.children];
  addRoofTiles(model, tile);
  compactCadMeshes(model, cadMeshes);
  const house = makeBuilder(model);
  function lattice(builder, x, y, z, width, height, yaw = 0, circle = false) {
    function bar(u, v, w, h) {
      builder.box(wood, w, h, .043, x+u*Math.cos(yaw), y+v, z-u*Math.sin(yaw), yaw);
    }
    for (const ratio of [-.62, -.31, 0, .31, .62]) {
      const curve = circle ? Math.sqrt(1-ratio**2) : 1;
      bar(width * ratio / 2, 0, .046, height * curve);
    }
    for (const ratio of [-.56, 0, .56]) {
      const curve = circle ? Math.sqrt(1-ratio**2) : 1;
      bar(0, height * ratio / 2, width * curve, .048);
    }
  }
  lattice(house, 0, 1.77, .837, 1.61, 1.61, 0, true);
  for (const x of [-3.38, 3.38]) {
    lattice(house, x, 1.87, -.314, 2.05, 1.55);
    lattice(house, x, 1.86, -8.60, 1.59, 1.45);
    house.box(wood, 2.68, .67, .13, x, .755, -.384);
    for (let slat = -5; slat <= 5; slat++)
      house.box(red, .04, .60, .051, x+slat*.226, .755, -.289);
  }
  for (const z of [-2.22, -6.25]) lattice(house, 5.184, 1.87, z, 1.75, 1.4, Math.PI/2);
  lattice(house, -5.184, 1.87, -5.5, 1.75, 1.4, Math.PI/2);
  for (const x of [-1.78,1.78]) {
    lattice(house, x, 5.165, -1.788, 2.64, .69);
    lattice(house, x, 5.165, -7.512, 2.64, .69);
  }
  for (const x of [-3.567,3.567]) lattice(house, x, 5.18, -4.65, 2.54, .65, Math.PI/2);
  for (const x of [-1.81,1.81]) {
    house.beam(wood, [0,4.37,1.293], [x,3.30,1.293], .118);
    house.beam(wood, [x*.57,3.43,1.293], [0,4.31,1.293], .093);
  }
  house.box(red, 4.10, .162, .21, 0, 3.24, .83);
  house.box(wood, .135, .94, .16, 0, 3.83, 1.291);
  for (const z of [-7.61,-1.66]) {
    for (let i=-6; i<=6; i++) house.box(red, .135, .212, .285, i*.51, 5.705, z);
  }
  for (const x of [-4.27, 4.27]) {
    house.crown(tile, [.136,.145,.128], [x,7.321,-4.65]);
    for (const z of [-7.81,-1.5])
      house.crown(tile, [.112,.137,.105], [x,6.10,z]);
  }

  function lantern(builder, x, y, z, scale = 1, stand = false) {
    addLampEmitter(model, [x, y, z], {
      color: "#ffb678", intensity: 24 * scale, range: 6.6, halo: 1.9 * scale,
    });
    if (stand) {
      builder.box(stone, .43*scale, .13, .43*scale, x, .225, z);
      builder.beam(ink, [x,.29,z], [x,y-.25*scale,z], .083*scale);
    } else {
      builder.box(ink, .043, .195*scale, .043, x, y+.422*scale, z);
    }
    builder.box(paper, .30*scale, .47*scale, .30*scale, x, y, z);
    for (const h of [-.24,.25])
      builder.box(ink, .39*scale, .086*scale, .39*scale, x, y+h*scale, z);
    for (const dx of [-.15,.15]) for (const dz of [-.15,.15])
      builder.box(ink, .032*scale, .44*scale, .032*scale, x+dx*scale, y, z+dz*scale);
    builder.rock(tile, [.32*scale,.135*scale,.32*scale], [x,y+.285*scale,z], Math.PI/4);
  }
  for (const x of [-2.17,2.17]) lantern(house,x,2.61,.78,.87);
  for (const [x, z] of [[-3.93, 4.4], [9.27, 7.66], [10.2, -3.41], [-9.93, -1.25]]) {
    addLampEmitter(model, [x, 1.09, z], {
      color: "#ffb881", intensity: 8, range: 4.7, halo: 1.4,
    });
  }
  house.finish();

  const garden = makeBuilder(model);
  const textureRock = (x, y, z, scale, rotation) =>
    garden.rock(fieldstone, scale, [x, y, z], rotation);
  function shrub(x, z, scale = 1, flowers = false) {
    for (let i = 0; i < 8; i++) {
      const a = i * 2.4;
      const r = scale * (.07 + .48 * random());
      const px = x + r*Math.cos(a), pz = z + r*Math.sin(a);
      const py = .25 + scale*(.15+random()*.20);
      garden.crown(leaves[i % leaves.length], [scale*.39,scale*.32,scale*.35], [px,py,pz], a);
      if (flowers && i % 2 === 0)
        garden.crown(blossoms[i % blossoms.length], [.11,.077,.11], [px,py+scale*.29,pz], a);
    }
  }
  function tuft(x, z, size = 1) {
    for (let i=0; i<9; i++) {
      const a = i*2.4 + random()*.25;
      const reach = (.20 + random()*.16)*size;
      garden.beam(leaves[i%leaves.length], [x,.19,z],
        [x+Math.cos(a)*reach, .21+size*(.33+random()*.22),z+Math.sin(a)*reach], .047*size, .02*size);
    }
  }
  function tree(x, z, scale = 1, cherry = true) {
    const trunk = [
      [x,.15,z], [x-.28*scale,.85*scale,z+.12*scale],
      [x+.10*scale,2.1*scale,z], [x+.28*scale,3.16*scale,z-.15*scale],
    ];
    for (let i=1; i<trunk.length; i++)
      garden.beam(bark, trunk[i-1], trunk[i], (.157-i*.032)*scale, undefined, postShape);
    for (let b=0; b<7; b++) {
      const a = b*2.399 + .3;
      const reach = (.88 + random()*.71)*scale;
      const start = trunk[b%2+1];
      const px = x+Math.cos(a)*reach, pz=z+Math.sin(a)*reach;
      const py = (cherry ? 2.81 + random()*.95 : 1.78+b*.235)*scale;
      const end = [px,py,pz];
      garden.beam(bark, start, end, .052*scale, undefined, postShape);
      for (let i=0; i<7; i++) {
        const radius = (.30+random()*.41)*scale;
        const dx = (random()-.5)*1.22*scale, dz=(random()-.5)*1.09*scale;
        const dy = (random()-.26)*.71*scale;
        const palette = cherry ? blossoms : leaves;
        garden.crown(palette[(b+i)%palette.length], [radius,radius*(cherry?.72:.44),radius*.84],
          [px+dx,py+dy,pz+dz], a);
      }
    }
  }
  function paving(x, z, w = .79, d = .56) {
    garden.box(path[Math.floor(random()*path.length)],w,.068,d,x,.198+random()*.012,z,(random()-.5)*.035);
  }
  for (let i=0; i<18; i++) for (const x of [-.93,0,.93])
    paving(x,1.4+i*.585,.89,.563);
  for (let i=0; i<6; i++) paving(-5.24-i*.59,-2.15,.572,.84);
  for (let i=0; i<8; i++) paving(5.0+i*.57,-2.20,.55,.85);
  for (let i=0; i<6; i++) paving(4.44+i*.58,8.74,.56,.74);
  for (const x of [-2.36,2.36]) {
    lantern(garden,x,1.31,8.36,.9,true);
    lantern(garden,x,2.14,10.87,.8);
    lantern(garden,x*.74,2.21,7.1,.75);
  }
  for (const x of [-6.22,6.22]) lattice(garden,x,1.07,10.825,.81,.81,0,true);

  // Gate leaves, metal fittings and a short railing alongside the paths.
  for (const sign of [-1,1]) {
    for(let i=0;i<9;i++){
      const dx=.115+i*.221, x=sign*dx;
      const top=2.35-.158*dx;
      garden.box(i%3 ? wood : amber,.059,top-.40,.044,x,(top+.40)/2,10.63);
    }
    garden.box(ink,.15,.22,.053,sign*.18,1.30,10.67);
    garden.box(wood,1.83,.12,.052,sign*.99,.60,10.638);
    garden.box(amber,.18,.086,.067,sign*.19,1.31,10.704);
    for (const y of [.59,.97]) garden.box(red,.14,.115,5.49,sign*11.08,y,5.64);
    for (let i=0;i<12;i++)
      garden.box(red,.14,i%3===0?1.06:.86,.135,sign*11.08,.67,2.98+i*.473);
  }

  // Raked sand, boulders, bonsai and bamboo.
  for (let ring=0; ring<10; ring++) {
    const radius=.34+ring*.265;
    const line=Array.from({length:29},(_,i)=>{
      const a=.10+Math.PI*1.87*i/28;
      return [-7.7+Math.cos(a)*radius,.211,1.98+Math.sin(a)*radius*.92];
    });
    garden.tube(sandLine,line,.011,4);
  }
  for (const [x,z,r] of [[-7.54,1.91,.86],[-6.94,2.14,.50],[-8.21,1.69,.42],[-5.21,3.35,.55]]) {
    textureRock(x,.27+r*.33,z,[r*.76,r*.94,r*.64],random()*6);
  }
  tree(-8.83,.05,.58,false);
  for (let i=0;i<12;i++){
    const x=-10.31+random()*1.47,z=-1.24+random()*1.25,h=1.87+random()*1.45;
    const tx=x+(random()-.52)*.48,tz=z+(random()-.5)*.46;
    garden.beam(bambooGreen,[x,.16,z],[tx,h,tz],.058,undefined,postShape);
    for(let j=1;j<=5;j++){
      const t=j/6;
      const joint=[THREE.MathUtils.lerp(x,tx,t),THREE.MathUtils.lerp(.16,h,t),THREE.MathUtils.lerp(z,tz,t)];
      garden.box(stem,.13,.037,.13,...joint);
      if(j>=3)for(const s of [-1,1]){
        const tip=[joint[0]+s*(.28+random()*.30),joint[1]+.16,joint[2]+(random()-.5)*.6];
        garden.beam(leaves[j%leaves.length],joint,tip,.052,.025);
      }
    }
  }

  // Rock-lined lagoon, spillway, koi and lotus.
  const lake = { x: 6.90, z: 4.95, rx: 3.69, rz: 3.14 };
  for (let i=0;i<39;i++){
    const a=2*Math.PI*i/39;
    const x=lake.x+Math.cos(a)*lake.rx, z=lake.z+Math.sin(a)*lake.rz;
    const r=.27+random()*.26;
    if (x>3.04 && x<4.78 && (z<3.72 || z>6.2)) continue;
    textureRock(x,.23+r*.19,z,[r*1.25,r*.75,r],a);
    if(i%3===0) tuft(x+.13,z+.23,.59+random()*.32);
  }
  for (const [x,z,r,h] of [[7.8,2.18,.69,.92],[8.45,2.36,.53,.64],[7.10,2.25,.58,.66],[8.28,2.70,.44,.41],[7.28,2.66,.40,.32]]) {
    textureRock(x,h*.51+.18,z,[r,h*.80,r*.78],random()*6);
  }
  for (let i=0;i<9;i++){
    const x=7.49+i*.068;
    garden.tube(i%3 ? foam : waterLine, [[x,1.055,2.29],[x,1.005,2.58],[x,.77,2.75],[x,.37,2.97],[x,.219,3.15]],.028);
  }
  for (let i=0;i<16;i++){
    const a=random()*Math.PI*2;
    const r=.22+random()*.82;
    garden.rock(i%3?waterLine:foam,[.18,.016,.032],[7.7+Math.cos(a)*r,.213,3.15+Math.sin(a)*r*.49],a);
  }
  for (const [x, z, radius, angle] of [[6.24,4.08,.36,.8],[6.82,5.14,.31,2.4],[8.81,4.02,.42,3.3]]) {
    const ripple = Array.from({ length: 9 }, (_, i) => {
      const a = angle + i * .16;
      return [x + Math.cos(a) * radius, .207, z + Math.sin(a) * radius * .73];
    });
    garden.tube(waterLine, ripple, .009, 4);
  }
  for (const [x,z,yaw] of [[6.03,5.44,.4],[6.95,6.36,2.2],[8.35,5.71,-.7],[8.96,4.71,-1.6],[5.3,4.84,1.1]]){
    const local=(u,v,y)=>[x+u*Math.cos(yaw)+v*Math.sin(yaw),y,z-u*Math.sin(yaw)+v*Math.cos(yaw)];
    garden.crown(koiIvory,[.126,.053,.30],local(0,0,.207),yaw);
    garden.rock(koiIvory,[.14,.031,.108],local(0,-.289,.214),yaw+Math.PI/4);
    garden.crown(koiOrange,[.100,.036,.087],local(0,.09,.233),yaw);
    garden.crown(koiOrange,[.081,.024,.074],local(.021,-.129,.232),yaw);
    for (const dx of [-.11,.11])
      garden.rock(koiOrange,[.057,.024,.095],local(dx,-.038,.223),yaw+dx*4);
  }
  for (const [x,z,r] of [[8.63,6.65,.42],[9.23,6.35,.31],[7.82,6.92,.34],[9.48,5.73,.28],[5.16,3.45,.26]]){
    garden.crown(lily,[r,.031,r*.79],[x,.208,z],random()*6);
    if(r<.29)continue;
    for (let i=0;i<9;i++){
      const a=i*2*Math.PI/9;
      garden.crown(blossoms[i%3+2],[.076,.063,.144],[x+Math.sin(a)*.095,.282,z+Math.cos(a)*.095],a);
    }
    garden.crown(amber,[.085,.058,.085],[x,.296,z]);
  }
  const bridgeY = (z) => .31+.72*Math.sin(Math.PI*(z-2.35)/5.78);
  for (let i=0;i<26;i++){
    const z=2.43+i*.224;
    garden.box(i%4 ? wood : amber,1.57,.047,.207,3.875,bridgeY(z)+.019,z);
  }
  for (const x of [3.13,4.62]){
    for (let i=0;i<7;i++){
      const z=2.38+i*.949;
      garden.box(red,.108,.67,.11,x,bridgeY(z)+.30,z);
      garden.box(wood,.152,.061,.152,x,bridgeY(z)+.646,z);
    }
    for (const offset of [.23,.58]){
      const points=Array.from({length:17},(_,i)=>{
        const z=2.38+i*.356;
        return [x,bridgeY(z)+offset,z];
      });
      garden.tube(red,points,.057);
    }
  }

  // Pergola furniture and pavilion stairs, lanterns and little fountain.
  const bench = (x,z) => {
    for (const dx of [-.83,.83]){
      garden.box(ink,.11,.43,.51,x+dx,.594,z);
      garden.box(wood,.104,.87,.095,x+dx,.825,z-.27);
    }
    for (const dz of [-.20,0,.20]) garden.box(wood,1.96,.086,.18,x,.83,z+dz);
    for (const y of [1.03,1.2]) garden.box(wood,1.96,.128,.077,x,y,z-.264);
    for (const dx of [-.48,.48]) garden.box(plaster,.78,.142,.39,x+dx,.925,z);
  };
  for (const x of [-9.23,-6.85]) bench(x,-6.44);
  garden.box(wood,1.78,.14,.81,-8.04,.913,-4.82);
  for (const dx of [-.74,.74]) for(const dz of [-.29,.29])
    garden.box(wood,.12,.53,.128,-8.04+dx,.62,-4.82+dz);
  garden.part(potShape,ceramic,[.20,.34,.20],[-8.4,.976,-4.82]);
  for (const x of [-9.70,-6.38]) {
    garden.part(potShape,ceramic,[.38,.62,.38],[x,.373,-4.17]);
    lantern(garden,x,2.51,-3.84,.94);
  }
  for (const x of [-10.20,-5.87])
    garden.box(wood,.24,.17,4.31,x,3.15,-5.44);
  for (let i=0;i<4;i++) garden.box(stone,1.75,.096+i*.096,.32,7.97,.16+(.096+i*.096)/2,-2.41-i*.30);
  for (const x of [6.32,9.62]) for (const z of [-7.22,-3.94])
    lantern(garden,x,2.68,z,.77);
  for (const side of [-1,1]) {
    for (const y of [.85,1.30]) garden.box(red,.115,.11,3.03,7.97+side*1.49,y,-5.58);
    for (let i=0;i<9;i++) garden.box(red,.066,.49,.066,7.97+side*1.49,1.07,-6.89+i*.32);
  }
  for (const y of [.85,1.30]) garden.box(red,3.03,.11,.115,7.97,y,-7.07);
  for (let i=0;i<9;i++) garden.box(red,.066,.49,.066,6.66+i*.32,1.07,-7.07);
  garden.part(potShape,stone,[.50,.58,.50],[10.29,.17,-1.90]);
  garden.crown(jade,[.32,.057,.32],[10.29,.737,-1.90]);
  garden.tube(foam,[[10.29,.76,-1.90],[10.28,1.03,-1.91],[10.47,.985,-1.91],[10.51,.773,-1.91]],.026);

  for (const [x,z,scale] of [[-8.9,6.62,.96],[9.3,8.75,.80],[8.96,-9.25,.88],[-8.4,-9.04,1.02]])
    tree(x,z,scale);
  for (const [x,z,scale] of [[-10.05,4.70,.77],[-6.19,5.48,.71],[-8.61,9.56,.75],[-3.5,9.47,.55],
    [-10.29,8.47,.67],[-7.15,8.55,.62],[-6.42,9.62,.75],[-4.89,9.71,.59],
    [2.91,9.58,.51],[6.9,9.48,.72],[10.12,4.1,.68],[-6.1,-8.5,.65],[5.87,-8.56,.68],
    [9.92,-7.55,.85],[7.02,-2.92,.58],[-10.28,-7.79,.61],[-5.87,-3.22,.51],[-2.6,2.35,.44]])
    shrub(x,z,scale,true);
  for (const [x,z] of [[-10.65,2.99],[-5.13,3.90],[-6.02,-.75],[-9.9,5.81],[1.9,5.7],[5.7,-1.4],[10.5,-2.78],[-6.19,-7.18]])
    tuft(x,z);
  garden.finish();
}
