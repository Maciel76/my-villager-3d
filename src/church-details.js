import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { projectTexture } from "./assets.js";

const cube = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
const disc = new THREE.CylinderGeometry(1, 1, 1, 20)
  .rotateX(Math.PI / 2)
  .toNonIndexed();

function archedPanel(width, height) {
  const half = width / 2;
  const low = -height / 2;
  const spring = height / 2 - half;
  const shape = new THREE.Shape()
    .moveTo(-half, low)
    .lineTo(half, low)
    .lineTo(half, spring)
    .absarc(0, spring, half, 0, Math.PI, false)
    .lineTo(-half, low);
  return new THREE.ExtrudeGeometry(shape, {
    depth: 0.075,
    bevelEnabled: false,
    curveSegments: 8,
  });
}

export function addChurchDetails(model, materials) {
  const cream = materials.lime;
  const graphite = new THREE.MeshStandardMaterial({
    color: "#333d3b",
    roughness: 0.83,
  });
  const panes = new THREE.MeshStandardMaterial({
    color: "#4f7278",
    roughness: 0.56,
    metalness: 0.04,
  });
  const darkGold = new THREE.MeshStandardMaterial({
    color: "#a6813d",
    roughness: 0.46,
    metalness: 0.27,
  });
  const bellMetal = new THREE.MeshStandardMaterial({
    color: "#b18a49",
    roughness: 0.4,
    metalness: 0.42,
  });
  const groups = new Map();

  function add(source, material, scales, x, y, z, yaw = 0) {
    const phase = y < 4.05 ? "base" : y < 16.16 ? "body" : "roof";
    const key = `${material.id}-${phase}`;
    if (!groups.has(key)) groups.set(key, { material, parts: [] });
    const geometry = source
      .clone()
      .scale(...scales)
      .rotateY(yaw)
      .translate(x, y, z);
    if (material.map) projectTexture(geometry);
    groups.get(key).parts.push(geometry);
  }
  const box = (material, w, h, d, x, y, z, yaw = 0) =>
    add(cube, material, [w, h, d], x, y, z, yaw);

  function facePoint(x, z, angle, across, forward) {
    return [
      x + Math.cos(angle) * across + Math.sin(angle) * forward,
      z - Math.sin(angle) * across + Math.cos(angle) * forward,
    ];
  }
  function faceBox(material, w, h, d, x, y, z, angle, across = 0, forward = 0) {
    const [tx, tz] = facePoint(x, z, angle, across, forward);
    box(material, w, h, d, tx, y, tz, angle);
  }

  const arch = archedPanel(1.26, 2.12);
  function window(x, y, z, yaw, scale = 1, rounded = true) {
    if (rounded) {
      add(arch, cream, [scale, scale, 1], x, y, z, yaw);
      const [gx, gz] = facePoint(x, z, yaw, 0, 0.087);
      add(arch, panes, [0.79 * scale, 0.85 * scale, 1], gx, y, gz, yaw);
    } else {
      faceBox(cream, 1.23 * scale, 1.8 * scale, 0.14, x, y, z, yaw, 0, 0.019);
      faceBox(panes, 1.01 * scale, 1.57 * scale, 0.1, x, y, z, yaw, 0, 0.099);
    }
    faceBox(
      cream,
      0.075 * scale,
      1.5 * scale,
      0.04,
      x,
      y - 0.07 * scale,
      z,
      yaw,
      0,
      0.167,
    );
    faceBox(
      cream,
      0.95 * scale,
      0.075 * scale,
      0.04,
      x,
      y + 0.14 * scale,
      z,
      yaw,
      0,
      0.166,
    );
    faceBox(
      cream,
      1.48 * scale,
      0.14 * scale,
      0.26,
      x,
      y - (rounded ? 1.05 : 0.89) * scale,
      z,
      yaw,
      0,
      0.082,
    );
  }

  function pilaster(x, z, yaw) {
    faceBox(cream, 0.36, 3.97, 0.19, x, 2.73, z, yaw, 0, 0.08);
    faceBox(cream, 0.61, 0.32, 0.28, x, 0.64, z, yaw, 0, 0.1);
    faceBox(cream, 0.6, 0.24, 0.29, x, 4.76, z, yaw, 0, 0.105);
  }
  for (const x of [-7.82, -5.97, -2.22, 2.22, 5.97, 7.82]) pilaster(x, 8.01, 0);
  for (const x of [-4.67, 4.67]) window(x, 2.73, 8.015, 0, 0.92);
  faceBox(cream, 0.22, 3.2, 0.26, 0, 1.98, 8.11, 0, -1.47);
  faceBox(cream, 0.22, 3.2, 0.26, 0, 1.98, 8.11, 0, 1.47);
  faceBox(cream, 3.21, 0.26, 0.36, 0, 3.58, 8.145, 0);
  faceBox(cream, 3.35, 0.18, 0.27, 0, 3.91, 8.145, 0);
  for (const x of [-0.85, 0, 0.85]) box(graphite, 0.11, 2.94, 0.12, x, 2, 8.19);
  for (const y of [1.13, 2.42]) box(graphite, 2.69, 0.12, 0.12, 0, y, 8.19);
  for (const x of [-0.18, 0.18]) box(darkGold, 0.09, 0.24, 0.1, x, 1.77, 8.25);
  for (const direction of [-1, 1]) {
    const side = (direction * Math.PI) / 2;
    for (const z of [-7.1, -5.06, -3, -0.94, 1.12, 2.68])
      pilaster(direction * 6.57, z, side);
    for (const z of [-6.12, -4.03, -1.97, 0.1, 1.95])
      window(direction * 6.565, 2.79, z, side, 0.88, false);
    for (const z of [-6.22, -3.4, -0.6])
      window(direction * 5.32, 8.46, z, side, 0.9, false);
    window(direction * 8.19, 2.67, 5.55, side, 0.96);
  }
  for (const x of [-3.55, 0, 3.55]) {
    window(x, 8.5, 0.735, 0, 0.87, false);
    window(x, 8.5, -7.54, Math.PI, 0.87, false);
  }
  for (const yaw of [Math.PI * 0.63, Math.PI, Math.PI * 1.37]) {
    window(Math.sin(yaw) * 4.08, 2.76, -7.1 + Math.cos(yaw) * 4.08, yaw, 0.83);
  }

  // Limestone voussoirs follow the opening carved through the SolidCraft tower.
  const bellZ = 5.18;
  for (const yaw of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
    const [x, z] = facePoint(0, bellZ, yaw, 0, 2.938);
    for (let i = 0; i < 11; i++) {
      const a = (i * Math.PI) / 11 + 0.014;
      const b = ((i + 1) * Math.PI) / 11 - 0.014;
      const inside = 1.6;
      const outside = i === 5 ? 2.1 : 2.015;
      const wedge = new THREE.Shape()
        .moveTo(Math.cos(a) * inside, Math.sin(a) * inside)
        .lineTo(Math.cos(a) * outside, Math.sin(a) * outside)
        .absarc(0, 0, outside, a, b, false)
        .lineTo(Math.cos(b) * inside, Math.sin(b) * inside)
        .absarc(0, 0, inside, b, a, true);
      const stone = new THREE.ExtrudeGeometry(wedge, {
        depth: 0.16,
        bevelEnabled: false,
        curveSegments: 2,
      });
      add(stone, cream, [1, 1, 1], x, 13.435, z, yaw);
      stone.dispose();
    }
    for (const across of [-2.26, 2.26]) {
      faceBox(cream, 1.31, 0.23, 0.29, x, 13.39, z, yaw, across, 0.059);
      const [ox, oz] = facePoint(x, z, yaw, across, 0.068);
      add(disc, cream, [0.223, 0.223, 0.1], ox, 15.56, oz, yaw);
      const [ix, iz] = facePoint(x, z, yaw, across, 0.147);
      add(disc, graphite, [0.131, 0.131, 0.057], ix, 15.56, iz, yaw);
    }
    const [rx, rz] = facePoint(0, bellZ, yaw, 0, 2.72);
    faceBox(graphite, 3.052, 0.07, 0.082, rx, 11.86, rz, yaw);
    faceBox(graphite, 3.052, 0.08, 0.084, rx, 11.05, rz, yaw);
    for (let bar = -5; bar <= 5; bar++) {
      faceBox(graphite, 0.045, 0.8, 0.053, rx, 11.45, rz, yaw, bar * 0.254);
    }
  }
  const bellProfile = [
    [0.83, 0],
    [0.82, 0.12],
    [0.63, 0.26],
    [0.51, 0.68],
    [0.46, 1.27],
    [0.39, 1.52],
    [0.25, 1.68],
    [0.15, 1.72],
    [0.12, 1.59],
    [0.36, 1.49],
    [0.39, 1.22],
    [0.42, 0.73],
    [0.55, 0.27],
    [0.69, 0.06],
    [0.7, 0],
    [0.83, 0],
  ];
  const bell = new THREE.LatheGeometry(
    bellProfile.map(([r, y]) => new THREE.Vector2(r, y)),
    24,
  );
  const bellGeometry = bell.index ? bell.toNonIndexed() : bell;
  add(bellGeometry, bellMetal, [1, 1, 1], 0, 12.05, bellZ);
  if (bellGeometry !== bell) bellGeometry.dispose();
  bell.dispose();
  box(graphite, 3.18, 0.25, 0.31, 0, 14.31, bellZ);
  box(darkGold, 0.14, 0.65, 0.14, 0, 13.97, bellZ);
  box(darkGold, 0.2, 0.2, 0.2, 0, 12.02, bellZ);

  const domeZ = -3.4;
  const faceRadius = 4.27 * Math.cos(Math.PI / 8);
  for (let i = 0; i < 8; i++) {
    const yaw = (i * Math.PI) / 4;
    const [x, z] = facePoint(0, domeZ, yaw, 0, faceRadius + 0.012);
    window(x, 12.02, z, yaw, 0.68);
    const edge = yaw + Math.PI / 8;
    const [px, pz] = facePoint(0, domeZ, edge, 0, 4.267);
    box(cream, 0.22, 1.91, 0.19, px, 12.02, pz, edge);
  }
  for (const [radius, y] of [
    [4.17, 13.9],
    [3.72, 14.74],
    [2.973, 15.48],
    [1.82, 16.02],
  ]) {
    for (let i = 0; i < 8; i++) {
      const yaw = (i * Math.PI) / 4;
      const [x, z] = facePoint(
        0,
        domeZ,
        yaw,
        0,
        radius * Math.cos(Math.PI / 8),
      );
      box(
        darkGold,
        radius * 2 * Math.sin(Math.PI / 8),
        0.072,
        0.062,
        x,
        y,
        z,
        yaw,
      );
    }
  }
  arch.dispose();

  for (const { material, parts } of groups.values()) {
    const merged = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    const result = new THREE.Mesh(merged, material);
    result.castShadow = true;
    result.receiveShadow = true;
    model.add(result);
  }
}
