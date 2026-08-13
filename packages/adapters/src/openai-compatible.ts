/**
 * OpenAI-compatible chat client (streaming).
 * Works with OpenAI, DeepSeek, and most /v1 chat completions endpoints.
 */

import { resolveChatCompletionsUrl } from "@modeldesk/shared";
import { parseUsageFromUnknown } from "./usage";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

export type StreamChatChunk =
  | { type: "token"; text: string }
  | { type: "usage"; usage: ChatUsage }
  | { type: "done" };

export type StreamChatOptions = {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** From model.defaults.base_url_mode — advanced = URL as-is. */
  baseUrlMode?: "simple" | "advanced";
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function friendlyHttpError(status: number, body: string): string {
  const snippet = body.slice(0, 300).trim();
  if (status === 401 || status === 403) {
    return `Authentication failed (${status}). Check API key.`;
  }
  if (status === 404) {
    return `Endpoint not found (404). Check base URL / model id.`;
  }
  if (status === 429) {
    return `Rate limited (429). Retry later.`;
  }
  if (status >= 500) {
    return `Provider error (${status}). ${snippet || "Server failed."}`;
  }
  return `Request failed (${status}). ${snippet || "Unknown error."}`;
}

function parseUsage(raw: unknown): ChatUsage | null {
  const parsed = parseUsageFromUnknown(raw);
  if (!parsed) return null;
  return {
    promptTokens: parsed.promptTokens,
    completionTokens: parsed.completionTokens,
    totalTokens: parsed.totalTokens,
  };
}

/**
 * Stream chat completions via SSE (OpenAI-compatible).
 * Yields token deltas, optional usage, then done.
 */
export async function* streamChatCompletion(
  options: StreamChatOptions,
): AsyncGenerator<StreamChatChunk, void, unknown> {
  if (options.baseUrl.startsWith("mock://")) {
    const reply = `Mock reply from ${options.model}: ${options.messages
      .map((m) => m.content)
      .join(" ")
      .slice(0, 120)}`;
    const words = reply.split(/(\s+)/).filter(Boolean);
    for (const w of words) {
      await new Promise((r) => setTimeout(r, 15));
      yield { type: "token", text: w };
    }
    yield {
      type: "usage",
      usage: {
        promptTokens: 12,
        completionTokens: words.length,
        totalTokens: 12 + words.length,
      },
    };
    yield { type: "done" };
    return;
  }

  const url = resolveChatCompletionsUrl(
    normalizeBaseUrl(options.baseUrl),
    options.baseUrlMode,
  );
  const timeoutMs = options.timeoutMs ?? 120_000;
  const signal =
    options.signal ??
    (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(timeoutMs)
      : undefined);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        stream: true,
        stream_options: { include_usage: true },
        ...(options.temperature !== undefined
          ? { temperature: options.temperature }
          : {}),
        ...(options.maxTokens !== undefined
          ? { max_tokens: options.maxTokens }
          : {}),
      }),
      signal,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.name === "TimeoutError" || error.name === "AbortError"
          ? `Request timed out or aborted (${timeoutMs}ms).`
          : `Network error: ${error.message}`
        : "Network error";
    throw new Error(message);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(friendlyHttpError(response.status, body));
  }

  if (!response.body) {
    throw new Error("Empty response body from provider");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawUsage = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split("\n");
      buffer = parts.pop() ?? "";

      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") {
          yield { type: "done" };
          return;
        }
        let json: unknown;
        try {
          json = JSON.parse(data);
        } catch {
          continue;
        }
        if (!json || typeof json !== "object") continue;
        const obj = json as {
          choices?: Array<{ delta?: { content?: string | null } }>;
          usage?: unknown;
        };
        const token = obj.choices?.[0]?.delta?.content;
        if (typeof token === "string" && token.length > 0) {
          yield { type: "token", text: token };
        }
        const usage = parseUsage(obj.usage);
        if (usage) {
          sawUsage = true;
          yield { type: "usage", usage };
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!sawUsage) {
    // some providers only send usage on final chunk already handled
  }
  yield { type: "done" };
}

export type NonStreamChatResult = {
  content: string;
  usage: ChatUsage | null;
  latencyMs: number;
};

/** Non-streaming chat (used by smoke tests / fallbacks). */
export async function chatCompletion(
  options: StreamChatOptions,
): Promise<NonStreamChatResult> {
  const url = resolveChatCompletionsUrl(
    normalizeBaseUrl(options.baseUrl),
    options.baseUrlMode,
  );
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? 60_000;
  const signal =
    options.signal ??
    (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(timeoutMs)
      : undefined);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        stream: false,
        ...(options.temperature !== undefined
          ? { temperature: options.temperature }
          : {}),
        ...(options.maxTokens !== undefined
          ? { max_tokens: options.maxTokens }
          : {}),
      }),
      signal,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.name === "TimeoutError" || error.name === "AbortError"
          ? `Request timed out or aborted (${timeoutMs}ms).`
          : `Network error: ${error.message}`
        : "Network error";
    throw new Error(message);
  }

  const latencyMs = Date.now() - started;
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new Error(friendlyHttpError(response.status, text));
  }

  const content =
    typeof json === "object" &&
    json &&
    "choices" in json &&
    Array.isArray((json as { choices: unknown }).choices)
      ? String(
          (
            json as {
              choices: Array<{ message?: { content?: string } }>;
            }
          ).choices[0]?.message?.content ?? "",
        )
      : "";

  const usage =
    typeof json === "object" && json && "usage" in json
      ? parseUsage((json as { usage: unknown }).usage)
      : null;

  return { content, usage, latencyMs };
}
