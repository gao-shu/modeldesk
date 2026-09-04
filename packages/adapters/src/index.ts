/**
 * Modality / provider adapters for ModelDesk.
 */

export type AdapterStatus = "ready" | "planned";

export const ADAPTERS_STATUS: AdapterStatus = "ready";

export {
  chatCompletion,
  streamChatCompletion,
  redactChatMessagesForHttpLog,
  type ChatMessage,
  type ChatUsage,
  type NonStreamChatResult,
  type StreamChatChunk,
  type StreamChatOptions,
} from "./openai-compatible";

export {
  generateImage,
  downloadBytes,
  isAgnesApiBaseUrl,
  isVolcengineArkImageBaseUrl,
  isZhipuImageBaseUrl,
  isGoogleGeminiImageBaseUrl,
  resolveSeedreamSize,
  mapOpenAiAsyncQuality,
  mapOpenAiAsyncSize,
  type ImageGenOptions,
  type ImageGenResult,
} from "./images";

export {
  synthesizeSpeech,
  type TtsOptions,
  type TtsResult,
} from "./tts";

export {
  generateVideo,
  buildSeedanceRelayForm,
  buildMinimaxH3RelaySubmit,
  normalizeMinimaxH3RelayResolution,
  resolveMinimaxH3RelaySize,
  buildAgnes25FlashSubmitBody,
  isAgnesVideoBaseUrl,
  isAgnesVideo25Flash,
  isVolcengineArkBaseUrl,
  isZhipuVideoBaseUrl,
  zhipuSizeFromDimensions,
  type VideoGenOptions,
  type VideoGenResult,
  type VideoJobStatus,
} from "./video";

export {
  generateKlingVideo,
  generateMinimaxHailuoVideo,
  generateViduVideo,
  resolveKlingBearer,
  signKlingJwt,
} from "./video-cn";

export {
  defaultVideoPollTiming,
  isRateLimitBody,
  isRateLimitStatus,
  nextPollDelayMs,
  retryAfterMs,
  sleep,
  type DefaultPollTiming,
} from "./poll";

export {
  synthesizeQwenSpeech,
  isQwenTtsBaseUrl,
  type QwenTtsOptions,
  type QwenTtsResult,
} from "./qwen-tts";

export {
  synthesizeMinimaxSpeech,
  isMinimaxApiBaseUrl,
  type MinimaxTtsOptions,
  type MinimaxTtsResult,
} from "./minimax-tts";

export {
  synthesizeXiaomiMimoSpeech,
  isXiaomiMimoTtsBaseUrl,
  type MimoTtsOptions,
  type MimoTtsResult,
} from "./mimo-tts";

export {
  parseUsageFromUnknown,
  extractUsageFromResponse,
  estimatePromptTokens,
  resolveTokenCounts,
  type TokenUsage,
} from "./usage";
