/**
 * OpenAI-compatible image generation.
 * Also supports mock:// base URLs for local demos without a provider.
 * Volcengine Ark Seedream uses response_format=url + size 2K/4K.
 */

import {
  canonicalizeSeedreamModelId,
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
  /**
   * 图生图参考图（公网 URL 或 data URI）。
   * - Agnes → `extra_body.image` 数组
   * - OpenAI 兼容（中转站）→ 顶层 `image`（单张字符串 / 多张数组）
   * - Seedream → 顶层 `image`（单张字符串 / 多张数组）
   */
  referenceImages?: string[];
  /** Seedream watermark — always false (not exposed in UI). */
  watermark?: boolean;
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
  if (fmt === "image.openai-async" || fmt === "image.shiguang") {
    return "openai-async";
  }
  if (
    fmt === "image.openai" ||
    fmt === "image.openai-compatible" ||
    fmt === "image.mock"
  ) {
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
  return "openai";
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
 * - Reference images → `image_urls` (required by many relays) + `image` fallback.
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

/** Attach i2i refs in the shapes mid-stations commonly accept. */
function attachOpenAiReferenceFields(
  body: Record<string, unknown>,
  refs: string[],
): void {
  // Primary: image_urls (APIMart / 多数 gpt-image-2 中转)
  body.image_urls = refs;
  body.images = refs;
  // Many relays expect `image` as a string for one ref, array for multi
  body.image = refs.length === 1 ? refs[0]! : refs;
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

  // Only when no file parts were attached: keep URL aliases for odd relays.
  // Never duplicate huge data-URI refs as image_url — that breaks async mid-stations
  // (multipart + base64 form fields → upstream 502).
  if (fileCount === 0) {
    if (refs.length === 1) {
      form.append("image_url", refs[0]!);
    }
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
    const path = (parsed.pathname || "").replace(/\/+$/, "") || "";
    if (!path || path === "/" || path === "/v1") {
      return `${parsed.origin}/api/v3`;
    }
    return `${parsed.origin}${path}`.replace(/\/+$/, "");
  } catch {
    if (/\/api\/v3$/i.test(u)) return u;
    if (/\/v1$/i.test(u)) return u.replace(/\/v1$/i, "/api/v3");
    return `${u}/api/v3`;
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
    return `Endpoint not found (404). Check base URL (Seedream 需 …/api/v3)。${
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
): Promise<{ bytes: Buffer; mime: string }> {
  const res = await fetch(url, { signal });
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

  // Agnes rejects top-level response_format; use return_base64 / extra_body instead.
  // OpenAI-compatible mid-stations: prefer /images/edits with refs, else /generations.
  // Volcengine Seedream / 智谱 CogView: JSON /images/generations.
  let requestUrl = imageEndpointUrl(baseUrl, "/images/generations");
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

    const postGenerations = () => {
      const url = imageEndpointUrl(baseUrl, "/images/generations");
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
      const url = imageEndpointUrl(baseUrl, "/images/edits");
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
      requestUrl = imageEndpointUrl(baseUrl, "/images/edits");
      response = await postEdits().catch(networkErr);
      text = await response.text();
      if (shouldFallbackImageEditsToGenerations(response.status, text)) {
        requestUrl = imageEndpointUrl(baseUrl, "/images/generations");
        response = await postGenerations().catch(networkErr);
        text = await response.text();
      }
    } else {
      requestUrl = imageEndpointUrl(baseUrl, "/images/generations");
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
