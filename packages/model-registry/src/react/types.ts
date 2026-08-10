import type { Modality, ProviderPresetId } from "@modeldesk/shared";

export type ApiConfigFormState = {
  name: string;
  modality: Modality;
  capability: string;
  provider: string;
  presetId: ProviderPresetId | "";
  apiFormat: string;
  baseUrl: string;
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
