import type {
  LegacyProbeResult,
  OverallStatus,
  ProbeDimension,
  ProbeReport,
  ProbeScoreRow,
} from "./probe-types.js";

const OVERALLS = new Set<OverallStatus>([
  "likely_genuine",
  "suspicious",
  "likely_fake",
  "inconclusive",
  "unreachable",
]);

const RESULTS = new Set<LegacyProbeResult>(["pass", "fail", "inconclusive"]);

const MAX_REPORT_JSON_BYTES = 64 * 1024;

export type ParseProbeReportBodyResult =
  | {
      ok: true;
      report: ProbeReport;
      testedHost?: string;
      testerLabel?: string;
      includeSuiteIds?: boolean;
      includeRawPreview?: boolean;
    }
  | { ok: false; message: string };

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function asNullableNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseDimensions(raw: unknown): ProbeDimension[] {
  if (!Array.isArray(raw)) return [];
  const out: ProbeDimension[] = [];
  for (const item of raw.slice(0, 32)) {
    if (!item || typeof item !== "object") continue;
    const d = item as Record<string, unknown>;
    const id = asString(d.id);
    const status = asString(d.status);
    if (!id || !status) continue;
    out.push({
      id: id as ProbeDimension["id"],
      status: status as ProbeDimension["status"],
      title: asString(d.title, id),
      summary: asString(d.summary),
      // details intentionally dropped — never accept into storage path
    });
  }
  return out;
}

function parseScored(raw: unknown): ProbeScoreRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 32).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const r = item as Record<string, unknown>;
    const id = asString(r.id);
    const status = asString(r.status);
    const weight = asNullableNumber(r.weight);
    if (!id || !status || weight == null) return [];
    return [{ id, status, weight }];
  });
}

/**
 * 从 POST body 解析报告。
 * 忽略 apiKey / Authorization 等字段；体积超限拒绝。
 */
export function parseProbeReportCreateBody(
  body: unknown,
): ParseProbeReportBodyResult {
  if (!body || typeof body !== "object") {
    return { ok: false, message: "请求体无效" };
  }

  const root = body as Record<string, unknown>;
  // 明确丢弃密钥字段（即使误传也不进入后续对象）
  const { apiKey: _a, authorization: _b, Authorization: _c, ...rest } = root;

  const reportRaw =
    rest.report && typeof rest.report === "object"
      ? (rest.report as Record<string, unknown>)
      : rest;

  const {
    apiKey: _d,
    authorization: _e,
    Authorization: _f,
    testedHost: nestedHost,
    testerLabel: nestedLabel,
    ...reportFields
  } = reportRaw;

  const size = Buffer.byteLength(JSON.stringify(reportFields), "utf8");
  if (size > MAX_REPORT_JSON_BYTES) {
    return {
      ok: false,
      message: `报告过大（>${MAX_REPORT_JSON_BYTES} bytes）`,
    };
  }

  const overall = asString(reportFields.overall) as OverallStatus;
  if (!OVERALLS.has(overall)) {
    return { ok: false, message: "缺少或无效的 overall" };
  }

  const requestedModel = asString(reportFields.requestedModel).trim();
  if (!requestedModel) {
    return { ok: false, message: "requestedModel 必填" };
  }

  const mode = reportFields.mode === "deep" ? "deep" : "standard";
  const resultRaw = asString(reportFields.result) as LegacyProbeResult;
  const result = RESULTS.has(resultRaw) ? resultRaw : "inconclusive";

  const report: ProbeReport = {
    probeVersion: asString(reportFields.probeVersion, "unknown"),
    mode,
    overall,
    message: asString(reportFields.message),
    result,
    score:
      typeof reportFields.score === "number" &&
      Number.isFinite(reportFields.score)
        ? reportFields.score
        : undefined,
    suiteSeed:
      typeof reportFields.suiteSeed === "number" &&
      Number.isFinite(reportFields.suiteSeed)
        ? reportFields.suiteSeed
        : undefined,
    suiteIds: Array.isArray(reportFields.suiteIds)
      ? reportFields.suiteIds.map((x) => String(x)).slice(0, 64)
      : undefined,
    scored: parseScored(reportFields.scored),
    httpStatus: asNullableNumber(reportFields.httpStatus),
    latencyMs: asNullableNumber(reportFields.latencyMs),
    requestedModel,
    returnedModel:
      reportFields.returnedModel == null
        ? null
        : asString(reportFields.returnedModel) || null,
    endpoint: asString(reportFields.endpoint),
    dimensions: parseDimensions(reportFields.dimensions),
    rawPreview:
      typeof reportFields.rawPreview === "string"
        ? reportFields.rawPreview.slice(0, 4000)
        : null,
  };

  const testedHost =
    (typeof rest.testedHost === "string" && rest.testedHost.trim()) ||
    (typeof nestedHost === "string" && nestedHost.trim()) ||
    undefined;
  const testerLabel =
    (typeof rest.testerLabel === "string" && rest.testerLabel.trim()) ||
    (typeof nestedLabel === "string" && nestedLabel.trim()) ||
    undefined;

  const includeSuiteIds =
    rest.includeSuiteIds === false || rest.includeSuiteIds === "0"
      ? false
      : rest.includeSuiteIds === true || rest.includeSuiteIds === "1"
        ? true
        : undefined;
  const includeRawPreview =
    rest.includeRawPreview === true || rest.includeRawPreview === "1";

  return {
    ok: true,
    report,
    testedHost: testedHost || undefined,
    testerLabel: testerLabel || undefined,
    includeSuiteIds,
    includeRawPreview: includeRawPreview || undefined,
  };
}

export { MAX_REPORT_JSON_BYTES };
