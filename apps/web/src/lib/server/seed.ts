import { createModel, getModel, listModels, toPublicModel } from "./models";
import { getAgentBinsStatus } from "./agent-bins";
import { getDataDirMeta } from "./data-dir";
import { getDb } from "./db";
import { getEncryptionSecretStatus } from "./encryption-secret";
import { ensureDataDirs, getDbPath } from "./paths";
import { getObjectStorageRuntimeStatus } from "./tos";

/** Generic local mock models — safe for open-source first-run / demo seed. */
const MOCK_SEED_MODELS = [
  {
    id: "seed-mock-text",
    name: "Mock Text（本地）",
    modality: "text",
    capability: "chat",
    provider: "mock",
    baseUrl: "mock://text",
    modelId: "mock-chat",
    defaults: {
      temperature: 0.2,
      max_tokens: 128,
      api_format: "text.openai-compatible",
    },
  },
  {
    id: "seed-mock-image",
    name: "Mock Image（本地）",
    modality: "image",
    capability: "text2img",
    provider: "mock",
    baseUrl: "mock://image",
    modelId: "mock-img",
    defaults: { size: "1K", n: 1, api_format: "image.mock" },
  },
] as const;

/** Placeholder only — no API key; user fills Key on 模型配置. */
const OPENAI_COMPAT_PLACEHOLDER = {
  id: "seed-openai-compatible",
  name: "OpenAI 兼容（需填 Key）",
  modality: "text",
  capability: "chat",
  provider: "openai-compatible",
  baseUrl: "https://api.openai.com/v1",
  modelId: "gpt-4o-mini",
  defaults: { temperature: 0.2, api_format: "text.openai-compatible" },
} as const;

export function getStorageStatus() {
  const dataDir = ensureDataDirs();
  const dbPath = getDbPath();
  const encryption = getEncryptionSecretStatus();
  const db = getDb();
  const modelCount = (
    db.prepare(`SELECT COUNT(*) AS c FROM models`).get() as { c: number }
  ).c;
  const artifactCount = (
    db.prepare(`SELECT COUNT(*) AS c FROM artifacts`).get() as { c: number }
  ).c;
  const meta = getDataDirMeta();
  return {
    dataDir,
    dbPath,
    defaultDataDir: meta.defaultDataDir,
    usingCustomDir: meta.usingCustomDir,
    isDefault: meta.isDefault,
    encryptionConfigured: encryption.configured,
    encryptionSource: encryption.source,
    encryptionSecretPath: encryption.filePath,
    modelCount,
    artifactCount,
    objectStorage: getObjectStorageRuntimeStatus(),
    agentBins: getAgentBinsStatus(),
  };
}

function ensureSeedModels() {
  const created = [];
  for (const m of MOCK_SEED_MODELS) {
    const existing = getModel(m.id);
    if (existing) {
      created.push(toPublicModel(existing));
      continue;
    }
    created.push(
      createModel({
        id: m.id,
        name: m.name,
        modality: m.modality,
        capability: m.capability,
        provider: m.provider,
        baseUrl: m.baseUrl,
        apiKey: "sk-mock-local-demo-key",
        modelId: m.modelId,
        defaults: { ...m.defaults },
      }),
    );
  }

  const existingOai = getModel(OPENAI_COMPAT_PLACEHOLDER.id);
  if (existingOai) {
    created.push(toPublicModel(existingOai));
  } else {
    created.push(
      createModel({
        id: OPENAI_COMPAT_PLACEHOLDER.id,
        name: OPENAI_COMPAT_PLACEHOLDER.name,
        modality: OPENAI_COMPAT_PLACEHOLDER.modality,
        capability: OPENAI_COMPAT_PLACEHOLDER.capability,
        provider: OPENAI_COMPAT_PLACEHOLDER.provider,
        baseUrl: OPENAI_COMPAT_PLACEHOLDER.baseUrl,
        apiKey: null,
        modelId: OPENAI_COMPAT_PLACEHOLDER.modelId,
        defaults: { ...OPENAI_COMPAT_PLACEHOLDER.defaults },
      }),
    );
  }

  return created;
}

/**
 * Idempotent demo seed for empty / first-run desks.
 * Uses local mock + OpenAI-compatible placeholder — not vendor-specific clouds.
 */
export function seedDemoData() {
  ensureDataDirs();
  const models = ensureSeedModels();
  return {
    models,
    modelCount: listModels().length,
    storage: getStorageStatus(),
  };
}
