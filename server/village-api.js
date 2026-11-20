import { MongoClient } from "mongodb";
import { isVillageHour, isVillageWorld } from "../src/village-data.js";

const PATH = "/api/village";
const ID = { _id: "local" };
const MAX_BODY = 1024 * 1024;
const returnedFields = {
  projection: { _id: 0, world: 1, hour: 1, revision: 1 },
};

const state = (doc) => ({
  world: doc?.world ?? null,
  hour: doc?.hour ?? null,
  revision: doc?.revision ?? 0,
});
const convergenceCount = (world) => world?.houses.filter(house => house.type === "convergencia").length ?? 0;

function send(response, status, data) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(data));
}

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function readChanges(request) {
  if (request.headers["content-type"]?.split(";")[0] !== "application/json")
    throw new RequestError(415, "Envie os dados em JSON.");
  const parts = [];
  let size = 0;
  for await (const part of request.iterator({ destroyOnReturn: false })) {
    size += part.length;
    if (size > MAX_BODY) {
      request.resume();
      throw new RequestError(413, "O salvamento é grande demais.");
    }
    parts.push(part);
  }
  let data;
  try {
    data = JSON.parse(Buffer.concat(parts).toString("utf8"));
  } catch {
    throw new RequestError(400, "JSON inválido.");
  }
  if (
    !data ||
    (!Object.hasOwn(data, "world") && !Object.hasOwn(data, "hour")) ||
    (Object.hasOwn(data, "world") && !isVillageWorld(data.world)) ||
    (Object.hasOwn(data, "hour") && !isVillageHour(data.hour))
  )
    throw new RequestError(400, "Salvamento inválido.");
  return data;
}

async function importLegacy(collection, { world, hour }) {
  const fields = {};
  if (world) {
    fields.world = { $ifNull: ["$world", { $literal: world }] };
    fields.revision = { $ifNull: ["$revision", 1] };
  }
  if (hour) fields.hour = { $ifNull: ["$hour", { $literal: hour }] };
  return collection.findOneAndUpdate(ID, [{ $set: fields }], {
    ...returnedFields,
    upsert: true,
    returnDocument: "after",
  });
}

async function saveChanges(collection, { world, hour, revision, writeId }) {
  const fields = hour ? { hour } : {};
  if (!world) {
    await collection.updateOne(ID, { $set: fields }, { upsert: true });
    return {};
  }
  if (
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    typeof writeId !== "string" ||
    !/^[a-f0-9-]{36}$/i.test(writeId)
  )
    throw new RequestError(400, "Revisão inválida.");

  const count = convergenceCount(world);
  if (count > 1) {
    // Older saves may already have duplicates. Permit edits that keep or reduce their count.
    const existing = await collection.findOne(ID, returnedFields);
    if (count > convergenceCount(existing?.world)) throw new RequestError(400, "Limite de uma Convergência por vila.");
  }

  const base = revision === 0 ? { $exists: false } : revision;
  const updated = await collection
    .findOneAndUpdate(
      { ...ID, revision: base },
      { $set: { ...fields, world, writeId }, $inc: { revision: 1 } },
      { ...returnedFields, upsert: revision === 0, returnDocument: "after" },
    )
    .catch((error) => {
      // A concurrent first save can insert the same document before this upsert.
      if (error.code !== 11000) throw error;
      return null;
    });
  if (updated) return { revision: updated.revision };
  const current = await collection.findOne(ID, {
    projection: { revision: 1, writeId: 1 },
  });
  if (current?.writeId === writeId) return { revision: current.revision };
  throw new RequestError(409, "A vila foi alterada em outra aba.");
}

export function villageApi({ uri, database }) {
  function attach(server) {
    const client = new MongoClient(uri, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 2500,
      connectTimeoutMS: 5000,
    });
    const collection = client.db(database).collection("villages");
    server.httpServer?.once("close", () => {
      void client.close();
    });

    server.middlewares.use((request, response, next) => {
      if (request.url?.split("?")[0] !== PATH) return next();
      const { host, origin } = request.headers;
      if (
        !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host ?? "") ||
        (origin && origin !== `http://${host}` && origin !== `https://${host}`)
      ) {
        send(response, 403, {
          error: "Acesso disponível apenas neste computador.",
        });
        return;
      }
      handle(request, response).catch((error) => {
        if (error instanceof RequestError) {
          send(response, error.status, { error: error.message });
        } else {
          console.error(
            "Falha no MongoDB da Vila Verde:",
            error.name,
            error.code ?? "",
          );
          send(response, 503, { error: "MongoDB local indisponível." });
        }
      });
    });

    async function handle(request, response) {
      if (request.method === "GET") {
        send(
          response,
          200,
          state(await collection.findOne(ID, returnedFields)),
        );
      } else if (request.method === "POST") {
        send(
          response,
          200,
          state(await importLegacy(collection, await readChanges(request))),
        );
      } else if (request.method === "PATCH") {
        send(
          response,
          200,
          await saveChanges(collection, await readChanges(request)),
        );
      } else {
        response.setHeader("Allow", "GET, POST, PATCH");
        send(response, 405, { error: "Método não permitido." });
      }
    }
  }

  return {
    name: "vila-verde-mongodb",
    configureServer: attach,
    configurePreviewServer: attach,
  };
}
