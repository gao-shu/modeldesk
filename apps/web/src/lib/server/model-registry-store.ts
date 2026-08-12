import type {
  ApiConfig,
  ApiConfigInput,
  ApiConfigUpdate,
  ModelRegistryStore,
} from "@modeldesk/model-registry";
import {
  createModel,
  deleteModel,
  getModel,
  getModelApiKey,
  listModels,
  toPublicModel,
  updateModel,
  type ModelPublic,
} from "./models";

function toApiConfig(m: ModelPublic): ApiConfig {
  return {
    id: m.id,
    name: m.name,
    modality: m.modality,
    capability: m.capability,
    provider: m.provider,
    baseUrl: m.baseUrl,
    modelId: m.modelId,
    apiKeyMasked: m.apiKeyMasked,
    hasApiKey: m.hasApiKey,
    defaults: m.defaults,
    pricing: m.pricing,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

/** SQLite-backed store wrapping existing models.ts helpers. */
export function createSqliteModelStore(): ModelRegistryStore {
  return {
    list(modality?: string) {
      return listModels(modality).map(toApiConfig);
    },
    get(id: string) {
      const row = getModel(id);
      return row ? toApiConfig(toPublicModel(row)) : null;
    },
    create(input: ApiConfigInput) {
      return toApiConfig(
        createModel({
          id: input.id,
          name: input.name,
          modality: input.modality,
          capability: input.capability,
          provider: input.provider,
          baseUrl: input.baseUrl,
          apiKey: input.apiKey,
          modelId: input.modelId,
          defaults: input.defaults,
          pricing: input.pricing,
        }),
      );
    },
    update(id: string, input: ApiConfigUpdate) {
      const updated = updateModel(id, {
        name: input.name,
        modality: input.modality,
        capability: input.capability,
        provider: input.provider,
        baseUrl: input.baseUrl,
        apiKey: input.apiKey,
        modelId: input.modelId,
        defaults: input.defaults,
        pricing: input.pricing,
      });
      return updated ? toApiConfig(updated) : null;
    },
    delete(id: string) {
      return deleteModel(id);
    },
    getSecret(id: string) {
      return getModelApiKey(id);
    },
  };
}
