import {
  generateImage,
  generateMinimaxMusic,
  generateMusic,
  isMinimaxApiBaseUrl,
  isMinimaxMusicBaseUrl,
  isQwenTtsBaseUrl,
  isXiaomiMimoTtsBaseUrl,
  resolveTokenCounts,
  streamChatCompletion,
  synthesizeMinimaxSpeech,
  synthesizeQwenSpeech,
  synthesizeSpeech,
  synthesizeXiaomiMimoSpeech,
  type StreamChatChunk,
} from "@modeldesk/adapters";

const SIZE_MAP: Record<string, Record<string, string>> = {
  "1K": {
    "1:1": "1024x1024",
    "4:3": "1152x864",
    "3:4": "864x1152",
    "16:9": "1424x800",
    "9:16": "800x1424",
    "3:2": "1248x832",
    "2:3": "832x1248",
    "21:9": "1568x672",
  },
  "2K": {
    "1:1": "2048x2048",
    "4:3": "2304x1728",
    "3:4": "1728x2304",
    "16:9": "2848x1600",
    "9:16": "1600x2848",
    "3:2": "2496x1664",
    "2:3": "1664x2496",
    "21:9": "3136x1344",
  },
  "3K": {
    "1:1": "3072x3072",
    "4:3": "3456x2592",
    "3:4": "2592x3456",
    "16:9": "4096x2304",
    "9:16": "2304x4096",
    "3:2": "3744x2496",
    "2:3": "2496x3744",
    "21:9": "4704x2016",
  },
  "4K": {
    "1:1": "4096x4096",
    "4:3": "4704x3520",
    "3:4": "3520x4704",
    "16:9": "5504x3040",
    "9:16": "3040x5504",
    "3:2": "4992x3328",
    "2:3": "3328x4992",
    "21:9": "6240x2656",
  },
};

function getPixelSize(size: string, ratio: string): string {
  if (size.includes("x")) return size;
  // ratio-style size (e.g. 16:9) maps via 1K tier table
  if (/^\d+:\d+$/.test(size.trim())) {
    return (
      SIZE_MAP["1K"]?.[size.trim()] ??
      SIZE_MAP["1K"]?.[ratio] ??
      "1024x1024"
    );
  }
  return SIZE_MAP[size]?.[ratio] ?? SIZE_MAP["1K"]?.[ratio] ?? "1024x1024";
}

/** 从 PNG / JPEG 头读取真实宽高（不依赖 sharp）。 */
function readImageDimensions(bytes: Buffer): string | null {
  if (bytes.length < 24) return null;
  // PNG: IHDR
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    const w = bytes.readUInt32BE(16);
    const h = bytes.readUInt32BE(20);
    if (w > 0 && h > 0 && w < 100_000 && h < 100_000) return `${w}x${h}`;
    return null;
  }
  // JPEG: scan SOF0/1/2
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i < bytes.length - 8) {
      if (bytes[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = bytes[i + 1]!;
      if (marker === 0xd8 || marker === 0xd9) {
        i += 2;
        continue;
      }
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        const h = bytes.readUInt16BE(i + 5);
        const w = bytes.readUInt16BE(i + 7);
        if (w > 0 && h > 0 && w < 100_000 && h < 100_000) return `${w}x${h}`;
        return null;
      }
      const len = bytes.readUInt16BE(i + 2);
      if (len < 2) break;
      i += 2 + len;
    }
  }
  return null;
}
import {
  apiBaseUrlModeFromDefaults,
  applyFormatParamAliases,
  resolveRunParams,
  resolveRunParamsForFormat,
  videoSettingsFromParams,
  resolveApiFormatId,
  VIDEO_WAIT_TIMEOUT_MS,
  resolveApiBaseUrl,
} from "@modeldesk/shared";
import { saveArtifact } from "./artifacts";
import { ensurePublicImageUrl } from "./tos";
import {
  estimateCostUsd,
  finishJobCancelled,
  finishJobFailure,
  finishJobSuccess,
  mergeJobResponse,
  touchJobHeartbeat,
} from "./runs";
import type { ModelRow } from "./models";
import { toPublicModel } from "./models";
import { isAbortError } from "./run-abort";

export type JobExecParams = {
  runId: string;
  jobId: string;
  row: ModelRow;
  apiKey: string;
  prompt: string;
  temperature?: number | null;
  maxTokens?: number | null;
  /** Per-run overrides (merged with model defaults). */
  params?: Record<string, unknown> | null;
  /** Cancel / disconnect signal — aborts upstream provider calls. */
  signal?: AbortSignal | null;
  /** Emit SSE-friendly progress for this job (slot label optional). */
  onEvent?: (event: string, data: unknown) => void;
  slot?: "A" | "B" | string;
};

export type JobExecResult = {
  ok: boolean;
  latencyMs: number;
  ttftMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  content: string;
  artifactId: string | null;
  /** All artifact ids when multiple images were generated. */
  artifactIds?: string[];
  costUsd: number | null;
  error?: string;
  cancelled?: boolean;
  httpLog?: { url: string; body: Record<string, unknown> };
  /** Artifact metadata (fileSize, dimensions etc.) for UI display. */
  artifactMeta?: Record<string, unknown>;
};

function slotPayload(slot: string | undefined, data: Record<string, unknown>) {
  return slot ? { slot, ...data } : data;
}

function combineSignal(
  signal: AbortSignal | null | undefined,
  timeoutMs: number,
): AbortSignal {
  const timeout =
    typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(timeoutMs)
      : undefined;
  if (!signal) return timeout ?? new AbortController().signal;
  if (!timeout) return signal;

  const ac = new AbortController();
  const onAbort = () => {
    if (!ac.signal.aborted) {
      ac.abort(
        signal.aborted
          ? signal.reason
          : timeout.aborted
            ? timeout.reason
            : undefined,
      );
    }
  };
  if (signal.aborted || timeout.aborted) {
    onAbort();
    return ac.signal;
  }
  signal.addEventListener("abort", onAbort, { once: true });
  timeout.addEventListener("abort", onAbort, { once: true });
  return ac.signal;
}

function abortResult(
  input: JobExecParams,
  started: number,
  partialContent?: string,
  extraResponse?: Record<string, unknown>,
): JobExecResult {
  const latencyMs = Date.now() - started;
  finishJobCancelled({
    runId: input.runId,
    jobId: input.jobId,
    latencyMs,
    partialContent,
    extraResponse,
  });
  return {
    ok: false,
    latencyMs,
    ttftMs: null,
    inputTokens: null,
    outputTokens: null,
    content: partialContent ?? "",
    artifactId: null,
    costUsd: null,
    error: "已取消",
    cancelled: true,
  };
}

async function runTextJob(input: JobExecParams): Promise<JobExecResult> {
  const started = Date.now();
  let ttftMs: number | null = null;
  let content = "";
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  const publicModel = toPublicModel(input.row);
  const params = resolveRunParams(input.row.modality, publicModel.defaults, {
    ...(input.params ?? {}),
    ...(input.temperature != null ? { temperature: input.temperature } : {}),
    ...(input.maxTokens != null ? { max_tokens: input.maxTokens } : {}),
  });
  const temperature =
    typeof params.temperature === "number" ? params.temperature : undefined;
  const maxTokens =
    typeof params.max_tokens === "number" ? params.max_tokens : undefined;

  try {
    for await (const chunk of streamChatCompletion({
      baseUrl: input.row.base_url!,
      apiKey: input.apiKey,
      model: input.row.model_id,
      messages: [{ role: "user", content: input.prompt }],
      temperature,
      maxTokens,
      timeoutMs: 120_000,
      signal: input.signal ?? undefined,
      baseUrlMode: apiBaseUrlModeFromDefaults(publicModel.defaults),
    }) as AsyncGenerator<StreamChatChunk>) {
      if (input.signal?.aborted) {
        return abortResult(input, started, content || undefined);
      }
      if (chunk.type === "token") {
        if (ttftMs == null) ttftMs = Date.now() - started;
        content += chunk.text;
        input.onEvent?.(
          "token",
          slotPayload(input.slot, { text: chunk.text }),
        );
      } else if (chunk.type === "usage") {
        inputTokens = chunk.usage.promptTokens;
        outputTokens = chunk.usage.completionTokens;
        input.onEvent?.(
          "usage",
          slotPayload(input.slot, { ...chunk.usage }),
        );
      }
    }

    const latencyMs = Date.now() - started;
    if (inputTokens == null && outputTokens == null) {
      const estimated = resolveTokenCounts({ prompt: input.prompt });
      inputTokens = estimated.inputTokens;
      outputTokens = estimated.outputTokens;
    } else if (inputTokens == null) {
      inputTokens = resolveTokenCounts({ prompt: input.prompt }).inputTokens;
    }

    const textBytes = Buffer.from(content, "utf8");
    const artifact = saveArtifact({
      type: "text",
      extension: "txt",
      mime: "text/plain; charset=utf-8",
      bytes: textBytes,
      jobId: input.jobId,
      meta: {
        source: "run-job",
        runId: input.runId,
        modelId: input.row.id,
        modality: "text",
        fileSize: textBytes.length,
      },
    });

    finishJobSuccess({
      runId: input.runId,
      jobId: input.jobId,
      content,
      artifactId: artifact.id,
      latencyMs,
      ttftMs,
      inputTokens,
      outputTokens,
    });

    const costUsd = estimateCostUsd({
      pricing: publicModel.pricing,
      inputTokens,
      outputTokens,
    });

    return {
      ok: true,
      latencyMs,
      ttftMs,
      inputTokens,
      outputTokens,
      content,
      artifactId: artifact.id,
      costUsd,
      artifactMeta: { fileSize: textBytes.length },
    };
  } catch (error) {
    if (isAbortError(error) || input.signal?.aborted) {
      return abortResult(input, started, content || undefined);
    }
    const latencyMs = Date.now() - started;
    const message =
      error instanceof Error ? error.message : "Unknown streaming error";
    finishJobFailure({
      runId: input.runId,
      jobId: input.jobId,
      error: message,
      latencyMs,
      ttftMs,
      partialContent: content || undefined,
    });
    return {
      ok: false,
      latencyMs,
      ttftMs,
      inputTokens,
      outputTokens,
      content,
      artifactId: null,
      costUsd: null,
      error: message,
    };
  }
}

async function runImageJob(input: JobExecParams): Promise<JobExecResult> {
  const started = Date.now();
  const publicModel = toPublicModel(input.row);
  const apiFormat = resolveApiFormatId({
    modality: input.row.modality,
    defaults: publicModel.defaults,
    provider: input.row.provider,
    baseUrl: input.row.base_url,
    modelId: input.row.model_id,
  });
  const params = resolveRunParamsForFormat(
    apiFormat,
    input.row.modality,
    publicModel.defaults,
    applyFormatParamAliases(apiFormat, input.params),
  );
  const size = typeof params.size === "string" ? params.size : undefined;
  const quality =
    typeof params.quality === "string" && params.quality
      ? params.quality
      : undefined;
  const ratio =
    typeof params.ratio === "string"
      ? params.ratio
      : typeof params.aspect_ratio === "string"
        ? params.aspect_ratio
        : undefined;
  // Grok 等：顶层 aspect_ratio / resolution（别名已在 applyFormatParamAliases 合并）
  const aspectRatio =
    typeof params.aspect_ratio === "string" && params.aspect_ratio.trim()
      ? params.aspect_ratio.trim()
      : typeof ratio === "string" && ratio.trim()
        ? ratio.trim()
        : undefined;
  const resolution =
    typeof params.resolution === "string" && params.resolution.trim()
      ? params.resolution.trim()
      : undefined;
  const responseFormat =
    typeof params.response_format === "string" &&
    (params.response_format === "url" ||
      params.response_format === "b64_json")
      ? params.response_format
      : undefined;
  const n =
    typeof params.n === "number"
      ? params.n
      : typeof params.n === "string" && /^\d+$/.test(params.n.trim())
        ? Number(params.n.trim())
        : undefined;
  const referenceImagesRaw = (() => {
    const fromList = params.reference_images ?? params.image_urls ?? params.images;
    if (Array.isArray(fromList)) {
      return fromList
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim())
        .filter(Boolean);
    }
    if (typeof fromList === "string" && fromList.trim()) {
      const raw = fromList.trim();
      if (raw.startsWith("[")) {
        try {
          const parsed = JSON.parse(raw) as unknown;
          if (Array.isArray(parsed)) {
            return parsed
              .filter((x): x is string => typeof x === "string")
              .map((x) => x.trim())
              .filter(Boolean);
          }
        } catch {
          /* fall through */
        }
      }
      return [raw];
    }
    const single =
      (typeof params.image === "string" && params.image.trim()
        ? params.image
        : "") ||
      (typeof params.image_url === "string" && params.image_url.trim()
        ? params.image_url
        : "") ||
      (typeof params.reference_image === "string"
        ? params.reference_image
        : "");
    // Legacy single / dual keys
    return [
      single,
      typeof params.reference_image_2 === "string"
        ? params.reference_image_2
        : "",
    ]
      .map((s) => s.trim())
      .filter(Boolean);
  })();
  // 有对象存储时把 data URI 换成短公网 URL，避免中转 JSON 双图 body 过大 502
  const referenceImages = (
    await Promise.all(referenceImagesRaw.map((r) => ensurePublicImageUrl(r)))
  ).filter((x): x is string => Boolean(x?.trim()));

  const promptExtendRaw = params.prompt_extend;
  const promptExtend =
    promptExtendRaw === true ||
    promptExtendRaw === "true" ||
    promptExtendRaw === 1 ||
    promptExtendRaw === "1"
      ? true
      : promptExtendRaw === false ||
          promptExtendRaw === "false" ||
          promptExtendRaw === 0 ||
          promptExtendRaw === "0"
        ? false
        : undefined;

  input.onEvent?.(
    "status",
    slotPayload(input.slot, { status: "running", modality: "image" }),
  );

  const pixelSize = size ? getPixelSize(size, ratio ?? "1:1") : undefined;
  let httpLog: { url: string; body: Record<string, unknown> } | undefined;

  try {
    const result = await generateImage({
      baseUrl: input.row.base_url ?? "mock://image",
      apiKey: input.apiKey || "mock",
      model: input.row.model_id,
      prompt: input.prompt,
      size,
      quality,
      ratio,
      n: n ?? 1,
      apiFormat,
      baseUrlMode: apiBaseUrlModeFromDefaults(publicModel.defaults),
      aspectRatio,
      resolution,
      responseFormat,
      promptExtend,
      referenceImages:
        referenceImages.length > 0 ? referenceImages : undefined,
      signal: combineSignal(input.signal, 300_000),
      timeoutMs: 300_000, // 图片：5 分钟
      onHttpLog: (log) => {
        httpLog = log;
        mergeJobResponse(input.jobId, { _httpLog: log });
      },
    });

    // Save all generated images as artifacts.
    const actualDims = readImageDimensions(result.bytes);
    const dimensions = actualDims ?? pixelSize;
    const primary = saveArtifact({
      type: "image",
      extension: result.extension,
      mime: result.mime,
      bytes: result.bytes,
      jobId: input.jobId,
      meta: {
        source: "run-job",
        runId: input.runId,
        modelId: input.row.id,
        remoteUrl: result.remoteUrl ?? null,
        index: 0,
        fileSize: result.bytes.length,
        ...(dimensions ? { dimensions } : {}),
      },
    });
    const artifactIds: string[] = [primary.id];
    const extraImages = result.images ?? [];
    for (let i = 0; i < extraImages.length; i++) {
      const img = extraImages[i]!;
      const extraDims = readImageDimensions(img.bytes) ?? dimensions;
      const art = saveArtifact({
        type: "image",
        extension: img.extension,
        mime: img.mime,
        bytes: img.bytes,
        jobId: input.jobId,
        meta: {
          source: "run-job",
          runId: input.runId,
          modelId: input.row.id,
          remoteUrl: img.remoteUrl ?? null,
          index: i + 1,
          fileSize: img.bytes.length,
          ...(extraDims ? { dimensions: extraDims } : {}),
        },
      });
      artifactIds.push(art.id);
    }

    const meta = {
      fileSize: result.bytes.length,
      ...(dimensions ? { dimensions } : {}),
    };

    const tokens = resolveTokenCounts({
      prompt: input.prompt,
      usage: result.usage ?? null,
    });

    finishJobSuccess({
      runId: input.runId,
      jobId: input.jobId,
      content: "",
      artifactId: primary.id,
      remoteUrl: result.remoteUrl ?? null,
      latencyMs: result.latencyMs,
      ttftMs: null,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      extraResponse: {
        _httpLog: httpLog,
        _artifactMeta: meta,
        ...(artifactIds.length > 1 ? { artifactIds } : {}),
      },
    });

    return {
      ok: true,
      latencyMs: result.latencyMs,
      ttftMs: null,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      content: "",
      artifactId: primary.id,
      artifactIds,
      costUsd: estimateCostUsd({
        pricing: publicModel.pricing,
        inputTokens: tokens.inputTokens,
        outputTokens: tokens.outputTokens,
      }),
      httpLog,
      artifactMeta: meta,
    };
  } catch (error) {
    if (isAbortError(error) || input.signal?.aborted) {
      return { ...abortResult(input, started, undefined, { _httpLog: httpLog }), httpLog };
    }
    const message = error instanceof Error ? error.message : "Image failed";
    finishJobFailure({
      runId: input.runId,
      jobId: input.jobId,
      error: message,
      latencyMs: null,
      partialContent: undefined,
      extraResponse: { _httpLog: httpLog },
    });
    return {
      ok: false,
      latencyMs: 0,
      ttftMs: null,
      inputTokens: null,
      outputTokens: null,
      content: "",
      artifactId: null,
      costUsd: null,
      error: message,
      httpLog,
    };
  }
}

async function runAudioJob(
  input: JobExecParams,
  kind: "audio" | "music",
): Promise<JobExecResult> {
  const started = Date.now();
  const publicModel = toPublicModel(input.row);
  const apiFormat = resolveApiFormatId({
    modality: kind,
    defaults: publicModel.defaults,
    provider: input.row.provider,
    baseUrl: input.row.base_url,
    modelId: input.row.model_id,
  });
  const params = resolveRunParamsForFormat(
    apiFormat,
    input.row.modality,
    publicModel.defaults,
    input.params,
  );
  const voice = typeof params.voice === "string" && params.voice
    ? params.voice
    : undefined;
  const speed =
    typeof params.speed === "number" ? params.speed : undefined;
  const emotion =
    typeof params.emotion === "string" && params.emotion.trim()
      ? params.emotion.trim()
      : undefined;
  const instructionRaw =
    typeof params.instruction === "string" && params.instruction.trim()
      ? params.instruction.trim()
      : undefined;
  const instructionCustom =
    typeof params.instruction_custom === "string" &&
    params.instruction_custom.trim()
      ? params.instruction_custom.trim()
      : undefined;
  const instruction =
    instructionRaw === "__custom__"
      ? instructionCustom
      : instructionRaw;
  const durationSec =
    typeof params.duration_sec === "number"
      ? params.duration_sec
      : undefined;
  const isInstrumental = params.is_instrumental === true;
  const lyricsOptimizer =
    params.lyrics_optimizer === true ||
    (params.lyrics_optimizer !== false &&
      params.lyrics == null &&
      !isInstrumental);
  const lyrics =
    typeof params.lyrics === "string" && params.lyrics.trim()
      ? params.lyrics.trim()
      : undefined;
  const referenceAudio =
    typeof params.reference_audio === "string" && params.reference_audio.trim()
      ? params.reference_audio.trim()
      : undefined;
  const optimizeTextPreview = params.optimize_text_preview !== false;

  input.onEvent?.(
    "status",
    slotPayload(input.slot, { status: "running", modality: kind }),
  );

  try {
    const baseUrl = resolveApiBaseUrl(
      input.row.base_url ?? "mock://music",
      apiFormat,
    );
    const result =
      kind === "music"
        ? isMinimaxMusicBaseUrl(baseUrl)
          ? await generateMinimaxMusic({
              baseUrl,
              apiKey: input.apiKey || "mock",
              model: input.row.model_id,
              prompt: input.prompt,
              lyrics,
              isInstrumental,
              lyricsOptimizer,
              timeoutMs: 180_000,
              signal: combineSignal(input.signal, 180_000),
            })
          : await generateMusic({
              baseUrl,
              apiKey: input.apiKey || "mock",
              model: input.row.model_id,
              input: input.prompt,
              voice,
              speed,
              durationSec,
              signal: combineSignal(input.signal, 180_000),
            })
        : apiFormat === "audio.xiaomi-mimo" || isXiaomiMimoTtsBaseUrl(baseUrl)
          ? await synthesizeXiaomiMimoSpeech({
              baseUrl: baseUrl || "https://api.xiaomimimo.com/v1",
              apiKey: input.apiKey || "mock",
              model: input.row.model_id,
              text: input.prompt,
              instruction,
              voice,
              referenceAudio,
              optimizeTextPreview,
              timeoutMs: 120_000,
              signal: combineSignal(input.signal, 120_000),
            })
          : isQwenTtsBaseUrl(baseUrl)
          ? await synthesizeQwenSpeech({
              baseUrl: baseUrl || "https://dashscope.aliyuncs.com",
              apiKey: input.apiKey || "mock",
              model: input.row.model_id,
              text: input.prompt,
              voice,
              rate: speed,
              instruction,
              timeoutMs: 120_000,
              signal: combineSignal(input.signal, 120_000),
            })
          : isMinimaxApiBaseUrl(baseUrl)
            ? await synthesizeMinimaxSpeech({
                baseUrl: baseUrl || "https://api.minimaxi.com/v1",
                apiKey: input.apiKey || "mock",
                model: input.row.model_id,
                text: input.prompt,
                voiceId: voice,
                speed,
                emotion,
                timeoutMs: 120_000,
                signal: combineSignal(input.signal, 120_000),
              })
            : await synthesizeSpeech({
                baseUrl: baseUrl || "mock://tts",
                apiKey: input.apiKey || "mock",
                model: input.row.model_id,
                input: input.prompt,
                voice,
                speed,
                signal: combineSignal(input.signal, 120_000),
              });

    const artifact = saveArtifact({
      type: kind === "music" ? "music" : "audio",
      extension: result.extension,
      mime: result.mime,
      bytes: result.bytes,
      jobId: input.jobId,
      meta: {
        source: "run-job",
        runId: input.runId,
        modelId: input.row.id,
        modality: kind,
        fileSize: result.bytes.length,
      },
    });

    const tokens = resolveTokenCounts({ prompt: input.prompt });

    finishJobSuccess({
      runId: input.runId,
      jobId: input.jobId,
      content: "",
      artifactId: artifact.id,
      latencyMs: result.latencyMs,
      ttftMs: null,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
    });

    return {
      ok: true,
      latencyMs: result.latencyMs,
      ttftMs: null,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      content: "",
      artifactId: artifact.id,
      costUsd: estimateCostUsd({
        pricing: publicModel.pricing,
        inputTokens: tokens.inputTokens,
        outputTokens: tokens.outputTokens,
      }),
      artifactMeta: { fileSize: result.bytes.length },
    };
  } catch (error) {
    if (isAbortError(error) || input.signal?.aborted) {
      return abortResult(input, started);
    }
    const message = error instanceof Error ? error.message : "Audio failed";
    finishJobFailure({
      runId: input.runId,
      jobId: input.jobId,
      error: message,
      latencyMs: null,
    });
    return {
      ok: false,
      latencyMs: 0,
      ttftMs: null,
      inputTokens: null,
      outputTokens: null,
      content: "",
      artifactId: null,
      costUsd: null,
      error: message,
    };
  }
}

async function runVideoJob(input: JobExecParams): Promise<JobExecResult> {
  const started = Date.now();
  const publicModel = toPublicModel(input.row);
  const apiFormat = resolveApiFormatId({
    modality: input.row.modality,
    defaults: publicModel.defaults,
    provider: input.row.provider,
    baseUrl: input.row.base_url,
    modelId: input.row.model_id,
  });
  const params = resolveRunParamsForFormat(
    apiFormat,
    input.row.modality,
    publicModel.defaults,
    input.params,
  );
  const videoKnobs = videoSettingsFromParams(params, apiFormat);

  let httpLog: { url: string; body: Record<string, unknown> } | undefined;

  // Keep DB heartbeat alive during long upstream polls so startup/HMR orphan
  // cleanup does not mark the job "服务重启，任务中断" while it is still working.
  touchJobHeartbeat(input.jobId);

  try {
    const { getVideoRuntime } = await import("@/lib/server/model-registry");

    const task = await getVideoRuntime().waitVideo({
      configId: input.row.id,
      prompt: input.prompt,
      params: input.params ?? {},
      signal: input.signal ?? undefined,
      timeoutMs: VIDEO_WAIT_TIMEOUT_MS, // 视频：30 分钟
      onHttpLog: (log) => {
        httpLog = log;
        mergeJobResponse(input.jobId, { _httpLog: log });
      },
      onStatus: (status, detail) => {
        touchJobHeartbeat(input.jobId);
        mergeJobResponse(input.jobId, {
          _progress: {
            status,
            detail: detail ?? null,
            at: new Date().toISOString(),
          },
        });
        input.onEvent?.(
          "status",
          slotPayload(input.slot, {
            status,
            detail: detail ?? null,
            modality: "video",
          }),
        );
      },
    });

    if (task.status !== "succeeded" || !task.artifact) {
      throw new Error(task.error?.message ?? "Video generation failed");
    }

    const bytes = Buffer.from(task.artifact.bytes);
    const meta = {
      fileSize: bytes.length,
      ...(videoKnobs.width && videoKnobs.height
        ? { dimensions: `${videoKnobs.width}x${videoKnobs.height}` }
        : {}),
    };

    const artifact = saveArtifact({
      type: "video",
      extension: task.artifact.extension,
      mime: task.artifact.mime,
      bytes,
      jobId: input.jobId,
      meta: {
        source: "run-job",
        runId: input.runId,
        modelId: input.row.id,
        remoteUrl: task.artifact.remoteUrl ?? null,
        taskId: task.upstreamTaskId ?? null,
        ...meta,
      },
    });

    const tokens = resolveTokenCounts({
      prompt: input.prompt,
      usage: task.usage ?? null,
    });

    finishJobSuccess({
      runId: input.runId,
      jobId: input.jobId,
      content: "",
      artifactId: artifact.id,
      remoteUrl: task.artifact.remoteUrl ?? null,
      latencyMs: task.latencyMs ?? Date.now() - started,
      ttftMs: null,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      extraResponse: {
        taskId: task.upstreamTaskId ?? null,
        ...(httpLog ? { _httpLog: httpLog } : {}),
        _artifactMeta: meta,
      },
    });

    return {
      ok: true,
      latencyMs: task.latencyMs ?? Date.now() - started,
      ttftMs: null,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      content: "",
      artifactId: artifact.id,
      costUsd: estimateCostUsd({
        pricing: publicModel.pricing,
        inputTokens: tokens.inputTokens,
        outputTokens: tokens.outputTokens,
      }),
      httpLog,
      artifactMeta: meta,
    };
  } catch (error) {
    if (isAbortError(error) || input.signal?.aborted) {
      return {
        ...abortResult(
          input,
          started,
          undefined,
          httpLog ? { _httpLog: httpLog } : undefined,
        ),
        httpLog,
      };
    }
    const message = error instanceof Error ? error.message : "Video failed";
    finishJobFailure({
      runId: input.runId,
      jobId: input.jobId,
      error: message,
      latencyMs: null,
      extraResponse: httpLog ? { _httpLog: httpLog } : undefined,
    });
    return {
      ok: false,
      latencyMs: 0,
      ttftMs: null,
      inputTokens: null,
      outputTokens: null,
      content: "",
      artifactId: null,
      costUsd: null,
      error: message,
      httpLog,
    };
  }
}

/** Execute one job according to model modality. */
export async function executeModelJob(
  input: JobExecParams,
): Promise<JobExecResult> {
  const modality = input.row.modality;
  if (modality === "text") return runTextJob(input);
  if (modality === "image") return runImageJob(input);
  if (modality === "audio") return runAudioJob(input, "audio");
  if (modality === "music") return runAudioJob(input, "music");
  if (modality === "video") return runVideoJob(input);
  const message = `Unsupported modality: ${modality}`;
  finishJobFailure({
    runId: input.runId,
    jobId: input.jobId,
    error: message,
    latencyMs: 0,
  });
  return {
    ok: false,
    latencyMs: 0,
    ttftMs: null,
    inputTokens: null,
    outputTokens: null,
    content: "",
    artifactId: null,
    costUsd: null,
    error: message,
  };
}
