import { LEGACY_AREA_SIZE, areaBuildLimit, getBuildAreaSize } from "./build-area.js";
export { BUILD_LIMIT } from "./build-area.js";
export const LOT_SIZE = 12;
export const EXPANSION_SIZE = 3 * LOT_SIZE;
export const EXPANSION_LIMIT = 8;
export const expansionSides = ["north", "west", "east", "south"];

export function isExpansion(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.entries(value).every(([side, steps]) => expansionSides.includes(side) &&
      Number.isInteger(steps) && steps >= 0 && steps <= EXPANSION_LIMIT);
}

export function buildArea(expansion = {}, size = getBuildAreaSize()) {
  const limit = areaBuildLimit(size);
  return {
    minX: -limit - (expansion.west ?? 0) * EXPANSION_SIZE,
    maxX: limit + (expansion.east ?? 0) * EXPANSION_SIZE,
    minZ: -limit - (expansion.north ?? 0) * EXPANSION_SIZE,
    maxZ: limit + (expansion.south ?? 0) * EXPANSION_SIZE,
  };
}

export const BASE_AREA = buildArea({}, LEGACY_AREA_SIZE);

export function containsPoint(area, x, z, margin = 0) {
  return Number.isFinite(x) && Number.isFinite(z) &&
    x >= area.minX - margin && x <= area.maxX + margin &&
    z >= area.minZ - margin && z <= area.maxZ + margin;
}
