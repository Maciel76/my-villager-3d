import { DEFAULT_HOUSE, BUILDING_TYPES } from "./house-types.js";

export const BUILD_LIMIT = 87;
export const LOT_SIZE = 12;
export const LAMP_FOOTPRINT = 2;
export const LAMP_BASE_RADIUS = 0.33;

export const isLamp = (type) => BUILDING_TYPES[type]?.category === "lighting";

export function snap(value) {
  return Math.round(value / 2) * 2;
}

export function footprint(type, rotation = 0) {
  if (isLamp(type)) return [LAMP_FOOTPRINT, LAMP_FOOTPRINT];
  const span = BUILDING_TYPES[type]?.lotSpan ?? 1;
  const [columns, rows] = Array.isArray(span) ? span : [span, span];
  const width = LOT_SIZE * columns;
  const depth = LOT_SIZE * rows;
  return rotation % 2 ? [depth, width] : [width, depth];
}

export const isLargeFootprint = (type) =>
  footprint(type).some((size) => size > LOT_SIZE);

export function snapFootprint(value, size) {
  const offset = (size - LOT_SIZE) / 2;
  return Math.round((value - offset) / LOT_SIZE) * LOT_SIZE + offset;
}

export const buildLimit = (size) =>
  BUILD_LIMIT - Math.max(0, size - LOT_SIZE) / 2;

export function insideBuildArea(x, z, type, rotation) {
  const [width, depth] = footprint(type, rotation);
  return (
    Number.isFinite(x) &&
    Number.isFinite(z) &&
    Math.abs(x) <= buildLimit(width) &&
    Math.abs(z) <= buildLimit(depth)
  );
}

export function overlapsLot(x, z, [width, depth], other) {
  const [otherWidth, otherDepth] = footprint(other.type, other.rotation);
  return (
    Math.abs(other.x - x) < (width + otherWidth) / 2 &&
    Math.abs(other.z - z) < (depth + otherDepth) / 2
  );
}

export function canPlace(x, z, houses, ignored = null, type, rotation) {
  const area = footprint(type, rotation);
  const [width, depth] = area;
  if (!insideBuildArea(x, z, type, rotation)) return false;
  if (isLamp(type) && (!Number.isInteger(x) || !Number.isInteger(z))) return false;
  if (
    isLargeFootprint(type) &&
    (snapFootprint(x, width) !== x || snapFootprint(z, depth) !== z)
  )
    return false;
  return houses.every(
    (house) => house === ignored || !overlapsLot(x, z, area, house),
  );
}

export function readSave(save) {
  if (save.version !== 1 || !Array.isArray(save.houses))
    throw new Error("Save inválido");
  const houses = [];
  for (const [index, h] of save.houses.entries()) {
    if (!h) continue;
    const type = Object.hasOwn(BUILDING_TYPES, h.type) ? h.type : DEFAULT_HOUSE;
    if (
      Number.isInteger(h.rotation) &&
      h.rotation >= 0 &&
      h.rotation < 4 &&
      canPlace(h.x, h.z, houses, null, type, h.rotation)
    ) {
      const storedOrder = save.houseOrder?.[index];
      const order =
        Number.isSafeInteger(storedOrder) && storedOrder >= 0
          ? storedOrder
          : index;
      houses.push({ x: h.x, z: h.z, rotation: h.rotation, type, order });
    }
  }
  return houses;
}
