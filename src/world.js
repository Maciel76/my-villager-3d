import * as THREE from "three";
import { markNightLight } from "./daylight.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { BASE_AREA, buildArea, LOT_SIZE } from "./village-area.js";
import { getBuildAreaSize } from "./build-area.js";
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
const CLEARING_MARGIN = LOT_SIZE / 2 + 1;
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

function distanceFromClearing(x, z, area) {
  return Math.hypot(
    Math.max(0, area.minX - x - CLEARING_MARGIN, x - area.maxX - CLEARING_MARGIN),
    Math.max(0, area.minZ - z - CLEARING_MARGIN, z - area.maxZ - CLEARING_MARGIN),
  );
}

export function terrainHeight(x, z, area = buildArea()) {
  const hills =
    3.8 +
    2.5 * Math.sin(x * 0.043) * Math.cos(z * 0.036) +
    1.7 * Math.sin(x * 0.022 + z * 0.031);
  return hills * THREE.MathUtils.smoothstep(distanceFromClearing(x, z, area), 0, 38);
}

function createGround(originX, originZ, material, area) {
  const geometry = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, 30, 30);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(CHUNK_SIZE / 2, 0, CHUNK_SIZE / 2);
  const { position, uv } = geometry.attributes;
  const colors = new Float32Array(position.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const x = originX + position.getX(i);
    const z = originZ + position.getZ(i);
    position.setY(i, terrainHeight(x, z, area));
    uv.setXY(i, position.getX(i), CHUNK_SIZE - position.getZ(i));

    // Border vertices use the same height and color in both chunks.
    const variation = coordinateSeed(x, z) / 4294967296 - 0.5;
    const meadow =
      0.04 * Math.sin(x * 0.049 + z * 0.032) * Math.cos(z * 0.054 - x * 0.028);
    const forest = THREE.MathUtils.smoothstep(
      distanceFromClearing(x, z, area),
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

  return (originX, originZ, area) => {
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
        if (distanceFromClearing(worldX, worldZ, BASE_AREA) < margin || random() > density)
          continue;
        const tree = {
          x,
          y: terrainHeight(worldX, worldZ, area),
          z,
          scale: 0.65 + random() * 0.95,
          angle: random() * Math.PI * 2,
          color: foliage[Math.floor(random() * foliage.length)],
        };
        // Consume the same random values even when this tree is cleared.
        if (distanceFromClearing(worldX, worldZ, area) >= margin) trees.push(tree);
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

export function createWorld(scene, materials, initialArea = buildArea()) {
  let area = initialArea;
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
  let renderedArea = getBuildAreaSize();

  function update(camera, focus = camera.position) {
    const size = getBuildAreaSize();
    const areaChanged = renderedArea !== size;
    if (areaChanged) {
      const delta = (size - renderedArea) / 2;
      setArea({ minX: area.minX - delta, maxX: area.maxX + delta,
        minZ: area.minZ - delta, maxZ: area.maxZ + delta });
    }
    updateGrids(focus);
    const meadowX = Math.floor(focus.x / CHUNK_SIZE);
    const meadowZ = Math.floor(focus.z / CHUNK_SIZE);
    if (areaChanged || meadowX !== grassX || meadowZ !== grassZ)
      updateMeadow(meadowX, meadowZ);
    const centerX = Math.floor(camera.position.x / CHUNK_SIZE);
    const centerZ = Math.floor(camera.position.z / CHUNK_SIZE);
    // A corner of the view reaches farther than the far plane's center.
    // Include every chunk that can reach the view from this camera cell.
    const vertical = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    // Camera damping changes the far distance by tiny amounts every frame.
    // Cache whole chunk rings, otherwise every camera tick regenerates the
    // shadow map and scans the entire forest even when no chunk changed.
    const range = Math.ceil(
      camera.far * Math.hypot(1, vertical, vertical * camera.aspect) / CHUNK_SIZE,
    ) * CHUNK_SIZE;
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

    for (const [key, chunk] of chunks)
      if (!inRange(chunk.x, chunk.z)) removeChunk(key, chunk);
    for (let z = centerZ - radius; z <= centerZ + radius; z++) {
      for (let x = centerX - radius; x <= centerX + radius; x++) {
        const key = `${x},${z}`;
        if (chunks.has(key) || !inRange(x, z)) continue;
        const originX = x * CHUNK_SIZE;
        const originZ = z * CHUNK_SIZE;
        const surface = createGround(originX, originZ, groundMaterial, area);
        const forest = createForest(originX, originZ, area);
        ground.add(surface);
        surface.updateMatrixWorld();
        for (const trees of forest) scene.add(trees);
        chunks.set(key, { x, z, surface, forest });
      }
    }
    return true;
  }

  function removeChunk(key, chunk) {
    chunk.surface.removeFromParent();
    chunk.surface.geometry.dispose();
    for (const trees of chunk.forest) {
      trees.removeFromParent();
      trees.dispose();
    }
    chunks.delete(key);
  }

  function setArea(next) {
    // Only chunks within reach of the clearing's color and height transition need rebuilding.
    const reach = CLEARING_MARGIN + 55;
    for (const [key, chunk] of chunks) {
      const x = chunk.x * CHUNK_SIZE;
      const z = chunk.z * CHUNK_SIZE;
      if (x <= Math.max(area.maxX, next.maxX) + reach &&
          x + CHUNK_SIZE >= Math.min(area.minX, next.minX) - reach &&
          z <= Math.max(area.maxZ, next.maxZ) + reach &&
          z + CHUNK_SIZE >= Math.min(area.minZ, next.minZ) - reach)
        removeChunk(key, chunk);
    }
    area = next;
    renderedArea = getBuildAreaSize();
    grassX = grassZ = lastX = undefined;
    updateGrids();
  }

  // Sparse meadow details share one draw call.
  const grass = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.22, 0.75, 3),
    mat("#769f4d"),
    10000,
  );
  const dummy = new THREE.Object3D();
  const grassPlacements = [];
  let grassX, grassZ;
  let isPaved = () => false;
  function updateMeadow(centerX, centerZ) {
    grassX = centerX;
    grassZ = centerZ;
    grassPlacements.length = 0;
    const spanX = Math.min(area.maxX - area.minX + 6, 480);
    const spanZ = Math.min(area.maxZ - area.minZ + 6, 480);
    const offsetX = THREE.MathUtils.clamp(centerX * CHUNK_SIZE, area.minX - 3 + spanX / 2, area.maxX + 3 - spanX / 2);
    const offsetZ = THREE.MathUtils.clamp(centerZ * CHUNK_SIZE, area.minZ - 3 + spanZ / 2, area.maxZ + 3 - spanZ / 2);
    const random = seededRandom(coordinateSeed(offsetX, offsetZ) ^ 751);
    const count = Math.floor(1400 * spanX * spanZ / 180 ** 2);
    for (let i = 0; i < count; i++) {
      dummy.position.set(offsetX + (random() - 0.5) * spanX, 0.26, offsetZ + (random() - 0.5) * spanZ);
      dummy.rotation.y = random() * Math.PI;
      dummy.scale.setScalar(0.6 + random());
      dummy.updateMatrix();
      grassPlacements.push({ x: dummy.position.x, z: dummy.position.z, matrix: dummy.matrix.clone() });
    }
    updatePaving(isPaved);
  }
  updateMeadow(0, 0);
  scene.add(grass);

  function makeGrid(color, opacity, y) {
    const result = new THREE.LineSegments(new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
    result.position.y = y;
    result.visible = false;
    scene.add(result);
    return result;
  }

  const grid = makeGrid("#cce3ae", 0.22, 0.035);
  const roadGrid = makeGrid("#efe5b0", 0.42, 0.036);
  let lastGridWindow;
  function updateGrids(focus = { x: 0, z: 0 }) {
    const width = Math.min(area.maxX - area.minX + 6, 480);
    const depth = Math.min(area.maxZ - area.minZ + 6, 480);
    const x0 = THREE.MathUtils.clamp(Math.round(focus.x / 120) * 120 - width / 2, area.minX - 3, area.maxX + 3 - width);
    const z0 = THREE.MathUtils.clamp(Math.round(focus.z / 120) * 120 - depth / 2, area.minZ - 3, area.maxZ + 3 - depth);
    const x1 = x0 + width, z1 = z0 + depth;
    const key = [x0, z0, x1, z1].join(",");
    if (key === lastGridWindow) return;
    lastGridWindow = key;
    for (const [lines, step] of [[grid, 2], [roadGrid, LOT_SIZE]]) {
      const left = step === LOT_SIZE ? Math.ceil((x0 + 6) / LOT_SIZE) * LOT_SIZE - 6 : x0;
      const right = step === LOT_SIZE ? Math.floor((x1 - 6) / LOT_SIZE) * LOT_SIZE + 6 : x1;
      const front = step === LOT_SIZE ? Math.ceil((z0 + 6) / LOT_SIZE) * LOT_SIZE - 6 : z0;
      const back = step === LOT_SIZE ? Math.floor((z1 - 6) / LOT_SIZE) * LOT_SIZE + 6 : z1;
      const points = [];
      for (let x = left; x <= right; x += step)
        points.push(new THREE.Vector3(x, 0, front), new THREE.Vector3(x, 0, back));
      for (let z = front; z <= back; z += step)
        points.push(new THREE.Vector3(left, 0, z), new THREE.Vector3(right, 0, z));
      lines.geometry.dispose();
      lines.geometry = new THREE.BufferGeometry().setFromPoints(points);
    }
  }
  updateGrids();
  function updatePaving(predicate) {
    isPaved = predicate;
    let count = 0;
    for (const { x, z, matrix } of grassPlacements) {
      if (isPaved(x, z)) continue;
      grass.setMatrixAt(count++, matrix);
    }
    grass.count = count;
    grass.instanceMatrix.needsUpdate = true;
    grass.computeBoundingSphere();
  }

  return { ground, grid, roadGrid, setArea, update, updatePaving };
}
