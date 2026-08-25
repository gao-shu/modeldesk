/** Shared types & constants for ModelDesk. */

export { APP_NAME, APP_TAGLINE } from "./nav";

export const MODALITIES = [
  "text",
  "image",
  "video",
  "audio",
  "music",
] as const;

export type Modality = (typeof MODALITIES)[number];

/** UI labels for modalities (ids stay English in data). Prefer `modalityLabel` / `ModalityFilter` in UI. */
export const MODALITY_LABELS: Record<Modality, string> = {
  text: "文本",
  image: "图片",
  video: "视频",
  audio: "语音",
  music: "音乐",
};

/** Single source of truth for modality display text. */
export function modalityLabel(modality: string | null | undefined): string {
  if (!modality) return "—";
  return MODALITY_LABELS[modality as Modality] ?? modality;
}

export const CAPABILITIES = [
  "chat",
  "completion",
  "text2img",
  "img2img",
  "text2video",
  "img2video",
  "tts",
  "stt",
  "text2music",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/** UI labels for capabilities (ids stay English in data). */
export const CAPABILITY_LABELS: Record<Capability, string> = {
  chat: "对话",
  completion: "补全",
  text2img: "文生图",
  img2img: "图生图",
  text2video: "文生视频",
  img2video: "图生视频",
  tts: "语音合成",
  stt: "语音识别",
  text2music: "文生音乐",
};

export function capabilityLabel(
  capability: string | null | undefined,
): string {
  if (!capability) return "—";
  return CAPABILITY_LABELS[capability as Capability] ?? capability;
}

export const CAPABILITIES_BY_MODALITY: Record<Modality, readonly Capability[]> =
  {
    text: ["chat", "completion"],
    image: ["text2img", "img2img"],
    video: ["text2video", "img2video"],
    audio: ["tts", "stt"],
    music: ["text2music"],
  };

export const RUN_MODES = ["single", "compare"] as const;
export type RunMode = (typeof RUN_MODES)[number];

type ProviderPreset = {
  id: string;
  label: string;
  baseUrl: string;
  defaultModelId: string;
  /** Which modalities this shortcut applies to. Empty/omit = all. */
  modalities?: readonly Modality[];
};

/**
 * Core shortcuts: 御三家 + 兼容 + 自定义（按模态过滤，避免一锅粥）.
 */
export const CORE_PROVIDER_PRESETS = [
  {
    id: "openai",
    label: "OpenAI 官方",
    baseUrl: "https://api.openai.com/v1",
    defaultModelId: "gpt-4o",
    modalities: ["text", "image", "video"] as const,
  },
  {
    id: "anthropic",
    label: "Anthropic Claude",
    baseUrl: "",
    defaultModelId: "claude-sonnet-4-20250514",
    modalities: ["text"] as const,
  },
  {
    id: "gemini",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModelId: "gemini-2.0-flash",
    modalities: ["text"] as const,
  },
  {
    id: "openai-compatible",
    label: "OpenAI 兼容",
    baseUrl: "",
    defaultModelId: "",
    modalities: ["text", "image", "video"] as const,
  },
  {
    id: "custom",
    label: "完全自定义",
    baseUrl: "",
    defaultModelId: "",
  },
] as const satisfies readonly ProviderPreset[];

/**
 * Optional regional / vendor pack. Shown when「更多厂商」on + modality matches.
 */
export const EXTENDED_PROVIDER_PRESETS = [
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    defaultModelId: "deepseek-v4-pro",
    modalities: ["text"] as const,
  },
  {
    id: "agnes",
    label: "Agnes AI",
    baseUrl: "https://apihub.agnes-ai.com/v1",
    defaultModelId: "agnes-2.0-flash",
    modalities: ["text"] as const,
  },
  {
    id: "agnes-image",
    label: "Agnes 图像",
    baseUrl: "https://apihub.agnes-ai.com/v1",
    defaultModelId: "agnes-image-2.1-flash",
    modalities: ["image"] as const,
  },
  {
    id: "agnes-video",
    label: "Agnes 视频",
    baseUrl: "https://apihub.agnes-ai.com/v1",
    defaultModelId: "agnes-video-v2.0",
    modalities: ["video"] as const,
  },
  {
    id: "zhipu-video",
    label: "智谱视频（CogVideoX）",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultModelId: "cogvideox-flash",
    modalities: ["video"] as const,
  },
  {
    id: "volcengine-ark",
    label: "火山方舟（图片/视频）",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    defaultModelId: "doubao-seedream-4-5-251128",
    modalities: ["image", "video"] as const,
  },
  {
    id: "minimax-music",
    label: "MiniMax 音乐",
    baseUrl: "https://api.minimaxi.com/v1",
    defaultModelId: "music-3.0-free",
    modalities: ["music"] as const,
  },
  {
    id: "minimax-tts",
    label: "MiniMax TTS",
    baseUrl: "https://api.minimaxi.com/v1",
    defaultModelId: "speech-2.8-hd",
    modalities: ["audio"] as const,
  },
  {
    id: "xiaomi-mimo-tts",
    label: "小米 MiMo TTS（限时免费）",
    baseUrl: "https://api.xiaomimimo.com/v1",
    defaultModelId: "mimo-v2.5-tts",
    modalities: ["audio"] as const,
  },
  {
    id: "qwen-tts",
    label: "千问 TTS（DashScope）",
    baseUrl: "https://dashscope.aliyuncs.com",
    defaultModelId: "qwen-audio-3.0-tts-flash",
    modalities: ["audio"] as const,
  },
  {
    id: "qwen3-tts",
    label: "千问3 TTS",
    baseUrl: "https://dashscope.aliyuncs.com",
    defaultModelId: "qwen3-tts-flash",
    modalities: ["audio"] as const,
  },
  {
    id: "mock",
    label: "Mock（本地演示）",
    baseUrl: "mock://local",
    defaultModelId: "mock-model",
  },
] as const satisfies readonly ProviderPreset[];

/**
 * Community mid-tier relays — off by default (providerPresetsForUi needs includeRelay).
 */
export const RELAY_PROVIDER_PRESETS = [
  {
    id: "xiaoyi",
    label: "小易",
    baseUrl: "https://xiaoyiapi.xyz/v1",
    defaultModelId: "gpt-image-2-vip",
    modalities: ["image"] as const,
  },
  {
    id: "frimodel",
    label: "FriModel",
    baseUrl: "https://api.frimodel.com/v1",
    defaultModelId: "gpt-image-2-w",
    modalities: ["image"] as const,
  },
] as const satisfies readonly ProviderPreset[];

/** Flat catalog for types + lookup (core ∪ extended ∪ relay). */
export const PROVIDER_PRESETS = [
  ...CORE_PROVIDER_PRESETS,
  ...EXTENDED_PROVIDER_PRESETS,
  ...RELAY_PROVIDER_PRESETS,
] as const;

export type ProviderPresetId = (typeof PROVIDER_PRESETS)[number]["id"];

function presetMatchesModality(
  preset: (typeof PROVIDER_PRESETS)[number],
  modality?: string,
): boolean {
  if (!modality) return true;
  const mods = (preset as ProviderPreset).modalities;
  if (!mods || mods.length === 0) return true;
  return mods.includes(modality as Modality);
}

/** Presets shown in the model form (filtered by modality + toggles). */
export function providerPresetsForUi(options?: {
  modality?: string;
  includeExtended?: boolean;
  includeRelay?: boolean;
}): readonly (typeof PROVIDER_PRESETS)[number][] {
  const modality = options?.modality;
  const list = [...CORE_PROVIDER_PRESETS] as Array<
    (typeof PROVIDER_PRESETS)[number]
  >;
  if (options?.includeExtended) {
    list.push(...EXTENDED_PROVIDER_PRESETS);
  }
  if (options?.includeRelay) {
    list.push(...RELAY_PROVIDER_PRESETS);
  }
  return list.filter((p) => presetMatchesModality(p, modality));
}

/** Default parameter keys shown in the model form by modality. */
export const DEFAULT_PARAM_KEYS_BY_MODALITY: Record<
  Modality,
  readonly string[]
> = {
  text: ["temperature", "max_tokens"],
  image: ["n", "size", "quality", "ratio", "reference_images"],
  video: ["duration_sec", "resolution", "aspect_ratio"],
  audio: ["voice", "speed"],
  music: ["is_instrumental", "lyrics_optimizer", "duration_sec", "lyrics"],
};

export {
  RUN_PARAM_FIELDS_BY_MODALITY,
  buildInitialRunParams,
  resolveRunParams,
  resolveRunParamsForFormat,
  videoSettingsFromParams,
  type RunParamField,
  type RunParamFieldType,
  type RunParamModality,
  type RunParamOption,
} from "./run-params";

export {
  API_FORMATS,
  apiFormatsForModality,
  applyFormatParamAliases,
  buildParamsForApiFormat,
  defaultApiFormatId,
  fieldsForApiFormat,
  getApiFormat,
  modalityUsesApiFormatPicker,
  pickRunParamsForApiFormat,
  resolveApiFormatId,
  type ApiFormatDef,
  type ApiFormatId,
  type ApiFormatModality,
  type ApiFormatTier,
} from "./api-formats";

export {
  canonicalizeApiModelId,
  canonicalizeSeedanceModelId,
  canonicalizeSeedreamModelId,
  canonicalizeWanModelId,
} from "./model-ids";

export {
  apiBaseUrlModeFromDefaults,
  formatSupportsApiBaseUrlMode,
  inferApiBaseUrlMode,
  previewResolvedApiBaseUrl,
  resolveApiActionUrl,
  resolveApiBaseUrl,
  toAdvancedApiBaseUrl,
  toSimpleApiBaseUrl,
  normalizeVolcengineArkBaseUrl,
  type ApiBaseUrlMode,
} from "./api-base-url";

export {
  formatSupportsChatBaseUrlMode,
  inferChatBaseUrlMode,
  resolveChatCompletionsUrl,
  toSimpleChatBaseUrl,
  type ChatBaseUrlMode,
} from "./chat-url";

export { defaultMinimaxPollUrlTemplate, defaultPollUrlTemplate, formatSupportsPollUrl } from "./minimax-poll-url";

export {
  VIDEO_ORPHAN_MAX_AGE_MS,
  VIDEO_WAIT_TIMEOUT_MS,
} from "./timeouts";

export type {
  NavItem,
  NavSection,
} from "./nav";

export {
  NAV_ITEMS,
  NAV_SECTIONS,
  DEFAULT_RUN_HREF,
} from "./nav";
