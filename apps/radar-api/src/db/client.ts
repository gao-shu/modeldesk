import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** apps/radar-api */
export const serverRoot = path.resolve(__dirname, "../..");
/** monorepo root, not apps/ */
export const repoRoot = path.resolve(serverRoot, "../..");

const RADAR_DB = "modeldesk-radar.sqlite";

function envTruthy(raw: string | undefined): boolean {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function resolveDbPath(): string {
  const explicit = process.env.MODELDESK_RADAR_DB?.trim();
  if (explicit) return explicit;

  const dataRoot = process.env.MODELDESK_DATA_DIR?.trim();
  if (dataRoot) {
    const abs = path.isAbsolute(dataRoot)
      ? dataRoot
      : path.resolve(process.cwd(), dataRoot);
    const dir = path.join(abs, "radar");
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, RADAR_DB);
  }

  if (envTruthy(process.env.MODELDESK_DESKTOP)) {
    const base =
      process.platform === "win32"
        ? path.join(
            process.env.LOCALAPPDATA ||
              path.join(process.env.USERPROFILE || "", "AppData", "Local"),
            "ModelDesk",
            "radar",
          )
        : path.join(
            process.env.HOME || "",
            process.platform === "darwin"
              ? "Library/Application Support/ModelDesk/radar"
              : ".local/share/ModelDesk/radar",
          );
    fs.mkdirSync(base, { recursive: true });
    return path.join(base, RADAR_DB);
  }

  const dir = path.join(serverRoot, "data");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, RADAR_DB);
}

export function createDb(dbPath = resolveDbPath()) {
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(sqlite);
  return { db, sqlite, dbPath };
}

function migrate(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      website TEXT NOT NULL,
      logo_url TEXT,
      summary TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      rank_weight INTEGER NOT NULL DEFAULT 50,
      authenticity_status TEXT NOT NULL,
      price_level_json TEXT NOT NULL,
      payments_json TEXT NOT NULL,
      min_topup_cny REAL NOT NULL,
      gift_description TEXT NOT NULL DEFAULT '',
      invoice_support TEXT NOT NULL,
      invoice_note TEXT NOT NULL DEFAULT '',
      stability_score TEXT NOT NULL,
      image_model_support INTEGER NOT NULL,
      channel_type TEXT NOT NULL DEFAULT 'unknown',
      channel_note TEXT NOT NULL DEFAULT '',
      community_url TEXT,
      affiliate_disclosure TEXT,
      last_verified_at TEXT NOT NULL,
      last_price_updated_at TEXT NOT NULL,
      listed_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS promo_codes (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      code TEXT NOT NULL,
      label TEXT NOT NULL,
      is_exclusive INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      expires_at TEXT
    );

    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      family TEXT NOT NULL,
      category TEXT NOT NULL,
      is_featured INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS model_prices (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      input_price_usd REAL,
      output_price_usd REAL,
      image_price_usd REAL,
      price_unit TEXT NOT NULL,
      currency_display TEXT NOT NULL,
      channel_note TEXT NOT NULL DEFAULT '',
      is_available INTEGER NOT NULL DEFAULT 1,
      last_verified_at TEXT
    );

    CREATE TABLE IF NOT EXISTS guides (
      slug TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      content_md TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'published',
      published_at TEXT
    );

    CREATE TABLE IF NOT EXISTS verification_records (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      model_id TEXT,
      result TEXT NOT NULL,
      method TEXT NOT NULL,
      summary TEXT NOT NULL,
      verified_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta_kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS probe_reports (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_probe_reports_expires_at
      ON probe_reports (expires_at);
  `);
}

export type AppDb = ReturnType<typeof createDb>["db"];
