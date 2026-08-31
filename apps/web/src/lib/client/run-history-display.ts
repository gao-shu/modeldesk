import {
  CHAT_ATTACHMENTS_PARAM_KEY,
  fieldsForApiFormat,
  parseChatAttachmentsFromParams,
  RUN_PARAM_FIELDS_BY_MODALITY,
  type RunParamModality,
} from "@modeldesk/shared";

function formatAttachmentListPreview(raw: string): string | null {
  const items = parseChatAttachmentsFromParams({
    [CHAT_ATTACHMENTS_PARAM_KEY]: raw,
  });
  if (items.length === 0) return null;
  const counts = { image: 0, video: 0, file: 0 };
  for (const item of items) {
    counts[item.kind] += 1;
  }
  const parts: string[] = [];
  if (counts.image > 0) parts.push(`${counts.image} 图`);
  if (counts.video > 0) parts.push(`${counts.video} 视频`);
  if (counts.file > 0) parts.push(`${counts.file} 文件`);
  return parts.length > 0 ? parts.join(" · ") : `${items.length} 附件`;
}

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
    if (f.type === "attachment_list") {
      const preview = formatAttachmentListPreview(String(raw));
      if (preview) parts.push(preview);
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
