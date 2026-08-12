import {
  fieldsForApiFormat,
  RUN_PARAM_FIELDS_BY_MODALITY,
  type RunParamModality,
} from "@modeldesk/shared";

/** Compact human-readable params for history tables. */
export function formatRunParamsPreview(
  modality: string | null | undefined,
  params: unknown,
  apiFormatId?: string | null,
): string {
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    return "—";
  }
  const p = params as Record<string, unknown>;
  const formatFields = fieldsForApiFormat(apiFormatId);
  const fields =
    formatFields.length > 0
      ? formatFields
      : (RUN_PARAM_FIELDS_BY_MODALITY[
          (modality as RunParamModality) ?? "text"
        ] ?? RUN_PARAM_FIELDS_BY_MODALITY.text);

  const parts: string[] = [];
  for (const f of fields) {
    let raw = p[f.key];
    // Grok stores `duration`; modality fallback schema uses `duration_sec`.
    if (
      (raw === undefined || raw === null || raw === "") &&
      f.key === "duration_sec" &&
      p.duration != null &&
      p.duration !== ""
    ) {
      raw = p.duration;
    }
    if (
      (raw === undefined || raw === null || raw === "") &&
      f.key === "duration" &&
      p.duration_sec != null &&
      p.duration_sec !== ""
    ) {
      raw = p.duration_sec;
    }
    if (raw === undefined || raw === null || raw === "") continue;
    if (f.key === "instruction_custom") {
      if (p.instruction !== "__custom__") continue;
    }
    if (f.type === "boolean") {
      const on = raw === true || raw === "true" || raw === 1 || raw === "1";
      if (on) parts.push(f.label);
      continue;
    }
    const str = String(raw);
    const opt = f.options?.find((o) => o.value === str);
    const shown =
      opt?.label ??
      (str.length > 28 ? `${str.slice(0, 28)}…` : str);
    parts.push(shown);
  }
  return parts.length > 0 ? parts.join(" · ") : "—";
}

export function modelSnapshotFromConfig(config: Record<string, unknown>): {
  modality: string;
  name: string;
  modelId: string;
} {
  const model =
    config.model &&
    typeof config.model === "object" &&
    !Array.isArray(config.model)
      ? (config.model as Record<string, unknown>)
      : null;
  const modality =
    (typeof config.modality === "string" && config.modality) ||
    (typeof model?.modality === "string" && model.modality) ||
    "—";
  const name =
    (typeof model?.name === "string" && model.name) ||
    (typeof model?.modelId === "string" && model.modelId) ||
    "—";
  const modelId =
    (typeof model?.modelId === "string" && model.modelId) ||
    (typeof model?.id === "string" && model.id) ||
    "—";
  return { modality, name, modelId };
}
