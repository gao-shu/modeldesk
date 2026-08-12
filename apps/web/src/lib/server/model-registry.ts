import {
  createModelRegistry,
  createVideoRuntime,
  type ModelRegistry,
  type VideoGenerateAdapterInput,
  type VideoRuntime,
} from "@modeldesk/model-registry";
import { generateVideo } from "@modeldesk/adapters";
import {
  resolveApiFormatId,
  resolveRunParamsForFormat,
  videoSettingsFromParams,
} from "@modeldesk/shared";
import { createSqliteModelStore } from "./model-registry-store";
import { getModel, toPublicModel } from "./models";
import { runModelSmokeTest } from "./smoke-test";
import { ensurePublicImageUrl, ensurePublicVoiceUrl } from "./tos";

function combineSignal(
  outer: AbortSignal | undefined,
  timeoutMs: number,
): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!outer) return timeout;
  const ac = new AbortController();
  const onAbort = () => ac.abort();
  if (outer.aborted || timeout.aborted) {
    ac.abort();
    return ac.signal;
  }
  outer.addEventListener("abort", onAbort, { once: true });
  timeout.addEventListener("abort", onAbort, { once: true });
  return ac.signal;
}

let registrySingleton: ModelRegistry | null = null;
let videoRuntimeSingleton: VideoRuntime | null = null;

export function getModelRegistry(): ModelRegistry {
  if (!registrySingleton) {
    registrySingleton = createModelRegistry({
      store: createSqliteModelStore(),
      testConfig: async (id) => {
        const { result } = await runModelSmokeTest(id);
        return result;
      },
    });
  }
  return registrySingleton;
}

async function adapterGenerateVideo(input: VideoGenerateAdapterInput) {
  const resolved = input.resolved;
  const row = getModel(resolved.id);
  if (!row) {
    throw new Error(`Model row missing for ${resolved.id}`);
  }
  const pub = toPublicModel(row);
  const apiFormat = resolveApiFormatId({
    modality: resolved.modality,
    defaults: resolved.defaults,
    provider: resolved.provider,
    baseUrl: resolved.baseUrl,
    modelId: resolved.modelId,
  });
  const params = resolveRunParamsForFormat(
    apiFormat,
    resolved.modality,
    pub.defaults,
    input.params,
  );
  const knobs = videoSettingsFromParams(params, apiFormat);
  const withAudio = (() => {
    // Seedance / Wan / 可灵：严格按 UI；缺省不强制 true
    if (
      apiFormat === "video.volcengine-seedance" ||
      apiFormat === "video.volcengine-wan" ||
      apiFormat === "video.kling"
    ) {
      if (params.with_audio === true || params.with_audio === "true") return true;
      if (params.with_audio === false || params.with_audio === "false") return false;
      return undefined;
    }
    return params.with_audio !== false;
  })();
  const mode =
    typeof params.mode === "string" && params.mode.trim()
      ? params.mode.trim()
      : undefined;
  const resolution =
    typeof params.resolution === "string" && params.resolution.trim()
      ? params.resolution.trim()
      : undefined;
  // 不加水印；不在 UI 暴露，固定传 false
  const watermark = false;
  const cameraFixed =
    params.camera_fixed === true ||
    params.camera_fixed === "true" ||
    params.camera_fixed === 1 ||
    params.camera_fixed === "1"
      ? true
      : params.camera_fixed === false ||
          params.camera_fixed === "false" ||
          params.camera_fixed === 0 ||
          params.camera_fixed === "0"
        ? false
        : undefined;
  const referenceImage = await ensurePublicImageUrl(
    typeof params.reference_image === "string"
      ? params.reference_image
      : undefined,
  );
  const referenceImageEnd = await ensurePublicImageUrl(
    typeof params.reference_image_end === "string"
      ? params.reference_image_end
      : undefined,
  );
  const referenceImagesRaw = (() => {
    const fromList = params.reference_images;
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
      return raw ? [raw] : [];
    }
    if (Array.isArray(fromList)) {
      return fromList
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim())
        .filter(Boolean);
    }
    return [];
  })();
  const referenceImages = (
    await Promise.all(referenceImagesRaw.map((r) => ensurePublicImageUrl(r)))
  ).filter((x): x is string => Boolean(x?.trim()));

  const referenceAudiosRaw = (() => {
    const fromList = params.reference_audios;
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
      return raw ? [raw] : [];
    }
    if (Array.isArray(fromList)) {
      return fromList
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim())
        .filter(Boolean);
    }
    return [];
  })();
  const referenceAudios = (
    await Promise.all(referenceAudiosRaw.map((r) => ensurePublicVoiceUrl(r)))
  ).filter((x): x is string => Boolean(x?.trim()));

  const http =
    pub.defaults.http &&
    typeof pub.defaults.http === "object" &&
    !Array.isArray(pub.defaults.http)
      ? (pub.defaults.http as {
          submitPath?: string;
          pollPathTemplate?: string;
          statusPath?: string;
          urlPath?: string;
        })
      : undefined;

  const baseUrl = resolved.baseUrl ?? "mock://video";
  const timeoutMs = input.timeoutMs ?? 600_000; // 视频默认 10 分钟

  const result = await generateVideo({
    baseUrl,
    apiKey: resolved.apiKey || "mock",
    model: resolved.modelId,
    prompt: input.prompt,
    apiFormat,
    http,
    width: knobs.width,
    height: knobs.height,
    size: knobs.size,
    numFrames: knobs.numFrames,
    frameRate: knobs.frameRate,
    fps: knobs.fps ?? undefined,
    durationSec: knobs.durationSec,
    aspectRatio: knobs.aspectRatio,
    resolution,
    watermark,
    cameraFixed,
    withAudio,
    mode,
    referenceImage,
    referenceImageEnd,
    referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
    referenceAudios: referenceAudios.length > 0 ? referenceAudios : undefined,
    signal: combineSignal(input.signal, timeoutMs),
    timeoutMs,
    onHttpLog: input.onHttpLog,
    onStatus: input.onStatus,
  });

  return {
    bytes: new Uint8Array(result.bytes),
    mime: result.mime,
    extension: result.extension,
    remoteUrl: result.remoteUrl,
    latencyMs: result.latencyMs,
    taskId: result.taskId,
    usage: result.usage ?? null,
  };
}

export function getVideoRuntime(): VideoRuntime {
  if (!videoRuntimeSingleton) {
    videoRuntimeSingleton = createVideoRuntime({
      registry: getModelRegistry(),
      generateVideo: adapterGenerateVideo,
    });
  }
  return videoRuntimeSingleton;
}
