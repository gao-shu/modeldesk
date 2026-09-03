import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDb, nowIso } from "./db";
import {
  ensureDataDirs,
  resolveDataPath,
  toPosixRelative,
} from "./paths";

export type ArtifactType = "text" | "image" | "video" | "audio" | "music";

export type ArtifactRow = {
  id: string;
  job_id: string | null;
  type: string;
  uri: string;
  mime: string | null;
  meta_json: string;
  created_at: string;
};

export type ArtifactPublic = {
  id: string;
  jobId: string | null;
  type: string;
  uri: string;
  mime: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
  url: string;
};

function folderForType(type: ArtifactType | string): string {
  switch (type) {
    case "image":
      return "artifacts/images";
    case "video":
      return "artifacts/videos";
    case "audio":
      return "artifacts/audio";
    case "music":
      return "artifacts/music";
    default:
      return "artifacts/text";
  }
}

function parseMeta(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function toPublicArtifact(row: ArtifactRow): ArtifactPublic {
  return {
    id: row.id,
    jobId: row.job_id,
    type: row.type,
    uri: row.uri,
    mime: row.mime,
    meta: parseMeta(row.meta_json),
    createdAt: row.created_at,
    url: `/api/artifacts/${row.id}`,
  };
}

export function listArtifacts(
  type?: string,
  options?: { limit?: number },
): ArtifactPublic[] {
  const db = getDb();
  const limit =
    typeof options?.limit === "number" && options.limit > 0
      ? Math.min(Math.floor(options.limit), 500)
      : null;
  const rows = type
    ? limit != null
      ? (db
          .prepare(
            `SELECT * FROM artifacts WHERE type = ? ORDER BY created_at DESC LIMIT ?`,
          )
          .all(type, limit) as ArtifactRow[])
      : (db
          .prepare(
            `SELECT * FROM artifacts WHERE type = ? ORDER BY created_at DESC`,
          )
          .all(type) as ArtifactRow[])
    : limit != null
      ? (db
          .prepare(
            `SELECT * FROM artifacts ORDER BY created_at DESC LIMIT ?`,
          )
          .all(limit) as ArtifactRow[])
      : (db
          .prepare(`SELECT * FROM artifacts ORDER BY created_at DESC`)
          .all() as ArtifactRow[]);
  return rows.map(toPublicArtifact);
}

export function getArtifact(id: string): ArtifactRow | null {
  const row = getDb()
    .prepare(`SELECT * FROM artifacts WHERE id = ?`)
    .get(id) as ArtifactRow | undefined;
  return row ?? null;
}

/** Artifacts linked to a job (gateway async video status). */
export function listArtifactsForJob(jobId: string): ArtifactPublic[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM artifacts WHERE job_id = ? ORDER BY created_at ASC`,
    )
    .all(jobId) as ArtifactRow[];
  return rows.map(toPublicArtifact);
}

/**
 * Write bytes under data/artifacts/{type}/{yyyy}/{mm}/{id}.ext and insert row.
 */
export function saveArtifact(input: {
  type: ArtifactType | string;
  bytes: Buffer;
  extension: string;
  mime?: string | null;
  jobId?: string | null;
  meta?: Record<string, unknown>;
  id?: string;
}): ArtifactPublic {
  ensureDataDirs();
  const id = input.id ?? randomUUID();
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const ext = input.extension.replace(/^\./, "");
  const dirRel = `${folderForType(input.type)}/${yyyy}/${mm}`;
  const absDir = resolveDataPath(dirRel);
  fs.mkdirSync(absDir, { recursive: true });

  const fileName = `${id}.${ext}`;
  const absPath = path.join(absDir, fileName);
  fs.writeFileSync(absPath, input.bytes);

  const uri = toPosixRelative(absPath);
  const ts = nowIso();
  getDb()
    .prepare(
      `INSERT INTO artifacts (id, job_id, type, uri, mime, meta_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.jobId ?? null,
      input.type,
      uri,
      input.mime ?? null,
      JSON.stringify(input.meta ?? {}),
      ts,
    );

  return toPublicArtifact(getArtifact(id)!);
}
