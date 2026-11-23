import { BUILDING_TYPES } from "./house-types.js";
import { LOT_SIZE, footprint, isDecoration, isLamp, isFreeLight, isPaving } from "./placement.js";
import { canBuildHouse, roadLots, tileKey } from "./road-layout.js";
import { LEGACY_AREA_SIZE } from "./build-area.js";
import { buildArea } from "./village-area.js";

// Four continuous streets in each direction form a ring and nine districts.
// The outside row faces the ring, so the whole clearing has street access.
export const CITY_STREETS = [-72, -24, 24, 72];
export const CITY_EXPANSION = { north: 2, east: 2, south: 2 };
export const MIRANTE_AVENUE = -120;

export function extendNorthernAvenue(roads) {
  for (const z of [-96, -108]) {
    roads.set(tileKey(24, z), { x: 24, z, order: roads.size });
  }
  for (let x = 24; x >= -36; x -= LOT_SIZE) {
    const z = MIRANTE_AVENUE;
    roads.set(tileKey(x, z), { x, z, order: roads.size });
  }
}

export function extendEasternAvenue(roads) {
  const z = -72;
  for (let x = 96; x <= 156; x += LOT_SIZE) {
    roads.set(tileKey(x, z), { x, z, order: roads.size });
  }
}

export function extendLexCorpAvenue(roads) {
  roads.set(tileKey(-72, -96), { x: -72, z: -96, order: roads.size });
  for (let x = -84; x <= -48; x += LOT_SIZE)
    roads.set(tileKey(x, -108), { x, z: -108, order: roads.size });
}

export function extendPoliceAvenue(roads) {
  for(let x=-72;x<=156;x+=LOT_SIZE)
    roads.set(tileKey(x,96),{x,z:96,order:roads.size});
}

export function createCityPlan() {
  const roads = new Map();
  for (let x = -84; x <= 84; x += LOT_SIZE) {
    for (let z = -84; z <= 84; z += LOT_SIZE) {
      if (CITY_STREETS.includes(x) || CITY_STREETS.includes(z))
        roads.set(tileKey(x, z), { x, z, order: roads.size });
    }
  }
  extendNorthernAvenue(roads);
  extendEasternAvenue(roads);
  extendLexCorpAvenue(roads);
  extendPoliceAvenue(roads);
  const area = buildArea(CITY_EXPANSION, LEGACY_AREA_SIZE);
  const lots = roadLots(roads, area);
  const houses = [];
  function add(type, x, z, rotation = 0) {
    if (!canBuildHouse(x, z, houses, roads, lots, null, type, rotation, area))
      throw new Error(`Lote inválido: ${type} em ${x},${z}`);
    houses.push({ type, x, z, rotation });
  }

  // The palace's gateway faces the southern avenue. Its north side is a
  // shopping frontage; its 36 x 24 m parcel stays entirely clear of asphalt.
  add("palace", 0, 6);
  add("miranteOriental", 6, -102, 2);
  add("edificioOrion", -18, -144);
  add("convergencia", 126, -114);
  add("rodaGigante", 120, -54, 2);
  add("lexCorp", -66, -138);
  add("policeStation",42,132,2);
  add("fireStation",-36,126,2);
  add("monumentoBombeiros",-30,-108,2);
  add("starship",126,132,2);
  for (const [index, type] of ["bakery", "market", "pharmacy"].entries())
    add(type, -12 + index * 12, -12, 2);

  // Large plots anchor seven districts. Their remaining L-shaped frontage
  // uses small parcels, with every entrance opening onto a bordering street.
  const districts = [
    { x: -48, z: -48, type: "oriental", east: false,
      small: ["cottage", "chalet", "townhouse", "cafe", "bakery"] },
    { x: 0, z: -48, type: "aurora", east: false,
      small: ["varandas", "mirante", "terrace", "pharmacy", "market"] },
    { x: 48, z: -48, type: "sakura", east: true,
      small: ["courtyard", "modern", "terrace", "cafe", "cottage"] },
    { x: -48, z: 0, type: "gasStation", east: false,
      small: ["market", "pharmacy", "bakery", "townhouse", "cafe"] },
    { x: 48, z: 0, type: "church", east: true,
      small: ["rotunda", "bakery", "pharmacy", "cottage", "townhouse"] },
    { x: 0, z: 48, type: "cuboVerde", east: false,
      small: ["varandas", "mirante", "terrace", "modern", "market"] },
    { x: -48, z: 48, type: "belleEpoque", east: false,
      small: ["cottage", "chalet", "townhouse", "modern", "courtyard"] },
  ];
  for (const { x, z, type, east, small } of districts) {
    const side = east ? 1 : -1;
    add(type, x + side * 6, z - 6, 2);
    for (let row = 0; row < 3; row++)
      add(small[row], x - side * 12, z - 12 + row * 12, east ? 3 : 1);
    for (let column = 0; column < 2; column++)
      add(small[3 + column], x + side * column * 12, z + 12);
  }

  // A full commercial block accommodates the supermarket and its forecourt.
  const homes = ["cottage", "chalet", "townhouse", "modern", "courtyard", "terrace"];
  add("supermarket", 48, 48);
  add("lampZen", 68, 68);
  add("lampOriental", 68, 76);

  // Complete the edge of the clearing, including all four corner parcels.
  let index = 0;
  for (let x = -84; x <= 84; x += LOT_SIZE) {
    for (let z = -84; z <= 84; z += LOT_SIZE) {
      if (Math.abs(x) !== 84 && Math.abs(z) !== 84) continue;
      if (roads.has(tileKey(x, z))) continue;
      const rotation = z === -84 ? 0 : z === 84 ? 2 : x === -84 ? 1 : 3;
      add(homes[index++ % homes.length], x, z, rotation);
    }
  }

  // One lamp per 12 m road module. Corner sites remain on the sidewalk even
  // at four-way junctions; directional LED arms point inward over the lane.
  for (const { x, z } of roads.values()) {
    const vertical = CITY_STREETS.includes(x);
    const horizontal = CITY_STREETS.includes(z) || z === 96 || z === MIRANTE_AVENUE || (z === -108 && x <= -48);
    const alternating = z === MIRANTE_AVENUE || Math.abs((vertical ? z : x) / 12) % 2 ? 1 : -1;
    if (vertical && horizontal) {
      add("lampDouble", x + 4, z + 4, 0);
    } else if (vertical) {
      const type = x < 0 ? "lampUrban" : "lampSolar";
      add(type, x + alternating * 4, z, alternating > 0 ? 2 : 0);
    } else {
      const type = z < -24 ? "lampColonial" : "lampUrban";
      add(type, x, z + alternating * 4, alternating > 0 ? 1 : 3);
    }
  }

  // Keep the same save format as manual construction and normal undo/editing.
  const world = {
    version: 1,
    houses,
    houseOrder: houses.map((_, i) => roads.size + i),
    roads: [...roads.values()],
    expansion: { ...CITY_EXPANSION },
  };
  // The architectural plan uses its parcels for buildings and street lighting.
  const missing = Object.keys(BUILDING_TYPES).filter((type) =>
    !isDecoration(type) && !isPaving(type) && !isFreeLight(type) && !houses.some((h) => h.type === type));
  if (missing.length) throw new Error(`Modelos ausentes: ${missing.join(", ")}`);
  return world;
}

export function cityPlanSummary(world) {
  const counts = {};
  for (const { type } of world.houses) {
    const category = BUILDING_TYPES[type].category;
    counts[category] = (counts[category] ?? 0) + 1;
  }
  return {
    ...counts,
    buildings: world.houses.filter(({ type }) => !isLamp(type)).length,
    roadTiles: world.roads.length,
    roadLength: world.roads.length * LOT_SIZE,
    occupiedParcels: world.houses.filter(({ type }) => !isLamp(type))
      .reduce((sum, h) => sum + footprint(h.type, h.rotation).reduce((a, b) => a * b) / LOT_SIZE ** 2, 0),
  };
}
