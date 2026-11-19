import { execFileSync, spawn } from "node:child_process";
import { release } from "node:os";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";
import { loadEnv } from "vite";

const args = process.argv.slice(2);
const modeIndex = args.indexOf("--mode");
const mode = (modeIndex >= 0 ? args[modeIndex + 1] : args.find(arg => arg.startsWith("--mode="))?.slice(7)) ||
  (args.includes("preview") ? "production" : "development");
const env = loadEnv(mode, process.cwd(), "");
const uri = env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const inWsl = process.platform === "linux" && /microsoft/i.test(release());
const loopbackMongo = /^mongodb:\/\/(?:[^@/]+@)?(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:[/?]|$)/i.test(uri);
const vitePath = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
let executable = process.execPath;
let cliPath = vitePath;
let childEnv = process.env;
let executableArgs = [];

async function localMongoAvailable() {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 1200, connectTimeoutMS: 1200 });
  try {
    await client.db(env.MONGODB_DATABASE || "vila_verde").command({ ping: 1 });
    return true;
  } catch (error) {
    if (error.name !== "MongoServerSelectionError") throw error;
    return false;
  } finally {
    await client.close();
  }
}

try {
  if (inWsl && loopbackMongo && !(await localMongoAvailable())) {
    const convert = (flag, value) => execFileSync("wslpath", [flag, value], { encoding: "utf8" }).trim();
    const resolver = convert("-w", fileURLToPath(new URL("./windows-node.ps1", import.meta.url)));
    const resolverArgs = ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", resolver];
    if (env.VILLAGE_WINDOWS_NODE) resolverArgs.push("-PreferredPath", env.VILLAGE_WINDOWS_NODE);
    // Some WSL sessions have no binfmt registration for .exe files. Use the
    // same interop handler explicitly instead of changing system settings.
    const registered = existsSync("/proc/sys/fs/binfmt_misc/WSLInterop") &&
      readFileSync("/proc/sys/fs/binfmt_misc/WSLInterop", "utf8").startsWith("enabled");
    const powershell = (process.env.PATH || "").split(":").map(directory => join(directory, "powershell.exe")).find(existsSync);
    if (!powershell) throw new Error("PowerShell do Windows não foi encontrado no PATH do WSL.");
    const windowsNode = execFileSync(registered ? powershell : "/init", registered ? resolverArgs : [powershell, powershell, ...resolverArgs],
      { encoding: "utf8", timeout: 15000 }).trim();
    executable = convert("-u", windowsNode);
    if (!registered) { executableArgs = [executable, windowsNode]; executable = "/init"; }
    cliPath = convert("-w", vitePath);
    const shared = new Set((process.env.WSLENV || "").split(":").filter(Boolean));
    shared.add("MONGODB_URI");
    shared.add("MONGODB_DATABASE");
    childEnv = { ...process.env, WSLENV: [...shared].join(":"),
      MONGODB_URI: uri, MONGODB_DATABASE: env.MONGODB_DATABASE || "vila_verde" };
    console.log("MongoDB não respondeu no WSL. Iniciando o servidor no Windows para acessar o banco local existente.");
  }

  const child = spawn(executable, [...executableArgs, cliPath, ...args], { stdio: "inherit", env: childEnv });
  child.on("error", error => { console.error(`Não foi possível iniciar o servidor: ${error.message}`); process.exitCode = 1; });
  child.on("exit", code => { process.exitCode = code ?? 1; });
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => child.kill(signal));
} catch (error) {
  console.error(`Não foi possível preparar o servidor: ${error.message}`);
  console.error("Inicie o MongoDB no mesmo ambiente do servidor. Para usar o MongoDB do Windows, execute npm run dev no PowerShell com Node.js LTS configurado.");
  process.exitCode = 1;
}
