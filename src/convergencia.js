import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { markNightLight } from "./daylight.js";
import { addLampEmitter } from "./night-lights.js";
import { STELLAR_ALTITUDE } from "./stellar-event.js";

const TAU = Math.PI * 2;
export const convergence = {
  radius: 35.7,
  sunY: 20.9,
  sunRadius: 4.08,
  crownY: 40.5,
  crownRadius: 12.55,
  beamHeight: STELLAR_ALTITUDE,
  ringRadii: [10.32, 8.05, 6.06],
};

export const radial = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
const azimuth = (index) => Math.PI / 2 + TAU * index / 3;
export const circleOutline = (r, segments = 112, x = 0, z = 0) =>
  Array.from({ length: segments }, (_, i) => {
    const [dx, dz] = radial(r, TAU * i / segments);
    return [x + dx, z + dz];
  });

export function lagoonOutline(angle, outer = 30.9, inner = 14.2, span = .79) {
  const stations = Array.from({ length: 39 }, (_, i) => angle - span / 2 + span * i / 38);
  const outside = stations.map((a, i) => radial(outer - .61 * Math.cos(i * TAU / 38), a));
  const inside = [...stations].reverse().map((a, i) => radial(inner + .60 * Math.cos(i * TAU / 38), a));
  return [...outside, ...inside];
}

const ribProfiles = {
  outer: {
    curve: [[31.4, .94], [28.8, 6.6], [25.24, 12.56], [21.68, 18.74], [17.2, 24.6],
      [12.1, 29.5], [7.22, 32.66], [4.82, 35.78]],
    width: 2.52, thickness: 1.05,
  },
  inner: {
    curve: [[21.0, 2.57], [16.32, 6.49], [12.50, 11.28], [11.36, 16.55], [11.06, 22.0],
      [7.97, 28.3], [4.49, 34.26], [2.88, 39.54]],
    width: 1.68, thickness: .75,
  },
  entry: {
    curve: [[13.52, 2.32], [9.17, 4.54], [6.27, 7.46], [4.1, 10.28], [1.65, 13.15]],
    width: 1.64, thickness: .64,
  },
};

export function convergenceRibs() {
  return Object.entries(ribProfiles).flatMap(([type, spec]) =>
    Array.from({ length: 3 }, (_, i) => {
      const angle = azimuth(i) + ({ outer: -Math.PI / 3, inner: -Math.PI / 4.4, entry: 0 })[type];
      const path = new THREE.CatmullRomCurve3(spec.curve.map(([r, y]) => {
        const [x, z] = radial(r, angle);
        return new THREE.Vector3(x, y, z);
      }));
      return { type, angle, path, width: spec.width, thickness: spec.thickness };
    }),
  );
}

export function convergenceSection(rib, t) {
  const center = rib.path.getPoint(t);
  const tangent = rib.path.getTangent(t);
  const across = new THREE.Vector3(Math.sin(rib.angle), 0, -Math.cos(rib.angle));
  const face = across.clone().cross(tangent).normalize();
  const width = rib.width * (.26 + .74 * (1 - t) ** .73);
  const depth = rib.thickness * (.31 + .69 * (1 - t) ** 1.08);
  return { center, across, face, width, depth };
}

export function convergenceFalls() {
  return Array.from({ length: 3 }, (_, i) => azimuth(i)).flatMap(angle =>
    [-.29, .29].flatMap(offset => [
      { angle: angle + offset, r: 18.0, top: 3.08, bottom: 1.8, width: 4.3 },
      { angle: angle + offset, r: 21.7, top: 1.80, bottom: .99, width: 5.1 },
    ]),
  );
}

function palette() {
  const paint = (color, roughness = .72, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  function light(color, emission, strength, base = .12) {
    const material = paint(color, .41, .065);
    material.emissive.set(emission);
    material.emissiveIntensity = base;
    markNightLight(material, strength);
    material.emissive.set(emission);
    return material;
  }
  return {
    basalt: paint("#434658", .81),
    dark: paint("#252e42", .62, .15),
    ash: paint("#747b85", .82),
    limestone: paint("#c0b2a7", .66, .07),
    ivory: paint("#e0cfc3", .55, .09),
    bronze: paint("#a16a43", .52, .36),
    gold: paint("#d29954", .41, .41),
    paving: paint("#a89682", .83),
    tile: [paint("#bea891"), paint("#ae9d8c"), paint("#c5b4a1")],
    foliage: [paint("#3c5b4e"), paint("#557354"), paint("#829365"), paint("#2e4941")],
    soil: paint("#505541"),
    water: paint("#145777", .27, .21),
    ripple: paint("#5f9eb1", .46, .12),
    goldLight: light("#fdb16d", "#ffb44e", 2.25, .21),
    blueLight: light("#64a3d8", "#499aff", 1.15, .14),
    lobby: light("#cdab82", "#ffb870", .97, .08),
    glass: new THREE.MeshStandardMaterial({
      color: "#8babc4", opacity: .23, transparent: true, depthWrite: false, roughness: .29, side: THREE.DoubleSide,
    }),
  };
}

function build(model) {
  const batches = new Map();
  const cube = new THREE.BoxGeometry();
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
  const flora = new THREE.IcosahedronGeometry(1, 1);
  const rock = new THREE.IcosahedronGeometry(1, 0);
  const up = new THREE.Vector3(0, 1, 0);

  function mesh(material, geometry, ground = false) {
    const key = [material.uuid, ground, Object.keys(geometry.attributes).sort().join(",")].join("|");
    if (!batches.has(key)) batches.set(key, { material, ground, parts: [] });
    if (!geometry.index) {
      const length = geometry.attributes.position.count;
      geometry.setIndex(Array.from({ length }, (_, index) => index));
    }
    batches.get(key).parts.push(geometry);
  }

  function outline(points) {
    const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
    shape.closePath();
    return shape;
  }

  function slab(material, points, y, height, inner, ground = false) {
    const shape = outline(points);
    if (inner) shape.holes.push(outline(inner));
    mesh(material, new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false })
      .rotateX(-Math.PI / 2).translate(0, y, 0), ground);
  }

  function ring(material, outer, inner, y, height) {
    slab(material, circleOutline(outer), y, height, inner ? circleOutline(inner) : undefined);
  }

  function block(material, x, y, z, w, h, d, angle = 0, ground = false) {
    mesh(material, cube.clone().scale(w, h, d).rotateY(angle).translate(x, y, z), ground);
  }

  function post(material, x, y, z, r, h) {
    mesh(material, cylinder.clone().scale(r, h, r).translate(x, y, z));
  }

  function stem(material, from, to, r) {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    const axis = b.clone().sub(a);
    const length = axis.length();
    mesh(material, cylinder.clone().scale(r, length, r).applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(up, axis.normalize()),
    ).translate(...a.lerp(b, .5)));
  }

  function tube(material, points, r, closed = false) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), closed);
    mesh(material, new THREE.TubeGeometry(curve, points.length * 2, r, 7, closed));
  }

  function surface(material, positions, indices) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    mesh(material, geometry);
  }

  function mound(material, x, y, z, w, h, d, angular = 0, leafy = true) {
    mesh(material, (leafy ? flora : rock).clone().scale(w, h, d).rotateY(angular).translate(x, y, z));
  }

  function finish() {
    for (const { material, ground, parts } of batches.values()) {
      const geometry = mergeGeometries(parts);
      parts.forEach(part => part.dispose());
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.groundCover = ground;
      mesh.castShadow = !ground && !material.transparent && !material.userData.nightGlow;
      mesh.receiveShadow = !material.transparent;
      model.add(mesh);
    }
  }
  return { mesh, slab, ring, block, post, stem, tube, surface, mound, finish };
}

function drawRib(builder, m, rib) {
  const positions = [], indices = [], channel = [], margin = [], stripe = [];
  const count = 72;
  for (let i = 0; i <= count; i++) {
    const { center, across, face, width, depth } = convergenceSection(rib, i / count);
    const coordinate = (x, y) => center.clone().addScaledVector(across, width * x)
      .addScaledVector(face, depth * y).toArray();
    for (const [x, y] of [[-1, .85], [1, .85], [1, -.73], [-1, -.73]])
      positions.push(...coordinate(x, y));
    channel.push(coordinate(-.68, .908));
    margin.push(coordinate(.94, .82));
    stripe.push(...coordinate(-.33, .892), ...coordinate(.49, .892));
    if (i >= count) continue;
    for (let p = 0; p < 4; p++) {
      const a = i * 4 + p, b = i * 4 + (p + 1) % 4;
      indices.push(a, b, a + 4, b, b + 4, a + 4);
    }
  }
  const end = count * 4;
  indices.push(0, 2, 1, 0, 3, 2, end, end + 1, end + 2, end, end + 2, end + 3);
  builder.surface(rib.type === "inner" ? m.limestone : m.ivory, positions, indices);
  const inlay = [];
  for (let i = 0; i < count * 2; i += 2) inlay.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
  builder.surface(m.dark, stripe, inlay);
  builder.tube(m.goldLight, channel, rib.type === "entry" ? .066 : .082);
  builder.tube(m.bronze, margin, .083);
  if (rib.type === "inner") {
    for (let i = 0; i < 17; i++) {
      const { center, across, face, width, depth } = convergenceSection(rib, (i + 3) / 24);
      const start = center.clone().addScaledVector(across, width * -.25).addScaledVector(face, depth * .939);
      const finish = center.clone().addScaledVector(across, width * .44).addScaledVector(face, depth * .939);
      builder.stem(i % 4 === 0 ? m.goldLight : m.blueLight, start.toArray(), finish.toArray(), .038);
    }
  }
}

function rotunda(builder, m, light) {
  builder.ring(m.basalt, 12.35, 0, 1.05, 2.74);
  builder.ring(m.limestone, 9.6, 0, 3.77, .37);
  builder.ring(m.gold, 9.52, 9.37, 4.12, .12);
  builder.ring(m.ash, 5.91, 0, 4.15, .57);
  builder.ring(m.bronze, 3.65, 0, 4.72, .68);
  builder.ring(m.dark, 2.18, 0, 5.38, .25);
  builder.ring(m.goldLight, 1.97, 1.76, 5.59, .11);
  builder.ring(m.blueLight, 1.66, 1.51, 5.61, .07);
  for (let i = 0; i < 60; i++) {
    const angle = i / 60 * TAU;
    const [x, z] = radial(11.78, angle);
    const trim = i % 5 === 0 ? m.bronze : m.dark;
    builder.block(trim, x, 2.29, z, .11, 2.41, .204, -angle);
    if (i % 3 !== 0) {
      const [px, pz] = radial(11.70, angle + .052);
      builder.block(i % 5 < 2 ? m.lobby : m.dark, px, 2.31, pz, .16, 1.74, 1.14, -angle);
    }
  }

  for (let i = 0; i < 3; i++) {
    const a = azimuth(i);
    const [x, z] = radial(12.55, a);
    const yaw = Math.PI / 2 - a;
    builder.block(m.dark, x, 2.21, z, 6.32, 2.39, .45, yaw);
    const [ax, az] = radial(.27, a);
    builder.block(m.glass, x + ax, 2.29, z + az, 5.38, 2.35, .041, yaw);
    const arch = [
      [-2.70, 1.31], [-2.60, 2.41], [-2.03, 3.36], [-.95, 4.24], [0, 5.26],
      [.95, 4.24], [2.03, 3.36], [2.60, 2.41], [2.70, 1.31],
    ];
    const towardEntry = (width, y, depth) => {
      const [dx, dz] = radial(width, a - Math.PI / 2);
      const [ox, oz] = radial(depth, a);
      return [x + dx + ox, y, z + dz + oz];
    };
    const glassArch = arch.flatMap(([u, y]) => towardEntry(u, y, .20));
    glassArch.push(...towardEntry(0, 2.33, .20));
    const fan = arch.slice(1).flatMap((_, n) => [arch.length, n, n + 1]);
    fan.push(arch.length, arch.length - 1, 0);
    builder.surface(m.glass, glassArch, fan);
    builder.tube(m.bronze, arch.map(([u, y]) => towardEntry(u, y, .33)), .13);
    builder.tube(m.goldLight, arch.map(([u, y]) => towardEntry(u * .94, y, .45)), .072);
    for (const dx of [-2.5, -1.15, 0, 1.15, 2.5]) {
      const [dxWorld, dzWorld] = radial(dx, a - Math.PI / 2);
      builder.block(m.lobby, x + dxWorld, 2.26, z + dzWorld, .90, 1.88, .16, yaw);
    }
    light([x + ax, 2.31, z + az], 49, 9.1);
  }
  light([0, 8.2, 0], 104, 18.5, "#79bdff", .9);
  light([0, convergence.sunY - .04, 0], 420, 27, "#ffc06a");
}

function landscaping(builder, m, light) {
  let seed = 63049;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  function shrub(x, y, z, size) {
    for (let j = 0; j < 5; j++) {
      const a = j * 2.4 + random() * .4;
      const radius = size * (.32 + random() * .25);
      builder.mound(m.foliage[j % 4], x + .42 * size * Math.cos(a), y + radius * .53,
        z + .42 * size * Math.sin(a), radius, .61 * radius, .78 * radius, a);
    }
  }
  function tree(x, y, z, size) {
    const top = [x + .16 * size, y + 2.4 * size, z - .04 * size];
    builder.stem(m.bronze, [x, y, z], top, .093 * size);
    for (let i = 0; i < 7; i++) {
      const angle = i * 2.4;
      const spread = (.31 + random() * .42) * size;
      const [dx, dz] = radial(spread, angle);
      const yy = top[1] - random() * .73 * size;
      builder.mound(m.foliage[i % 4], top[0] + dx, yy, top[2] + dz,
        .57 * size, .62 * size, .50 * size, angle);
    }
  }
  function lantern(x, z) {
    builder.block(m.dark, x, 1.087, z, .62, .25, .62);
    builder.block(m.bronze, x, 1.43, z, .13, .54, .13);
    builder.block(m.goldLight, x, 1.825, z, .46, .57, .46);
    builder.block(m.dark, x, 2.13, z, .55, .095, .55);
    for (const dx of [-.226, .226]) for (const dz of [-.226, .226])
      builder.block(m.bronze, x + dx, 1.824, z + dz, .042, .57, .042);
    light([x, 1.78, z], 24, 7.5, "#ffc46e", .91);
  }

  for (let i = 0; i < 3; i++) {
    const a = azimuth(i);
    for (const side of [-1, 1]) {
      for (let j = 0; j < 13; j++) {
        const angle = a + side * (.43 + j * .035);
        const radius = 29.3 + random() * 2.4;
        const [x, z] = radial(radius, angle);
        shrub(x, 1.045, z, .72 + random() * .49);
        if (j % 5 === 2) tree(x, 1.02, z, .75 + random() * .24);
      }
      for (const r of [19.4, 31.4]) {
        const [x, z] = radial(r, a + side * .134);
        lantern(x, z);
      }
      for (let j = 0; j < 7; j++) {
        const [x, z] = radial(15.56 + random() * 1.4, a + side * (.29 + j * .046));
        shrub(x, 3.08, z, .52 + random() * .27);
        if (j % 3 === 1) tree(x, 3.08, z, .52 + random() * .19);
      }
    }
    for (let j = 0; j < 10; j++) {
      const x = 14.1 + j * .86;
      const [px, pz] = radial(x, a + .62);
      builder.mound(m.ash, px, 1.2, pz, .72, .51, .86, j, false);
    }
  }
}

function plaza(builder, m, light) {
  builder.slab(m.basalt, circleOutline(convergence.radius), 0, .73, undefined, true);
  builder.ring(m.ash, 35.33, 0, .73, .20);
  builder.ring(m.limestone, 34.99, 30.26, .93, .13);
  builder.ring(m.paving, 32.46, 31.24, 1.06, .045);
  builder.ring(m.gold, 34.38, 34.28, 1.058, .043);
  builder.ring(m.goldLight, 32.94, 32.88, 1.06, .047);
  builder.ring(m.dark, 24.33, 0, .928, .18);
  builder.ring(m.ash, 21.48, 0, 1.108, .56);
  builder.ring(m.limestone, 21.62, 21.44, 1.64, .09);
  builder.ring(m.limestone, 17.75, 0, 1.66, 1.40);
  builder.ring(m.bronze, 17.82, 17.69, 3.01, .05);
  builder.ring(m.goldLight, 16.75, 16.69, 3.07, .048);

  for (let i = 0; i < 3; i++) {
    const a = azimuth(i);
    const yaw = Math.PI / 2 - a;
    builder.slab(m.water, lagoonOutline(a, 30.9, 13.55, 1.81), 1.113, .048);
    builder.tube(m.bronze, lagoonOutline(a, 31.0, 13.48, 1.82).map(([x, z]) => [x, 1.17, z]), .061, true);
    for (const side of [-1, 1]) {
      const bed = lagoonOutline(a + side * .43, 17.33, 15.34, .29);
      builder.slab(m.ash, bed, 3.055, .15);
      builder.slab(m.soil, lagoonOutline(a + side * .43, 17.14, 15.49, .255), 3.205, .028);
    }
    for (let j = 0; j < 23; j++) {
      const angle = a + Math.cos(j * 2.86) * .79;
      const [x, z] = radial(22.8 + Math.sin(j * 4.36) * 6.75, angle);
      builder.block(m.ripple, x, 1.168, z, .25 + .19 * (j % 4), .012, .033, angle);
    }
    const [x, z] = radial(23.78, a);
    builder.block(m.basalt, x, 1.087, z, 7.20, .40, 21.58, yaw);
    for (let j = 0; j < 14; j++) {
      const [tx, tz] = radial(14.1 + j * 1.47, a);
      for (let p = -1; p <= 1; p++) {
        const [dx, dz] = radial(p * 2.29, a - Math.PI / 2);
        builder.block(m.tile[(i + j + p + 1) % 3], tx + dx, 1.312, tz + dz,
          2.27, .064, 1.449, yaw);
      }
    }
    for (const side of [-1, 1]) {
      const [dx, dz] = radial(side * 3.61, a - Math.PI / 2);
      builder.block(m.limestone, x + dx, 1.37, z + dz, .15, .18, 21.3, yaw);
      builder.block(m.goldLight, x + dx, 1.482, z + dz, .035, .039, 20.85, yaw);
    }
    for (let j = 0; j < 9; j++) {
      const level = 1.33 + j * .191;
      const [sx, sz] = radial(17.64 - j * .48, a);
      builder.block(m.ash, sx, (level + .92) / 2, sz, 6.36, level - .92, .52, yaw);
      builder.block(m.goldLight, sx, level + .044, sz, 4.16, .039, .035, yaw);
    }
    const [px, pz] = radial(28.8, a);
    for (let petal = 0; petal < 3; petal++) {
      const b = a + petal * TAU / 3;
      const leaf = Array.from({ length: 26 }, (_, j) => {
        const theta = j / 26 * TAU;
        const [dx, dz] = radial(.60 + .99 * (1 + Math.cos(theta)) / 2, b + theta);
        const [ex, ez] = radial(.61, b);
        return [px + ex + dx, 1.36, pz + ez + dz];
      });
      builder.tube(m.goldLight, leaf, .047, true);
    }
    const [fx, fz] = radial(30.05, a - Math.PI / 3);
    light([fx, 1.23, fz], 65, 11.7, "#ffbf6d", .53, [-fx * .022, 1, -fz * .022]);
  }

  for (const fall of convergenceFalls()) {
    const [x, z] = radial(fall.r - .30, fall.angle);
    const { bottom, top, width } = fall;
    const yaw = Math.PI / 2 - fall.angle;
    builder.block(m.basalt, x, (top + bottom) / 2, z, width + .28, top - bottom, 1.08, yaw);
    builder.block(m.limestone, x, top + .02, z, width + .49, .105, .96, yaw);
    const [dx, dz] = radial(.61, fall.angle);
    builder.block(m.blueLight, x + dx, bottom + .10, z + dz, width * .93, .082, .052, yaw);
    if (top > 2.0) light([x + dx, top + .16, z + dz], 27, 6.7, "#83baff", 0, [0, -1, 0]);
  }
}

export function createConvergencia() {
  const model = new THREE.Group();
  model.name = "A Convergência";
  model.userData.hasMovingParts = true;
  const m = palette();
  const builder = build(model);
  const light = (position, intensity, range, color = "#ffd19e", halo = 0, direction) => {
    addLampEmitter(model, position, { color, intensity, range, halo, direction });
  };
  plaza(builder, m, light);
  rotunda(builder, m, light);
  for (const rib of convergenceRibs()) {
    if (rib.type === "entry") {
      const arm = new THREE.Group();
      arm.name = `Braço de injeção ${model.children.filter(part => part.userData.injectorArm).length + 1}`;
      arm.position.copy(rib.path.getPoint(0));
      arm.userData.injectorArm = { axis: [Math.sin(rib.angle), 0, -Math.cos(rib.angle)] };
      const panels = new THREE.Group();panels.position.copy(arm.position).negate();
      const injector = build(panels);drawRib(injector, m, rib);injector.finish();
      arm.add(panels);model.add(arm);
      continue;
    }
    const arm = new THREE.Group();
    arm.name = rib.type === "outer" ? "Braço externo" : "Braço interno";
    arm.position.copy(rib.path.getPoint(0));
    arm.userData.hinge = { axis: [Math.sin(rib.angle), 0, -Math.cos(rib.angle)],
      travel: rib.type === "inner" ? .29 : .18 };
    const panels = new THREE.Group();
    panels.position.copy(arm.position).negate();
    const hinged = build(panels);
    drawRib(hinged, m, rib);
    hinged.finish();
    arm.add(panels);
    model.add(arm);
  }
  landscaping(builder, m, light);
  builder.finish();
  return model;
}

export function createUnlitConvergence(template) {
  const model = template.clone();
  delete model.userData.lampEmitters;
  const materials = new Map();
  model.traverse(part => {
    const lit = part.material;
    if (!lit?.userData.nightGlow) return;
    if (!materials.has(lit)) {
      const unlit = lit.clone();
      delete unlit.userData.nightGlow;
      unlit.emissiveIntensity = 0;
      materials.set(lit, unlit);
    }
    part.material = materials.get(lit);
  });
  return { model, materials };
}
