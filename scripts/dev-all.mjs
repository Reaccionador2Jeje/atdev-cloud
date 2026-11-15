import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const manifest = process.env.ATDEV_DB_MANIFEST ?? "../atdev-db/Cargo.toml";
const bind = process.env.ATDEV_DB_BIND ?? "127.0.0.1:8788";
const healthUrl = `http://${bind}/health`;
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
let dbProcess;
let cloudProcess;
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  if (cloudProcess && !cloudProcess.killed) cloudProcess.kill();
  if (dbProcess && !dbProcess.killed) dbProcess.kill();
  process.exitCode = code;
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

async function waitForDatabase() {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (dbProcess.exitCode !== null) throw new Error("AtDev DB terminó antes de estar listo.");
    try {
      const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {}
    await delay(500);
  }
  throw new Error("AtDev DB no respondió en 30 segundos.");
}

try {
  console.log("[AtDev] Iniciando AtDev DB...");
  dbProcess = spawn("cargo", ["run", "--manifest-path", manifest, "--", "--server"], {
    stdio: "inherit",
    env: { ...process.env, ATDEV_DB_BIND: bind }
  });
  dbProcess.on("error", error => {
    console.error("[AtDev] No se pudo iniciar Rust/Cargo:", error.message);
    stop(1);
  });
  dbProcess.on("exit", code => {
    if (!stopping) {
      console.error(`[AtDev] AtDev DB terminó (código ${code}).`);
      stop(code || 1);
    }
  });

  await waitForDatabase();
  if (stopping) process.exit(0);

  console.log("[AtDev] AtDev DB está listo. Iniciando AtDev Cloud...");
  cloudProcess = spawn(npm, ["run", "dev"], { stdio: "inherit", env: process.env });
  cloudProcess.on("error", error => {
    console.error("[AtDev] No se pudo iniciar AtDev Cloud:", error.message);
    stop(1);
  });
  cloudProcess.on("exit", code => stop(code || 0));
} catch (error) {
  console.error("[AtDev]", error.message);
  stop(1);
}
