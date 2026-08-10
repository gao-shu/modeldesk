import {
  analyzeConnectivity,
  analyzeMetadata,
} from "./probe-metadata.js";
import {
  PROBE_VERSION,
  overallToLegacy,
  synthesizeOverall,
  type ProbeDimension,
  type ProbeReport,
} from "./probe-types.js";

export type { ProbeReport, ProbeDimension };
export type ProbeOnceInput = {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
};

/** @deprecated 使用 ProbeReport；保留别名避免外部引用断裂 */
export type ProbeOnceOutput = ProbeReport;
export type ProbeResultStatus = ProbeReport["result"];

const PRIVATE_HOST =
  /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|::1$|\[::1\])/i;

function isPrivateIpv4(host: string): boolean {
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

export function assertProbeTarget(baseUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl.trim());
  } catch {
    throw Object.assign(new Error("请求地址不是合法 URL"), { statusCode: 400 });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw Object.assign(new Error("仅支持 http/https"), { statusCode: 400 });
  }
  const allowPrivate = process.env.ALLOW_PROBE_PRIVATE === "1";
  const host = parsed.hostname;
  if (!allowPrivate && (PRIVATE_HOST.test(host) || isPrivateIpv4(host))) {
    throw Object.assign(new Error("不允许探测内网地址"), { statusCode: 400 });
  }
  return parsed;
}

export function resolveChatCompletionsUrl(baseUrl: string): string {
  const parsed = assertProbeTarget(baseUrl);
  let path = parsed.pathname.replace(/\/+$/, "") || "";
  if (path.endsWith("/chat/completions")) {
    return parsed.toString().replace(/\/+$/, "");
  }
  if (!path || path === "/") {
    path = "/v1/chat/completions";
  } else if (path.endsWith("/v1")) {
    path = `${path}/chat/completions`;
  } else {
    path = `${path}/chat/completions`;
  }
  parsed.pathname = path;
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

function buildReport(opts: {
  endpoint: string;
  requestedModel: string;
  dimensions: ProbeDimension[];
  httpStatus: number | null;
  latencyMs: number | null;
  returnedModel: string | null;
  rawPreview: string | null;
}): ProbeReport {
  const { overall, message } = synthesizeOverall(opts.dimensions);
  // phase-1 placeholders for future dims
  const skipRest: ProbeDimension[] = [
    {
      id: "tokenizer",
      status: "skip",
      title: "Tokenizer",
      summary: "二期启用",
    },
    {
      id: "cache",
      status: "skip",
      title: "Cache",
      summary: "三期启用（优先 Claude）",
    },
    {
      id: "capability",
      status: "skip",
      title: "Capability",
      summary: "二期启用",
    },
    {
      id: "price",
      status: "skip",
      title: "Price",
      summary: "四期启用",
    },
  ];
  const dimensions = [
    ...opts.dimensions,
    ...skipRest.filter((s) => !opts.dimensions.some((d) => d.id === s.id)),
  ];
  return {
    probeVersion: PROBE_VERSION,
    mode: "standard",
    overall,
    message,
    result: overallToLegacy(overall),
    httpStatus: opts.httpStatus,
    latencyMs: opts.latencyMs,
    requestedModel: opts.requestedModel,
    returnedModel: opts.returnedModel,
    endpoint: opts.endpoint,
    dimensions,
    rawPreview: opts.rawPreview,
  };
}

export async function runProbeOnce(
  input: ProbeOnceInput,
): Promise<ProbeReport> {
  const model = input.model.trim();
  const apiKey = input.apiKey.trim();
  if (!model) {
    throw Object.assign(new Error("请选择或填写模型"), { statusCode: 400 });
  }
  if (!apiKey) {
    throw Object.assign(new Error("请填写 API Key"), { statusCode: 400 });
  }

  const endpoint = resolveChatCompletionsUrl(input.baseUrl);
  const timeoutMs = Math.min(
    60_000,
    Math.max(5_000, input.timeoutMs ?? 25_000),
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Reply with exactly: OK" }],
        max_tokens: 16,
        temperature: 0,
      }),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - started;
    const text = await res.text();
    const rawPreview = text.slice(0, 800);

    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      parsed = null;
    }

    const connectivity = analyzeConnectivity({
      httpStatus: res.status,
      latencyMs,
    });
    const { dimension: metadata, returnedModel } = analyzeMetadata({
      requestedModel: model,
      httpStatus: res.status,
      bodyText: text,
      parsed,
    });

    return buildReport({
      endpoint,
      requestedModel: model,
      dimensions: [connectivity, metadata],
      httpStatus: res.status,
      latencyMs,
      returnedModel,
      rawPreview,
    });
  } catch (err) {
    const latencyMs = Date.now() - started;
    const aborted = err instanceof Error && err.name === "AbortError";
    const connectivity = analyzeConnectivity({
      httpStatus: null,
      latencyMs,
      errorKind: aborted ? "timeout" : "network",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    const metadata: ProbeDimension = {
      id: "metadata",
      status: "skip",
      title: "Metadata",
      summary: "未连通，跳过元数据鉴真",
    };
    return buildReport({
      endpoint,
      requestedModel: model,
      dimensions: [connectivity, metadata],
      httpStatus: null,
      latencyMs,
      returnedModel: null,
      rawPreview: null,
    });
  } finally {
    clearTimeout(timer);
  }
}
