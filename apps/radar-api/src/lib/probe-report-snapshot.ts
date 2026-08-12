import type {
  OverallStatus,
  ProbeDimension,
  ProbeReport,
  ProbeScoreRow,
} from "./probe-types.js";

/** 公开报告 schema 版本（与探针版本解耦） */
export const REPORT_SCHEMA_VERSION = 2;

/** 默认 TTL：14 天 */
export const REPORT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** 可选预览最长字符（脱敏后） */
export const RAW_PREVIEW_SNIPPET_MAX = 280;

export type ProbeReportDimPublic = {
  id: string;
  status: string;
  title: string;
  summary: string;
};

/** 可落库、可公开分享的脱敏快照（永不含 apiKey） */
export type ProbeReportSnapshot = {
  schemaVersion: number;
  testedHost: string;
  testerLabel: string;
  testedAt: string;
  expiresAt: string;
  probeVersion: string;
  mode: "standard" | "deep";
  overall: OverallStatus;
  message: string;
  result: string;
  score: number | null;
  suiteSeed: number | null;
  suiteIds: string[];
  scored: ProbeScoreRow[];
  httpStatus: number | null;
  latencyMs: number | null;
  requestedModel: string;
  returnedModel: string | null;
  dimensions: ProbeReportDimPublic[];
  /** 用户显式勾选才写入；已脱敏截断 */
  rawPreviewSnippet: string | null;
};

export type ToPublicSnapshotMeta = {
  /** 覆盖从 endpoint 解析的主机名 */
  testedHost?: string;
  testerLabel?: string;
  testedAt?: Date | string;
  ttlMs?: number;
  /** 是否附带 suiteIds（默认 true） */
  includeSuiteIds?: boolean;
  /** 是否附带脱敏 rawPreview 片段（默认 false） */
  includeRawPreview?: boolean;
};

/** 从 chat/completions URL 或 baseUrl 提取 hostname */
export function extractTestedHost(endpointOrBase: string): string {
  const raw = (endpointOrBase || "").trim();
  if (!raw) return "unknown";
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const u = new URL(withProto);
    return u.hostname || "unknown";
  } catch {
    const m = raw.match(/^(?:https?:\/\/)?([^/:]+)/i);
    return m?.[1] || "unknown";
  }
}

function scrubText(s: string): string {
  return s
    .replace(/sk-[a-zA-Z0-9_\-]{8,}/g, "[redacted]")
    .replace(/Bearer\s+[a-zA-Z0-9._\-]+/gi, "Bearer [redacted]")
    .replace(/api[_-]?key["']?\s*[:=]\s*["']?[^"'\s,}]+/gi, "apiKey=[redacted]");
}

function dimPublic(d: ProbeDimension): ProbeReportDimPublic {
  return {
    id: d.id,
    status: d.status,
    title: scrubText(d.title || d.id),
    summary: scrubText(d.summary || ""),
  };
}

/**
 * 将运行时 ProbeReport 转为可公开快照。
 * 丢弃：apiKey、endpoint 全路径、rawPreview、dimensions.details
 */
export function toPublicSnapshot(
  report: ProbeReport,
  meta: ToPublicSnapshotMeta = {},
): ProbeReportSnapshot {
  const now =
    meta.testedAt instanceof Date
      ? meta.testedAt
      : meta.testedAt
        ? new Date(meta.testedAt)
        : new Date();
  const testedAt = Number.isNaN(now.getTime()) ? new Date() : now;
  const ttl = meta.ttlMs ?? REPORT_TTL_MS;
  const expires = new Date(testedAt.getTime() + ttl);

  const testedHost =
    (meta.testedHost && meta.testedHost.trim()) ||
    extractTestedHost(report.endpoint);

  const includeSuiteIds = meta.includeSuiteIds !== false;
  const includeRawPreview = meta.includeRawPreview === true;

  let rawPreviewSnippet: string | null = null;
  if (includeRawPreview && report.rawPreview) {
    const scrubbed = scrubText(String(report.rawPreview)).slice(
      0,
      RAW_PREVIEW_SNIPPET_MAX,
    );
    rawPreviewSnippet = scrubbed || null;
  }

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    testedHost,
    testerLabel: (meta.testerLabel || "api-radar").trim() || "api-radar",
    testedAt: testedAt.toISOString(),
    expiresAt: expires.toISOString(),
    probeVersion: report.probeVersion,
    mode: report.mode === "deep" ? "deep" : "standard",
    overall: report.overall,
    message: scrubText(report.message || ""),
    result: report.result,
    score: typeof report.score === "number" ? report.score : null,
    suiteSeed: typeof report.suiteSeed === "number" ? report.suiteSeed : null,
    suiteIds: includeSuiteIds
      ? (report.suiteIds ?? []).map((id) => String(id))
      : [],
    scored: Array.isArray(report.scored)
      ? report.scored.map((r) => ({
          id: r.id,
          status: r.status,
          weight: r.weight,
        }))
      : [],
    httpStatus: report.httpStatus,
    latencyMs: report.latencyMs,
    requestedModel: scrubText(report.requestedModel || ""),
    returnedModel: report.returnedModel
      ? scrubText(report.returnedModel)
      : null,
    dimensions: (report.dimensions ?? []).map(dimPublic),
    rawPreviewSnippet,
  };
}

/** 快照序列化后不得出现密钥痕迹（测试 / 入库前自检） */
export function assertSnapshotSafe(snapshot: ProbeReportSnapshot): void {
  const blob = JSON.stringify(snapshot);
  if (/sk-[a-zA-Z0-9_\-]{8,}/.test(blob)) {
    throw new Error("snapshot contains api key pattern");
  }
  if (/"apiKey"\s*:/i.test(blob) || /"api_key"\s*:/i.test(blob)) {
    throw new Error("snapshot contains apiKey field");
  }
  if (/Bearer\s+[a-zA-Z0-9._\-]{8,}/i.test(blob)) {
    throw new Error("snapshot contains bearer token");
  }
}
