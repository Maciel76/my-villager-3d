import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createCityPlan, cityPlanSummary } from "../src/city-plan.js";
import { isVillageWorld } from "../src/village-data.js";
import { readSave } from "../src/placement.js";
import { readRoads } from "../src/road-layout.js";
import { createGardenCityPlan, gardenCitySummary } from "../src/garden-city-plan.js";

const garden = process.argv.includes("--garden");
const world = garden ? createGardenCityPlan() : createCityPlan();
if (!isVillageWorld(world) || readSave(world).length !== world.houses.length ||
    readRoads(world.roads, world.houses, 0).size !== world.roads.length)
  throw new Error("O plano não passou na validação do jogo.");

console.log(JSON.stringify(garden ? gardenCitySummary(world) : cityPlanSummary(world), null, 2));
if (!process.argv.includes("--apply")) {
  console.log(`Prévia validada. Use node scripts/build-city.js ${garden ? "--garden " : ""}--apply para salvar, com backup da vila anterior.`);
} else {
  const base = process.argv.find((arg) => /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(arg)) ?? "http://127.0.0.1:5174";
  const url = `${base}/api/village`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Não foi possível ler a vila: ${response.status}`);
  const saved = await response.json();
  const directory = resolve("backups");
  await mkdir(directory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = resolve(directory, `village-before-city-${stamp}.json`);
  await writeFile(backup, JSON.stringify(saved, null, 2), { flag: "wx" });
  const result = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ world, hour: "7.5", revision: saved.revision, writeId: randomUUID() }),
  });
  if (!result.ok) throw new Error(`Cidade não salva: ${result.status}. Backup: ${backup}`);
  const persisted = await (await fetch(url)).json();
  if (JSON.stringify(persisted.world) !== JSON.stringify(world))
    throw new Error("A leitura do banco não corresponde ao plano salvo.");
  await writeFile(resolve(directory, "city-plan.json"), JSON.stringify(persisted, null, 2));
  console.log(`Cidade salva na revisão ${persisted.revision}. Backup: ${backup}`);
}
