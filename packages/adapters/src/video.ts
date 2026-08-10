/**
 * Async video generation adapters (OpenAI-style + Agnes + 智谱 BigModel).
 */

import {
  canonicalizeSeedanceModelId,
  canonicalizeWanModelId,
  resolveApiBaseUrl,
} from "@modeldesk/shared";
import { downloadBytes } from "./images";
import {
  defaultVideoPollTiming,
  isRateLimitBody,
  isRateLimitStatus,
  nextPollDelayMs,
  retryAfterMs,
  sleep,
} from "./poll";
import {
  extractUsageFromResponse,
  type TokenUsage,
} from "./usage";

export type VideoJobStatus =
  | "queued"
  | "running"
  | "downloading"
  | "succeeded"
  | "failed";

export type VideoGenOptions = {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  /**
   * Protocol dialect from model.defaults.api_format (e.g. video.zhipu-cogvideox).
   * Preferred over guessing from baseUrl — required for 中转站.
   */
  apiFormat?: string;
  /** Poll interval ms */
  pollIntervalMs?: number;
  /** Max wait ms */
  timeoutMs?: number;
  signal?: AbortSignal;
  onStatus?: (status: VideoJobStatus, detail?: string) => void;
  width?: number;
  height?: number;
  numFrames?: number;
  frameRate?: number;
  /** Explicit pixel size for providers that take `size` (e.g. 智谱). */
  size?: string;
  /** 智谱 CogVideoX：30 | 60；未设则用服务商默认。 */
  fps?: number;
  /** 智谱 CogVideoX-3 / 火山：时长秒。 */
  durationSec?: number;
  /** 火山等：画幅字符串。 */
  aspectRatio?: string;
  /** 火山方舟：分辨率档位（720p / 1080p 等）。 */
  resolution?: string;
  /** 火山 Wan / Seedance：是否加水印。 */
  watermark?: boolean;
  /** Seedance：是否固定镜头（--camerafixed）。 */
  cameraFixed?: boolean;
  /** 智谱等：是否生成音效 / 配乐（默认 true）。 */
  withAudio?: boolean;
  /**
   * 图生视频参考图：公网 URL 或 data URI / base64。
   * 智谱 → `image_url`；Agnes → `image`；火山 → content[].image_url。
   */
  referenceImage?: string;
  /** 智谱首尾帧：可选尾帧（与 referenceImage 组成 image_url 数组）。 */
  referenceImageEnd?: string;
  /** Fired once the outbound HTTP request body is ready (before submit). */
  onHttpLog?: (log: { url: string; body: Record<string, unknown> }) => void;
  /**
   * Custom HTTP mapping via model defaults:
   * { submitPath, pollPathTemplate with {{id}}, statusPath, urlPath }
   */
  http?: {
    submitPath?: string;
    pollPathTemplate?: string;
    statusPath?: string;
    urlPath?: string;
  };
};

export type VideoGenResult = {
  bytes: Buffer;
  mime: string;
  extension: string;
  remoteUrl?: string;
  latencyMs: number;
  taskId?: string;
  usage?: TokenUsage | null;
};

/** Tiny placeholder "video" file for mock demos (not a real MP4 decoder target). */
const MOCK_VIDEO = Buffer.from(
  "ModelDesk mock video placeholder\n",
  "utf8",
);

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export function isZhipuVideoBaseUrl(
  baseUrl: string | null | undefined,
): boolean {
  if (!baseUrl) return false;
  const u = baseUrl.toLowerCase();
  return (
    u.includes("bigmodel.cn") ||
    u.includes("bigmodel.com") ||
    u.includes("open.bigmodel")
  );
}

function getPath(obj: unknown, path: string): unknown {
  const parts = path.split(".").filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    if (Array.isArray(cur) && /^\d+$/.test(p)) {
      cur = cur[Number(p)];
      continue;
    }
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

export function isAgnesVideoBaseUrl(
  baseUrl: string | null | undefined,
): boolean {
  if (!baseUrl) return false;
  return baseUrl.toLowerCase().includes("agnes-ai.com");
}

export function isVolcengineArkBaseUrl(
  baseUrl: string | null | undefined,
): boolean {
  if (!baseUrl) return false;
  const u = baseUrl.toLowerCase();
  return (
    u.includes("volces.com") ||
    u.includes("volcengine.com") ||
    u.includes("ark.cn-beijing")
  );
}

function resolveWanEndpointModelId(model: string): string {
  return canonicalizeWanModelId(model);
}

function isWanVideoModel(model: string, apiFormat?: string): boolean {
  if ((apiFormat ?? "").toLowerCase() === "video.volcengine-wan") return true;
  const m = model.trim().toLowerCase();
  if (m === "t2v" || m === "i2v") return true;
  return /wan2|wan-2|wan2\.1|wan-ai/i.test(model);
}

/** Legacy short aliases → official dated Ark model id（完整 ID 原样返回）。 */
function resolveSeedanceEndpointModelId(model: string): string {
  return canonicalizeSeedanceModelId(model);
}

/** Seedance 1.0 / pro-fast / lite：官方示例把参数拼进 text。 */
function isSeedanceV1TextFlagModel(model: string): boolean {
  const resolved = resolveSeedanceEndpointModelId(model);
  return /seedance-1-0|seedance-1\.0|seedance_1_0|seedance-lite/i.test(
    resolved,
  );
}

/** Seedance 2.0 / 2.5：结构化参数；不支持 camera_fixed。 */
function isSeedanceV2Model(model: string): boolean {
  const m = model.trim().toLowerCase();
  if (m === "2" || m === "2.0" || m === "2.5") return true;
  const resolved = resolveSeedanceEndpointModelId(model);
  return /seedance-2|seedance_2|seedance-2\.0|seedance-2\.5/i.test(resolved);
}

function isSeedance25Model(model: string): boolean {
  const m = model.trim().toLowerCase();
  if (m === "2.5") return true;
  const resolved = resolveSeedanceEndpointModelId(model);
  return /seedance-2-5|seedance-2\.5|seedance_2_5/i.test(resolved);
}

function resolveSeedanceDuration(
  durationSec?: number,
  model?: string,
): number {
  if (durationSec == null) return 5;
  // -1：官方允许由模型自动选时长
  if (durationSec < 0) return -1;
  const d = Math.floor(durationSec);
  const max = model && isSeedance25Model(model) ? 30 : 15;
  return Math.min(max, Math.max(4, d));
}

function boolFlag(value: boolean | undefined, fallback = false): string {
  if (value === true) return "true";
  if (value === false) return "false";
  return fallback ? "true" : "false";
}

/**
 * 火山方舟内容生成任务：Seedance / Wan 共用
 * POST /contents/generations/tasks · GET /contents/generations/tasks/{id}
 *
 * - Seedance 1.0 / pro-fast：参数拼进 text（--resolution/--duration/--camerafixed/--watermark）
 * - Seedance 1.5+ / 2.0 / 2.5：顶层 duration/resolution/ratio/camera_fixed/watermark/generate_audio
 * - Wan：--resolution/--duration/--watermark 拼进 text
 */
function buildVolcengineArkSubmitBody(options: {
  model: string;
  prompt: string;
  apiFormat?: string;
  durationSec?: number;
  aspectRatio?: string;
  resolution?: string;
  watermark?: boolean;
  cameraFixed?: boolean;
  withAudio?: boolean;
  referenceImage?: string;
  referenceImageEnd?: string;
}): Record<string, unknown> {
  const wan = isWanVideoModel(options.model, options.apiFormat);
  const duration = resolveSeedanceDuration(
    options.durationSec,
    options.model,
  );
  let resolution = (options.resolution ?? "720p").trim() || "720p";
  // Docs: 2.5 / 2.0-fast / 2.0-mini → 480p|720p only; clamp if UI sent a wider tier.
  if (
    !wan &&
    (isSeedance25Model(options.model) ||
      /seedance-2-0-(fast|mini)|seedance-2\.0-(fast|mini)/i.test(
        resolveSeedanceEndpointModelId(options.model),
      ))
  ) {
    const allowed = new Set(["480p", "720p"]);
    if (!allowed.has(resolution.toLowerCase())) {
      resolution = "720p";
    }
  }
  const seedanceV1 = !wan && isSeedanceV1TextFlagModel(options.model);
  const promptText = options.prompt.trim();

  // Wan 或 Seedance 1.0：参数写入 text
  if (wan || seedanceV1) {
    const flags: string[] = [
      `--resolution ${resolution}`,
      `--duration ${duration < 0 ? 5 : duration}`,
    ];
    if (seedanceV1) {
      if (options.aspectRatio && options.aspectRatio !== "adaptive") {
        flags.push(`--ratio ${options.aspectRatio}`);
      }
      flags.push(`--camerafixed ${boolFlag(options.cameraFixed, false)}`);
    }
      flags.push(`--watermark false`);

    const text = `${promptText}  ${flags.join(" ")}`.trim();
    const content: Record<string, unknown>[] = [{ type: "text", text }];
    if (options.referenceImage) {
      // 1.0 / Wan 官方 i2v curl：image_url 不带 role
      content.push({
        type: "image_url",
        image_url: { url: options.referenceImage },
      });
    }
    // Seedance 1.0 一般不支持尾帧；若传了仍附上
    if (options.referenceImageEnd) {
      content.push({
        type: "image_url",
        image_url: { url: options.referenceImageEnd },
        role: "last_frame",
      });
    }
    return { model: options.model, content };
  }

  // Seedance 1.5+ / 2.0：纯 prompt + 顶层结构化参数
  const content: Record<string, unknown>[] = [
    { type: "text", text: promptText },
  ];
  if (options.referenceImage) {
    content.push({
      type: "image_url",
      image_url: { url: options.referenceImage },
      role: "first_frame",
    });
  }
  if (options.referenceImageEnd) {
    content.push({
      type: "image_url",
      image_url: { url: options.referenceImageEnd },
      role: "last_frame",
    });
  }

  const body: Record<string, unknown> = {
    model: options.model,
    content,
    duration,
    resolution,
    ratio: options.aspectRatio ?? "adaptive",
    watermark: false,
  };

  // Seedance 2.0 暂不支持 camera_fixed
  if (!isSeedanceV2Model(options.model)) {
    body.camera_fixed = options.cameraFixed === true;
  }

  // generate_audio：1.5-pro / 2.0 支持；显式传 true/false
  if (options.withAudio === true || options.withAudio === false) {
    body.generate_audio = options.withAudio;
  }

  return body;
}

/** Map UI width/height → 智谱 size enum（按模型取候选；优先同画幅）。 */
export function zhipuSizeFromDimensions(
  width?: number,
  height?: number,
  model?: string,
): string {
  const candidates = zhipuSizeCandidates(model);
  const fallback = candidates.includes("1920x1080")
    ? "1920x1080"
    : (candidates[0] ?? "1920x1080");
  if (!width || !height) return fallback;

  const targetAspect = width / height;
  let best = fallback;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    const [w, h] = c.split("x").map(Number) as [number, number];
    const aspectPenalty =
      Math.abs(Math.log((w / h) / targetAspect)) * 2000;
    const sizePenalty = Math.abs(w - width) + Math.abs(h - height);
    const score = aspectPenalty + sizePenalty;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

function zhipuSizeCandidates(model?: string): readonly string[] {
  if (isCogVideoX3(model ?? "")) {
    return [
      "1280x720",
      "720x1280",
      "1024x1024",
      "1920x1080",
      "1080x1920",
      "2048x1080",
      "3840x2160",
    ];
  }
  // cogvideox-flash / cogvideox-2
  return [
    "720x480",
    "1024x1024",
    "1280x960",
    "960x1280",
    "1920x1080",
    "1080x1920",
    "2048x1080",
    "3840x2160",
  ];
}

function resolveZhipuSize(
  model: string,
  size?: string,
  width?: number,
  height?: number,
): string {
  const candidates = zhipuSizeCandidates(model);
  if (size && candidates.includes(size)) return size;
  if (size) {
    const m = /^(\d+)x(\d+)$/i.exec(size);
    if (m) {
      return zhipuSizeFromDimensions(Number(m[1]), Number(m[2]), model);
    }
  }
  return zhipuSizeFromDimensions(width, height, model);
}

function agnesApiOrigin(baseUrl: string): string {
  // Preset base is …/v1；推荐轮询在 /agnesapi（与 /v1 同级）。
  return normalizeBaseUrl(baseUrl).replace(/\/v1$/i, "");
}

function isCogVideoX3(model: string): boolean {
  return /cogvideox-3/i.test(model);
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function isDataUriOrRawBase64(value: string): boolean {
  const v = value.trim();
  if (v.startsWith("data:")) return true;
  // Long non-URL strings are treated as raw base64 payloads.
  return !isHttpUrl(v) && v.length >= 64 && !/\s/.test(v);
}

function redactUrlValue(v: string): string {
  return v.startsWith("data:") || v.length > 120
    ? `[omitted ${v.length} chars]`
    : v;
}

/** Redact bulky base64/data-URI fields in HTTP logs. */
function redactImageFieldsForLog(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body };
  for (const key of ["image", "image_url"] as const) {
    const v = out[key];
    if (typeof v === "string") {
      out[key] = redactUrlValue(v);
    } else if (Array.isArray(v)) {
      out[key] = v.map((item) =>
        typeof item === "string" ? redactUrlValue(item) : item,
      );
    }
  }
  // 火山方舟 content[].image_url.url
  if (Array.isArray(out.content)) {
    out.content = out.content.map((item) => {
      if (!item || typeof item !== "object") return item;
      const c = { ...(item as Record<string, unknown>) };
      const imageUrl = c.image_url;
      if (imageUrl && typeof imageUrl === "object" && !Array.isArray(imageUrl)) {
        const iu = { ...(imageUrl as Record<string, unknown>) };
        if (typeof iu.url === "string") iu.url = redactUrlValue(iu.url);
        c.image_url = iu;
      }
      return c;
    });
  }
  return out;
}

function normalizeReferenceImage(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  return value.trim();
}

export async function generateVideo(
  options: VideoGenOptions,
): Promise<VideoGenResult> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? 600_000; // 视频默认 10 分钟
  const signal =
    options.signal ??
    (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(timeoutMs)
      : undefined);

  if (options.baseUrl.startsWith("mock://")) {
    options.onHttpLog?.({
      url: "mock://video/videos/generations",
      body: {
        model: options.model,
        prompt: options.prompt,
        ...(options.withAudio !== false ? { with_audio: true } : {}),
      },
    });
    options.onStatus?.("queued");
    await sleep(120, signal);
    options.onStatus?.("running");
    await sleep(180, signal);
    options.onStatus?.("downloading");
    await sleep(80, signal);
    options.onStatus?.("succeeded");
    return {
      bytes: MOCK_VIDEO,
      mime: "video/mp4",
      extension: "mp4",
      remoteUrl: "mock://video",
      latencyMs: Date.now() - started,
      taskId: "mock-video-task",
      usage: {
        promptTokens: 16,
        completionTokens: 64,
        totalTokens: 80,
      },
    };
  }

  const baseUrl = normalizeBaseUrl(
    resolveApiBaseUrl(options.baseUrl, options.apiFormat ?? ""),
  );
  const format = (options.apiFormat ?? "").toLowerCase();
  // Prefer explicit API 格式；baseUrl 猜测仅作旧数据回退。
  const agnes =
    format === "video.agnes" ||
    (!format && isAgnesVideoBaseUrl(baseUrl));
  const zhipu =
    format === "video.zhipu-cogvideox" ||
    (!format && isZhipuVideoBaseUrl(baseUrl));
  const volcengine =
    format === "video.volcengine-seedance" ||
    format === "video.volcengine-wan" ||
    (!format && isVolcengineArkBaseUrl(baseUrl));
  const openaiVideos = format === "video.openai-videos";
  const openaiGenerations = format === "video.openai-generations";

  const submitPath =
    options.http?.submitPath ??
    (volcengine
      ? "/contents/generations/tasks"
      : agnes || openaiVideos
        ? "/videos"
        : "/videos/generations");
  const statusPath =
    options.http?.statusPath ?? (zhipu ? "task_status" : "status");
  const urlPath =
    options.http?.urlPath ??
    (volcengine
      ? "content.video_url"
      : zhipu
        ? "video_result.0.url"
        : agnes
          ? "metadata.url"
          : openaiVideos
            ? "url"
            : "output.url");

  options.onStatus?.("queued");
  const referenceImage = normalizeReferenceImage(options.referenceImage);
  const referenceImageEnd = normalizeReferenceImage(options.referenceImageEnd);

  let submitBody: Record<string, unknown>;
  if (volcengine) {
    if (
      referenceImage &&
      isVolcengineArkBaseUrl(baseUrl) &&
      isDataUriOrRawBase64(referenceImage)
    ) {
      throw new Error(
        "火山方舟图生视频要求公网可访问的图片 URL（content.image_url），本地 base64 无法被方舟拉取。请开启 TOS 上传，或粘贴公网 URL。",
      );
    }
    if (
      referenceImageEnd &&
      isVolcengineArkBaseUrl(baseUrl) &&
      isDataUriOrRawBase64(referenceImageEnd)
    ) {
      throw new Error(
        "火山方舟尾帧图要求公网可访问的图片 URL。请开启 TOS 上传，或粘贴公网 URL。",
      );
    }
    const fmt = (options.apiFormat ?? "").toLowerCase();
    const seedance =
      fmt === "video.volcengine-seedance" ||
      /seedance/i.test(options.model) ||
      /^(1\.5|2|2\.0|2\.5)$/.test(options.model.trim());
    const wan =
      fmt === "video.volcengine-wan" ||
      isWanVideoModel(options.model, options.apiFormat);
    const endpointModel = seedance
      ? resolveSeedanceEndpointModelId(options.model)
      : wan
        ? resolveWanEndpointModelId(options.model)
        : options.model;
    submitBody = buildVolcengineArkSubmitBody({
      model: endpointModel,
      prompt: options.prompt,
      apiFormat: options.apiFormat,
      durationSec: options.durationSec,
      aspectRatio: options.aspectRatio,
      resolution: options.resolution,
      watermark: false,
      cameraFixed: options.cameraFixed,
      withAudio: options.withAudio,
      referenceImage,
      referenceImageEnd,
    });
  } else {
    submitBody = {
      model: options.model,
      prompt: options.prompt,
    };

    if (zhipu) {
      const size = resolveZhipuSize(
        options.model,
        options.size,
        options.width,
        options.height,
      );
      submitBody.size = size;
      const fps =
        options.fps === 60 || options.fps === 30
          ? options.fps
          : options.frameRate === 60 || options.frameRate === 30
            ? options.frameRate
            : undefined;
      if (fps != null) submitBody.fps = fps;
      if (isCogVideoX3(options.model)) {
        const d = options.durationSec ?? 5;
        submitBody.duration = d >= 10 ? 10 : 5;
      }
      submitBody.with_audio = options.withAudio !== false;
      // Docs: image_url 支持 URL 或 Base64；首尾帧传两张图的数组。
      if (referenceImage) {
        submitBody.image_url = referenceImageEnd
          ? [referenceImage, referenceImageEnd]
          : referenceImage;
      }
    } else if (agnes) {
      Object.assign(submitBody, {
        width: options.width ?? 1152,
        height: options.height ?? 768,
        num_frames: options.numFrames ?? 121,
        frame_rate: options.frameRate ?? 24,
      });
      // Official docs: `image` must be a publicly accessible URL.
      // Local base64/data URI cannot be fetched by Agnes cloud — fail fast on official host.
      if (referenceImage) {
        const officialHost = isAgnesVideoBaseUrl(baseUrl);
        if (officialHost && isDataUriOrRawBase64(referenceImage)) {
          throw new Error(
            "Agnes 官方图生视频要求公网可访问的图片 URL（字段 image），本地上传的 base64 无法被官方拉取。请粘贴公网 URL，或改用支持 base64 的中转站。",
          );
        }
        submitBody.image = referenceImage;
      }
    } else if (openaiVideos) {
      const d = options.durationSec ?? 5;
      submitBody.seconds = String(d >= 10 ? 10 : 5);
      if (options.aspectRatio) submitBody.aspect_ratio = options.aspectRatio;
    } else if (openaiGenerations) {
      if (options.width != null) submitBody.width = options.width;
      if (options.height != null) submitBody.height = options.height;
      if (options.numFrames != null) submitBody.num_frames = options.numFrames;
      if (options.frameRate != null) submitBody.frame_rate = options.frameRate;
      if (options.durationSec != null) submitBody.duration = options.durationSec;
    } else if (
      options.width != null ||
      options.height != null ||
      options.numFrames != null
    ) {
      if (options.width != null) submitBody.width = options.width;
      if (options.height != null) submitBody.height = options.height;
      if (options.numFrames != null) submitBody.num_frames = options.numFrames;
      if (options.frameRate != null) submitBody.frame_rate = options.frameRate;
    }
  }

  const httpLog = {
    url: `${baseUrl}${submitPath}`,
    body: redactImageFieldsForLog({ ...submitBody }),
  };
  options.onHttpLog?.(httpLog);

  const submitRes = await fetch(`${baseUrl}${submitPath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(submitBody),
    signal,
  });

  const submitText = await submitRes.text();
  let submitJson: unknown = null;
  try {
    submitJson = submitText ? JSON.parse(submitText) : null;
  } catch {
    submitJson = null;
  }
  if (!submitRes.ok) {
    if (submitRes.status === 429) {
      throw new Error(
        `视频接口繁忙（429）：${submitText.slice(0, 200) || "请稍后再试"}`,
      );
    }
    throw new Error(
      `Video submit failed (${submitRes.status}): ${submitText.slice(0, 300)}`,
    );
  }

  const taskId = String(
    getPath(submitJson, "id") ??
      getPath(submitJson, "task_id") ??
      getPath(submitJson, "data.id") ??
      "",
  );
  const videoId = String(
    getPath(submitJson, "video_id") ?? taskId,
  );
  const pollId = agnes ? videoId || taskId : taskId || videoId;
  if (!pollId) {
    throw new Error("Video submit response missing task id");
  }

  let usage =
    extractUsageFromResponse(submitJson) ??
    null;

  // 官方 Agnes 用 /agnesapi?video_id=；中转站通常只透传 /v1/videos/{id}
  const agnesOfficialHost = agnes && isAgnesVideoBaseUrl(baseUrl);

  const timing = defaultVideoPollTiming({
    apiFormat: options.apiFormat,
    agnes,
    zhipu,
  });
  let pollIntervalMs = options.pollIntervalMs ?? timing.intervalMs;
  const maxPollIntervalMs = Math.max(pollIntervalMs, timing.maxIntervalMs);

  options.onStatus?.("running", pollId);
  const deadline = Date.now() + timeoutMs;
  let remoteUrl: string | undefined;
  const pollTemplate =
    options.http?.pollPathTemplate ??
    (volcengine
      ? "/contents/generations/tasks/{{id}}"
      : zhipu
        ? "/async-result/{{id}}"
        : agnes || openaiVideos
          ? "/videos/{{id}}"
          : "/videos/generations/{{id}}");

  // Avoid hammering status APIs right after submit (Agnes rate-limits queries).
  if (timing.initialDelayMs > 0) {
    await sleep(timing.initialDelayMs, signal);
  }

  while (Date.now() < deadline) {
    let pollUrl: string;
    if (agnesOfficialHost && !options.http?.pollPathTemplate) {
      const origin = agnesApiOrigin(baseUrl);
      pollUrl = `${origin}/agnesapi?video_id=${encodeURIComponent(pollId)}&model_name=${encodeURIComponent(options.model)}`;
    } else {
      const pollPath = pollTemplate.replace(
        "{{id}}",
        encodeURIComponent(pollId),
      );
      pollUrl = `${baseUrl}${pollPath}`;
    }

    const pollRes = await fetch(pollUrl, {
      headers: { Authorization: `Bearer ${options.apiKey}` },
      signal,
    });
    const pollText = await pollRes.text();
    let pollJson: unknown = null;
    try {
      pollJson = pollText ? JSON.parse(pollText) : null;
    } catch {
      pollJson = null;
    }

    if (
      !pollRes.ok &&
      (isRateLimitStatus(pollRes.status) || isRateLimitBody(pollText))
    ) {
      pollIntervalMs = nextPollDelayMs({
        currentMs: pollIntervalMs,
        baseMs: timing.intervalMs,
        maxMs: maxPollIntervalMs,
        retryAfterHeaderMs: retryAfterMs(pollRes),
      });
      options.onStatus?.(
        "running",
        `查询限流（${pollRes.status}），${Math.round(pollIntervalMs / 1000)}s 后重试`,
      );
      await sleep(pollIntervalMs, signal);
      continue;
    }

    if (!pollRes.ok) {
      throw new Error(
        `Video poll failed (${pollRes.status}): ${pollText.slice(0, 300)}`,
      );
    }

    const status = String(getPath(pollJson, statusPath) ?? "").toLowerCase();
    // Agnes: queued | in_progress | completed | failed
    if (status === "in_progress" || status === "processing") {
      options.onStatus?.("running", status);
    }
    if (
      status === "succeeded" ||
      status === "completed" ||
      status === "done" ||
      status === "success"
    ) {
      remoteUrl = String(getPath(pollJson, urlPath) ?? "");
      if (!remoteUrl && zhipu) {
        const list = getPath(pollJson, "video_result");
        if (Array.isArray(list) && list[0] && typeof list[0] === "object") {
          const u = (list[0] as { url?: string }).url;
          if (u) remoteUrl = u;
        }
      }
      // Soft-success without URL yet: keep polling (some relays lag metadata.url).
      if (!remoteUrl) {
        await sleep(pollIntervalMs, signal);
        continue;
      }
      usage = extractUsageFromResponse(pollJson) ?? usage;
      break;
    }
    if (
      status === "failed" ||
      status === "error" ||
      status === "fail" ||
      status === "cancelled" ||
      status === "canceled"
    ) {
      const failDetail = String(
        getPath(pollJson, "error.message") ??
          getPath(pollJson, "message") ??
          pollText.slice(0, 200),
      );
      throw new Error(
        `Video task failed: ${status}${failDetail ? ` — ${failDetail}` : ""}`,
      );
    }

    // Healthy tick: gently decay backoff toward the base interval.
    pollIntervalMs = Math.max(
      timing.intervalMs,
      Math.floor(pollIntervalMs * 0.9),
    );
    await sleep(pollIntervalMs, signal);
  }

  if (!remoteUrl) {
    throw new Error("Video task timed out waiting for output URL");
  }

  options.onStatus?.("downloading", remoteUrl);
  const downloaded = await downloadBytes(remoteUrl, signal);
  options.onStatus?.("succeeded");

  return {
    bytes: downloaded.bytes,
    mime: downloaded.mime.includes("video")
      ? downloaded.mime
      : "video/mp4",
    extension: "mp4",
    remoteUrl,
    latencyMs: Date.now() - started,
    taskId: pollId,
    usage,
  };
}
