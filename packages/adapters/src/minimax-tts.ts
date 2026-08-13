/**
 * MiniMax Text-to-Speech (T2A) HTTP API
 * China: https://api.minimaxi.com/v1/t2a_v2
 * Global: https://api.minimax.io/v1/t2a_v2
 */

export type MinimaxTtsOptions = {
  baseUrl: string;
  apiKey: string;
  model?: string;
  text: string;
  voiceId?: string;
  speed?: number;
  volume?: number;
  pitch?: number;
  emotion?: string;
  sampleRate?: number;
  bitrate?: number;
  format?: "mp3" | "wav" | "flac" | "pcm";
  languageBoost?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type MinimaxTtsResult = {
  bytes: Buffer;
  mime: string;
  extension: string;
  latencyMs: number;
};

export function isMinimaxApiBaseUrl(baseUrl: string | null | undefined): boolean {
  if (!baseUrl) return false;
  const u = baseUrl.toLowerCase();
  return (
    u.includes("minimaxi.com") ||
    u.includes("minimax.io") ||
    u.includes("minimax.chat") ||
    u.startsWith("minimax://")
  );
}

function resolveV1Base(baseUrl: string): string {
  let u = baseUrl.replace(/\/+$/, "");
  if (u.startsWith("minimax://")) u = "https://api.minimaxi.com/v1";
  if (!u.endsWith("/v1") && !u.includes("/t2a_v2")) {
    if (u.includes("minimaxi.com") || u.includes("minimax.io")) {
      u = `${u}/v1`;
    }
  }
  return u;
}

function t2aEndpoint(baseUrl: string): string {
  const u = resolveV1Base(baseUrl);
  if (u.includes("/t2a_v2")) return u;
  if (u.endsWith("/v1")) return `${u}/t2a_v2`;
  return `${u}/v1/t2a_v2`;
}

function hexToBuffer(hex: string): Buffer {
  return Buffer.from(hex.replace(/\s+/g, ""), "hex");
}

export async function synthesizeMinimaxSpeech(
  options: MinimaxTtsOptions,
): Promise<MinimaxTtsResult> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? 120_000;
  const signal =
    options.signal ??
    (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(timeoutMs)
      : undefined);

  const format = options.format ?? "mp3";
  const model = options.model || "speech-2.8-hd";
  const voiceId = options.voiceId?.trim() || "male-qn-qingse";

  const voiceSetting: Record<string, unknown> = {
    voice_id: voiceId,
    speed: options.speed ?? 1,
    vol: options.volume ?? 1,
    pitch: options.pitch ?? 0,
  };
  if (options.emotion) voiceSetting.emotion = options.emotion;

  const payload = {
    model,
    text: options.text,
    stream: false,
    language_boost: options.languageBoost ?? "auto",
    output_format: "hex",
    voice_setting: voiceSetting,
    audio_setting: {
      sample_rate: options.sampleRate ?? 32000,
      bitrate: options.bitrate ?? 128000,
      format,
      channel: 1,
    },
  };

  const url = t2aEndpoint(options.baseUrl);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal,
  }).catch((error: unknown) => {
    const message =
      error instanceof Error
        ? error.name === "TimeoutError" || error.name === "AbortError"
          ? `MiniMax TTS timed out (${timeoutMs}ms).`
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
      `MiniMax TTS failed (${response.status}): ${text.slice(0, 400)}`,
    );
  }

  const obj = json as {
    base_resp?: { status_code?: number; status_msg?: string };
    data?: { audio?: string };
  } | null;

  const code = obj?.base_resp?.status_code ?? 0;
  if (code !== 0) {
    throw new Error(
      `MiniMax TTS error [${code}]: ${obj?.base_resp?.status_msg ?? "unknown"}`,
    );
  }

  const audioHex = obj?.data?.audio;
  if (!audioHex) {
    throw new Error("MiniMax TTS response missing audio");
  }

  const mime =
    format === "wav"
      ? "audio/wav"
      : format === "flac"
        ? "audio/flac"
        : format === "pcm"
          ? "audio/L16"
          : "audio/mpeg";
  const extension =
    format === "wav" ? "wav" : format === "flac" ? "flac" : format === "pcm" ? "pcm" : "mp3";

  return {
    bytes: hexToBuffer(audioHex),
    mime,
    extension,
    latencyMs: Date.now() - started,
  };
}

/** MiniMax lyrics generation (for music vocal songs). */
export async function generateMinimaxLyrics(input: {
  baseUrl: string;
  apiKey: string;
  prompt: string;
  mode?: "write_full_song" | "edit";
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<{ lyrics: string; latencyMs: number; raw?: unknown }> {
  const started = Date.now();
  const timeoutMs = input.timeoutMs ?? 60_000;
  const signal =
    input.signal ??
    (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(timeoutMs)
      : undefined);

  let base = resolveV1Base(input.baseUrl);
  const url = base.includes("/lyrics_generation")
    ? base
    : base.endsWith("/v1")
      ? `${base}/lyrics_generation`
      : `${base}/v1/lyrics_generation`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mode: input.mode ?? "write_full_song",
      prompt: input.prompt,
    }),
    signal,
  }).catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "Network error";
    throw new Error(`MiniMax lyrics failed: ${message}`);
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
      `MiniMax lyrics failed (${response.status}): ${text.slice(0, 400)}`,
    );
  }

  const obj = json as {
    base_resp?: { status_code?: number; status_msg?: string };
    data?: { lyrics?: string; lyric?: string; text?: string };
    lyrics?: string;
    song_title?: string;
    style_tags?: string;
  } | null;

  const code = obj?.base_resp?.status_code ?? 0;
  if (code !== 0) {
    throw new Error(
      `MiniMax lyrics error [${code}]: ${obj?.base_resp?.status_msg ?? "unknown"}`,
    );
  }

  const lyrics =
    obj?.lyrics ||
    obj?.data?.lyrics ||
    obj?.data?.lyric ||
    obj?.data?.text ||
    "";
  if (!String(lyrics).trim()) {
    throw new Error(
      `MiniMax lyrics empty response: ${text.slice(0, 400)}`,
    );
  }

  return {
    lyrics: String(lyrics),
    latencyMs: Date.now() - started,
    raw: json,
  };
}
