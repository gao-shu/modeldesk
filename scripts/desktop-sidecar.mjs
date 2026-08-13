/**
 * Desktop sidecar: start Web engine only (dev or packaged runtime).
 *
 * Env:
 *   MODELDESK_WEB_PORT=3300
 *   MODELDESK_DATA_DIR=...
 *   MODELDESK_NODE=path/to/node.exe
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ensureDesktopDataDir,
  resolveDataDir,
} from "./desktop-data-dir.mjs";
import { withDesktopEnv } from "./env.mjs";
import { formatPortInUseMessage } from "./port-hint.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WEB_PORT = Number(process.env.MODELDESK_WEB_PORT || 3300);
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
        reject(
          new Error(
            `Timeout waiting for ${url}\n${formatPortInUseMessage({
              service: "Web",
              port: WEB_PORT,
              host: HOST,
              envVar: "MODELDESK_WEB_PORT",
            })}`,
          ),
        );
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

async function startDev(repoRoot, dataDir) {
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  log("dev mode — web only");

  spawnChild(pnpm, ["--filter", "@modeldesk/web", "dev"], {
    cwd: repoRoot,
    env: withDesktopEnv(
      {
        ...process.env,
        PORT: String(WEB_PORT),
        HOSTNAME: HOST,
      },
      { dataDir },
    ),
  });

  await waitForHttp(`http://${HOST}:${WEB_PORT}/`);
  log(`web ready on http://${HOST}:${WEB_PORT}`);
}

async function startProd(runtimeRoot, dataDir) {
  const bundledNode = path.join(runtimeRoot, "node", "node.exe");
  const nodeBin =
    process.env.MODELDESK_NODE?.trim() ||
    (fs.existsSync(bundledNode) ? bundledNode : process.execPath);
  log("prod mode — runtime", runtimeRoot, "node", nodeBin);

  const webServerCandidates = [
    path.join(runtimeRoot, "web", "apps", "web", "server.js"),
    path.join(runtimeRoot, "web", "server.js"),
  ];
  const webServer = webServerCandidates.find((p) => fs.existsSync(p));
  if (!webServer) {
    throw new Error(`Next server.js not found under ${runtimeRoot}/web`);
  }
  const standaloneRoot = webServer.includes(
    `${path.sep}apps${path.sep}web${path.sep}server.js`,
  )
    ? path.resolve(path.dirname(webServer), "../..")
    : path.dirname(webServer);

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
        NODE_PATH: nodePathParts.join(path.delimiter),
      },
      { dataDir },
    ),
  });

  await waitForHttp(`http://${HOST}:${WEB_PORT}/`);
  log(`web ready on http://${HOST}:${WEB_PORT}`);
}

async function main() {
  const dataDir = ensureDesktopDataDir(resolveDataDir());
  process.env.MODELDESK_DATA_DIR = dataDir;
  log("data dir:", dataDir);

  const runtime = resolveRuntimeRoot();
  if (runtime && fs.existsSync(path.join(runtime, "web"))) {
    await startProd(runtime, dataDir);
  } else {
    const repoRoot = findRepoRoot();
    log("repo:", repoRoot);
    await startDev(repoRoot, dataDir);
  }

  await new Promise(() => {});
}

main().catch((err) => {
  console.error("[sidecar] fatal:", err);
  process.exit(1);
});
