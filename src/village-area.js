export const LOT_SIZE = 12;
export const BUILD_LIMIT = 87;
export const EXPANSION_SIZE = 3 * LOT_SIZE;
export const EXPANSION_LIMIT = 8;
export const expansionSides = ["north", "west", "east", "south"];

export function isExpansion(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.entries(value).every(([side, steps]) => expansionSides.includes(side) &&
      Number.isInteger(steps) && steps >= 0 && steps <= EXPANSION_LIMIT);
}

export function buildArea(expansion = {}) {
  return {
    minX: -BUILD_LIMIT - (expansion.west ?? 0) * EXPANSION_SIZE,
    maxX: BUILD_LIMIT + (expansion.east ?? 0) * EXPANSION_SIZE,
    minZ: -BUILD_LIMIT - (expansion.north ?? 0) * EXPANSION_SIZE,
    maxZ: BUILD_LIMIT + (expansion.south ?? 0) * EXPANSION_SIZE,
  };
}

export const BASE_AREA = buildArea();

export function containsPoint(area, x, z, margin = 0) {
  return Number.isFinite(x) && Number.isFinite(z) &&
    x >= area.minX - margin && x <= area.maxX + margin &&
    z >= area.minZ - margin && z <= area.maxZ + margin;
}
