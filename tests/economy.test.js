import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceEconomy, cityEconomy, economyProfile, ECONOMY_CYCLE_MS, MAX_BALANCE, startingBalance,
} from "../src/economy.js";
import { BUILDING_TYPES } from "../src/house-types.js";
import { isVillageWorld } from "../src/village-data.js";

test("every shop item has a price and larger buildings hold more residents or workers", () => {
  for (const [type, { category }] of Object.entries(BUILDING_TYPES)) {
    const { price, residents, jobs } = economyProfile(type);
    assert(Number.isSafeInteger(price) && price > 0, type);
    assert.equal(residents > 0, category === "residential" || category === "apartments", type);
    assert.equal(jobs > 0, category === "commercial", type);
  }
  assert(economyProfile("edificioOrion").residents > economyProfile("cottage").residents);
  assert(economyProfile("supermarket").jobs > economyProfile("market").jobs);
});

test("commercial income depends on filled jobs and revenue arrives at the end of a cycle", () => {
  const market = { type: "market" };
  assert.equal(cityEconomy([market]).income, 0);
  const village = cityEconomy([market, { type: "cottage" }]);
  assert.deepEqual(village, { residents: 3, jobs: 10, employed: 1, commerceIncome: 11, income: 14 });
  const treasury = { coins: startingBalance(village.residents), progressMs: 0 };
  assert.equal(advanceEconomy(treasury, ECONOMY_CYCLE_MS - 1, village.income), false);
  assert.equal(advanceEconomy(treasury, 1, village.income), true);
  assert.deepEqual(treasury, { coins: 2514, progressMs: 0 });
});

test("the save format accepts existing villages and rejects invalid treasury values", () => {
  const world = { version: 1, houses: [{ x: 0, z: 0, rotation: 0 }] };
  assert(isVillageWorld(world));
  assert(isVillageWorld({ ...world, economy: { coins: 0, progressMs: 0 } }));
  for (const coins of [-1, 0.5, MAX_BALANCE + 1]) {
    assert.equal(isVillageWorld({ ...world, economy: { coins, progressMs: 0 } }), false);
  }
  assert.equal(isVillageWorld({ ...world, economy: { coins: 0, progressMs: ECONOMY_CYCLE_MS } }), false);
});
