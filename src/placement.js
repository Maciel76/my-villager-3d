import { DEFAULT_HOUSE, BUILDING_TYPES } from "./house-types.js";

export const BUILD_LIMIT = 87;
export const LOT_SIZE = 12;
export const LAMP_FOOTPRINT = 2;
export const LAMP_BASE_RADIUS = 0.33;
export const DECORATION_STEP = .25;

// Populated from rendered models before reading a saved village. A server or
// offline save reader has no meshes and must never discard garden decorations
// merely because they share a building's reserved lot.
const decorationObstacles = new Map();
export function setDecorationObstacles(type, rectangles) {
  if (rectangles === null) decorationObstacles.delete(type);
  else decorationObstacles.set(type, rectangles);
}

export const isLamp = (type) => BUILDING_TYPES[type]?.category === "lighting";
export const isDecoration = (type) => BUILDING_TYPES[type]?.category === "decoration";
export const isTree = (type) => BUILDING_TYPES[type]?.family === "trees";
export const isPlantingBed = (type) => Boolean(BUILDING_TYPES[type]?.plantingBed);

export function snap(value) {
  return Math.round(value / 2) * 2;
}

export function footprint(type, rotation = 0) {
  if (isLamp(type)) return [LAMP_FOOTPRINT, LAMP_FOOTPRINT];
  if (isDecoration(type)) {
    const [width, depth] = BUILDING_TYPES[type].placementSize ?? BUILDING_TYPES[type].size;
    return rotation % 2 ? [depth, width] : [width, depth];
  }
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
    (house) => house === ignored || !overlapsPlacement({ x, z, type, rotation }, house),
  );
}

function decorationHitsBuilding(decoration, building) {
  const rectangles = decorationObstacles.get(building.type);
  if (!rectangles) return false;
  const rotation = ((building.rotation ?? 0) % 4 + 4) % 4;
  const cos = [1, 0, -1, 0][rotation], sin = [0, 1, 0, -1][rotation];
  const dx = decoration.x - building.x, dz = decoration.z - building.z;
  const x = dx * cos - dz * sin, z = dx * sin + dz * cos;
  const [width, depth] = footprint(decoration.type, (decoration.rotation ?? 0) - rotation);
  const margin = .035;
  return rectangles.some(([x0, z0, x1, z1]) =>
    x + width / 2 > x0 + margin && x - width / 2 < x1 - margin &&
    z + depth / 2 > z0 + margin && z - depth / 2 < z1 - margin);
}

export function overlapsPlacement(first, second) {
  if (isTree(first.type) && isPlantingBed(second.type) && treeFitsPlantingBed(first, second)) return false;
  if (isTree(second.type) && isPlantingBed(first.type) && treeFitsPlantingBed(second, first)) return false;
  const firstDecoration = isDecoration(first.type), secondDecoration = isDecoration(second.type);
  if (firstDecoration && !secondDecoration && !isLamp(second.type)) return decorationHitsBuilding(first, second);
  if (secondDecoration && !firstDecoration && !isLamp(first.type)) return decorationHitsBuilding(second, first);
  // Lamp lots remain unchanged for architecture; decorations use the pedestal.
  const size = object => (firstDecoration || secondDecoration) && isLamp(object.type)
    ? [LAMP_BASE_RADIUS * 2, LAMP_BASE_RADIUS * 2] : footprint(object.type, object.rotation);
  const [width, depth] = size(first), [otherWidth, otherDepth] = size(second);
  return Math.abs(first.x - second.x) < (width + otherWidth) / 2 &&
    Math.abs(first.z - second.z) < (depth + otherDepth) / 2;
}

export function treeFitsPlantingBed(tree, bed) {
  if (!isTree(tree.type) || !isPlantingBed(bed.type)) return false;
  const rotation = ((bed.rotation ?? 0) % 4 + 4) % 4;
  const cos = [1, 0, -1, 0][rotation], sin = [0, 1, 0, -1][rotation];
  const dx = tree.x - bed.x, dz = tree.z - bed.z;
  const x = dx * cos - dz * sin, z = dx * sin + dz * cos;
  const [width, depth] = footprint(tree.type, (tree.rotation ?? 0) - rotation);
  return BUILDING_TYPES[bed.type].plantingBed.regions.some(region => {
    const corners = [-1, 1].flatMap(sx => [-1, 1].map(sz => [
      x - (region.x ?? 0) + sx * width / 2,
      z - (region.z ?? 0) + sz * depth / 2,
    ]));
    return corners.every(([cx, cz]) => {
      if (region.shape === "circle") return Math.hypot(cx, cz) <= region.radius + 1e-6;
      if (region.shape === "capsule") return Math.hypot(cx, Math.max(0, Math.abs(cz) - region.halfLength)) <= region.radius + 1e-6;
      return Math.abs(cx) <= region.width / 2 + 1e-6 && Math.abs(cz) <= region.depth / 2 + 1e-6;
    });
  });
}

export function plantingBedUnder(tree, houses) {
  return houses.find(bed => treeFitsPlantingBed(tree, bed)) ?? null;
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
