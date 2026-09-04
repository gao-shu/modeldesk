/** Pure helpers for run-core (safe to unit-test without SQLite). */

/** Modalities exposed to MCP / CLI agent surfaces (matches desk run path). */
export const RUN_CORE_AGENT_MODALITIES = [
  "text",
  "image",
  "video",
  "audio",
] as const;
export type RunCoreAgentModality = (typeof RUN_CORE_AGENT_MODALITIES)[number];

/** @deprecated Prefer RUN_CORE_AGENT_MODALITIES — kept for existing imports. */
export const RUN_CORE_MVP_MODALITIES = RUN_CORE_AGENT_MODALITIES;
/** @deprecated Prefer RunCoreAgentModality */
export type RunCoreMvpModality = RunCoreAgentModality;

export function isRunCoreAgentModality(
  modality: string,
): modality is RunCoreAgentModality {
  return (RUN_CORE_AGENT_MODALITIES as readonly string[]).includes(modality);
}

/** @deprecated Prefer isRunCoreAgentModality */
export function isRunCoreMvpModality(
  modality: string,
): modality is RunCoreAgentModality {
  return isRunCoreAgentModality(modality);
}

export type RunCorePrepareErrorCode =
  | "not_found"
  | "no_key"
  | "no_base_url"
  | "modality_mismatch";

export function prepareErrorHttpStatus(code: RunCorePrepareErrorCode): number {
  if (code === "not_found") return 404;
  if (code === "modality_mismatch") return 400;
  return 400;
}
