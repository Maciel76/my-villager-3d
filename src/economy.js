import { BUILDING_TYPES } from "./house-types.js";
import { footprint, LOT_SIZE } from "./placement.js";

export const ECONOMY_CYCLE_MS = 30_000;
export const MAX_BALANCE = 1_000_000_000;
export const ROAD_PRICE = 75;
export const EXPANSION_PRICE = 1_250;

const homes = {
  cottage: 3, chalet: 4, townhouse: 5, modern: 4, courtyard: 5, terrace: 4,
  cuboVerde: 9, belleEpoque: 12, sakura: 8, oriental: 10,
  varandas: 32, mirante: 48, miranteOriental: 92, aurora: 120, edificioOrion: 200,
};
const jobs = { bakery: 6, market: 10, cafe: 5, pharmacy: 6, gasStation: 15, supermarket: 54 };
const integer = new Intl.NumberFormat("pt-BR");
export const formatNumber = (value) => integer.format(value);
export const formatCoins = (value) => `${formatNumber(value)} ${value === 1 ? "moeda" : "moedas"}`;

export function economyProfile(type) {
  const details = BUILDING_TYPES[type];
  if (!details) return { price: 0, residents: 0, jobs: 0 };
  const residents = homes[type] ?? 0;
  const openings = details.workplaces ?? jobs[type] ?? 0;
  const [width, depth] = footprint(type);
  const lots = width * depth / LOT_SIZE ** 2;
  let price;
  switch (details.category) {
    case "residential": price = 90 + residents * 36 + lots * 50; break;
    case "apartments": price = 250 + residents * 43 + openings * 35 + lots * 70; break;
    case "commercial": price = 120 + openings * 35 + lots * 80; break;
    case "landmarks": price = 550 + lots * 260; break;
    case "lighting": price = type === "lampSolar" ? 155 : 90; break;
    case "paving": price = type === "pavingMosaic" ? 15 : 10; break;
    default: price = Math.max(24, Math.ceil(width * depth * 4) + 20);
  }
  return { price, residents, jobs: openings };
}

const profiles = Object.fromEntries(Object.keys(BUILDING_TYPES).map((type) => [type, economyProfile(type)]));

export function cityEconomy(houses) {
  let residents = 0;
  let openings = 0;
  for (const { type } of houses) {
    if (!Object.hasOwn(profiles, type)) continue;
    residents += profiles[type].residents;
    openings += profiles[type].jobs;
  }
  const employed = Math.min(openings, Math.floor(residents * 0.45));
  const commerceIncome = employed * 11;
  return { residents, jobs: openings, employed, commerceIncome, income: residents + commerceIncome };
}

export function startingBalance(residents) {
  return Math.min(MAX_BALANCE, Math.max(2500, residents * 7));
}

export function advanceEconomy(treasury, elapsed, income) {
  if (income <= 0) return false;
  const progress = treasury.progressMs + elapsed;
  const cycles = Math.floor(progress / ECONOMY_CYCLE_MS);
  treasury.progressMs = progress % ECONOMY_CYCLE_MS;
  if (cycles === 0 || treasury.coins >= MAX_BALANCE) return false;
  treasury.coins = Math.min(MAX_BALANCE, treasury.coins + cycles * income);
  return true;
}
