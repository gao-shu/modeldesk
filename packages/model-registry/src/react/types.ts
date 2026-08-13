import type { ApiBaseUrlMode, Modality, ProviderPresetId } from "@modeldesk/shared";

export type ApiConfigFormState = {
  name: string;
  modality: Modality;
  capability: string;
  provider: string;
  presetId: ProviderPresetId | "";
  apiFormat: string;
  baseUrl: string;
  /** 简单=自动补全 path；高级=原样使用所填 URL（不自动拼接） */
  baseUrlMode: ApiBaseUrlMode;
  /**
   * 高级模式可选：查询/轮询 URL 模板（可用 {{id}}）。
   * 空则适配器走协议默认查询地址。
   */
  pollUrl: string;
  apiKey: string;
  modelId: string;
  defaults: Record<string, string>;
};

export type ApiConfigListItem = {
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
};

export type ProviderPresetOption = {
  id: string;
  label: string;
  baseUrl: string;
  defaultModelId: string;
};

export type SmokeTestDisplay = {
  ok: boolean;
  latencyMs: number;
  message: string;
};
