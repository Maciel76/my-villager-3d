import * as THREE from "three";
import { isDecoration, isLamp, isPaving, setDecorationObstacles, setPavingObstacles } from "./placement.js";

const CELL = .25;
const HEIGHTS = [.45013, 1.00013, 1.75013];
const gardenSurfaces = new Map();

// Slice the actual solids instead of reserving their entire rectangular lot.
// Scanline filling also works after CAD parts have been merged by material:
// separate wings, courtyards and gaps remain separate occupied regions.
export function groundObstacles(model, heights = HEIGHTS) {
  model.updateMatrixWorld(true);
  const occupied = new Map();
  model.traverse(part => {
    if (!part.isMesh || part.userData.groundCover || !part.visible) return;
    const geometry = part.geometry, source = geometry.getAttribute("position");
    if (!source) return;
    const bounds = new THREE.Box3().setFromObject(part);
    if (bounds.max.y < heights[0] || bounds.min.y > heights.at(-1)) return;
    const vertices = new Float32Array(source.count * 3), vector = new THREE.Vector3();
    for (let i = 0; i < source.count; i++) {
      vector.fromBufferAttribute(source, i).applyMatrix4(part.matrixWorld);
      vertices.set([vector.x, vector.y, vector.z], i * 3);
    }
    const indices = geometry.index, count = indices?.count ?? source.count;
    for (const height of heights) {
      if (bounds.min.y > height || bounds.max.y < height) continue;
      const crossings = new Map();
      for (let i = 0; i < count; i += 3) {
        const ids = [0, 1, 2].map(j => (indices ? indices.getX(i + j) : i + j) * 3);
        const points = [];
        for (let edge = 0; edge < 3; edge++) {
          const a = ids[edge], b = ids[(edge + 1) % 3], ya = vertices[a + 1], yb = vertices[b + 1];
          if ((ya > height) === (yb > height)) continue;
          const t = (height - ya) / (yb - ya);
          points.push([vertices[a] + (vertices[b] - vertices[a]) * t,
            vertices[a + 2] + (vertices[b + 2] - vertices[a + 2]) * t]);
        }
        if (points.length !== 2) continue;
        const [[x0, z0], [x1, z1]] = points;
        if (Math.abs(z1 - z0) < 1e-8) continue;
        const first = Math.ceil(Math.min(z0, z1) / CELL - .5);
        const last = Math.floor(Math.max(z0, z1) / CELL - .5);
        for (let row = first; row <= last; row++) {
          const z = (row + .5) * CELL;
          const x = x0 + (x1 - x0) * (z - z0) / (z1 - z0);
          if (!crossings.has(row)) crossings.set(row, []);
          crossings.get(row).push(x);
        }
      }
      for (const [row, xs] of crossings) {
        xs.sort((a, b) => a - b);
        if (!occupied.has(row)) occupied.set(row, new Set());
        const columns = occupied.get(row);
        for (let i = 0; i + 1 < xs.length; i += 2)
          for (let x = Math.floor((xs[i] + 1e-5) / CELL); x < Math.ceil((xs[i + 1] - 1e-5) / CELL); x++)
            columns.add(x);
      }
    }
  });
  const rectangles = [], active = new Map();
  for (const [row, columns] of [...occupied].sort((a, b) => a[0] - b[0])) {
    const xs = [...columns].sort((a, b) => a - b);
    for (let i = 0; i < xs.length; i++) {
      const first = xs[i];
      while (i + 1 < xs.length && xs[i + 1] === xs[i] + 1) i++;
      const last = xs[i] + 1, key = `${first},${last}`, previous = active.get(key);
      if (previous && Math.abs(previous[3] - row * CELL) < 1e-6) previous[3] = (row + 1) * CELL;
      else {
        const rectangle = [first * CELL, row * CELL, last * CELL, (row + 1) * CELL];
        rectangles.push(rectangle); active.set(key, rectangle);
      }
    }
  }
  return rectangles;
}

export function registerDecorationObstacles(templates) {
  for (const [type, model] of Object.entries(templates)) {
    if (isDecoration(type) || isLamp(type) || isPaving(type)) continue;
    setDecorationObstacles(type, groundObstacles(model));
    setPavingObstacles(type, groundObstacles(model, [.10013, .26013]));
    const surfaces = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    model.traverse(part => {
      if (!part.isMesh || !part.visible) return;
      const geometry = part.geometry, positions = geometry.getAttribute("position"), indices = geometry.index;
      if (!positions) return;
      const bounds = new THREE.Box3().setFromObject(part);
      if (bounds.min.y > .6) return;
      for (let i = 0, count = indices?.count ?? positions.count; i < count; i += 3) {
        a.fromBufferAttribute(positions, indices ? indices.getX(i) : i).applyMatrix4(part.matrixWorld);
        b.fromBufferAttribute(positions, indices ? indices.getX(i + 1) : i + 1).applyMatrix4(part.matrixWorld);
        c.fromBufferAttribute(positions, indices ? indices.getX(i + 2) : i + 2).applyMatrix4(part.matrixWorld);
        if (Math.max(a.y, b.y, c.y) > .6 || Math.min(a.y, b.y, c.y) < -.1) continue;
        const normalY = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
        if (normalY <= 1e-7) continue;
        surfaces.push([a.x, a.z, a.y, b.x, b.z, b.y, c.x, c.z, c.y]);
      }
    });
    gardenSurfaces.set(type, { surfaces, bounds: new THREE.Box3().setFromObject(model) });
  }
}

// CAD gardens and paving sit slightly above the terrain. Place decorations on
// those real surfaces, including after moving a house or editing a road.
export function decorationSurfaceHeight(x, z, houses) {
  let height = 0;
  for (const house of houses) {
    const garden = gardenSurfaces.get(house.type);
    if (!garden) continue;
    const { surfaces, bounds } = garden;
    const rotation = ((house.rotation ?? 0) % 4 + 4) % 4;
    const cos = [1, 0, -1, 0][rotation], sin = [0, 1, 0, -1][rotation];
    const dx = x - house.x, dz = z - house.z, lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
    if (lx < bounds.min.x || lx > bounds.max.x || lz < bounds.min.z || lz > bounds.max.z) continue;
    const base = house.model?.position.y ?? 0;
    for (const [ax, az, ay, bx, bz, by, cx, cz, cy] of surfaces) {
      if (lx < Math.min(ax, bx, cx) || lx > Math.max(ax, bx, cx) ||
        lz < Math.min(az, bz, cz) || lz > Math.max(az, bz, cz)) continue;
      const denominator = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      const u = ((bz - cz) * (lx - cx) + (cx - bx) * (lz - cz)) / denominator;
      const v = ((cz - az) * (lx - cx) + (ax - cx) * (lz - cz)) / denominator;
      if (u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6)
        height = Math.max(height, base + u * ay + v * by + (1 - u - v) * cy);
    }
  }
  return height;
}
