/** Public API config (never includes plaintext key). */
export type ApiConfig = {
  id: string;
  name: string;
  modality: string;
  capability: string;
  provider: string;
  baseUrl: string | null;
  modelId: string;
  apiKeyMasked: string | null;
  hasApiKey: boolean;
  defaults: Record<string, unknown>;
  pricing: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ApiConfigInput = {
  name: string;
  modality: string;
  capability: string;
  provider: string;
  baseUrl?: string | null;
  apiKey?: string | null;
  modelId: string;
  defaults?: Record<string, unknown>;
  pricing?: Record<string, unknown>;
  id?: string;
};

export type ApiConfigUpdate = Partial<Omit<ApiConfigInput, "id">> & {
  /** undefined = keep; null = clear; string = replace */
  apiKey?: string | null;
};

/** Server-only resolved config with decrypted key + format id. */
export type ResolvedConfig = {
  id: string;
  name: string;
  modality: string;
  capability: string;
  provider: string;
  baseUrl: string | null;
  modelId: string;
  apiKey: string | null;
  defaults: Record<string, unknown>;
  formatId: string;
};

export type ConfigTestResult = {
  ok: boolean;
  kind: string;
  latencyMs: number;
  message: string;
  detail?: Record<string, unknown>;
};

export type VideoTaskStatusValue =
  | "queued"
  | "running"
  | "downloading"
  | "succeeded"
  | "failed"
  | "cancelled";

export type VideoSubmitInput = {
  configId: string;
  prompt: string;
  params?: Record<string, unknown>;
  signal?: AbortSignal;
  timeoutMs?: number;
  onStatus?: (status: VideoTaskStatusValue, detail?: string) => void;
  onHttpLog?: (log: { url: string; body: Record<string, unknown> }) => void;
};

export type VideoArtifact = {
  bytes: Uint8Array;
  mime: string;
  extension: string;
  remoteUrl?: string;
  fileSize: number;
};

export type VideoTaskStatus = {
  taskId: string;
  configId: string;
  status: VideoTaskStatusValue;
  progress?: number | null;
  message?: string | null;
  artifact?: VideoArtifact | null;
  latencyMs?: number | null;
  upstreamTaskId?: string | null;
  error?: { code: string; message: string } | null;
  usage?: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  } | null;
};
