/** 检测页用的主流模型目录（可与 seed 不完全一致；id 为请求时的 model 字段） */
export type VerifyModelItem = {
  id: string;
  name: string;
  family:
    | "openai"
    | "claude"
    | "gemini"
    | "grok"
    | "deepseek"
    | "image"
    | "tts"
    | "other";
  /** 「热门模型」快捷 chips（每厂商最多 3 个） */
  popular?: boolean;
};

/** 性能测试页无预填时的默认模型 ID（官方 API） */
export const DEFAULT_VERIFY_MODEL_ID = "deepseek-v4-pro";

export const VERIFY_FAMILY_ORDER = [
  "deepseek",
  "openai",
  "claude",
  "gemini",
  "grok",
  "image",
  "tts",
  "other",
] as const;

export const VERIFY_FAMILY_LABELS: Record<string, string> = {
  deepseek: "DeepSeek",
  openai: "OpenAI",
  claude: "Claude",
  gemini: "Gemini",
  grok: "Grok",
  image: "生图",
  tts: "TTS",
  other: "其他",
};

export const VERIFY_MODELS: VerifyModelItem[] = [
  // —— DeepSeek（默认） ——
  {
    id: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    family: "deepseek",
    popular: true,
  },
  {
    id: "deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    family: "deepseek",
    popular: true,
  },
  { id: "deepseek-chat", name: "DeepSeek Chat（旧）", family: "deepseek" },
  { id: "deepseek-reasoner", name: "DeepSeek Reasoner（旧）", family: "deepseek" },

  // —— OpenAI ——
  { id: "gpt-4o", name: "GPT-4o", family: "openai", popular: true },
  { id: "gpt-4.1", name: "GPT-4.1", family: "openai", popular: true },
  { id: "o3", name: "o3", family: "openai", popular: true },
  { id: "gpt-4o-mini", name: "GPT-4o mini", family: "openai" },
  { id: "gpt-4.1-mini", name: "GPT-4.1 mini", family: "openai" },
  { id: "gpt-4.1-nano", name: "GPT-4.1 nano", family: "openai" },
  { id: "o3-mini", name: "o3-mini", family: "openai" },
  { id: "o4-mini", name: "o4-mini", family: "openai" },
  { id: "o1", name: "o1", family: "openai" },
  { id: "o1-mini", name: "o1-mini", family: "openai" },
  { id: "o1-pro", name: "o1-pro", family: "openai" },
  { id: "chatgpt-4o-latest", name: "ChatGPT-4o Latest", family: "openai" },
  { id: "gpt-4-turbo", name: "GPT-4 Turbo", family: "openai" },
  { id: "gpt-4", name: "GPT-4", family: "openai" },
  { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", family: "openai" },
  { id: "gpt-5.5", name: "GPT 5.5", family: "openai" },
  { id: "gpt-5.6-sol", name: "GPT 5.6 Sol", family: "openai" },

  // —— Claude ——
  {
    id: "claude-sonnet-4",
    name: "Claude Sonnet 4",
    family: "claude",
    popular: true,
  },
  {
    id: "claude-opus-4",
    name: "Claude Opus 4",
    family: "claude",
    popular: true,
  },
  {
    id: "claude-sonnet-4-5",
    name: "Claude Sonnet 4.5",
    family: "claude",
    popular: true,
  },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", family: "claude" },
  { id: "claude-opus-4-1", name: "Claude Opus 4.1", family: "claude" },
  { id: "claude-opus-4-5", name: "Claude Opus 4.5", family: "claude" },
  { id: "claude-opus-4-8", name: "Claude Opus 4.8", family: "claude" },
  { id: "claude-fable-5", name: "Claude Fable 5", family: "claude" },
  { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", family: "claude" },
  {
    id: "claude-3-5-sonnet-20241022",
    name: "Claude 3.5 Sonnet",
    family: "claude",
  },
  {
    id: "claude-3-5-haiku-20241022",
    name: "Claude 3.5 Haiku",
    family: "claude",
  },
  {
    id: "claude-3-7-sonnet-20250219",
    name: "Claude 3.7 Sonnet",
    family: "claude",
  },
  { id: "claude-3-opus-20240229", name: "Claude 3 Opus", family: "claude" },
  { id: "claude-3-sonnet-20240229", name: "Claude 3 Sonnet", family: "claude" },
  { id: "claude-3-haiku-20240307", name: "Claude 3 Haiku", family: "claude" },
  { id: "claude-haiku-3-5", name: "Claude Haiku 3.5", family: "claude" },

  // —— Gemini ——
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    family: "gemini",
    popular: true,
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    family: "gemini",
    popular: true,
  },
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    family: "gemini",
    popular: true,
  },
  { id: "gemini-3.1-pro", name: "Gemini 3.1 Pro", family: "gemini" },
  { id: "gemini-2.0-pro", name: "Gemini 2.0 Pro", family: "gemini" },
  { id: "gemini-2.0-flash-exp", name: "Gemini 2.0 Flash Exp", family: "gemini" },
  { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", family: "gemini" },
  { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", family: "gemini" },
  { id: "gemini-1.5-flash-8b", name: "Gemini 1.5 Flash 8B", family: "gemini" },
  { id: "gemini-2-flash", name: "Gemini 2 Flash", family: "gemini" },
  { id: "gemini-2-pro", name: "Gemini 2 Pro", family: "gemini" },

  // —— Grok ——
  {
    id: "grok-4.5",
    name: "Grok 4.5",
    family: "grok",
    popular: true,
  },
  { id: "grok-4", name: "Grok 4", family: "grok", popular: true },
  { id: "grok-3", name: "Grok 3", family: "grok", popular: true },
  { id: "grok-3-mini", name: "Grok 3 mini", family: "grok" },
  { id: "grok-3-fast", name: "Grok 3 Fast", family: "grok" },
  { id: "grok-2", name: "Grok 2", family: "grok" },
  { id: "grok-2-latest", name: "Grok 2 Latest", family: "grok" },
  { id: "grok-2-vision-1212", name: "Grok 2 Vision", family: "grok" },

  // —— 生图 ——
  {
    id: "chatgpt-image-2",
    name: "Image 2",
    family: "image",
    popular: true,
  },
  { id: "dall-e-3", name: "DALL·E 3", family: "image", popular: true },
  { id: "flux-1", name: "Flux.1", family: "image", popular: true },
  { id: "gpt-image-1", name: "GPT Image 1", family: "image" },
  { id: "dall-e-2", name: "DALL·E 2", family: "image" },
  { id: "flux-pro", name: "Flux Pro", family: "image" },
  { id: "flux-dev", name: "Flux Dev", family: "image" },
  { id: "imagen-3", name: "Imagen 3", family: "image" },
  { id: "stable-diffusion-3", name: "SD 3", family: "image" },

  // —— TTS ——
  {
    id: "mimo-v2.5-tts",
    name: "MiMo-V2.5-TTS",
    family: "tts",
    popular: true,
  },
  { id: "tts-1", name: "TTS-1", family: "tts", popular: true },
  { id: "tts-1-hd", name: "TTS-1 HD", family: "tts", popular: true },
  { id: "gpt-4o-mini-tts", name: "GPT-4o mini TTS", family: "tts" },
  { id: "eleven_multilingual_v2", name: "ElevenLabs Multilingual", family: "tts" },
  { id: "eleven_turbo_v2", name: "ElevenLabs Turbo", family: "tts" },
];
