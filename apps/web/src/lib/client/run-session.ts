import { parseSseChunk } from "./sse";

/** Soft cap on concurrent single-model runs from this browser tab. */
export const MAX_CONCURRENT_SINGLE_RUNS = 3;

export type ActiveRunSnapshot = {
  runId: string | null;
  jobId: string | null;
  modelId: string;
  modality: string;
  prompt: string;
  running: boolean;
  output: string;
  statusMsg: string | null;
  error: string | null;
  latencyMs: number | null;
  ttftMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  artifactId: string | null;
  /** All artifact ids when multiple images were generated. */
  artifactIds: string[] | null;
  /** Artifact metadata (fileSize, dimensions etc.) from the done event. */
  artifactMeta: Record<string, unknown> | null;
  /** Params used for this run (for metrics display). */
  params: Record<string, unknown> | null;
  /** How many local SSE sessions are still running. */
  runningCount: number;
  updatedAt: number;
};

type Listener = (snap: ActiveRunSnapshot) => void;

type LocalSession = {
  localId: string;
  abort: AbortController;
  /** True while this tab still holds an active SSE fetch for the run. */
  live: boolean;
  startedAt: number;
  snap: Omit<ActiveRunSnapshot, "runningCount" | "updatedAt">;
};

const emptyFields = (): Omit<ActiveRunSnapshot, "runningCount" | "updatedAt"> => ({
  runId: null,
  jobId: null,
  modelId: "",
  modality: "text",
  prompt: "",
  running: false,
  output: "",
  statusMsg: null,
  error: null,
  latencyMs: null,
  ttftMs: null,
  inputTokens: null,
  outputTokens: null,
  costUsd: null,
  artifactId: null,
  artifactIds: null,
  artifactMeta: null,
  params: null,
});

const sessions = new Map<string, LocalSession>();
let focusedLocalId: string | null = null;
const listeners = new Set<Listener>();

function runningCount(): number {
  let n = 0;
  for (const s of sessions.values()) {
    if (s.snap.running) n += 1;
  }
  return n;
}

function focusedSnap(): ActiveRunSnapshot {
  const session = focusedLocalId ? sessions.get(focusedLocalId) : null;
  const base = session?.snap ?? emptyFields();
  return {
    ...base,
    runningCount: runningCount(),
    updatedAt: Date.now(),
  };
}

function emit() {
  const snap = focusedSnap();
  for (const l of listeners) l(snap);
}

function patchSession(
  localId: string,
  p: Partial<Omit<ActiveRunSnapshot, "runningCount" | "updatedAt">>,
) {
  const session = sessions.get(localId);
  if (!session) return;
  session.snap = { ...session.snap, ...p };
  // Drop finished sessions after a while is optional; keep until replaced for focus restore.
  if (!session.snap.running && session.abort.signal.aborted) {
    /* keep snap for focused display */
  }
  emit();
}

function pruneIdleSessions() {
  for (const [id, s] of sessions) {
    if (id === focusedLocalId) continue;
    if (!s.snap.running) sessions.delete(id);
  }
}

export function getActiveRun(): ActiveRunSnapshot {
  return focusedSnap();
}

export function getRunningCount(): number {
  return runningCount();
}

/**
 * Drop finished/failed session display so navigating back to the page
 * shows a blank output. Keeps sessions that are still running (live SSE
 * or hydrated in-flight poll).
 */
export function clearIdleActiveDisplay(options?: {
  /** Skip notifying subscribers — required when called from a useState initializer. */
  silent?: boolean;
}): void {
  for (const [id, s] of sessions) {
    if (s.snap.running) continue;
    sessions.delete(id);
    if (focusedLocalId === id) focusedLocalId = null;
  }
  if (!focusedLocalId || !sessions.has(focusedLocalId)) {
    focusedLocalId = null;
    for (const [id, s] of sessions) {
      if (s.snap.running) {
        focusedLocalId = id;
        break;
      }
    }
  }
  if (!options?.silent) emit();
}

/** Merge artifact meta onto the focused session when artifactId matches. */
export function patchActiveArtifactMeta(
  artifactId: string,
  meta: Record<string, unknown>,
): void {
  const session = focusedLocalId ? sessions.get(focusedLocalId) : null;
  if (!session || session.snap.artifactId !== artifactId) return;
  patchSession(focusedLocalId!, {
    artifactMeta: { ...(session.snap.artifactMeta ?? {}), ...meta },
  });
}

export function subscribeActiveRun(listener: Listener): () => void {
  listeners.add(listener);
  listener(focusedSnap());
  return () => listeners.delete(listener);
}

/** Restore UI from a finished/failed history row (does not start a new request). */
export function hydrateFromHistory(input: {
  runId: string;
  jobId: string;
  modelId: string;
  modality: string;
  prompt: string;
  status: string;
  error: string | null;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  content?: string;
  artifactId?: string | null;
  artifactIds?: string[] | null;
  artifactMeta?: Record<string, unknown> | null;
  params?: Record<string, unknown> | null;
}) {
  const localId = `hydrate-${input.runId}`;
  const abort = new AbortController();
  const session: LocalSession = {
    localId,
    abort,
    live: false,
    startedAt: Date.now(),
    snap: {
      ...emptyFields(),
      runId: input.runId,
      jobId: input.jobId,
      modelId: input.modelId,
      modality: input.modality,
      prompt: input.prompt,
      running: input.status === "running",
      output: input.content ?? "",
      statusMsg:
        input.status === "running"
          ? "后台生成中…"
          : input.status === "succeeded"
            ? "已完成（从历史恢复）"
            : null,
      error: input.error,
      latencyMs: input.latencyMs,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      artifactId: input.artifactId ?? null,
      artifactIds: input.artifactIds ?? null,
      artifactMeta: input.artifactMeta ?? null,
      params: input.params ?? null,
    },
  };
  sessions.set(localId, session);
  focusedLocalId = localId;
  emit();
}

export async function startActiveSingleRun(input: {
  modelId: string;
  modality: string;
  prompt: string;
  temperature?: number | null;
  maxTokens?: number | null;
  params?: Record<string, unknown>;
}): Promise<void> {
  if (runningCount() >= MAX_CONCURRENT_SINGLE_RUNS) {
    throw new Error(
      `同时最多 ${MAX_CONCURRENT_SINGLE_RUNS} 个进行中的任务，请等待或取消后再试`,
    );
  }

  pruneIdleSessions();

  const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ac = new AbortController();
  const session: LocalSession = {
    localId,
    abort: ac,
    live: true,
    startedAt: Date.now(),
    snap: {
      ...emptyFields(),
      modelId: input.modelId,
      modality: input.modality,
      prompt: input.prompt,
      running: true,
      statusMsg: "已提交…",
      params: input.params ?? null,
    },
  };
  sessions.set(localId, session);
  focusedLocalId = localId;
  emit();

  const patch = (
    p: Partial<Omit<ActiveRunSnapshot, "runningCount" | "updatedAt">>,
  ) => patchSession(localId, p);

  try {
    const res = await fetch("/api/runs/single", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modelId: input.modelId,
        prompt: input.prompt,
        temperature: input.temperature ?? null,
        maxTokens: input.maxTokens ?? null,
        params: input.params ?? {},
      }),
      signal: ac.signal,
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(data?.error ?? `请求失败（${res.status}）`);
    }
    if (!res.body) throw new Error("无响应流");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let localModality = input.modality;

    while (true) {
      if (ac.signal.aborted) {
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
        const payload = data as Record<string, unknown>;
        const cur = sessions.get(localId)?.snap;
        if (!cur) return;

        if (event === "meta") {
          localModality = String(payload.modality ?? localModality);
          patch({
            runId: String(payload.runId ?? ""),
            jobId: String(payload.jobId ?? ""),
            modality: localModality,
            statusMsg: "生成中…",
          });
        } else if (event === "token") {
          patch({
            output: cur.output + String(payload.text ?? ""),
          });
        } else if (event === "status") {
          const status = String(payload.status ?? "");
          const detail =
            payload.detail != null ? String(payload.detail) : null;
          patch({
            statusMsg: detail ? `${status}: ${detail}` : status,
          });
        } else if (event === "usage") {
          patch({
            inputTokens:
              typeof payload.promptTokens === "number"
                ? payload.promptTokens
                : cur.inputTokens,
            outputTokens:
              typeof payload.completionTokens === "number"
                ? payload.completionTokens
                : cur.outputTokens,
          });
        } else if (event === "done") {
          const rawArtifactIds = payload.artifactIds;
          const artifactIds =
            Array.isArray(rawArtifactIds) &&
            rawArtifactIds.every((v) => typeof v === "string")
              ? (rawArtifactIds as string[])
              : null;
          patch({
            running: false,
            statusMsg: "已完成",
            runId: String(payload.runId ?? cur.runId ?? ""),
            jobId: String(payload.jobId ?? cur.jobId ?? ""),
            modality: String(payload.modality ?? localModality),
            latencyMs:
              typeof payload.latencyMs === "number"
                ? payload.latencyMs
                : null,
            ttftMs:
              typeof payload.ttftMs === "number" ? payload.ttftMs : null,
            inputTokens:
              typeof payload.inputTokens === "number"
                ? payload.inputTokens
                : cur.inputTokens,
            outputTokens:
              typeof payload.outputTokens === "number"
                ? payload.outputTokens
                : cur.outputTokens,
            costUsd:
              typeof payload.costUsd === "number" ? payload.costUsd : null,
            artifactId:
              typeof payload.artifactId === "string"
                ? payload.artifactId
                : null,
            artifactIds,
            artifactMeta:
              payload.artifactMeta && typeof payload.artifactMeta === "object"
                ? (payload.artifactMeta as Record<string, unknown>)
                : null,
          });
        } else if (event === "error") {
          const cancelled = payload.cancelled === true;
          patch({
            running: false,
            error: cancelled ? null : String(payload.message ?? "运行失败"),
            statusMsg: cancelled ? "已取消" : null,
            output:
              typeof payload.partialContent === "string" &&
              payload.partialContent
                ? payload.partialContent
                : cur.output,
            latencyMs:
              typeof payload.latencyMs === "number"
                ? payload.latencyMs
                : cur.latencyMs,
            ttftMs:
              typeof payload.ttftMs === "number"
                ? payload.ttftMs
                : cur.ttftMs,
          });
        }
      });
    }

    const still = sessions.get(localId)?.snap;
    const sess = sessions.get(localId);
    if (sess) sess.live = false;
    if (still?.running) {
      if (ac.signal.aborted) {
        patch({ running: false, statusMsg: "已取消", error: null });
      } else {
        // Stream closed without done/error — server job may still be running
        // (e.g. tab refresh). Keep local running and let reconcile settle it.
        patch({
          running: true,
          statusMsg: "后台生成中…",
        });
      }
    }
  } catch (err) {
    const sess = sessions.get(localId);
    if (sess) sess.live = false;
    if (
      ac.signal.aborted ||
      (err instanceof Error && err.name === "AbortError")
    ) {
      patch({
        running: false,
        statusMsg: "已取消",
        error: null,
      });
    } else {
      // Network blip: do not clear running if we already have a runId —
      // server may still be working; reconcile will correct the flag.
      const cur = sessions.get(localId)?.snap;
      if (cur?.runId && cur.running) {
        patch({
          running: true,
          statusMsg: "后台生成中…",
        });
      } else {
        patch({
          running: false,
          error: err instanceof Error ? err.message : "运行失败",
          statusMsg: null,
        });
      }
    }
  }
}

/** Cancel a specific run by id (history inline cancel). */
export async function cancelSingleRun(runId: string): Promise<void> {
  let matched: LocalSession | null = null;
  for (const s of sessions.values()) {
    if (s.snap.runId === runId) {
      matched = s;
      break;
    }
  }
  if (matched && !matched.abort.signal.aborted) {
    matched.abort.abort();
  }
  if (matched) {
    patchSession(matched.localId, {
      running: false,
      statusMsg: "正在取消…",
    });
  }
  try {
    await fetch(`/api/runs/${encodeURIComponent(runId)}/cancel`, {
      method: "POST",
    });
  } catch {
    /* ignore network errors on cancel */
  }
  if (matched) {
    patchSession(matched.localId, {
      running: false,
      statusMsg: "已取消",
      error: null,
    });
  }
}

/** @deprecated Prefer cancelSingleRun(runId). Cancels the focused local session. */
export async function cancelActiveSingleRun(): Promise<void> {
  const focused = focusedLocalId ? sessions.get(focusedLocalId) : null;
  const runId = focused?.snap.runId;
  if (runId) {
    await cancelSingleRun(runId);
    return;
  }
  if (focused && !focused.abort.signal.aborted) {
    focused.abort.abort();
    patchSession(focused.localId, {
      running: false,
      statusMsg: "已取消",
      error: null,
    });
  }
}

type ServerRunRow = {
  run: { id: string; status: string; config: Record<string, unknown> };
  job: {
    id: string;
    status: string;
    error: string | null;
    latencyMs: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    response: Record<string, unknown> | null;
  } | null;
};

/** Align local session `running` flags with DB / provided history rows. */
export async function reconcileSessionsFromServer(
  knownRuns?: ServerRunRow[],
): Promise<void> {
  const locals = [...sessions.values()].filter((s) => s.snap.running);
  if (locals.length === 0) return;

  // Live SSE sessions get done/error from the stream — skip fetch if nothing else to sync.
  const needsSync = locals.some((s) => !s.live || !s.snap.runId);
  if (!needsSync && knownRuns == null) return;

  let runs = knownRuns;
  if (!runs) {
    const res = await fetch("/api/runs/single?limit=30");
    const data = (await res.json()) as {
      ok: boolean;
      runs?: ServerRunRow[];
    };
    if (!data.ok || !data.runs) return;
    runs = data.runs;
  }

  const byId = new Map(runs.map((r) => [r.run.id, r]));
  let changed = false;
  const now = Date.now();

  for (const session of locals) {
    if (!session.snap.runId) {
      if (now - session.startedAt > 20_000) {
        patchSession(session.localId, {
          running: false,
          error: "提交超时，未拿到任务 ID",
          statusMsg: null,
        });
        session.live = false;
        changed = true;
      }
      continue;
    }

    if (session.live) continue;

    const hit = byId.get(session.snap.runId);
    if (!hit?.job) {
      if (now - session.startedAt > 45_000) {
        patchSession(session.localId, {
          running: false,
          statusMsg: null,
          error: session.snap.error ?? "任务状态未知",
        });
        changed = true;
      }
      continue;
    }
    if (hit.job.status === "running" || hit.job.status === "queued") continue;

    const artifactId =
      hit.job.response && typeof hit.job.response.artifactId === "string"
        ? hit.job.response.artifactId
        : null;
    const rawArtifactIds =
      hit.job.response && Array.isArray(hit.job.response.artifactIds)
        ? (hit.job.response.artifactIds as string[]).filter(
            (v) => typeof v === "string",
          )
        : null;
    const cancelled =
      hit.job.status === "cancelled" || hit.run.status === "cancelled";
    const succeeded = hit.job.status === "succeeded";

    patchSession(session.localId, {
      running: false,
      statusMsg: cancelled
        ? "已取消"
        : succeeded
          ? "已完成（已从服务器同步）"
          : null,
      error: cancelled ? null : hit.job.error,
      output:
        hit.job.response && typeof hit.job.response.content === "string"
          ? hit.job.response.content
          : session.snap.output,
      latencyMs: hit.job.latencyMs,
      inputTokens: hit.job.inputTokens,
      outputTokens: hit.job.outputTokens,
      artifactId,
      artifactIds: rawArtifactIds,
      modality:
        typeof hit.run.config.modality === "string"
          ? hit.run.config.modality
          : session.snap.modality,
    });
    changed = true;
  }

  if (changed) pruneIdleSessions();
}

function hasNonLiveRunning(): boolean {
  for (const s of sessions.values()) {
    if (s.snap.running && !s.live) return true;
  }
  return false;
}

/** Recover after refresh: hydrate in-flight DB jobs; poll only disconnected sessions. */
export async function syncActiveRunFromServer(): Promise<void> {
  await reconcileSessionsFromServer();

  const focused = focusedLocalId ? sessions.get(focusedLocalId) : null;

  if (!focused?.snap.runId) {
    const res = await fetch("/api/runs/single?limit=5");
    const data = (await res.json()) as {
      ok: boolean;
      runs?: Array<{
        run: {
          id: string;
          status: string;
          config: Record<string, unknown>;
        };
        job: {
          id: string;
          modelId: string;
          status: string;
          error: string | null;
          latencyMs: number | null;
          inputTokens: number | null;
          outputTokens: number | null;
          response: Record<string, unknown> | null;
        } | null;
      }>;
    };
    if (!data.ok || !data.runs?.length) return;

    const running = data.runs.find(
      (r) => r.run.status === "running" || r.job?.status === "running",
    );
    if (running?.job && runningCount() === 0) {
      const modality =
        typeof running.run.config.modality === "string"
          ? running.run.config.modality
          : "text";
      const prompt =
        typeof running.run.config.prompt === "string"
          ? running.run.config.prompt
          : "";
      const params =
        running.run.config.params &&
        typeof running.run.config.params === "object" &&
        !Array.isArray(running.run.config.params)
          ? (running.run.config.params as Record<string, unknown>)
          : null;
      hydrateFromHistory({
        runId: running.run.id,
        jobId: running.job.id,
        modelId: running.job.modelId,
        modality,
        prompt,
        status: "running",
        error: null,
        latencyMs: null,
        inputTokens: null,
        outputTokens: null,
        params,
      });
    }
  }

  if (!hasNonLiveRunning()) return;

  let n = 0;
  while (hasNonLiveRunning() && n < 90) {
    await new Promise((r) => setTimeout(r, 3000));
    await reconcileSessionsFromServer();
    n += 1;
  }
}
