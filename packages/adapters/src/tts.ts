/**
 * OpenAI-compatible TTS (+ mock:// for demos).
 */

export type TtsOptions = {
  baseUrl: string;
  apiKey: string;
  model: string;
  input: string;
  voice?: string;
  speed?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type TtsResult = {
  bytes: Buffer;
  mime: string;
  extension: string;
  latencyMs: number;
};

/** Minimal valid WAV (silence, ~0.1s mono 8kHz). */
function makeSilentWav(durationSec = 0.25): Buffer {
  const sampleRate = 8000;
  const numSamples = Math.max(1, Math.floor(sampleRate * durationSec));
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function friendlyHttpError(status: number, body: string): string {
  const snippet = body.slice(0, 300).trim();
  if (status === 401 || status === 403) {
    return `Authentication failed (${status}). Check API key.`;
  }
  return `TTS request failed (${status}). ${snippet || "Unknown error."}`;
}

export async function synthesizeSpeech(
  options: TtsOptions,
): Promise<TtsResult> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? 120_000;
  const signal =
    options.signal ??
    (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(timeoutMs)
      : undefined);

  if (options.baseUrl.startsWith("mock://")) {
    await new Promise((r) => setTimeout(r, 150));
    return {
      bytes: makeSilentWav(0.3),
      mime: "audio/wav",
      extension: "wav",
      latencyMs: Date.now() - started,
    };
  }

  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const url = `${baseUrl}/audio/speech`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model,
      input: options.input,
      voice: options.voice ?? "alloy",
      ...(options.speed != null ? { speed: options.speed } : {}),
      response_format: "mp3",
    }),
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

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(friendlyHttpError(response.status, body));
  }

  const ab = await response.arrayBuffer();
  return {
    bytes: Buffer.from(ab),
    mime: response.headers.get("content-type") ?? "audio/mpeg",
    extension: "mp3",
    latencyMs: Date.now() - started,
  };
}

/** Music: same as TTS for MVP when provider is audio/music HTTP; mock for demos. */
export async function generateMusic(
  options: TtsOptions & { durationSec?: number },
): Promise<TtsResult> {
  if (options.baseUrl.startsWith("mock://")) {
    const started = Date.now();
    await new Promise((r) => setTimeout(r, 200));
    return {
      bytes: makeSilentWav(options.durationSec ?? 1),
      mime: "audio/wav",
      extension: "wav",
      latencyMs: Date.now() - started,
    };
  }
  // Fallback: treat as TTS-compatible speech endpoint with longer clip.
  return synthesizeSpeech(options);
}
