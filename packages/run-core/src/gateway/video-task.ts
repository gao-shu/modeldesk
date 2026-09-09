/**
 * Pure helpers for OpenAI Videos–shaped async task status mapping.
 * Safe to unit-test without SQLite / adapters.
 */

export type VideoTaskPublicStatus =
  | "queued"
  | "in_progress"
  | "completed"
  | "failed";

export function mapJobStatusToVideoStatus(
  jobStatus: string,
): VideoTaskPublicStatus {
  switch (jobStatus) {
    case "queued":
      return "queued";
    case "running":
      return "in_progress";
    case "succeeded":
      return "completed";
    case "failed":
    case "cancelled":
      return "failed";
    default:
      return jobStatus === "completed" ? "completed" : "in_progress";
  }
}

/** Prefer explicit numeric progress; else derive from job / progress status. */
export function progressFromJobState(input: {
  jobStatus: string;
  response: Record<string, unknown> | null;
}): number {
  const pub = mapJobStatusToVideoStatus(input.jobStatus);
  if (pub === "completed") return 100;
  if (pub === "queued") return 0;
  if (pub === "failed") return 0;

  const raw = input.response?._progress;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const p = raw as Record<string, unknown>;
    if (typeof p.progress === "number" && Number.isFinite(p.progress)) {
      return Math.max(0, Math.min(100, Math.round(p.progress)));
    }
    if (typeof p.percent === "number" && Number.isFinite(p.percent)) {
      return Math.max(0, Math.min(100, Math.round(p.percent)));
    }
    const detail = p.detail != null ? String(p.detail) : "";
    const m = /(\d{1,3})\s*%/.exec(detail);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n)) return Math.max(0, Math.min(100, n));
    }
    const status = typeof p.status === "string" ? p.status.toLowerCase() : "";
    if (status === "queued" || status === "pending") return 0;
    if (status === "succeeded" || status === "completed") return 100;
  }
  return 0;
}

export function isoToUnixSeconds(iso: string | null | undefined): number {
  if (!iso?.trim()) return Math.floor(Date.now() / 1000);
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return Math.floor(Date.now() / 1000);
  return Math.floor(ms / 1000);
}
