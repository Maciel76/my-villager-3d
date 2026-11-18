import * as THREE from "three";
import { LOT_SIZE } from "./placement.js";
import {
  DIRECTIONS, LANE_EDGE, WALK_EDGE, WALK_Y, roadMask, roadZone, snapTile, tileKey,
} from "./road-layout.js";

const HALF = LOT_SIZE / 2;
const ASPHALT_Y = 0.045;
const PAINT_Y = ASPHALT_Y + 0.012;
const SLICE = [-HALF, -WALK_EDGE, -LANE_EDGE, LANE_EDGE, WALK_EDGE, HALF];

function quad(vertices, a, b, c, d) {
  vertices.push(...a, ...b, ...c, ...a, ...c, ...d);
}

function rectangle(vertices, x0, z0, x1, z1, y) {
  quad(vertices, [x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]);
}

function geometryFrom(vertices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.computeVertexNormals();
  const uv = [];
  for (let i = 0; i < vertices.length; i += 3)
    uv.push(vertices[i], vertices[i + 2]);
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return geometry;
}

function marksFor(mask, vertices, crossing) {
  const exits = DIRECTIONS.filter(({ bit }) => mask & bit);
  const bar = (dir, from, to, offset, width, target) => {
    const points = [from, to].flatMap((r) =>
      [offset - width / 2, offset + width / 2].map((t) => [
        r * dir.x + t * dir.z,
        r * dir.z - t * dir.x,
      ]),
    );
    const x = points.map((p) => p[0]);
    const z = points.map((p) => p[1]);
    rectangle(
      target,
      Math.min(...x),
      Math.min(...z),
      Math.max(...x),
      Math.max(...z),
      PAINT_Y,
    );
  };
  if (exits.length >= 3) {
    for (const dir of exits) {
      for (let across = -2.52; across <= 2.53; across += 0.84) {
        bar(dir, 4.35, 5.14, across, 0.35, crossing);
      }
    }
  } else if (mask === 5 || mask === 10 || mask === 0) {
    const dir = mask === 10 ? DIRECTIONS[1] : DIRECTIONS[2];
    const limit = mask ? HALF : 3;
    for (let start = -limit; start < limit; start += 3) {
      bar(dir, start + 0.6, start + 2.4, 0, 0.15, vertices);
    }
  } else if (exits.length === 2) {
    const entry = new THREE.Vector2(exits[0].x * HALF, exits[0].z * HALF);
    const exit = new THREE.Vector2(exits[1].x * HALF, exits[1].z * HALF);
    const path = new THREE.QuadraticBezierCurve(
      entry,
      new THREE.Vector2(),
      exit,
    );
    const edge = (u, offset) => {
      const point = path.getPointAt(u);
      const tangent = path.getTangentAt(u);
      return [
        point.x + tangent.y * offset,
        PAINT_Y,
        point.y - tangent.x * offset,
      ];
    };
    for (const start of [0.07, 0.37, 0.67]) {
      for (let segment = 0; segment < 4; segment++) {
        const from = start + segment * 0.049;
        const to = from + 0.049;
        quad(
          vertices,
          edge(from, -0.076),
          edge(to, -0.076),
          edge(to, 0.076),
          edge(from, 0.076),
        );
      }
    }
  } else {
    for (const dir of exits) bar(dir, 4.03, 5.43, 0, 0.15, vertices);
  }
}

function makeTile(mask, materials) {
  const road = [],
    walk = [],
    curb = [],
    paint = [],
    crossing = [];
  const cells = SLICE.slice(1).map((edge, i) => (edge + SLICE[i]) / 2);
  const zoneAt = (i, j) => {
    if (i < 0 || j < 0 || i >= cells.length || j >= cells.length) return null;
    if (roadZone(cells[i], cells[j], LANE_EDGE, mask)) return road;
    return roadZone(cells[i], cells[j], WALK_EDGE, mask) ? walk : null;
  };
  for (let i = 0; i < cells.length; i++) {
    for (let j = 0; j < cells.length; j++) {
      const surface = zoneAt(i, j);
      if (!surface) continue;
      const [x0, x1] = SLICE.slice(i, i + 2);
      const [z0, z1] = SLICE.slice(j, j + 2);
      rectangle(surface, x0, z0, x1, z1, surface === walk ? WALK_Y : ASPHALT_Y);
      if (surface !== walk) continue;
      const boundaries = [
        [zoneAt(i - 1, j), x0, z0, x0, z1, 0.16, 0],
        [zoneAt(i + 1, j), x1, z1, x1, z0, -0.16, 0],
        [zoneAt(i, j - 1), x1, z0, x0, z0, 0, 0.16],
        [zoneAt(i, j + 1), x0, z1, x1, z1, 0, -0.16],
      ];
      for (const [neighbor, ax, az, bx, bz, dx, dz] of boundaries) {
        if (neighbor !== road) continue;
        quad(
          curb,
          [ax, WALK_Y, az],
          [ax, ASPHALT_Y, az],
          [bx, ASPHALT_Y, bz],
          [bx, WALK_Y, bz],
        );
        rectangle(
          curb,
          Math.min(ax, bx, ax + dx),
          Math.min(az, bz, az + dz),
          Math.max(ax, bx, ax + dx),
          Math.max(az, bz, az + dz),
          WALK_Y + 0.008,
        );
      }
    }
  }
  marksFor(mask, paint, crossing);
  return [
    [road, materials.asphalt],
    [walk, materials.sidewalk],
    [curb, materials.curb],
    [paint, materials.roadPaint],
    [crossing, materials.crosswalk],
  ]
    .filter(([vertices]) => vertices.length)
    .map(
      ([vertices, material]) =>
        new THREE.Mesh(geometryFrom(vertices), material),
    );
}

function plotOutline() {
  const vertices = [];
  const edge = HALF - 0.2;
  const inner = edge - 0.105;
  const y = 0.065;
  rectangle(vertices, -edge, -edge, edge, -inner, y);
  rectangle(vertices, -edge, inner, edge, edge, y);
  rectangle(vertices, -edge, -inner, -inner, inner, y);
  rectangle(vertices, inner, -inner, edge, inner, y);
  return new THREE.Mesh(
    geometryFrom(vertices),
    new THREE.MeshBasicMaterial({
      color: "#e2edbd",
      transparent: true,
      opacity: 0.66,
      depthWrite: false,
    }),
  );
}

function renderInstances(root, sources, cells) {
  const matrix = new THREE.Matrix4();
  for (const source of sources) {
    const mesh = new THREE.InstancedMesh(
      source.geometry,
      source.material,
      cells.length,
    );
    cells.forEach((cell, index) => {
      mesh.setMatrixAt(index, matrix.makeTranslation(cell.x, 0, cell.z));
    });
    mesh.receiveShadow = true;
    root.add(mesh);
  }
}

export function createStreetLayer(materials) {
  const roadsLayer = new THREE.Group();
  const plotsLayer = new THREE.Group();
  const tileCache = new Map();
  const outline = plotOutline();
  const parts = (mask) => {
    if (!tileCache.has(mask)) tileCache.set(mask, makeTile(mask, materials));
    return tileCache.get(mask);
  };
  const clearInstances = (layer) => {
    for (const mesh of layer.children) mesh.dispose();
    layer.clear();
  };
  return {
    roadsLayer,
    plotsLayer,
    updateRoads(roads) {
      clearInstances(roadsLayer);
      const groups = new Map();
      for (const cell of roads.values()) {
        const mask = roadMask(cell.x, cell.z, roads);
        if (!groups.has(mask)) groups.set(mask, []);
        groups.get(mask).push(cell);
      }
      for (const [mask, cells] of groups)
        renderInstances(roadsLayer, parts(mask), cells);
    },
    surfaceHeight(x, z, roads) {
      const cx = snapTile(x);
      const cz = snapTile(z);
      if (!roads.has(tileKey(cx, cz))) return null;
      const mask = roadMask(cx, cz, roads);
      if (roadZone(x - cx, z - cz, LANE_EDGE, mask)) return ASPHALT_Y;
      return roadZone(x - cx, z - cz, WALK_EDGE, mask) ? WALK_Y : null;
    },
    covers(x, z, roads) {
      const cx = snapTile(x);
      const cz = snapTile(z);
      return (
        roads.has(tileKey(cx, cz)) &&
        roadZone(x - cx, z - cz, WALK_EDGE + 0.22, roadMask(cx, cz, roads))
      );
    },
    updatePlots(available) {
      clearInstances(plotsLayer);
      if (available.length) renderInstances(plotsLayer, [outline], available);
    },
    preview(mask, material) {
      const group = new THREE.Group();
      for (const source of parts(mask).slice(0, 2)) {
        group.add(new THREE.Mesh(source.geometry, material));
      }
      return group;
    },
  };
}
