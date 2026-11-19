import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { markNightLight } from "./daylight.js";
import { addLampEmitter } from "./night-lights.js";

const TAU = Math.PI * 2;
const up = new THREE.Vector3(0, 1, 0);

export const miranteOrientalStructure = {
  plaza: { width: 23.4, depth: 23.4, radius: 0.85 },
  podium: { width: 20.1, depth: 14.2, radius: 2.1, z: -1.8 },
  core: { width: 14.5, depth: 12.0, radius: 1.35, z: -2.08 },
  balconies: [
    { width: 7.8, depth: 12.85, radius: 2.55, x: -5.22, z: -1.42 },
    { width: 6.45, depth: 12.74, radius: 2.47, x: 5.34, z: -1.58 },
  ],
  canopy: { width: 13.8, depth: 6.45, radius: 2.96, x: 1.37, z: 5.87 },
  floorCount: 10,
  floorHeight: 2.86,
  firstFloor: 5.95,
  terrace: 34.68,
  crown: { x: 0.8, z: -2.35, rx: 8.75, rz: 6.08, y: 39.28 },
};

export function miranteRibbon() {
  return new THREE.CatmullRomCurve3([
    [-6.98, 5.48, 5.26],
    [-6.25, 8.55, 5.91],
    [-3.58, 12.13, 6.21],
    [0.76, 15.29, 6.16],
    [4.74, 18.37, 5.92],
    [6.52, 21.67, 5.62],
    [6.23, 25.38, 5.42],
    [4.75, 29.0, 5.26],
    [2.12, 32.42, 5.18],
    [-1.63, 34.71, 5.12],
    [-4.08, 34.55, 4.92],
    [-5.23, 33.50, 4.77],
  ].map(point => new THREE.Vector3(...point)));
}

export function miranteRibbonSection(curve, t) {
  const center = curve.getPoint(t);
  const tangent = curve.getTangent(t);
  const across = new THREE.Vector3(tangent.y, -tangent.x, 0).normalize();
  const forward = across.clone().cross(tangent).normalize();
  const halfWidth = 0.78 + 0.36 * Math.exp(-4.8 * t) - 0.20 * t ** 5;
  return { center, across, forward, halfWidth };
}

export function mirantePlanOutline({ width, depth, radius, x = 0, z = 0 }, segments = 10) {
  const dx = width / 2 - radius;
  const dz = depth / 2 - radius;
  return [[1, 1], [-1, 1], [-1, -1], [1, -1]].flatMap(([sx, sz], corner) =>
    Array.from({ length: segments + 1 }, (_, index) => {
      const angle = (corner + index / segments) * TAU / 4;
      return [x + sx * dx + radius * Math.cos(angle), z + sz * dz + radius * Math.sin(angle)];
    }),
  );
}

function profile(points) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
  shape.closePath();
  return shape;
}

function roundSlab(points, y, height, cutout) {
  const shape = profile(points);
  if (cutout) shape.holes.push(profile(cutout));
  return new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false })
    .rotateX(-Math.PI / 2).translate(0, y, 0);
}

function paint(color, roughness = 0.75, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function glow(color, strength, base, emission = color) {
  const material = paint(color, 0.48);
  material.emissive.set(emission);
  material.emissiveIntensity = base;
  markNightLight(material, strength);
  material.emissive.set(emission);
  return material;
}

function towerMaterials() {
  return {
    stone: paint("#c5ad97", 0.55, 0.09),
    lightStone: paint("#e2c9ae", 0.55, 0.05),
    dark: paint("#222a31", 0.66, 0.14),
    frame: paint("#443c38", 0.61, 0.16),
    bronze: paint("#ad733f", 0.46, 0.33),
    soffit: paint("#ad7650", 0.62, 0.1),
    cedar: paint("#75482f", 0.78),
    paving: paint("#b1a090", 0.9),
    tile: paint("#ceb8a0", 0.87),
    water: paint("#226371", 0.26, 0.18),
    ripple: paint("#73acb0", 0.32, 0.12),
    flow: glow("#cce2e3", 0.3, 0.02),
    amber: glow("#ffd189", 1.1, 0.012),
    light: glow("#ffae61", 2.8, 0.14),
    railGlass: new THREE.MeshStandardMaterial({
      color: "#82b7cb", metalness: 0.05, roughness: 0.31,
      transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide,
    }),
    lobbyGlass: new THREE.MeshStandardMaterial({
      color: "#a8c7c7", roughness: 0.33,
      transparent: true, opacity: 0.24, depthWrite: false, side: THREE.DoubleSide,
    }),
    panes: ["#365467", "#456678", "#4e7181", "#627b8b", "#527080"].map(color => paint(color, 0.32, 0.20)),
    litPanes: ["#516d7e", "#657986", "#62757d"].map((color, index) =>
      glow(color, 0.48 + index * 0.26, 0, "#ffad61"),
    ),
    leaves: ["#385e38", "#577843", "#769347"].map(color => paint(color)),
    blossoms: ["#c64a7f", "#eb79a4", "#f7a9be"].map(color => paint(color)),
    rocks: ["#736c64", "#9c9286", "#b0a398"].map(color => paint(color, 0.96)),
  };
}

function modelBuilder(model, finishes) {
  const boxGeometry = new THREE.BoxGeometry();
  const shaft = new THREE.CylinderGeometry(1, 1, 1, 12);
  const vertical = new THREE.CylinderGeometry(0.84, 1, 1, 7);
  const batches = new Map();

  function put(material, geometry, ground = false) {
    const key = [material.uuid, ground, Object.keys(geometry.attributes).sort().join(",")].join(":");
    if (!batches.has(key)) batches.set(key, { material, ground, geometries: [] });
    if (!geometry.index) {
      const count = geometry.attributes.position.count;
      geometry.setIndex(Array.from({ length: count }, (_, index) => index));
    }
    batches.get(key).geometries.push(geometry);
  }

  function box(material, x, y, z, width, height, depth, yaw = 0, ground = false) {
    put(material, boxGeometry.clone().scale(width, height, depth).rotateY(yaw).translate(x, y, z), ground);
  }

  function cylinder(material, x, y, z, radius, height) {
    put(material, shaft.clone().scale(radius, height, radius).translate(x, y, z));
  }

  function beam(material, a, b, width, shape = boxGeometry) {
    const start = new THREE.Vector3(...a);
    const end = new THREE.Vector3(...b);
    const delta = end.clone().sub(start);
    put(material, shape.clone().scale(width, delta.length(), width)
      .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, delta.normalize()))
      .translate(...start.lerp(end, 0.5)));
  }

  function tube(material, points, radius, closed = false, segments = points.length * 2) {
    const path = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), closed);
    put(material, new THREE.TubeGeometry(path, segments, radius, 6, closed));
  }

  function slab(material, plan, level, height, ground = false) {
    put(material, roundSlab(mirantePlanOutline(plan), level, height), ground);
  }

  function perimeter(material, plan, level, radius) {
    const offset = radius * 0.78;
    const outline = {
      ...plan, width: plan.width + 2 * offset, depth: plan.depth + 2 * offset, radius: plan.radius + offset,
    };
    tube(material, mirantePlanOutline(outline, 8).map(([x, z]) => [x, level, z]), radius, true);
  }

  function rail(plan, y, height = 0.85) {
    const { x = 0, z = 0 } = plan;
    const inset = { ...plan, width: plan.width - 0.28, depth: plan.depth - 0.28, radius: plan.radius - 0.10 };
    const line = mirantePlanOutline(inset, 8);
    const positions = [], indices = [];
    for (let i = 0; i < line.length; i++) {
      const [x, z] = line[i];
      positions.push(x, y + 0.08, z, x, y + height, z);
      const a = i * 2;
      const b = (a + 2) % (line.length * 2);
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const glass = new THREE.BufferGeometry();
    glass.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    glass.setIndex(indices);
    glass.computeVertexNormals();
    put(finishes.railGlass, glass);
    perimeter(finishes.bronze, inset, y + height, 0.042);
    perimeter(finishes.dark, inset, y + 0.075, 0.035);
    for (const [px, pz] of mirantePlanOutline(inset, 3)) {
      const yaw = Math.atan2(px - x, pz - z);
      box(finishes.frame, px, y + height / 2, pz, 0.047, height, 0.053, yaw);
    }
  }

  function finish() {
    for (const { material, ground, geometries } of batches.values()) {
      const geometry = mergeGeometries(geometries);
      geometries.forEach(part => part.dispose());
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = !ground && !material.transparent;
      mesh.receiveShadow = !material.transparent;
      mesh.userData.groundCover = ground;
      model.add(mesh);
    }
  }

  return {
    put, box, cylinder, tube, slab, perimeter, rail, finish,
    branch: (material, a, b, width) => beam(material, a, b, width, vertical),
    beam,
  };
}

function ellipse(x, z, rx, rz, segments = 80) {
  return Array.from({ length: segments }, (_, i) => {
    const a = i / segments * TAU;
    return [x + rx * Math.cos(a), z + rz * Math.sin(a)];
  });
}

function facade(builder, m, light) {
  const { core, firstFloor, floorCount, floorHeight, balconies, terrace } = miranteOrientalStructure;
  builder.slab(m.dark, core, firstFloor, terrace - firstFloor);
  const facadeFront = core.z + core.depth / 2;
  for (let floor = 0; floor < floorCount; floor++) {
    const level = firstFloor + floorHeight * floor;
    for (let pane = 0; pane < 12; pane++) {
      const x = (pane - 5.5) * 1.13;
      const finish = (pane + floor * 3) % 7 < 3
        ? m.litPanes[(floor + pane) % m.litPanes.length]
        : m.panes[(floor * 3 + pane) % m.panes.length];
      builder.box(finish, x, level + 1.43, facadeFront + 0.04, 1.08, 2.61, 0.10);
      builder.box(m.panes[(floor + 2 * pane) % m.panes.length], x, level + 1.43,
        core.z - core.depth / 2 - 0.035, 1.08, 2.61, 0.08);
      builder.box(m.frame, x, level + 1.03, facadeFront + 0.108, 1.09, 0.047, 0.07);
    }
    for (const sign of [-1, 1]) {
      for (let pane = 0; pane < 8; pane++) {
        const z = core.z + (pane - 3.5) * 1.24;
        builder.box(m.panes[(pane + floor) % m.panes.length],
          sign * (core.width / 2 + 0.042), level + 1.46, z, 0.09, 2.56, 1.16);
      }
    }
    for (let wing = 0; wing < balconies.length; wing++) {
      const plan = balconies[wing];
      builder.slab(m.stone, plan, level, 0.44);
      builder.slab(m.soffit, {
        ...plan, width: plan.width - 0.16, depth: plan.depth - 0.16, radius: plan.radius - 0.08,
      }, level - 0.028, 0.035);
      builder.perimeter(m.frame, plan, level + 0.40, 0.045);
      builder.perimeter(m.light, plan, level + 0.081, 0.031);
      builder.rail(plan, level + 0.44, 0.76);
      for (const dx of [-1.66, 0, 1.66]) {
        builder.cylinder(m.dark, plan.x + dx, level - 0.025, plan.z + plan.depth / 2 - 0.66, 0.15, 0.073);
        builder.cylinder(m.light, plan.x + dx, level - 0.069, plan.z + plan.depth / 2 - 0.66, 0.093, 0.025);
      }
      light([plan.x, level - 0.12, plan.z + plan.depth / 2 - 0.58], 8.6, 4.2, 0, [0, -1, -0.25]);
    }
  }

  for (const x of [-3.18, -2.84, 3.83, 4.19]) {
    builder.box(m.dark, x, (firstFloor + terrace) / 2, facadeFront + 0.17, 0.22, terrace - firstFloor, 0.34);
  }

  builder.box(m.dark, 1.32, 20.37, facadeFront + 0.38, 4.43, 28.58, 0.46);
  for (let i = 0; i < 23; i++) {
    const x = -0.67 + i * 0.182;
    builder.box(i % 4 ? m.bronze : m.cedar, x, 20.35, 4.76, 0.085, 28.52, 0.51);
  }
  for (const x of [-0.82, 3.45]) {
    builder.box(m.bronze, x, 20.38, 4.82, 0.14, 28.55, 0.35);
    builder.box(m.light, x, 20.36, 5.00, 0.044, 28.35, 0.036);
  }
}

function ribbon(builder, m) {
  const curve = miranteRibbon();
  const positions = [];
  const indices = [];
  const edges = [[], []];
  const count = 96;
  for (let index = 0; index <= count; index++) {
    const t = index / count;
    const { center, across, forward, halfWidth } = miranteRibbonSection(curve, t);
    for (const [side, depth] of [[-1, 0.32], [1, 0.32], [1, -0.31], [-1, -0.31]]) {
      const vertex = center.clone().addScaledVector(across, side * halfWidth).addScaledVector(forward, depth);
      positions.push(...vertex);
    }
    for (let side = 0; side < 2; side++) {
      const vertex = center.clone().addScaledVector(across, (side * 2 - 1) * (halfWidth - 0.112))
        .addScaledVector(forward, 0.35);
      edges[side].push(vertex.toArray());
    }
    if (index < count) {
      for (let edge = 0; edge < 4; edge++) {
        const a = index * 4 + edge;
        const b = index * 4 + (edge + 1) % 4;
        indices.push(a, b, a + 4, b, b + 4, a + 4);
      }
    }
  }
  indices.push(0, 2, 1, 0, 3, 2);
  const end = count * 4;
  indices.push(end, end + 1, end + 2, end, end + 2, end + 3);
  const band = new THREE.BufferGeometry();
  band.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  band.setIndex(indices);
  band.computeVertexNormals();
  builder.put(m.lightStone, band);
  builder.tube(m.bronze, edges[0], 0.089, false, 120);
  builder.tube(m.light, edges[0].map(([x, y, z]) => [x, y, z + 0.070]), 0.050, false, 120);
  builder.tube(m.bronze, edges[1], 0.050, false, 120);
}

export function miranteLotusPaths() {
  const petals = [
    [[0, 0], [-0.35, 0.47], [-0.38, 1.03], [0, 1.95], [0.38, 1.03], [0.35, 0.47], [0, 0]],
  ];
  for (const sign of [-1, 1]) {
    petals.push([[0, 0], [sign * 0.46, 0.04], [sign * 0.84, 0.54],
      [sign * 0.97, 1.36], [sign * 0.46, 1.11], [sign * 0.24, 0.63], [0, 0]]);
    petals.push([[0, 0], [sign * 0.54, -0.18], [sign * 1.09, -0.06],
      [sign * 1.57, 0.55], [sign * 0.98, 0.58], [sign * 0.49, 0.38], [0, 0]]);
  }
  return petals.map(petal => petal.slice(0, -1).map(([x, y]) => [x + 1.34, y + 22.48, 5.02]));
}

function lotus(builder, m) {
  for (const points of miranteLotusPaths()) {
    builder.tube(m.dark, points, 0.112, true);
    builder.tube(m.light, points.map(([x, y, z]) => [x, y, z + 0.101]), 0.059, true);
  }
  builder.cylinder(m.amber, 1.34, 22.38, 5.08, 0.115, 0.14);
}

function crown(builder, m, light) {
  const { crown, terrace } = miranteOrientalStructure;
  const deck = { width: 18.2, depth: 13.05, radius: 2.72, z: -1.47 };
  builder.slab(m.stone, deck, terrace - 0.14, 0.48);
  builder.perimeter(m.light, deck, terrace + 0.055, 0.039);
  builder.rail(deck, terrace + 0.34, 1.0);

  const { x, z, rx, rz, y } = crown;
  const outside = ellipse(x, z, rx, rz);
  const inside = ellipse(x, z, rx - 1.43, rz - 1.15);
  builder.put(m.stone, roundSlab(outside, y, 0.45, inside));
  builder.put(m.cedar, roundSlab(ellipse(x, z, rx - 0.12, rz - 0.12), y - 0.135, 0.14, inside));
  for (const [dx, dz, finish, radius] of [
    [0.055, 0.055, m.bronze, 0.08],
    [0.17, 0.17, m.light, 0.064],
    [1.22, 0.99, m.light, 0.058],
  ]) {
    builder.tube(finish, ellipse(x, z, rx - dx, rz - dz, 64).map(([x, z]) => [x, y - 0.153, z]), radius, true, 84);
  }
  for (let i = 0; i < 76; i++) {
    const angle = i / 76 * TAU;
    const point = (dx, dz) => [x + dx * Math.cos(angle), y - 0.135, z + dz * Math.sin(angle)];
    builder.beam(m.bronze, point(rx - 1.25, rz - 1.03), point(rx - 0.19, rz - 0.19), 0.063);
  }
  for (const [px, pz] of [[-4.72, -5.61], [5.88, -5.61], [-4.72, 1.32], [5.88, 1.32]]) {
    builder.box(m.dark, px, 37.27, pz, 0.42, 4.56, 0.47);
    builder.box(m.bronze, px + 0.23, 37.27, pz, 0.08, 4.56, 0.42);
    light([px, 38.82, pz], 12, 7);
  }
  for (let i = 0; i < 13; i++) {
    const px = -3.64 + i * 0.69;
    builder.box(m.cedar, px, 39.23, -2.14, 0.24, 0.24, 8.15);
  }
  for (let i = 0; i < 13; i++) {
    builder.box(i % 3 ? m.bronze : m.cedar, 2.44 + i * 0.123, 37.25, 1.21, 0.061, 4.9, 0.30);
  }
}

function podium(builder, m, light) {
  const { plaza, podium, canopy } = miranteOrientalStructure;
  const rear = { ...podium, depth: 10.85, z: -2.15 };
  builder.slab(m.paving, plaza, 0, 0.24, true);
  builder.slab(m.dark, rear, 0.24, 4.89);
  builder.slab(m.stone, podium, 4.70, 0.57);
  builder.slab(m.dark, { ...podium, width: podium.width - 0.48, depth: podium.depth - 0.36 }, 5.27, 0.66);
  builder.perimeter(m.bronze, podium, 4.80, 0.060);
  builder.rail(podium, 5.31, 0.83);

  const front = 5.31;
  for (const direction of [-1, 1]) {
    for (let i = 0; i < 17; i++) {
      const x = direction * (4.47 + i * 0.263);
      builder.box(m.cedar, x, 2.45, front - 0.47, 0.12, 4.38, 0.27);
      builder.box(m.bronze, x, 2.45, front - 0.29, 0.054, 4.35, 0.085);
    }
    builder.box(m.dark, direction * 8.94, 2.44, 1.82, 1.26, 4.40, 6.16);
    for (let i = 0; i < 7; i++) {
      builder.box(m.panes[(i + 1) % m.panes.length], direction * 9.57, 2.39,
        -5.85 + i * 1.50, 0.085, 3.89, 1.35);
    }
  }
  builder.box(m.tile, 0, 0.27, 4.49, 8.67, 0.09, 3.85);
  builder.box(m.amber, 0, 2.44, 3.285, 8.18, 3.92, 0.095);
  for (let i = 0; i < 14; i++) {
    builder.box(m.cedar, (i - 6.5) * 0.57, 2.41, 3.35, 0.085, 3.87, 0.069);
  }
  builder.box(m.dark, 1.61, 0.65, 3.96, 2.52, 0.82, 0.73);
  builder.box(m.stone, 1.61, 1.09, 3.96, 2.62, 0.12, 0.77);
  for (const x of [-3.48, -2.49, 2.65, 3.61]) {
    builder.box(m.cedar, x, 0.52, 4.88, 0.86, 0.39, 0.53);
    builder.box(m.stone, x, 0.73, 4.88, 0.89, 0.15, 0.57);
  }

  builder.box(m.lobbyGlass, 0, 2.44, front, 8.78, 4.23, 0.055);
  for (const x of [-4.43, -3.08, -1.73, -0.68, 0.68, 1.73, 3.08, 4.43]) {
    builder.box(m.frame, x, 2.42, front + 0.057, 0.068, 4.29, 0.134);
  }
  for (const y of [0.39, 2.83, 4.49]) {
    builder.box(m.frame, 0, y, front + 0.065, 8.96, 0.075, 0.14);
  }
  for (const sign of [-1, 1]) {
    builder.box(m.bronze, sign * 0.21, 1.51, front + 0.184, 0.055, 0.54, 0.08);
    builder.box(m.frame, sign * 1.17, 1.59, front + 0.086, 0.051, 2.41, 0.13);
  }

  builder.slab(m.lightStone, canopy, 4.31, 0.52);
  builder.slab(m.cedar, { ...canopy, width: 13.46, depth: 6.11, radius: 2.78 }, 4.23, 0.10);
  builder.perimeter(m.light, canopy, 4.292, 0.064);
  builder.perimeter(m.bronze, canopy, 4.77, 0.044);
  for (let i = 0; i < 25; i++) {
    const px = -3.52 + i * 0.40;
    const span = Math.sqrt(Math.max(0.32, 1 - ((px - canopy.x) / 6.2) ** 4));
    builder.box(i % 3 ? m.bronze : m.dark, px, 4.21, canopy.z, 0.09, 0.074, 5.63 * span);
  }
  for (const x of [-3.66, 5.92]) {
    builder.cylinder(m.dark, x, 2.25, 6.48, 0.22, 4.02);
    builder.cylinder(m.bronze, x, 0.49, 6.48, 0.27, 0.34);
    builder.cylinder(m.bronze, x, 4.09, 6.48, 0.26, 0.26);
  }
  for (const x of [-2.55, 1.51, 5.63]) {
    builder.cylinder(m.light, x, 4.146, 7.86, 0.112, 0.035);
    light([x, 4.07, 7.86], 25, 8, 0, [0, -1, 0.14]);
  }
  light([0.1, 3.12, 4.09], 47, 8);
}

function landscape(builder, m, light) {
  let seed = 83437;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const crownShape = new THREE.IcosahedronGeometry(1, 1);
  const rockShape = new THREE.DodecahedronGeometry(1);
  const scalePart = (shape, finish, x, y, z, w, h, d, yaw = 0) =>
    builder.put(finish, shape.clone().scale(w, h, d).rotateY(yaw).translate(x, y, z));

  function tree(x, y, z, size, flower = false) {
    const tones = flower ? m.blossoms : m.leaves;
    const point = (dx, dy, dz) => [x + dx * size, y + dy * size, z + dz * size];
    const spine = [[0, 0, 0], [-0.19, 0.82, 0.03], [0.18, 1.56, -0.10], [0.05, 2.53, 0.14], [0.32, 3.19, 0.12]];
    for (let i = 1; i < spine.length; i++) {
      builder.branch(m.cedar, point(...spine[i - 1]), point(...spine[i]), size * (0.147 - i * 0.024));
    }
    for (let b = 0; b < 9; b++) {
      const angle = b * 2.39996 + 0.4;
      const reach = (flower ? 0.87 : 1.25 - b * 0.069) + random() * 0.51;
      const dx = Math.cos(angle) * reach;
      const dz = Math.sin(angle) * reach;
      const level = flower ? 2.16 + random() * 0.86 : 1.19 + b * 0.243;
      const end = point(dx, level, dz);
      builder.branch(m.cedar, point(...spine[1 + b % 3]), end, size * 0.051);
      for (let i = 0; i < 6; i++) {
        const rx = (0.26 + random() * 0.29) * size;
        const at = point(dx + (random() - 0.50) * 0.86, level + random() * 0.53, dz + (random() - 0.50) * 0.79);
        scalePart(crownShape, tones[(b + i) % 3], ...at, rx * 1.22, rx * (flower ? 0.74 : 0.47), rx, angle);
      }
    }
  }

  function shrub(x, y, z, size) {
    for (let i = 0; i < 4; i++) {
      const a = i * 2.39;
      scalePart(crownShape, m.leaves[i % 3], x + Math.cos(a) * size * 0.4,
        y + size * (0.31 + random() * 0.23), z + Math.sin(a) * size * 0.4,
        size * 0.69, size * 0.48, size * 0.61, a);
    }
  }

  function planter(x, y, z, size, material = m.stone) {
    builder.slab(material, { width: size, depth: size * 0.78, radius: size * 0.27, x, z }, y, 0.24);
    shrub(x, y + 0.25, z, 0.34 * size);
  }

  function lantern(x, z) {
    builder.slab(m.dark, { width: 0.58, depth: 0.57, radius: 0.085, x, z }, 0.24, 0.21);
    builder.box(m.frame, x, 1.52, z, 0.115, 2.33, 0.115);
    builder.box(m.cedar, x, 2.62, z, 0.63, 0.098, 0.13);
    builder.box(m.light, x, 2.18, z, 0.39, 0.57, 0.37);
    builder.box(m.dark, x, 2.48, z, 0.49, 0.081, 0.47);
    builder.box(m.dark, x, 1.89, z, 0.45, 0.075, 0.43);
    for (const a of [-1, 1]) {
      for (const b of [-1, 1]) {
        builder.box(m.frame, x + a * 0.198, 2.18, z + b * 0.190, 0.033, 0.58, 0.034);
      }
      builder.box(m.bronze, x, 2.18, z + a * 0.193, 0.40, 0.042, 0.033);
    }
    light([x, 2.16, z], 16, 6.5, 0.73);
  }

  for (let row = 0; row < 14; row++) {
    for (let column = 0; column < 21; column++) {
      const x = (column - 10) * 1.05;
      const z = 5.66 + row * 0.427;
      const warm = (row * 13 + column) % 7 > 2 ? m.tile : m.paving;
      builder.box(warm, x, 0.257, z, 1.035, 0.038, 0.412, 0, true);
    }
  }
  for (const sign of [-1, 1]) {
    const x = sign * 6.82;
    const pond = { width: 5.82, depth: 3.51, radius: 0.78, x, z: 8.43 };
    builder.slab(m.dark, pond, 0.275, 0.28);
    builder.slab(m.water, { ...pond, width: 5.46, depth: 3.19, radius: 0.66 }, 0.556, 0.023);
    builder.perimeter(m.stone, pond, 0.55, 0.088);
    const fall = sign * 7.11;
    builder.box(m.dark, fall, 0.95, 7.03, 2.62, 1.13, 0.47);
    builder.box(m.stone, fall, 1.527, 7.09, 2.74, 0.116, 0.62);
    builder.box(m.amber, fall, 0.61, 7.335, 2.48, 0.035, 0.073);
    for (let i = 0; i < 45; i++) {
      const dx = fall + (i - 22) * 0.055;
      const reach = random() * 0.13;
      builder.tube(m.flow, [[dx, 1.557, 7.42], [dx, 1.39, 7.526],
        [dx + reach * 0.25, 0.99, 7.59], [dx + reach * 0.36, 0.61, 7.70 + reach]],
      0.008 + random() * 0.010, false, 7);
    }
    for (let i = 0; i < 13; i++) {
      const z = 7.84 + random() * 1.772;
      const dx = x + (random() - 0.5) * 4.24;
      builder.box(m.ripple, dx, 0.584, z, 0.18 + random() * 0.38, 0.01, 0.016);
    }
    builder.slab(m.stone, { width: 3.03, depth: 2.2, radius: 0.77, x: sign * 9.16, z: 7.43 }, 0.278, 0.41);
    tree(sign * 9.16, 0.70, 7.38, 0.94, true);
    builder.slab(m.stone, { width: 2.65, depth: 1.63, radius: 0.58, x: sign * 5.86, z: 9.84 }, 0.28, 0.35);
    tree(sign * 5.82, 0.64, 9.76, 0.68);
    for (let i = 0; i < 8; i++) {
      const angle = i * 2.4;
      const px = sign * 9.16 + Math.cos(angle) * 1.17;
      const pz = 7.43 + Math.sin(angle) * 0.8;
      if (i % 3) shrub(px, 0.69, pz, 0.26 + random() * 0.11);
      else scalePart(rockShape, m.rocks[i % 3], px, 0.75, pz, 0.29, 0.19, 0.25, angle);
    }
    planter(sign * 2.61, 0.278, 7.01, 0.81, m.cedar);
    lantern(sign * 10.82, 10.51);
    lantern(sign * 3.52, 10.86);
    light([fall, 0.74, 7.84], 10, 4.9, 0, [0, 0.85, -0.40]);
    for (const [px, pz] of [[8.48, 2.57], [8.72, -4.0], [6.92, 4.07]]) {
      const x = sign * px;
      builder.slab(m.stone, { width: 1.24, depth: 1.12, radius: 0.29, x, z: pz }, 5.29, 0.33);
      tree(x, 5.62, pz, 0.46, false);
    }
    for (const [px, pz] of [[6.49, 2.89], [5.96, -5.91], [2.78, -4.91]]) {
      const x = sign * px;
      builder.slab(m.dark, { width: 1.40, depth: 1.13, radius: 0.35, x, z: pz }, 35.03, 0.26);
      tree(x, 35.30, pz, 0.72, false);
    }
    for (let floor = 0; floor < miranteOrientalStructure.floorCount; floor++) {
      const deckY = miranteOrientalStructure.firstFloor + floor * miranteOrientalStructure.floorHeight + 0.45;
      const x = sign * (floor % 2 ? 6.33 : 7.46);
      planter(x, deckY, 3.98, 0.89);
      if (floor % 2 === 0) tree(x, deckY + 0.24, 3.98, 0.29);
      planter(sign * 4.25, deckY, 4.00, 0.61);
    }
  }
  for (const level of [10.1, 19.3, 28.0, 34.5]) {
    light([1.32, level, 5.55], 14, 7.7);
  }
}

export function createMiranteOriental() {
  const model = new THREE.Group();
  model.name = "Torre Mirante Oriental";
  const materials = towerMaterials();
  const builder = modelBuilder(model, materials);
  const light = (position, intensity, range, halo = 0, direction) =>
    addLampEmitter(model, position, { color: "#ffd0a1", intensity, range, halo, direction });
  podium(builder, materials, light);
  facade(builder, materials, light);
  ribbon(builder, materials);
  lotus(builder, materials);
  crown(builder, materials, light);
  landscape(builder, materials, light);
  builder.finish();
  return model;
}
