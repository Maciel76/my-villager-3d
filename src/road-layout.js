import {
  LAMP_BASE_RADIUS,
  LOT_SIZE,
  DECORATION_STEP,
  canPlace,
  footprint,
  isLamp,
  isFreeLight,
  isDecoration,
  isPaving,
  isLargeFootprint,
  overlapsLot,
  snap,
  snapFootprint,
} from "./placement.js";
import { buildArea, containsPoint } from "./village-area.js";
import { PAVING_SIZE, snapPaving } from "./paving-types.js";

export const DIRECTIONS = [
  { bit: 1, x: 0, z: -1 },
  { bit: 2, x: 1, z: 0 },
  { bit: 4, x: 0, z: 1 },
  { bit: 8, x: -1, z: 0 },
];

export const LANE_EDGE = 3.5;
export const ASPHALT_Y = 0.045;
export const WALK_EDGE = 5.15;
export const WALK_Y = 0.13;

export const snapTile = (value) => Math.round(value / LOT_SIZE) * LOT_SIZE || 0;
export const tileKey = (x, z) => `${x},${z}`;

export function roadMask(x, z, roads) {
  return DIRECTIONS.reduce((mask, direction) => {
    const neighbor = tileKey(
      x + direction.x * LOT_SIZE,
      z + direction.z * LOT_SIZE,
    );
    return roads.has(neighbor) ? mask | direction.bit : mask;
  }, 0);
}

export function roadZone(x, z, edge, mask) {
  const alongX = Math.abs(x) < edge;
  const alongZ = Math.abs(z) < edge;
  return (
    (alongX && alongZ) ||
    DIRECTIONS.some(
      (dir) =>
        mask & dir.bit &&
        (dir.x ? alongZ && x * dir.x > 0 : alongX && z * dir.z > 0),
    )
  );
}

function streetSurfaceAt(x, z, roads) {
  const cx = snapTile(x);
  const cz = snapTile(z);
  if (!roads.has(tileKey(cx, cz))) return 0;
  const mask = roadMask(cx, cz, roads);
  if (roadZone(x - cx, z - cz, LANE_EDGE + 0.16, mask)) return null;
  return roadZone(x - cx, z - cz, WALK_EDGE, mask) ? WALK_Y : 0;
}

function lampSurfaces(x, z, roads) {
  const heights = [streetSurfaceAt(x, z, roads)];
  for (const dx of [-LAMP_BASE_RADIUS, LAMP_BASE_RADIUS]) {
    for (const dz of [-LAMP_BASE_RADIUS, LAMP_BASE_RADIUS])
      heights.push(streetSurfaceAt(x + dx, z + dz, roads));
  }
  return heights;
}

export function lampSiteHeight(x, z, roads) {
  // All four corners of the widest pedestal must rest on the same surface.
  const heights = lampSurfaces(x, z, roads);
  return heights.every((height) => height === heights[0]) ? heights[0] : null;
}

export function lampRestHeight(x, z, roads) {
  return Math.max(0, ...lampSurfaces(x, z, roads).map((height) => height ?? 0));
}

function preservesLamp({ x, z }, roads, next) {
  if (lampSiteHeight(x, z, next) !== null) return true;
  const old = lampSurfaces(x, z, roads);
  return lampSurfaces(x, z, next).every((height, index) => height === old[index]);
}

export function roadLots(roads, area = buildArea()) {
  const lots = new Map();
  for (const road of roads.values()) {
    for (const direction of DIRECTIONS) {
      const x = road.x + direction.x * LOT_SIZE;
      const z = road.z + direction.z * LOT_SIZE;
      const key = tileKey(x, z);
      if (containsPoint(area, x, z) && !roads.has(key)) lots.set(key, { x, z });
    }
  }
  return lots;
}

export function houseSite(x, z, lots, type, rotation) {
  if (isPaving(type)) return { x: snapPaving(x), z: snapPaving(z) };
  if (isDecoration(type) || isFreeLight(type)) return {
    x: Math.round(x / DECORATION_STEP) * DECORATION_STEP || 0,
    z: Math.round(z / DECORATION_STEP) * DECORATION_STEP || 0,
  };
  if (isLamp(type)) return { x: Math.round(x) || 0, z: Math.round(z) || 0 };
  if (isLargeFootprint(type)) {
    const [width, depth] = footprint(type, rotation);
    return { x: snapFootprint(x, width), z: snapFootprint(z, depth) };
  }
  return (
    lots.get(tileKey(snapTile(x), snapTile(z))) ?? { x: snap(x), z: snap(z) }
  );
}

export function canBuildHouse(x, z, houses, roads, lots, ignored, type, rotation, bounds) {
  if (type === "convergencia" && !ignored && houses.some(house => house.type === type)) return false;
  if (!canPlace(x, z, houses, ignored, type, rotation, bounds)) return false;
  if (isPaving(type)) return pavingFitsRoads(x, z, roads);
  if (isFreeLight(type)) return true;
  if (isDecoration(type)) return true;
  if (isLamp(type)) return lampSiteHeight(x, z, roads) !== null;
  const area = footprint(type, rotation);
  for (const road of roads.values()) {
    if (overlapsLot(x, z, area, road)) return false;
  }
  // Larger footprints are aligned to the lot grid and cover whole parcels.
  if (!isLargeFootprint(type) && !isDecoration(type)) {
    for (const lot of lots.values()) {
      if (overlapsLot(x, z, area, lot) && (lot.x !== x || lot.z !== z))
        return false;
    }
  }
  return true;
}

function pavingFitsRoads(x, z, roads) {
  const half = PAVING_SIZE / 2;
  const edge = LOT_SIZE / 2;
  for (let cx = snapTile(x - half); cx <= snapTile(x + half); cx += LOT_SIZE) {
    for (let cz = snapTile(z - half); cz <= snapTile(z + half); cz += LOT_SIZE) {
      if (!roads.has(tileKey(cx, cz))) continue;
      const left = x - cx - half, right = x - cx + half;
      const front = z - cz - half, back = z - cz + half;
      const hits = (x0, z0, x1, z1) =>
        left < x1 && right > x0 && front < z1 && back > z0;
      if (hits(-LANE_EDGE, -LANE_EDGE, LANE_EDGE, LANE_EDGE)) return false;
      const mask = roadMask(cx, cz, roads);
      if (((mask & 1) && hits(-LANE_EDGE, -edge, LANE_EDGE, 0)) ||
          ((mask & 2) && hits(0, -LANE_EDGE, edge, LANE_EDGE)) ||
          ((mask & 4) && hits(-LANE_EDGE, 0, LANE_EDGE, edge)) ||
          ((mask & 8) && hits(-edge, -LANE_EDGE, 0, LANE_EDGE))) return false;
    }
  }
  return true;
}

function preservesStreetFixture(house, roads, next) {
  if (isFreeLight(house.type)) return true;
  if (isLamp(house.type)) return preservesLamp(house, roads, next);
  return !isPaving(house.type) || pavingFitsRoads(house.x, house.z, next);
}

function preservesStreetFixtures(x, z, houses, roads) {
  const reach = LOT_SIZE * 1.5 + PAVING_SIZE / 2;
  const nearby = houses.filter((house) =>
    ((isLamp(house.type) && !isFreeLight(house.type)) || isPaving(house.type)) &&
    Math.abs(house.x - x) <= reach &&
    Math.abs(house.z - z) <= reach
  );
  if (!nearby.length) return true;
  const next = new Map(roads);
  const key = tileKey(x, z);
  next.set(key, { x, z });
  return nearby.every((house) => preservesStreetFixture(house, roads, next));
}

const roadBuilding = ({ type }) => !isLamp(type) && !isDecoration(type) && !isPaving(type);

export function canBuildRoad(x, z, houses, roads, area) {
  return (
    x === snapTile(x) &&
    z === snapTile(z) &&
    !roads.has(tileKey(x, z)) &&
    canPlace(x, z, houses.filter(roadBuilding), null, undefined, 0, area) &&
    preservesStreetFixtures(x, z, houses, roads)
  );
}

export function canMoveRoad(x, z, source, houses, roads, area) {
  if (!roads.has(tileKey(source.x, source.z))) return false;
  if (x === source.x && z === source.z) return true;
  const next = new Map(roads);
  next.delete(tileKey(source.x, source.z));
  const buildings = houses.filter(roadBuilding);
  if (!canBuildRoad(x, z, buildings, next, area)) return false;
  next.set(tileKey(x, z), { ...source, x, z });
  // Validate both ends of the move together, including the changed connections.
  return houses.every(house => preservesStreetFixture(house, roads, next));
}

export function canRemoveRoad(x, z, _houses, roads) {
  // Removing a connection only shrinks the paved traffic lane.
  return roads.has(tileKey(x, z));
}

export function readRoads(records, houses, nextOrder, area) {
  if (typeof area === "number") area = buildArea({}, area);
  const roads = new Map();
  if (!Array.isArray(records)) return roads;
  const buildings = houses.filter(roadBuilding);
  for (const record of records) {
    if (record && canBuildRoad(record.x, record.z, buildings, roads, area)) {
      const order =
        Number.isSafeInteger(record.order) && record.order >= 0
          ? record.order
          : nextOrder++;
      roads.set(tileKey(record.x, record.z), {
        x: record.x,
        z: record.z,
        order,
      });
    }
  }
  return roads;
}
