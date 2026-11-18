import * as THREE from "three";
import { markNightLight } from "./daylight.js";
import { addLampEmitter } from "./night-lights.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { projectTexture } from "./assets.js";

const boxShape = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
const globeShape = new THREE.IcosahedronGeometry(1, 1);
const pillarShape = new THREE.CylinderGeometry(1, 1, 1, 9).toNonIndexed();
const lanternRoof = new THREE.CylinderGeometry(0.37, 1, 1, 4)
  .rotateY(Math.PI / 4)
  .toNonIndexed();

function windowShape(depth) {
  const profile = new THREE.Shape()
    .moveTo(-0.87, -1.04)
    .lineTo(0.87, -1.04)
    .quadraticCurveTo(0.87, 0.36, 0.64, 0.88)
    .quadraticCurveTo(0, 1.14, -0.64, 0.88)
    .quadraticCurveTo(-0.87, 0.36, -0.87, -1.04);
  return new THREE.ExtrudeGeometry(profile, {
    depth,
    bevelEnabled: false,
    curveSegments: 5,
  });
}

export function addSakuraGarden(model, materials) {
  const paint = (color, roughness = 0.88) =>
    new THREE.MeshStandardMaterial({ color, roughness });
  const red = materials.vermilion;
  const rock = materials.fieldstone;
  const wood = materials.cedar;
  const ink = paint("#2e2926");
  const glazing = markNightLight(paint("#2e2926"), 1.12);
  const bark = paint("#775140");
  const jade = paint("#789d5a");
  const moss = paint("#527848");
  const stonePaper = markNightLight(paint("#eac894"), 1.65);
  const paper = markNightLight(
    new THREE.MeshStandardMaterial({
      color: "#ffebc4",
      emissive: "#f7b75c",
      emissiveIntensity: 0.18,
      roughness: 0.9,
    }),
    1.5,
  );
  const blossoms = ["#a74665", "#c96580", "#e68e9f", "#f7b5bd", "#ffd2c4"].map(
    (color) => paint(color),
  );
  const batches = new Map();

  function add(source, material, scales, center, yaw = 0) {
    const [x, y, z] = center;
    const phase = y < 2.28 ? "base" : y < 9.08 ? "body" : "roof";
    const key = `${material.id}-${phase}`;
    if (!batches.has(key)) batches.set(key, { material, geometries: [] });
    const geometry = source
      .clone()
      .scale(...scales)
      .rotateY(yaw)
      .translate(x, y, z);
    if (material.map) projectTexture(geometry);
    batches.get(key).geometries.push(geometry);
  }
  const box = (material, w, h, d, x, y, z, yaw = 0) =>
    add(boxShape, material, [w, h, d], [x, y, z], yaw);

  function window(x, y, z, yaw, scale = 1) {
    const frontX = Math.sin(yaw);
    const frontZ = Math.cos(yaw);
    add(windowFrame, red, [scale, scale, 1], [x, y, z], yaw);
    add(
      windowGlass,
      glazing,
      [scale * 0.77, scale * 0.79, 1],
      [x + frontX * 0.16, y + 0.018, z + frontZ * 0.16],
      yaw,
    );
    for (const offset of [-0.37, 0, 0.37]) {
      box(
        red,
        0.083,
        (offset === 0 ? 1.55 : 1.4) * scale,
        0.11,
        x + Math.cos(yaw) * offset * scale + frontX * 0.2,
        y - 0.055,
        z - Math.sin(yaw) * offset * scale + frontZ * 0.2,
        yaw,
      );
    }
    box(red, 1.84 * scale, 0.14, 0.38, x, y - 1.06 * scale, z, yaw);
  }
  const windowFrame = windowShape(0.19);
  const windowGlass = windowShape(0.065);
  for (const x of [-3.34, 0, 3.34]) window(x, 6.22, 2.66, 0);
  for (const x of [-2.74, 2.74]) window(x, 6.22, -7.55, Math.PI, 0.92);
  for (const z of [-5.62, -2.45, 0.64]) {
    window(5.59, 6.22, z, Math.PI / 2);
    window(-5.59, 6.22, z, -Math.PI / 2);
  }
  windowFrame.dispose();
  windowGlass.dispose();

  // Dark door rails over inset cedar and a row of timber brackets below the eaves.
  for (const x of [-1.32, 0, 1.32]) box(ink, 0.14, 2.77, 0.12, x, 1.63, 2.8);
  for (const y of [0.31, 1.3, 2.11, 2.94]) box(ink, 2.8, 0.13, 0.12, 0, y, 2.8);
  for (const x of [-0.24, 0.24]) box(red, 0.12, 0.32, 0.17, x, 1.43, 2.88);
  for (let i = -5; i <= 5; i++) {
    const x = i * 0.98;
    box(red, 0.25, 0.77, 0.63, x, 9.16, 2.83);
    box(red, 0.25, 0.77, 0.63, x, 9.16, -7.76);
  }
  for (let i = -4; i <= 4; i++) {
    const z = -2.45 + i * 1.105;
    box(red, 0.62, 0.77, 0.25, 5.79, 9.16, z);
    box(red, 0.62, 0.77, 0.25, -5.79, 9.16, z);
  }
  for (const x of [-4.7, 4.7]) {
    for (const y of [4.01, 8.17]) box(red, 0.63, 0.53, 0.17, x, y, 2.76);
  }
  for (const z of [-6.6, 1.85]) {
    for (const y of [4.01, 8.17]) box(red, 0.16, 0.53, 0.63, 5.65, y, z);
  }
  for (const x of [-2.16, -1.08, 0, 1.08, 2.16]) {
    box(red, 0.48, 0.46, 0.15, x, 10.65, 2.08);
    box(red, 0.48, 0.46, 0.15, x, 10.65, -6.93);
  }
  add(globeShape, red, [0.31, 0.32, 0.13], [0, 12.83, 2.11]);
  add(globeShape, red, [0.31, 0.32, 0.13], [0, 12.83, -6.94]);

  for (const z of [-7.15, 2.28]) {
    box(red, 0.15, 0.68, 0.32, 0, 14.56, z);
    add(globeShape, red, [0.17, 0.26, 0.21], [0, 14.9, z]);
  }
  for (const x of [-7.15, 7.15]) {
    for (const z of [-8.82, 3.86]) box(red, 0.14, 0.64, 0.19, x, 10.0, z);
  }

  function lantern(x, top, z, drop) {
    const y = top - drop;
    addLampEmitter(model, [x, y, z], {
      color: "#ffb678", intensity: 24, range: 9, halo: 2.3,
    });
    box(ink, 0.029, drop - 0.33, 0.029, x, y + drop / 2 + 0.165, z);
    box(paper, 0.36, 0.72, 0.34, x, y, z);
    for (const dy of [-0.39, 0.39]) box(red, 0.45, 0.09, 0.43, x, y + dy, z);
    for (const dx of [-0.17, 0.17]) {
      for (const dz of [-0.17, 0.17])
        box(red, 0.037, 0.72, 0.037, x + dx, y, z + dz);
    }
  }
  for (const x of [-6.87, 6.87]) {
    for (const z of [-8.6, 3.75]) lantern(x, 9.51, z, 1.63);
  }
  for (const x of [-4.03, 4.03]) lantern(x, 4.98, 9.23, 1.29);

  const fenceY = 0.19;
  function fence(from, to) {
    const dx = to[0] - from[0];
    const dz = to[1] - from[1];
    const length = Math.hypot(dx, dz);
    const angle = -Math.atan2(dz, dx);
    for (const y of [0.6, 1.04]) {
      box(
        red,
        length,
        0.13,
        0.16,
        from[0] + dx / 2,
        y,
        from[1] + dz / 2,
        angle,
      );
    }
    const sections = Math.round(length / 1.78);
    for (let i = 0; i <= sections; i++) {
      const x = from[0] + (dx * i) / sections;
      const z = from[1] + (dz * i) / sections;
      box(red, 0.21, 1.04, 0.21, x, fenceY + 0.52, z);
      box(red, 0.3, 0.11, 0.3, x, fenceY + 1.06, z);
    }
  }
  fence([-10.52, -10.45], [10.52, -10.45]);
  fence([-10.52, -10.45], [-10.52, 10.53]);
  fence([10.52, -10.45], [10.52, 10.53]);
  fence([-10.52, 10.53], [-3.42, 10.53]);
  fence([3.42, 10.53], [10.52, 10.53]);

  function stoneLantern(x, z) {
    addLampEmitter(model, [x, 1.96, z], {
      color: "#ffb881", intensity: 16, range: 6.2, halo: 1.7,
    });
    box(rock, 1.28, 0.23, 1.28, x, 0.3, z);
    box(rock, 0.96, 0.18, 0.96, x, 0.5, z);
    add(pillarShape, rock, [0.26, 0.95, 0.26], [x, 1.02, z]);
    box(rock, 0.86, 0.2, 0.86, x, 1.61, z);
    box(rock, 0.6, 0.56, 0.6, x, 1.95, z);
    box(stonePaper, 0.3, 0.3, 0.04, x, 1.96, z + 0.313);
    box(stonePaper, 0.04, 0.3, 0.3, x + 0.313, 1.96, z);
    add(lanternRoof, rock, [0.76, 0.52, 0.76], [x, 2.38, z]);
    add(globeShape, rock, [0.17, 0.17, 0.17], [x, 2.76, z]);
  }
  for (const x of [-10.48, 10.48]) {
    for (const z of [-10.38, 10.47]) stoneLantern(x, z);
  }

  for (let i = 0; i < 12; i++) {
    box(materials.sidewalk, 2.5, 0.065, 0.58, 0, 0.229, 3.58 + i * 0.7);
  }
  for (const x of [-4.09, 4.09]) {
    const z = 5.31;
    for (const dx of [-0.96, 0.96]) {
      box(ink, 0.11, 0.53, 0.57, x + dx, 0.49, z);
      box(ink, 0.11, 0.79, 0.13, x + dx, 0.78, z - 0.25);
    }
    for (const dz of [-0.19, 0.02, 0.23])
      box(wood, 2.18, 0.09, 0.16, x, 0.77, z + dz);
    for (const y of [0.96, 1.15]) box(wood, 2.18, 0.15, 0.1, x, y, z - 0.24);
  }
  let randomSeed = 30449;
  const random = () => {
    randomSeed = (Math.imul(1664525, randomSeed) + 1013904223) >>> 0;
    return randomSeed / 2 ** 32;
  };

  function cherry(x, z, scale) {
    const bough = (from, to, radius) => {
      const direction = new THREE.Vector3(...to).sub(
        new THREE.Vector3(...from),
      );
      const mid = from.map((n, i) => (n + to[i]) / 2);
      const geometry = pillarShape
        .clone()
        .scale(radius, direction.length(), radius);
      geometry.applyQuaternion(
        new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          direction.normalize(),
        ),
      );
      add(geometry, bark, [1, 1, 1], mid);
      geometry.dispose();
    };
    bough([x, 0.23, z], [x + 0.17 * scale, 3.58 * scale, z], 0.19 * scale);
    for (let branch = 0; branch < 5; branch++) {
      const angle = (branch * Math.PI * 2) / 5 + 0.14;
      const bx = x + Math.cos(angle) * 1.18 * scale;
      const bz = z + Math.sin(angle) * 1.18 * scale;
      const top = (3.57 + random() * 0.75) * scale;
      bough([x, 2.14 * scale, z], [bx, top, bz], 0.086 * scale);
      for (let group = 0; group < 6; group++) {
        const spread = 0.48 + random() * 0.43;
        const px = bx + (random() - 0.5) * 1.38 * scale;
        const pz = bz + (random() - 0.5) * 1.39 * scale;
        const py = top + (random() - 0.37) * 0.93 * scale;
        add(
          globeShape,
          blossoms[(group + branch) % blossoms.length],
          [spread * scale, 0.54 * spread * scale, 0.79 * spread * scale],
          [px, py, pz],
          random() * Math.PI,
        );
      }
    }
  }
  cherry(8.12, 1.84, 1.08);
  cherry(-7.76, 5.78, 0.85);
  cherry(7.43, -7.25, 0.66);

  for (const [x, z] of [
    [-8.58, -6.45],
    [8.7, 7.86],
    [-6.1, 9.16],
    [8.37, -2.38],
    [-8.55, 1.51],
  ]) {
    for (let i = 0; i < 5; i++) {
      const dx = (random() - 0.5) * 1.2;
      const dz = (random() - 0.5) * 1.2;
      add(
        globeShape,
        i % 2 ? jade : moss,
        [0.41, 0.27, 0.33],
        [x + dx, 0.34, z + dz],
        random(),
      );
      add(
        globeShape,
        blossoms[2 + (i % 3)],
        [0.12, 0.079, 0.1],
        [x + dx, 0.58, z + dz],
        random(),
      );
    }
  }

  for (const { material, geometries } of batches.values()) {
    const geometry = mergeGeometries(geometries);
    for (const part of geometries) part.dispose();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    model.add(mesh);
  }
}
