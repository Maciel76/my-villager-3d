import { DEFAULT_HOUSE, BUILDING_TYPES } from "./house-types.js";
import { LOT_SIZE, buildArea, containsPoint } from "./village-area.js";
import { PAVING_SIZE, snapPaving } from "./paving-types.js";

export { BUILD_LIMIT, LOT_SIZE } from "./village-area.js";
import { BUILD_LIMIT, LEGACY_AREA_SIZE, isAreaSize } from "./build-area.js";
import { isLaunchTimestamp } from "./starship-mission.js";
export const LAMP_FOOTPRINT = 2;
export const LAMP_BASE_RADIUS = 0.33;
export const DECORATION_STEP = .25;
export const FREE_LIGHT_MIN_Y = -20;
export const FREE_LIGHT_MAX_Y = 100;
export const FREE_LIGHT_DEFAULT_Y = 3;
export const isFreeLight = type => Boolean(BUILDING_TYPES[type]?.freeLight);
export const isLightHeight = y => Number.isFinite(y) && y >= FREE_LIGHT_MIN_Y && y <= FREE_LIGHT_MAX_Y;

// Populated from rendered models before reading a saved village. A server or
// offline save reader has no meshes and must never discard garden decorations
// merely because they share a building's reserved lot.
const decorationObstacles = new Map();
const pavingObstacles = new Map();
export function setDecorationObstacles(type, rectangles) {
  if (rectangles === null) decorationObstacles.delete(type);
  else decorationObstacles.set(type, rectangles);
}

export function setPavingObstacles(type, rectangles) {
  pavingObstacles.set(type, rectangles);
}

export const isLamp = (type) => BUILDING_TYPES[type]?.category === "lighting";
const buildingCategories = new Set(["residential", "apartments", "landmarks", "commercial"]);
export const isBuilding = (type) => buildingCategories.has(BUILDING_TYPES[type]?.category);
export const isPaving = (type) => BUILDING_TYPES[type]?.category === "paving";
export const isDecoration = (type) => BUILDING_TYPES[type]?.category === "decoration";
export const isTree = (type) => BUILDING_TYPES[type]?.family === "trees";
export const isPlantingBed = (type) => Boolean(BUILDING_TYPES[type]?.plantingBed);

export function snap(value) {
  return Math.round(value / 2) * 2;
}

export function footprint(type, rotation = 0) {
  if (isPaving(type)) return [PAVING_SIZE, PAVING_SIZE];
  if (isFreeLight(type)) return [.25, .25];
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

export function placementBounds(type, rotation, area = buildArea()) {
  if (typeof area === "number") area = { minX: -area, maxX: area, minZ: -area, maxZ: area };
  const [width, depth] = footprint(type, rotation);
  const x = isPaving(type) ? width / 2 : Math.max(0, width - LOT_SIZE) / 2;
  const z = isPaving(type) ? depth / 2 : Math.max(0, depth - LOT_SIZE) / 2;
  return { minX: area.minX + x, maxX: area.maxX - x, minZ: area.minZ + z, maxZ: area.maxZ - z };
}

export function insideBuildArea(x, z, type, rotation, area) {
  return containsPoint(placementBounds(type, rotation, area), x, z);
}

export function overlapsLot(x, z, [width, depth], other) {
  const [otherWidth, otherDepth] = footprint(other.type, other.rotation);
  return (
    Math.abs(other.x - x) < (width + otherWidth) / 2 &&
    Math.abs(other.z - z) < (depth + otherDepth) / 2
  );
}

export function canPlace(x, z, houses, ignored = null, type, rotation, area, order) {
  const [width, depth] = footprint(type, rotation);
  if (!insideBuildArea(x, z, type, rotation, area)) return false;
  if (isPaving(type) && (snapPaving(x) !== x || snapPaving(z) !== z)) return false;
  if (isFreeLight(type)) return true;
  if (isLamp(type) && (!Number.isInteger(x) || !Number.isInteger(z))) return false;
  if (
    isLargeFootprint(type) &&
    (snapFootprint(x, width) !== x || snapFootprint(z, depth) !== z)
  )
    return false;
  const placementOrder = order ?? (ignored?.x === x && ignored.z === z ? ignored.order : Infinity);
  const candidate = { x, z, type, rotation, order: placementOrder ?? Infinity };
  return houses.every(house => house === ignored || !overlapsPlacement(candidate, house));
}

export function decorationHitsBuilding(decoration, building) {
  const rotation = ((building.rotation ?? 0) % 4 + 4) % 4;
  const cos = [1, 0, -1, 0][rotation], sin = [0, 1, 0, -1][rotation];
  const dx = decoration.x - building.x, dz = decoration.z - building.z;
  const x = dx * cos - dz * sin, z = dx * sin + dz * cos;
  const [width, depth] = footprint(decoration.type, (decoration.rotation ?? 0) - rotation);
  const margin = .035;
  const hits = ([x0, z0, x1, z1]) =>
    x + width / 2 > x0 + margin && x - width / 2 < x1 - margin &&
    z + depth / 2 > z0 + margin && z - depth / 2 < z1 - margin;
  return Boolean(decorationObstacles.get(building.type)?.some(hits) ||
    (isPaving(decoration.type) && pavingObstacles.get(building.type)?.some(hits)));
}

export function pavingUnderBuilding(paving, building) {
  if (!overlapsLot(paving.x, paving.z, footprint(paving.type), building)) return false;
  return paving.order < building.order || decorationHitsBuilding(paving, building);
}

export function overlapsPlacement(first, second) {
  if (isFreeLight(first.type) || isFreeLight(second.type)) return false;
  if (isPaving(first.type) || isPaving(second.type)) {
    const paving = isPaving(first.type) ? first : second;
    const other = paving === first ? second : first;
    if (isPaving(other.type))
      return overlapsLot(paving.x, paving.z, footprint(paving.type), other);
    if (!isBuilding(other.type)) return false;
    const firstOrder = first.order ?? Infinity, secondOrder = second.order ?? -1;
    const pavingFirst = paving === first ? firstOrder < secondOrder : secondOrder < firstOrder;
    return !pavingFirst && decorationHitsBuilding(paving, other);
  }
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

export function readSave(save, area = buildArea(save?.expansion, save?.areaSize ?? LEGACY_AREA_SIZE)) {
  if (save.version !== 1 || !Array.isArray(save.houses))
    throw new Error("Save inválido");
  const areaSize = save.areaSize === undefined ? LEGACY_AREA_SIZE : save.areaSize;
  if (!isAreaSize(areaSize)) throw new Error("Terreno salvo inválido");
  const houses = [];
  for (const [index, h] of save.houses.entries()) {
    if (!h) continue;
    const type = Object.hasOwn(BUILDING_TYPES, h.type) ? h.type : DEFAULT_HOUSE;
    const lightY = Object.hasOwn(h, "y") ? h.y : FREE_LIGHT_DEFAULT_Y;
    if (isFreeLight(type) && !isLightHeight(lightY)) continue;
    if (
      Number.isInteger(h.rotation) &&
      h.rotation >= 0 &&
      h.rotation < 4 &&
      // Previously saved blocks under a wall still belong to the lower layer.
      canPlace(h.x, h.z, houses, null, type, h.rotation, area, isPaving(type) ? -Infinity : Infinity)
    ) {
      const storedOrder = save.houseOrder?.[index];
      const order =
        Number.isSafeInteger(storedOrder) && storedOrder >= 0
          ? storedOrder
          : index;
      houses.push({ x: h.x, z: h.z, rotation: h.rotation, type, order,
        ...(type === "starship" && isLaunchTimestamp(h.launchAt) ? { launchAt: h.launchAt } : {}),
        ...(type === "convergencia" && Object.hasOwn(h, "stellarAt") ? { stellarAt: h.stellarAt } : {}),
        ...(type === "convergencia" && Object.hasOwn(h, "stellarReactivatedAt") ? { stellarReactivatedAt: h.stellarReactivatedAt } : {}),
        ...(isFreeLight(type) ? { y: lightY } : {}) });
    }
  }
  return houses;
}
