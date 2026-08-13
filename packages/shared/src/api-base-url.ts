/**
 * Base URL 简单 / 高级模式（文本 chat + 图片 / 视频 / 语音 / 音乐）。
 *
 * 文本（DeepSeek 等）：
 *   简单 = host（https://api.deepseek.com）→ 请求时自动补 /v1/chat/completions
 *   高级 = 默认填「简单」补全后的完整 URL，可再改；请求时原样使用
 *
 * 图片 / 视频等：
 *   简单 = API 根（https://ark.cn-beijing.volces.com/api/v3）→ 请求时拼协议 action
 *   高级 = 默认填完整 action URL，可再改；请求时原样使用
 */

import { getApiFormat } from "./api-formats";
import {
  formatSupportsChatBaseUrlMode,
  inferChatBaseUrlMode,
  resolveChatCompletionsUrl,
  toSimpleChatBaseUrl,
  type ChatBaseUrlMode,
} from "./chat-url";

export type ApiBaseUrlMode = ChatBaseUrlMode;

const DEFAULT_V1_ROOT = "/v1";

function joinOriginAndPath(origin: string, path: string): string {
  const o = origin.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${o}${p}`.replace(/\/+$/, "");
}

function parseUrlSafe(raw: string): URL | null {
  try {
    return new URL(raw.trim());
  } catch {
    return null;
  }
}

function normalizePath(path: string): string {
  const p = path.trim();
  if (!p || p === "/") return "";
  const withSlash = p.startsWith("/") ? p : `/${p}`;
  return withSlash.replace(/\/+$/, "");
}

/** Whether this API format shows 简单 / 高级 Base URL toggle. */
export function formatSupportsApiBaseUrlMode(apiFormatId: string): boolean {
  if (formatSupportsChatBaseUrlMode(apiFormatId)) return true;
  if (!apiFormatId) return false;
  const fmt = getApiFormat(apiFormatId);
  if (!fmt) return false;
  if (fmt.modality === "text") return false;
  if (fmt.tier === "extended" && fmt.id.endsWith(".mock")) return false;
  return (
    fmt.modality === "image" ||
    fmt.modality === "video" ||
    fmt.modality === "audio" ||
    fmt.modality === "music"
  );
}

function apiRootPathForFormat(apiFormatId: string): string | null {
  if (formatSupportsChatBaseUrlMode(apiFormatId)) return null;
  const fmt = getApiFormat(apiFormatId);
  if (fmt?.apiRootPath?.trim()) {
    return normalizePath(fmt.apiRootPath);
  }
  if (
    apiFormatId.endsWith(".openai") ||
    apiFormatId.endsWith(".openai-compatible") ||
    apiFormatId.endsWith(".openai-videos") ||
    apiFormatId.endsWith(".openai-generations")
  ) {
    return DEFAULT_V1_ROOT;
  }
  const suggested = fmt?.suggestedBaseUrl?.trim();
  if (suggested) {
    const u = parseUrlSafe(suggested);
    if (u) {
      const path = normalizePath(u.pathname || "");
      if (path) return path;
    }
  }
  return null;
}

function apiActionPathForFormat(apiFormatId: string): string | null {
  if (formatSupportsChatBaseUrlMode(apiFormatId)) return null;
  const fmt = getApiFormat(apiFormatId);
  if (fmt?.apiActionPath?.trim()) {
    return normalizePath(fmt.apiActionPath);
  }
  // Sensible defaults by modality / dialect
  if (apiFormatId.startsWith("image.") && !apiFormatId.includes("google")) {
    return "/images/generations";
  }
  if (apiFormatId === "video.volcengine-seedance" || apiFormatId === "video.volcengine-wan") {
    return "/contents/generations/tasks";
  }
  if (apiFormatId === "video.kling") return "/videos/text2video";
  // Default preview path is H3 v2; Hailuo v1 still used at runtime when model ≠ MiniMax-H3
  if (apiFormatId === "video.minimax-hailuo") return "/v2/video_generation";
  if (apiFormatId === "video.vidu") return "/text2video";
  if (
    apiFormatId === "video.zhipu-cogvideox" ||
    apiFormatId === "video.openai-generations" ||
    apiFormatId === "video.openai-compatible"
  ) {
    return "/videos/generations";
  }
  if (apiFormatId === "video.openai-videos" || apiFormatId === "video.agnes") {
    return "/videos";
  }
  if (apiFormatId === "audio.minimax") return "/t2a_v2";
  if (apiFormatId === "audio.xiaomi-mimo") return "/chat/completions";
  if (apiFormatId === "music.minimax") return "/music_generation";
  return null;
}

function stripKnownActionSuffix(url: string, actionPath: string | null): string {
  let u = url.replace(/\/+$/, "");
  if (actionPath) {
    const escaped = actionPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    u = u.replace(new RegExp(`${escaped}$`, "i"), "");
  }
  // Common action leftovers even without format metadata
  u = u
    .replace(/\/images\/generations$/i, "")
    .replace(/\/images\/edits$/i, "")
    .replace(/\/images\/tasks(\/[^/]*)?$/i, "")
    .replace(/\/videos\/generations$/i, "")
    .replace(/\/videos$/i, "")
    .replace(/\/contents\/generations\/tasks$/i, "")
    .replace(/\/t2a_v2$/i, "")
    .replace(/\/music_generation$/i, "")
    .replace(/\/chat\/completions$/i, "")
    .replace(/\/+$/, "");
  return u;
}

function ensureApiRoot(url: string, apiFormatId: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed || trimmed.startsWith("mock://")) return trimmed;

  const rootPath = apiRootPathForFormat(apiFormatId);
  if (!rootPath) return trimmed;

  const parsed = parseUrlSafe(trimmed);
  if (!parsed) {
    if (trimmed.endsWith(rootPath)) return trimmed;
    return `${trimmed}${rootPath}`;
  }

  const path = normalizePath(parsed.pathname || "");
  if (!path) {
    return joinOriginAndPath(parsed.origin, rootPath);
  }
  if (path === rootPath || path.startsWith(`${rootPath}/`)) {
    // Keep up to root if somehow deeper than root but not an action we stripped
    if (path === rootPath) return joinOriginAndPath(parsed.origin, rootPath);
    return trimmed;
  }
  // Host-only leftovers or wrong shallow /v1 → upgrade to expected root
  if (/^\/v\d+[a-z]*$/i.test(path) && path !== rootPath) {
    return joinOriginAndPath(parsed.origin, rootPath);
  }
  return joinOriginAndPath(parsed.origin, rootPath);
}

/**
 * API root for adapters（不含 /images/generations 等 action）。
 * 简单填 …/api/v3 或仅 host 时都会补到 API 根。
 */
export function resolveApiBaseUrl(
  baseUrl: string,
  apiFormatId: string,
): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed || trimmed.startsWith("mock://")) return trimmed;

  if (formatSupportsChatBaseUrlMode(apiFormatId)) {
    return resolveChatCompletionsUrl(trimmed);
  }

  const action = apiActionPathForFormat(apiFormatId);
  const withoutAction = stripKnownActionSuffix(trimmed, action);
  return ensureApiRoot(withoutAction, apiFormatId);
}

/**
 * 完整提交 URL。
 * - 简单：API 根 + 协议默认 action（自动补全）
 * - 高级：原样使用所填 URL，不再改写路径
 */
export function resolveApiActionUrl(
  baseUrl: string,
  apiFormatId: string,
  mode?: ApiBaseUrlMode,
): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed || trimmed.startsWith("mock://")) return trimmed;

  const effective =
    mode ?? inferApiBaseUrlMode(trimmed, apiFormatId);

  if (formatSupportsChatBaseUrlMode(apiFormatId)) {
    return resolveChatCompletionsUrl(trimmed, effective);
  }

  if (effective === "advanced") {
    return trimmed;
  }

  const root = resolveApiBaseUrl(trimmed, apiFormatId);
  const action = apiActionPathForFormat(apiFormatId);
  if (!root || !action) return root;
  if (root.toLowerCase().endsWith(action.toLowerCase())) return root;
  return `${root}${action}`;
}

/**
 * 简单模式：API 根。
 * 例：https://ark.cn-beijing.volces.com/api/v3
 */
export function toSimpleApiBaseUrl(
  baseUrl: string,
  apiFormatId: string,
  fallback = "",
): string {
  if (formatSupportsChatBaseUrlMode(apiFormatId)) {
    return toSimpleChatBaseUrl(baseUrl, fallback);
  }

  const fmt = getApiFormat(apiFormatId);
  const suggested = fmt?.suggestedBaseUrl?.trim() || fallback;
  const seed = baseUrl.trim() || suggested;
  if (!seed) return suggested;

  const action = apiActionPathForFormat(apiFormatId);
  const withoutAction = stripKnownActionSuffix(seed, action);
  const root = ensureApiRoot(withoutAction, apiFormatId);
  return root || suggested;
}

/**
 * 切到高级时的默认 Base：等于「简单」模式下自动补全后的完整请求 URL。
 * 之后用户可再改；运行时高级仍按所填原样使用。
 */
export function toAdvancedApiBaseUrl(
  baseUrl: string,
  apiFormatId: string,
  fallback = "",
): string {
  if (formatSupportsChatBaseUrlMode(apiFormatId)) {
    const seed = baseUrl.trim() || fallback || "https://api.deepseek.com";
    return resolveChatCompletionsUrl(seed, "simple");
  }
  const simple = toSimpleApiBaseUrl(baseUrl, apiFormatId, fallback);
  return resolveApiActionUrl(simple, apiFormatId, "simple") || simple;
}

export function inferApiBaseUrlMode(
  baseUrl: string,
  apiFormatId: string,
): ApiBaseUrlMode {
  if (formatSupportsChatBaseUrlMode(apiFormatId)) {
    return inferChatBaseUrlMode(baseUrl);
  }
  const u = baseUrl.trim().replace(/\/+$/, "");
  if (!u) return "simple";
  const action = apiActionPathForFormat(apiFormatId);
  if (action && u.toLowerCase().endsWith(action.toLowerCase())) {
    return "advanced";
  }
  // Deeper than API root → treat as advanced / custom
  const rootPath = apiRootPathForFormat(apiFormatId);
  const parsed = parseUrlSafe(u);
  if (!parsed) return /\/images\/|\/videos|\/contents\//i.test(u) ? "advanced" : "simple";
  const path = normalizePath(parsed.pathname || "");
  if (!path) return "simple";
  if (rootPath && (path === rootPath || path === "")) return "simple";
  if (rootPath && path.startsWith(`${rootPath}/`)) return "advanced";
  // Host-only API root（如 MiniMax suggested 无 path）：有 pathname 即视为高级自定义
  if (!rootPath) return path ? "advanced" : "simple";
  return "simple";
}

/** Read persisted `base_url_mode` from model defaults (if any). */
export function apiBaseUrlModeFromDefaults(
  defaults: unknown,
): ApiBaseUrlMode | undefined {
  if (!defaults || typeof defaults !== "object" || Array.isArray(defaults)) {
    return undefined;
  }
  const v = (defaults as Record<string, unknown>).base_url_mode;
  if (v === "simple" || v === "advanced") return v;
  return undefined;
}

/** Preview under the toggle：简单=自动补全后的 URL；高级=原样。 */
export function previewResolvedApiBaseUrl(
  baseUrl: string,
  apiFormatId: string,
  mode?: ApiBaseUrlMode,
): string {
  return resolveApiActionUrl(baseUrl, apiFormatId, mode);
}
