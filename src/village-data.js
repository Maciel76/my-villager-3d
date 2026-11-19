<<<<<<< HEAD
import { buildArea, containsPoint, isExpansion } from "./village-area.js";
import { ECONOMY_CYCLE_MS, MAX_BALANCE } from "./economy.js";
=======
import { isFreeLight, isLightHeight } from "./placement.js";
import { LEGACY_AREA_SIZE, areaBuildLimit, isAreaSize } from "./build-area.js";
>>>>>>> 9c3bcfe (ajustando jogabilidade2)

const hourOptions = new Set(["7.5", "12", "18", "23"]);
export const isVillageHour = (value) => hourOptions.has(value);

function record(value, keys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).every((key) => keys.includes(key))
  );
}

const order = (value) => Number.isSafeInteger(value) && value >= 0;

function isTreasury(value) {
  return record(value, ["coins", "progressMs"]) &&
    order(value.coins) && value.coins <= MAX_BALANCE &&
    order(value.progressMs) && value.progressMs < ECONOMY_CYCLE_MS;
}

export function isVillageWorld(world) {
<<<<<<< HEAD
  if (!record(world, ["version", "houses", "houseOrder", "roads", "expansion", "economy"]) ||
      world.version !== 1 ||
      (world.economy !== undefined && !isTreasury(world.economy)) ||
      (world.expansion !== undefined && !isExpansion(world.expansion))) return false;
  const area = buildArea(world.expansion);
  return (
    Array.isArray(world.houses) &&
    world.houses.every(
      (house) =>
        record(house, ["x", "z", "rotation", "type"]) &&
        containsPoint(area, house.x, house.z) &&
=======
  const size = world?.areaSize === undefined ? LEGACY_AREA_SIZE : world.areaSize;
  const coordinate = value => Number.isFinite(value) && Math.abs(value) <= areaBuildLimit(size);
  return (
    record(world, ["version", "areaSize", "houses", "houseOrder", "roads"]) &&
    isAreaSize(size) &&
    world.version === 1 &&
    Array.isArray(world.houses) &&
    world.houses.every(
      (house) =>
        record(house, ["x", "y", "z", "rotation", "type"]) &&
        (!Object.hasOwn(house, "y") || (isFreeLight(house.type) && isLightHeight(house.y))) &&
        coordinate(house.x) &&
        coordinate(house.z) &&
>>>>>>> 9c3bcfe (ajustando jogabilidade2)
        Number.isInteger(house.rotation) &&
        house.rotation >= 0 &&
        house.rotation < 4 &&
        (house.type === undefined ||
          (typeof house.type === "string" && house.type.length <= 80)),
    ) &&
    (world.houseOrder === undefined ||
      (Array.isArray(world.houseOrder) && world.houseOrder.every(order))) &&
    (world.roads === undefined ||
      (Array.isArray(world.roads) &&
        world.roads.every(
          (road) =>
            record(road, ["x", "z", "order"]) &&
            containsPoint(area, road.x, road.z) &&
            (road.order === undefined || order(road.order)),
        )))
  );
}
