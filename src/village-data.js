import { buildArea, containsPoint, isExpansion } from "./village-area.js";
import { ECONOMY_CYCLE_MS, MAX_BALANCE } from "./economy.js";
import { isFreeLight, isLightHeight } from "./placement.js";
import { LEGACY_AREA_SIZE, isAreaSize } from "./build-area.js";
import { isStellarTimestamp } from "./stellar-event.js";

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
const hasStellarState = ({ stellarAt, stellarReactivatedAt }) => stellarAt !== undefined || stellarReactivatedAt !== undefined;

function isStellarState({ stellarAt, stellarReactivatedAt }) {
  return (stellarAt === undefined || isStellarTimestamp(stellarAt)) &&
    (stellarReactivatedAt === undefined || isStellarTimestamp(stellarReactivatedAt)) &&
    (stellarAt === undefined || stellarReactivatedAt === undefined);
}

function isTreasury(value) {
  return record(value, ["coins", "progressMs"]) &&
    order(value.coins) && value.coins <= MAX_BALANCE &&
    order(value.progressMs) && value.progressMs < ECONOMY_CYCLE_MS;
}

export function isVillageWorld(world) {
  const size = world?.areaSize === undefined ? LEGACY_AREA_SIZE : world.areaSize;
  if (!record(world, ["version", "areaSize", "houses", "houseOrder", "roads", "expansion", "economy", "stellarSkyAt", "convergenceReserve"]) ||
      !isAreaSize(size) ||
      world.version !== 1 ||
      (world.stellarSkyAt != null && !isStellarTimestamp(world.stellarSkyAt)) ||
      (world.convergenceReserve !== undefined && (!record(world.convergenceReserve, ["stellarAt", "stellarReactivatedAt"]) ||
        !isStellarState(world.convergenceReserve))) ||
      (world.economy !== undefined && !isTreasury(world.economy)) ||
      (world.expansion !== undefined && !isExpansion(world.expansion))) return false;
  const area = buildArea(world.expansion, size);
  return (
    Array.isArray(world.houses) &&
    world.houses.every(
      (house) =>
        record(house, ["x", "y", "z", "rotation", "type", "stellarAt", "stellarReactivatedAt"]) &&
        (!hasStellarState(house) || (house.type === "convergencia" && isStellarState(house))) &&
        (world.convergenceReserve === undefined || house.type !== "convergencia") &&
        (!Object.hasOwn(house, "y") || (isFreeLight(house.type) && isLightHeight(house.y))) &&
        containsPoint(area, house.x, house.z) &&
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
