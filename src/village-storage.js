import { isVillageHour, isVillageWorld } from "./village-data.js";

const API = "/api/village";
const LEGACY_WORLD = "vila-verde-world-v1";
const LEGACY_HOUR = "vila-verde-lighting-hour";

async function request(method, data) {
  const options = {
    method,
    signal: AbortSignal.timeout(7000),
    cache: "no-store",
  };
  if (data) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(data);
  }
  const response = await fetch(API, options);
  if (!response.ok) {
    const error = new Error(`Falha no salvamento (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export async function loadVillage() {
  let saved = await request("GET");
  let legacyWorld;
  let legacyHour;
  try {
    legacyHour = localStorage.getItem(LEGACY_HOUR);
    legacyWorld = JSON.parse(localStorage.getItem(LEGACY_WORLD));
  } catch {
    // Leave unreadable or inaccessible legacy data untouched.
  }

  const migration = {};
  if (!saved.world && isVillageWorld(legacyWorld))
    migration.world = legacyWorld;
  if (!saved.hour && isVillageHour(legacyHour)) migration.hour = legacyHour;
  if (migration.world || migration.hour)
    saved = await request("POST", migration);

  try {
    if (
      legacyWorld &&
      JSON.stringify(legacyWorld) === JSON.stringify(saved.world)
    )
      localStorage.removeItem(LEGACY_WORLD);
    if (legacyHour && legacyHour === saved.hour)
      localStorage.removeItem(LEGACY_HOUR);
  } catch {
    // The MongoDB copy is already confirmed.
  }
  return saved;
}

export function createVillageStore(revision, showState) {
  let pending = {};
  let batch = null;
  let saving = false;
  let retry = null;
  let blocked = false;

  async function flush() {
    if (saving || retry || blocked) return;
    if (!batch) {
      if (!pending.world && !pending.hour) return;
      batch = pending;
      pending = {};
      if (batch.world)
        Object.assign(batch, { revision, writeId: crypto.randomUUID() });
    }
    saving = true;
    showState("Salvando…");
    try {
      const result = await request("PATCH", batch);
      revision = result.revision ?? revision;
      batch = null;
      showState("✓ Salvo no MongoDB");
    } catch (error) {
      if (error.status === 409) {
        blocked = true;
        showState(
          "A vila mudou em outra aba. Recarregue para continuar salvando.",
          true,
        );
      } else if (error.status && error.status < 500) {
        blocked = true;
        showState(
          "O banco recusou o salvamento. Suas mudanças ainda não foram salvas.",
          true,
        );
      } else {
        showState("MongoDB indisponível. Tentando salvar de novo…", true);
        retry = setTimeout(() => {
          retry = null;
          void flush();
        }, 2500);
      }
    } finally {
      saving = false;
    }
    if (!batch) void flush();
  }

  window.addEventListener("beforeunload", (event) => {
    if (!batch && !pending.world && !pending.hour) return;
    event.preventDefault();
    event.returnValue = true;
  });

  return (changes) => {
    Object.assign(pending, changes);
    void flush();
  };
}
