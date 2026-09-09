import fs from "node:fs";
import path from "node:path";
import { getDb } from "./db";
import {
  ensureDataDirs,
  getDataDir,
  getDbPath,
  resolveDataPath,
} from "./paths";

export type DiskBucket = {
  id: string;
  label: string;
  bytes: number;
  files: number;
};

export type DiskUsage = {
  dataDir: string;
  totalBytes: number;
  dbBytes: number;
  artifactCount: number;
  runCount: number;
  buckets: DiskBucket[];
};

const BUCKETS: { id: string; label: string; rel: string }[] = [
  { id: "images", label: "图片", rel: "artifacts/images" },
  { id: "videos", label: "视频", rel: "artifacts/videos" },
  { id: "audio", label: "语音", rel: "artifacts/audio" },
  { id: "music", label: "音乐", rel: "artifacts/music" },
  { id: "text", label: "文本产物", rel: "artifacts/text" },
  { id: "thumbs", label: "缩略图缓存", rel: "artifacts/thumbs" },
];

function walkDir(dir: string): { bytes: number; files: number } {
  let bytes = 0;
  let files = 0;
  if (!fs.existsSync(dir)) return { bytes, files };
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const p = path.join(cur, ent.name);
      if (ent.isDirectory()) {
        stack.push(p);
        continue;
      }
      if (!ent.isFile()) continue;
      try {
        bytes += fs.statSync(p).size;
        files += 1;
      } catch {
        /* ignore */
      }
    }
  }
  return { bytes, files };
}

function rmTreeContents(dir: string): number {
  let removed = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    try {
      fs.rmSync(p, { recursive: true, force: true });
      removed += 1;
    } catch {
      /* ignore locked files */
    }
  }
  return removed;
}

export function getDiskUsage(): DiskUsage {
  ensureDataDirs();
  const dataDir = getDataDir();
  const dbPath = getDbPath();
  let dbBytes = 0;
  for (const suffix of ["", "-wal", "-shm"]) {
    const p = `${dbPath}${suffix}`;
    if (fs.existsSync(p)) {
      try {
        dbBytes += fs.statSync(p).size;
      } catch {
        /* ignore */
      }
    }
  }

  const buckets: DiskBucket[] = BUCKETS.map((b) => {
    const { bytes, files } = walkDir(resolveDataPath(b.rel));
    return { id: b.id, label: b.label, bytes, files };
  });

  const db = getDb();
  const artifactCount = (
    db.prepare(`SELECT COUNT(*) AS c FROM artifacts`).get() as { c: number }
  ).c;
  const runCount = (
    db.prepare(`SELECT COUNT(*) AS c FROM eval_runs`).get() as { c: number }
  ).c;

  const artifactBytes = buckets.reduce((s, b) => s + b.bytes, 0);
  return {
    dataDir,
    totalBytes: artifactBytes + dbBytes,
    dbBytes,
    artifactCount,
    runCount,
    buckets,
  };
}

export type CleanupResult = {
  deletedArtifacts: number;
  deletedRuns: number;
  freedEstimateBytes: number;
  disk: DiskUsage;
};

/**
 * Delete generated media files + artifact rows.
 * Optionally wipe eval run history (jobs / scores cascade).
 */
export function cleanupGeneratedData(options?: {
  clearRuns?: boolean;
}): CleanupResult {
  ensureDataDirs();
  const before = getDiskUsage();
  const db = getDb();

  const rows = db
    .prepare(`SELECT id, uri FROM artifacts`)
    .all() as { id: string; uri: string }[];

  for (const row of rows) {
    try {
      const abs = resolveDataPath(row.uri);
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
    } catch {
      /* ignore */
    }
  }

  rmTreeContents(resolveDataPath("artifacts/thumbs"));
  for (const b of BUCKETS) {
    if (b.id === "thumbs") continue;
    // remove empty year/month trees left behind
    rmTreeContents(resolveDataPath(b.rel));
  }

  const clearRuns = Boolean(options?.clearRuns);
  const tx = db.transaction(() => {
    const art = db.prepare(`DELETE FROM artifacts`).run();
    let runs = 0;
    if (clearRuns) {
      runs = db.prepare(`DELETE FROM eval_runs`).run().changes;
    }
    return { deletedArtifacts: art.changes, deletedRuns: runs };
  });
  const { deletedArtifacts, deletedRuns } = tx();

  const after = getDiskUsage();
  return {
    deletedArtifacts,
    deletedRuns,
    freedEstimateBytes: Math.max(0, before.totalBytes - after.totalBytes),
    disk: after,
  };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
