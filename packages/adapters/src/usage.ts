/** Normalized token usage across OpenAI-compatible and mid-station shapes. */
export type TokenUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

/**
 * Parse usage objects from chat / images / video / TTS responses.
 * Supports: prompt_tokens, completion_tokens, input_tokens, output_tokens, total_tokens,
 * and nested usage.input_tokens_details (ignored except totals).
 */
export function parseUsageFromUnknown(raw: unknown): TokenUsage | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const u = raw as Record<string, unknown>;

  const prompt =
    num(u.prompt_tokens) ??
    num(u.input_tokens) ??
    num(u.promptTokens) ??
    num(u.inputTokens);

  const completion =
    num(u.completion_tokens) ??
    num(u.output_tokens) ??
    num(u.completionTokens) ??
    num(u.outputTokens);

  const total =
    num(u.total_tokens) ??
    num(u.totalTokens) ??
    (prompt != null && completion != null ? prompt + completion : null);

  if (prompt == null && completion == null && total == null) return null;
  return {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: total,
  };
}

/** Walk common response envelopes for a usage object. */
export function extractUsageFromResponse(json: unknown): TokenUsage | null {
  if (!json || typeof json !== "object") return null;
  const root = json as Record<string, unknown>;
  return (
    parseUsageFromUnknown(root.usage) ??
    parseUsageFromUnknown(root.token_usage) ??
    parseUsageFromUnknown(root.tokens) ??
    (root.data && typeof root.data === "object" && !Array.isArray(root.data)
      ? parseUsageFromUnknown((root.data as Record<string, unknown>).usage)
      : null) ??
    (root.metadata && typeof root.metadata === "object"
      ? parseUsageFromUnknown((root.metadata as Record<string, unknown>).usage)
      : null)
  );
}

/**
 * Rough prompt token estimate when upstream omits usage.
 * CJK ≈ 1.5 chars/token; Latin ≈ 4 chars/token.
 */
export function estimatePromptTokens(text: string): number {
  const s = text?.trim() ?? "";
  if (!s) return 0;
  let cjk = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x3040 && code <= 0x30ff)
    ) {
      cjk += 1;
    }
  }
  const other = Math.max(0, s.length - cjk);
  return Math.max(1, Math.ceil(cjk / 1.5 + other / 4));
}

/** Prefer API usage; otherwise estimate input from prompt. */
export function resolveTokenCounts(input: {
  prompt: string;
  usage?: TokenUsage | null;
}): { inputTokens: number | null; outputTokens: number | null } {
  const u = input.usage;
  if (u) {
    let inputTokens = u.promptTokens;
    let outputTokens = u.completionTokens;
    if (
      inputTokens == null &&
      u.totalTokens != null &&
      outputTokens != null
    ) {
      inputTokens = Math.max(0, u.totalTokens - outputTokens);
    }
    if (
      outputTokens == null &&
      u.totalTokens != null &&
      inputTokens != null
    ) {
      outputTokens = Math.max(0, u.totalTokens - inputTokens);
    }
    if (inputTokens != null || outputTokens != null) {
      return { inputTokens, outputTokens };
    }
    if (u.totalTokens != null) {
      return { inputTokens: u.totalTokens, outputTokens: null };
    }
  }
  return {
    inputTokens: estimatePromptTokens(input.prompt),
    outputTokens: null,
  };
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
