import {
  BUILD_LIMIT,
  LAMP_BASE_RADIUS,
  LOT_SIZE,
  canPlace,
  footprint,
  isLamp,
  isLargeFootprint,
  overlapsLot,
  snap,
  snapFootprint,
} from "./placement.js";

export const DIRECTIONS = [
  { bit: 1, x: 0, z: -1 },
  { bit: 2, x: 1, z: 0 },
  { bit: 4, x: 0, z: 1 },
  { bit: 8, x: -1, z: 0 },
];

const tilesPerSide = 2 * Math.floor(BUILD_LIMIT / LOT_SIZE) + 1;
export const LANE_EDGE = 3.5;
export const WALK_EDGE = 5.15;
export const WALK_Y = 0.13;

export const snapTile = (value) => Math.round(value / LOT_SIZE) * LOT_SIZE || 0;
export const tileKey = (x, z) => `${x},${z}`;

const inBounds = (x, z) =>
  Math.abs(x) <= BUILD_LIMIT && Math.abs(z) <= BUILD_LIMIT;

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

export function lampSiteHeight(x, z, roads) {
  // All four corners of the widest pedestal must rest on the same surface.
  const height = streetSurfaceAt(x, z, roads);
  if (height === null) return null;
  for (const dx of [-LAMP_BASE_RADIUS, LAMP_BASE_RADIUS]) {
    for (const dz of [-LAMP_BASE_RADIUS, LAMP_BASE_RADIUS]) {
      if (streetSurfaceAt(x + dx, z + dz, roads) !== height) return null;
    }
  }
  return height;
}

export function roadLots(roads) {
  const lots = new Map();
  for (const road of roads.values()) {
    for (const direction of DIRECTIONS) {
      const x = road.x + direction.x * LOT_SIZE;
      const z = road.z + direction.z * LOT_SIZE;
      const key = tileKey(x, z);
      if (inBounds(x, z) && !roads.has(key)) lots.set(key, { x, z });
    }
  }
  return lots;
}

export function houseSite(x, z, lots, type, rotation) {
  if (isLamp(type)) return { x: Math.round(x) || 0, z: Math.round(z) || 0 };
  if (isLargeFootprint(type)) {
    const [width, depth] = footprint(type, rotation);
    return { x: snapFootprint(x, width), z: snapFootprint(z, depth) };
  }
  return (
    lots.get(tileKey(snapTile(x), snapTile(z))) ?? { x: snap(x), z: snap(z) }
  );
}

export function canBuildHouse(x, z, houses, roads, lots, ignored, type, rotation) {
  if (!canPlace(x, z, houses, ignored, type, rotation)) return false;
  if (isLamp(type)) return lampSiteHeight(x, z, roads) !== null;
  const area = footprint(type, rotation);
  for (const road of roads.values()) {
    if (overlapsLot(x, z, area, road)) return false;
  }
  // Larger footprints are aligned to the lot grid and cover whole parcels.
  if (!isLargeFootprint(type)) {
    for (const lot of lots.values()) {
      if (overlapsLot(x, z, area, lot) && (lot.x !== x || lot.z !== z))
        return false;
    }
  }
  return true;
}

function preservesLampSites(x, z, houses, roads, remove) {
  const reach = LOT_SIZE * 1.5 + LAMP_BASE_RADIUS;
  const nearby = houses.filter((house) =>
    isLamp(house.type) &&
    Math.abs(house.x - x) <= reach &&
    Math.abs(house.z - z) <= reach
  );
  if (!nearby.length) return true;
  const next = new Map(roads);
  const key = tileKey(x, z);
  if (remove) next.delete(key);
  else next.set(key, { x, z });
  return nearby.every((lamp) => lampSiteHeight(lamp.x, lamp.z, next) !== null);
}

export function canBuildRoad(x, z, houses, roads) {
  return (
    x === snapTile(x) &&
    z === snapTile(z) &&
    !roads.has(tileKey(x, z)) &&
    canPlace(x, z, houses.filter(({ type }) => !isLamp(type))) &&
    preservesLampSites(x, z, houses, roads, false)
  );
}

export function canRemoveRoad(x, z, houses, roads) {
  return roads.has(tileKey(x, z)) && preservesLampSites(x, z, houses, roads, true);
}

export function readRoads(records, houses, nextOrder) {
  const roads = new Map();
  if (!Array.isArray(records)) return roads;
  const buildings = houses.filter(({ type }) => !isLamp(type));
  for (const record of records.slice(0, tilesPerSide ** 2)) {
    if (record && canBuildRoad(record.x, record.z, buildings, roads)) {
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
