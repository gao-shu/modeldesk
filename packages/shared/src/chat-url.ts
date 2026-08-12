/**
 * Chat Completions URL helpers.
 * Simple mode stores host (e.g. https://api.deepseek.com);
 * request path auto-appends /v1/chat/completions when missing.
 */

export type ChatBaseUrlMode = "simple" | "advanced";

/** Expand a simple or /v1 base into a full chat/completions URL. */
export function resolveChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed || trimmed.startsWith("mock://")) return trimmed;

  try {
    const parsed = new URL(trimmed);
    let path = parsed.pathname.replace(/\/+$/, "") || "";
    if (path.endsWith("/chat/completions")) {
      parsed.pathname = path;
      parsed.search = "";
      parsed.hash = "";
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
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
    if (/\/v1$/i.test(trimmed)) return `${trimmed}/chat/completions`;
    return `${trimmed}/v1/chat/completions`;
  }
}

/** Strip /v1 and /chat/completions → host (or origin path prefix). */
export function toSimpleChatBaseUrl(
  baseUrl: string,
  fallback = "",
): string {
  let u = baseUrl.trim().replace(/\/+$/, "");
  u = u
    .replace(/\/v1\/chat\/completions$/i, "")
    .replace(/\/chat\/completions$/i, "")
    .replace(/\/v1$/i, "");
  return u || fallback;
}

export function inferChatBaseUrlMode(baseUrl: string): ChatBaseUrlMode {
  const u = baseUrl.trim().replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(u)) return "advanced";
  return "simple";
}

/** Whether this text API format should show the 简单/高级 base URL toggle. */
export function formatSupportsChatBaseUrlMode(apiFormatId: string): boolean {
  return (
    apiFormatId === "text.deepseek" ||
    apiFormatId === "text.openai" ||
    apiFormatId === "text.openai-compatible" ||
    apiFormatId === "text.zhipu" ||
    apiFormatId === "text.gemini"
  );
}
