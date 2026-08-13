/**
 * Xiaomi MiMo V2.5 TTS (OpenAI-compatible chat.completions + audio).
 * Docs: https://mimo.mi.com/docs/zh-CN/api/audio/tts
 * Models: mimo-v2.5-tts | mimo-v2.5-tts-voiceclone | mimo-v2.5-tts-voicedesign
 */

import { downloadBytes } from "./images";

export type MimoTtsOptions = {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Speech text → messages[].assistant.content */
  text: string;
  /**
   * Style instruct (tts / clone) or voice design description (voicedesign).
   * → messages[].user.content
   */
  instruction?: string;
  /** Preset voice id for mimo-v2.5-tts (e.g. mimo_default / 冰糖 / Chloe). */
  voice?: string;
  /**
   * Reference audio for voiceclone: data URI, bare base64, or http(s) URL.
   * Sent as audio.voice = data:{mime};base64,...
   */
  referenceAudio?: string;
  format?: "wav" | "pcm16" | "mp3";
  optimizeTextPreview?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type MimoTtsResult = {
  bytes: Buffer;
  mime: string;
  extension: string;
  latencyMs: number;
};

export function isXiaomiMimoTtsBaseUrl(
  baseUrl: string | null | undefined,
): boolean {
  if (!baseUrl) return false;
  const u = baseUrl.toLowerCase();
  return (
    u.includes("xiaomimimo.com") ||
    u.includes("mimo.mi.com") ||
    u.startsWith("mimo://") ||
    u.startsWith("xiaomi-mimo://")
  );
}

function resolveBase(baseUrl: string): string {
  if (baseUrl.startsWith("mimo://") || baseUrl.startsWith("xiaomi-mimo://")) {
    return "https://api.xiaomimimo.com/v1";
  }
  return baseUrl.replace(/\/+$/, "");
}

function chatCompletionsUrl(baseUrl: string): string {
  const base = resolveBase(baseUrl);
  if (/\/chat\/completions$/i.test(base)) return base;
  if (/\/v1$/i.test(base)) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
}

function modelKind(
  model: string,
): "tts" | "voiceclone" | "voicedesign" {
  const m = model.toLowerCase();
  if (m.includes("voiceclone")) return "voiceclone";
  if (m.includes("voicedesign")) return "voicedesign";
  return "tts";
}

function mimeFromFormat(format: string): { mime: string; extension: string } {
  const f = format.toLowerCase();
  if (f === "pcm16" || f === "pcm") {
    return { mime: "audio/pcm", extension: "pcm" };
  }
  if (f === "mp3" || f === "mpeg") {
    return { mime: "audio/mpeg", extension: "mp3" };
  }
  return { mime: "audio/wav", extension: "wav" };
}

function guessAudioMime(raw: string, hintName?: string): string {
  const lower = `${raw.slice(0, 64)} ${hintName ?? ""}`.toLowerCase();
  if (lower.includes("audio/mpeg") || lower.includes(".mp3")) {
    return "audio/mpeg";
  }
  if (lower.includes("audio/wav") || lower.includes(".wav")) {
    return "audio/wav";
  }
  return "audio/wav";
}

/**
 * Normalize reference audio into `data:{mime};base64,...` for audio.voice.
 */
async function toVoiceDataUri(
  raw: string,
  signal?: AbortSignal,
): Promise<string> {
  const s = raw.trim();
  if (!s) {
    throw new Error("音色克隆需要参考音频（本地上传或公网 URL）");
  }
  if (/^data:audio\/[\w.+-]+;base64,/i.test(s)) {
    return s;
  }
  if (/^https?:\/\//i.test(s)) {
    const { bytes, mime: fetchedMime } = await downloadBytes(s, signal);
    const mime = guessAudioMime(fetchedMime || s, s);
    return `data:${mime};base64,${bytes.toString("base64")}`;
  }
  // Bare base64
  if (/^[A-Za-z0-9+/=\s]+$/.test(s) && s.replace(/\s/g, "").length > 64) {
    return `data:audio/wav;base64,${s.replace(/\s/g, "")}`;
  }
  throw new Error(
    "参考音频须为 data URI、公网 URL，或 base64（mp3/wav，≤10MB）",
  );
}

export async function synthesizeXiaomiMimoSpeech(
  options: MimoTtsOptions,
): Promise<MimoTtsResult> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? 120_000;
  const signal =
    options.signal ??
    (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(timeoutMs)
      : undefined);

  const kind = modelKind(options.model);
  const text = options.text.trim();
  if (!text) throw new Error("合成文本不能为空");

  const instruction = options.instruction?.trim() ?? "";
  if (kind === "voicedesign" && !instruction) {
    throw new Error("音色设计模型须填写音色描述（风格 / 音色描述）");
  }

  const format = options.format ?? "wav";
  const audioBody: Record<string, unknown> = { format };

  if (kind === "tts") {
    audioBody.voice = options.voice?.trim() || "mimo_default";
  } else if (kind === "voiceclone") {
    const ref = options.referenceAudio?.trim() || options.voice?.trim();
    if (!ref) {
      throw new Error("音色克隆须上传参考音频（数秒 mp3/wav）");
    }
    audioBody.voice = await toVoiceDataUri(ref, signal);
  } else if (kind === "voicedesign") {
    if (options.optimizeTextPreview !== false) {
      audioBody.optimize_text_preview = true;
    }
  }

  const messages: Array<{ role: string; content: string }> = [];
  if (kind === "voicedesign" || instruction) {
    messages.push({ role: "user", content: instruction });
  } else if (kind === "voiceclone") {
    // Docs allow empty user content when no style instruct.
    messages.push({ role: "user", content: "" });
  }
  messages.push({ role: "assistant", content: text });

  const url = chatCompletionsUrl(options.baseUrl);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "api-key": options.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model,
      messages,
      audio: audioBody,
    }),
    signal,
  }).catch((error: unknown) => {
    const message =
      error instanceof Error
        ? error.name === "TimeoutError" || error.name === "AbortError"
          ? `Xiaomi MiMo TTS timed out (${timeoutMs}ms).`
          : `Network error: ${error.message}`
        : "Network error";
    throw new Error(message);
  });

  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(
      `Xiaomi MiMo TTS failed (${response.status}): ${rawText.slice(0, 400)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText) as unknown;
  } catch {
    throw new Error("Xiaomi MiMo TTS returned non-JSON response");
  }

  const obj = parsed as {
    choices?: Array<{
      message?: { audio?: { data?: string }; content?: string };
    }>;
    error?: { message?: string };
  };
  if (obj.error?.message) {
    throw new Error(`Xiaomi MiMo TTS error: ${obj.error.message}`);
  }

  const b64 = obj.choices?.[0]?.message?.audio?.data;
  if (!b64 || typeof b64 !== "string") {
    throw new Error("Xiaomi MiMo TTS response missing message.audio.data");
  }

  const { mime, extension } = mimeFromFormat(format);
  return {
    bytes: Buffer.from(b64, "base64"),
    mime,
    extension,
    latencyMs: Date.now() - started,
  };
}
