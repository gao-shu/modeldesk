/**
 * OpenAI-compatible image generation.
 * Also supports mock:// base URLs for local demos without a provider.
 * Volcengine Ark Seedream uses response_format=url + size 2K/4K.
 */

import {
  canonicalizeSeedreamModelId,
  inferApiBaseUrlMode,
  resolveApiActionUrl,
  resolveApiBaseUrl,
} from "@modeldesk/shared";
import {
  extractUsageFromResponse,
  type TokenUsage,
} from "./usage";
import {
  isRateLimitBody,
  isRateLimitStatus,
  nextPollDelayMs,
  retryAfterMs,
  sleep,
} from "./poll";

export type ImageGenOptions = {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  size?: string;
  quality?: string;
  /** Aspect ratio for tier-based sizes (e.g. Agnes `1K` + `16:9`). */
  ratio?: string;
  /** Number of images to generate (default 1). */
  n?: number;
  /** From model.defaults.api_format — preferred over baseUrl guess. */
  apiFormat?: string;
  /** From model.defaults.base_url_mode — advanced = submit URL as-is. */
  baseUrlMode?: "simple" | "advanced";
  /**
   * DashScope 万相：parameters.prompt_extend（智能改写）。
   * UI 存 "true"/"false" 字符串或 boolean。
   */
  promptExtend?: boolean;
  /**
   * 图生图参考图（公网 URL 或 data URI）。
   * - Agnes → `extra_body.image` 数组
   * - OpenAI 兼容（中转站）→ 顶层 `image`（单张字符串 / 多张数组）
   * - Seedream → 顶层 `image`（单张字符串 / 多张数组）
   */
  referenceImages?: string[];
  /** Seedream watermark — always false (not exposed in UI). */
  watermark?: boolean;
  /** Grok: 顶层 aspect_ratio 字段（如 "16:9"）。 */
  aspectRatio?: string;
  /** Grok: 顶层 resolution 字段（"1k" / "2k"）。 */
  resolution?: string;
  /** Grok: 顶层 response_format 字段（"url" / "b64_json"）。 */
  responseFormat?: "url" | "b64_json";
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Fired when the outbound HTTP request is ready (before submit). */
  onHttpLog?: (log: { url: string; body: Record<string, unknown> }) => void;
};

type ImageDialect =
  | "google"
  | "agnes"
  | "seedream"
  | "zhipu"
  | "grok"
  | "dashscope-wanxiang"
  | "openai-async"
  | "openai";

/** Prefer explicit api_format; URL/model heuristics only when unset. */
function resolveImageDialect(
  apiFormat: string | undefined,
  baseUrl: string,
  model: string,
): ImageDialect {
  const fmt = (apiFormat ?? "").toLowerCase();
  if (fmt === "image.google-nano-banana") return "google";
  if (fmt === "image.agnes") return "agnes";
  if (fmt === "image.volcengine-seedream") return "seedream";
  if (fmt === "image.zhipu-cogview") return "zhipu";
  if (fmt === "image.dashscope-wanxiang") return "dashscope-wanxiang";
  if (fmt === "image.grok") return "grok";
  if (fmt === "image.openai-async" || fmt === "image.shiguang") {
    return "openai-async";
  }
  if (
    fmt === "image.openai" ||
    fmt === "image.openai-compatible" ||
    fmt === "image.mock"
  ) {
    // 官方方舟 + Seedream 模型误选 OpenAI 兼容时，仍走 Seedream 协议。
    if (
      fmt !== "image.mock" &&
      isVolcengineArkImageBaseUrl(baseUrl) &&
      model.toLowerCase().includes("seedream")
    ) {
      return "seedream";
    }
    return "openai";
  }
  // Legacy rows without api_format
  if (isGoogleGeminiImageBaseUrl(baseUrl) && isNanoBananaModel(model)) {
    return "google";
  }
  if (isAgnesApiBaseUrl(baseUrl)) return "agnes";
  if (
    isVolcengineArkImageBaseUrl(baseUrl) &&
    (model.toLowerCase().includes("seedream") ||
      /^(4\.5|4\.0|4)$/i.test(model.trim()))
  ) {
    return "seedream";
  }
  if (isZhipuImageBaseUrl(baseUrl) && isZhipuImageModel(model)) return "zhipu";
  if (isDashScopeWanxiangHint(baseUrl, model)) return "dashscope-wanxiang";
  return "openai";
}

export function isDashScopeApiBaseUrl(
  baseUrl: string | null | undefined,
): boolean {
  if (!baseUrl) return false;
  const u = baseUrl.toLowerCase();
  return (
    u.includes("dashscope.aliyuncs.com") ||
    u.includes("dashscope-intl.aliyuncs.com") ||
    u.includes("dashscope-us.aliyuncs.com") ||
    /\.maas\.aliyuncs\.com/.test(u)
  );
}

function isDashScopeWanxiangHint(baseUrl: string, model: string): boolean {
  const m = model.toLowerCase();
  if (
    m.startsWith("wanx") ||
    /^wan2[.\-]/.test(m) ||
    m.includes("wanxiang") ||
    m.includes("万相")
  ) {
    return true;
  }
  return isDashScopeApiBaseUrl(baseUrl) && /wan|万相|t2i/.test(m);
}

/** Ensure DashScope calls hit `…/api/v1`. */
function ensureDashScopeApiV1Root(baseUrl: string): string {
  let u = normalizeBaseUrl(baseUrl);
  if (/\/api\/v1$/i.test(u)) return u;
  // Strip accidental action suffixes if pasted as full path
  u = u
    .replace(/\/services\/aigc\/.*$/i, "")
    .replace(/\/tasks(\/[^/]*)?$/i, "")
    .replace(/\/+$/, "");
  if (/\/api\/v1$/i.test(u)) return u;
  return `${u}/api/v1`;
}

function mapDashScopeWanSize(size?: string): string {
  const raw = (size ?? "").trim();
  if (!raw) return "1280*1280";
  return raw.replace(/[x×]/gi, "*");
}

function isWan26OrNewerImageModel(model: string): boolean {
  const m = model.toLowerCase();
  // wan2.6-t2i / wan2.7-image / wan2.7-image-pro
  return /^wan2\.(6|7)\b/.test(m) || /^wan2-(6|7)\b/.test(m);
}

function extractDashScopeImageUrls(json: unknown): string[] {
  if (!json || typeof json !== "object") return [];
  const output = (json as Record<string, unknown>).output;
  if (!output || typeof output !== "object") return [];
  const out = output as Record<string, unknown>;
  const urls: string[] = [];

  const results = out.results;
  if (Array.isArray(results)) {
    for (const row of results) {
      if (!row || typeof row !== "object") continue;
      const url = (row as Record<string, unknown>).url;
      if (typeof url === "string" && url.trim()) urls.push(url.trim());
    }
  }

  const choices = out.choices;
  if (Array.isArray(choices)) {
    for (const choice of choices) {
      if (!choice || typeof choice !== "object") continue;
      const message = (choice as Record<string, unknown>).message;
      if (!message || typeof message !== "object") continue;
      const content = (message as Record<string, unknown>).content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (!part || typeof part !== "object") continue;
        const image = (part as Record<string, unknown>).image;
        if (typeof image === "string" && image.trim()) urls.push(image.trim());
      }
    }
  }

  return [...new Set(urls)];
}

async function urlsToImageGenItems(
  urls: string[],
  signal?: AbortSignal,
): Promise<ImageGenItem[]> {
  const items: ImageGenItem[] = [];
  for (const url of urls) {
    const downloaded = await downloadBytes(url, signal);
    const ext = downloaded.mime.includes("jpeg") ? "jpg" : "png";
    items.push({
      bytes: downloaded.bytes,
      mime: downloaded.mime,
      extension: ext,
      remoteUrl: url,
    });
  }
  return items;
}

/**
 * 阿里云百炼 · 通义万相文生图（DashScope，非 OpenAI 兼容）。
 * - wan2.6+：优先同步 multimodal-generation；失败再异步 image-generation
 * - 更早型号：异步 text2image/image-synthesis（input.prompt）
 * 轮询：GET {api/v1}/tasks/{task_id}
 */
async function generateDashScopeWanxiangImage(
  options: ImageGenOptions,
  started: number,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<ImageGenResult> {
  const root = ensureDashScopeApiV1Root(options.baseUrl);
  const model = options.model.trim();
  const n = Math.min(Math.max(options.n ?? 1, 1), 4);
  const size = mapDashScopeWanSize(options.size);
  const promptExtend = options.promptExtend !== false;
  const watermark = options.watermark === true;
  const authHeaders = {
    Authorization: `Bearer ${options.apiKey}`,
    "Content-Type": "application/json",
  };

  const networkErr = (error: unknown) => {
    const message =
      error instanceof Error
        ? error.name === "TimeoutError" || error.name === "AbortError"
          ? `Request timed out (${timeoutMs}ms).`
          : `Network error: ${error.message}`
        : "Network error";
    throw new Error(message);
  };

  const messagesBody = (): Record<string, unknown> => ({
    model,
    input: {
      messages: [
        {
          role: "user",
          content: [{ text: options.prompt }],
        },
      ],
    },
    parameters: {
      size,
      n,
      prompt_extend: promptExtend,
      watermark,
    },
  });

  const legacyPromptBody = (): Record<string, unknown> => ({
    model,
    input: {
      prompt: options.prompt,
    },
    parameters: {
      size,
      n,
      prompt_extend: promptExtend,
      watermark,
    },
  });

  const finishFromUrls = async (urls: string[], usageJson?: unknown) => {
    if (urls.length === 0) {
      throw new Error("DashScope 万相未返回图像 URL");
    }
    const items = await urlsToImageGenItems(urls, signal);
    return {
      ...items[0]!,
      latencyMs: Date.now() - started,
      images: items.length > 1 ? items.slice(1) : undefined,
      usage: extractUsageFromResponse(usageJson ?? null),
    } satisfies ImageGenResult;
  };

  const pollTask = async (taskId: string): Promise<unknown> => {
    const pollUrl = `${root}/tasks/${encodeURIComponent(taskId)}`;
    const deadline = Date.now() + timeoutMs;
    let pollIntervalMs = 2_000;
    while (Date.now() < deadline) {
      if (signal?.aborted) {
        throw new Error("Request timed out / aborted while polling DashScope task.");
      }
      let res: Response;
      try {
        res = await fetch(pollUrl, {
          method: "GET",
          headers: { Authorization: `Bearer ${options.apiKey}` },
          signal,
        });
      } catch (error) {
        networkErr(error);
        throw error;
      }
      const text = await res.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      if (
        !res.ok &&
        (isRateLimitStatus(res.status) || isRateLimitBody(text))
      ) {
        pollIntervalMs = nextPollDelayMs({
          currentMs: pollIntervalMs,
          baseMs: 2_000,
          maxMs: 15_000,
          retryAfterHeaderMs: retryAfterMs(res),
        });
        await sleep(pollIntervalMs, signal);
        continue;
      }
      if (!res.ok) {
        throw new Error(friendlyHttpError(res.status, text, pollUrl));
      }
      const output =
        json && typeof json === "object"
          ? ((json as Record<string, unknown>).output as
              | Record<string, unknown>
              | undefined)
          : undefined;
      const status = String(output?.task_status ?? "").toUpperCase();
      if (status === "SUCCEEDED") return json;
      if (status === "FAILED" || status === "CANCELED" || status === "UNKNOWN") {
        const code =
          (json && typeof json === "object"
            ? (json as Record<string, unknown>).code
            : null) ??
          output?.code ??
          status;
        const message =
          (json && typeof json === "object"
            ? (json as Record<string, unknown>).message
            : null) ??
          output?.message ??
          "task failed";
        throw new Error(`DashScope 万相任务失败 (${String(code)}): ${String(message)}`);
      }
      pollIntervalMs = nextPollDelayMs({
        currentMs: pollIntervalMs,
        baseMs: 2_000,
        maxMs: 12_000,
      });
      await sleep(pollIntervalMs, signal);
    }
    throw new Error(`DashScope 万相任务超时（>${timeoutMs}ms）`);
  };

  const submitAsync = async (
    actionPath: string,
    body: Record<string, unknown>,
  ): Promise<ImageGenResult> => {
    const url = `${root}${actionPath.startsWith("/") ? actionPath : `/${actionPath}`}`;
    emitImageHttpLog(options, url, body);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          ...authHeaders,
          "X-DashScope-Async": "enable",
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      networkErr(error);
      throw error;
    }
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      throw new Error(friendlyHttpError(res.status, text, url));
    }
    if (json && typeof json === "object") {
      const code = (json as Record<string, unknown>).code;
      const message = (json as Record<string, unknown>).message;
      if (typeof code === "string" && code && code !== "Success") {
        throw new Error(`DashScope error (${code}): ${String(message ?? text)}`);
      }
    }
    const output =
      json && typeof json === "object"
        ? ((json as Record<string, unknown>).output as
            | Record<string, unknown>
            | undefined)
        : undefined;
    const taskId = output?.task_id;
    if (typeof taskId !== "string" || !taskId.trim()) {
      // Some regions may return sync-shaped payload even on async endpoint
      const immediate = extractDashScopeImageUrls(json);
      if (immediate.length > 0) return finishFromUrls(immediate, json);
      throw new Error("DashScope 万相未返回 task_id");
    }
    const done = await pollTask(taskId.trim());
    return finishFromUrls(extractDashScopeImageUrls(done), done);
  };

  // wan2.6+：先试同步 multimodal（更快）；不支持再走异步
  if (isWan26OrNewerImageModel(model)) {
    const syncUrl = `${root}/services/aigc/multimodal-generation/generation`;
    const body = messagesBody();
    emitImageHttpLog(options, syncUrl, body);
    try {
      const res = await fetch(syncUrl, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(body),
        signal,
      });
      const text = await res.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      const errMsg =
        (json && typeof json === "object"
          ? String((json as Record<string, unknown>).message ?? "")
          : "") || text;
      if (
        res.ok &&
        !(
          json &&
          typeof json === "object" &&
          typeof (json as Record<string, unknown>).code === "string" &&
          (json as Record<string, unknown>).code &&
          (json as Record<string, unknown>).code !== "Success"
        )
      ) {
        const urls = extractDashScopeImageUrls(json);
        if (urls.length > 0) return finishFromUrls(urls, json);
      } else if (
        !/does not support synchronous|不支持同步|synchronous calls/i.test(
          errMsg,
        )
      ) {
        // Hard failure (auth / params) — don't silently async unless sync unsupported
        if (!res.ok) {
          throw new Error(friendlyHttpError(res.status, text, syncUrl));
        }
        if (json && typeof json === "object") {
          const code = (json as Record<string, unknown>).code;
          if (typeof code === "string" && code) {
            throw new Error(
              `DashScope error (${code}): ${String(
                (json as Record<string, unknown>).message ?? text,
              )}`,
            );
          }
        }
      }
    } catch (error) {
      if (
        error instanceof Error &&
        !/does not support synchronous|不支持同步|synchronous calls/i.test(
          error.message,
        ) &&
        !/Network error|timed out/i.test(error.message)
      ) {
        // Auth/param errors from sync should surface
        if (/Upstream|Authentication|DashScope error/i.test(error.message)) {
          throw error;
        }
      }
      // fall through to async for sync-unsupported / empty body
    }

    return submitAsync(
      "/services/aigc/image-generation/generation",
      messagesBody(),
    );
  }

  // wan2.5 及更早：异步 text2image
  return submitAsync(
    "/services/aigc/text2image/image-synthesis",
    legacyPromptBody(),
  );
}

function redactHttpLogValue(value: unknown): unknown {
  if (typeof value === "string") {
    if (value.startsWith("data:") || value.length > 160) {
      return `[omitted ${value.length} chars]`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(redactHttpLogValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactHttpLogValue(v);
    }
    return out;
  }
  return value;
}

function emitImageHttpLog(
  options: ImageGenOptions,
  url: string,
  body: Record<string, unknown>,
): void {
  options.onHttpLog?.({
    url,
    body: redactHttpLogValue(body) as Record<string, unknown>,
  });
}

export function isAgnesApiBaseUrl(baseUrl: string | null | undefined): boolean {
  if (!baseUrl) return false;
  return baseUrl.toLowerCase().includes("agnes-ai.com");
}

export function isVolcengineArkImageBaseUrl(
  baseUrl: string | null | undefined,
): boolean {
  if (!baseUrl) return false;
  const u = baseUrl.toLowerCase();
  return u.includes("volces.com") || u.includes("volcengine");
}

export function isZhipuImageBaseUrl(
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

function isZhipuImageModel(model: string): boolean {
  const m = model.toLowerCase();
  return (
    m.startsWith("cogview") ||
    m === "glm-image" ||
    m.startsWith("glm-image")
  );
}

function resolveZhipuImageSize(
  size: string | undefined,
  model: string,
): string {
  const t = (size ?? "").trim();
  if (/^\d+x\d+$/i.test(t)) return t;
  const glm = model.toLowerCase().includes("glm-image");
  return glm ? "1280x1280" : "1024x1024";
}

function resolveZhipuImageQuality(
  quality: string | undefined,
  model: string,
): "hd" | "standard" {
  if (model.toLowerCase().includes("glm-image")) return "hd";
  const q = (quality ?? "").trim().toLowerCase();
  if (q === "standard" || q === "low" || q === "medium") return "standard";
  return "hd";
}

export type ImageGenItem = {
  bytes: Buffer;
  mime: string;
  extension: string;
  remoteUrl?: string;
};

export type ImageGenResult = ImageGenItem & {
  latencyMs: number;
  /** All generated images when n > 1 (excludes the primary fields' image). */
  images?: ImageGenItem[];
  usage?: TokenUsage | null;
};

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC",
  "base64",
);

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

/** Avoid double-append when Base URL already includes /images/generations|edits. */
function imageEndpointUrl(
  baseUrl: string,
  action: "/images/generations" | "/images/edits",
): string {
  let u = baseUrl.replace(/\/+$/, "");
  if (/\/images\/generations$/i.test(u) || /\/images\/edits$/i.test(u)) {
    u = u.replace(/\/images\/(generations|edits)$/i, "");
  }
  return `${u}${action}`;
}

/** Map tier-based size + ratio → pixel dimensions for non-Agnes APIs. */
const IMAGE_SIZE_MAP: Record<string, Record<string, string>> = {
  "1K": {
    "1:1": "1024x1024",
    "4:3": "1152x864",
    "3:4": "864x1152",
    "16:9": "1424x800",
    "9:16": "800x1424",
    "3:2": "1248x832",
    "2:3": "832x1248",
    "21:9": "1568x672",
  },
  "2K": {
    "1:1": "2048x2048",
    "4:3": "2304x1728",
    "3:4": "1728x2304",
    "16:9": "2848x1600",
    "9:16": "1600x2848",
    "3:2": "2496x1664",
    "2:3": "1664x2496",
    "21:9": "3136x1344",
  },
  "3K": {
    "1:1": "3072x3072",
    "4:3": "3456x2592",
    "3:4": "2592x3456",
    "16:9": "4096x2304",
    "9:16": "2304x4096",
    "3:2": "3744x2496",
    "2:3": "2496x3744",
    "21:9": "4704x2016",
  },
  "4K": {
    "1:1": "4096x4096",
    "4:3": "4704x3520",
    "3:4": "3520x4704",
    "16:9": "5504x3040",
    "9:16": "3040x5504",
    "3:2": "4992x3328",
    "2:3": "3328x4992",
    "21:9": "6240x2656",
  },
};

/** Resolve tier-based size to pixel dimensions using ratio. */
function resolveImageSize(
  size: string | undefined,
  ratio: string | undefined,
): string {
  if (!size) return "1024x1024";
  const trimmed = size.trim();
  if (trimmed.toLowerCase() === "auto") return "auto";
  // Already a pixel dimension (e.g. "1024x1024")
  if (/^\d+x\d+$/i.test(trimmed)) return trimmed;
  // Tier-based size ("1K", "2K") — resolve via map
  const tier = /^([1-4])[Kk]$/.test(trimmed)
    ? `${trimmed[0]!.toUpperCase()}K`
    : trimmed;
  const r = ratio ?? "1:1";
  return IMAGE_SIZE_MAP[tier]?.[r] ?? IMAGE_SIZE_MAP[tier]?.["1:1"] ?? "1024x1024";
}

function isTierSize(size: string | undefined): boolean {
  return Boolean(size && /^[1-4][Kk]$/.test(size.trim()));
}

/**
 * Body for OpenAI-compatible mid-stations (gpt-image-2 etc.).
 * - `size` is always `auto` or WIDTHxHEIGHT (OpenAI-strict channels).
 * - When UI picks a tier (1K/2K), also send `resolution` + `ratio` for relays
 *   that prefer aspect/tier over pixels.
 * - Reference images → JSON 仅 `image_urls`（严格中转勿多形状喷发）。
 */
function buildOpenAiCompatibleImageBody(input: {
  model: string;
  prompt: string;
  n: number;
  size?: string;
  ratio?: string;
  quality?: string;
  referenceImages: string[];
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: input.model,
    prompt: input.prompt,
    n: input.n,
    response_format: "b64_json",
  };

  const ratio = input.ratio?.trim() || undefined;
  body.size = resolveImageSize(input.size, ratio);
  if (isTierSize(input.size)) {
    body.resolution = input.size!.trim().toLowerCase();
  }
  if (ratio) body.ratio = ratio;

  if (input.quality) body.quality = input.quality;

  if (input.referenceImages.length > 0) {
    attachOpenAiReferenceFields(body, input.referenceImages);
  }

  return body;
}

/**
 * OpenAI 兼容 / async 中转：参考图只发 `image_urls`。
 * 勿再喷 `image` / `images`（Go DisallowUnknownFields 会 400）。
 */
function attachOpenAiReferenceFields(
  body: Record<string, unknown>,
  refs: string[],
): void {
  const urls = refs.map((s) => s.trim()).filter(Boolean);
  if (urls.length === 0) return;
  body.image_urls = urls;
}

function mimeToExt(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  return "png";
}

function parseDataUri(s: string): { bytes: Buffer; mime: string } | null {
  const m = /^data:([^;,]+)?;base64,([\s\S]+)$/i.exec(s.trim());
  if (!m) return null;
  return {
    mime: (m[1] || "image/png").trim(),
    bytes: Buffer.from(m[2]!, "base64"),
  };
}

/**
 * Mid-station upstream often cannot fetch CN object storage (TOS etc.).
 * Inline http(s) refs as data URIs so the image bytes travel with the request.
 */
async function resolveRefsForOpenAiRelay(
  refs: string[],
  signal?: AbortSignal,
): Promise<string[]> {
  const out: string[] = [];
  for (const ref of refs) {
    const trimmed = ref.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("data:")) {
      out.push(trimmed);
      continue;
    }
    if (/^https?:\/\//i.test(trimmed)) {
      const { bytes, mime } = await downloadBytes(trimmed, signal);
      const cleanMime = (mime.split(";")[0] || "image/jpeg").trim();
      out.push(`data:${cleanMime};base64,${bytes.toString("base64")}`);
      continue;
    }
    out.push(trimmed);
  }
  return out;
}

function appendOpenAiEditImageFiles(
  form: FormData,
  referenceImages: string[],
): number {
  let count = 0;
  for (let i = 0; i < referenceImages.length; i++) {
    const parsed = parseDataUri(referenceImages[i]!);
    if (!parsed) continue;
    const filename = `ref-${i}.${mimeToExt(parsed.mime)}`;
    const blob = new Blob([new Uint8Array(parsed.bytes)], {
      type: parsed.mime,
    });
    // OpenAI + relays: repeated field name `image` (single or multi)
    form.append("image", blob, filename);
    count += 1;
  }
  return count;
}

function buildOpenAiEditsForm(input: {
  model: string;
  prompt: string;
  n: number;
  size: string;
  ratio?: string;
  resolution?: string;
  quality?: string;
  referenceImages: string[];
}): FormData {
  const form = new FormData();
  form.append("model", input.model);
  form.append("prompt", input.prompt);
  form.append("n", String(input.n));
  form.append("size", input.size);
  form.append("response_format", "b64_json");
  if (input.quality) form.append("quality", input.quality);
  if (input.ratio) form.append("ratio", input.ratio);
  if (input.resolution) form.append("resolution", input.resolution);

  const refs = input.referenceImages;
  const fileCount = appendOpenAiEditImageFiles(form, refs);

  // Only when no file parts were attached: URL aliases for odd relays.
  // Never duplicate huge data-URI refs as image_url — that breaks async mid-stations
  // (multipart + base64 form fields → upstream 502).
  // Lean: only image_urls[] (no parallel image_url).
  if (fileCount === 0) {
    for (const ref of refs) {
      form.append("image_urls[]", ref);
    }
  }

  return form;
}

/** Map UI quality → async relay quality (auto | 2k | 4k). */
export function mapOpenAiAsyncQuality(
  quality: string | undefined,
  size?: string,
): "auto" | "2k" | "4k" {
  const q = (quality ?? "auto").trim().toLowerCase();
  if (q === "4k") return "4k";
  if (q === "2k") return "2k";
  if (q === "high" || q === "medium" || q === "low") return "auto";
  const tier = (size ?? "").trim().toLowerCase();
  if (tier === "4k") return "4k";
  if (tier === "2k") return "2k";
  return "auto";
}

/** Async relay uses ratio strings in `size`, not pixels. */
export function mapOpenAiAsyncSize(
  size: string | undefined,
  ratio: string | undefined,
): string {
  const candidate = (ratio ?? size ?? "16:9").trim();
  if (/^\d+:\d+$/.test(candidate)) return candidate;
  return "16:9";
}

function buildOpenAiAsyncImageBody(input: {
  model: string;
  prompt: string;
  n: number;
  size: string;
  quality: "auto" | "2k" | "4k";
}): Record<string, unknown> {
  return {
    model: input.model,
    prompt: input.prompt,
    n: input.n,
    response_format: "b64_json",
    size: input.size,
    quality: input.quality,
  };
}

/**
 * Async mid-station edits (doc: multipart only).
 * Fields: image×N + model/prompt/quality/size/n/response_format.
 * Do not send image_url / ratio / resolution — those confuse upstream channels.
 */
function buildOpenAiAsyncEditsForm(input: {
  model: string;
  prompt: string;
  n: number;
  size: string;
  quality: "auto" | "2k" | "4k";
  referenceImages: string[];
}): FormData {
  const form = new FormData();
  form.append("model", input.model);
  form.append("prompt", input.prompt);
  form.append("n", String(input.n));
  form.append("size", input.size);
  form.append("quality", input.quality);
  // Doc examples use url; poll result is typically { data: [{ url }] }.
  form.append("response_format", "url");
  const fileCount = appendOpenAiEditImageFiles(form, input.referenceImages);
  if (fileCount === 0) {
    throw new Error(
      "Image edits require at least one reference image file (multipart field `image`).",
    );
  }
  return form;
}

function openAiImageTaskErrorMessage(
  pollJson: unknown,
  fallback: string,
): string {
  if (!pollJson || typeof pollJson !== "object") return fallback;
  const err = (pollJson as Record<string, unknown>).error;
  if (typeof err === "string" && err.trim()) return err.trim();
  if (err && typeof err === "object") {
    const msg = (err as Record<string, unknown>).message;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  }
  const message = (pollJson as Record<string, unknown>).message;
  if (typeof message === "string" && message.trim()) return message.trim();
  return fallback;
}

/** Legacy short aliases → official dated Ark Seedream model id. */
function resolveSeedreamEndpointModelId(model: string): string {
  return canonicalizeSeedreamModelId(model);
}

/** `/v1` / `/v3` on official Ark → `/api/v3` (common mis-entry). */
function normalizeVolcengineArkApiPath(path: string): string {
  const p = (path || "").replace(/\/+$/, "") || "";
  if (!p || p === "/") return "/api/v3";
  if (p === "/v1" || p.startsWith("/v1/")) {
    return `/api/v3${p === "/v1" ? "" : p.slice("/v1".length)}`;
  }
  if (p === "/v3" || p.startsWith("/v3/")) {
    return `/api/v3${p === "/v3" ? "" : p.slice("/v3".length)}`;
  }
  return p;
}

/**
 * Official Ark image root is `/api/v3`. Host-only or mistaken `/v1` → fix.
 * Mid-station hosts are left unchanged.
 */
function ensureVolcengineArkImageRoot(baseUrl: string): string {
  let u = baseUrl.replace(/\/+$/, "");
  u = u
    .replace(/\/images\/generations$/i, "")
    .replace(/\/images\/edits$/i, "")
    .replace(/\/images\/tasks(\/[^/]*)?$/i, "");
  if (!isVolcengineArkImageBaseUrl(u)) return u;
  try {
    const parsed = new URL(u);
    const path = normalizeVolcengineArkApiPath(
      (parsed.pathname || "").replace(/\/+$/, ""),
    );
    return `${parsed.origin}${path}`.replace(/\/+$/, "");
  } catch {
    if (/\/api\/v3$/i.test(u)) return u;
    if (/\/v1$/i.test(u)) return u.replace(/\/v1$/i, "/api/v3");
    if (/\/v3$/i.test(u)) return u.replace(/\/v3$/i, "/api/v3");
    if (/\/v1\//i.test(u)) return u.replace(/\/v1\//i, "/api/v3/");
    if (/\/v3\//i.test(u)) return u.replace(/\/v3\//i, "/api/v3/");
    return `${u}/api/v3`;
  }
}

/**
 * Full request URL safety net for official Ark hosts.
 * Advanced mode uses the field as-is, so a leftover
 * `…/v1/images/generations` or `…/v3/images/generations` would 404 without this.
 */
function rewriteVolcengineArkImageRequestUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed || !isVolcengineArkImageBaseUrl(trimmed)) return trimmed;
  try {
    const parsed = new URL(trimmed);
    const path = normalizeVolcengineArkApiPath(
      (parsed.pathname || "").replace(/\/+$/, ""),
    );
    return `${parsed.origin}${path}${parsed.search}`;
  } catch {
    return trimmed
      .replace(/\/v1(?=\/|$)/i, "/api/v3")
      .replace(/\/v3(?=\/|$)/i, "/api/v3");
  }
}

/** UI 简写 → OpenAI gpt-image-*。 */
function resolveOpenAiImageEndpointModelId(model: string): string {
  const m = model.trim().toLowerCase();
  const map: Record<string, string> = {
    "2": "gpt-image-2",
    "image-2": "gpt-image-2",
    "gpt-image-2": "gpt-image-2",
    "1.5": "gpt-image-1.5",
    "image-1.5": "gpt-image-1.5",
    "gpt-image-1.5": "gpt-image-1.5",
    "1": "gpt-image-1",
    "image-1": "gpt-image-1",
    "gpt-image-1": "gpt-image-1",
  };
  return map[m] ?? model.trim();
}

/**
 * Volcengine Ark Seedream 推荐宽高（文档方式 2）。
 * 官方无独立 aspect_ratio：指定比例时把 分辨率+宽高比 换成 WxH。
 */
const SEEDREAM_PIXEL_MAP: Record<string, Record<string, string>> = {
  "2K": {
    "1:1": "2048x2048",
    "4:3": "2304x1728",
    "3:4": "1728x2304",
    "16:9": "2848x1600",
    "9:16": "1600x2848",
    "3:2": "2496x1664",
    "2:3": "1664x2496",
    "21:9": "3136x1344",
  },
  "3K": {
    "1:1": "3072x3072",
    "4:3": "3456x2592",
    "3:4": "2592x3456",
    "16:9": "4096x2304",
    "9:16": "2304x4096",
    "3:2": "3744x2496",
    "2:3": "2496x3744",
    "21:9": "4704x2016",
  },
  "4K": {
    "1:1": "4096x4096",
    "4:3": "4704x3520",
    "3:4": "3520x4704",
    "16:9": "5504x3040",
    "9:16": "3040x5504",
    "3:2": "4992x3328",
    "2:3": "3328x4992",
    "21:9": "6240x2656",
  },
};

/** Resolve Seedream `size` for API: tier (adaptive) or recommended WxH. */
export function resolveSeedreamSize(
  size: string | undefined,
  ratio?: string | undefined,
): string {
  const sizeRaw = (size ?? "2K").trim();
  if (/^\d+x\d+$/i.test(sizeRaw)) return sizeRaw;

  const tierMatch = sizeRaw.match(/^([1-4])[Kk]$/);
  const tier = tierMatch ? `${tierMatch[1]}K` : "2K";
  const r = (ratio ?? "").trim().toLowerCase();
  if (!r || r === "adaptive" || r === "auto" || r === "默认") {
    return tier;
  }
  return SEEDREAM_PIXEL_MAP[tier]?.[r] ?? SEEDREAM_PIXEL_MAP["2K"]?.[r] ?? tier;
}

/**
 * Volcengine Ark Seedream (`/images/generations`).
 * Docs: size 2K/4K or WxH; response_format url; optional image for i2i.
 * Aspect ratio: no dedicated field — use WxH (mode 2) or describe in prompt (mode 1).
 */
function buildVolcengineSeedreamBody(input: {
  model: string;
  prompt: string;
  n: number;
  size?: string;
  ratio?: string;
  watermark?: boolean;
  referenceImages: string[];
}): Record<string, unknown> {
  const size = resolveSeedreamSize(input.size, input.ratio);

  const body: Record<string, unknown> = {
    model: resolveSeedreamEndpointModelId(input.model),
    prompt: input.prompt,
    sequential_image_generation: input.n > 1 ? "auto" : "disabled",
    response_format: "url",
    size,
    stream: false,
    watermark: false,
  };

  if (input.n > 1) {
    body.sequential_image_generation_options = { max_images: input.n };
  }

  if (input.referenceImages.length === 1) {
    body.image = input.referenceImages[0];
  } else if (input.referenceImages.length > 1) {
    body.image = input.referenceImages;
  }

  return body;
}

function friendlyHttpError(status: number, body: string, requestUrl?: string): string {
  const snippet = body.slice(0, 300).trim();
  const where = requestUrl ? ` URL: ${requestUrl}` : "";
  if (status === 401 || status === 403) {
    // Many gateways reuse 403 for quota / group / channel errors — surface body.
    if (snippet) {
      return `Upstream ${status}: ${snippet}${where}`;
    }
    return `Authentication failed (${status}). Check API key.${where}`;
  }
  if (status === 404) {
    const arkHint = requestUrl && /volces\.com|volcengine/i.test(requestUrl)
      ? "即梦/方舟官方需 …/api/v3（不是裸 /v1 或 /v3）。"
      : "高级模式请填完整提交地址（如 …/v1/images/generations），或改用简单模式只填 API 根（…/v1）。";
    return `Endpoint not found (404). Check base URL。${arkHint}${
      snippet ? ` ${snippet}` : ""
    }${where}`;
  }
  return `Upstream request failed (${status}). ${snippet || "Unknown error."}${where}`;
}

/** Edits unsupported or rejected → try generations + image_urls JSON. */
function shouldFallbackImageEditsToGenerations(
  status: number,
  body: string,
): boolean {
  if (status === 404 || status === 405) return true;
  if (status !== 400) return false;
  return /请上传|参考图|reference image|original image|unsupported|not support|multipart/i.test(
    body,
  );
}

const OPENAI_IMAGE_TASK_PENDING = new Set([
  "queued",
  "pending",
  "processing",
  "running",
  "in_progress",
]);

const OPENAI_IMAGE_TASK_SUCCESS = new Set([
  "success",
  "completed",
  "succeeded",
  "done",
]);

const OPENAI_IMAGE_TASK_FAILED = new Set([
  "error",
  "failed",
  "failure",
  "cancelled",
  "canceled",
]);

function openAiImageTasksUrl(baseUrl: string, taskId: string): string {
  let u = baseUrl.replace(/\/+$/, "");
  u = u
    .replace(/\/images\/generations$/i, "")
    .replace(/\/images\/edits$/i, "")
    .replace(/\/images\/tasks(\/[^/]*)?$/i, "");
  return `${u}/images/tasks/${encodeURIComponent(taskId)}`;
}

function resolveOpenAiImageTaskPollUrl(
  baseUrl: string,
  json: unknown,
): string | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  const rawPoll = o.poll_url ?? o.pollUrl;
  if (typeof rawPoll === "string" && rawPoll.trim()) {
    const p = rawPoll.trim();
    if (/^https?:\/\//i.test(p)) return p;
    const root = baseUrl
      .replace(/\/+$/, "")
      .replace(/\/images\/(generations|edits|tasks(\/[^/]*)?)$/i, "");
    return `${root}${p.startsWith("/") ? p : `/${p}`}`;
  }
  const id = o.id ?? o.task_id;
  if (typeof id === "string" && id.trim()) {
    return openAiImageTasksUrl(baseUrl, id.trim());
  }
  return null;
}

function extractOpenAiImageDataList(
  json: unknown,
): Array<{ b64_json?: string; url?: string }> {
  if (typeof json !== "object" || !json) return [];
  const root = json as Record<string, unknown>;
  if ("data" in root && Array.isArray(root.data)) {
    return root.data as Array<{ b64_json?: string; url?: string }>;
  }
  const nested = root.result ?? root.output;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const n = nested as Record<string, unknown>;
    if ("data" in n && Array.isArray(n.data)) {
      return n.data as Array<{ b64_json?: string; url?: string }>;
    }
  }
  return [];
}

function isOpenAiAsyncImageSubmit(json: unknown): boolean {
  if (!json || typeof json !== "object") return false;
  if (extractOpenAiImageDataList(json).length > 0) return false;
  const o = json as Record<string, unknown>;
  if (o.object === "image.task") return true;
  const id = o.id ?? o.task_id;
  if (typeof id !== "string" || !id.trim()) return false;
  const status = String(o.status ?? "").toLowerCase();
  if (!status) return true;
  if (OPENAI_IMAGE_TASK_PENDING.has(status)) return true;
  return false;
}

async function pollOpenAiImageTask(input: {
  baseUrl: string;
  apiKey: string;
  submitJson: unknown;
  signal?: AbortSignal;
  timeoutMs: number;
  pollIntervalMs?: number;
}): Promise<unknown> {
  const pollUrl = resolveOpenAiImageTaskPollUrl(input.baseUrl, input.submitJson);
  if (!pollUrl) {
    throw new Error("Async image task response missing poll URL or task id");
  }

  let pollIntervalMs = input.pollIntervalMs ?? 4_000;
  const maxPollIntervalMs = 15_000;
  const deadline = Date.now() + input.timeoutMs;

  await sleep(Math.min(3_000, pollIntervalMs), input.signal);

  while (Date.now() < deadline) {
    const pollRes = await fetch(pollUrl, {
      headers: { Authorization: `Bearer ${input.apiKey}` },
      signal: input.signal,
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
        baseMs: 4_000,
        maxMs: maxPollIntervalMs,
        retryAfterHeaderMs: retryAfterMs(pollRes),
      });
      await sleep(pollIntervalMs, input.signal);
      continue;
    }

    if (!pollRes.ok) {
      throw new Error(
        friendlyHttpError(pollRes.status, pollText, pollUrl),
      );
    }

    const status = String(
      (pollJson as Record<string, unknown> | null)?.status ?? "",
    ).toLowerCase();

    if (
      OPENAI_IMAGE_TASK_SUCCESS.has(status) ||
      extractOpenAiImageDataList(pollJson).length > 0
    ) {
      return pollJson;
    }

    if (OPENAI_IMAGE_TASK_FAILED.has(status)) {
      const errMsg = openAiImageTaskErrorMessage(
        pollJson,
        pollText.slice(0, 300) || "生成失败",
      );
      throw new Error(`Image task failed: ${errMsg}`);
    }

    await sleep(pollIntervalMs, input.signal);
  }

  throw new Error("Image task polling timed out");
}

async function openAiImageDataToItems(
  json: unknown,
  signal?: AbortSignal,
): Promise<ImageGenItem[]> {
  const dataList = extractOpenAiImageDataList(json);
  if (dataList.length === 0) {
    throw new Error("Image response missing url/b64_json");
  }

  const items: ImageGenItem[] = [];
  for (const d of dataList) {
    if (d.b64_json) {
      items.push({
        bytes: Buffer.from(d.b64_json, "base64"),
        mime: "image/png",
        extension: "png",
      });
    } else if (d.url) {
      const downloaded = await downloadBytes(d.url, signal);
      const ext = downloaded.mime.includes("jpeg") ? "jpg" : "png";
      items.push({
        bytes: downloaded.bytes,
        mime: downloaded.mime,
        extension: ext,
        remoteUrl: d.url,
      });
    }
  }

  if (items.length === 0) {
    throw new Error("Image response missing url/b64_json");
  }
  return items;
}

async function finalizeOpenAiImageResponse(input: {
  json: unknown;
  baseUrl: string;
  apiKey: string;
  started: number;
  signal?: AbortSignal;
  timeoutMs: number;
}): Promise<ImageGenResult> {
  let json = input.json;
  if (isOpenAiAsyncImageSubmit(json)) {
    json = await pollOpenAiImageTask({
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
      submitJson: json,
      signal: input.signal,
      timeoutMs: input.timeoutMs,
    });
  }

  const items = await openAiImageDataToItems(json, input.signal);
  return {
    ...items[0]!,
    latencyMs: Date.now() - input.started,
    images: items.length > 1 ? items.slice(1) : undefined,
    usage: extractUsageFromResponse(json),
  };
}

async function generateOpenAiAsyncImage(
  options: ImageGenOptions,
  started: number,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<ImageGenResult> {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const n = 1;
  const openaiModel = resolveOpenAiImageEndpointModelId(options.model);
  const asyncSize = mapOpenAiAsyncSize(options.size, options.ratio);
  const asyncQuality = mapOpenAiAsyncQuality(options.quality, options.size);
  const referenceImages = (options.referenceImages ?? [])
    .map((s) => s.trim())
    .filter(Boolean);
  const relayRefs =
    referenceImages.length > 0
      ? await resolveRefsForOpenAiRelay(referenceImages, signal)
      : [];

  const jsonBody = buildOpenAiAsyncImageBody({
    model: openaiModel,
    prompt: options.prompt,
    n,
    size: asyncSize,
    quality: asyncQuality,
  });

  const postGenerations = (withRefs = false) => {
    const body: Record<string, unknown> = { ...jsonBody };
    if (withRefs && relayRefs.length > 0) {
      attachOpenAiReferenceFields(body, relayRefs);
    }
    const url = imageEndpointUrl(baseUrl, "/images/generations");
    emitImageHttpLog(options, url, {
      ...body,
      ...(withRefs && relayRefs.length > 0
        ? {
            _refCount: relayRefs.length,
            _note: "async generations + reference fields",
          }
        : {
            _note:
              "异步：提交后轮询 GET /images/tasks/{id}（或 poll_url）直至 completed",
          }),
    });
    return fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
  };

  const postEdits = () => {
    const url = imageEndpointUrl(baseUrl, "/images/edits");
    emitImageHttpLog(options, url, {
      model: openaiModel,
      prompt: options.prompt,
      n,
      response_format: "url",
      size: asyncSize,
      quality: asyncQuality,
      _multipart: "image × N (repeated field `image`)",
      _refCount: relayRefs.length,
      _note:
        "异步：multipart /images/edits（仅文件，无 image_url），轮询 /images/tasks/{id}",
    });
    return fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: buildOpenAiAsyncEditsForm({
        model: openaiModel,
        prompt: options.prompt,
        n,
        size: asyncSize,
        quality: asyncQuality,
        referenceImages: relayRefs,
      }),
      signal,
    });
  };

  let requestUrl: string;
  let response: Response;
  let text: string;

  const networkErr = (error: unknown) => {
    const message =
      error instanceof Error
        ? error.name === "TimeoutError" || error.name === "AbortError"
          ? `Request timed out (${timeoutMs}ms).`
          : `Network error: ${error.message}`
        : "Network error";
    throw new Error(message);
  };

  if (relayRefs.length > 0) {
    requestUrl = imageEndpointUrl(baseUrl, "/images/edits");
    response = await postEdits().catch(networkErr);
    text = await response.text();
    if (shouldFallbackImageEditsToGenerations(response.status, text)) {
      requestUrl = imageEndpointUrl(baseUrl, "/images/generations");
      response = await postGenerations(true).catch(networkErr);
      text = await response.text();
    }
  } else {
    requestUrl = imageEndpointUrl(baseUrl, "/images/generations");
    response = await postGenerations(false).catch(networkErr);
    text = await response.text();
  }

  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new Error(friendlyHttpError(response.status, text, requestUrl));
  }

  return finalizeOpenAiImageResponse({
    json,
    baseUrl,
    apiKey: options.apiKey,
    started,
    signal,
    timeoutMs,
  });
}

async function downloadBytes(
  url: string,
  signal?: AbortSignal,
  headers?: Record<string, string>,
): Promise<{ bytes: Buffer; mime: string }> {
  const res = await fetch(url, { signal, headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const snippet = body.slice(0, 200).trim();
    throw new Error(
      `Failed to download media (${res.status})${snippet ? `: ${snippet}` : ""}`,
    );
  }
  const mime = res.headers.get("content-type") ?? "application/octet-stream";
  const ab = await res.arrayBuffer();
  return { bytes: Buffer.from(ab), mime };
}

/**
 * xAI Grok image generation/edit
 * https://docs.x.ai/developers/rest-api-reference/inference/images
 *
 * - Generations: POST /v1/images/generations（JSON）
 * - Edits 官方：POST /v1/images/edits，JSON `image` / `images`
 * - Edits 中转多图：multipart 重复字段 `image`——多数中转不实现官方 `images[]`，
 *   且双 data URI 塞进 JSON 易触发网关 502（Upstream unavailable）
 */
async function generateGrokImage(
  options: ImageGenOptions,
  started: number,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<ImageGenResult> {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const referenceImages = (options.referenceImages ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);

  const hasEditImage = referenceImages.length > 0;
  const action = hasEditImage ? "/images/edits" : "/images/generations";
  const url = imageEndpointUrl(baseUrl, action);
  const n = options.n ?? 1;
  // Prefer explicit aspectRatio; fall back to OpenAI-style `ratio` if UI lagged.
  const aspectRatio =
    options.aspectRatio?.trim() || options.ratio?.trim() || undefined;
  const resolutionRaw =
    options.resolution?.trim() ||
    (isTierSize(options.size) ? options.size!.trim() : undefined);
  const resolution = resolutionRaw?.toLowerCase() || undefined;
  const officialHost = isXaiOfficialImageBaseUrl(baseUrl);
  const multiRelay = hasEditImage && !officialHost && referenceImages.length > 1;
  const refsAllHttp = referenceImages.every((r) => /^https?:\/\//i.test(r));
  // 中转多图：公网 URL 优先官方 JSON（aspect_ratio 更易透传）；data URI 仍 multipart 防 502
  const preferRelayJson = multiRelay && refsAllHttp;
  const useRelayMultipart = multiRelay && !preferRelayJson;

  const networkErr = (error: unknown) => {
    const message =
      error instanceof Error
        ? error.name === "TimeoutError" || error.name === "AbortError"
          ? `Request timed out (${timeoutMs}ms).`
          : `Network error: ${error.message}`
        : "Network error";
    throw new Error(message);
  };

  const buildJsonBody = (): Record<string, unknown> => {
    const body: Record<string, unknown> = {
      model: options.model,
      prompt: options.prompt,
    };
    if (n > 1) body.n = n;
    if (aspectRatio) body.aspect_ratio = aspectRatio;
    if (resolution === "1k" || resolution === "2k") {
      body.resolution = resolution;
    }
    if (options.responseFormat) body.response_format = options.responseFormat;

    if (hasEditImage) {
      const imageObjs = referenceImages.map((ref) => ({
        url: ref,
        type: "image_url",
      }));
      if (imageObjs.length === 1) {
        body.image = imageObjs[0];
      } else {
        // 官方多参考图：prompt 用 <IMAGE_0>、<IMAGE_1>…
        body.images = imageObjs;
      }
    }
    return body;
  };

  const postMultipart = async (): Promise<Response> => {
    const relayRefs = await resolveRefsForOpenAiRelay(referenceImages, signal);
    const form = new FormData();
    form.append("model", options.model);
    form.append("prompt", options.prompt);
    if (n > 1) form.append("n", String(n));
    if (aspectRatio) {
      form.append("aspect_ratio", aspectRatio);
      form.append("ratio", aspectRatio);
    }
    if (resolution === "1k" || resolution === "2k") {
      form.append("resolution", resolution);
    }
    if (options.responseFormat) {
      form.append("response_format", options.responseFormat);
    }
    const fileCount = appendOpenAiEditImageFiles(form, relayRefs);
    if (fileCount === 0) {
      throw new Error(
        "Grok 多图参考需要可解析的图片（data URI / 可下载 URL）。中转站多图请用 multipart 字段 image。",
      );
    }

    emitImageHttpLog(options, url, {
      model: options.model,
      prompt: options.prompt,
      ...(n > 1 ? { n } : {}),
      ...(aspectRatio ? { aspect_ratio: aspectRatio, ratio: aspectRatio } : {}),
      ...(resolution === "1k" || resolution === "2k"
        ? { resolution }
        : {}),
      _multipart: "image x N (repeated field)",
      _refCount: fileCount,
      _note:
        "中转多图：multipart（官方 images[] 多数中转未实现，双 data URI JSON 易 502）",
    });

    return fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${options.apiKey}` },
      body: form,
      signal,
    }).catch(networkErr);
  };

  const postJson = async (
    body: Record<string, unknown>,
    note?: string,
  ): Promise<Response> => {
    emitImageHttpLog(
      options,
      url,
      note ? { ...body, _note: note } : body,
    );
    return fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    }).catch(networkErr);
  };

  let response: Response;

  if (preferRelayJson) {
    const body = buildJsonBody();
    response = await postJson(
      body,
      "中转多图：公网 URL → 官方 JSON images[]（便于透传 aspect_ratio；失败再试 multipart）",
    );
    if (!response.ok && response.status !== 401 && response.status !== 403) {
      // 多数中转未实现 images[]：回退 multipart，不丢掉这次编辑
      response = await postMultipart();
    }
  } else if (useRelayMultipart) {
    response = await postMultipart();
  } else {
    response = await postJson(buildJsonBody());
  }

  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    const hint =
      response.status === 502 && hasEditImage && referenceImages.length > 1
        ? "（多图参考：若走中转，请确认已支持 multipart 多文件，或改用官方 api.x.ai）"
        : "";
    throw new Error(`${friendlyHttpError(response.status, text, url)}${hint}`);
  }

  const items = await openAiImageDataToItems(json, signal);
  return {
    ...items[0]!,
    latencyMs: Date.now() - started,
    images: items.length > 1 ? items.slice(1) : undefined,
    usage: extractUsageFromResponse(json),
  };
}

function isXaiOfficialImageBaseUrl(baseUrl: string): boolean {
  try {
    const host = new URL(
      baseUrl.includes("://") ? baseUrl : `https://${baseUrl}`,
    ).hostname.toLowerCase();
    return host === "api.x.ai" || host.endsWith(".api.x.ai");
  } catch {
    return baseUrl.toLowerCase().includes("api.x.ai");
  }
}

/** Google Gemini Image (Nano Banana) Developer API host. */
export function isGoogleGeminiImageBaseUrl(
  baseUrl: string | null | undefined,
): boolean {
  if (!baseUrl) return false;
  const u = baseUrl.toLowerCase();
  return (
    u.includes("generativelanguage.googleapis.com") ||
    u.includes("ai.google.dev") ||
    u.startsWith("gemini://") ||
    u.startsWith("google://")
  );
}

function isNanoBananaModel(model: string): boolean {
  const m = model.toLowerCase();
  return (
    m.includes("flash-image") ||
    m.includes("pro-image") ||
    m.includes("flash-lite-image") ||
    m.includes("nano-banana")
  );
}

function resolveGeminiImageBase(baseUrl: string): string {
  let u = baseUrl.replace(/\/+$/, "");
  if (u.startsWith("gemini://") || u.startsWith("google://")) {
    return "https://generativelanguage.googleapis.com/v1beta";
  }
  // Strip OpenAI-compat suffix if user pasted text.gemini URL
  u = u.replace(/\/openai\/?$/i, "");
  if (!/\/v1beta$/i.test(u) && u.includes("generativelanguage.googleapis.com")) {
    u = u.replace(/\/v1(beta)?\/?$/i, "") + "/v1beta";
  }
  return u;
}

function geminiGenerateContentUrl(baseUrl: string, model: string): string {
  const base = resolveGeminiImageBase(baseUrl);
  if (/:generateContent/i.test(base)) return base;
  if (/\/models\//i.test(base)) {
    return base.includes(":generateContent")
      ? base
      : `${base}:generateContent`;
  }
  return `${base}/models/${encodeURIComponent(model)}:generateContent`;
}

function normalizeGeminiImageSize(size: string | undefined): string | undefined {
  if (!size) return "1K";
  const t = size.trim().toUpperCase();
  if (t === "512" || t === "1K" || t === "2K" || t === "4K") return t;
  if (/^[1-4]K$/.test(t)) return t;
  return "1K";
}

async function refToGeminiInlinePart(
  ref: string,
  signal?: AbortSignal,
): Promise<{ inline_data: { mime_type: string; data: string } }> {
  const trimmed = ref.trim();
  const dataUri = /^data:([^;]+);base64,(.+)$/i.exec(trimmed);
  if (dataUri) {
    return {
      inline_data: {
        mime_type: dataUri[1] || "image/png",
        data: dataUri[2]!,
      },
    };
  }
  if (/^https?:\/\//i.test(trimmed)) {
    const downloaded = await downloadBytes(trimmed, signal);
    return {
      inline_data: {
        mime_type: downloaded.mime.split(";")[0]?.trim() || "image/png",
        data: downloaded.bytes.toString("base64"),
      },
    };
  }
  // Assume raw base64
  return {
    inline_data: {
      mime_type: "image/png",
      data: trimmed,
    },
  };
}

function extractGeminiInlineImages(json: unknown): ImageGenItem[] {
  const candidates =
    (json as { candidates?: Array<{ content?: { parts?: unknown[] } }> })
      ?.candidates ?? [];
  const items: ImageGenItem[] = [];
  for (const c of candidates) {
    const parts = c.content?.parts ?? [];
    for (const part of parts) {
      if (!part || typeof part !== "object") continue;
      const p = part as {
        inlineData?: { mimeType?: string; data?: string };
        inline_data?: { mime_type?: string; data?: string };
      };
      const data = p.inlineData?.data ?? p.inline_data?.data;
      const mime =
        p.inlineData?.mimeType ??
        p.inline_data?.mime_type ??
        "image/png";
      if (!data) continue;
      const extension = mime.includes("jpeg") || mime.includes("jpg")
        ? "jpg"
        : mime.includes("webp")
          ? "webp"
          : "png";
      items.push({
        bytes: Buffer.from(data, "base64"),
        mime,
        extension,
      });
    }
  }
  return items;
}

async function generateGoogleNanoBananaImage(
  options: ImageGenOptions,
  started: number,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<ImageGenResult> {
  const referenceImages = (options.referenceImages ?? [])
    .map((s) => s.trim())
    .filter(Boolean);
  const parts: Array<Record<string, unknown>> = [
    { text: options.prompt },
  ];
  for (const ref of referenceImages) {
    parts.push(await refToGeminiInlinePart(ref, signal));
  }

  const imageSize = normalizeGeminiImageSize(options.size);
  const aspectRatio =
    options.ratio?.trim() ||
    (/^\d+:\d+$/.test(String(options.size ?? ""))
      ? String(options.size).trim()
      : "1:1");

  const body: Record<string, unknown> = {
    contents: [
      {
        role: "user",
        parts,
      },
    ],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: {
        aspectRatio,
        ...(imageSize ? { imageSize } : {}),
      },
    },
  };

  const url = geminiGenerateContentUrl(options.baseUrl, options.model);
  emitImageHttpLog(options, url, {
    ...body,
    contents: [
      {
        role: "user",
        parts: parts.map((p) =>
          "inlineData" in p || "inline_data" in p
            ? { inlineData: "[omitted image part]" }
            : p,
        ),
      },
    ],
  });
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": options.apiKey,
      Authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  }).catch((error: unknown) => {
    const message =
      error instanceof Error
        ? error.name === "TimeoutError" || error.name === "AbortError"
          ? `Request timed out (${timeoutMs}ms).`
          : `Network error: ${error.message}`
        : "Network error";
    throw new Error(message);
  });

  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new Error(
      `Google Nano Banana failed (${response.status}): ${text.slice(0, 400)}`,
    );
  }

  const errMsg = (json as { error?: { message?: string } } | null)?.error
    ?.message;
  if (errMsg) {
    throw new Error(`Google Nano Banana error: ${errMsg}`);
  }

  const items = extractGeminiInlineImages(json);
  if (items.length === 0) {
    throw new Error(
      `Google Nano Banana response missing image: ${text.slice(0, 400)}`,
    );
  }

  return {
    ...items[0]!,
    latencyMs: Date.now() - started,
    images: items.length > 1 ? items.slice(1) : undefined,
    usage: extractUsageFromResponse(json),
  };
}

export async function generateImage(
  options: ImageGenOptions,
): Promise<ImageGenResult> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? 300_000; // 图片默认 5 分钟
  const signal =
    options.signal ??
    (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(timeoutMs)
      : undefined);
  // 单条任务固定 1 张；多张应拆成多条任务
  const n = 1;

  if (options.baseUrl.startsWith("mock://")) {
    emitImageHttpLog(options, "mock://image/images/generations", {
      model: options.model,
      prompt: options.prompt,
      n,
    });
    await new Promise((r) => setTimeout(r, 200));
    const items: ImageGenItem[] = Array.from({ length: n }, () => ({
      bytes: TINY_PNG,
      mime: "image/png",
      extension: "png",
      remoteUrl: "mock://image",
    }));
    return {
      ...items[0]!,
      latencyMs: Date.now() - started,
      images: n > 1 ? items.slice(1) : undefined,
      usage: {
        promptTokens: 8,
        completionTokens: n,
        totalTokens: 8 + n,
      },
    };
  }

  const baseUrlResolved = normalizeBaseUrl(
    resolveApiBaseUrl(options.baseUrl, options.apiFormat ?? ""),
  );
  let baseUrl = baseUrlResolved;
  const dialect = resolveImageDialect(
    options.apiFormat,
    baseUrl,
    options.model,
  );
  if (dialect === "seedream") {
    baseUrl = ensureVolcengineArkImageRoot(baseUrl);
  }
  const resolvedOptions: ImageGenOptions = { ...options, baseUrl };

  if (dialect === "google") {
    return generateGoogleNanoBananaImage(
      resolvedOptions,
      started,
      signal,
      timeoutMs,
    );
  }

  const referenceImages = (options.referenceImages ?? [])
    .map((s) => s.trim())
    .filter(Boolean);

  if (dialect === "openai-async") {
    return generateOpenAiAsyncImage(
      resolvedOptions,
      started,
      signal,
      timeoutMs,
    );
  }

  if (dialect === "dashscope-wanxiang") {
    return generateDashScopeWanxiangImage(
      resolvedOptions,
      started,
      signal,
      timeoutMs,
    );
  }

  if (dialect === "grok") {
    return generateGrokImage(resolvedOptions, started, signal, timeoutMs);
  }

  // Agnes rejects top-level response_format; use return_base64 / extra_body instead.
  // OpenAI-compatible mid-stations: prefer /images/edits with refs, else /generations.
  // Volcengine Seedream / 智谱 CogView: JSON /images/generations.
  // 高级：原样使用所填提交 URL；简单：根 + /images/generations。
  const formatId = options.apiFormat ?? "";
  const urlMode =
    options.baseUrlMode ??
    inferApiBaseUrlMode(options.baseUrl, formatId);
  let requestUrl =
    urlMode === "advanced"
      ? resolveApiActionUrl(options.baseUrl, formatId, "advanced")
      : imageEndpointUrl(baseUrl, "/images/generations");
  if (isVolcengineArkImageBaseUrl(requestUrl)) {
    requestUrl = rewriteVolcengineArkImageRequestUrl(requestUrl);
  }
  let fetchInit: RequestInit;

  if (dialect === "zhipu") {
    const relayRefs =
      referenceImages.length > 0
        ? await resolveRefsForOpenAiRelay(referenceImages, signal)
        : [];
    const body: Record<string, unknown> = {
      model: options.model,
      prompt: options.prompt,
      size: resolveZhipuImageSize(options.size, options.model),
      quality: resolveZhipuImageQuality(options.quality, options.model),
      watermark_enabled: false,
    };
    if (relayRefs.length === 1) {
      body.image = relayRefs[0];
    } else if (relayRefs.length > 1) {
      body.image = relayRefs;
    }
    fetchInit = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    };
  } else if (dialect === "agnes") {
    const body: Record<string, unknown> = {
      model: options.model,
      prompt: options.prompt,
      n,
      size: options.size ?? "1K",
      ...(options.ratio ? { ratio: options.ratio } : {}),
      return_base64: true,
      ...(referenceImages.length > 0
        ? { extra_body: { image: referenceImages } }
        : {}),
    };
    fetchInit = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    };
  } else if (dialect === "seedream") {
    const body = buildVolcengineSeedreamBody({
      model: options.model,
      prompt: options.prompt,
      n,
      size: options.size,
      ratio: options.ratio,
      watermark: false,
      referenceImages,
    });
    fetchInit = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    };
  } else {
    // OpenAI-compatible: inline remote refs so mid-stations need not fetch TOS.
    const openaiModel =
      options.apiFormat === "image.openai" ||
      options.apiFormat === "image.openai-compatible" ||
      options.model.toLowerCase().startsWith("gpt-image")
        ? resolveOpenAiImageEndpointModelId(options.model)
        : options.model;
    const relayRefs =
      referenceImages.length > 0
        ? await resolveRefsForOpenAiRelay(referenceImages, signal)
        : [];
    const jsonBody = buildOpenAiCompatibleImageBody({
      model: openaiModel,
      prompt: options.prompt,
      n,
      size: options.size,
      ratio: options.ratio,
      quality: options.quality,
      referenceImages: relayRefs,
    });

    const generationsUrl = requestUrl;
    const editsUrl = (() => {
      if (urlMode === "advanced") {
        if (/\/images\/generations$/i.test(generationsUrl)) {
          return generationsUrl.replace(/\/images\/generations$/i, "/images/edits");
        }
        const advanced = resolveApiActionUrl(options.baseUrl, formatId, "advanced");
        if (/\/images\/generations$/i.test(advanced)) {
          return advanced.replace(/\/images\/generations$/i, "/images/edits");
        }
        return imageEndpointUrl(advanced, "/images/edits");
      }
      return imageEndpointUrl(baseUrl, "/images/edits");
    })();
    const resolvedGenerationsUrl = isVolcengineArkImageBaseUrl(generationsUrl)
      ? rewriteVolcengineArkImageRequestUrl(generationsUrl)
      : generationsUrl;
    const resolvedEditsUrl = isVolcengineArkImageBaseUrl(editsUrl)
      ? rewriteVolcengineArkImageRequestUrl(editsUrl)
      : editsUrl;

    const postGenerations = () => {
      const url = resolvedGenerationsUrl;
      emitImageHttpLog(options, url, jsonBody);
      return fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(jsonBody),
        signal,
      });
    };

    const postEdits = () => {
      const resolution = isTierSize(options.size)
        ? options.size!.trim().toLowerCase()
        : undefined;
      const url = resolvedEditsUrl;
      emitImageHttpLog(options, url, {
        model: openaiModel,
        prompt: options.prompt,
        n,
        size: String(jsonBody.size ?? "1024x1024"),
        ...(options.ratio ? { ratio: options.ratio } : {}),
        ...(resolution ? { resolution } : {}),
        ...(options.quality ? { quality: options.quality } : {}),
        _multipart: "image × N (repeated field)",
        _refCount: relayRefs.length,
      });
      return fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
        },
        body: buildOpenAiEditsForm({
          model: openaiModel,
          prompt: options.prompt,
          n,
          size: String(jsonBody.size ?? "1024x1024"),
          ratio: options.ratio,
          resolution,
          quality: options.quality,
          referenceImages: relayRefs,
        }),
        signal,
      });
    };

    // With refs: prefer POST /images/edits (multipart); fall back to /generations.
    const networkErr = (error: unknown) => {
      const message =
        error instanceof Error
          ? error.name === "TimeoutError" || error.name === "AbortError"
            ? `Request timed out (${timeoutMs}ms).`
            : `Network error: ${error.message}`
          : "Network error";
      throw new Error(message);
    };

    let response: Response;
    let text: string;

    if (relayRefs.length > 0) {
      requestUrl = resolvedEditsUrl;
      response = await postEdits().catch(networkErr);
      text = await response.text();
      if (shouldFallbackImageEditsToGenerations(response.status, text)) {
        requestUrl = resolvedGenerationsUrl;
        response = await postGenerations().catch(networkErr);
        text = await response.text();
      }
    } else {
      requestUrl = resolvedGenerationsUrl;
      response = await postGenerations().catch(networkErr);
      text = await response.text();
    }

    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (!response.ok) {
      throw new Error(friendlyHttpError(response.status, text, requestUrl));
    }

    return finalizeOpenAiImageResponse({
      json,
      baseUrl,
      apiKey: options.apiKey,
      started,
      signal,
      timeoutMs,
    });
  }

  {
    let logBody: Record<string, unknown> = {};
    if (typeof fetchInit.body === "string") {
      try {
        logBody = JSON.parse(fetchInit.body) as Record<string, unknown>;
      } catch {
        logBody = { _raw: fetchInit.body.slice(0, 200) };
      }
    }
    emitImageHttpLog(options, requestUrl, logBody);
  }

  let response = await fetch(requestUrl, fetchInit).catch(
    (error: unknown) => {
      const message =
        error instanceof Error
          ? error.name === "TimeoutError" || error.name === "AbortError"
            ? `Request timed out (${timeoutMs}ms).`
            : `Network error: ${error.message}`
          : "Network error";
      throw new Error(message);
    },
  );

  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new Error(friendlyHttpError(response.status, text, requestUrl));
  }

  const dataList =
    typeof json === "object" &&
    json &&
    "data" in json &&
    Array.isArray((json as { data: unknown }).data)
      ? (json as { data: Array<{ b64_json?: string; url?: string }> }).data
      : [];

  if (dataList.length === 0) {
    throw new Error("Image response missing url/b64_json");
  }

  const items: ImageGenItem[] = [];
  for (const d of dataList) {
    if (d.b64_json) {
      items.push({
        bytes: Buffer.from(d.b64_json, "base64"),
        mime: "image/png",
        extension: "png",
      });
    } else if (d.url) {
      const downloaded = await downloadBytes(d.url, signal);
      const ext = downloaded.mime.includes("jpeg") ? "jpg" : "png";
      items.push({
        bytes: downloaded.bytes,
        mime: downloaded.mime,
        extension: ext,
        remoteUrl: d.url,
      });
    }
  }

  if (items.length === 0) {
    throw new Error("Image response missing url/b64_json");
  }

  return {
    ...items[0]!,
    latencyMs: Date.now() - started,
    images: items.length > 1 ? items.slice(1) : undefined,
    usage: extractUsageFromResponse(json),
  };
}

export { downloadBytes };
