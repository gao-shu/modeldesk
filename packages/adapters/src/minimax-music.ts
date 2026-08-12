/**
 * MiniMax Music Generation API
 * China: https://api.minimaxi.com/v1/music_generation
 * Global: https://api.minimax.io/v1/music_generation
 */

import { downloadBytes } from "./images";
import { generateMinimaxLyrics } from "./minimax-tts";

export type MinimaxMusicOptions = {
  baseUrl: string;
  apiKey: string;
  model?: string;
  /** Style / mood description */
  prompt: string;
  /** Optional lyrics; ignored when isInstrumental */
  lyrics?: string;
  lyricsOptimizer?: boolean;
  isInstrumental?: boolean;
  sampleRate?: number;
  bitrate?: number;
  format?: "mp3" | "wav" | "pcm";
  outputFormat?: "hex" | "url";
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type MinimaxMusicResult = {
  bytes: Buffer;
  mime: string;
  extension: string;
  latencyMs: number;
  remoteUrl?: string;
  durationMs?: number;
};

function normalizeBaseUrl(baseUrl: string): string {
  let u = baseUrl.replace(/\/+$/, "");
  // Accept either https://api.minimaxi.com or .../v1
  if (!u.endsWith("/v1")) {
    // if user passed host only
  }
  return u;
}

function musicEndpoint(baseUrl: string): string {
  const u = normalizeBaseUrl(baseUrl);
  if (u.includes("/music_generation")) return u;
  if (u.endsWith("/v1")) return `${u}/music_generation`;
  return `${u}/v1/music_generation`;
}

function hexToBuffer(hex: string): Buffer {
  const cleaned = hex.replace(/\s+/g, "");
  return Buffer.from(cleaned, "hex");
}

export function isMinimaxMusicBaseUrl(baseUrl: string | null | undefined): boolean {
  if (!baseUrl) return false;
  const u = baseUrl.toLowerCase();
  return (
    u.includes("minimaxi.com") ||
    u.includes("minimax.io") ||
    u.includes("minimax.chat") ||
    u.startsWith("minimax://")
  );
}

export async function generateMinimaxMusic(
  options: MinimaxMusicOptions,
): Promise<MinimaxMusicResult> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? 180_000;
  const signal =
    options.signal ??
    (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(timeoutMs)
      : undefined);

  let baseUrl = options.baseUrl;
  if (baseUrl.startsWith("minimax://")) {
    baseUrl = "https://api.minimaxi.com/v1";
  }

  const model = options.model || "music-3.0";
  const outputFormat = options.outputFormat ?? "hex";
  const fmt = options.format ?? "mp3";
  const isInstrumental = options.isInstrumental ?? false;
  const lyricsOptimizer =
    options.lyricsOptimizer ??
    (!isInstrumental && !(options.lyrics && options.lyrics.trim()));

  let lyrics = options.lyrics?.trim() || "";
  // Prefer dedicated lyrics_generation API when we need lyrics but none provided.
  if (!isInstrumental && !lyrics && lyricsOptimizer) {
    const gen = await generateMinimaxLyrics({
      baseUrl,
      apiKey: options.apiKey,
      prompt: options.prompt,
      mode: "write_full_song",
      signal,
      timeoutMs: Math.min(timeoutMs, 90_000),
    });
    lyrics = gen.lyrics;
  }

  const payload: Record<string, unknown> = {
    model,
    prompt: options.prompt,
    output_format: outputFormat,
    audio_setting: {
      sample_rate: options.sampleRate ?? 44100,
      bitrate: options.bitrate ?? 256000,
      format: fmt,
    },
  };

  if (isInstrumental) {
    payload.is_instrumental = true;
  } else if (lyrics) {
    payload.lyrics = lyrics;
  } else if (lyricsOptimizer) {
    payload.lyrics_optimizer = true;
  }

  const url = musicEndpoint(baseUrl);
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
          ? `MiniMax music timed out (${timeoutMs}ms).`
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
      `MiniMax music failed (${response.status}): ${text.slice(0, 400)}`,
    );
  }

  const obj = json as {
    base_resp?: { status_code?: number; status_msg?: string };
    data?: { status?: number; audio?: string };
    extra_info?: { music_duration?: number };
  } | null;

  const code = obj?.base_resp?.status_code ?? 0;
  if (code !== 0) {
    throw new Error(
      `MiniMax music error [${code}]: ${obj?.base_resp?.status_msg ?? "unknown"}`,
    );
  }

  const status = obj?.data?.status;
  if (status != null && status !== 2) {
    throw new Error(`MiniMax music incomplete (status=${status})`);
  }

  const audio = obj?.data?.audio;
  if (!audio) {
    throw new Error("MiniMax music response missing audio");
  }

  const mime =
    fmt === "wav" ? "audio/wav" : fmt === "pcm" ? "audio/L16" : "audio/mpeg";
  const extension = fmt === "wav" ? "wav" : fmt === "pcm" ? "pcm" : "mp3";

  if (outputFormat === "url") {
    const downloaded = await downloadBytes(audio, signal);
    return {
      bytes: downloaded.bytes,
      mime: downloaded.mime.includes("audio") ? downloaded.mime : mime,
      extension,
      latencyMs: Date.now() - started,
      remoteUrl: audio,
      durationMs: obj?.extra_info?.music_duration,
    };
  }

  return {
    bytes: hexToBuffer(audio),
    mime,
    extension,
    latencyMs: Date.now() - started,
    durationMs: obj?.extra_info?.music_duration,
  };
}
