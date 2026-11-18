import { BUILD_LIMIT } from "./placement.js";

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

const coordinate = (value) =>
  Number.isFinite(value) && Math.abs(value) <= BUILD_LIMIT;
const order = (value) => Number.isSafeInteger(value) && value >= 0;

export function isVillageWorld(world) {
  return (
    record(world, ["version", "houses", "houseOrder", "roads"]) &&
    world.version === 1 &&
    Array.isArray(world.houses) &&
    world.houses.every(
      (house) =>
        record(house, ["x", "z", "rotation", "type"]) &&
        coordinate(house.x) &&
        coordinate(house.z) &&
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
            coordinate(road.x) &&
            coordinate(road.z) &&
            (road.order === undefined || order(road.order)),
        )))
  );
}
