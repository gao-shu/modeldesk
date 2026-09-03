import {
  createModelRegistry,
  type ModelRegistry,
  type VideoTaskStatusValue,
} from "@modeldesk/model-registry";
import { generateVideo } from "@modeldesk/adapters";
import {
  apiBaseUrlModeFromDefaults,
  resolveApiFormatId,
  videoSettingsFromParams,
  VIDEO_WAIT_TIMEOUT_MS,
} from "@modeldesk/shared";
import { createSqliteModelStore } from "./model-registry-store";
import { coerceMediaUrlList } from "./media-url-list";
import { getModel, toPublicModel, type ModelRow } from "./models";
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

/** Input for video generate — params must already be merged by run-core. */
export type RunVideoGenerateInput = {
  row: ModelRow;
  apiKey: string;
  prompt: string;
  params: Record<string, unknown>;
  signal?: AbortSignal;
  timeoutMs?: number;
  onStatus?: (status: VideoTaskStatusValue, detail?: string) => void;
  onHttpLog?: (log: { url: string; body: Record<string, unknown> }) => void;
};

export type RunVideoGenerateResult = {
  bytes: Uint8Array;
  mime: string;
  extension: string;
  remoteUrl?: string;
  latencyMs: number;
  taskId?: string;
  usage: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  } | null;
};

/**
 * Video path isomorphic with image: run-core merges params once; this only
 * builds adapter knobs, public media URLs, and calls generateVideo.
 */
export async function runVideoGenerate(
  input: RunVideoGenerateInput,
): Promise<RunVideoGenerateResult> {
  const row = getModel(input.row.id) ?? input.row;
  const pub = toPublicModel(row);
  const apiFormat = resolveApiFormatId({
    modality: row.modality,
    defaults: pub.defaults,
    provider: row.provider,
    baseUrl: row.base_url,
    modelId: row.model_id,
  });
  // Trust run-core merge — do not call resolveRunParamsForFormat again.
  const params = input.params ?? {};
  const knobs = videoSettingsFromParams(params, apiFormat);
  const withAudio = (() => {
    if (
      apiFormat === "video.volcengine-seedance" ||
      apiFormat === "video.volcengine-wan" ||
      apiFormat === "video.seedance-relay" ||
      apiFormat === "video.kling"
    ) {
      if (params.with_audio === true || params.with_audio === "true") return true;
      if (params.with_audio === false || params.with_audio === "false")
        return false;
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
      : typeof params.input_reference === "string"
        ? params.input_reference
        : undefined,
  );
  const referenceImageEnd = await ensurePublicImageUrl(
    typeof params.reference_image_end === "string"
      ? params.reference_image_end
      : undefined,
  );
  const referenceImagesRaw = coerceMediaUrlList(params.reference_images);
  const referenceImages = (
    await Promise.all(referenceImagesRaw.map((r) => ensurePublicImageUrl(r)))
  ).filter((x): x is string => Boolean(x?.trim()));

  const referenceAudiosRaw = coerceMediaUrlList(params.reference_audios);
  const referenceAudios = (
    await Promise.all(referenceAudiosRaw.map((r) => ensurePublicVoiceUrl(r)))
  ).filter((x): x is string => Boolean(x?.trim()));

  const pollUrl =
    typeof pub.defaults.poll_url === "string"
      ? pub.defaults.poll_url.trim()
      : "";
  const httpFromDefaults =
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
  const http =
    pollUrl || httpFromDefaults
      ? {
          ...httpFromDefaults,
          ...(pollUrl ? { pollPathTemplate: pollUrl } : {}),
        }
      : undefined;

  const baseUrl = row.base_url ?? "mock://video";
  const timeoutMs = input.timeoutMs ?? VIDEO_WAIT_TIMEOUT_MS;

  const result = await generateVideo({
    baseUrl,
    apiKey: input.apiKey || "mock",
    model: row.model_id,
    prompt: input.prompt,
    apiFormat,
    baseUrlMode: apiBaseUrlModeFromDefaults(pub.defaults),
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
