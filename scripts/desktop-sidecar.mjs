/**
 * Desktop engine: start radar-api then Next (dev or standalone).
 *
 * Env:
 *   MODELDESK_DESKTOP=1             (set automatically)
 *   MODELDESK_DATA_DIR              optional override
 *   MODELDESK_WEB_PORT=3300
 *   MODELDESK_RADAR_PORT=9800
 *   MODELDESK_RUNTIME               packaged runtime root (prod)
 *   MODELDESK_REPO_ROOT             monorepo root (dev; default: cwd walk)
 *
 * Usage (dev):  node scripts/desktop-sidecar.mjs
 * Usage (prod): node sidecar.mjs   (from runtime/)
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ensureDesktopDataDir,
  resolveDataDir,
  resolveRadarDbPath,
} from "./desktop-data-dir.mjs";
import { withDesktopEnv } from "./env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WEB_PORT = Number(process.env.MODELDESK_WEB_PORT || 3300);
const RADAR_PORT = Number(process.env.MODELDESK_RADAR_PORT || 9800);
const HOST = "127.0.0.1";

process.env.MODELDESK_DESKTOP = "1";
process.env.HOST = HOST;

const children = [];
let shuttingDown = false;

function log(...args) {
  console.log("[sidecar]", ...args);
}

function findRepoRoot() {
  const fromEnv = process.env.MODELDESK_REPO_ROOT?.trim();
  if (fromEnv) {
    return path.resolve(fromEnv);
  }
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // scripts/ lives under repo
  const fromScript = path.resolve(__dirname, "..");
  if (fs.existsSync(path.join(fromScript, "pnpm-workspace.yaml"))) {
    return fromScript;
  }
  return process.cwd();
}

/** Strip Windows `\\?\` / `\\?\UNC\` prefixes that break some Node path ops. */
function stripVerbatim(p) {
  if (!p || process.platform !== "win32") return p;
  if (p.startsWith("\\\\?\\UNC\\")) return `\\\\${p.slice("\\\\?\\UNC\\".length)}`;
  if (p.startsWith("\\\\?\\")) return p.slice("\\\\?\\".length);
  return p;
}

function resolveRuntimeRoot() {
  const fromEnv = stripVerbatim(process.env.MODELDESK_RUNTIME?.trim() || "");
  if (fromEnv) {
    return path.resolve(fromEnv);
  }
  // Packaged layout: sidecar.mjs next to web/ and radar/
  const beside = path.resolve(stripVerbatim(__dirname));
  if (
    fs.existsSync(path.join(beside, "web", "apps", "web", "server.js")) ||
    fs.existsSync(path.join(beside, "web", "server.js"))
  ) {
    return beside;
  }
  return null;
}

function waitForHttp(url, { timeoutMs = 120_000, intervalMs = 400 } = {}) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (shuttingDown) {
        reject(new Error("shutdown"));
        return;
      }
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve();
          return;
        }
        retry();
      });
      req.on("error", retry);
      req.setTimeout(2000, () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`Timeout waiting for ${url}`));
        return;
      }
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

function spawnChild(command, args, options) {
  const child = spawn(command, args, {
    stdio: "inherit",
    windowsHide: true,
    ...options,
  });
  children.push(child);
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    log(`${command} exited`, { code, signal });
    shutdown(typeof code === "number" ? code : 1);
  });
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  log("shutting down…");
  for (const child of children) {
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
  setTimeout(() => process.exit(code), 500).unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function startDev(repoRoot, dataDir, radarDb) {
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  log("dev mode — radar then web");
  spawnChild(
    pnpm,
    ["--filter", "@modeldesk/radar-api", "start"],
    {
      cwd: repoRoot,
      env: withDesktopEnv(
        {
          ...process.env,
          PORT: String(RADAR_PORT),
          HOST,
          SEED_ON_EMPTY: process.env.SEED_ON_EMPTY || "1",
        },
        { dataDir, radarDb },
      ),
    },
  );

  await waitForHttp(`http://${HOST}:${RADAR_PORT}/health`);
  log(`radar ready on :${RADAR_PORT}`);

  spawnChild(pnpm, ["--filter", "@modeldesk/web", "dev"], {
    cwd: repoRoot,
    env: withDesktopEnv(
      {
        ...process.env,
        PORT: String(WEB_PORT),
        HOSTNAME: HOST,
        RADAR_API_BASE: `http://${HOST}:${RADAR_PORT}`,
      },
      { dataDir },
    ),
  });

  await waitForHttp(`http://${HOST}:${WEB_PORT}/`);
  log(`web ready on http://${HOST}:${WEB_PORT}`);
}

async function startProd(runtimeRoot, dataDir, radarDb) {
  const bundledNode = path.join(runtimeRoot, "node", "node.exe");
  const nodeBin =
    process.env.MODELDESK_NODE?.trim() ||
    (fs.existsSync(bundledNode) ? bundledNode : process.execPath);
  log("prod mode — runtime", runtimeRoot, "node", nodeBin);

  const radarEntry = [
    path.join(runtimeRoot, "radar", "dist", "index.cjs"),
    path.join(runtimeRoot, "radar", "dist", "index.js"),
    path.join(runtimeRoot, "radar", "index.js"),
  ].find((p) => fs.existsSync(p));
  if (!radarEntry) {
    throw new Error(`radar entry not found under ${runtimeRoot}/radar`);
  }

  const webServerCandidates = [
    path.join(runtimeRoot, "web", "apps", "web", "server.js"),
    path.join(runtimeRoot, "web", "server.js"),
  ];
  const webServer = webServerCandidates.find((p) => fs.existsSync(p));
  if (!webServer) {
    throw new Error(`Next server.js not found under ${runtimeRoot}/web`);
  }
  // standalone: server.js is at apps/web/server.js; cwd should be standalone root
  const standaloneRoot = webServer.includes(
    `${path.sep}apps${path.sep}web${path.sep}server.js`,
  )
    ? path.resolve(path.dirname(webServer), "../..")
    : path.dirname(webServer);

  spawnChild(nodeBin, [radarEntry], {
    cwd: path.join(runtimeRoot, "radar"),
    env: withDesktopEnv(
      {
        ...process.env,
        PORT: String(RADAR_PORT),
        HOST,
        NODE_ENV: "production",
      },
      { dataDir, radarDb },
    ),
  });

  await waitForHttp(`http://${HOST}:${RADAR_PORT}/health`);
  log(`radar ready on :${RADAR_PORT}`);

  // pnpm standalone keeps many deps under node_modules/.pnpm/node_modules;
  // Node does not resolve that path unless we expose it (or hoist at pack time).
  const pnpmNested = path.join(
    standaloneRoot,
    "node_modules",
    ".pnpm",
    "node_modules",
  );
  const nodePathParts = [
    pnpmNested,
    path.join(standaloneRoot, "node_modules"),
    process.env.NODE_PATH || "",
  ].filter(Boolean);

  spawnChild(nodeBin, ["apps/web/server.js"], {
    cwd: standaloneRoot,
    env: withDesktopEnv(
      {
        ...process.env,
        PORT: String(WEB_PORT),
        HOSTNAME: HOST,
        NODE_ENV: "production",
        RADAR_API_BASE: `http://${HOST}:${RADAR_PORT}`,
        NODE_PATH: nodePathParts.join(path.delimiter),
      },
      { dataDir },
    ),
  });

  await waitForHttp(`http://${HOST}:${WEB_PORT}/`);
  log(`web ready on http://${HOST}:${WEB_PORT}`);
}

async function maybeSeedRadar(repoRoot, dataDir, radarDb) {
  if (process.env.SEED_ON_EMPTY === "0") return;
  if (fs.existsSync(radarDb)) return;
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  log("seeding empty radar DB…");
  await new Promise((resolve, reject) => {
    const child = spawn(
      pnpm,
      ["--filter", "@modeldesk/radar-api", "seed"],
      {
        cwd: repoRoot,
        stdio: "inherit",
        env: withDesktopEnv(process.env, { dataDir, radarDb }),
        windowsHide: true,
      },
    );
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`seed exit ${code}`)),
    );
  }).catch((err) => {
    log("seed skipped/failed:", err.message);
  });
}

async function main() {
  const dataDir = ensureDesktopDataDir(resolveDataDir());
  const radarDb = resolveRadarDbPath(dataDir);
  process.env.MODELDESK_DATA_DIR = dataDir;
  process.env.MODELDESK_RADAR_DB = radarDb;
  log("data dir:", dataDir);
  log("radar db:", radarDb);

  const runtime = resolveRuntimeRoot();
  if (runtime && fs.existsSync(path.join(runtime, "web"))) {
    await startProd(runtime, dataDir, radarDb);
  } else {
    const repoRoot = findRepoRoot();
    log("repo:", repoRoot);
    await maybeSeedRadar(repoRoot, dataDir, radarDb);
    await startDev(repoRoot, dataDir, radarDb);
  }

  // Keep process alive
  await new Promise(() => {});
}

main().catch((err) => {
  console.error("[sidecar] fatal:", err);
  process.exit(1);
});
