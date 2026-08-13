import {
  apiBaseUrlModeFromDefaults,
  resolveChatCompletionsUrl,
} from "@modeldesk/shared";
import { getModel, getModelApiKey, toPublicModel } from "./models";

export type SmokeTestResult = {
  ok: boolean;
  kind: "chat" | "key-check" | "models-list";
  latencyMs: number;
  message: string;
  detail?: Record<string, unknown>;
};

function looksLikeApiKey(key: string): boolean {
  const trimmed = key.trim();
  return trimmed.length >= 8;
}

function normalizeBaseUrl(baseUrl: string | null): string | null {
  if (!baseUrl?.trim()) return null;
  return baseUrl.replace(/\/+$/, "");
}

async function chatSmokeTest(input: {
  baseUrl: string;
  apiKey: string;
  modelId: string;
  baseUrlMode?: "simple" | "advanced";
}): Promise<SmokeTestResult> {
  const started = Date.now();
  const url = resolveChatCompletionsUrl(input.baseUrl, input.baseUrlMode);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: input.modelId,
        messages: [{ role: "user", content: "Reply with the single word: ok" }],
        max_tokens: 8,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network error";
    return {
      ok: false,
      kind: "chat",
      latencyMs: Date.now() - started,
      message: `Chat request failed: ${message}`,
    };
  }

  const latencyMs = Date.now() - started;
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 400) };
  }

  if (!response.ok) {
    return {
      ok: false,
      kind: "chat",
      latencyMs,
      message: `Chat smoke failed (${response.status})`,
      detail: {
        status: response.status,
        body: json,
      },
    };
  }

  const content =
    typeof json === "object" &&
    json &&
    "choices" in json &&
    Array.isArray((json as { choices: unknown }).choices)
      ? String(
          (
            (json as { choices: Array<{ message?: { content?: string } }> })
              .choices[0]?.message?.content ?? ""
          ).trim(),
        )
      : "";

  return {
    ok: true,
    kind: "chat",
    latencyMs,
    message: content
      ? `Chat OK · reply: ${content.slice(0, 80)}`
      : "Chat OK · empty content",
    detail: { content: content.slice(0, 200) },
  };
}

async function modelsListCheck(input: {
  baseUrl: string;
  apiKey: string;
}): Promise<SmokeTestResult> {
  const started = Date.now();
  const url = `${input.baseUrl}/models`;
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${input.apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
    const latencyMs = Date.now() - started;
    if (!response.ok) {
      return {
        ok: false,
        kind: "models-list",
        latencyMs,
        message: `Health check failed (${response.status})`,
      };
    }
    return {
      ok: true,
      kind: "models-list",
      latencyMs,
      message: "Provider reachable (/models)",
    };
  } catch (error) {
    return {
      ok: false,
      kind: "models-list",
      latencyMs: Date.now() - started,
      message:
        error instanceof Error
          ? `Health check failed: ${error.message}`
          : "Health check failed",
    };
  }
}

/**
 * Phase C smoke test:
 * - text + chat: short chat completion
 * - other modalities: key format + optional /models health check
 */
export async function runModelSmokeTest(id: string): Promise<{
  model: ReturnType<typeof toPublicModel>;
  result: SmokeTestResult;
}> {
  const row = getModel(id);
  if (!row) {
    throw new Error("Not found");
  }

  const apiKey = getModelApiKey(id);
  if (!apiKey) {
    return {
      model: toPublicModel(row),
      result: {
        ok: false,
        kind: "key-check",
        latencyMs: 0,
        message: "No API key stored for this model",
      },
    };
  }

  if (!looksLikeApiKey(apiKey)) {
    return {
      model: toPublicModel(row),
      result: {
        ok: false,
        kind: "key-check",
        latencyMs: 0,
        message: "API key looks too short",
      },
    };
  }

  const baseUrl = normalizeBaseUrl(row.base_url);

  if (row.modality === "text" && row.capability === "chat" && baseUrl) {
    const pub = toPublicModel(row);
    const result = await chatSmokeTest({
      baseUrl,
      apiKey,
      modelId: row.model_id,
      baseUrlMode: apiBaseUrlModeFromDefaults(pub.defaults),
    });
    return { model: pub, result };
  }

  if (baseUrl) {
    const result = await modelsListCheck({ baseUrl, apiKey });
    if (result.ok) {
      return { model: toPublicModel(row), result };
    }
    // Fall through to key-format success when /models is unsupported.
    if (result.message.includes("(404)") || result.message.includes("(405)")) {
      return {
        model: toPublicModel(row),
        result: {
          ok: true,
          kind: "key-check",
          latencyMs: result.latencyMs,
          message: "API key present; provider /models not available (OK for MVP)",
        },
      };
    }
    return { model: toPublicModel(row), result };
  }

  return {
    model: toPublicModel(row),
    result: {
      ok: true,
      kind: "key-check",
      latencyMs: 0,
      message: "API key format OK (no base URL to ping)",
    },
  };
}
