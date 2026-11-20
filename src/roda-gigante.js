import * as THREE from "three";
import { optimizeBuildingTemplates } from "./building-batches.js";
import { markNightLight } from "./daylight.js";
import { addLampEmitter } from "./night-lights.js";

export const ferrisWheel = {
  radius: 15.15,
  axleHeight: 19.65,
  axleDepth: -2.4,
  rimDepth: 1.52,
  supportDepth: 2.65,
  cabinCount: 16,
  period: 58,
  footprint: [36, 24],
  height: 35.2,
};
const { radius, axleHeight, axleDepth, rimDepth, supportDepth, cabinCount, period } = ferrisWheel;
const turn = Math.PI * 2;
const up = new THREE.Vector3(0, 1, 0);
const cabinColors = ["#bd4f59", "#19918a", "#d7a14f", "#656eb3"]
  .map(color => new THREE.Color(color));

function finishes() {
  const metal = (color, metalness = .32, roughness = .52) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const light = (color, strength) => {
    const material = markNightLight(metal(color, .08), strength);
    material.emissive.set(color);
    return material;
  };
  return {
    navy: metal("#1d3550"), teal: metal("#25666a"), ivory: metal("#ecddc2"),
    copper: metal("#b27449", .52), tire: metal("#363343", .07),
    foundation: metal("#645e63", .04), paving: metal("#ad9d89", .04),
    warmPaving: metal("#c9b097", .04), wood: metal("#8a593b", .02),
    earth: metal("#49534c", .02), leaf: metal("#548252", .02),
    freshLeaf: metal("#80a162", .02), rose: metal("#bf7290", .02),
    shell: metal("#ffffff"), glass: metal("#274b64", .40, .21),
    goldLight: light("#ffc176", 2.2), opal: light("#ffdf9e", 1.6),
    mint: light("#77e9db", 1.7), coral: light("#ffa2a7", 1.35),
  };
}

function mesh(parent, geometry, material, x, y, z, shadow = true) {
  const part = new THREE.Mesh(geometry, material);
  part.position.set(x, y, z);
  part.castShadow = shadow && !material.userData.nightGlow;
  part.receiveShadow = true;
  parent.add(part);
  return part;
}

function box(parent, material, x, y, z, width, height, depth, shadow) {
  return mesh(parent, new THREE.BoxGeometry(width, height, depth), material, x, y, z, shadow);
}

function rod(parent, material, start, end, radius, endRadius = radius, sides = 12) {
  const a = new THREE.Vector3(...start);
  const b = new THREE.Vector3(...end);
  const delta = b.clone().sub(a);
  const part = mesh(parent, new THREE.CylinderGeometry(endRadius, radius, delta.length(), sides),
    material, ...a.addScaledVector(delta, .5).toArray());
  part.quaternion.setFromUnitVectors(up, delta.normalize());
  return part;
}

function ring(parent, material, radius, thickness, x, y, z) {
  return mesh(parent, new THREE.TorusGeometry(radius, thickness, 8, 144), material, x, y, z);
}

function outline(parent, material, points, depth, x, y, z) {
  const shape = new THREE.Shape(points.map(([u, v]) => new THREE.Vector2(u, v)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  return mesh(parent, geometry, material, x, y, z);
}

function star(parent, material, radius, x, y, z) {
  const points = Array.from({ length: 16 }, (_, i) => {
    const a = Math.PI / 2 + i * turn / 16;
    const r = i % 2 ? radius * .29 : radius * (i % 4 ? .60 : 1);
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
  return outline(parent, material, points, .07, x, y, z);
}

function octagon(width, height, chamfer) {
  const w = width / 2, h = height / 2, c = chamfer;
  return [[-w+c,-h],[w-c,-h],[w,-h+c],[w,h-c],[w-c,h],[-w+c,h],[-w,h-c],[-w,-h+c]];
}

function canopy(parent, material, x, y, z, width, depth, height, chamfer) {
  const roof = outline(parent, material, octagon(width, depth, chamfer), height, x, y, z);
  roof.rotation.x = -Math.PI / 2;
  return roof;
}

function post(parent, material, x, y, z, height, radius = .065) {
  return rod(parent, material, [x,y,z], [x,y+height,z], radius);
}

function fence(parent, m, start, end, y, sections) {
  const [x, z] = start;
  const [dx, dz] = [end[0] - x, end[1] - z];
  for (let i = 0; i <= sections; i++) {
    const px = x + dx * i / sections, pz = z + dz * i / sections;
    post(parent, m.navy, px, y, pz, .95);
    post(parent, m.copper, px, y + .94, pz, .07, .085);
  }
  for (const h of [.35, .83])
    rod(parent, h > .5 ? m.copper : m.navy, [x,y+h,z], [end[0],y+h,end[1]], .045, .045, 8);
}

function lamp(parent, m, x, y, z, height) {
  post(parent, m.navy, x, y, z, height, .09);
  post(parent, m.copper, x, y, z, .23, .17);
  box(parent, m.opal, x, y + height + .16, z, .24, .33, .24);
  canopy(parent, m.navy, x, y + height + .34, z, .38, .38, .11, .065);
}

function garden(parent, m, x, z, flowering, index) {
  canopy(parent, m.foundation, x, .26, z, 2.5, 2.45, .26, .36);
  canopy(parent, m.earth, x, .51, z, 2.25, 2.2, .055, .43);
  post(parent, m.wood, x, .55, z, 1.67, .12);
  for (let j = 0; j < 7; j++) {
    const a = j * turn / 6 + index;
    const r = j === 6 ? 0 : .62;
    const crown = mesh(parent, new THREE.IcosahedronGeometry(.65 + (j % 3) * .13, 1),
      flowering && j % 3 ? m.rose : j % 2 ? m.leaf : m.freshLeaf,
      x + Math.cos(a) * r, 2.05 + .41 * (j % 3), z + Math.sin(a) * r);
    crown.scale.set(1, .72, 1);
  }
}

function entranceLabel(parent, m) {
  if (typeof document === "undefined") return;
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 112;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#1d3550";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#c59361";
  ctx.lineWidth = 3;
  ctx.strokeRect(8, 8, 752, 96);
  ctx.fillStyle = "#f6dfaf";
  ctx.font = "bold 49px Georgia";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("ESTRELA DA VILA", 384, 58);

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const sign = markNightLight(new THREE.MeshStandardMaterial({ map, roughness: .73 }), .55);
  sign.emissive.set("#f3b66b");
  sign.emissiveMap = map;
  mesh(parent, new THREE.PlaneGeometry(5.42, .79), sign, 0, 4.42, 8.77, false);

  for (const side of [-1, 1]) {
    star(parent, m.goldLight, .29, side * 3.15, 4.44, 8.77);
  }
}

function makePlaza(m) {
  const base = new THREE.Group();
  canopy(base, m.foundation, 0, 0, 0, 35.2, 23.2, .24, 2);
  canopy(base, m.paving, 0, .23, 0, 34.85, 22.86, .08, 1.94);
  for (const side of [-1, 1]) {
    box(base, m.warmPaving, 8.6 * side, .32, 3.9, 13.3, .025, 12.82, false);
    box(base, m.copper, 15.8 * side, .32, 2, .12, .027, 17.4, false);
    for (let i = 0; i < 8; i++)
      box(base, m.paving, 8.6 * side, .335, -2 + i * 1.6, 13.25, .014, .045, false);
    for (const [i, z] of [-8.45, 1.1, 8.75].entries())
      garden(base, m, side * (i === 0 ? 15.2 : 14.45), z, i !== 0, i + side);
    for (const z of [-9.55, 7.7]) lamp(base, m, side * 10.45, .32, z, 2.5);
    for (const z of [-5.75, 5.6]) {
      box(base, m.foundation, side*15.3, .45, z, 1.72, .28, .31);
      box(base, m.wood, side*15.3, .613, z, 2, .09, .45);
    }

    for (const z of [axleDepth - supportDepth, axleDepth + supportDepth]) {
      canopy(base, m.foundation, side * 9.7, .29, z, 3.25, 2.53, .62, .42);
      canopy(base, m.navy, side * 9.7, .91, z, 2.24, 1.71, .2, .25);
      rod(base, m.navy, [side*9.7,.95,z], [0,axleHeight,z], .68, .43, 6);
      const front = z > axleDepth ? .42 : -.42;
      rod(base, m.ivory, [side*9.9,1.02,z+front], [side*.18,axleHeight-.14,z+front],
        .19, .11, 8);
      rod(base, m.goldLight, [side*9.61,1.17,z+front*1.57], [0,axleHeight-.57,z+front*1.12],
        .032, .025, 8);
    }
    fence(base, m, [side*2.85,-3.5], [side*2.85,8.1], 1.7, 9);
    post(base, m.navy, side*3.58, .32, 8.44, 4.11, .21);
    post(base, m.copper, side*3.58, .35, 8.44, .87, .253);
  }

  for (const z of [axleDepth - supportDepth, axleDepth + supportDepth]) {
    for (const y of [8.35, 13.6]) {
      const x = 9.7 * (axleHeight-y)/(axleHeight-.95);
      rod(base, m.teal, [-x,y,z], [x,y,z], .18);
    }
  }
  box(base, m.foundation, 0, .98, 1.88, 6.1, 1.42, 12.3);
  box(base, m.ivory, 0, 1.69, 1.88, 6.23, .18, 12.35);
  for (let i = 0; i < 7; i++)
    box(base, i % 2 ? m.paving : m.warmPaving, 0, .32 + i * .104, 11 - i * .475, 5.95, .23 + i * .218, .55);
  for (const side of [-1, 1]) {
    rod(base, m.copper, [side*2.79,1.05,11.06], [side*2.79,2.62,7.9], .057);
    for (let i = 0; i < 3; i++)
      post(base, m.navy, side*2.79, .47+i*.54, 10.84-i*1.47, .86);
    box(base, m.goldLight, side * 2.73, 1.79, 2.4, .073, .052, 10);
  }

  canopy(base, m.navy, 0, 4.76, 8.41, 8.4, 2.42, .24, .38);
  canopy(base, m.copper, 0, 4.72, 8.41, 8.48, 2.46, .065, .38);
  box(base, m.navy, 0, 4.43, 8.44, 7.12, .91, .60);
  box(base, m.goldLight, 0, 4.747, 9.66, 7.82, .055, .05);
  entranceLabel(base, m);

  // Ticket window, counter and queue face the entrance plaza.
  box(base, m.teal, -7.05, 1.65, 7.24, 4.1, 2.69, 3.2);
  box(base, m.glass, -7.05, 1.97, 8.86, 3.27, 1.24, .095);
  box(base, m.opal, -7.05, 2.25, 8.923, 2.68, .08, .032);
  box(base, m.ivory, -7.05, 1.35, 8.99, 3.6, .17, .39);
  canopy(base, m.navy, -7.05, 3.07, 7.24, 4.62, 3.77, .18, .51);
  canopy(base, m.copper, -7.05, 3.033, 7.24, 4.62, 3.77, .048, .51);
  fence(base, m, [4.4,3], [10.9,3], .33, 5);
  fence(base, m, [4.4,5], [10.9,5], .33, 5);
  fence(base, m, [5.9,7], [10.9,7], .33, 4);
  fence(base, m, [10.9,3], [10.9,7], .33, 4);
  return base;
}

function makeRotor(m) {
  const rotor = new THREE.Group();
  rotor.name = "Rotor da roda-gigante";
  for (const side of [-1, 1]) {
    const z = side * rimDepth;
    ring(rotor, m.teal, radius, .215, 0, 0, z);
    ring(rotor, m.ivory, radius - .48, .092, 0, 0, z + side * .055);
    ring(rotor, m.copper, radius + .04, .074, 0, 0, z + side * .20);
    ring(rotor, m.goldLight, radius - .045, .049, 0, 0, z + side * .212);
    ring(rotor, m.copper, 3.02, .12, 0, 0, z);
    ring(rotor, m.mint, 2.79, .056, 0, 0, z + side * .08);

    const bulb = new THREE.SphereGeometry(.118, 7, 5);
    for (let i = 0; i < cabinCount * 8; i++) {
      const a = i * turn / (cabinCount * 8);
      const r = radius + .08;
      mesh(rotor, bulb, [m.goldLight, m.opal, m.mint, m.coral][Math.floor(i / 4) % 4],
        r * Math.sin(a), r * Math.cos(a), z + side * .28, false);
    }

    for (let i = 0; i < cabinCount; i++) {
      const a = i * turn / cabinCount;
      const b = a + side * .13;
      const x = Math.sin(a) * radius, y = Math.cos(a) * radius;
      rod(rotor, m.navy, [Math.sin(b)*1.18,Math.cos(b)*1.18,z], [x,y,z], .115, .10);
      rod(rotor, i % 2 ? m.copper : m.ivory, [Math.sin(a)*3,Math.cos(a)*3,z],
        [Math.sin(a + .083)*(radius-.48),Math.cos(a + .083)*(radius-.48),z], .047, .043, 8);
      if (i % 2 === 0) {
        rod(rotor, m.mint, [Math.sin(b)*3.06,Math.cos(b)*3.06,z+side*.12],
          [Math.sin(a)*13.9,Math.cos(a)*13.9,z+side*.12], .034, .034, 8);
      }
    }
  }

  for (let i = 0; i < cabinCount; i++) {
    const a = i * turn / cabinCount;
    const x = radius * Math.sin(a), y = radius * Math.cos(a);
    rod(rotor, m.copper, [x,y,-rimDepth-.17], [x,y,rimDepth+.17], .17);
  }
  rod(rotor, m.navy, [0,0,-supportDepth+.19], [0,0,supportDepth-.19], 1.39);
  return rotor;
}

function makeCabin(m) {
  const cabin = new THREE.Group();
  // The origin is the hinge. The cabin hangs below that point in every pose.
  canopy(cabin, m.copper, 0, -2.63, 0, 1.88, 2.13, .18, .31);
  canopy(cabin, m.shell, 0, -2.45, 0, 2.05, 2.26, .45, .35);
  canopy(cabin, m.glass, 0, -2, 0, 2.03, 2.24, 1.27, .35);
  canopy(cabin, m.ivory, 0, -.77, 0, 2.16, 2.37, .12, .35);
  canopy(cabin, m.shell, 0, -.65, 0, 2.02, 2.19, .17, .37);
  for (const side of [-1, 1]) {
    for (const s of [-1, 1]) {
      box(cabin, m.copper, s*.68, -1.38, side*1.122, .062, 1.26, .064);
      box(cabin, m.copper, side*1.013, -1.38, s*.76, .061, 1.26, .067);
    }
    box(cabin, m.navy, .23, -1.38, side*1.128, .044, 1.27, .055);
    box(cabin, m.opal, 0, -1.83, side*1.131, 1.24, .105, .034);
    box(cabin, m.opal, side*1.02, -1.83, 0, .034, .105, 1.42);
    box(cabin, m.copper, .32, -1.65, side*1.16, .13, .049, .063);
    rod(cabin, m.ivory, [0,0,side*.68], [0,-.54,side*.82], .087);
    rod(cabin, m.copper, [0,0,side*.57], [0,0,side*.82], .15);
  }
  return cabin;
}

function cabinPositions(carriages, angle) {
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < cabinCount; i++) {
    const a = angle + i * turn / cabinCount;
    matrix.makeTranslation(radius * Math.sin(a), radius * Math.cos(a), 0);
    for (const part of carriages.children) part.setMatrixAt(i, matrix);
  }
  for (const part of carriages.children) part.instanceMatrix.needsUpdate = true;
}

export function createFerrisWheel() {
  const model = new THREE.Group();
  model.name = "Roda-Gigante Estrela da Vila";
  model.userData.hasMovingParts = true;
  const m = finishes();
  const plaza = makePlaza(m);
  const rotor = makeRotor(m);
  const cabin = makeCabin(m);

  for (const side of [-1, 1]) {
    const z = axleDepth + side * (supportDepth + .23);
    rod(plaza, m.teal, [0,axleHeight,z-side*.51], [0,axleHeight,z+side*.18], 1.72);
    rod(plaza, m.copper, [0,axleHeight,z+side*.18], [0,axleHeight,z+side*.29], 1.58);
    ring(plaza, m.goldLight, 1.36, .055, 0, axleHeight, z+side*.31);
    const ornament = star(plaza, m.opal, 1.11, 0, axleHeight, z+side*.32);
    if (side < 0) ornament.rotation.y = Math.PI;
  }

  optimizeBuildingTemplates({ plaza, rotor, cabin });
  // The city caches its shadow map. Only the static supports cast shadows.
  for (const part of rotor.children) part.castShadow = false;
  const carriages = new THREE.Group();
  carriages.name = "Cabines panorâmicas";
  for (const part of cabin.children) {
    const instances = new THREE.InstancedMesh(part.geometry, part.material, cabinCount);
    instances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    instances.receiveShadow = true;
    if (part.material === m.shell) {
      for (let i = 0; i < cabinCount; i++)
        instances.setColorAt(i, cabinColors[Math.floor(i / 2) % cabinColors.length]);
    }
    // Enclose every pose once so frustum tests and picking stay valid as the wheel turns.
    part.geometry.computeBoundingBox();
    const bounds = part.geometry.boundingBox.clone();
    bounds.min.x -= radius;
    bounds.max.x += radius;
    bounds.min.y -= radius;
    bounds.max.y += radius;
    instances.boundingBox = bounds;
    instances.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());
    carriages.add(instances);
  }
  cabinPositions(carriages, 0);
  rotor.position.set(0, axleHeight, axleDepth);
  carriages.position.copy(rotor.position);
  model.add(...plaza.children.slice(), rotor, carriages);

  for (const x of [-10.45, 10.45]) {
    for (const z of [-9.55, 7.7]) {
      addLampEmitter(model, [x,3.03,z], { color: "#ffc382", intensity: 15, range: 6.1, halo: .73 });
    }
  }
  addLampEmitter(model, [0,4.26,8.49], { color: "#ffd29a", intensity: 25, range: 7.2, halo: .55 });
  return model;
}

export function createFerrisWheelAnimation() {
  const rides = new Map();
  const bounds = new THREE.Box3();
  const viewProjection = new THREE.Matrix4();
  const frustum = new THREE.Frustum();

  function add(model) {
    const rotor = model.getObjectByName("Rotor da roda-gigante");
    const cabins = model.getObjectByName("Cabines panorâmicas");
    rides.set(model, { rotor, cabins, angle: -rotor.rotation.z, lastTime: null });
  }

  function update(camera, time, construction, animate, gridAvailable = true, supplyAt = () => 1) {
    if (!rides.size) return false;
    camera.updateMatrixWorld();
    frustum.setFromProjectionMatrix(viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    let moving = false;
    for (const [model, ride] of rides) {
      const { x, y, z } = model.position;
      const extent = ferrisWheel.footprint[0] / 2;
      bounds.min.set(x-extent, y, z-extent);
      bounds.max.set(x+extent, y+ferrisWheel.height, z+extent);
      if (!animate || !gridAvailable || supplyAt(x, z) <= .5 || !model.visible ||
          construction.has(model) || !frustum.intersectsBox(bounds)) {
        ride.lastTime = null;
        continue;
      }
      moving = true;
      // Match the city's redraw rate and keep motion continuous after a pause.
      if (ride.lastTime === null) ride.lastTime = time;
      const elapsed = time - ride.lastTime;
      if (elapsed < 1000 / 30 - 2) continue;
      ride.angle = (ride.angle + Math.min(elapsed, 150) * turn / (period * 1000)) % turn;
      ride.lastTime = time;
      ride.rotor.rotation.z = -ride.angle;
      cabinPositions(ride.cabins, ride.angle);
    }
    return moving;
  }

  function remove(model) {
    const ride = rides.get(model);
    if (!ride) return;
    for (const part of ride.cabins.children) part.dispose();
    rides.delete(model);
  }

  return { add, update, remove };
}
