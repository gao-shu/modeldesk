/**
 * Async video generation adapters (OpenAI-style + Agnes + 智谱 BigModel).
 */

import {
  canonicalizeSeedanceModelId,
  canonicalizeWanModelId,
  resolveApiActionUrl,
  resolveApiBaseUrl,
  VIDEO_WAIT_TIMEOUT_MS,
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
import {
  generateKlingVideo,
  generateMinimaxHailuoVideo,
  generateViduVideo,
} from "./video-cn";

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
  /** From model.defaults.base_url_mode — advanced = submit URL as-is. */
  baseUrlMode?: "simple" | "advanced";
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
   * 生成模式：可灵 std/pro；Agnes 2.5 Flash 为 text / keyframe / reference。
   */
  mode?: string;
  /**
   * 图生视频参考图：公网 URL 或 data URI / base64。
   * 智谱 → `image_url`；Agnes → `image`；火山 → content[].image_url。
   */
  referenceImage?: string;
  /** 智谱首尾帧：可选尾帧（与 referenceImage 组成 image_url 数组）。 */
  referenceImageEnd?: string;
  /**
   * 多参考图（与首尾帧 / 单张 I2V 互斥）：
   * Seedance → content[] role=reference_image；
   * Grok R2V → reference_images: [{ url }]。
   */
  referenceImages?: string[];
  /**
   * Seedance 2.x 多模态参考音频（公网 URL）：
   * content[] type=audio_url role=reference_audio；须同时有图或视频参考。
   */
  referenceAudios?: string[];
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

/** Agnes Video 2.5 Flash（mode / seconds / size=720P），与 v2.0 帧数协议不同。 */
export function isAgnesVideo25Flash(
  model: string,
  apiFormat?: string | null,
): boolean {
  const f = (apiFormat ?? "").toLowerCase();
  if (f === "video.agnes-25-flash") return true;
  return /agnes-video-2\.5-flash/i.test(model);
}

type Agnes25Mode = "text" | "keyframe" | "reference";

const AGNES_25_FLASH_SIZE = "720P" as const;

/** Flash 官方 size 仅 720P；兼容 Gateway 传入的 size / 小写 720p。 */
export function normalizeAgnes25FlashSize(
  resolution?: string | null,
  size?: string | null,
): typeof AGNES_25_FLASH_SIZE {
  const raw = (size ?? resolution ?? AGNES_25_FLASH_SIZE).trim();
  if (!raw) return AGNES_25_FLASH_SIZE;
  if (raw.toUpperCase() === AGNES_25_FLASH_SIZE) return AGNES_25_FLASH_SIZE;
  if (/^720\s*p?$/i.test(raw)) return AGNES_25_FLASH_SIZE;
  throw new Error(
    `Agnes Video 2.5 Flash 仅支持 size="720P"（当前为 ${JSON.stringify(raw)}）`,
  );
}

/** 由参考输入槽位推断官方 mode（UI 不再单独选生成模式）。 */
function resolveAgnes25ModeFromRefs(
  hasFirst: boolean,
  hasLast: boolean,
  imageCount: number,
  audioCount: number,
): Agnes25Mode {
  const hasMedia = hasFirst || hasLast || imageCount > 0 || audioCount > 0;
  if (!hasMedia) return "text";
  if (imageCount > 0 || audioCount > 0) return "reference";
  return "keyframe";
}

/** 单张首帧误放在 reference 模式 / 多参列表误放在 keyframe 时归一化。 */
function normalizeAgnes25FlashRefs(opts: {
  mode: Agnes25Mode;
  referenceImage?: string;
  referenceImageEnd?: string;
  referenceImages: string[];
  referenceAudios: string[];
}): {
  mode: Agnes25Mode;
  referenceImage?: string;
  referenceImageEnd?: string;
  referenceImages: string[];
  referenceAudios: string[];
} {
  let mode = opts.mode;
  let referenceImage = opts.referenceImage;
  let referenceImageEnd = opts.referenceImageEnd;
  let referenceImages = [...opts.referenceImages];
  const referenceAudios = [...opts.referenceAudios];

  if (
    mode === "reference" &&
    referenceImage &&
    referenceImages.length === 0 &&
    !referenceImageEnd
  ) {
    referenceImages = [referenceImage];
    referenceImage = undefined;
  }

  if (
    mode === "reference" &&
    (referenceImage || referenceImageEnd) &&
    referenceImages.length > 0
  ) {
    throw new Error(
      "Agnes 2.5 Flash mode=reference 不能同时使用首/尾帧与多参 images；请只选一种参考方式。",
    );
  }

  if (
    mode === "keyframe" &&
    !referenceImage &&
    !referenceImageEnd &&
    referenceImages.length === 1
  ) {
    referenceImage = referenceImages[0];
    referenceImages = [];
  }

  if (
    mode === "keyframe" &&
    referenceImages.length > 0 &&
    (referenceImage || referenceImageEnd)
  ) {
    throw new Error(
      "Agnes 2.5 Flash mode=keyframe 不能同时用首/尾帧与多参 images；请只选一种。",
    );
  }

  // 显式 reference 但只有首/尾帧 → 按 keyframe 发官方字段
  if (
    mode === "reference" &&
    (referenceImage || referenceImageEnd) &&
    referenceImages.length === 0 &&
    referenceAudios.length === 0
  ) {
    mode = "keyframe";
  }

  return {
    mode,
    referenceImage,
    referenceImageEnd,
    referenceImages,
    referenceAudios,
  };
}

function assertAgnesPublicUrl(
  label: string,
  value: string,
  officialHost: boolean,
): void {
  if (officialHost && isDataUriOrRawBase64(value)) {
    throw new Error(
      `Agnes 官方 ${label} 要求公网可访问 URL，本地 base64 / data URI 无法被拉取。请开启对象存储或粘贴公网 URL。`,
    );
  }
}

/**
 * Build POST /v1/videos body for Agnes Video 2.5 Flash.
 * @see https://agnes-ai.com/zh-Hans/docs/agnes-video-25-flash
 */
export function buildAgnes25FlashSubmitBody(opts: {
  model: string;
  prompt: string;
  mode?: string;
  durationSec?: number;
  aspectRatio?: string;
  resolution?: string;
  size?: string;
  referenceImage?: string;
  referenceImageEnd?: string;
  referenceImages: string[];
  referenceAudios: string[];
  officialHost: boolean;
}): Record<string, unknown> {
  const images = opts.referenceImages.slice(0, 5);
  const audios = opts.referenceAudios.slice(0, 3);
  const hasFirst = Boolean(opts.referenceImage);
  const hasLast = Boolean(opts.referenceImageEnd);
  let mode = resolveAgnes25ModeFromRefs(
    hasFirst,
    hasLast,
    images.length,
    audios.length,
  );

  const normalized = normalizeAgnes25FlashRefs({
    mode,
    referenceImage: opts.referenceImage,
    referenceImageEnd: opts.referenceImageEnd,
    referenceImages: images,
    referenceAudios: audios,
  });
  mode = normalized.mode;
  const referenceImage = normalized.referenceImage;
  const referenceImageEnd = normalized.referenceImageEnd;
  const normImages = normalized.referenceImages.slice(0, 5);
  const normAudios = normalized.referenceAudios.slice(0, 3);
  const hasFirstNorm = Boolean(referenceImage);
  const hasLastNorm = Boolean(referenceImageEnd);

  const seconds = Math.min(
    12,
    Math.max(4, Math.round(opts.durationSec && opts.durationSec > 0 ? opts.durationSec : 5)),
  );
  const body: Record<string, unknown> = {
    model: opts.model,
    prompt: opts.prompt,
    mode,
    seconds: String(seconds),
    size: normalizeAgnes25FlashSize(opts.resolution, opts.size),
  };
  const ratio = opts.aspectRatio?.trim();
  if (ratio) body.aspect_ratio = ratio;

  if (mode === "text") {
    if (
      hasFirstNorm ||
      hasLastNorm ||
      normImages.length > 0 ||
      normAudios.length > 0
    ) {
      throw new Error(
        "Agnes 2.5 Flash 文生模式不能带参考图/音频；请清空参考输入或去掉 input_reference。",
      );
    }
    return body;
  }

  if (mode === "keyframe") {
    if (normImages.length > 0 || normAudios.length > 0) {
      throw new Error(
        "Agnes 2.5 Flash mode=keyframe 不能带 images / audios；请改用首/尾帧，或将模式改为 reference。",
      );
    }
    if (!hasFirstNorm && !hasLastNorm) {
      throw new Error(
        "Agnes 2.5 Flash mode=keyframe 需要至少一张首帧或尾帧（公网 URL）。",
      );
    }
    if (referenceImage) {
      assertAgnesPublicUrl("first_frame", referenceImage, opts.officialHost);
      body.first_frame = referenceImage;
    }
    if (referenceImageEnd) {
      assertAgnesPublicUrl("last_frame", referenceImageEnd, opts.officialHost);
      body.last_frame = referenceImageEnd;
    }
    return body;
  }

  // mode === "reference"
  if (hasFirstNorm || hasLastNorm) {
    throw new Error(
      "Agnes 2.5 Flash mode=reference 不能带 first_frame / last_frame；请改用多参图，或将模式改为 keyframe。",
    );
  }
  if (opts.referenceImages.length > 5) {
    throw new Error(
      "Agnes 2.5 Flash mode=reference 最多 5 张参考图（images length must not exceed 5）。",
    );
  }
  if (normImages.length === 0 && normAudios.length === 0) {
    throw new Error(
      "Agnes 2.5 Flash mode=reference 需要至少一张参考图或一段参考音频。",
    );
  }
  for (const url of normImages) {
    assertAgnesPublicUrl("images", url, opts.officialHost);
  }
  for (const url of normAudios) {
    assertAgnesPublicUrl("audios", url, opts.officialHost);
  }
  if (normImages.length > 0) body.images = normImages;
  if (normAudios.length > 0) body.audios = normAudios;
  return body;
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
  /** Multi refs → role=reference_image (mutually exclusive with first/last). */
  referenceImages?: string[];
  /** Seedance 2.x → role=reference_audio (requires at least one image/video). */
  referenceAudios?: string[];
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
  const multiRefs = (options.referenceImages ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 9);

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
  // 多参考与首尾帧互斥（官方）
  if (multiRefs.length > 0) {
    for (const url of multiRefs) {
      content.push({
        type: "image_url",
        image_url: { url },
        role: "reference_image",
      });
    }
  } else {
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
  }

  const audioRefs = (options.referenceAudios ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
  if (audioRefs.length > 0) {
    const hasVisual = content.some(
      (c) => c.type === "image_url" || c.type === "video_url",
    );
    if (!hasVisual) {
      throw new Error(
        "Seedance 参考音频须同时提供至少一张参考图（或视频）。请先选首帧 / 首尾帧 / 多参图。",
      );
    }
    for (const url of audioRefs) {
      content.push({
        type: "audio_url",
        audio_url: { url },
        role: "reference_audio",
      });
    }
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

/** Join API-relative media paths (e.g. `/v1/videos/{id}/content`) onto the configured host. */
function resolveMediaUrl(baseUrl: string, maybeUrl: string): string {
  const u = maybeUrl.trim();
  if (!u || isHttpUrl(u) || u.startsWith("data:") || u.startsWith("mock://")) {
    return u;
  }
  try {
    const base = new URL(
      baseUrl.includes("://") ? baseUrl : `https://${baseUrl}`,
    );
    if (u.startsWith("/")) {
      // Prefer API root (…/v1) over bare origin, unless path already includes that prefix.
      const basePath = base.pathname.replace(/\/+$/, "");
      if (basePath && (u === basePath || u.startsWith(`${basePath}/`))) {
        return `${base.origin}${u}`;
      }
      if (basePath) {
        return `${base.origin}${basePath}${u}`;
      }
      return `${base.origin}${u}`;
    }
    const baseHref = base.href.endsWith("/") ? base.href : `${base.href}/`;
    return new URL(u, baseHref).href;
  } catch {
    return u;
  }
}

/** OpenAI Videos / 兼容中转：成片走 GET …/videos/{id}/content 或 …/videos/generations/{id}/content（相对路径，需鉴权）. */
function isApiVideoContentPath(url: string): boolean {
  try {
    const path = isHttpUrl(url) ? new URL(url).pathname : url;
    return (
      /\/videos\/[^/]+\/content\/?$/i.test(path) ||
      /\/videos\/generations\/[^/]+\/content\/?$/i.test(path)
    );
  } catch {
    return (
      /\/videos\/[^/]+\/content\/?$/i.test(url) ||
      /\/videos\/generations\/[^/]+\/content\/?$/i.test(url)
    );
  }
}

function openAiGenerationsContentPath(id: string): string {
  return `/videos/generations/${encodeURIComponent(id)}/content`;
}

/** 轮询地址（无 /content）被误当作成片 URL 时识别出来. */
function looksLikeGenerationsPollPath(url: string): boolean {
  try {
    const path = isHttpUrl(url) ? new URL(url).pathname : url;
    return (
      /\/videos\/generations\/[^/]+\/?$/i.test(path) &&
      !/\/content\/?$/i.test(path)
    );
  } catch {
    return false;
  }
}

/** OpenAI Videos 任务 id（中转常把 Grok 模型也包成这套协议）. */
function looksLikeOpenAiVideoId(id: string): boolean {
  return /^video_[A-Za-z0-9_-]+$/i.test(id.trim());
}

/**
 * Mid-station `/videos/generations` 参考图。
 * 多数中转按 Grok/xAI 严格 JSON schema 校验（`DisallowUnknownFields`），
 * 不可再喷 `input_reference` / `image_urls` 等别名 —— 官方 OpenAI Videos 的
 * `input_reference` 只属于 `video.openai-videos`（POST /videos）。
 * 此处只发 Grok 官方形状：I2V `image:{url}`；R2V `reference_images:[{url}]`。
 */
function attachOpenAiCompatibleVideoRefs(
  body: Record<string, unknown>,
  opts: {
    referenceImage?: string;
    referenceImageEnd?: string;
    referenceImages: string[];
  },
): void {
  const multi = opts.referenceImages.map((s) => s.trim()).filter(Boolean).slice(0, 7);
  if (multi.length > 0) {
    if (opts.referenceImage) {
      throw new Error(
        "OpenAI 兼容中转不能同时使用首帧图与多参考；请只选一种模式。",
      );
    }
    body.reference_images = multi.map((url) => ({ url }));
    return;
  }
  if (opts.referenceImage && opts.referenceImageEnd) {
    throw new Error(
      "OpenAI 兼容中转（Grok 风格）不支持首尾帧字段；请改用「首帧」或「多参考」。",
    );
  }
  if (opts.referenceImage) {
    body.image = { url: opts.referenceImage };
  }
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

const SEEDANCE_RELAY_SIZE: Record<string, Record<string, { w: number; h: number }>> =
  {
    "480p": {
      "16:9": { w: 832, h: 480 },
      "9:16": { w: 480, h: 832 },
      "1:1": { w: 640, h: 640 },
    },
    "720p": {
      "16:9": { w: 1280, h: 720 },
      "9:16": { w: 720, h: 1280 },
      "1:1": { w: 960, h: 960 },
    },
  };

function resolveSeedanceRelayPixelSize(
  resolution: string | undefined,
  aspectRatio: string | undefined,
  explicitSize?: string,
): string {
  const explicit = explicitSize?.trim();
  if (explicit && /^\d+\s*[x×]\s*\d+$/i.test(explicit)) {
    return explicit.replace(/\s*[x×]\s*/i, "x").toLowerCase();
  }
  const tier = resolution?.trim().toLowerCase() === "480p" ? "480p" : "720p";
  const aspect = aspectRatio?.trim() || "16:9";
  const sz =
    SEEDANCE_RELAY_SIZE[tier]?.[aspect] ??
    SEEDANCE_RELAY_SIZE["720p"]!["16:9"]!;
  return `${sz.w}x${sz.h}`;
}

function parseVideoDataUri(s: string): { bytes: Buffer; mime: string } | null {
  const t = s.trim();
  const m = /^data:([^;,]+);base64,(.+)$/i.exec(t);
  if (!m) return null;
  try {
    return { mime: m[1]!.trim(), bytes: Buffer.from(m[2]!, "base64") };
  } catch {
    return null;
  }
}

function videoMimeToExt(mime: string): string {
  const m = mime.split(";")[0]!.trim().toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  return "jpg";
}

/**
 * 中转站文档字段是 `input_reference`（URL 或文件）。
 * 多图：重复 append 同名字段（与 curl -F 多次一致）。
 */
function appendSeedanceRelayInputReference(
  form: FormData,
  ref: string,
  logRefs: string[],
): void {
  const trimmed = ref.trim();
  if (!trimmed) return;
  if (isHttpUrl(trimmed)) {
    form.append("input_reference", trimmed);
    logRefs.push(trimmed);
    return;
  }
  const parsed = parseVideoDataUri(trimmed);
  if (parsed) {
    const filename = `reference-${logRefs.length}.${videoMimeToExt(parsed.mime)}`;
    const blob = new Blob([new Uint8Array(parsed.bytes)], {
      type: parsed.mime,
    });
    form.append("input_reference", blob, filename);
    logRefs.push(`[file ${filename}]`);
    return;
  }
  form.append("input_reference", trimmed);
  logRefs.push(redactUrlValue(trimmed));
}

export function buildSeedanceRelayForm(opts: {
  model: string;
  prompt: string;
  seconds: number;
  size: string;
  aspectRatio?: string;
  withAudio?: boolean;
  referenceImage?: string;
  referenceImageEnd?: string;
  referenceImages?: string[];
}): { form: FormData; logBody: Record<string, unknown> } {
  const multi = (opts.referenceImages ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 9);
  const first = opts.referenceImage?.trim();
  const last = opts.referenceImageEnd?.trim();

  if (multi.length > 0 && (first || last)) {
    throw new Error(
      "Seedance 中转：多参图与首帧/首尾帧互斥，请只选一种模式。",
    );
  }

  const hasRefs = multi.length > 0 || Boolean(first) || Boolean(last);

  const form = new FormData();
  form.append("model", opts.model);
  form.append("prompt", opts.prompt);
  form.append("seconds", String(opts.seconds));
  form.append("size", opts.size);
  form.append("generate_audio", opts.withAudio === true ? "true" : "false");
  const ratio = opts.aspectRatio?.trim();
  if (ratio) form.append("aspect_ratio", ratio);
  // Mid-stations often check this before parsing image parts — put it before
  // input_reference. Also accept common truthy spellings some parsers use.
  if (hasRefs) {
    form.append("confirm_no_human_reference", "true");
  }

  const logBody: Record<string, unknown> = {
    model: opts.model,
    prompt: opts.prompt,
    seconds: String(opts.seconds),
    size: opts.size,
    generate_audio: opts.withAudio === true ? "true" : "false",
    _multipart: true,
    ...(ratio ? { aspect_ratio: ratio } : {}),
    ...(hasRefs ? { confirm_no_human_reference: "true" } : {}),
  };

  const logRefs: string[] = [];
  if (multi.length > 0) {
    for (const ref of multi) {
      appendSeedanceRelayInputReference(form, ref, logRefs);
    }
  } else {
    if (first) appendSeedanceRelayInputReference(form, first, logRefs);
    if (last) appendSeedanceRelayInputReference(form, last, logRefs);
  }

  if (logRefs.length > 0) {
    logBody.input_reference =
      logRefs.length === 1 ? logRefs[0] : logRefs;
  }

  return { form, logBody };
}

type VideoSubmitPayload =
  | { mode: "json"; body: Record<string, unknown> }
  | {
      mode: "multipart";
      form: FormData;
      logBody: Record<string, unknown>;
    };

/** 拾光等中转文档 size 枚举（按画幅推断）。 */
const MINIMAX_H3_RELAY_SIZE: Record<string, string> = {
  "16:9": "1280x720",
  "9:16": "720x1280",
  "4:3": "1024x768",
  "3:4": "768x1024",
  "1:1": "768x768",
  "21:9": "1344x576",
};

export function normalizeMinimaxH3RelayResolution(
  raw?: string | null,
): "768p" | "2K" {
  const t = (raw ?? "768p").trim();
  if (/^2k$/i.test(t) || /^1080p?$/i.test(t)) return "2K";
  return "768p";
}

export function resolveMinimaxH3RelaySize(
  aspectRatio?: string,
  explicitSize?: string,
): string {
  const explicit = explicitSize?.trim();
  if (explicit && /^\d+\s*[x×]\s*\d+$/i.test(explicit)) {
    return explicit.replace(/\s*[x×]\s*/i, "x");
  }
  const aspect = aspectRatio?.trim() || "16:9";
  return MINIMAX_H3_RELAY_SIZE[aspect] ?? MINIMAX_H3_RELAY_SIZE["16:9"]!;
}

function appendRelayFormMedia(
  form: FormData,
  field: string,
  ref: string,
  logRefs: string[],
): void {
  const trimmed = ref.trim();
  if (!trimmed) return;
  if (isHttpUrl(trimmed)) {
    form.append(field, trimmed);
    logRefs.push(trimmed);
    return;
  }
  const parsed = parseVideoDataUri(trimmed);
  if (parsed) {
    const filename = `${field}-${logRefs.length}.${videoMimeToExt(parsed.mime)}`;
    const blob = new Blob([new Uint8Array(parsed.bytes)], {
      type: parsed.mime,
    });
    form.append(field, blob, filename);
    logRefs.push(`[file ${filename}]`);
    return;
  }
  form.append(field, trimmed);
  logRefs.push(redactUrlValue(trimmed));
}

/**
 * 拾光 minimax_h3：OpenAI 形 /videos，但带 H3 的 size/resolution/ratio。
 * 文生 JSON；有参考图时 multipart（与中转 curl -F 一致）。
 */
export function buildMinimaxH3RelaySubmit(opts: {
  model: string;
  prompt: string;
  durationSec?: number;
  size?: string;
  resolution?: string;
  aspectRatio?: string;
  referenceImage?: string;
  referenceImageEnd?: string;
}): VideoSubmitPayload {
  const seconds = Math.min(
    15,
    Math.max(4, Math.round(opts.durationSec ?? 5)),
  );
  const size = resolveMinimaxH3RelaySize(opts.aspectRatio, opts.size);
  const resolution = normalizeMinimaxH3RelayResolution(opts.resolution);
  const ratioRaw = opts.aspectRatio?.trim() || "16:9";
  const ratio = ratioRaw === "adaptive" ? "16:9" : ratioRaw;
  const first = opts.referenceImage?.trim();
  const last = opts.referenceImageEnd?.trim();

  if (!first && !last) {
    return {
      mode: "json",
      body: {
        model: opts.model,
        prompt: opts.prompt,
        // 中转 Go schema：seconds 为 string（数字会 400 invalid_json）
        seconds: String(seconds),
        size,
        resolution,
        ratio,
      },
    };
  }

  const form = new FormData();
  form.append("model", opts.model);
  form.append("prompt", opts.prompt);
  form.append("seconds", String(seconds));
  form.append("size", size);
  form.append("resolution", resolution);
  form.append("ratio", ratio);

  const logBody: Record<string, unknown> = {
    model: opts.model,
    prompt: opts.prompt,
    seconds: String(seconds),
    size,
    resolution,
    ratio,
    _multipart: true,
  };
  const logRefs: string[] = [];

  if (first && last) {
    appendRelayFormMedia(form, "first_frame", first, logRefs);
    appendRelayFormMedia(form, "last_frame", last, logRefs);
    logBody.first_frame = logRefs[0];
    logBody.last_frame = logRefs[1];
  } else if (first) {
    appendRelayFormMedia(form, "input_reference", first, logRefs);
    logBody.input_reference = logRefs[0];
  } else if (last) {
    appendRelayFormMedia(form, "last_frame", last, logRefs);
    logBody.last_frame = logRefs[0];
  }

  return { mode: "multipart", form, logBody };
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
    } else if (v && typeof v === "object") {
      // Grok / xAI：image: { url } 或 { file_id }
      const obj = { ...(v as Record<string, unknown>) };
      if (typeof obj.url === "string") obj.url = redactUrlValue(obj.url);
      if (typeof obj.image_url === "string") {
        obj.image_url = redactUrlValue(obj.image_url);
      }
      out[key] = obj;
    }
  }
  // 火山方舟 content[].image_url / audio_url / video_url
  if (Array.isArray(out.content)) {
    out.content = out.content.map((item) => {
      if (!item || typeof item !== "object") return item;
      const c = { ...(item as Record<string, unknown>) };
      for (const mediaKey of ["image_url", "audio_url", "video_url"] as const) {
        const media = c[mediaKey];
        if (media && typeof media === "object" && !Array.isArray(media)) {
          const mu = { ...(media as Record<string, unknown>) };
          if (typeof mu.url === "string") mu.url = redactUrlValue(mu.url);
          c[mediaKey] = mu;
        }
      }
      return c;
    });
  }
  // Grok R2V：reference_images: [{ url }]
  if (Array.isArray(out.reference_images)) {
    out.reference_images = out.reference_images.map((item) => {
      if (!item || typeof item !== "object") return item;
      const obj = { ...(item as Record<string, unknown>) };
      if (typeof obj.url === "string") obj.url = redactUrlValue(obj.url);
      return obj;
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
  const timeoutMs = options.timeoutMs ?? VIDEO_WAIT_TIMEOUT_MS; // 视频默认 30 分钟
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

  const format = (options.apiFormat ?? "").toLowerCase();
  // Domestic vendors with non-OpenAI dialects — dispatch before the shared poller.
  // Keep original baseUrl so advanced mode can use the full submit URL as-is.
  if (format === "video.kling") {
    return generateKlingVideo(options);
  }
  if (format === "video.minimax-hailuo") {
    return generateMinimaxHailuoVideo(options);
  }
  if (format === "video.vidu") {
    return generateViduVideo(options);
  }

  const formatId = options.apiFormat ?? "";
  const baseUrl = normalizeBaseUrl(
    resolveApiBaseUrl(options.baseUrl, formatId),
  );
  // Prefer explicit API 格式；baseUrl 猜测仅作旧数据回退。
  const agnes25Flash = isAgnesVideo25Flash(options.model, options.apiFormat);
  const agnes =
    format === "video.agnes" ||
    format === "video.agnes-25-flash" ||
    agnes25Flash ||
    (!format && isAgnesVideoBaseUrl(baseUrl));
  const zhipu =
    format === "video.zhipu-cogvideox" ||
    (!format && isZhipuVideoBaseUrl(baseUrl));
  const volcengine =
    format === "video.volcengine-seedance" ||
    format === "video.volcengine-wan" ||
    (!format && isVolcengineArkBaseUrl(baseUrl));
  // 官方 OpenAI Videos：/videos + /videos/{id}/content 取片
  const openaiVideos = format === "video.openai-videos";
  const seedanceRelay = format === "video.seedance-relay";
  const minimaxH3Relay = format === "video.minimax-h3-relay";
  const openaiVideosProtocol =
    openaiVideos || seedanceRelay || minimaxH3Relay;
  // 中转兼容 / OpenAI Generations：/videos/generations
  const openaiGenerations =
    format === "video.openai-generations" ||
    format === "video.openai-compatible";
  const grok = format === "video.grok";

  const defaultSubmitPath = volcengine
    ? "/contents/generations/tasks"
    : agnes || openaiVideosProtocol
      ? "/videos"
      : "/videos/generations";
  // 高级模式：提交 URL 原样；简单模式：根 + action。轮询仍用 API 根。
  const submitUrl = options.http?.submitPath
    ? `${baseUrl}${options.http.submitPath}`
    : resolveApiActionUrl(options.baseUrl, formatId, options.baseUrlMode) ||
      `${baseUrl}${defaultSubmitPath}`;
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
          : grok
            ? "video.url"
            : openaiVideosProtocol
              ? "url"
              : "output.url");

  options.onStatus?.("queued");
  const referenceImage = normalizeReferenceImage(options.referenceImage);
  const referenceImageEnd = normalizeReferenceImage(options.referenceImageEnd);
  const referenceImages = (options.referenceImages ?? [])
    .map((s) => normalizeReferenceImage(s))
    .filter((s): s is string => Boolean(s))
    .slice(0, 9);
  const referenceAudios = (options.referenceAudios ?? [])
    .map((s) => normalizeReferenceImage(s))
    .filter((s): s is string => Boolean(s))
    .slice(0, 3);

  let submitPayload: VideoSubmitPayload;
  let seedanceRelayConfirmQuery = false;
  if (seedanceRelay) {
    const seconds = Math.max(
      1,
      Math.round(options.durationSec ?? 5),
    );
    const pixelSize = resolveSeedanceRelayPixelSize(
      options.resolution,
      options.aspectRatio,
      options.size,
    );
    const built = buildSeedanceRelayForm({
      model: options.model,
      prompt: options.prompt,
      seconds,
      size: pixelSize,
      aspectRatio: options.aspectRatio,
      withAudio: options.withAudio,
      referenceImage,
      referenceImageEnd,
      referenceImages,
    });
    seedanceRelayConfirmQuery =
      built.logBody.confirm_no_human_reference === "true";
    submitPayload = {
      mode: "multipart",
      form: built.form,
      logBody: built.logBody,
    };
  } else if (minimaxH3Relay) {
    submitPayload = buildMinimaxH3RelaySubmit({
      model: options.model,
      prompt: options.prompt,
      durationSec: options.durationSec,
      size: options.size,
      resolution: options.resolution,
      aspectRatio: options.aspectRatio,
      referenceImage,
      referenceImageEnd,
    });
  } else {
  let submitBody: Record<string, unknown>;
  if (volcengine) {
    if (
      isVolcengineArkBaseUrl(baseUrl) &&
      ((referenceImage && isDataUriOrRawBase64(referenceImage)) ||
        (referenceImageEnd && isDataUriOrRawBase64(referenceImageEnd)) ||
        referenceImages.some((u) => isDataUriOrRawBase64(u)) ||
        referenceAudios.some((u) => isDataUriOrRawBase64(u)))
    ) {
      throw new Error(
        "火山方舟图生/多参考要求公网可访问的媒体 URL（图片/音频），本地 base64 无法被方舟拉取。请开启对象存储上传，或粘贴公网 URL。",
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
      referenceImages,
      referenceAudios,
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
    } else if (agnes25Flash) {
      submitBody = buildAgnes25FlashSubmitBody({
        model: options.model,
        prompt: options.prompt,
        mode: options.mode,
        durationSec: options.durationSec,
        aspectRatio: options.aspectRatio,
        resolution: options.resolution,
        size: options.size,
        referenceImage,
        referenceImageEnd,
        referenceImages,
        referenceAudios,
        officialHost: isAgnesVideoBaseUrl(baseUrl),
      });
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
      // Official Sora: input_reference as first frame only.
      if (referenceImage) {
        submitBody.input_reference = { image_url: referenceImage };
        submitBody.image = referenceImage;
      }
    } else if (openaiGenerations) {
      // video.openai-compatible / openai-generations（中转）
      // 只发通用字段；勿带 Agnes 的 width/height/num_frames（严格 JSON schema 会 400）
      if (options.durationSec != null && options.durationSec > 0) {
        submitBody.duration = Math.round(options.durationSec);
      }
      if (options.aspectRatio?.trim()) {
        submitBody.aspect_ratio = options.aspectRatio.trim();
      }
      if (options.resolution?.trim()) {
        submitBody.resolution = options.resolution.trim();
      }
      attachOpenAiCompatibleVideoRefs(submitBody, {
        referenceImage,
        referenceImageEnd,
        referenceImages,
      });
    } else if (grok) {
      // xAI Grok Imagine Video
      // https://docs.x.ai/developers/rest-api-reference/inference/videos
      // POST /v1/videos/generations → { request_id }；轮询 GET /v1/videos/{id}
      // 仅发官方字段；不发 width/height/num_frames/frame_rate。
      const d =
        options.durationSec != null && options.durationSec > 0
          ? Math.min(15, Math.max(1, Math.round(options.durationSec)))
          : 8; // 官方默认 8
      submitBody.duration = d;
      const ratio = options.aspectRatio?.trim();
      if (ratio) submitBody.aspect_ratio = ratio;
      const res = options.resolution?.trim().toLowerCase();
      // 官方：1080p 仅 grok-imagine-video-1.5（T2V/I2V）；其它型号最高 720p
      const supports1080p = /1\.5/i.test(options.model);
      if (res === "1080p" && !supports1080p) {
        throw new Error(
          "Grok 1080p 仅支持 grok-imagine-video-1.5；当前型号请改用 480p 或 720p。",
        );
      }
      if (res === "480p" || res === "720p" || res === "1080p") {
        submitBody.resolution = res;
      }
      // I2V：image.url；R2V：reference_images[{url}]（互斥）
      // https://docs.x.ai/developers/model-capabilities/video/reference-to-video
      // 能力文档：R2V 仅 grok-imagine-video-1.5（最多 7 张）。非 1.5 只有 I2V 单张 image。
      if (referenceImages.length > 0) {
        if (referenceImage) {
          throw new Error(
            "Grok 不能同时使用首帧图（image）与多参考（reference_images）；请只选一种模式。",
          );
        }
        if (!supports1080p) {
          throw new Error(
            "Grok 多参考（reference_images / R2V）仅支持 grok-imagine-video-1.5；当前型号请改用 1.5，或改选「首帧图」只传 1 张。",
          );
        }
        const refs = referenceImages.slice(0, 7);
        submitBody.reference_images = refs.map((url) => ({ url }));
      } else if (referenceImage) {
        submitBody.image = { url: referenceImage };
      }
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
    submitPayload = { mode: "json", body: submitBody };
  }

  const httpLog = {
    url: submitUrl,
    body: redactImageFieldsForLog(
      submitPayload.mode === "multipart"
        ? { ...submitPayload.logBody }
        : { ...submitPayload.body },
    ),
  };
  // Some mid-stations only read confirm from query string; keep form field too.
  const finalSubmitUrl =
    seedanceRelay && seedanceRelayConfirmQuery
      ? (() => {
          try {
            const u = new URL(submitUrl);
            u.searchParams.set("confirm_no_human_reference", "true");
            return u.toString();
          } catch {
            const sep = submitUrl.includes("?") ? "&" : "?";
            return `${submitUrl}${sep}confirm_no_human_reference=true`;
          }
        })()
      : submitUrl;
  if (finalSubmitUrl !== submitUrl) {
    httpLog.url = finalSubmitUrl;
  }
  options.onHttpLog?.(httpLog);

  const submitRes = await fetch(finalSubmitUrl, {
    method: "POST",
    headers:
      submitPayload.mode === "multipart"
        ? { Authorization: `Bearer ${options.apiKey}` }
        : {
            Authorization: `Bearer ${options.apiKey}`,
            "Content-Type": "application/json",
          },
    body:
      submitPayload.mode === "multipart"
        ? submitPayload.form
        : JSON.stringify(submitPayload.body),
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
    getPath(submitJson, "request_id") ??
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
        : agnes || openaiVideosProtocol || grok
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
        /\{\{id\}\}/gi,
        encodeURIComponent(pollId),
      );
      // 高级配置可填完整查询 URL；相对路径仍拼到 baseUrl
      pollUrl = /^https?:\/\//i.test(pollPath)
        ? pollPath
        : `${baseUrl.replace(/\/+$/, "")}${pollPath.startsWith("/") ? pollPath : `/${pollPath}`}`;
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
    const progress = getPath(pollJson, "progress");
    // Agnes: queued | in_progress | completed | failed
    // Grok: pending (0–99) | done | failed | expired
    if (
      status === "in_progress" ||
      status === "processing" ||
      status === "pending" ||
      status === "queued"
    ) {
      const detail =
        typeof progress === "number"
          ? `${status} ${Math.max(0, Math.min(100, progress))}%`
          : status;
      options.onStatus?.("running", detail);
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
      // Agnes 官方 /agnesapi：2.5 Flash 等常把成片放在顶层 `url`（未必有 metadata.url）
      if (!remoteUrl && agnes) {
        remoteUrl = String(
          getPath(pollJson, "url") ??
            getPath(pollJson, "metadata.url") ??
            getPath(pollJson, "data.url") ??
            "",
        );
      }
      // Grok 配置 + OpenAI 协议中转：可能把成片放在 url / output.url，或给相对 /content
      if (!remoteUrl && (grok || openaiVideosProtocol || openaiGenerations)) {
        remoteUrl = String(
          getPath(pollJson, "url") ??
            getPath(pollJson, "output.url") ??
            getPath(pollJson, "metadata.url") ??
            getPath(pollJson, "data.url") ??
            getPath(pollJson, "video.url") ??
            "",
        );
      }
      // 官方 api.x.ai：video.url 为 https://vidgen.x.ai/...
      // 官方 /videos：video_* id + `/v1/videos/{id}/content`（相对路径，需鉴权下载）
      // 兼容 /generations：走 `/v1/videos/generations/{id}/content`，勿与官方 /videos 混用
      if (openaiGenerations) {
        if (remoteUrl && looksLikeGenerationsPollPath(remoteUrl)) {
          const base = remoteUrl.replace(/\/+$/, "");
          remoteUrl = `${base}/content`;
        } else if (!remoteUrl || !isHttpUrl(remoteUrl)) {
          remoteUrl = isApiVideoContentPath(remoteUrl)
            ? remoteUrl
            : openAiGenerationsContentPath(pollId);
        }
      } else if (
        (openaiVideosProtocol ||
          looksLikeOpenAiVideoId(pollId) ||
          isApiVideoContentPath(remoteUrl)) &&
        (!remoteUrl || !isHttpUrl(remoteUrl))
      ) {
        remoteUrl = isApiVideoContentPath(remoteUrl)
          ? remoteUrl
          : `/videos/${encodeURIComponent(pollId)}/content`;
      }
      // Grok: respect_moderation=false 时 url 为空，继续轮询无意义
      if (
        grok &&
        !remoteUrl &&
        getPath(pollJson, "video.respect_moderation") === false
      ) {
        throw new Error(
          "Video task failed: content did not pass moderation (respect_moderation=false)",
        );
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
      status === "canceled" ||
      status === "expired"
    ) {
      const failDetail = String(
        getPath(pollJson, "error.message") ??
          getPath(pollJson, "message") ??
          pollText.slice(0, 200),
      );
      throw new Error(
        status === "expired"
          ? `Video task expired${failDetail ? ` — ${failDetail}` : ""}`
          : `Video task failed: ${status}${failDetail ? ` — ${failDetail}` : ""}`,
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

  const downloadUrl = resolveMediaUrl(baseUrl, remoteUrl);
  if (!isHttpUrl(downloadUrl) && !downloadUrl.startsWith("mock://")) {
    throw new Error(
      `Video output URL is not absolute (got ${remoteUrl}). Check api_format / base URL.`,
    );
  }
  // OpenAI /videos/{id}/content 需 Bearer；公网 CDN（官方 Grok vidgen）一般不需要
  const downloadHeaders =
    openaiVideosProtocol ||
    openaiGenerations ||
    looksLikeOpenAiVideoId(pollId) ||
    isApiVideoContentPath(downloadUrl)
      ? { Authorization: `Bearer ${options.apiKey}` }
      : undefined;

  options.onStatus?.("downloading", downloadUrl);
  const downloaded = await downloadBytes(downloadUrl, signal, downloadHeaders);
  options.onStatus?.("succeeded");

  return {
    bytes: downloaded.bytes,
    mime: downloaded.mime.includes("video")
      ? downloaded.mime
      : "video/mp4",
    extension: "mp4",
    remoteUrl: downloadUrl,
    latencyMs: Date.now() - started,
    taskId: pollId,
    usage,
  };
}
