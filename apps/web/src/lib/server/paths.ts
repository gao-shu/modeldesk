import path from "node:path";
import fs from "node:fs";
import { envTruthy } from "./env";

const ARTIFACT_SUBDIRS = [
  "artifacts/images",
  "artifacts/videos",
  "artifacts/audio",
  "artifacts/music",
  "artifacts/text",
  "artifacts/thumbs",
] as const;

const DB_NAME = "modeldesk.db";
const APP_DATA_NAME = "ModelDesk";
const LOCATION_FILENAME = "data-location.json";

export type DataLocationConfig = {
  dataDir: string;
};

/** Desktop / packaged default: OS app-data dir (e.g. %LOCALAPPDATA%\ModelDesk). */
export function getDefaultDesktopDataDir(): string {
  if (process.platform === "win32") {
    const base =
      process.env.LOCALAPPDATA?.trim() ||
      path.join(process.env.USERPROFILE || "", "AppData", "Local");
    return path.join(base, APP_DATA_NAME);
  }
  if (process.platform === "darwin") {
    return path.join(
      process.env.HOME || "",
      "Library",
      "Application Support",
      APP_DATA_NAME,
    );
  }
  const xdg =
    process.env.XDG_DATA_HOME?.trim() ||
    path.join(process.env.HOME || "", ".local", "share");
  return path.join(xdg, APP_DATA_NAME);
}

function isDesktopMode(): boolean {
  return envTruthy(process.env.MODELDESK_DESKTOP);
}

function findRepoRoot(): string | null {
  const fromEnv = process.env.MODELDESK_REPO_ROOT?.trim();
  if (fromEnv) {
    const abs = path.isAbsolute(fromEnv)
      ? path.normalize(fromEnv)
      : path.resolve(process.cwd(), fromEnv);
    if (
      fs.existsSync(path.join(abs, "pnpm-workspace.yaml")) ||
      fs.existsSync(path.join(abs, "PLAN.md"))
    ) {
      return abs;
    }
  }

  let cur = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (
      fs.existsSync(path.join(cur, "pnpm-workspace.yaml")) ||
      fs.existsSync(path.join(cur, "PLAN.md"))
    ) {
      return cur;
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return null;
}

/** Dev default: monorepo `data/`. Outside a checkout → OS app-data (product default). */
export function getDefaultDevDataDir(): string {
  const root = findRepoRoot();
  if (root) return path.join(root, "data");
  return getDefaultDesktopDataDir();
}

export function getDefaultDataDir(): string {
  return isDesktopMode() ? getDefaultDesktopDataDir() : getDefaultDevDataDir();
}

/**
 * Fixed control dir for `data-location.json` (does not move with custom dataDir).
 * Desktop → OS app-data; web/dev → `{repo}/.modeldesk`.
 */
export function getControlDir(): string {
  if (isDesktopMode()) {
    return getDefaultDesktopDataDir();
  }
  const root = findRepoRoot();
  if (root) return path.join(root, ".modeldesk");
  return getDefaultDesktopDataDir();
}

export function getDataLocationPath(): string {
  return path.join(getControlDir(), LOCATION_FILENAME);
}

function normalizeAbsDir(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("数据目录不能为空");
  }
  const abs = path.isAbsolute(trimmed)
    ? path.normalize(trimmed)
    : path.resolve(process.cwd(), trimmed);
  // Strip trailing separators (except root)
  if (abs.length > 1 && (abs.endsWith("\\") || abs.endsWith("/"))) {
    return abs.replace(/[\\/]+$/, "");
  }
  return abs;
}

export function readConfiguredDataDir(): string | null {
  try {
    const filePath = getDataLocationPath();
    if (!fs.existsSync(filePath)) return null;
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as DataLocationConfig;
    if (typeof raw?.dataDir !== "string" || !raw.dataDir.trim()) return null;
    return normalizeAbsDir(raw.dataDir);
  } catch {
    return null;
  }
}

/** Persist user-chosen data dir. Pass null to clear (use default). */
export function writeConfiguredDataDir(dataDir: string | null): void {
  const controlDir = getControlDir();
  fs.mkdirSync(controlDir, { recursive: true });
  const filePath = getDataLocationPath();
  if (!dataDir) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return;
  }
  const abs = normalizeAbsDir(dataDir);
  const payload: DataLocationConfig = { dataDir: abs };
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

/**
 * Set by `resolveAgentDataDir` when following a live Desk (:3300).
 * Takes priority over data-location.json / env so MCP/CLI match the running UI.
 */
let agentDataDirOverride: string | null = null;

/** Original MODELDESK_DATA_DIR before we overwrite it for live follow. */
let savedEnvDataDir: string | null | undefined;

export type AgentDataDirSource = "live_desk" | "local";

export type AgentDataDirResult = {
  dataDir: string;
  source: AgentDataDirSource;
};

function followDeskEnabled(): boolean {
  const raw = process.env.MODELDESK_FOLLOW_DESK?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") {
    return false;
  }
  // Default on (unset or any other truthy / empty-except-0).
  return true;
}

function rememberOriginalEnvDataDir(): void {
  if (savedEnvDataDir !== undefined) return;
  const v = process.env.MODELDESK_DATA_DIR;
  savedEnvDataDir = v === undefined ? null : v;
}

function restoreOriginalEnvDataDir(): void {
  if (savedEnvDataDir === undefined) return;
  if (savedEnvDataDir === null) {
    delete process.env.MODELDESK_DATA_DIR;
  } else {
    process.env.MODELDESK_DATA_DIR = savedEnvDataDir;
  }
}

function applyAgentDataDir(dir: string): string {
  rememberOriginalEnvDataDir();
  const abs = normalizeAbsDir(dir);
  agentDataDirOverride = abs;
  process.env.MODELDESK_DATA_DIR = abs;
  return abs;
}

async function probeLiveDeskDataDir(
  baseUrl: string,
  timeoutMs: number,
): Promise<string | null> {
  const url = `${baseUrl.replace(/\/+$/, "")}/healthz`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: ac.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { ok?: boolean; dataDir?: unknown };
    if (!json?.ok || typeof json.dataDir !== "string" || !json.dataDir.trim()) {
      return null;
    }
    return normalizeAbsDir(json.dataDir);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Prefer the data dir of a running Desk/Gateway on loopback, else local getDataDir().
 * Call at MCP/CLI startup and again before tools if Desk may have started later.
 */
export async function resolveAgentDataDir(opts?: {
  /** Override probe URLs (default :3300 then :3310). */
  probeUrls?: string[];
  timeoutMs?: number;
}): Promise<AgentDataDirResult> {
  if (followDeskEnabled()) {
    const urls =
      opts?.probeUrls ??
      [
        process.env.MODELDESK_FOLLOW_DESK_URL?.trim() ||
          "http://127.0.0.1:3300",
        "http://127.0.0.1:3310",
      ].filter(Boolean);
    const timeoutMs = opts?.timeoutMs ?? 800;
    for (const base of urls) {
      const live = await probeLiveDeskDataDir(base, timeoutMs);
      if (live) {
        const dataDir = applyAgentDataDir(live);
        return { dataDir, source: "live_desk" };
      }
    }
  }

  // Desk unreachable: clear override and restore pre-follow env so local
  // data-location.json / original MODELDESK_DATA_DIR apply.
  agentDataDirOverride = null;
  restoreOriginalEnvDataDir();
  return { dataDir: getDataDir(), source: "local" };
}

/**
 * Re-probe live Desk and return whether dataDir changed (caller should closeDb).
 */
export async function refreshAgentDataDir(): Promise<
  AgentDataDirResult & { changed: boolean }
> {
  const before = agentDataDirOverride ?? getDataDir();
  const next = await resolveAgentDataDir();
  const changed =
    path.normalize(before).toLowerCase() !==
    path.normalize(next.dataDir).toLowerCase();
  return { ...next, changed };
}

/**
 * Resolve app data root (`modeldesk.db`, artifacts, `.encryption-secret`).
 * Priority: live Desk override → MODELDESK_DATA_DIR → data-location.json → default.
 */
export function getDataDir(): string {
  if (agentDataDirOverride) return agentDataDirOverride;

  const fromEnv = process.env.MODELDESK_DATA_DIR?.trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv)
      ? path.normalize(fromEnv)
      : path.resolve(process.cwd(), fromEnv);
  }

  const fromFile = readConfiguredDataDir();
  if (fromFile) return fromFile;

  return getDefaultDataDir();
}

export function getDbPath(): string {
  return path.join(getDataDir(), DB_NAME);
}

export function ensureDataDirs(): string {
  const dataDir = getDataDir();
  fs.mkdirSync(dataDir, { recursive: true });
  for (const sub of ARTIFACT_SUBDIRS) {
    fs.mkdirSync(path.join(dataDir, sub), { recursive: true });
  }
  return dataDir;
}

/** Absolute path from a relative uri stored in DB (posix-style under data/). */
export function resolveDataPath(relativeUri: string): string {
  const normalized = relativeUri.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalized.includes("..")) {
    throw new Error("Invalid artifact path");
  }
  return path.join(getDataDir(), ...normalized.split("/"));
}

export function toPosixRelative(absolutePath: string): string {
  const dataDir = getDataDir();
  const rel = path.relative(dataDir, absolutePath);
  return rel.split(path.sep).join("/");
}

export { normalizeAbsDir, LOCATION_FILENAME };
