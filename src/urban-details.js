import * as THREE from "three";
import { markNightLight } from "./daylight.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const cube = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
const shrub = new THREE.IcosahedronGeometry(1, 0);
const paint = (color, roughness = 0.88) =>
  new THREE.MeshStandardMaterial({ color, roughness });

function facadeDetails(model, height) {
  const groups = new Map();

  function add(source, material, w, h, d, x, y, z) {
    const phase =
      y < height * 0.12 ? "base" : y < height * 0.63 ? "body" : "top";
    const key = `${material.id}-${phase}`;
    if (!groups.has(key)) groups.set(key, { material, parts: [] });
    groups
      .get(key)
      .parts.push(source.clone().scale(w, h, d).translate(x, y, z));
  }

  const box = (material, w, h, d, x, y, z) =>
    add(cube, material, w, h, d, x, y, z);

  function plants(material, w, h, d, x, y, z) {
    add(shrub, material, w, h, d, x, y, z);
  }

  function window(side, front, x, y, width, tall, glass, frame, bars = 1) {
    const pane = (material, span, rise, thick, at, depth) => {
      const surface = front + Math.sign(side) * depth;
      if (Math.abs(side) === 1)
        box(material, span, rise, thick, at, y, surface);
      else box(material, thick, rise, span, surface, y, at);
    };
    pane(frame, width, tall, 0.11, x, 0.032);
    pane(glass, width - 0.15, tall - 0.17, 0.063, x, 0.074);
    for (let index = 1; index <= bars; index++) {
      const divider = x - width / 2 + (width * index) / (bars + 1);
      pane(frame, 0.07, tall - 0.15, 0.065, divider, 0.11);
    }
  }

  function finish() {
    for (const { material, parts } of groups.values()) {
      const geometry = mergeGeometries(parts);
      for (const part of parts) part.dispose();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      model.add(mesh);
    }
  }
  return { box, plants, window, finish };
}

export function addUrbanDetails(models) {
  const wood = paint("#a67448", 0.91);
  const darkMetal = paint("#344744", 0.66);
  const paleFrame = paint("#ece6d6", 0.8);
  const olive = paint("#7c9156");
  const sage = paint("#536c43");
  const planter = paint("#a6553d");
  const glazing = markNightLight(paint("#4a8595", 0.36), 1.32);
  const skyGlass = markNightLight(paint("#42758b", 0.28), 1.5);
  const slateGlass = markNightLight(paint("#2e536e", 0.38), 0.95);
  const railing = paint("#63939a", 0.55);
  const canvasShade = paint("#cac38f");

  const patio = facadeDetails(models.courtyard, 4.12);
  patio.box(wood, 4.35, 0.11, 4.34, 1.83, 0.315, 0.8);
  patio.window(1, 3.1, -2.75, 1.98, 3.28, 2.33, glazing, darkMetal, 2);
  patio.window(1, -1.5, 2.33, 1.94, 4.15, 2.56, glazing, darkMetal, 3);
  patio.window(-1, -4.0, 2.72, 1.95, 2.86, 2.17, glazing, darkMetal, 2);
  patio.window(2, 4.715, -2.69, 2.15, 1.52, 1.57, glazing, darkMetal, 1);
  patio.box(darkMetal, 4.8, 0.19, 0.19, 1.84, 3.11, 2.85);
  patio.box(darkMetal, 0.19, 2.73, 0.19, 4.15, 1.68, 2.85);
  for (let offset = 0; offset < 9; offset++) {
    patio.box(wood, 0.18, 0.17, 4.45, -0.47 + offset * 0.56, 3.22, 0.67);
  }
  patio.box(wood, 3.3, 2.33, 0.13, -2.75, 1.5, -3.37);
  patio.box(canvasShade, 1.98, 0.22, 1.15, 1.97, 0.91, 1.26);
  patio.box(darkMetal, 0.18, 0.52, 0.66, 1.97, 0.57, 1.26);
  patio.box(paleFrame, 3.82, 0.38, 0.78, 2.03, 0.46, 3.67);
  for (let offset = 0; offset < 7; offset++) {
    patio.plants(
      offset % 2 ? sage : olive,
      0.28,
      0.39,
      0.28,
      0.55 + offset * 0.49,
      0.92 - (offset % 3) * 0.07,
      3.67,
    );
  }
  patio.finish();

  const terrace = facadeDetails(models.terrace, 6.95);
  terrace.window(1, 2.85, 0.55, 1.8, 4.68, 2.46, glazing, darkMetal, 3);
  terrace.window(1, 2.85, -2.91, 1.57, 1.22, 2.55, skyGlass, darkMetal, 0);
  terrace.window(1, 1.805, 0.39, 4.56, 6.65, 1.93, skyGlass, darkMetal, 4);
  terrace.window(-1, -3.045, 0.37, 4.54, 6.25, 1.93, glazing, darkMetal, 4);
  terrace.window(2, 4.13, -0.68, 4.64, 3.4, 1.67, glazing, darkMetal, 2);
  terrace.window(-2, -3.57, -1.0, 4.61, 3.21, 1.68, glazing, darkMetal, 2);
  terrace.box(railing, 7.89, 0.69, 0.065, 0.2, 3.915, 4.05);
  terrace.box(darkMetal, 8.05, 0.087, 0.097, 0.2, 4.27, 4.06);
  for (const x of [-3.74, -1.78, 0.18, 2.14, 4.1]) {
    terrace.box(darkMetal, 0.073, 0.72, 0.088, x, 3.92, 4.075);
  }
  terrace.box(paleFrame, 2.74, 0.28, 1.1, 2.6, 6.13, -0.81);
  terrace.box(sage, 2.47, 0.07, 0.86, 2.6, 6.3, -0.81);
  for (let offset = 0; offset < 5; offset++) {
    terrace.plants(
      offset % 2 ? sage : olive,
      0.27,
      0.31 + (offset % 2) * 0.2,
      0.28,
      1.65 + offset * 0.47,
      6.5,
      -0.81,
    );
  }
  terrace.box(slateGlass, 2.85, 0.13, 1.65, -1.53, 6.08, -1.36);
  for (const x of [-2.4, -1.53, -0.66]) {
    terrace.box(paleFrame, 0.026, 0.025, 1.63, x, 6.153, -1.36);
  }
  terrace.finish();

  const varandas = facadeDetails(models.varandas, 16.8);
  varandas.window(1, 3.245, -2.45, 1.72, 2.32, 2.85, glazing, darkMetal, 1);
  varandas.window(1, 3.245, 1.17, 1.68, 3.25, 2.42, glazing, darkMetal, 2);
  varandas.box(paleFrame, 3.25, 0.24, 1.65, -2.4, 3.02, 3.83);
  for (let floor = 0; floor < 5; floor++) {
    const level = 0.26 + floor * 3;
    varandas.window(
      2,
      4.23,
      -0.52,
      level + 1.65,
      5.35,
      1.75,
      glazing,
      darkMetal,
      3,
    );
    varandas.window(
      -2,
      -4.1,
      -0.56,
      level + 1.65,
      5.32,
      1.75,
      glazing,
      darkMetal,
      3,
    );
    varandas.window(
      -1,
      -4.405,
      0,
      level + 1.65,
      6.13,
      1.77,
      glazing,
      darkMetal,
      4,
    );
    if (!floor) continue;
    varandas.window(
      1,
      3.245,
      -1.76,
      level + 1.49,
      2.87,
      2.18,
      glazing,
      darkMetal,
      1,
    );
    varandas.window(
      1,
      3.245,
      1.51,
      level + 1.49,
      2.87,
      2.18,
      glazing,
      darkMetal,
      1,
    );
    varandas.box(paleFrame, 7.52, 0.25, 1.83, -0.18, level + 0.12, 3.93);
    varandas.box(railing, 6.45, 0.7, 0.06, -0.19, level + 0.6, 4.78);
    varandas.box(darkMetal, 6.61, 0.09, 0.09, -0.19, level + 0.96, 4.8);
    varandas.box(paleFrame, 0.15, 0.93, 1.45, -0.14, level + 0.67, 3.9);
    for (const x of [-3.26, 2.9]) {
      varandas.box(planter, 0.48, 0.37, 0.56, x, level + 0.43, 4.18);
      varandas.plants(
        floor % 2 ? sage : olive,
        0.3,
        0.43,
        0.31,
        x,
        level + 0.87,
        4.18,
      );
    }
  }
  varandas.box(olive, 2.6, 0.25, 2.3, -2.04, 15.58, -1.1);
  varandas.finish();

  const tower = facadeDetails(models.mirante, 23.0);
  tower.window(1, 3.4, 0.55, 1.66, 5.8, 2.52, glazing, darkMetal, 3);
  tower.window(1, 3.47, -3.36, 1.65, 1.29, 2.51, skyGlass, darkMetal, 1);
  for (let floor = 1; floor < 7; floor++) {
    const level = 0.32 + floor * 3.04;
    const glass = floor % 2 ? skyGlass : slateGlass;
    tower.window(1, 3.4, 0.47, level + 1.39, 6.08, 2.56, glass, darkMetal, 4);
    tower.window(
      2,
      4.025,
      -0.23,
      level + 1.39,
      6.62,
      2.56,
      glazing,
      darkMetal,
      4,
    );
    tower.window(-1, -4.12, 0.5, level + 1.39, 5.34, 2.54, glass, darkMetal, 3);
    tower.window(
      -2,
      -4.16,
      -0.32,
      level + 1.39,
      5.51,
      2.5,
      glass,
      darkMetal,
      3,
    );
    tower.box(paleFrame, 7.03, 0.16, 0.34, 0.58, level + 0.019, 3.5);
    tower.box(paleFrame, 0.29, 0.16, 7.06, 4.14, level + 0.019, -0.2);
  }
  tower.box(paleFrame, 0.21, 18.28, 0.55, 3.93, 12.23, 3.45);
  tower.box(paleFrame, 0.21, 18.28, 0.51, -2.61, 12.23, 3.45);
  tower.box(slateGlass, 2.86, 0.19, 2.4, -1.66, 21.82, -0.67);
  tower.box(olive, 5.72, 0.21, 0.76, 0.95, 21.84, 2.77);
  tower.finish();
}
