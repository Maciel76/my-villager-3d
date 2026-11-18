import * as THREE from "three";
import { markNightLight } from "./daylight.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { BUILD_LIMIT, LOT_SIZE } from "./placement.js";
import { projectTexture } from "./assets.js";

const mat = (color) =>
  new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
const palette = {
  wall: mat("#f3dfb6"),
  wood: mat("#84573c"),
  glass: markNightLight(mat("#8abfc0")),
  trim: mat("#fff1d6"),
  stone: mat("#c1b99e"),
  darkRoof: mat("#905437"),
};
export function mesh(geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function createHouse(materials) {
  const house = new THREE.Group();
  const box = (w, h, d, material, x, y, z) =>
    house.add(mesh(new THREE.BoxGeometry(w, h, d), material, x, y, z));
  box(9, 0.35, 9, palette.stone, 0, 0.175, 0);
  box(7, 4.6, 6, palette.wall, 0, 2.6, 0);
  const shape = new THREE.Shape()
    .moveTo(-4.2, 0)
    .lineTo(0, 3)
    .lineTo(4.2, 0)
    .closePath();
  const roof = mesh(
    projectTexture(
      new THREE.ExtrudeGeometry(shape, { depth: 7.5, bevelEnabled: false }),
      true,
    ),
    materials.clay,
    0,
    4.8,
    -3.75,
  );
  house.add(roof);
  box(1.5, 2.8, 0.2, palette.trim, 0.4, 1.8, 3.08);
  box(1.15, 2.55, 0.22, palette.wood, 0.4, 1.65, 3.2);
  const knob = mesh(
    new THREE.SphereGeometry(0.08, 6, 6),
    palette.trim,
    0.77,
    1.6,
    3.35,
  );
  house.add(knob);
  for (const x of [-2.1, 2.25]) {
    box(1.4, 1.5, 0.16, palette.trim, x, 2.9, 3.1);
    box(1.13, 1.2, 0.18, palette.glass, x, 2.9, 3.2);
    box(0.07, 1.2, 0.2, palette.trim, x, 2.9, 3.3);
    box(1.2, 0.07, 0.2, palette.trim, x, 2.9, 3.3);
  }
  for (const x of [-3.55, 3.55]) {
    box(0.12, 1.5, 1.8, palette.trim, x, 2.9, 0);
    box(0.15, 1.2, 1.5, palette.glass, x, 2.9, 0);
    box(0.18, 1.2, 0.08, palette.trim, x, 2.9, 0);
  }
  box(1, 2.2, 1, palette.darkRoof, 2, 6.7, -1.3);
  box(1.25, 0.2, 1.25, palette.stone, 2, 7.8, -1.3);
  box(2.2, 0.2, 1.1, palette.stone, 0.4, 0.2, 4.8);
  return house;
}

const CHUNK_SIZE = 120;
const CLEARING_EDGE = BUILD_LIMIT + LOT_SIZE / 2 + 1;
const TREE_SPACING = 12;
const TREE_ROWS = CHUNK_SIZE / TREE_SPACING;

function coordinateSeed(x, z) {
  const mixed = Math.imul(x, 0x1f123bb5) ^ Math.imul(z, 0x5f356495);
  return Math.imul(mixed ^ (mixed >>> 16), 0x45d9f3b) >>> 0;
}

function seededRandom(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function distanceFromClearing(x, z) {
  return Math.hypot(
    Math.max(0, Math.abs(x) - CLEARING_EDGE),
    Math.max(0, Math.abs(z) - CLEARING_EDGE),
  );
}

export function terrainHeight(x, z) {
  const hills =
    3.8 +
    2.5 * Math.sin(x * 0.043) * Math.cos(z * 0.036) +
    1.7 * Math.sin(x * 0.022 + z * 0.031);
  return hills * THREE.MathUtils.smoothstep(distanceFromClearing(x, z), 0, 38);
}

function createGround(originX, originZ, material) {
  const geometry = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, 30, 30);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(CHUNK_SIZE / 2, 0, CHUNK_SIZE / 2);
  const { position, uv } = geometry.attributes;
  const colors = new Float32Array(position.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const x = originX + position.getX(i);
    const z = originZ + position.getZ(i);
    position.setY(i, terrainHeight(x, z));
    uv.setXY(i, position.getX(i), CHUNK_SIZE - position.getZ(i));

    // Border vertices use the same height and color in both chunks.
    const variation = coordinateSeed(x, z) / 4294967296 - 0.5;
    const meadow =
      0.04 * Math.sin(x * 0.049 + z * 0.032) * Math.cos(z * 0.054 - x * 0.028);
    const forest = THREE.MathUtils.smoothstep(
      distanceFromClearing(x, z),
      5,
      55,
    );
    color
      .set("#f2f4e9")
      .offsetHSL(
        variation * 0.016,
        variation * 0.05,
        meadow + variation * 0.045 - forest * 0.1,
      );
    color.toArray(colors, i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const ground = mesh(geometry, material, originX, 0, originZ);
  ground.castShadow = false;
  return ground;
}

function createForestGenerator() {
  const trunk = new THREE.CylinderGeometry(0.32, 0.55, 4.5, 5).translate(
    0,
    2.05,
    0,
  );
  const mainCrown = new THREE.IcosahedronGeometry(3, 1)
    .scale(1, 1.35, 1)
    .translate(0, 6, 0);
  const sideCrown = new THREE.IcosahedronGeometry(2.3, 0).translate(
    1.3,
    5.2,
    0.4,
  );
  const crown = mergeGeometries([mainCrown, sideCrown]);
  mainCrown.dispose();
  sideCrown.dispose();
  const bark = mat("#88704b");
  const leaves = mat("#ffffff");
  const foliage = ["#4d824a", "#658f49", "#729d50", "#3f7546", "#84a65b"].map(
    (color) => new THREE.Color(color),
  );
  const dummy = new THREE.Object3D();

  return (originX, originZ) => {
    const random = seededRandom(coordinateSeed(originX, originZ) ^ 751);
    const trees = [];
    for (let row = 0; row < TREE_ROWS; row++) {
      for (let col = 0; col < TREE_ROWS; col++) {
        const x = (col + 0.12 + random() * 0.76) * TREE_SPACING;
        const z = (row + 0.12 + random() * 0.76) * TREE_SPACING;
        const worldX = originX + x;
        const worldZ = originZ + z;
        const margin = 8 + 5 * Math.sin(worldX * 0.12 + worldZ * 0.09);
        const density = 0.82 + 0.13 * Math.sin(worldX * 0.018 - worldZ * 0.024);
        if (distanceFromClearing(worldX, worldZ) < margin || random() > density)
          continue;
        trees.push({
          x,
          y: terrainHeight(worldX, worldZ),
          z,
          scale: 0.65 + random() * 0.95,
          angle: random() * Math.PI * 2,
          color: foliage[Math.floor(random() * foliage.length)],
        });
      }
    }
    if (!trees.length) return [];

    const trunks = new THREE.InstancedMesh(trunk, bark, trees.length);
    const crowns = new THREE.InstancedMesh(crown, leaves, trees.length);
    for (const part of [trunks, crowns]) {
      part.position.set(originX, 0, originZ);
      part.castShadow = true;
      part.receiveShadow = true;
    }
    trees.forEach(({ x, y, z, scale, angle, color }, index) => {
      dummy.position.set(x, y, z);
      dummy.scale.setScalar(scale);
      dummy.rotation.y = angle;
      dummy.updateMatrix();
      trunks.setMatrixAt(index, dummy.matrix);
      crowns.setMatrixAt(index, dummy.matrix);
      crowns.setColorAt(index, color);
    });
    return [trunks, crowns];
  };
}

export function createWorld(scene, materials) {
  const ground = new THREE.Group();
  const groundMaterial = new THREE.MeshStandardMaterial({
    map: materials.grass,
    vertexColors: true,
    roughness: 1,
    flatShading: true,
  });
  scene.add(ground);
  const createForest = createForestGenerator();
  const chunks = new Map();
  let lastX, lastZ, lastRange;

  function update(camera) {
    const centerX = Math.floor(camera.position.x / CHUNK_SIZE);
    const centerZ = Math.floor(camera.position.z / CHUNK_SIZE);
    // A corner of the view reaches farther than the far plane's center.
    // Include every chunk that can reach the view from this camera cell.
    const vertical = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const range =
      camera.far * Math.hypot(1, vertical, vertical * camera.aspect);
    if (centerX === lastX && centerZ === lastZ && range === lastRange)
      return false;
    lastX = centerX;
    lastZ = centerZ;
    lastRange = range;
    const radius = Math.ceil(range / CHUNK_SIZE);
    const inRange = (x, z) =>
      Math.hypot(
        Math.max(0, Math.abs(x - centerX) - 1),
        Math.max(0, Math.abs(z - centerZ) - 1),
      ) *
        CHUNK_SIZE <=
      range;

    for (const [key, chunk] of chunks) {
      if (inRange(chunk.x, chunk.z)) continue;
      chunk.surface.removeFromParent();
      chunk.surface.geometry.dispose();
      for (const trees of chunk.forest) {
        trees.removeFromParent();
        trees.dispose();
      }
      chunks.delete(key);
    }
    for (let z = centerZ - radius; z <= centerZ + radius; z++) {
      for (let x = centerX - radius; x <= centerX + radius; x++) {
        const key = `${x},${z}`;
        if (chunks.has(key) || !inRange(x, z)) continue;
        const originX = x * CHUNK_SIZE;
        const originZ = z * CHUNK_SIZE;
        const surface = createGround(originX, originZ, groundMaterial);
        const forest = createForest(originX, originZ);
        ground.add(surface);
        surface.updateMatrixWorld();
        for (const trees of forest) scene.add(trees);
        chunks.set(key, { x, z, surface, forest });
      }
    }
    return true;
  }

  // Sparse meadow details share one draw call.
  const grass = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.22, 0.75, 3),
    mat("#769f4d"),
    1400,
  );
  const random = seededRandom(751);
  const dummy = new THREE.Object3D();
  const grassPlacements = [];
  for (let i = 0; i < grass.count; i++) {
    dummy.position.set((random() - 0.5) * 180, 0.26, (random() - 0.5) * 180);
    dummy.rotation.y = random() * Math.PI;
    dummy.scale.setScalar(0.6 + random());
    dummy.updateMatrix();
    grassPlacements.push({
      x: dummy.position.x,
      z: dummy.position.z,
      matrix: dummy.matrix.clone(),
    });
    grass.setMatrixAt(i, dummy.matrix);
  }
  scene.add(grass);

  const grid = new THREE.GridHelper(180, 90, "#cce3ae", "#cce3ae");
  grid.position.y = 0.035;
  grid.material.transparent = true;
  grid.material.opacity = 0.22;
  grid.visible = false;
  scene.add(grid);
  function updatePaving(isPaved) {
    let count = 0;
    for (const { x, z, matrix } of grassPlacements) {
      if (isPaved(x, z)) continue;
      grass.setMatrixAt(count++, matrix);
    }
    grass.count = count;
    grass.instanceMatrix.needsUpdate = true;
  }

  return { ground, grid, update, updatePaving };
}
