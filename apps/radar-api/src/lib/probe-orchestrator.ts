import {
  FINGERPRINT_PROMPT,
  familyOfModel,
  fingerprintBandForFamily,
  makeSeededRng,
  newSuiteSeed,
  pickSuite,
  scoreAnswer,
} from "../data/probe-suites.js";
import { classifyProbeChannel } from "./probe-channel.js";
import { runClientCompatProbe } from "./probe-client-compat.js";
import {
  analyzeConnectivity,
  analyzeMetadata,
} from "./probe-metadata.js";
import {
  resolveChatCompletionsUrl,
  assertProbeTarget,
} from "./probe-once.js";
import {
  PROBE_VERSION_A,
  overallToLegacy,
  synthesizeOverallA,
  type ProbeDimension,
  type ProbeReport,
  type ProbeStepId,
  type ProbeStepEvent,
  type DimensionStatus,
} from "./probe-types.js";

export type ProbeRunInput = {
  baseUrl: string;
  apiKey: string;
  model: string;
  mode?: "standard" | "deep";
  timeoutMs?: number;
  /** 可选：固定抽题种子以便复现 */
  suiteSeed?: number;
};

function normalizeBase(baseUrl: string): string {
  assertProbeTarget(baseUrl);
  return baseUrl.trim().replace(/\/+$/, "");
}

function modelsUrl(baseUrl: string): string {
  const base = normalizeBase(baseUrl);
  if (/\/v1$/i.test(base)) return `${base}/models`;
  if (/\/chat\/completions$/i.test(base)) {
    return base.replace(/\/chat\/completions$/i, "/models");
  }
  return `${base}/v1/models`;
}

async function chatCompletion(opts: {
  endpoint: string;
  apiKey: string;
  model: string;
  content: string;
  maxTokens: number;
  timeoutMs: number;
  extraBody?: Record<string, unknown>;
}): Promise<{
  httpStatus: number;
  latencyMs: number;
  text: string;
  parsed: Record<string, unknown> | null;
  contentOut: string;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(opts.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        messages: [{ role: "user", content: opts.content }],
        max_tokens: opts.maxTokens,
        temperature: 0,
        ...opts.extraBody,
      }),
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      parsed = null;
    }
    let contentOut = "";
    const choices = parsed && Array.isArray(parsed.choices) ? parsed.choices : [];
    const c0 = choices[0] as Record<string, unknown> | undefined;
    const msg = c0?.message as Record<string, unknown> | undefined;
    if (typeof msg?.content === "string") contentOut = msg.content;
    else if (typeof parsed?.content === "string") contentOut = parsed.content as string;

    return {
      httpStatus: res.status,
      latencyMs: Date.now() - started,
      text,
      parsed,
      contentOut,
    };
  } finally {
    clearTimeout(timer);
  }
}

function usagePromptTokens(parsed: Record<string, unknown> | null): number | null {
  if (!parsed?.usage || typeof parsed.usage !== "object") return null;
  const u = parsed.usage as Record<string, unknown>;
  const v = u.prompt_tokens ?? u.input_tokens;
  return typeof v === "number" ? v : null;
}

function extractCacheTokens(parsed: Record<string, unknown> | null): {
  cacheRead: number | null;
  cacheCreation: number | null;
} {
  if (!parsed?.usage || typeof parsed.usage !== "object") {
    return { cacheRead: null, cacheCreation: null };
  }
  const u = parsed.usage as Record<string, unknown>;
  const cacheRead =
    typeof u.cache_read_input_tokens === "number"
      ? u.cache_read_input_tokens
      : typeof u.prompt_cache_hit_tokens === "number"
        ? u.prompt_cache_hit_tokens
        : null;
  const cacheCreation =
    typeof u.cache_creation_input_tokens === "number"
      ? u.cache_creation_input_tokens
      : typeof u.prompt_cache_miss_tokens === "number"
        ? u.prompt_cache_miss_tokens
        : null;
  return { cacheRead, cacheCreation };
}

const STEP_META: Record<
  ProbeStepId,
  { title: string; weight: number }
> = {
  handshake: { title: "API 握手与协议探测", weight: 12 },
  metadata: { title: "元数据指纹采集", weight: 15 },
  style: { title: "输出风格特征比对", weight: 12 },
  cutoff: { title: "知识 cutoff 边界探测", weight: 12 },
  capability: { title: "R1 动态题（身份穿透+精确计算）", weight: 22 },
  cache: { title: "缓存命中行为深测", weight: 15 },
  client: { title: "客户端兼容（轻量）", weight: 8 },
  summary: { title: "汇总判定与评分", weight: 0 },
};

function statusScore(s: DimensionStatus): number | null {
  if (s === "pass") return 100;
  if (s === "weak") return 55;
  if (s === "fail") return 0;
  return null; // skip
}

export function computeScore(dimensions: ProbeDimension[]): {
  score: number;
  scored: Array<{ id: string; status: string; weight: number }>;
} {
  let num = 0;
  let den = 0;
  const scored: Array<{ id: string; status: string; weight: number }> = [];
  for (const d of dimensions) {
    if (d.id === "summary") continue;
    const meta = STEP_META[d.id as ProbeStepId];
    if (!meta || meta.weight <= 0) continue;
    const sc = statusScore(d.status);
    if (sc == null) continue;
    num += sc * meta.weight;
    den += meta.weight;
    scored.push({ id: d.id, status: d.status, weight: meta.weight });
  }
  return { score: den ? Math.round(num / den) : 0, scored };
}

export async function* runProbeAuth(
  input: ProbeRunInput,
): AsyncGenerator<ProbeStepEvent, ProbeReport> {
  const mode = input.mode === "deep" ? "deep" : "standard";
  const model = input.model.trim();
  const apiKey = input.apiKey.trim();
  if (!model || !apiKey) {
    throw Object.assign(new Error("请填写 API Key 和模型"), { statusCode: 400 });
  }

  const endpoint = resolveChatCompletionsUrl(input.baseUrl);
  const timeoutMs = Math.min(45_000, Math.max(8_000, input.timeoutMs ?? 30_000));
  const family = familyOfModel(model);
  const suiteSeed =
    typeof input.suiteSeed === "number" && Number.isFinite(input.suiteSeed)
      ? input.suiteSeed >>> 0
      : newSuiteSeed();
  const suite = pickSuite(family, mode, makeSeededRng(suiteSeed));
  const dimensions: ProbeDimension[] = [];
  let returnedModel: string | null = null;
  let lastHttp: number | null = null;
  let totalLatency = 0;
  let rawPreview: string | null = null;
  const t0 = Date.now();

  const emit = (
    step: ProbeStepId,
    status: "running" | "done",
    dim?: ProbeDimension,
    progress?: number,
  ): ProbeStepEvent => ({
    type: status === "running" ? "step_start" : "step_done",
    step,
    title: STEP_META[step].title,
    status: dim?.status,
    dimension: dim,
    progress,
    message: dim?.summary,
  });

  // —— 1 handshake ——
  yield emit("handshake", "running", undefined, 5);
  let handshakeStatus: DimensionStatus = "pass";
  const handshakeDetails: Record<string, unknown> = {};
  try {
    const mUrl = modelsUrl(input.baseUrl);
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), Math.min(12_000, timeoutMs));
    const started = Date.now();
    const mRes = await fetch(mUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: c.signal,
    });
    clearTimeout(t);
    handshakeDetails.modelsUrl = mUrl;
    handshakeDetails.modelsHttp = mRes.status;
    handshakeDetails.modelsLatencyMs = Date.now() - started;
    if (mRes.status === 401 || mRes.status === 403) {
      handshakeStatus = "fail";
    } else if (mRes.status >= 200 && mRes.status < 300) {
      handshakeStatus = "pass";
    } else if (mRes.status === 404) {
      handshakeStatus = "weak"; // 很多中转没有 /models
    } else {
      handshakeStatus = "weak";
    }
  } catch (e) {
    handshakeDetails.modelsError = e instanceof Error ? e.message : String(e);
    handshakeStatus = "weak";
  }

  // ping chat
  const ping = await chatCompletion({
    endpoint,
    apiKey,
    model,
    content: "Reply with exactly: OK",
    maxTokens: 16,
    timeoutMs,
  });
  totalLatency += ping.latencyMs;
  lastHttp = ping.httpStatus;
  rawPreview = ping.text.slice(0, 600);
  const conn = analyzeConnectivity({
    httpStatus: ping.httpStatus,
    latencyMs: ping.latencyMs,
  });
  if (conn.status === "fail") handshakeStatus = "fail";
  else if (handshakeStatus === "pass" && conn.status === "pass")
    handshakeStatus = "pass";

  const handshakeDim: ProbeDimension = {
    id: "handshake",
    status: handshakeStatus,
    title: STEP_META.handshake.title,
    summary:
      handshakeStatus === "pass"
        ? `协议可达（chat HTTP ${ping.httpStatus}；/models ${handshakeDetails.modelsHttp ?? "n/a"}）`
        : handshakeStatus === "fail"
          ? `握手失败：chat HTTP ${ping.httpStatus}`
          : `部分可达：chat HTTP ${ping.httpStatus}，/models 异常或缺失`,
    details: { ...handshakeDetails, chatHttp: ping.httpStatus },
  };
  dimensions.push(handshakeDim);
  yield emit("handshake", "done", handshakeDim, 15);

  if (handshakeDim.status === "fail" && (ping.httpStatus === 401 || ping.httpStatus === 403 || ping.httpStatus === 0)) {
    // early exit — still fill skips
    const skips = skipRemaining(["metadata", "style", "cutoff", "capability", "cache", "client"], "握手失败，后续跳过");
    dimensions.push(...skips);
    for (const s of skips) {
      yield emit(s.id as ProbeStepId, "done", s, 90);
    }
    return finalize(
      mode,
      model,
      endpoint,
      dimensions,
      lastHttp,
      Date.now() - t0,
      returnedModel,
      rawPreview,
      suiteSeed,
      suite.all.map((q) => q.id),
      classifyProbeChannel(endpoint),
    );
  }

  // —— 2 metadata ——
  yield emit("metadata", "running", undefined, 20);
  const metaAnalyzed = analyzeMetadata({
    requestedModel: model,
    httpStatus: ping.httpStatus,
    bodyText: ping.text,
    parsed: ping.parsed,
  });
  returnedModel = metaAnalyzed.returnedModel;
  const metadataDim: ProbeDimension = {
    ...metaAnalyzed.dimension,
    id: "metadata",
    title: STEP_META.metadata.title,
  };
  dimensions.push(metadataDim);
  yield emit("metadata", "done", metadataDim, 30);

  const channel = classifyProbeChannel(endpoint);

  // 官方直连：握手+元数据后直接给最终结论，跳过中转掉包套题
  if (channel === "official") {
    const skips = skipRemaining(
      ["style", "cutoff", "capability", "cache", "client"],
      "官方直连：跳过中转掉包鉴真题",
    );
    dimensions.push(...skips);
    for (const s of skips) {
      yield emit(s.id as ProbeStepId, "done", s, 90);
    }
    return finalize(
      mode,
      model,
      endpoint,
      dimensions,
      lastHttp,
      Date.now() - t0,
      returnedModel,
      rawPreview,
      suiteSeed,
      suite.all.map((q) => q.id),
      channel,
    );
  }

  // —— 3 fingerprint via dedicated request (tokenizer) ——
  // fold into metadata details + separate style path; also run fingerprint chat
  yield emit("style", "running", undefined, 35);
  const fp = await chatCompletion({
    endpoint,
    apiKey,
    model,
    content: FINGERPRINT_PROMPT,
    maxTokens: 24,
    timeoutMs,
  });
  totalLatency += fp.latencyMs;
  const pt = usagePromptTokens(fp.parsed);
  const band = fingerprintBandForFamily(family);
  let fpStatus: DimensionStatus = "weak";
  let fpSummary = "无法读取 prompt_tokens，指纹弱信号";
  if (pt != null) {
    if (pt >= band.promptTokensMin && pt <= band.promptTokensMax) {
      fpStatus = "pass";
      fpSummary = `Tokenizer 粗指纹：prompt_tokens=${pt}，落在区间 [${band.promptTokensMin},${band.promptTokensMax}]`;
    } else {
      fpStatus = "weak";
      fpSummary = `Tokenizer 粗指纹偏离：prompt_tokens=${pt}，期望约 [${band.promptTokensMin},${band.promptTokensMax}]（中转改计数时常见，仅作弱信号）`;
    }
  }

  // style question
  const styleQ = suite.style;
  let styleStatus: DimensionStatus = fpStatus;
  let styleSummary = fpSummary;
  const styleDetails: Record<string, unknown> = {
    fingerprintPromptTokens: pt,
    fingerprintHttp: fp.httpStatus,
    fingerprintBand: band,
    styleQuestionId: styleQ.id,
  };
  if (fp.httpStatus >= 200 && fp.httpStatus < 300) {
    const styleRes = await chatCompletion({
      endpoint,
      apiKey,
      model,
      content: styleQ.prompt,
      maxTokens: styleQ.maxTokens,
      timeoutMs,
    });
    totalLatency += styleRes.latencyMs;
    const st = scoreAnswer(styleQ, styleRes.contentOut, family);
    styleDetails.styleAnswer = styleRes.contentOut.slice(0, 200);
    styleDetails.styleScore = st;
    if (st === "fail" && fpStatus === "fail") styleStatus = "fail";
    else if (st === "fail" || fpStatus === "weak") styleStatus = "weak";
    else if (st === "pass" && fpStatus === "pass") styleStatus = "pass";
    else styleStatus = st === "pass" ? "pass" : "weak";
    styleSummary = `${fpSummary}；风格题：${st === "pass" ? "按要求输出标记" : st === "weak" ? "有回复但标记不全" : "未按约定输出"}`;
  }
  const styleDim: ProbeDimension = {
    id: "style",
    status: styleStatus,
    title: STEP_META.style.title,
    summary: styleSummary,
    details: styleDetails,
  };
  dimensions.push(styleDim);
  yield emit("style", "done", styleDim, 48);

  // —— 4 cutoff（标准/深测都跑；深测题池更大） ——
  yield emit("cutoff", "running", undefined, 52);
  const cq = suite.cutoff;
  const cutoffRes = await chatCompletion({
    endpoint,
    apiKey,
    model,
    content: cq.prompt,
    maxTokens: cq.maxTokens,
    timeoutMs,
  });
  totalLatency += cutoffRes.latencyMs;
  const cutoffSt = scoreAnswer(cq, cutoffRes.contentOut, family);
  const cutoffDim: ProbeDimension = {
    id: "cutoff",
    status: cutoffSt,
    title: STEP_META.cutoff.title,
    summary:
      cutoffSt === "pass"
        ? `cutoff 抽检通过（${cq.id}：${cutoffRes.contentOut.slice(0, 40)}）`
        : `cutoff 抽检${cutoffSt === "weak" ? "偏弱" : "未通过"}（${cq.id}：${cutoffRes.contentOut.slice(0, 40)}）`,
    details: {
      questionId: cq.id,
      answer: cutoffRes.contentOut.slice(0, 120),
      mode,
    },
  };
  dimensions.push(cutoffDim);
  yield emit("cutoff", "done", cutoffDim, 60);

  // —— 5 capability (identity + calc pool) ——
  yield emit("capability", "running", undefined, 65);
  const runQs = [suite.identity, ...suite.calcs];
  const capResults: Array<{ id: string; status: string; answer: string }> = [];
  let capFail = 0;
  let capPass = 0;
  let capWeak = 0;
  for (const q of runQs) {
    const r = await chatCompletion({
      endpoint,
      apiKey,
      model,
      content: q.prompt,
      maxTokens: q.maxTokens,
      timeoutMs,
    });
    totalLatency += r.latencyMs;
    const st = scoreAnswer(q, r.contentOut, family);
    capResults.push({ id: q.id, status: st, answer: r.contentOut.slice(0, 80) });
    if (st === "pass") capPass++;
    else if (st === "weak") capWeak++;
    else capFail++;
  }
  let capStatus: DimensionStatus = "pass";
  if (capFail > 0 && capPass === 0) capStatus = "fail";
  else if (capFail > 0 || capWeak > 0) capStatus = "weak";
  const capabilityDim: ProbeDimension = {
    id: "capability",
    status: runQs.length ? capStatus : "skip",
    title: STEP_META.capability.title,
    summary: runQs.length
      ? `动态题 ${capPass} 通过 / ${capWeak} 偏弱 / ${capFail} 失败（共 ${runQs.length}）`
      : "无题目",
    details: { results: capResults, suiteIds: suite.all.map((q) => q.id) },
  };
  dimensions.push(capabilityDim);
  yield emit("capability", "done", capabilityDim, 78);

  // —— 6 cache (deep + claude family preferred) ——
  yield emit("cache", "running", undefined, 82);
  let cacheDim: ProbeDimension;
  if (mode !== "deep") {
    cacheDim = {
      id: "cache",
      status: "skip",
      title: STEP_META.cache.title,
      summary: "标准档跳过；请开「深测」启用同前缀缓存探测",
    };
  } else {
    const prefix =
      "CACHE_PREFIX_V1 " +
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(40);
    const r1 = await chatCompletion({
      endpoint,
      apiKey,
      model,
      content: prefix + "\nQ1: reply with C1",
      maxTokens: 8,
      timeoutMs: Math.min(60_000, timeoutMs + 10_000),
    });
    const r2 = await chatCompletion({
      endpoint,
      apiKey,
      model,
      content: prefix + "\nQ2: reply with C2",
      maxTokens: 8,
      timeoutMs: Math.min(60_000, timeoutMs + 10_000),
    });
    totalLatency += r1.latencyMs + r2.latencyMs;
    const c1 = extractCacheTokens(r1.parsed);
    const c2 = extractCacheTokens(r2.parsed);
    let st: DimensionStatus = "weak";
    let summary = "未观察到 cache_* token 字段（中转常吞掉缓存元数据）";
    if ((c2.cacheRead ?? 0) > 0 || (c1.cacheCreation ?? 0) > 0) {
      st = "pass";
      summary = `见到缓存相关 usage（read=${c2.cacheRead ?? 0}, create=${c1.cacheCreation ?? 0}）`;
    } else if (family === "claude" && r1.httpStatus < 300 && r2.httpStatus < 300) {
      st = "weak";
      summary =
        "Claude 深测未返回官方 cache 字段：可能未启用 prompt cache，或中转抹平 usage";
    } else if (r1.httpStatus >= 300 || r2.httpStatus >= 300) {
      st = "fail";
      summary = `缓存探测请求失败 HTTP ${r1.httpStatus}/${r2.httpStatus}`;
    }
    cacheDim = {
      id: "cache",
      status: st,
      title: STEP_META.cache.title,
      summary,
      details: { first: c1, second: c2, latencyMs: [r1.latencyMs, r2.latencyMs] },
    };
  }
  dimensions.push(cacheDim);
  yield emit("cache", "done", cacheDim, 90);

  // —— 7 client compat (lightweight) ——
  yield emit("client", "running", undefined, 92);
  const clientDim = await runClientCompatProbe({
    baseUrl: input.baseUrl,
    apiKey,
    model,
    timeoutMs,
  });
  dimensions.push(clientDim);
  yield emit("client", "done", clientDim, 95);

  // —— 8 summary ——
  yield emit("summary", "running", undefined, 97);
  return finalize(
    mode,
    model,
    endpoint,
    dimensions,
    lastHttp,
    Date.now() - t0,
    returnedModel,
    rawPreview,
    suiteSeed,
    suite.all.map((q) => q.id),
    "relay",
  );
}

function skipRemaining(
  ids: ProbeStepId[],
  reason: string,
): ProbeDimension[] {
  return ids.map((id) => ({
    id,
    status: "skip" as const,
    title: STEP_META[id].title,
    summary: reason,
  }));
}

function finalize(
  mode: "standard" | "deep",
  model: string,
  endpoint: string,
  dimensions: ProbeDimension[],
  httpStatus: number | null,
  latencyMs: number,
  returnedModel: string | null,
  rawPreview: string | null,
  suiteSeed: number,
  suiteIds: string[],
  channel: "official" | "relay" = "relay",
): ProbeReport {
  const { score, scored } = computeScore(dimensions);
  const { overall, message } = synthesizeOverallA(dimensions, score, {
    channel,
  });
  const summaryDim: ProbeDimension = {
    id: "summary",
    status:
      overall === "likely_genuine"
        ? "pass"
        : overall === "likely_fake" || overall === "unreachable"
          ? "fail"
          : overall === "suspicious"
            ? "weak"
            : "weak",
    title: STEP_META.summary.title,
    summary: message,
    details: { score, scored, overall, suiteSeed, suiteIds, channel },
  };
  const dims = [...dimensions.filter((d) => d.id !== "summary"), summaryDim];
  return {
    probeVersion: PROBE_VERSION_A,
    mode,
    overall,
    message,
    result: overallToLegacy(overall),
    score,
    suiteSeed,
    suiteIds,
    scored,
    httpStatus,
    latencyMs,
    requestedModel: model,
    returnedModel,
    endpoint,
    dimensions: dims,
    rawPreview,
  };
}

/** 非流式：跑完整编排 */
export async function runProbeAuthFull(
  input: ProbeRunInput,
): Promise<ProbeReport> {
  const gen = runProbeAuth(input);
  let last: IteratorResult<ProbeStepEvent, ProbeReport>;
  do {
    last = await gen.next();
  } while (!last.done);
  return last.value;
}
