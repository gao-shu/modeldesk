import {
  getRunModel,
  listRunModelsForAgent,
  type RunCoreAgentModality,
  type RunModelSummary,
} from "@/lib/server/run-core";
import {
  STABLE_ALIASES,
  isStableAlias,
  loadAliases,
  modalityForAlias,
  type StableAlias,
} from "./aliases";

function isMock(m: RunModelSummary): boolean {
  return (
    m.provider === "mock" ||
    (m.baseUrl ?? "").toLowerCase().startsWith("mock://")
  );
}

export function listGatewayModels(
  modality?: RunCoreAgentModality,
): RunModelSummary[] {
  return listRunModelsForAgent(modality).filter((m) => !isMock(m));
}

/**
 * Resolve OpenAI `model` / alias → registry model.
 * Order: stable alias → registry id → unique name / upstream modelId.
 */
export function resolveModelRef(
  model: string,
  expectModality?: RunCoreAgentModality | null,
): RunModelSummary | null {
  const ref = model.trim();
  if (!ref) return null;

  if (isStableAlias(ref)) {
    const aliases = loadAliases();
    const targetId = aliases[ref];
    if (!targetId) return null;
    const row = getRunModel(targetId);
    if (!row || isMock(row)) return null;
    const need = expectModality ?? modalityForAlias(ref);
    if (row.modality !== need) return null;
    return row;
  }

  const direct = getRunModel(ref);
  if (direct && !isMock(direct)) {
    if (expectModality && direct.modality !== expectModality) return null;
    return direct;
  }

  const pool = listGatewayModels(expectModality ?? undefined);
  const refKey = ref.toLowerCase();
  const matches = pool.filter(
    (m) =>
      m.id === ref ||
      m.modelId === ref ||
      m.name === ref ||
      m.name.trim().toLowerCase() === refKey,
  );
  // Dedupe by id (name case variants of the same row).
  const unique = [...new Map(matches.map((m) => [m.id, m])).values()];
  if (unique.length === 1) return unique[0]!;
  return null;
}

export function aliasEntriesForModelsList(): Array<{
  id: StableAlias;
  object: "model";
  created: number;
  owned_by: string;
  root: string | null;
  name: string;
  modality: RunCoreAgentModality;
  resolved: boolean;
}> {
  const aliases = loadAliases();
  const created = Math.floor(Date.now() / 1000);
  return (Object.keys(STABLE_ALIASES) as StableAlias[]).map((id) => {
    const modality = modalityForAlias(id);
    const target = aliases[id] ?? null;
    const resolved = target ? resolveModelRef(id, modality) != null : false;
    return {
      id,
      object: "model" as const,
      created,
      owned_by: "modeldesk-alias",
      root: target,
      name: id,
      modality,
      resolved,
    };
  });
}
