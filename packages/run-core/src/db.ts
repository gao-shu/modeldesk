import Database from "better-sqlite3";
import { ensureDataDirs, getDbPath } from "./paths";
import { SCHEMA_SQL } from "./schema";

/** Bump when SCHEMA_SQL adds tables/columns so existing connections re-migrate. */
const SCHEMA_VERSION = 3;

declare global {
  // eslint-disable-next-line no-var
  var __modeldeskDb: Database.Database | undefined;
  // eslint-disable-next-line no-var
  var __modeldeskSchemaVersion: number | undefined;
}

export function getDb(): Database.Database {
  if (!globalThis.__modeldeskDb) {
    ensureDataDirs();
    const db = new Database(getDbPath());
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    globalThis.__modeldeskDb = db;
    globalThis.__modeldeskSchemaVersion = undefined;
  }

  if (globalThis.__modeldeskSchemaVersion !== SCHEMA_VERSION) {
    globalThis.__modeldeskDb.exec(SCHEMA_SQL);
    globalThis.__modeldeskSchemaVersion = SCHEMA_VERSION;
  }

  return globalThis.__modeldeskDb;
}

/** Close the shared SQLite connection (e.g. before migrating data dir). */
export function closeDb(): void {
  if (globalThis.__modeldeskDb) {
    try {
      globalThis.__modeldeskDb.close();
    } catch {
      // ignore double-close
    }
    globalThis.__modeldeskDb = undefined;
    globalThis.__modeldeskSchemaVersion = undefined;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}
