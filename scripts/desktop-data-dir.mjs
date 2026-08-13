/**
 * Shared helpers for desktop sidecar / packaging (plain Node, no TS).
 * Keep resolution rules in sync with apps/web/src/lib/server/paths.ts.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const APP_DATA_NAME = "ModelDesk";
const LOCATION_FILENAME = "data-location.json";

export function getDefaultDesktopDataDir() {
  if (process.platform === "win32") {
    const base =
      process.env.LOCALAPPDATA?.trim() ||
      path.join(process.env.USERPROFILE || os.homedir(), "AppData", "Local");
    return path.join(base, APP_DATA_NAME);
  }
  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      APP_DATA_NAME,
    );
  }
  const xdg =
    process.env.XDG_DATA_HOME?.trim() ||
    path.join(os.homedir(), ".local", "share");
  return path.join(xdg, APP_DATA_NAME);
}

export function getControlDir() {
  return getDefaultDesktopDataDir();
}

export function getDataLocationPath() {
  return path.join(getControlDir(), LOCATION_FILENAME);
}

function normalizeAbsDir(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;
  const abs = path.isAbsolute(trimmed)
    ? path.normalize(trimmed)
    : path.resolve(process.cwd(), trimmed);
  if (abs.length > 1 && (abs.endsWith("\\") || abs.endsWith("/"))) {
    return abs.replace(/[\\/]+$/, "");
  }
  return abs;
}

export function readConfiguredDataDir() {
  try {
    const filePath = getDataLocationPath();
    if (!fs.existsSync(filePath)) return null;
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (typeof raw?.dataDir !== "string" || !raw.dataDir.trim()) return null;
    return normalizeAbsDir(raw.dataDir);
  } catch {
    return null;
  }
}

/**
 * Priority: data-location.json → MODELDESK_DATA_DIR → OS app-data default.
 */
export function resolveDataDir() {
  const fromFile = readConfiguredDataDir();
  if (fromFile) return fromFile;

  const fromEnv = process.env.MODELDESK_DATA_DIR?.trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv)
      ? path.normalize(fromEnv)
      : path.resolve(process.cwd(), fromEnv);
  }
  return getDefaultDesktopDataDir();
}

export function ensureDesktopDataDir(dataDir = resolveDataDir()) {
  fs.mkdirSync(dataDir, { recursive: true });
  for (const sub of [
    "artifacts/images",
    "artifacts/videos",
    "artifacts/audio",
    "artifacts/music",
    "artifacts/text",
  ]) {
    fs.mkdirSync(path.join(dataDir, sub), { recursive: true });
  }

  const secretPath = path.join(dataDir, ".encryption-secret");
  if (!fs.existsSync(secretPath)) {
    const secret = crypto.randomBytes(32).toString("base64url");
    fs.writeFileSync(secretPath, `${secret}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    console.log(`[desktop] created encryption secret at ${secretPath}`);
  }

  return dataDir;
}
