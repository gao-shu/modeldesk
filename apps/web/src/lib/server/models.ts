import type { Capability, Modality } from "@modeldesk/shared";
import { randomUUID } from "node:crypto";
import {
  decryptSecret,
  encryptSecret,
  maskEncryptedSecret,
  maskSecret,
} from "./crypto";
import { getDb, nowIso } from "./db";
import { parseJsonObject } from "./json";

export type ModelRow = {
  id: string;
  name: string;
  modality: string;
  capability: string;
  provider: string;
  base_url: string | null;
  api_key_enc: string | null;
  model_id: string;
  defaults_json: string;
  pricing_json: string;
  created_at: string;
  updated_at: string;
};

export type ModelPublic = {
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

export type ModelInput = {
  name: string;
  modality: Modality | string;
  capability: Capability | string;
  provider: string;
  baseUrl?: string | null;
  apiKey?: string | null;
  modelId: string;
  defaults?: Record<string, unknown>;
  pricing?: Record<string, unknown>;
  id?: string;
};

export function toPublicModel(row: ModelRow): ModelPublic {
  return {
    id: row.id,
    name: row.name,
    modality: row.modality,
    capability: row.capability,
    provider: row.provider,
    baseUrl: row.base_url,
    modelId: row.model_id,
    apiKeyMasked: maskEncryptedSecret(row.api_key_enc),
    hasApiKey: Boolean(row.api_key_enc),
    defaults: parseJsonObject(row.defaults_json),
    pricing: parseJsonObject(row.pricing_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listModels(modality?: string): ModelPublic[] {
  const db = getDb();
  const rows = modality
    ? (db
        .prepare(
          `SELECT * FROM models WHERE modality = ? ORDER BY created_at DESC`,
        )
        .all(modality) as ModelRow[])
    : (db
        .prepare(`SELECT * FROM models ORDER BY created_at DESC`)
        .all() as ModelRow[]);
  return rows.map(toPublicModel);
}

export function getModel(id: string): ModelRow | null {
  const row = getDb().prepare(`SELECT * FROM models WHERE id = ?`).get(id) as
    | ModelRow
    | undefined;
  return row ?? null;
}

export function getModelApiKey(id: string): string | null {
  const row = getModel(id);
  if (!row?.api_key_enc) return null;
  return decryptSecret(row.api_key_enc);
}

export function createModel(input: ModelInput): ModelPublic {
  const db = getDb();
  const id = input.id ?? randomUUID();
  const ts = nowIso();
  db.prepare(
    `INSERT INTO models (
      id, name, modality, capability, provider, base_url, api_key_enc,
      model_id, defaults_json, pricing_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.name,
    input.modality,
    input.capability,
    input.provider,
    input.baseUrl ?? null,
    input.apiKey ? encryptSecret(input.apiKey) : null,
    input.modelId,
    JSON.stringify(input.defaults ?? {}),
    JSON.stringify(input.pricing ?? {}),
    ts,
    ts,
  );
  return toPublicModel(getModel(id)!);
}

export function updateModel(
  id: string,
  input: Partial<Omit<ModelInput, "id">> & {
    /** When true, clear stored API key. When string, replace. When undefined, keep. */
    apiKey?: string | null;
  },
): ModelPublic | null {
  const existing = getModel(id);
  if (!existing) return null;

  const ts = nowIso();
  let apiKeyEnc = existing.api_key_enc;
  if (input.apiKey === null) {
    apiKeyEnc = null;
  } else if (typeof input.apiKey === "string" && input.apiKey.length > 0) {
    apiKeyEnc = encryptSecret(input.apiKey);
  }

  getDb()
    .prepare(
      `UPDATE models SET
        name = ?,
        modality = ?,
        capability = ?,
        provider = ?,
        base_url = ?,
        api_key_enc = ?,
        model_id = ?,
        defaults_json = ?,
        pricing_json = ?,
        updated_at = ?
      WHERE id = ?`,
    )
    .run(
      input.name ?? existing.name,
      input.modality ?? existing.modality,
      input.capability ?? existing.capability,
      input.provider ?? existing.provider,
      input.baseUrl !== undefined ? input.baseUrl : existing.base_url,
      apiKeyEnc,
      input.modelId ?? existing.model_id,
      JSON.stringify(
        input.defaults ?? parseJsonObject(existing.defaults_json),
      ),
      JSON.stringify(
        input.pricing ?? parseJsonObject(existing.pricing_json),
      ),
      ts,
      id,
    );

  return toPublicModel(getModel(id)!);
}

export function deleteModel(id: string): boolean {
  const db = getDb();
  if (!getModel(id)) return false;

  const tx = db.transaction((modelId: string) => {
    // eval_jobs / eval_run_models 引用 models(id) 且无 ON DELETE CASCADE
    const jobIds = (
      db
        .prepare(`SELECT id FROM eval_jobs WHERE model_id = ?`)
        .all(modelId) as Array<{ id: string }>
    ).map((r) => r.id);

    if (jobIds.length > 0) {
      const placeholders = jobIds.map(() => "?").join(",");
      db.prepare(
        `DELETE FROM scores WHERE job_id IN (${placeholders})`,
      ).run(...jobIds);
    }
    db.prepare(`DELETE FROM eval_jobs WHERE model_id = ?`).run(modelId);
    db.prepare(`DELETE FROM eval_run_models WHERE model_id = ?`).run(modelId);
    const result = db.prepare(`DELETE FROM models WHERE id = ?`).run(modelId);
    return result.changes > 0;
  });

  return tx(id);
}

export function updateModelApiKey(
  id: string,
  apiKey: string | null,
): ModelPublic | null {
  const existing = getModel(id);
  if (!existing) return null;
  const ts = nowIso();
  getDb()
    .prepare(
      `UPDATE models SET api_key_enc = ?, updated_at = ? WHERE id = ?`,
    )
    .run(apiKey ? encryptSecret(apiKey) : null, ts, id);
  return toPublicModel(getModel(id)!);
}

export function deleteModelApiKey(id: string): ModelPublic | null {
  return updateModelApiKey(id, null);
}

export { maskSecret };
