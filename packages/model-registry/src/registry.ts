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

/** Reserved for Gateway stable aliases — must not be used as config names. */
const RESERVED_CONFIG_NAMES = new Set([
  "llm-default",
  "image-default",
  "video-default",
  "audio-default",
  "music-default",
]);

function normalizeConfigName(name: string): string {
  return name.trim().toLowerCase();
}

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

  /** Config names are globally unique so Gateway can use them as `model`. */
  async function assertUniqueConfigName(
    name: string,
    excludeId?: string,
  ): Promise<string> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new RegistryError("invalid_input", "配置名称不能为空");
    }
    const key = normalizeConfigName(trimmed);
    if (RESERVED_CONFIG_NAMES.has(key)) {
      throw new RegistryError(
        "invalid_input",
        `配置名称「${trimmed}」为系统保留（Gateway 别名），请换一个`,
      );
    }
    const all = await store.list();
    const clash = all.find(
      (c) =>
        c.id !== excludeId && normalizeConfigName(c.name) === key,
    );
    if (clash) {
      throw new RegistryError(
        "invalid_input",
        `配置名称「${trimmed}」已存在，请换一个唯一名称`,
      );
    }
    return trimmed;
  }

  async function saveConfig(
    input: ApiConfigInput & { id?: string },
  ): Promise<ApiConfig> {
    const name = await assertUniqueConfigName(input.name, input.id);
    const payload = { ...input, name };
    if (payload.id) {
      const updated = await store.update(payload.id, payload);
      if (!updated) {
        throw new RegistryError("not_found", `Config not found: ${payload.id}`);
      }
      return updated;
    }
    return store.create(payload);
  }

  async function updateConfig(
    id: string,
    input: ApiConfigUpdate,
  ): Promise<ApiConfig> {
    const payload =
      input.name !== undefined
        ? {
            ...input,
            name: await assertUniqueConfigName(input.name, id),
          }
        : input;
    const updated = await store.update(id, payload);
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
