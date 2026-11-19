import { PAVING_SIZE, snapPaving } from "./paving-types.js";

export function pavingLine(start, end, bounds) {
  if (![start?.x, start?.z, end?.x, end?.z].every(Number.isFinite)) return [];
  let x0 = snapPaving(start.x) / PAVING_SIZE, z0 = snapPaving(start.z) / PAVING_SIZE;
  let x1 = snapPaving(end.x) / PAVING_SIZE, z1 = snapPaving(end.z) / PAVING_SIZE;
  if (![x0, z0, x1, z1].every(Number.isSafeInteger)) return [];
  // Clip before walking the grid, so distant clicks never allocate an
  // enormous line outside the buildable terrain.
  if (bounds) {
    let enter = 0, leave = 1;
    for (const [a, delta, low, high] of [
      [x0, x1 - x0, Math.ceil(bounds.minX / PAVING_SIZE), Math.floor(bounds.maxX / PAVING_SIZE)],
      [z0, z1 - z0, Math.ceil(bounds.minZ / PAVING_SIZE), Math.floor(bounds.maxZ / PAVING_SIZE)],
    ]) {
      if (low > high) return [];
      if (!delta) { if (a < low || a > high) return []; continue; }
      const from = (low - a) / delta, to = (high - a) / delta;
      enter = Math.max(enter, Math.min(from, to));
      leave = Math.min(leave, Math.max(from, to));
      if (enter > leave) return [];
    }
    const dx = x1 - x0, dz = z1 - z0;
    [x0, z0, x1, z1] = [Math.round(x0 + dx * enter), Math.round(z0 + dz * enter),
      Math.round(x0 + dx * leave), Math.round(z0 + dz * leave)];
  }
  // Canonical direction makes every slope reversible, including tie cases.
  const reverse = x0 > x1 || (x0 === x1 && z0 > z1);
  if (reverse) [x0, z0, x1, z1] = [x1, z1, x0, z0];
  const dx = Math.abs(x1 - x0), dz = Math.abs(z1 - z0);
  const sx = Math.sign(x1 - x0), sz = Math.sign(z1 - z0);
  let error = dx - dz;
  const cells = [];
  while (true) {
    cells.push({ x: x0 * PAVING_SIZE || 0, z: z0 * PAVING_SIZE || 0 });
    if (x0 === x1 && z0 === z1) break;
    const twice = error * 2;
    if (twice > -dz) { error -= dz; x0 += sx; }
    if (twice < dx) { error += dx; z0 += sz; }
  }
  return reverse ? cells.reverse() : cells;
}

export function planPavingLine(start, end, { bounds, canBuild, unitPrice, balance }) {
  const cells = [], ready = [];
  let blocked = 0, unaffordable = 0, cost = 0;
  for (const site of pavingLine(start, end, bounds)) {
    let state = "ready";
    if (!canBuild(site.x, site.z)) { state = "blocked"; blocked++; }
    else if (cost + unitPrice > balance) { state = "unaffordable"; unaffordable++; }
    else { ready.push(site); cost += unitPrice; }
    cells.push({ ...site, state });
  }
  return { cells, ready, blocked, unaffordable, cost };
}
