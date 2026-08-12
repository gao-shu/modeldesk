import { randomBytes } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import type { AppDb } from "../db/client.js";
import { probeReports } from "../db/schema.js";
import {
  assertSnapshotSafe,
  toPublicSnapshot,
  type ProbeReportSnapshot,
  type ToPublicSnapshotMeta,
  REPORT_TTL_MS,
} from "./probe-report-snapshot.js";
import type { ProbeReport } from "./probe-types.js";

export function newReportId(): string {
  // ~12 url-safe chars
  return randomBytes(9).toString("base64url");
}

export type SaveProbeReportInput = {
  report: ProbeReport;
  meta?: ToPublicSnapshotMeta;
  id?: string;
};

export type SavedProbeReport = {
  id: string;
  snapshot: ProbeReportSnapshot;
  createdAt: string;
  expiresAt: string;
};

/** 脱敏入库；返回 id + snapshot */
export function saveProbeReport(
  db: AppDb,
  input: SaveProbeReportInput,
): SavedProbeReport {
  const snapshot = toPublicSnapshot(input.report, input.meta);
  assertSnapshotSafe(snapshot);

  const id = input.id || newReportId();
  const createdAt = snapshot.testedAt;
  const expiresAt = snapshot.expiresAt;

  db.insert(probeReports)
    .values({
      id,
      createdAt,
      expiresAt,
      payloadJson: JSON.stringify(snapshot),
    })
    .run();

  return { id, snapshot, createdAt, expiresAt };
}

export type GetProbeReportResult =
  | { ok: true; id: string; snapshot: ProbeReportSnapshot }
  | { ok: false; reason: "not_found" | "expired" };

/** 读取；过期则删并返回 expired */
export function getProbeReport(
  db: AppDb,
  id: string,
  now: Date = new Date(),
): GetProbeReportResult {
  const row = db.select().from(probeReports).where(eq(probeReports.id, id)).get();
  if (!row) return { ok: false, reason: "not_found" };

  const expiresMs = Date.parse(row.expiresAt);
  if (Number.isFinite(expiresMs) && expiresMs < now.getTime()) {
    db.delete(probeReports).where(eq(probeReports.id, id)).run();
    return { ok: false, reason: "expired" };
  }

  let snapshot: ProbeReportSnapshot;
  try {
    snapshot = JSON.parse(row.payloadJson) as ProbeReportSnapshot;
  } catch {
    db.delete(probeReports).where(eq(probeReports.id, id)).run();
    return { ok: false, reason: "not_found" };
  }

  try {
    assertSnapshotSafe(snapshot);
  } catch {
    db.delete(probeReports).where(eq(probeReports.id, id)).run();
    return { ok: false, reason: "not_found" };
  }

  return { ok: true, id: row.id, snapshot };
}

/** 清理已过期行，返回删除条数 */
export function purgeExpiredProbeReports(
  db: AppDb,
  now: Date = new Date(),
): number {
  const iso = now.toISOString();
  const info = db
    .delete(probeReports)
    .where(lt(probeReports.expiresAt, iso))
    .run();
  return info.changes ?? 0;
}

/** 按 id 删除（管理用）；返回是否删除到行 */
export function deleteProbeReport(db: AppDb, id: string): boolean {
  const info = db.delete(probeReports).where(eq(probeReports.id, id)).run();
  return (info.changes ?? 0) > 0;
}

export { REPORT_TTL_MS };
