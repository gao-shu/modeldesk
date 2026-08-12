import { resolveApiFormatId } from "@modeldesk/shared";
import { RegistryError } from "./errors";
import type { ModelRegistryStore } from "./store";
import type {
  ApiConfig,
  ApiConfigInput,
  ApiConfigUpdate,
  ConfigTestResult,
  ResolvedConfig,
} from "./types";

export type TestConfigFn = (id: string) => Promise<ConfigTestResult>;

export type ModelRegistry = {
  listConfigs: (modality?: string) => Promise<ApiConfig[]>;
  getConfig: (id: string) => Promise<ApiConfig | null>;
  saveConfig: (
    input: ApiConfigInput & { id?: string },
  ) => Promise<ApiConfig>;
  updateConfig: (id: string, input: ApiConfigUpdate) => Promise<ApiConfig>;
  deleteConfig: (id: string) => Promise<void>;
  resolveConfig: (id: string) => Promise<ResolvedConfig>;
  testConfig: (id: string) => Promise<ConfigTestResult>;
};

export function createModelRegistry(opts: {
  store: ModelRegistryStore;
  /** Inject host smoke-test; defaults to key-presence check only. */
  testConfig?: TestConfigFn;
}): ModelRegistry {
  const { store } = opts;

  async function listConfigs(modality?: string): Promise<ApiConfig[]> {
    return store.list(modality);
  }

  async function getConfig(id: string): Promise<ApiConfig | null> {
    return store.get(id);
  }

  async function saveConfig(
    input: ApiConfigInput & { id?: string },
  ): Promise<ApiConfig> {
    if (input.id) {
      const updated = await store.update(input.id, input);
      if (!updated) {
        throw new RegistryError("not_found", `Config not found: ${input.id}`);
      }
      return updated;
    }
    return store.create(input);
  }

  async function updateConfig(
    id: string,
    input: ApiConfigUpdate,
  ): Promise<ApiConfig> {
    const updated = await store.update(id, input);
    if (!updated) {
      throw new RegistryError("not_found", `Config not found: ${id}`);
    }
    return updated;
  }

  async function deleteConfig(id: string): Promise<void> {
    const ok = await store.delete(id);
    if (!ok) {
      throw new RegistryError("not_found", `Config not found: ${id}`);
    }
  }

  async function resolveConfig(id: string): Promise<ResolvedConfig> {
    const cfg = await store.get(id);
    if (!cfg) {
      throw new RegistryError("not_found", `Config not found: ${id}`);
    }
    const apiKey = await store.getSecret(id);
    const formatId = resolveApiFormatId({
      modality: cfg.modality,
      defaults: cfg.defaults,
      provider: cfg.provider,
      baseUrl: cfg.baseUrl,
      modelId: cfg.modelId,
    });
    return {
      id: cfg.id,
      name: cfg.name,
      modality: cfg.modality,
      capability: cfg.capability,
      provider: cfg.provider,
      baseUrl: cfg.baseUrl,
      modelId: cfg.modelId,
      apiKey,
      defaults: cfg.defaults,
      formatId,
    };
  }

  async function testConfig(id: string): Promise<ConfigTestResult> {
    if (opts.testConfig) {
      return opts.testConfig(id);
    }
    const cfg = await store.get(id);
    if (!cfg) {
      throw new RegistryError("not_found", `Config not found: ${id}`);
    }
    const key = await store.getSecret(id);
    if (!key) {
      return {
        ok: false,
        kind: "key-check",
        latencyMs: 0,
        message: "No API key stored for this model",
      };
    }
    return {
      ok: true,
      kind: "key-check",
      latencyMs: 0,
      message: "API key present",
    };
  }

  return {
    listConfigs,
    getConfig,
    saveConfig,
    updateConfig,
    deleteConfig,
    resolveConfig,
    testConfig,
  };
}
