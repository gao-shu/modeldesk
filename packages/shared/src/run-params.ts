/** Per-modality run parameters: defaults + selectable options. */

import { getApiFormat } from "./api-formats";

export type RunParamModality =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "music";

export type RunParamFieldType =
  | "number"
  | "select"
  | "text"
  | "textarea"
  | "boolean"
  /** Local upload → data URI / base64, or paste a public URL. */
  | "image"
  /** Multi reference images as JSON string array. */
  | "image_list"
  /**
   * Video reference input with modes: none / single ref / first+last frame.
   * Primary value uses `key`; optional end frame uses `endKey`.
   */
  | "image_pair";

export type RunParamOption = {
  value: string;
  label: string;
  /** When set, only show for matching providers (substring match). */
  providers?: readonly string[];
  /**
   * When set, only show if modelId contains any of these substrings
   * (case-insensitive). Use with excludeModels for fine control.
   */
  models?: readonly string[];
  /** When set, hide if modelId contains any of these substrings. */
  excludeModels?: readonly string[];
};

export type RunParamField = {
  key: string;
  label: string;
  type: RunParamFieldType;
  /** String form of the default (UI uses string state). */
  defaultValue: string;
  options?: readonly RunParamOption[];
  min?: number;
  /** Number input max, or max items for image_list. */
  max?: number;
  step?: number;
  /** Hint under the control */
  hint?: string;
  /** When set, hide this field unless provider matches (substring). */
  providers?: readonly string[];
  /**
   * When set, only show this field if modelId contains any substring
   * (same rules as RunParamOption.models).
   */
  models?: readonly string[];
  /** When set, hide this field if modelId contains any substring. */
  excludeModels?: readonly string[];
  /** For image_pair: param key for the end / last frame (default reference_image_end). */
  endKey?: string;
};

export const RUN_PARAM_FIELDS_BY_MODALITY: Record<
  RunParamModality,
  readonly RunParamField[]
> = {
  text: [
    {
      key: "temperature",
      label: "温度",
      type: "number",
      defaultValue: "0.2",
      min: 0,
      max: 2,
      step: 0.1,
    },
    {
      key: "max_tokens",
      label: "最大长度",
      type: "select",
      defaultValue: "1024",
      options: [
        { value: "256", label: "256" },
        { value: "512", label: "512" },
        { value: "1024", label: "1024" },
        { value: "2048", label: "2048" },
        { value: "4096", label: "4096" },
        { value: "8192", label: "8192" },
      ],
    },
  ],
  image: [
    {
      key: "n",
      label: "数量",
      type: "select",
      defaultValue: "1",
      options: [
        { value: "1", label: "1 张" },
        { value: "2", label: "2 张" },
        { value: "3", label: "3 张" },
        { value: "4", label: "4 张" },
      ],
      hint: "单次请求生成图片数量",
    },
    {
      key: "size",
      label: "尺寸",
      type: "select",
      defaultValue: "1K",
      options: [
        { value: "", label: "默认（由模型决定）" },
        { value: "1K", label: "1K" },
        { value: "2K", label: "2K" },
        { value: "3K", label: "3K" },
        { value: "4K", label: "4K" },
      ],
      hint: "选择分辨率后，会根据比例自动计算实际像素尺寸",
    },
    {
      key: "ratio",
      label: "比例",
      type: "select",
      defaultValue: "16:9",
      options: [
        { value: "", label: "默认（由模型决定）" },
        { value: "1:1", label: "1:1" },
        { value: "4:3", label: "4:3" },
        { value: "3:4", label: "3:4" },
        { value: "16:9", label: "16:9" },
        { value: "9:16", label: "9:16" },
        { value: "3:2", label: "3:2" },
        { value: "2:3", label: "2:3" },
        { value: "21:9", label: "21:9" },
      ],
    },
    {
      key: "quality",
      label: "质量",
      type: "select",
      defaultValue: "high",
      options: [
        { value: "", label: "默认（由模型决定）" },
        { value: "auto", label: "自动" },
        { value: "low", label: "快速（低成本）" },
        { value: "medium", label: "平衡" },
        { value: "high", label: "高质量" },
      ],
    },
    {
      key: "reference_images",
      label: "参考图",
      type: "image_list",
      defaultValue: "",
      hint: "图生图：可连续上传多张，缩略图可删",
      max: 4,
    },
  ],
  video: [
    {
      key: "duration_sec",
      label: "时长",
      type: "select",
      defaultValue: "5",
      options: [
        { value: "3", label: "约 3 秒", providers: ["agnes", "mock"] },
        { value: "5", label: "约 5 秒" },
        { value: "10", label: "约 10 秒" },
        {
          value: "18",
          label: "约 18 秒",
          providers: ["agnes", "mock"],
        },
      ],
      hint: "Agnes：由帧数/帧率换算；智谱 CogVideoX-3：5 或 10 秒",
    },
    {
      key: "resolution",
      label: "分辨率",
      type: "select",
      defaultValue: "720p",
      options: [
        // Agnes / 通用：档位 + 画幅组合出像素
        {
          value: "480p",
          label: "480p",
          providers: ["agnes", "mock", "openai", "custom"],
        },
        {
          value: "720p",
          label: "720p",
          providers: ["agnes", "mock", "openai", "custom"],
        },
        {
          value: "1080p",
          label: "1080p",
          providers: ["agnes", "mock", "openai", "custom"],
        },
        // 智谱 CogVideoX / Flash：直接传 size 枚举
        {
          value: "720x480",
          label: "720×480 · 标清横屏",
          providers: ["zhipu", "bigmodel"],
        },
        {
          value: "1280x720",
          label: "1280×720 · 720p 16:9（X3）",
          providers: ["zhipu", "bigmodel"],
        },
        {
          value: "720x1280",
          label: "720×1280 · 720p 9:16（X3）",
          providers: ["zhipu", "bigmodel"],
        },
        {
          value: "1024x1024",
          label: "1024×1024 · 方形",
          providers: ["zhipu", "bigmodel"],
        },
        {
          value: "1280x960",
          label: "1280×960 · 4:3",
          providers: ["zhipu", "bigmodel"],
        },
        {
          value: "960x1280",
          label: "960×1280 · 3:4",
          providers: ["zhipu", "bigmodel"],
        },
        {
          value: "1920x1080",
          label: "1920×1080 · 1080p 16:9",
          providers: ["zhipu", "bigmodel"],
        },
        {
          value: "1080x1920",
          label: "1080×1920 · 1080p 9:16",
          providers: ["zhipu", "bigmodel"],
        },
        {
          value: "2048x1080",
          label: "2048×1080 · 2K 超宽",
          providers: ["zhipu", "bigmodel"],
        },
        {
          value: "3840x2160",
          label: "3840×2160 · 4K",
          providers: ["zhipu", "bigmodel"],
        },
      ],
      hint: "Agnes 用档位+画幅；智谱直接选官方 size",
    },
    {
      key: "aspect_ratio",
      label: "画幅",
      type: "select",
      defaultValue: "16:9",
      providers: ["agnes", "mock", "openai", "custom"],
      options: [
        { value: "16:9", label: "16:9 横屏" },
        { value: "9:16", label: "9:16 竖屏" },
        { value: "1:1", label: "1:1 方形" },
        { value: "4:3", label: "4:3 横屏" },
        { value: "3:4", label: "3:4 竖屏" },
      ],
      hint: "仅 Agnes 等按 width/height 提交的服务商需要",
    },
    {
      key: "fps",
      label: "帧率",
      type: "select",
      defaultValue: "30",
      providers: ["zhipu", "bigmodel"],
      options: [
        { value: "30", label: "30 fps" },
        { value: "60", label: "60 fps" },
      ],
    },
    {
      key: "with_audio",
      label: "生成声音",
      type: "boolean",
      defaultValue: "true",
      providers: ["zhipu", "bigmodel"],
      hint: "智谱 CogVideoX：关闭则无音轨（默认开启）",
    },
    {
      key: "reference_image",
      label: "参考输入",
      type: "image_pair",
      defaultValue: "",
      endKey: "reference_image_end",
      providers: ["zhipu", "bigmodel"],
      hint: "参考图（单张）或首尾帧；上传转 base64，或粘贴公网 URL",
    },
    {
      key: "reference_image",
      label: "参考图",
      type: "image",
      defaultValue: "",
      providers: ["agnes"],
      hint: "图生视频：上传转 base64，或粘贴公网 URL（官方需公网 URL）",
    },
  ],
  // Fallback only when api_format is missing — prefer ApiFormatDef.fields.
  audio: [
    {
      key: "voice",
      label: "音色",
      type: "text",
      defaultValue: "",
      hint: "请在模型配置里选择 API 格式以获得音色列表",
    },
    {
      key: "speed",
      label: "语速",
      type: "number",
      defaultValue: "1",
      min: 0.5,
      max: 2,
      step: 0.1,
    },
  ],
  music: [
    {
      key: "is_instrumental",
      label: "纯伴奏",
      type: "boolean",
      defaultValue: "false",
    },
    {
      key: "lyrics_optimizer",
      label: "自动写词",
      type: "boolean",
      defaultValue: "true",
    },
    {
      key: "duration_sec",
      label: "目标时长（秒）",
      type: "number",
      defaultValue: "",
      min: 1,
      max: 300,
      step: 1,
    },
    {
      key: "lyrics",
      label: "歌词",
      type: "textarea",
      defaultValue: "",
    },
  ],
};

function normalizeImageSizeValue(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  if (/^[1-4][Kk]$/.test(s)) return `${s[0]}K`;
  const m = /^(\d+)\s*[x×]\s*(\d+)$/i.exec(s);
  if (m) {
    const long = Math.max(Number(m[1]), Number(m[2]));
    if (long <= 1400) return "1K";
    if (long <= 2800) return "2K";
    if (long <= 3800) return "3K";
    return "4K";
  }
  return s;
}

function pickDefault(
  field: RunParamField,
  modelDefaults: Record<string, unknown>,
): string {
  const aliases: Record<string, string[]> = {
    max_tokens: ["max_tokens", "maxTokens"],
    is_instrumental: ["is_instrumental", "isInstrumental"],
    lyrics_optimizer: ["lyrics_optimizer", "lyricsOptimizer"],
    aspect_ratio: ["aspect_ratio", "aspectRatio"],
    duration_sec: ["duration_sec", "durationSec"],
  };
  const keys = aliases[field.key] ?? [field.key];
  let picked: string | undefined;
  for (const k of keys) {
    const v = modelDefaults[k];
    if (v === undefined || v === null) continue;
    if (typeof v === "boolean") {
      picked = v ? "true" : "false";
      break;
    }
    picked = String(v);
    break;
  }
  let value = picked ?? field.defaultValue;

  if (field.key === "size") {
    value = normalizeImageSizeValue(value);
  }

  // Select fields: only keep values that exist in the option list.
  // Legacy model defaults like "1024x1024" fall back to the field default (e.g. 1K).
  if (field.type === "select" && field.options && field.options.length > 0) {
    const allowed = new Set(field.options.map((o) => o.value));
    if (!allowed.has(value)) return field.defaultValue;
  }

  return value;
}

/** Form state: all values as strings (boolean as "true"/"false"). */
export function buildInitialRunParams(
  modality: string,
  modelDefaults: Record<string, unknown> = {},
): Record<string, string> {
  const fields =
    RUN_PARAM_FIELDS_BY_MODALITY[modality as RunParamModality] ??
    RUN_PARAM_FIELDS_BY_MODALITY.text;
  const out: Record<string, string> = {};
  for (const f of fields) {
    out[f.key] = pickDefault(f, modelDefaults);
    if (f.type === "image_pair") {
      const endKey = f.endKey ?? "reference_image_end";
      const endV = modelDefaults[endKey];
      out[endKey] =
        endV !== undefined && endV !== null && String(endV) !== ""
          ? String(endV)
          : "";
    }
  }
  return out;
}

function coerceField(
  field: RunParamField,
  raw: unknown,
): string | number | boolean | undefined {
  if (raw === undefined || raw === null || raw === "") {
    if (field.type === "boolean") return field.defaultValue === "true";
    if (field.defaultValue === "") return undefined;
    return coerceField(field, field.defaultValue);
  }
  if (field.type === "boolean") {
    if (typeof raw === "boolean") return raw;
    return String(raw) === "true" || raw === 1 || raw === "1";
  }
  if (field.type === "number") {
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) ? n : Number(field.defaultValue);
  }
  return String(raw);
}

/**
 * Merge model defaults + request overrides into typed run params.
 * Request wins when set (including empty string for optional selects → fall through).
 */
export function resolveRunParams(
  modality: string,
  modelDefaults: Record<string, unknown> = {},
  overrides: Record<string, unknown> | null | undefined = {},
): Record<string, unknown> {
  const fields =
    RUN_PARAM_FIELDS_BY_MODALITY[modality as RunParamModality] ??
    RUN_PARAM_FIELDS_BY_MODALITY.text;
  const result: Record<string, unknown> = {};
  const ov = overrides ?? {};

  for (const f of fields) {
    const hasOverride =
      Object.prototype.hasOwnProperty.call(ov, f.key) &&
      ov[f.key] !== undefined &&
      ov[f.key] !== null &&
      !(f.type !== "boolean" && ov[f.key] === "");
    const raw = hasOverride ? ov[f.key] : pickDefault(f, modelDefaults);
    const coerced = coerceField(f, raw);
    if (coerced !== undefined) result[f.key] = coerced;
    if (f.type === "image_pair") {
      const endKey = f.endKey ?? "reference_image_end";
      const endRaw = ov[endKey] ?? modelDefaults[endKey] ?? "";
      if (endRaw !== undefined && endRaw !== null && String(endRaw) !== "") {
        result[endKey] = String(endRaw);
      }
    }
  }

  // Text aliases used by older callers
  if (modality === "text") {
    if (ov.temperature != null && ov.temperature !== "") {
      result.temperature = Number(ov.temperature);
    }
    if (ov.maxTokens != null && ov.maxTokens !== "") {
      result.max_tokens = Number(ov.maxTokens);
    }
  }

  return result;
}

const AGNES_VIDEO_SIZE_MAP: Record<
  string,
  Record<string, { w: number; h: number }>
> = {
  // Documented Agnes preset example: 480p/16:9 → 832x448
  "480p": {
    "16:9": { w: 832, h: 448 },
    "9:16": { w: 448, h: 832 },
    "1:1": { w: 640, h: 640 },
    "4:3": { w: 640, h: 480 },
    "3:4": { w: 480, h: 640 },
  },
  // Docs default example uses 1152x768; true 16:9 720p is 1280x720 (Agnes auto-maps).
  "720p": {
    "16:9": { w: 1280, h: 720 },
    "9:16": { w: 720, h: 1280 },
    "1:1": { w: 960, h: 960 },
    "4:3": { w: 960, h: 720 },
    "3:4": { w: 720, h: 960 },
  },
  "1080p": {
    "16:9": { w: 1920, h: 1080 },
    "9:16": { w: 1080, h: 1920 },
    "1:1": { w: 1080, h: 1080 },
    "4:3": { w: 1440, h: 1080 },
    "3:4": { w: 1080, h: 1440 },
  },
};

/** Agnes recommended default when ratio omitted — kept as submit fallback. */
export const AGNES_DEFAULT_SIZE = { w: 1152, h: 768 };

const ZHIPU_SIZE_BY_TIER: Record<string, Record<string, string>> = {
  "480p": {
    "16:9": "720x480",
    "9:16": "720x480",
    "1:1": "1024x1024",
    "4:3": "1280x960",
    "3:4": "960x1280",
  },
  "720p": {
    "16:9": "1280x720",
    "9:16": "720x1280",
    "1:1": "1024x1024",
    "4:3": "1280x960",
    "3:4": "960x1280",
  },
  "1080p": {
    "16:9": "1920x1080",
    "9:16": "1080x1920",
    "1:1": "1024x1024",
    "4:3": "1280x960",
    "3:4": "960x1280",
  },
};

function isPixelSize(value: string): boolean {
  return /^\d+\s*[x×]\s*\d+$/i.test(value.trim());
}

function parsePixelSize(value: string): { w: number; h: number } | null {
  const m = /^(\d+)\s*[x×]\s*(\d+)$/i.exec(value.trim());
  if (!m) return null;
  return { w: Number(m[1]), h: Number(m[2]) };
}

/** Map UI video params → provider body knobs. */
export function videoSettingsFromParams(
  params: Record<string, unknown>,
  apiFormatId?: string | null,
): {
  width: number;
  height: number;
  /** Explicit WxH for providers that take `size` (智谱). */
  size: string;
  numFrames: number;
  frameRate: number;
  durationSec: number;
  fps: number | null;
  /** Volcengine-style aspect ratio passthrough. */
  aspectRatio: string;
} {
  const durationRaw = Number(params.duration_sec);
  // Seedance 官方允许 duration=-1（自动选时长）
  const durationSec =
    Number.isFinite(durationRaw) && durationRaw < 0
      ? -1
      : Math.max(1, Number.isFinite(durationRaw) && durationRaw > 0 ? durationRaw : 5);
  const fpsRaw = Number(params.fps);
  const fps = fpsRaw === 30 || fpsRaw === 60 ? fpsRaw : null;
  const frameRate = 24;
  const numFrames =
    durationSec <= 3
      ? 81
      : durationSec <= 5
        ? 121
        : durationSec <= 10
          ? 241
          : 441;

  const resolution = String(params.resolution || "720p").trim();
  const aspect = String(params.aspect_ratio || "16:9");
  const format = apiFormatId ?? "";

  // Zhipu / explicit pixel size in resolution field
  if (isPixelSize(resolution) || format === "video.zhipu-cogvideox") {
    const parsed = isPixelSize(resolution)
      ? parsePixelSize(resolution)!
      : parsePixelSize(
          ZHIPU_SIZE_BY_TIER[resolution]?.[aspect] ?? "1920x1080",
        )!;
    const sizeStr = `${parsed.w}x${parsed.h}`;
    return {
      width: parsed.w,
      height: parsed.h,
      size: sizeStr,
      numFrames,
      frameRate,
      durationSec,
      fps,
      aspectRatio: aspect,
    };
  }

  // Volcengine Seedance / Wan：prefer aspect; size is informational tier
  if (
    format === "video.volcengine-seedance" ||
    format === "video.volcengine-wan"
  ) {
    const tierSize =
      resolution === "480p"
        ? aspect === "9:16"
          ? { w: 480, h: 832 }
          : aspect === "1:1"
            ? { w: 640, h: 640 }
            : { w: 832, h: 480 }
        : resolution === "720p"
          ? aspect === "9:16"
            ? { w: 720, h: 1280 }
            : aspect === "1:1"
              ? { w: 960, h: 960 }
              : { w: 1280, h: 720 }
          : aspect === "9:16"
            ? { w: 1088, h: 1920 }
            : aspect === "1:1"
              ? { w: 1440, h: 1440 }
              : aspect === "21:9"
                ? { w: 2176, h: 928 }
                : { w: 1920, h: 1088 };
    return {
      width: tierSize.w,
      height: tierSize.h,
      size: `${tierSize.w}x${tierSize.h}`,
      numFrames,
      frameRate,
      durationSec,
      fps,
      aspectRatio: aspect,
    };
  }

  const agnes =
    AGNES_VIDEO_SIZE_MAP[resolution]?.[aspect] ??
    AGNES_VIDEO_SIZE_MAP["720p"]!["16:9"]!;
  const zhipuSize =
    ZHIPU_SIZE_BY_TIER[resolution]?.[aspect] ??
    ZHIPU_SIZE_BY_TIER["1080p"]!["16:9"]!;

  return {
    width: agnes.w,
    height: agnes.h,
    size: zhipuSize,
    numFrames,
    frameRate,
    durationSec,
    fps,
    aspectRatio: aspect,
  };
}

/** @deprecated kept for callers that still import the old map shape */
export const VIDEO_SIZE_MAP = AGNES_VIDEO_SIZE_MAP;

/** Resolve params using an API format's field list when available. */
export function resolveRunParamsForFormat(
  formatId: string | null | undefined,
  modality: string,
  modelDefaults: Record<string, unknown> = {},
  overrides: Record<string, unknown> | null | undefined = {},
  formatOverride?: { fields: readonly RunParamField[] } | null,
): Record<string, unknown> {
  const format = formatOverride ?? getApiFormat(formatId);
  if (!format) {
    return resolveRunParams(modality, modelDefaults, overrides);
  }

  const result: Record<string, unknown> = {};
  const ov = overrides ?? {};
  for (const f of format.fields) {
    const hasOverride =
      Object.prototype.hasOwnProperty.call(ov, f.key) &&
      ov[f.key] !== undefined &&
      ov[f.key] !== null &&
      !(f.type !== "boolean" && ov[f.key] === "");
    let raw: unknown;
    if (hasOverride) {
      raw = ov[f.key];
    } else if (
      modelDefaults[f.key] !== undefined &&
      modelDefaults[f.key] !== null &&
      modelDefaults[f.key] !== ""
    ) {
      raw = modelDefaults[f.key];
    } else {
      raw = f.defaultValue;
    }
    const coerced = coerceField(f, raw);
    if (coerced !== undefined) result[f.key] = coerced;
    if (f.type === "image_pair") {
      const endKey = f.endKey ?? "reference_image_end";
      const endRaw = ov[endKey] ?? modelDefaults[endKey] ?? "";
      if (endRaw !== undefined && endRaw !== null && String(endRaw) !== "") {
        result[endKey] = String(endRaw);
      }
    }
  }
  return result;
}
