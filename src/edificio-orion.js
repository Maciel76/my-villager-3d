import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { markNightLight } from "./daylight.js";
import { addLampEmitter } from "./night-lights.js";

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

export const orion = {
  site: [40, 30],
  podium: { x: 0, z: 0.25, width: 34.1, depth: 23.5, radius: 6.1 },
  canopy: { x: 2.0, z: 9.7, width: 23.9, depth: 8.1, radius: 3.55 },
  centerZ: -1.73,
  radiusX: 13.0,
  radiusZ: 9.75,
  firstFloor: 5.70,
  floorHeight: 3.58,
  floors: 12,
  terrace: 48.69,
  top: 56,
};

export function orionPoint(angle, scale = 1) {
  const cosine = Math.cos(angle);
  return [
    cosine * orion.radiusX * scale,
    orion.centerZ + scale * (Math.sin(angle) * orion.radiusZ - 1.15 * cosine),
  ];
}

export function orionRoof(x, z) {
  return 50.95 + 0.218 * x - 0.064 * (z - orion.centerZ);
}

export function orionEllipse(scale = 1, segments = 72) {
  return Array.from({ length: segments }, (_, index) => orionPoint(TAU * index / segments, scale));
}

export function orionRounded({ x = 0, z = 0, width, depth, radius }, segments = 9) {
  const a = width / 2 - radius;
  const b = depth / 2 - radius;
  return [[1, 1], [-1, 1], [-1, -1], [1, -1]].flatMap(([sx, sz], corner) =>
    Array.from({ length: segments + 1 }, (_, i) => {
      const angle = (corner + i / segments) * TAU / 4;
      return [x + sx * a + radius * Math.cos(angle), z + sz * b + radius * Math.sin(angle)];
    }),
  );
}

const orbitCurves = [
  [
    [2.48, 0.25, 1.15], [2.48, 6.35, 1.16], [2.45, 12.3, 1.16],
    [2.34, 17.5, 1.16], [2.10, 22, 1.15], [1.77, 26.0, 1.14],
    [1.41, 29.5, 1.13], [1.05, 32.65, 1.12], [0.71, 35.55, 1.11],
    [0.44, 38.5, 1.10], [0.31, 42.1, 1.10], [0.29, 49.6, 1.10],
    [0.29, 53.0, 1.10],
  ],
  [
    [-0.05, 1.30, 1.10], [-0.09, 8.15, 1.14], [-0.40, 15.05, 1.15],
    [-0.88, 21.6, 1.14], [-1.38, 27.1, 1.13], [-2.06, 31.6, 1.13],
    [-2.70, 35.4, 1.12], [-3.30, 38.3, 1.13], [-3.95, 41.0, 1.12],
    [-4.59, 44.0, 1.12], [-5.20, 46.85, 1.11], [-5.65, 49.45, 1.10], [-5.92, 52.0, 1.10],
  ],
];

export function orionBand(index) {
  return new THREE.CatmullRomCurve3(orbitCurves[index].map(([angle, y, scale]) => {
    const [x, z] = orionPoint(angle, scale);
    return new THREE.Vector3(x, y, z);
  }));
}

export function orionSection(path, t, index) {
  const center = path.getPoint(t);
  const tangent = path.getTangent(t);
  const normal = new THREE.Vector3(
    center.x / orion.radiusX ** 2, 0, (center.z - orion.centerZ) / orion.radiusZ ** 2,
  ).normalize();
  const across = tangent.clone().cross(normal).normalize();
  const outward = across.clone().cross(tangent).normalize();
  const halfWidth = index === 0
    ? (0.94 + 0.57 * Math.sin(t * Math.PI)) * (1 - 0.57 * t ** 9)
    : 0.79 + 0.32 * Math.sin(t * Math.PI);
  return { center, across, outward, halfWidth };
}

function makeMaterials() {
  const paint = (color, roughness = 0.74, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const glow = (color, emission, strength, base = 0) => {
    const mat = paint(color, 0.37, 0.03);
    mat.emissive.set(emission);
    mat.emissiveIntensity = base;
    markNightLight(mat, strength);
    mat.emissive.set(emission);
    return mat;
  };
  const glass = (color, opacity) => new THREE.MeshStandardMaterial({
    color, opacity, transparent: true, depthWrite: false, roughness: 0.26,
    metalness: 0.1, side: THREE.DoubleSide,
  });
  const lightPixels = new Uint8Array(16 * 32 * 4);
  for (let y = 0; y < 32; y++) {
    const level = y / 31;
    for (let x = 0; x < 16; x++) {
      const shade = .39 + .54 * Math.exp(-((level - .79) ** 2) / .039)
        + .11 * Math.sin(Math.PI * x / 15) ** 2;
      const value = Math.round(Math.min(1, shade) * 255);
      lightPixels.set([value, value, value, 255], (y * 16 + x) * 4);
    }
  }
  const lightTexture = new THREE.DataTexture(lightPixels, 16, 32);
  lightTexture.magFilter = THREE.LinearFilter;
  lightTexture.minFilter = THREE.LinearFilter;
  lightTexture.needsUpdate = true;
  return {
    pearl: paint("#dfccc0", 0.44, 0.13),
    pale: paint("#e7dace", 0.5, 0.075),
    shadow: paint("#252a35", 0.54, 0.19),
    mullion: paint("#303745", 0.63, 0.22),
    bronze: paint("#a77550", 0.44, 0.36),
    teak: paint("#966948", 0.76, 0.025),
    stone: paint("#8d8d89", 0.88),
    pavement: paint("#b2a499", 0.88),
    ivory: paint("#dacebd", 0.86),
    pool: paint("#227f9c", 0.21, 0.17),
    ripple: paint("#84bec3", 0.34, 0.15),
    poolTile: paint("#3f6874", 0.6),
    soil: paint("#535246", 0.95),
    gold: glow("#e7b58c", "#ffad54", 3.15, 0.18),
    interior: glow("#bba48d", "#ffd193", 0.93, 0.065),
    darkGlass: ["#38546e", "#456884", "#2c465e", "#43617c", "#526b84"].map(color => paint(color, 0.27, 0.26)),
    litGlass: ["#4e667c", "#64758a", "#4b657e"].map((color, i) => {
      const material = glow(color, i === 1 ? "#ffd9a5" : "#ffb26c", 0.38 + 0.14 * i);
      material.emissiveMap = lightTexture;
      return material;
    }),
    clear: glass("#88a8bd", 0.24),
    rail: glass("#80aabe", 0.33),
    leaves: ["#4f6b3b", "#638248", "#7e9a4b", "#3a5b38"].map(color => paint(color, 0.84)),
  };
}

function makeBuilder(model) {
  const box = new THREE.BoxGeometry();
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
  const branch = new THREE.CylinderGeometry(0.67, 1, 1, 7);
  const groups = new Map();

  function put(material, geometry, ground = false) {
    const key = [material.uuid, ground, Object.keys(geometry.attributes).sort().join(",")].join("|");
    if (!groups.has(key)) groups.set(key, { material, ground, parts: [] });
    if (!geometry.index) {
      const count = geometry.attributes.position.count;
      geometry.setIndex(Array.from({ length: count }, (_, i) => i));
    }
    groups.get(key).parts.push(geometry);
  }

  function shape(points) {
    const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
    shape.closePath();
    return shape;
  }

  function slab(material, points, y, height, { hole, ground = false } = {}) {
    const outline = shape(points);
    if (hole) outline.holes.push(shape(hole));
    put(material, new THREE.ExtrudeGeometry(outline, { depth: height, bevelEnabled: false })
      .rotateX(-Math.PI / 2).translate(0, y, 0), ground);
  }

  function block(material, x, y, z, w, h, d, angle = 0, ground = false) {
    put(material, box.clone().scale(w, h, d).rotateY(angle).translate(x, y, z), ground);
  }

  function post(material, x, y, z, radius, height) {
    put(material, cylinder.clone().scale(radius, height, radius).translate(x, y, z));
  }

  function line(material, from, to, radius, round = false) {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const diff = b.clone().sub(a);
    const length = diff.length();
    const orientation = new THREE.Quaternion().setFromUnitVectors(UP, diff.normalize());
    put(material, (round ? branch : box).clone().scale(radius, length, radius)
      .applyQuaternion(orientation).translate(...a.lerp(b, 0.5)));
  }

  function tube(material, points, radius, closed = false) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), closed);
    put(material, new THREE.TubeGeometry(curve, points.length * 2, radius, 6, closed));
  }

  function surface(material, positions, indices, uv) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    if (uv) geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    put(material, geometry);
  }

  function guard(m, points, baseY, height, closed = false) {
    const positions = [];
    const indices = [];
    for (const [index, [x, z]] of points.entries()) {
      positions.push(x, baseY + .05, z, x, baseY + height, z);
      if (index % 3 === 0) post(m.mullion, x, baseY + height / 2, z, .036, height);
      if (closed || index + 1 < points.length) {
        const a = index * 2;
        const b = ((index + 1) % points.length) * 2;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    surface(m.rail, positions, indices);
    tube(m.bronze, points.map(([x, z]) => [x, baseY + height, z]), .037, closed);
  }

  function finish() {
    for (const { material, ground, parts } of groups.values()) {
      const geometry = mergeGeometries(parts);
      parts.forEach(part => part.dispose());
      const part = new THREE.Mesh(geometry, material);
      part.userData.groundCover = ground;
      part.castShadow = !ground && !material.transparent;
      part.receiveShadow = !material.transparent;
      model.add(part);
    }
  }

  return { put, block, slab, line, tube, post, guard, surface, finish };
}

function windows(builder, m) {
  const columns = 52;
  const vertices = Array.from({ length: columns + 1 }, (_, i) => orionPoint(TAU * i / columns));
  for (let level = 0; level <= orion.floors; level++) {
    const y = orion.firstFloor + level * orion.floorHeight;
    for (let segment = 0; segment < columns; segment++) {
      const [x0,z0] = vertices[segment];
      const [x1,z1] = vertices[segment + 1];
      const base = Math.min(orionRoof(x0,z0), orionRoof(x1,z1), y);
      const ceiling0 = Math.min(orionRoof(x0,z0), y + orion.floorHeight);
      const ceiling1 = Math.min(orionRoof(x1,z1), y + orion.floorHeight);
      if (ceiling0 - base < .035 && ceiling1 - base < .035) continue;
      const occupied = (segment * 17 + level * 13) % 11 < 4;
      const material = occupied
        ? m.litGlass[(segment * 7 + level) % m.litGlass.length]
        : m.darkGlass[(segment * 7 + level) % m.darkGlass.length];
      builder.surface(material, [
        x0, base, z0, x1, base, z1, x1, ceiling1, z1, x0, ceiling0, z0,
      ], [0, 2, 1, 0, 3, 2], [0, 0, 1, 0, 1, 1, 0, 1]);
      const frameY = Math.min(ceiling0, ceiling1) - .14;
      if (frameY > base + .12)
        builder.line(m.mullion, [x0 * 1.003, frameY, z0], [x1 * 1.003, frameY, z1], .085);
      if (frameY > base + 1.12)
        builder.line(m.mullion, [x0 * 1.002, base + .995, z0], [x1 * 1.002, base + .995, z1], .042);
      if (ceiling0 > base + .035)
        builder.line(m.shadow, [x0 * 1.003, base, z0], [x0 * 1.003, ceiling0, z0], .075);
      if (occupied && level % 2 === 1 && segment % 3 === 1 && frameY > base + .38) {
        const a = [x0 * 1.001, base + .22, z0 + .012], b = [x1 * 1.001, base + .22, z1 + .012];
        builder.line(m.interior, a, b, .032);
      }
    }
  }
  for (const angle of [-1.65, .05, 1.59, 2.84]) {
    const [x, z] = orionPoint(angle, 1.004);
    builder.line(m.shadow, [x, 5.6, z], [x, orionRoof(x,z), z], .205);
  }
}

function orbit(builder, m, index) {
  const path = orionBand(index);
  const count = 120;
  const layout = [[-1, .35],[1, .35],[1, -.32],[-1, -.32]];
  const positions = [], indices = [], edge = [], opposite = [];
  for (let i = 0; i <= count; i++) {
    const { center, across, outward, halfWidth } = orionSection(path, i / count, index);
    const point = (s,d) => center.clone().addScaledVector(across,s).addScaledVector(outward,d).toArray();
    for (const [side,d] of layout) positions.push(...point(side * halfWidth,d));
    edge.push(point(-halfWidth + .096,.39));
    opposite.push(point(halfWidth - .086,.36));
    if (i === count) continue;
    for (let face = 0; face < 4; face++) {
      const a = i * 4 + face;
      const b = i * 4 + (face + 1) % 4;
      indices.push(a,b,a + 4,b,b + 4,a + 4);
    }
  }
  const final = 4 * count;
  indices.push(0,2,1,0,3,2,final,final + 1,final + 2,final,final + 2,final + 3);
  builder.surface(m.pearl, positions, indices);
  builder.tube(m.bronze, opposite, .084);
  builder.tube(m.bronze, edge, .11);
  builder.tube(m.gold, edge.map(([x, y, z]) => [x * 1.005, y, orion.centerZ + (z - orion.centerZ) * 1.005]), .068);
  for (const t of [.12,.24,.39,.58,.73,.86,.95]) {
    const { center } = orionSection(path, t, index);
    const inner = [center.x * .89, center.y, orion.centerZ + (center.z - orion.centerZ) * .89];
    builder.line(m.pearl, inner, center.toArray(), .29);
  }
}

export function orionFin() {
  return [
    [12.82,.25],[14.75,.25],[14.68,31.9],[14.41,42.4],[13.98,50.15],
    [13.38,53.9],[12.92,52.06],[12.64,39.2],[12.44,17.1],
  ];
}

function spine(builder, m, light) {
  const flank = new THREE.Shape(orionFin().map(([x,y]) => new THREE.Vector2(x,y)));
  flank.closePath();
  builder.put(m.pearl, new THREE.ExtrudeGeometry(flank, { depth: .98, bevelEnabled: true,
    bevelThickness: .085, bevelSize: .072, bevelSegments: 2, steps: 1 }).translate(0,0,.91));
  builder.tube(m.gold, [[13.27,.32,1.92],[13.19,11.0,1.92],[13.31,30.3,1.92],
    [13.76,42.9,1.92],[13.49,50.8,1.92],[13.43,53.65,1.92]], .066);
  builder.post(m.bronze, 13.39, 54.70, 1.34, .10, 2.18);
  builder.post(m.gold, 13.39, 55.735, 1.34, .077, .53);
  light([13.45, 52.91, 2.04], 10, 7.4, .47);
}

function podium(builder, m, light) {
  const paving = orionRounded({width:orion.site[0], depth:orion.site[1], radius:2.4});
  builder.slab(m.pavement, paving, 0, .235, { ground:true });
  const base = orionRounded(orion.podium);
  builder.slab(m.pale, base, 4.92, .64);
  builder.tube(m.gold, orionRounded({
    ...orion.podium,width:34.19,depth:23.59,radius:6.145,
  }).map(([x,z]) => [x,4.96,z]), .055,true);
  const rear = orionRounded({...orion.podium, depth:15.4, z:-3.7, width:31.55, radius:4.25});
  builder.slab(m.shadow, rear, .24, 4.69);
  // Take the visible front half in perimeter order, including both rounded returns.
  const frontPath = orionRounded({...orion.podium,width:33.12,depth:22.44,radius:5.75},8).slice(0,18);
  const glassPositions = [];
  const glassIndices = [];
  for (const [index,[x,z]] of frontPath.entries()) {
    glassPositions.push(x,.28,z,x,4.87,z);
    builder.post(m.mullion,x,2.55,z,.061,4.63);
    if (index + 1 < frontPath.length) {
      const a = index * 2;
      glassIndices.push(a,a+1,a+2,a+2,a+1,a+3);
    }
  }
  builder.surface(m.clear,glassPositions,glassIndices);
  builder.tube(m.mullion,frontPath.map(([x,z])=>[x,3.09,z]),.052);
  for (let i=0;i<13;i++) {
    const x = (i-6)*1.56;
    builder.block(m.mullion,x,2.56,11.51,.071,4.64,.11);
  }

  builder.slab(m.ivory, orionRounded({ width:31.2,depth:10.3,radius:3.0,z:6.1 }), .235,.075,{ground:true});
  builder.block(m.interior,1.05,2.39,4.01,14.9,3.88,.074);
  for (let i=0;i<22;i++) {
    builder.block(m.teak,-6.9+i*.66,2.44,4.107,.081,4.16,.132);
  }
  for (const x of [-9.4,-6.5,6.5,9.4]) {
    builder.block(m.shadow,x,.58,8.41,1.94,.49,.71);
    builder.block(m.pearl,x,.87,8.41,1.98,.10,.74);
    builder.post(m.bronze,x,2.42,6.9,.17,4.03);
  }
  builder.block(m.teak,-2.10,.74,6.06,2.9,.83,.84);
  builder.block(m.pale,-2.10,1.18,6.06,3.02,.14,.93);
  for (const x of [-.62,.62]) {
    builder.block(m.bronze,x,1.57,11.58,.055,.51,.085);
    builder.block(m.mullion,x*2.15,1.65,11.53,.074,2.75,.08);
  }

  const canopy = orionRounded(orion.canopy);
  builder.slab(m.pearl,canopy,4.48,.57);
  const inset = orionRounded({...orion.canopy,width:23.64,depth:7.85,radius:3.42});
  builder.slab(m.teak,inset,4.40,.09);
  builder.tube(m.gold,orionRounded({
    ...orion.canopy,width:24.01,depth:8.21,radius:3.60,
  }).map(([x,z])=>[x,4.505,z]),.069,true);
  for (const delta of [1.15,2.22]) {
    const outline = orionRounded({...orion.canopy,width:23.9-2*delta,depth:8.1-2*delta,radius:3.55-delta},6);
    builder.tube(m.gold,outline.map(([x,z])=>[x,4.386,z]),.034,true);
  }
  for (const x of [-8.0,-3.75,3.77,9.18]) {
    builder.post(m.shadow,x,2.33,11.18,.173,4.0);
    builder.post(m.bronze,x,4.24,11.18,.199,.26);
    light([x,4.31,11.62],24,8.7,0,[0,-1,.07]);
  }
  light([0,3.41,7.16],75,12);
  light([-10.2,3.61,9.57],24,7);
  light([10.2,3.61,9.57],24,7);
}

export const orionTerraces = [
  { start: -.39, end: 1.74, outer: 1.33, y: 13.10 },
  { start: -3.01, end: -.24, outer: 1.18, y: 23.91 },
  { start: 1.60, end: 3.57, outer: 1.25, y: 31.42 },
  { start: 1.21, end: 3.36, outer: 1.22, y: 41.28 },
];

export function orionTerraceShape({ start, end, outer }, segments = 26) {
  const angles = Array.from({ length: segments + 1 }, (_, i) => THREE.MathUtils.lerp(start, end, i / segments));
  const exposed = angles.map((angle, i) =>
    orionPoint(angle, 1.03 + (outer - 1.03) * Math.max(0, Math.sin(Math.PI * i / segments)) ** .54));
  const inner = angles.map(angle => orionPoint(angle, .98)).reverse();
  return { exposed, outline: [...exposed, ...inner] };
}

function landscaping(builder, m) {
  let seed = 69099;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const tuft = new THREE.IcosahedronGeometry(1, 1);
  const low = new THREE.IcosahedronGeometry(1, 0);

  function crown(x,y,z,w,h,d,variant) {
    const mesh = (w > .36 ? tuft : low).clone().scale(w,h,d).rotateY(random()*TAU).translate(x,y,z);
    builder.put(m.leaves[variant % m.leaves.length], mesh);
  }

  function shrub(x,y,z,scale) {
    for (let i = 0; i < 5; i++) {
      const a = i * 2.4;
      const r = scale * (.38 + .3 * random());
      crown(x + Math.cos(a)*r*.5,y+.28*scale+random()*.32*scale,z+Math.sin(a)*r*.5,r,.65*r,.83*r,i);
    }
  }

  function tree(x,y,z,scale) {
    const p = (dx,dy,dz) => [x+dx*scale,y+dy*scale,z+dz*scale];
    const root = p(0,0,0);
    const fork = p(.13,1.1,.04);
    builder.line(m.teak,root,fork,.095*scale,true);
    for (let i=0;i<7;i++) {
      const angle= i*2.4;
      const spread = .34+random()*.62;
      const end = p(Math.cos(angle)*spread,1.59+random()*.75,Math.sin(angle)*spread);
      builder.line(m.teak,fork,end,.059*scale,true);
      for (let j=0;j<4;j++) {
        const r=scale*(.26+random()*.25);
        crown(end[0]+(random()-.5)*r*1.4,end[1]+random()*.27*scale,end[2]+(random()-.5)*r,r*1.14,r*.61,r,i+j);
      }
    }
  }

  function palm(x,y,z,scale) {
    const base = [x,y,z], middle=[x+.16*scale,y+1.42*scale,z-.13*scale];
    const top = [x+.24*scale,y+2.84*scale,z-.22*scale];
    builder.line(m.teak,base,middle,.109*scale,true);
    builder.line(m.teak,middle,top,.072*scale,true);
    for (let i=0;i<9;i++) {
      const angle=TAU*i/9;
      const dx=Math.sin(angle)*scale,dz=Math.cos(angle)*scale;
      const pos=[];
      for(let s=0;s<=7;s++){
        const t=s/7;
        const span=(.19*Math.sin(Math.PI*t)+.007)*scale;
        const cx=top[0]+dx*(1.07*t);
        const cy=top[1]+Math.sin(Math.PI*t)*.34*scale-.35*scale*t*t;
        const cz=top[2]+dz*(1.07*t);
        pos.push(cx+Math.cos(angle)*span,cy,cz-Math.sin(angle)*span,cx-Math.cos(angle)*span,cy,cz+Math.sin(angle)*span);
      }
      const faces=[];
      for(let s=0;s<7;s++) {
        const n=s*2;
        faces.push(n,n+1,n+2,n+1,n+3,n+2,n,n+2,n+1,n+1,n+2,n+3);
      }
      builder.surface(m.leaves[i%3],pos,faces);
    }
  }

  function planter(x,y,z,size,plant = shrub) {
    const outline = orionRounded({width:size,depth:size*.8,radius:size*.28,x,z}, 4);
    builder.slab(m.stone,outline,y,.26);
    const soil = orionRounded({width:size*.88,depth:size*.69,radius:size*.22,x,z},4);
    builder.slab(m.soil,soil,y+.26,.035);
    plant(x,y+.295,z,size*.67);
  }
  return { shrub, tree, palm, planter };
}

function terraces(builder,m,garden,light) {
  for (const spec of orionTerraces) {
    const { outline, exposed } = orionTerraceShape(spec);
    builder.slab(m.pearl,outline,spec.y,.53);
    builder.tube(m.gold,exposed.map(([x,z])=>[x*1.003,spec.y+.063,z*1.003]),.052);
    const inset = exposed.map(([x,z])=>[x*.983,orion.centerZ+(z-orion.centerZ)*.983]);
    builder.guard(m,inset,spec.y+.53,.89);
    for(let i=0;i<8;i++) {
      const angle=THREE.MathUtils.lerp(spec.start,spec.end,(i+1)/9);
      const [x,z]=orionPoint(angle,1.065+(spec.outer-1.10)*Math.sin(Math.PI*(i+1)/9));
      if(i%3===0) garden.planter(x,spec.y+.53,z,1.36,garden.tree);
      else garden.shrub(x,spec.y+.53,z,.62);
    }
    const [x,z]=exposed[Math.floor(exposed.length/2)];
    light([x*.965,spec.y-.06,z*.965],23,8,0,[0,-1,0]);
  }
}

function roof(builder,m,garden,light) {
  const ring = [];
  const indices = [];
  const rim = [];
  const segments = 96;
  for(let i=0;i<segments;i++) {
    const angle=TAU*i/segments;
    const [x,z]=orionPoint(angle,1.061);
    const [xi,zi]=orionPoint(angle,.936);
    const oy=orionRoof(x,z),iy=orionRoof(xi,zi);
    ring.push(x,oy+.40,z,xi,iy+.40,zi,xi,iy-.44,zi,x,oy-.44,z);
    rim.push([x*1.003,oy-.28,orion.centerZ+(z-orion.centerZ)*1.003]);
    for(let face=0;face<4;face++) {
      const a=i*4+face,b=i*4+(face+1)%4;
      const next=(i+1)%segments*4;
      indices.push(a,b,next+face,b,next+(face+1)%4,next+face);
    }
  }
  // The section order gives outward normals along the outer cornice.
  builder.surface(m.pearl,ring,indices);
  builder.tube(m.gold,rim,.073,true);
  builder.tube(m.bronze,rim.map(([x,y,z])=>[x,y+.58,z]),.052,true);
  builder.slab(m.teak,orionEllipse(.987),orion.terrace-.24,.28);
  builder.guard(m,orionEllipse(.954,45),orion.terrace+.04,.86,true);

  const pool = { x:4.05,z:1.53,width:7.78,depth:4.98,radius:.61 };
  const inside = { ...pool,width:7.28,depth:4.48,radius:.42 };
  builder.slab(m.poolTile,orionRounded(pool),orion.terrace,.29);
  builder.slab(m.pool,orionRounded(inside),orion.terrace+.29,.025);
  builder.tube(m.ivory,orionRounded(pool,6).map(([x,z])=>[x,orion.terrace+.315,z]),.084,true);
  for(let i=0;i<18;i++) {
    const x=pool.x+(i%6-2.5)*1.01+.12*Math.sin(i*8);
    const z=pool.z+(Math.floor(i/6)-1)*1.22+.14*Math.sin(i*5);
    builder.block(m.ripple,x,orion.terrace+.318,z,.27+.19*(i%3),.007,.017,.13);
  }
  for(const x of [-.2,1.44,3.08,4.72]) {
    builder.block(m.bronze,x,orion.terrace+.21,5.00,.69,.29,1.66);
    builder.block(m.ivory,x,orion.terrace+.43,5.00,.72,.15,1.68);
    builder.line(m.ivory,[x,orion.terrace+.44,4.89],[x,orion.terrace+.75,4.38],.68);
  }
  for(const [x,z,size] of [[-.88,-7.21,1.72],[-8.6,-3.7,1.70],[-8.14,2.94,1.47],[7.97,-4.7,1.89],[9.85,1.6,1.50]]) {
    garden.planter(x,orion.terrace,z,size,garden.tree);
    light([x,orion.terrace+.56,z+.37],6.5,4.4);
  }

  const y=orion.terrace+2.79;
  for(const x of [-6.56,-2.71]) {
    for(const z of [-4.94,-1.18]) builder.post(m.bronze,x,orion.terrace+1.385,z,.11,2.76);
  }
  for(let i=0;i<9;i++) {
    builder.block(m.teak,-6.71+i*.52,y,-3.10,.20,.19,4.05);
  }
  builder.block(m.teak,-4.63,orion.terrace+.64,-3.10,1.54,.13,1.06);
  for(const [x,z] of [[-4.63,-4.0],[-4.63,-2.24],[-5.83,-3.12],[-3.46,-3.12]]) {
    builder.block(m.ivory,x,orion.terrace+.33,z,.70,.34,.65);
  }
}

function plaza(builder,m,garden,light) {
  for(let row=0;row<7;row++) {
    for(let col=0;col<23;col++) {
      const x=(col-11)*1.52,z=10.35+row*.644;
      if(Math.abs(x)>15.2 && row===6) continue;
      builder.block((row*7+col)%8>1?m.ivory:m.pavement,x,.243,z,1.504,.025,.628,0,true);
    }
  }
  for(const s of [-1,1]) {
    const x=s*13.8,z=8.61;
    const bed=orionRounded({width:6.89,depth:3.60,radius:1.0,x,z});
    builder.slab(m.stone,bed,.24,.30);
    builder.slab(m.soil,orionRounded({width:6.60,depth:3.33,radius:.92,x,z}),.535,.025);
    garden.palm(x+s*1.18,.565,z,.99);
    garden.tree(x-s*1.52,.565,z+.29,1.04);
    for(let i=0;i<8;i++) garden.shrub(x+(i-3.5)*.76,.56,z+1.10,.48);
    for(let i=0;i<5;i++) garden.shrub(s*(10.65+i*1.41),.245,13.22,.50);
    for(const z of [-9.3,-4.4, .55]) {
      garden.planter(s*16.95,.24,z,1.74,garden.palm);
      light([s*16.95,.69,z+1.04],13,5.3,0,[0,.95,-.2]);
    }
    const fountain = {width:4.7,depth:1.75,radius:.66,x:s*7.48,z:12.91};
    builder.slab(m.poolTile,orionRounded(fountain),.25,.105);
    builder.slab(m.pool,orionRounded({...fountain,width:4.42,depth:1.47,radius:.52}),.355,.018);
    for(const dx of [-1.12,0,1.12]) {
      builder.tube(m.ripple,[[fountain.x+dx,.38,13.43],[fountain.x+dx,.60,12.87],[fountain.x+dx,.38,12.36]],.016);
    }
    for(const x of [s*3.38,s*18.31]) {
      builder.post(m.shadow,x,1.48,13.48,.057,2.47);
      builder.block(m.shadow,x,2.73,13.48,.39,.075,.13);
      builder.block(m.gold,x,2.67,13.53,.22,.09,.12);
      light([x,2.61,13.61],11,5.2,.45,[0,-1,.10]);
    }
    light([s*13.8,.68,9.68],20,7,0,[0,.84,-.34]);
  }
}

const glyphs = {
  B: [[[0,0],[0,1],[.63,1],[.94,.81],[.63,.53],[0,.53]],[[.63,.53],[.99,.35],[.92,.12],[.68,0],[0,0]]],
  E: [[[1,1],[0,1],[0,0],[1,0]],[[0,.54],[.80,.54]]],
  I: [[[.5,0],[.5,1]]],
  N: [[[0,0],[0,1],[1,0],[1,1]]],
  O: [[[.25,0],[.75,0],[1,.25],[1,.75],[.75,1],[.25,1],[0,.75],[0,.25],[.25,0]]],
  R: [[[0,0],[0,1],[.65,1],[.97,.82],[.97,.66],[.65,.50],[0,.50]],[[.55,.50],[1,0]]],
  S: [[[1,.88],[.80,1],[.22,1],[0,.79],[.13,.61],[.85,.40],[1,.25],[.81,0],[.21,0],[0,.12]]],
  T: [[[0,1],[1,1]],[[.5,1],[.5,0]]],
  U: [[[0,1],[0,.20],[.20,0],[.80,0],[1,.20],[1,1]]],
  W: [[[0,1],[.20,0],[.50,.65],[.80,0],[1,1]]],
};

export function orionSign() {
  const angle=.68;
  const [x,z]=orionPoint(angle,1.039);
  const yaw=Math.atan2(x/orion.radiusX**2,(z-orion.centerZ)/orion.radiusZ**2);
  const place=(u,y,depth)=>[x+Math.cos(yaw)*u+Math.sin(yaw)*depth,
    y,z-Math.sin(yaw)*u+Math.cos(yaw)*depth];
  const strokes = [];
  const stroke = (points,width) => {
    const vertices=points.map(([u,y])=>place(u,y,.222));
    for(let i=1;i<vertices.length;i++) strokes.push([vertices[i-1],vertices[i],width]);
  };
  const text = (word,y,h,width) => {
    const step=width/(word.length+.25);
    for(const [index,letter] of [...word].entries()) {
      const a=(index-(word.length-1)/2)*step;
      for(const path of glyphs[letter]) stroke(path.map(([u,v])=>[a+(u-.5)*step*.68,y+h*v]),h*.075);
    }
  };
  for(const shape of [
    [[-.95,27.80],[-.95,30.08],[-.42,30.66],[-.42,27.80]],
    [[-.23,27.80],[-.23,31.12],[.12,31.68],[.50,31.25],[.50,27.80]],
    [[.67,27.80],[.67,30.42],[1.12,29.94],[1.12,27.80]],
    [[-1.15,27.80],[1.31,27.80]],
  ]) stroke(shape,.071);
  text("ORION",26.33,.94,3.28);
  text("BUSINESS",25.58,.38,2.85);
  text("TOWER",25.00,.41,1.99);
  return { x, z, yaw, strokes, emitter: place(0,29.11,.83) };
}

function signage(builder,m,light) {
  const { x, z, yaw, strokes, emitter } = orionSign();
  builder.block(m.shadow,x,27.87,z,4.13,8.15,.33,yaw);
  for (const [from, to, width] of strokes) builder.line(m.gold,from,to,width,true);
  light(emitter,13,5.5);
}

export function createEdificioOrion() {
  const model = new THREE.Group();
  model.name = "Edifício Orion";
  const materials = makeMaterials();
  const builder = makeBuilder(model);
  const garden = landscaping(builder,materials);
  const light = (position,intensity,range,halo=0,direction) =>
    addLampEmitter(model,position,{color:"#ffd0a2",intensity,range,halo,direction});
  podium(builder,materials,light);
  windows(builder,materials);
  for (let i=0;i<orbitCurves.length;i++) orbit(builder,materials,i);
  spine(builder,materials,light);
  terraces(builder,materials,garden,light);
  roof(builder,materials,garden,light);
  plaza(builder,materials,garden,light);
  signage(builder,materials,light);
  builder.finish();
  return model;
}
