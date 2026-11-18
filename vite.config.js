import { defineConfig, loadEnv } from "vite";
import { villageApi } from "./server/village-api.js";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "MONGODB_");
  return {
    server: { host: "127.0.0.1" },
    preview: { host: "127.0.0.1" },
    plugins: [
      villageApi({
        uri: env.MONGODB_URI || "mongodb://127.0.0.1:27017",
        database: env.MONGODB_DATABASE || "vila_verde",
      }),
    ],
  };
});
