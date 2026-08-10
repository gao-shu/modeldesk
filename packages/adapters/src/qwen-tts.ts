/**
 * Qwen / DashScope TTS
 * - qwen-audio-3.0-tts-flash → SpeechSynthesizer + CosyVoice 系音色（longanhuan_v3.6 等）
 * - qwen3-tts-flash → multimodal-generation + Cherry/Serena 等
 */

import { downloadBytes } from "./images";

export type QwenTtsOptions = {
  baseUrl: string;
  apiKey: string;
  model: string;
  text: string;
  voice?: string;
  format?: "mp3" | "wav" | "pcm";
  sampleRate?: number;
  rate?: number;
  volume?: number;
  pitch?: number;
  languageType?: string;
  /** Free-style / dialect style control (Qwen-Audio, CosyVoice, Qwen3-Instruct). */
  instruction?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type QwenTtsResult = {
  bytes: Buffer;
  mime: string;
  extension: string;
  latencyMs: number;
  remoteUrl?: string;
};

export function isQwenTtsBaseUrl(baseUrl: string | null | undefined): boolean {
  if (!baseUrl) return false;
  const u = baseUrl.toLowerCase();
  return (
    u.includes("dashscope.aliyuncs.com") ||
    u.includes("dashscope-intl.aliyuncs.com") ||
    u.includes("qianwenai.com") ||
    u.startsWith("qwen://") ||
    u.startsWith("dashscope://")
  );
}

function resolveBase(baseUrl: string): string {
  if (baseUrl.startsWith("qwen://") || baseUrl.startsWith("dashscope://")) {
    return "https://dashscope.aliyuncs.com";
  }
  return baseUrl.replace(/\/+$/, "");
}

function isQwen3TtsModel(model: string): boolean {
  return model.toLowerCase().includes("qwen3-tts");
}

function speechUrl(baseUrl: string, model: string): string {
  const base = resolveBase(baseUrl);
  if (isQwen3TtsModel(model)) {
    if (base.includes("/multimodal-generation")) return base;
    if (base.endsWith("/api/v1")) {
      return `${base}/services/aigc/multimodal-generation/generation`;
    }
    return `${base}/api/v1/services/aigc/multimodal-generation/generation`;
  }
  if (base.includes("/SpeechSynthesizer")) return base;
  if (base.endsWith("/api/v1")) {
    return `${base}/services/audio/tts/SpeechSynthesizer`;
  }
  if (base.includes("/api/v1/")) {
    return `${base.replace(/\/+$/, "")}/services/audio/tts/SpeechSynthesizer`;
  }
  return `${base}/api/v1/services/audio/tts/SpeechSynthesizer`;
}

function defaultVoiceForModel(model: string): string {
  return isQwen3TtsModel(model) ? "Cherry" : "longanhuan_v3.6";
}

function friendlyQwenError(status: number, body: string, voice: string, model: string): string {
  const snippet = body.slice(0, 400);
  if (
    /Engine error|InvalidParameter|speak operation failed/i.test(body) &&
    !isQwen3TtsModel(model) &&
    /^(Cherry|Serena|Ethan|Chelsie|Moon|Maia|Kai|Vivian|Momo|Neil|Jennifer|Ryan)$/i.test(
      voice,
    )
  ) {
    return `音色「${voice}」不适用于模型 ${model}。请改选「龙安欢」等 CosyVoice 音色，或改用 qwen3-tts-flash 模型。原始错误: ${snippet}`;
  }
  return `Qwen TTS failed (${status}): ${snippet}`;
}

function parseAudioResult(
  json: unknown,
  format: string,
  started: number,
): QwenTtsResult {
  const obj = json as {
    code?: string;
    message?: string;
    output?: {
      audio?: { url?: string; data?: string };
    };
  } | null;

  if (obj?.code && obj.code !== "") {
    throw new Error(`Qwen TTS error [${obj.code}]: ${obj.message ?? "unknown"}`);
  }

  const audioUrl = obj?.output?.audio?.url;
  const audioData = obj?.output?.audio?.data;
  const mime =
    format === "wav" ? "audio/wav" : format === "pcm" ? "audio/L16" : "audio/mpeg";
  const extension = format === "wav" ? "wav" : format === "pcm" ? "pcm" : "mp3";

  if (audioUrl) {
    return {
      bytes: Buffer.alloc(0), // filled after download
      mime,
      extension,
      latencyMs: Date.now() - started,
      remoteUrl: audioUrl,
    };
  }

  if (audioData && typeof audioData === "string" && audioData.length > 0) {
    return {
      bytes: Buffer.from(audioData, "base64"),
      mime,
      extension,
      latencyMs: Date.now() - started,
    };
  }

  throw new Error("Qwen TTS response missing audio url/data");
}

export async function synthesizeQwenSpeech(
  options: QwenTtsOptions,
): Promise<QwenTtsResult> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? 120_000;
  const signal =
    options.signal ??
    (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(timeoutMs)
      : undefined);

  const format = options.format ?? "mp3";
  const voice =
    options.voice?.trim() || defaultVoiceForModel(options.model);
  const url = speechUrl(options.baseUrl, options.model);
  const qwen3 = isQwen3TtsModel(options.model);
  const instruction = options.instruction?.trim() || undefined;

  const payload = qwen3
    ? {
        model: options.model,
        input: {
          text: options.text,
          voice,
          language_type: options.languageType ?? "Auto",
          // Qwen3-TTS-Instruct uses `instructions` (plural)
          ...(instruction ? { instructions: instruction } : {}),
        },
      }
    : {
        model: options.model,
        input: {
          text: options.text,
          // Qwen-Audio / CosyVoice: instruction lives on input
          ...(instruction ? { instruction } : {}),
        },
        parameters: {
          voice,
          format,
          sample_rate: options.sampleRate ?? 22050,
          ...(options.rate != null ? { rate: options.rate } : {}),
          ...(options.volume != null ? { volume: options.volume } : {}),
          ...(options.pitch != null ? { pitch: options.pitch } : {}),
          ...(instruction ? { instruction } : {}),
        },
      };

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
          ? `Qwen TTS timed out (${timeoutMs}ms).`
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
      friendlyQwenError(response.status, text, voice, options.model),
    );
  }

  const parsed = parseAudioResult(json, format, started);
  if (parsed.remoteUrl) {
    const downloaded = await downloadBytes(parsed.remoteUrl, signal);
    return {
      bytes: downloaded.bytes,
      mime: downloaded.mime.includes("audio") ? downloaded.mime : parsed.mime,
      extension: parsed.extension,
      latencyMs: Date.now() - started,
      remoteUrl: parsed.remoteUrl,
    };
  }
  return parsed;
}
