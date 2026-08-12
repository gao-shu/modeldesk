import type { ProbeDimension } from "./probe-types.js";

function modelMatches(requested: string, returned: string | null): boolean {
  if (!returned) return false;
  const a = requested.toLowerCase().replace(/_/g, "-");
  const b = returned.toLowerCase().replace(/_/g, "-");
  return b === a || b.includes(a) || a.includes(b);
}

function familyOf(model: string): "openai" | "claude" | "gemini" | "grok" | "other" {
  const m = model.toLowerCase();
  if (m.includes("claude")) return "claude";
  if (m.includes("gemini")) return "gemini";
  if (m.includes("grok")) return "grok";
  if (m.includes("gpt") || m.startsWith("o1") || m.startsWith("o3") || m.startsWith("o4"))
    return "openai";
  return "other";
}

export type MetadataInput = {
  requestedModel: string;
  httpStatus: number;
  bodyText: string;
  parsed: Record<string, unknown> | null;
};

export function analyzeMetadata(input: MetadataInput): {
  dimension: ProbeDimension;
  returnedModel: string | null;
} {
  const { requestedModel, httpStatus, parsed } = input;
  const details: Record<string, unknown> = { httpStatus };

  if (httpStatus < 200 || httpStatus >= 300) {
    return {
      returnedModel: null,
      dimension: {
        id: "metadata",
        status: "skip",
        title: "Metadata",
        summary: "连通未成功，跳过元数据鉴真",
        details,
      },
    };
  }

  if (!parsed) {
    return {
      returnedModel: null,
      dimension: {
        id: "metadata",
        status: "fail",
        title: "Metadata",
        summary: "响应不是合法 JSON，无法核验元数据",
        details,
      },
    };
  }

  const returnedModel =
    typeof parsed.model === "string" ? parsed.model : null;
  details.returnedModel = returnedModel;
  details.requestedModel = requestedModel;

  const finishReason =
    (typeof parsed.finish_reason === "string" && parsed.finish_reason) ||
    (typeof parsed.stop_reason === "string" && parsed.stop_reason) ||
    null;
  // OpenAI choices[0].finish_reason
  const choices = Array.isArray(parsed.choices) ? parsed.choices : [];
  const choice0 = choices[0] as Record<string, unknown> | undefined;
  const choiceFinish =
    choice0 && typeof choice0.finish_reason === "string"
      ? choice0.finish_reason
      : null;
  const effectiveFinish = finishReason || choiceFinish;
  details.finishReason = effectiveFinish;

  const usage =
    parsed.usage && typeof parsed.usage === "object"
      ? (parsed.usage as Record<string, unknown>)
      : null;
  details.hasUsage = !!usage;
  if (usage) {
    details.promptTokens = usage.prompt_tokens ?? usage.input_tokens ?? null;
    details.completionTokens =
      usage.completion_tokens ?? usage.output_tokens ?? null;
  }

  const issues: string[] = [];
  let status: ProbeDimension["status"] = "pass";

  if (!returnedModel) {
    issues.push("响应缺少 model 字段");
    status = "weak";
  } else if (!modelMatches(requestedModel, returnedModel)) {
    issues.push(
      `返回模型「${returnedModel}」与请求「${requestedModel}」不一致`,
    );
    status = "fail";
  }

  if (!usage) {
    issues.push("缺少 usage（计费/指纹相关元数据）");
    if (status === "pass") status = "weak";
  } else {
    const pt = details.promptTokens;
    const ct = details.completionTokens;
    if (pt == null && ct == null) {
      issues.push("usage 中无 token 计数");
      if (status === "pass") status = "weak";
    }
  }

  if (!effectiveFinish) {
    issues.push("缺少 finish_reason / stop_reason");
    if (status === "pass") status = "weak";
  }

  // 弱启发式：声称 Claude 但返回名明显是 gpt-*
  const reqFam = familyOf(requestedModel);
  const retFam = returnedModel ? familyOf(returnedModel) : "other";
  if (
    status !== "fail" &&
    reqFam === "claude" &&
    retFam === "openai" &&
    returnedModel
  ) {
    issues.push("请求 Claude 系，返回名却像 OpenAI 系");
    status = "fail";
  }

  const summary =
    status === "pass"
      ? "模型名与 usage / finish 字段未见明显异常"
      : issues.join("；");

  return {
    returnedModel,
    dimension: {
      id: "metadata",
      status,
      title: "Metadata",
      summary,
      details: { ...details, issues },
    },
  };
}

export function analyzeConnectivity(opts: {
  httpStatus: number | null;
  latencyMs: number;
  errorKind?: "timeout" | "network" | null;
  errorMessage?: string;
}): ProbeDimension {
  if (opts.errorKind === "timeout") {
    return {
      id: "connectivity",
      status: "fail",
      title: "Connectivity",
      summary: `请求超时（${opts.latencyMs}ms）`,
      details: { reason: "timeout", latencyMs: opts.latencyMs },
    };
  }
  if (opts.errorKind === "network") {
    return {
      id: "connectivity",
      status: "fail",
      title: "Connectivity",
      summary: `网络错误：${opts.errorMessage ?? "unknown"}`,
      details: { reason: "network", latencyMs: opts.latencyMs },
    };
  }
  const status = opts.httpStatus;
  if (status == null) {
    return {
      id: "connectivity",
      status: "fail",
      title: "Connectivity",
      summary: "无 HTTP 状态",
      details: { reason: "network", latencyMs: opts.latencyMs },
    };
  }
  if (status === 401 || status === 403) {
    return {
      id: "connectivity",
      status: "fail",
      title: "Connectivity",
      summary: `鉴权失败（HTTP ${status}）`,
      details: { httpStatus: status, reason: "auth", latencyMs: opts.latencyMs },
    };
  }
  if (status >= 200 && status < 300) {
    return {
      id: "connectivity",
      status: "pass",
      title: "Connectivity",
      summary: `接口可达（HTTP ${status}，${opts.latencyMs}ms）`,
      details: { httpStatus: status, latencyMs: opts.latencyMs },
    };
  }
  return {
    id: "connectivity",
    status: "fail",
    title: "Connectivity",
    summary: `HTTP ${status}`,
    details: { httpStatus: status, latencyMs: opts.latencyMs },
  };
}
