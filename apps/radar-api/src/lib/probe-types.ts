export const PROBE_VERSION = "0.2.0-phase1";
export const PROBE_VERSION_A = "0.3.5-share";

export type DimensionStatus = "pass" | "fail" | "weak" | "skip";

export type OverallStatus =
  | "likely_genuine"
  | "suspicious"
  | "likely_fake"
  | "inconclusive"
  | "unreachable";

export type DimensionId =
  | "connectivity"
  | "handshake"
  | "metadata"
  | "tokenizer"
  | "style"
  | "cutoff"
  | "capability"
  | "cache"
  | "client"
  | "summary"
  | "price";

export type ProbeStepId =
  | "handshake"
  | "metadata"
  | "style"
  | "cutoff"
  | "capability"
  | "cache"
  | "client"
  | "summary";

export type ProbeDimension = {
  id: DimensionId;
  status: DimensionStatus;
  title: string;
  summary: string;
  details?: Record<string, unknown>;
};

export type ProbeStepEvent = {
  type: "step_start" | "step_done";
  step: ProbeStepId;
  title: string;
  status?: DimensionStatus;
  dimension?: ProbeDimension;
  progress?: number;
  message?: string;
};

/** 兼容旧前端的粗粒度结果 */
export type LegacyProbeResult = "pass" | "fail" | "inconclusive";

export type ProbeScoreRow = {
  id: string;
  status: string;
  weight: number;
};

export type ProbeReport = {
  probeVersion: string;
  mode: "standard" | "deep";
  overall: OverallStatus;
  message: string;
  result: LegacyProbeResult;
  score?: number;
  /** 抽题种子，便于复现同一次套题 */
  suiteSeed?: number;
  /** 本次抽中的题 ID */
  suiteIds?: string[];
  /** 参与加权的分项 */
  scored?: ProbeScoreRow[];
  httpStatus: number | null;
  latencyMs: number | null;
  requestedModel: string;
  returnedModel: string | null;
  endpoint: string;
  dimensions: ProbeDimension[];
  rawPreview: string | null;
};

export function overallToLegacy(overall: OverallStatus): LegacyProbeResult {
  if (overall === "likely_genuine") return "pass";
  if (overall === "likely_fake" || overall === "unreachable") return "fail";
  return "inconclusive";
}

/** 一期：仅 connectivity + metadata */
export function synthesizeOverall(
  dimensions: ProbeDimension[],
): { overall: OverallStatus; message: string } {
  const byId = Object.fromEntries(dimensions.map((d) => [d.id, d]));
  const conn = byId.connectivity ?? byId.handshake;
  const meta = byId.metadata;

  if (conn?.status === "fail") {
    const auth =
      typeof conn.details?.httpStatus === "number" &&
      (conn.details.httpStatus === 401 || conn.details.httpStatus === 403);
    if (
      auth ||
      conn.details?.reason === "network" ||
      conn.details?.reason === "timeout" ||
      conn.details?.reason === "auth"
    ) {
      return {
        overall: "unreachable",
        message: conn.summary || "无法完成检测：通道不可达或鉴权失败",
      };
    }
    return {
      overall: "inconclusive",
      message: conn.summary || "连通失败，无法鉴真",
    };
  }

  if (meta?.status === "fail") {
    return {
      overall: "suspicious",
      message: `存疑：${meta.summary}`,
    };
  }

  if (meta?.status === "weak" || conn?.status === "weak") {
    return {
      overall: "suspicious",
      message: `存疑：元数据信号偏弱 — ${meta?.summary ?? conn?.summary ?? ""}`.trim(),
    };
  }

  if (conn?.status === "pass" && meta?.status === "pass") {
    return {
      overall: "likely_genuine",
      message:
        "未见明显异常：接口可用且元数据基本符合预期。注意：浅测不能排除模型掉包。",
    };
  }

  return {
    overall: "inconclusive",
    message: "结果不确定：样本不足或响应无法充分解析",
  };
}

/** A 方案：多维 + 综合分 → 给出可执行的最终鉴真结论 */
export function synthesizeOverallA(
  dimensions: ProbeDimension[],
  score: number,
  opts?: { channel?: "official" | "relay" },
): { overall: OverallStatus; message: string } {
  const byId = Object.fromEntries(dimensions.map((d) => [d.id, d]));
  const hs = byId.handshake;
  const cap = byId.capability;
  const meta = byId.metadata;
  const channel = opts?.channel ?? "relay";

  if (hs?.status === "fail") {
    const http = hs.details?.chatHttp;
    if (http === 401 || http === 403) {
      return {
        overall: "unreachable",
        message: "最终结论：无法检测 — 鉴权失败或通道不可达。",
      };
    }
    return {
      overall: "unreachable",
      message: `最终结论：无法检测 — 握手失败（${hs.summary}）。`,
    };
  }

  // 官方直连：只根据协议/元数据给结论，不做中转掉包判定
  if (channel === "official") {
    if (meta?.status === "fail") {
      return {
        overall: "suspicious",
        message: `最终结论：存疑 — 官方通道可达，但返回模型与请求不一致（${meta.summary}）。`,
      };
    }
    return {
      overall: "likely_genuine",
      message:
        "最终结论：官方直连可用 — 协议与元数据正常。此结果表示官方通道可用，不做中转掉包鉴真。",
    };
  }

  const fails = dimensions.filter(
    (d) =>
      d.status === "fail" &&
      d.id !== "summary" &&
      d.id !== "client" &&
      d.id !== "cutoff",
  );
  const hardFails = fails.filter((d) =>
    ["handshake", "metadata", "capability"].includes(d.id),
  );

  if (hardFails.length >= 2 || (cap?.status === "fail" && meta?.status === "fail")) {
    return {
      overall: "likely_fake",
      message: `最终结论：高度可疑 — 多项关键信号未通过，疑似掉包或假货（综合分 ${score}/100）。建议换站或深测复验。`,
    };
  }

  if (score >= 75 && hardFails.length === 0) {
    return {
      overall: "likely_genuine",
      message: `最终结论：倾向真货 — 未见明显掉包信号（综合分 ${score}/100）。仍非官方认证，深测可提高置信度。`,
    };
  }

  if (score < 45 || hardFails.length >= 1) {
    return {
      overall: "suspicious",
      message: `最终结论：存疑 — 有异常或偏弱信号，不能确认就是声称的模型（综合分 ${score}/100）。建议深测或对照官方通道。`,
    };
  }

  return {
    overall: "suspicious",
    message: `最终结论：存疑 — 信号中性偏弱（综合分 ${score}/100），尚不能确认真货。建议深测或对照官方通道。`,
  };
}
