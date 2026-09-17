import { parseSseChunk } from "./sse";

export type CompareSlotStatus =
  | "idle"
  | "queued"
  | "running"
  | "success"
  | "error"
  | "cancelled";

export type CompareSlotState = {
  slot: string;
  modelId: string;
  modelName: string;
  status: CompareSlotStatus;
  output: string;
  artifactId: string | null;
  artifactIds: string[] | null;
  latencyMs: number | null;
  ttftMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  error: string | null;
  artifactMeta: Record<string, unknown> | null;
  statusMsg: string | null;
};

export type CompareRunMeta = {
  runId: string;
  modality: string;
  params: Record<string, unknown> | null;
};

export type CompareRunSummary = {
  runId: string;
  status: string;
  okCount: number;
  failCount: number;
};

function emptySlot(
  slot: string,
  modelId: string,
  modelName: string,
): CompareSlotState {
  return {
    slot,
    modelId,
    modelName,
    status: "idle",
    output: "",
    artifactId: null,
    artifactIds: null,
    latencyMs: null,
    ttftMs: null,
    inputTokens: null,
    outputTokens: null,
    error: null,
    artifactMeta: null,
    statusMsg: null,
  };
}

export function initCompareSlots(
  models: Array<{ id: string; name: string }>,
): CompareSlotState[] {
  return models.map((m, i) => emptySlot(String(i), m.id, m.name));
}

function patchSlot(
  slots: CompareSlotState[],
  slot: string,
  patch: Partial<CompareSlotState>,
): CompareSlotState[] {
  return slots.map((s) => (s.slot === slot ? { ...s, ...patch } : s));
}

export type StartCompareRunInput = {
  modality: string;
  modelIds: string[];
  modelNames: string[];
  prompt: string;
  params?: Record<string, unknown> | null;
  signal?: AbortSignal;
  onSlots: (slots: CompareSlotState[]) => void;
  onMeta?: (meta: CompareRunMeta) => void;
  onCompareDone?: (summary: CompareRunSummary) => void;
};

/**
 * POST /api/runs/compare and fan SSE events into per-slot state.
 * Does not touch run-session.ts.
 */
export async function startCompareRun(
  input: StartCompareRunInput,
): Promise<void> {
  let slots = initCompareSlots(
    input.modelIds.map((id, i) => ({
      id,
      name: input.modelNames[i] ?? id,
    })),
  );
  slots = slots.map((s) => ({
    ...s,
    status: "queued" as const,
    statusMsg: "已提交…",
  }));
  input.onSlots(slots);

  const res = await fetch("/api/runs/compare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      modality: input.modality,
      modelIds: input.modelIds,
      prompt: input.prompt,
      params: input.params ?? {},
    }),
    signal: input.signal,
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as {
      error?: string;
      code?: string;
    } | null;
    const message = data?.error ?? `请求失败（${res.status}）`;
    slots = slots.map((s) => ({
      ...s,
      status: "error" as const,
      error: message,
      statusMsg: "失败",
    }));
    input.onSlots(slots);
    throw new Error(message);
  }
  if (!res.body) throw new Error("无响应流");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    if (input.signal?.aborted) {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      break;
    }
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = parseSseChunk(buffer, (event, data) => {
      const payload = (data ?? {}) as Record<string, unknown>;
      const slot =
        payload.slot != null ? String(payload.slot) : null;

      if (event === "meta") {
        const sides = Array.isArray(payload.sides)
          ? (payload.sides as Array<Record<string, unknown>>)
          : [];
        for (const side of sides) {
          const s = side.slot != null ? String(side.slot) : null;
          if (s == null) continue;
          const model = side.model as Record<string, unknown> | undefined;
          slots = patchSlot(slots, s, {
            modelId:
              typeof model?.id === "string"
                ? model.id
                : typeof side.modelId === "string"
                  ? side.modelId
                  : slots.find((x) => x.slot === s)?.modelId ?? "",
            modelName:
              typeof model?.name === "string"
                ? model.name
                : slots.find((x) => x.slot === s)?.modelName ?? "",
            status: "running",
            statusMsg: "生成中…",
          });
        }
        input.onMeta?.({
          runId: String(payload.runId ?? ""),
          modality: String(payload.modality ?? input.modality),
          params:
            payload.params &&
            typeof payload.params === "object" &&
            !Array.isArray(payload.params)
              ? (payload.params as Record<string, unknown>)
              : null,
        });
        input.onSlots(slots);
        return;
      }

      if (slot == null) {
        if (event === "error" && typeof payload.message === "string") {
          slots = slots.map((s) =>
            s.status === "success"
              ? s
              : {
                  ...s,
                  status: "error" as const,
                  error: String(payload.message),
                  statusMsg: "失败",
                },
          );
          input.onSlots(slots);
        }
        if (event === "compare_done") {
          input.onCompareDone?.({
            runId: String(payload.runId ?? ""),
            status: String(payload.status ?? ""),
            okCount: Number(payload.okCount ?? 0),
            failCount: Number(payload.failCount ?? 0),
          });
        }
        return;
      }

      if (event === "status") {
        const status = String(payload.status ?? "running");
        const detail =
          payload.detail != null ? String(payload.detail) : null;
        let statusMsg = detail || status;
        if (/\d+\s*%/.test(statusMsg)) {
          statusMsg = statusMsg
            .replace(/^(queued|pending)\b/i, "排队中")
            .replace(/^(in_progress|processing|running)\b/i, "生成中");
        } else if (status === "running") {
          statusMsg = detail || "生成中…";
        } else if (status === "queued") {
          statusMsg = detail || "排队中…";
        }
        slots = patchSlot(slots, slot, {
          status: status === "queued" ? "queued" : "running",
          statusMsg,
        });
        input.onSlots(slots);
        return;
      }

      if (event === "token") {
        const text = String(payload.text ?? "");
        const cur = slots.find((s) => s.slot === slot);
        slots = patchSlot(slots, slot, {
          status: "running",
          output: (cur?.output ?? "") + text,
          statusMsg: "生成中…",
        });
        input.onSlots(slots);
        return;
      }

      if (event === "done") {
        slots = patchSlot(slots, slot, {
          status: "success",
          statusMsg: "完成",
          latencyMs:
            typeof payload.latencyMs === "number"
              ? payload.latencyMs
              : null,
          ttftMs:
            typeof payload.ttftMs === "number" ? payload.ttftMs : null,
          inputTokens:
            typeof payload.inputTokens === "number"
              ? payload.inputTokens
              : null,
          outputTokens:
            typeof payload.outputTokens === "number"
              ? payload.outputTokens
              : null,
          artifactId:
            typeof payload.artifactId === "string"
              ? payload.artifactId
              : null,
          artifactIds: Array.isArray(payload.artifactIds)
            ? (payload.artifactIds as string[]).filter(
                (v) => typeof v === "string",
              )
            : null,
          artifactMeta:
            payload.artifactMeta &&
            typeof payload.artifactMeta === "object" &&
            !Array.isArray(payload.artifactMeta)
              ? (payload.artifactMeta as Record<string, unknown>)
              : null,
          output:
            typeof payload.content === "string"
              ? payload.content
              : slots.find((s) => s.slot === slot)?.output ?? "",
          error: null,
        });
        input.onSlots(slots);
        return;
      }

      if (event === "error") {
        const cancelled = Boolean(payload.cancelled);
        slots = patchSlot(slots, slot, {
          status: cancelled ? "cancelled" : "error",
          statusMsg: cancelled ? "已取消" : "失败",
          error: String(payload.message ?? "Run failed"),
          latencyMs:
            typeof payload.latencyMs === "number"
              ? payload.latencyMs
              : null,
          ttftMs:
            typeof payload.ttftMs === "number" ? payload.ttftMs : null,
          output:
            typeof payload.partialContent === "string"
              ? payload.partialContent
              : slots.find((s) => s.slot === slot)?.output ?? "",
        });
        input.onSlots(slots);
        return;
      }

      if (event === "compare_done") {
        input.onCompareDone?.({
          runId: String(payload.runId ?? ""),
          status: String(payload.status ?? ""),
          okCount: Number(payload.okCount ?? 0),
          failCount: Number(payload.failCount ?? 0),
        });
      }
    });
  }
}
