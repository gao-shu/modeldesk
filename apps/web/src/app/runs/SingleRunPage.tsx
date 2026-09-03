"use client";

import {
  buildInitialRunParams,
  buildParamsForApiFormat,
  CHAT_ATTACHMENTS_PARAM_KEY,
  fieldsForApiFormat,
  parseChatAttachmentsFromParams,
  pickRunParamsForApiFormat,
  resolveApiFormatId,
  type Modality,
} from "@modeldesk/shared";
import { modalityLabel, ModelPicker } from "@modeldesk/model-registry/react";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ArtifactDownloadButton } from "@/components/ArtifactDownloadButton";
import { AudioPlayer } from "@/components/AudioPlayer";
import { VideoPlayer } from "@/components/VideoPlayer";
import { ImagePreviewModal } from "@/components/ImagePreviewModal";
import { RequestLogModal } from "@/components/RequestLogModal";
import { HistoryPager, PAGE_SIZE } from "@/components/HistoryPager";
import { PromptPresetSelect } from "@/components/PromptPresetSelect";
import { RunParamsFields, ChatAttachmentsField } from "@/components/RunParamsFields";
import { formatCost } from "@/lib/client/sse";
import { defaultPromptForModality } from "@/lib/client/default-prompts";
import {
  formatRunParamsPreview,
  modelSnapshotFromConfig,
} from "@/lib/client/run-history-display";
import {
  clearIdleActiveDisplay,
  focusRunById,
  getActiveRun,
  getRunSnapById,
  hydrateFromHistory,
  cancelSingleRun,
  fetchActiveRuns,
  formatActiveStatusMsg,
  patchActiveArtifactMeta,
  reconcileSessionsFromServer,
  startActiveSingleRun,
  subscribeActiveRun,
  syncActiveRunFromServer,
  acquireActivePollOwner,
  MAX_CONCURRENT_SINGLE_RUNS,
  ACTIVE_POLL_INTERVAL_MS,
  nextActivePollDelayMs,
  type ActiveRunSnapshot,
  type ActiveRunSummary,
} from "@/lib/client/run-session";
import {
  fetchModelsCached,
  peekCachedModels,
  subscribeModelsCache,
} from "@/lib/client/models-cache";

type ModelPublic = {
  id: string;
  name: string;
  modality: string;
  capability: string;
  provider: string;
  modelId: string;
  baseUrl?: string | null;
  hasApiKey: boolean;
  defaults: Record<string, unknown>;
};

type HistoryItem = {
  run: {
    id: string;
    status: string;
    config: Record<string, unknown>;
    createdAt: string;
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
};

const STORAGE_KEY = "modeldesk.activeSingleRun";
/** Legacy sessionStorage key (pre-rename); keep reading so old tabs don't lose state. */
const LEGACY_STORAGE_KEY = "model-select.activeSingleRun";

function readPersistedRunRaw(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function clearPersistedRun(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function artifactUrl(id: string): string {
  return `/api/artifacts/${id}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const mb = bytes / (1024 * 1024);
  // Prefer MB for media metrics (user-facing memory size).
  if (mb >= 0.01) {
    const digits = mb >= 10 ? 1 : 2;
    return `${mb.toFixed(digits)} MB`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function MediaOutput({
  modality,
  output,
  artifactId,
  artifactIds,
  onImageClick,
}: {
  modality: string;
  output: string;
  artifactId: string | null;
  artifactIds?: string[] | null;
  onImageClick?: (url: string) => void;
}) {
  if (artifactId && modality === "image") {
    const allIds =
      artifactIds && artifactIds.length > 1 ? artifactIds : [artifactId];
    if (allIds.length === 1) {
      return (
        // Absolute fill so portrait images can't grow the panel via max-height %.
        <div className="relative h-full min-h-0 w-full overflow-hidden bg-zinc-50/80">
          <button
            type="button"
            onClick={() => onImageClick?.(artifactUrl(artifactId))}
            className="absolute inset-0 flex cursor-zoom-in items-center justify-center p-2"
          >
            <img
              src={artifactUrl(artifactId)}
              alt="生成内容"
              className="max-h-full max-w-full rounded-md object-contain"
            />
          </button>
        </div>
      );
    }
    return (
      <div className="grid h-full min-h-0 w-full grid-cols-2 auto-rows-[minmax(0,1fr)] gap-2 overflow-hidden bg-zinc-50/80 p-1.5">
        {allIds.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onImageClick?.(artifactUrl(id))}
            className="relative h-full min-h-0 cursor-zoom-in overflow-hidden"
          >
            <img
              src={artifactUrl(id)}
              alt="生成内容"
              className="absolute inset-0 m-auto max-h-full max-w-full rounded-md object-contain"
            />
          </button>
        ))}
      </div>
    );
  }
  if (artifactId && (modality === "audio" || modality === "music")) {
    return (
      <div className="flex h-full w-full items-center justify-center px-4">
        <AudioPlayer
          src={artifactUrl(artifactId)}
          preload="metadata"
          className="w-full max-w-md"
          badge={modality === "music" ? "曲" : "音"}
        />
      </div>
    );
  }
  if (artifactId && modality === "video") {
    return (
      <VideoPlayer
        src={artifactUrl(artifactId)}
        wrapperClassName="flex h-full min-h-0 w-full flex-col gap-2 overflow-hidden bg-zinc-50/80 p-2"
        className="rounded-md object-contain"
      />
    );
  }
  return (
    <div className="h-full w-full overflow-auto rounded-md border border-zinc-100 bg-zinc-50 p-3">
      {output ? (
        <pre className="whitespace-pre-wrap break-words font-mono text-xs text-zinc-800">
          {output}
        </pre>
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-zinc-400">
          响应将显示在此处。
        </div>
      )}
    </div>
  );
}

function formatLatency(ms: number | null | undefined): string | null {
  if (ms == null) return null;
  if (ms >= 10_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function metricItemsForRun(input: {
  modality: string;
  latencyMs: number | null;
  ttftMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  artifactMeta: Record<string, unknown> | null;
  params?: Record<string, unknown> | null;
}): { label: string; value: string }[] {
  const meta = input.artifactMeta;
  const fileSize =
    meta && typeof meta.fileSize === "number" ? meta.fileSize : null;
  const dimensions =
    meta && typeof meta.dimensions === "string"
      ? meta.dimensions
      : input.params && typeof input.params.size === "string"
        ? String(input.params.size)
        : null;
  const ratio =
    input.params && typeof input.params.ratio === "string"
      ? String(input.params.ratio)
      : null;
  const quality =
    input.params && typeof input.params.quality === "string"
      ? String(input.params.quality)
      : null;
  const nRaw = input.params?.n;
  const n =
    typeof nRaw === "number"
      ? nRaw
      : typeof nRaw === "string" && nRaw
        ? Number(nRaw)
        : null;

  const items: { label: string; value: string }[] = [];
  const latency = formatLatency(input.latencyMs);
  if (latency) items.push({ label: "耗时", value: latency });
  if (input.ttftMs != null) {
    items.push({ label: "首字耗时", value: formatLatency(input.ttftMs)! });
  }

  // Always surface token metrics when present (all modalities).
  if (input.inputTokens != null) {
    items.push({ label: "写入", value: `${input.inputTokens} 令牌` });
  }
  if (input.outputTokens != null) {
    items.push({ label: "写出", value: `${input.outputTokens} 令牌` });
  }
  if (input.inputTokens != null && input.outputTokens != null) {
    items.push({
      label: "合计",
      value: `${input.inputTokens + input.outputTokens} 令牌`,
    });
  }

  if (input.modality === "image") {
    if (dimensions) items.push({ label: "尺寸", value: dimensions });
    if (ratio) items.push({ label: "比例", value: ratio });
    if (quality) items.push({ label: "质量", value: quality });
    if (n != null && !Number.isNaN(n) && n > 1) {
      items.push({ label: "张数", value: String(n) });
    }
    if (fileSize != null) items.push({ label: "大小", value: formatFileSize(fileSize) });
    const cost = formatCost(input.costUsd);
    if (cost !== "—") items.push({ label: "费用", value: cost });
    return items;
  }

  const cost = formatCost(input.costUsd);
  if (cost !== "—") items.push({ label: "费用", value: cost });
  if (fileSize != null) items.push({ label: "大小", value: formatFileSize(fileSize) });
  return items;
}

function persistSnapshot(snap: ActiveRunSnapshot) {
  try {
    // Only keep in-flight runs across hard refresh; finished results stay blank on re-entry.
    if (snap.running && snap.runId) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
      sessionStorage.removeItem(LEGACY_STORAGE_KEY);
    } else {
      clearPersistedRun();
    }
  } catch {
    /* ignore */
  }
}

export function SingleRunPage({ modality }: { modality: Modality }) {
  const modalityFilter = modality;
  const [allModels, setAllModels] = useState<ModelPublic[]>(
    () => (peekCachedModels() as ModelPublic[] | null) ?? [],
  );
  const [modelId, setModelId] = useState("");
  const [prompt, setPrompt] = useState(() => defaultPromptForModality(modality));
  const [runParams, setRunParams] = useState<Record<string, string>>(() =>
    buildInitialRunParams(modality),
  );
  const [active, setActive] = useState<ActiveRunSnapshot>(() => {
    // Soft-nav back onto this page: don't keep a finished run selected.
    // silent — emit() during useState would setState on other mounted pages mid-render.
    clearIdleActiveDisplay({ silent: true });
    return getActiveRun();
  });
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [bootError, setBootError] = useState<string | null>(null);
  const [objectStorageReady, setObjectStorageReady] = useState<boolean | null>(
    null,
  );
  const [promptModality, setPromptModality] = useState<string>(modality);
  /** When restoring a history row, skip the selected-model effect that resets prompt/params. */
  const skipFormatResetRef = useRef(false);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [requestLog, setRequestLog] = useState<{ url: string; body: Record<string, unknown> } | null>(null);
  const [viewedRun, setViewedRun] = useState<{
    runId: string;
    output: string;
    artifactId: string | null;
    artifactIds: string[] | null;
    error: string | null;
    latencyMs: number | null;
    ttftMs: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    costUsd: number | null;
    modality: string;
    statusMsg: string | null;
    /** 查看的是进行中任务（非已完成历史） */
    inProgress: boolean;
    artifactMeta: Record<string, unknown> | null;
    params: Record<string, unknown> | null;
  } | null>(null);

  const models = useMemo(() => {
    const real = allModels.filter(
      (m) =>
        m.provider !== "mock" && !(m.baseUrl ?? "").startsWith("mock://"),
    );
    return modalityFilter
      ? real.filter((m) => m.modality === modalityFilter)
      : real;
  }, [allModels, modalityFilter]);

  const selected = useMemo(
    () => allModels.find((m) => m.id === modelId) ?? null,
    [allModels, modelId],
  );

  const liveActive =
    active.modality === modalityFilter &&
    (!modelId || !active.modelId || active.modelId === modelId)
      ? active
      : null;
  const running = Boolean(liveActive?.running);
  const runningCount = active.runningCount ?? 0;
  const atConcurrencyLimit = runningCount >= MAX_CONCURRENT_SINGLE_RUNS;
  const activeModality = modalityFilter;
  const formModality = selected?.modality || modalityFilter;

  const refreshHistory = useCallback(async (page: number) => {
    const offset = (page - 1) * PAGE_SIZE;
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset),
      modality: modalityFilter,
    });
    if (statusFilter) params.set("status", statusFilter);
    const res = await fetch(`/api/runs/single?${params}`);
    const data = (await res.json()) as {
      ok: boolean;
      runs?: HistoryItem[];
      total?: number;
    };
    if (data.ok && data.runs) {
      setHistory(data.runs);
      setHistoryTotal(data.total ?? data.runs.length);
      // Terminal rows from this page can settle non-live sessions.
      void reconcileSessionsFromServer(data.runs);
    }
  }, [statusFilter, modalityFilter]);

  const patchHistoryFromActive = useCallback((active: ActiveRunSummary[]) => {
    const byId = new Map(active.map((r) => [r.runId, r]));
    setHistory((prev) => {
      let changed = false;
      const next = prev.map((item) => {
        const hit = byId.get(item.run.id);
        if (!hit || !item.job) return item;
        const prevProgress =
          item.job.response &&
          item.job.response._progress &&
          typeof item.job.response._progress === "object" &&
          !Array.isArray(item.job.response._progress)
            ? (item.job.response._progress as Record<string, unknown>)
            : null;
        const sameStatus =
          item.job.status === hit.status && item.run.status === hit.runStatus;
        const sameDetail =
          String(prevProgress?.detail ?? "") ===
            String(hit.progress?.detail ?? "") &&
          String(prevProgress?.status ?? "") ===
            String(hit.progress?.status ?? "");
        if (sameStatus && sameDetail) return item;
        changed = true;
        return {
          ...item,
          run: { ...item.run, status: hit.runStatus },
          job: {
            ...item.job,
            status: hit.status,
            error: hit.error,
            response: {
              ...(item.job.response ?? {}),
              _progress: hit.progress
                ? {
                    status: hit.progress.status,
                    detail: hit.progress.detail,
                    at: hit.progress.at,
                  }
                : null,
            },
          },
        };
      });
      return changed ? next : prev;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/upload", { cache: "no-store" });
        const data = (await res.json()) as {
          configured?: boolean;
          tosConfigured?: boolean;
        };
        if (!cancelled) {
          setObjectStorageReady(
            Boolean(data.configured ?? data.tosConfigured),
          );
        }
      } catch {
        if (!cancelled) setObjectStorageReady(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Subscribe to module-level run session (survives soft navigation).
  useEffect(() => {
    let prevRunning = getActiveRun().running;
    let prevRunId = getActiveRun().runId;
    let prevCount = getActiveRun().runningCount ?? 0;
    return subscribeActiveRun((snap) => {
      setActive(snap);
      persistSnapshot(snap);

      if (snap.modality && snap.modality !== modalityFilter) {
        prevRunning = snap.running;
        prevRunId = snap.runId;
        prevCount = snap.runningCount ?? 0;
        return;
      }

      const runIdAppeared =
        Boolean(snap.runId) && snap.runId !== prevRunId;
      const ended = prevRunning && !snap.running;
      const countChanged = (snap.runningCount ?? 0) !== prevCount;
      // Refresh when the server assigns a runId (shows「进行中」) or when it finishes.
      if (runIdAppeared || ended || countChanged) {
        setHistoryPage(1);
        void refreshHistory(1);
      }
      prevRunning = snap.running;
      prevRunId = snap.runId;
      prevCount = snap.runningCount ?? 0;
    });
  }, [refreshHistory, modalityFilter]);

  useEffect(() => {
    void refreshHistory(historyPage);
  }, [historyPage, refreshHistory, statusFilter]);

  // Status poll via lightweight /api/runs/active — not the full history list.
  // Owns the tab poll while mounted so background ensureBackgroundActivePoll does not double-hit.
  const historyRef = useRef(history);
  historyRef.current = history;
  const needsActivePoll =
    history.some(
      (item) =>
        item.job?.status === "running" ||
        item.job?.status === "queued" ||
        item.run.status === "running",
    ) ||
    runningCount > 0 ||
    Boolean(liveActive?.running);

  useEffect(() => {
    if (!needsActivePoll) return;

    let cancelled = false;
    let finishing = false;
    let delayMs = ACTIVE_POLL_INTERVAL_MS;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const releaseOwner = acquireActivePollOwner();

    const tick = async () => {
      if (cancelled || finishing) return;
      try {
        const active = await fetchActiveRuns();
        if (cancelled) return;
        patchHistoryFromActive(active);
        await reconcileSessionsFromServer(undefined, active);
        if (cancelled) return;

        const activeIds = new Set(active.map((r) => r.runId));
        const finishedOnPage = historyRef.current.some((item) => {
          const wasInFlight =
            item.job?.status === "running" ||
            item.job?.status === "queued" ||
            item.run.status === "running";
          return wasInFlight && !activeIds.has(item.run.id);
        });
        if (finishedOnPage) {
          finishing = true;
          await refreshHistory(historyPage);
          finishing = false;
        }
      } catch {
        /* ignore transient poll errors */
      }
    };

    const scheduleNext = () => {
      if (cancelled) return;
      timer = setTimeout(() => {
        void (async () => {
          await tick();
          delayMs = nextActivePollDelayMs(delayMs);
          scheduleNext();
        })();
      }, delayMs);
    };

    void (async () => {
      await tick();
      scheduleNext();
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      releaseOwner();
    };
  }, [
    needsActivePoll,
    historyPage,
    patchHistoryFromActive,
    refreshHistory,
  ]);

  // 查看进行中任务时，随 active 轮询刷新进度文案 / 完成后切到结果
  useEffect(() => {
    if (!viewedRun?.inProgress) return;
    const item = history.find((h) => h.run.id === viewedRun.runId);
    if (!item) return;
    const st = item.job?.status ?? item.run.status;
    if (st === "running" || st === "queued") {
      const resp = item.job?.response ?? null;
      const rawProgress =
        resp &&
        resp._progress &&
        typeof resp._progress === "object" &&
        !Array.isArray(resp._progress)
          ? (resp._progress as Record<string, unknown>)
          : null;
      const progress = rawProgress
        ? {
            status:
              typeof rawProgress.status === "string" ? rawProgress.status : null,
            detail:
              rawProgress.detail != null ? String(rawProgress.detail) : null,
            at: typeof rawProgress.at === "string" ? rawProgress.at : null,
          }
        : null;
      const liveMsg = getRunSnapById(viewedRun.runId)?.statusMsg;
      const nextMsg =
        liveMsg ||
        formatActiveStatusMsg(st, progress) ||
        (st === "queued" ? "排队中…" : "进行中…");
      if (nextMsg !== viewedRun.statusMsg) {
        setViewedRun((prev) =>
          prev && prev.runId === viewedRun.runId
            ? { ...prev, statusMsg: nextMsg }
            : prev,
        );
      }
      return;
    }
    // 已结束：刷新为最终历史视图
    viewHistoryItem(item);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only sync from history ticks
  }, [history, viewedRun?.runId, viewedRun?.inProgress]);

  // Load artifact fileSize / dimensions whenever the displayed artifact changes.
  useEffect(() => {
    const id = viewedRun ? viewedRun.artifactId : liveActive?.artifactId ?? null;
    const existing = viewedRun
      ? viewedRun.artifactMeta
      : liveActive?.artifactMeta ?? null;
    if (!id) return;
    if (existing && typeof existing.fileSize === "number") return;
    let cancelled = false;
    void fetch(`/api/artifacts/${encodeURIComponent(id)}/info`)
      .then((r) => r.json())
      .then((d: { ok?: boolean; meta?: Record<string, unknown> }) => {
        if (cancelled || !d.ok || !d.meta) return;
        if (viewedRun && viewedRun.artifactId === id) {
          setViewedRun((prev) =>
            prev && prev.artifactId === id
              ? {
                  ...prev,
                  artifactMeta: { ...(prev.artifactMeta ?? {}), ...d.meta },
                }
              : prev,
          );
        } else if (!viewedRun && liveActive?.artifactId === id) {
          patchActiveArtifactMeta(id, {
            ...(getActiveRun().artifactMeta ?? {}),
            ...d.meta,
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [
    viewedRun?.artifactId,
    viewedRun?.artifactMeta?.fileSize,
    liveActive?.artifactId,
    liveActive?.artifactMeta?.fileSize,
    Boolean(viewedRun),
  ]);

  // Keep model list fresh while this page stays mounted (ClientPageHost keep-alive).
  useEffect(() => {
    const reload = () => {
      void fetchModelsCached({ force: true })
        .then((models) => setAllModels(models as ModelPublic[]))
        .catch(() => {});
    };
    const unsub = subscribeModelsCache(reload);
    const onPageActive = (ev: Event) => {
      const path = (ev as CustomEvent<{ path?: string }>).detail?.path;
      if (path === `/runs/${modalityFilter}`) reload();
    };
    window.addEventListener("modeldesk:page-active", onPageActive);
    return () => {
      unsub();
      window.removeEventListener("modeldesk:page-active", onPageActive);
    };
  }, [modalityFilter]);

  // On mount: blank form/output unless a run is still in flight; sync running jobs from server.
  useEffect(() => {
    void (async () => {
      clearIdleActiveDisplay();
      setViewedRun(null);

      let models: ModelPublic[];
      try {
        models = (await fetchModelsCached()) as ModelPublic[];
      } catch (e) {
        setBootError(e instanceof Error ? e.message : "加载模型失败");
        return;
      }
      setAllModels(models);

      const realModels = models.filter(
        (m) =>
          m.provider !== "mock" &&
          !(m.baseUrl ?? "").startsWith("mock://") &&
          m.modality === modalityFilter,
      );
      const current = getActiveRun();
      // Only restore form fields when a run is still going; otherwise leave blanks/defaults.
      if (current.running && current.modelId && current.modality === modalityFilter) {
        setModelId(current.modelId);
        if (current.prompt) {
          setPrompt(current.prompt);
          setPromptModality(current.modality || modalityFilter);
        }
      } else if (realModels[0]) {
        setModelId(realModels[0].id);
      }

      // Hard refresh: only recover an in-flight run from sessionStorage.
      if (!current.running && !current.runId) {
        try {
          const raw = readPersistedRunRaw();
          if (raw) {
            const saved = JSON.parse(raw) as ActiveRunSnapshot;
            if (saved.runId && saved.running) {
              hydrateFromHistory({
                runId: saved.runId,
                jobId: saved.jobId ?? "",
                modelId: saved.modelId,
                modality: saved.modality,
                prompt: saved.prompt,
                status: "running",
                error: saved.error,
                latencyMs: saved.latencyMs,
                inputTokens: saved.inputTokens,
                outputTokens: saved.outputTokens,
                content: saved.output,
                artifactId: saved.artifactId,
              });
              if (saved.modelId) setModelId(saved.modelId);
              if (saved.prompt) {
                setPrompt(saved.prompt);
                setPromptModality(saved.modality || "text");
              }
            } else {
              clearPersistedRun();
            }
          }
        } catch {
          /* ignore */
        }
      }

      await syncActiveRunFromServer();
      const afterSync = getActiveRun();
      if (
        afterSync.running &&
        afterSync.modelId &&
        afterSync.modality === modalityFilter
      ) {
        setModelId(afterSync.modelId);
        if (afterSync.prompt) {
          setPrompt(afterSync.prompt);
          setPromptModality(afterSync.modality || modalityFilter);
        }
      }
    })();
  }, [modalityFilter]);

  useEffect(() => {
    if (!selected || running) return;
    if (skipFormatResetRef.current) {
      skipFormatResetRef.current = false;
      return;
    }
    const formatId = resolveApiFormatId({
      modality: selected.modality,
      defaults: selected.defaults,
      provider: selected.provider,
      baseUrl: selected.baseUrl,
      modelId: selected.modelId,
    });
    const next =
      formatId &&
      (selected.modality === "image" ||
        selected.modality === "video" ||
        selected.modality === "text" ||
        selected.modality === "audio" ||
        selected.modality === "music")
        ? buildParamsForApiFormat(formatId, selected.defaults)
        : buildInitialRunParams(selected.modality, selected.defaults);
    setRunParams(next);
    const nextModality = selected.modality;
    if (nextModality !== promptModality) {
      setPrompt(defaultPromptForModality(nextModality));
      setPromptModality(nextModality);
    }
  }, [selected?.id, selected?.modality]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedApiFormat = selected
    ? resolveApiFormatId({
        modality: selected.modality,
        defaults: selected.defaults,
        provider: selected.provider,
        baseUrl: selected.baseUrl,
        modelId: selected.modelId,
      })
    : null;

  const hasChatAttachments = useMemo(() => {
    if ((selected?.modality ?? modality) !== "text") return false;
    return (
      parseChatAttachmentsFromParams({
        [CHAT_ATTACHMENTS_PARAM_KEY]: runParams.chat_attachments ?? "",
      }).length > 0
    );
  }, [selected?.modality, modality, runParams.chat_attachments]);

  const showVlmAttachments = useMemo(() => {
    if ((selected?.modality ?? modality) !== "text" || !selectedApiFormat) {
      return false;
    }
    const mid = (selected?.modelId ?? selected?.name ?? "").toLowerCase();
    const formatFields = fieldsForApiFormat(selectedApiFormat);
    return formatFields.some(
      (f) =>
        f.key === CHAT_ATTACHMENTS_PARAM_KEY &&
        f.type === "attachment_list" &&
        (!f.models?.length ||
          f.models.some((token) => mid.includes(token.toLowerCase()))),
    );
  }, [
    selected?.modality,
    selected?.modelId,
    selected?.name,
    modality,
    selectedApiFormat,
  ]);

  const canStartRun =
    Boolean(modelId) &&
    !atConcurrencyLimit &&
    (Boolean(prompt.trim()) || hasChatAttachments);

  useEffect(() => {
    if (models.length === 0) {
      setModelId("");
      return;
    }
    if (!models.some((m) => m.id === modelId)) {
      setModelId(models[0].id);
    }
  }, [models, modelId]);

  async function startRun() {
    if (!canStartRun) return;
    const modality = selected?.modality ?? "text";
    const params = selectedApiFormat
      ? pickRunParamsForApiFormat(selectedApiFormat, runParams)
      : { ...runParams };
    setViewedRun(null);
    setBootError(null);

    try {
      // Do not await the full SSE — history refreshes via subscribe on runId / finish.
      void startActiveSingleRun({
        modelId,
        modality,
        prompt: prompt.trim(),
        params,
      }).catch((err) => {
        setBootError(err instanceof Error ? err.message : "运行失败");
      });
      setHistoryPage(1);
      // Best-effort early refresh; meta event will refresh again once runId exists.
      void refreshHistory(1);
    } catch (err) {
      setBootError(err instanceof Error ? err.message : "运行失败");
    }
  }

  async function cancelHistoryRun(runId: string) {
    try {
      await cancelSingleRun(runId);
    } catch (err) {
      setBootError(err instanceof Error ? err.message : "取消失败");
    }
    setHistoryPage(1);
    await refreshHistory(1);
  }

  function viewHistoryItem(item: HistoryItem) {
    const cfg = item.run.config ?? {};
    const modality =
      typeof cfg.modality === "string" ? cfg.modality : "text";
    const resp = item.job?.response ?? null;
    const artifactId =
      resp && typeof resp.artifactId === "string"
        ? resp.artifactId
        : null;
    const rawArtifactIds =
      resp && Array.isArray(resp.artifactIds)
        ? (resp.artifactIds as string[]).filter(
            (v) => typeof v === "string",
          )
        : null;
    const content =
      resp && typeof resp.content === "string"
        ? resp.content
        : "";
    const st = item.job?.status ?? item.run.status;
    const inProgress = st === "running" || st === "queued";
    const savedParams =
      cfg.params &&
      typeof cfg.params === "object" &&
      !Array.isArray(cfg.params)
        ? (cfg.params as Record<string, unknown>)
        : null;

    // Restore form fields so the left panel shows what was used for this run.
    if (typeof cfg.prompt === "string") {
      setPrompt(cfg.prompt);
      setPromptModality(modality);
    }
    const historyModelId = item.job?.modelId?.trim() ?? "";
    if (historyModelId && allModels.some((m) => m.id === historyModelId)) {
      skipFormatResetRef.current = true;
      setModelId(historyModelId);
    }
    if (savedParams) {
      const asStrings: Record<string, string> = {};
      for (const [k, v] of Object.entries(savedParams)) {
        if (v == null) continue;
        asStrings[k] =
          typeof v === "string"
            ? v
            : typeof v === "boolean" || typeof v === "number"
              ? String(v)
              : JSON.stringify(v);
      }
      setRunParams(asStrings);
    }

    // 进行中：优先切回本页对应的实时会话，输出区显示当前进度
    if (inProgress) {
      const focused = focusRunById(item.run.id);
      if (focused) {
        setViewedRun(null);
        return;
      }
    }

    const progress =
      resp &&
      resp._progress &&
      typeof resp._progress === "object" &&
      !Array.isArray(resp._progress)
        ? (resp._progress as Record<string, unknown>)
        : null;
    const progressStatus =
      typeof progress?.status === "string" ? progress.status : null;
    const progressDetail =
      progress?.detail != null ? String(progress.detail) : null;
    const liveSnap = inProgress ? getRunSnapById(item.run.id) : null;

    const statusMsg = inProgress
      ? liveSnap?.statusMsg ||
        (progressDetail
          ? `${progressStatus ?? st}: ${progressDetail}`
          : progressStatus
            ? progressStatus
            : st === "queued"
              ? "排队中…"
              : "进行中…")
      : st === "succeeded"
        ? "历史记录"
        : st === "cancelled"
          ? "已取消 · 历史"
          : st === "failed"
            ? "失败 · 历史"
            : "历史记录";

    setViewedRun({
      runId: item.run.id,
      output: content,
      artifactId,
      artifactIds: rawArtifactIds,
      error: item.job?.error ?? null,
      latencyMs: item.job?.latencyMs ?? null,
      ttftMs: null,
      inputTokens: item.job?.inputTokens ?? null,
      outputTokens: item.job?.outputTokens ?? null,
      costUsd: null,
      modality,
      statusMsg,
      inProgress,
      params: savedParams,
      artifactMeta:
          resp && resp._artifactMeta && typeof resp._artifactMeta === "object"
            ? (resp._artifactMeta as Record<string, unknown>)
            : null,
    });
  }

  /** Prefer stored _httpLog; fall back to reconstructing from run config (e.g. older cancelled rows). */
  function resolveHttpLog(
    item: HistoryItem,
  ): { url: string; body: Record<string, unknown> } | null {
    const resp = item.job?.response;
    if (
      resp &&
      typeof resp === "object" &&
      resp._httpLog &&
      typeof resp._httpLog === "object" &&
      !Array.isArray(resp._httpLog)
    ) {
      const log = resp._httpLog as Record<string, unknown>;
      if (typeof log.url === "string" && log.body && typeof log.body === "object") {
        return {
          url: log.url,
          body: log.body as Record<string, unknown>,
        };
      }
    }

    const cfg = item.run.config ?? {};
    const modality =
      typeof cfg.modality === "string" ? cfg.modality : null;
    if (modality !== "image" && modality !== "video") return null;

    const model =
      cfg.model && typeof cfg.model === "object" && !Array.isArray(cfg.model)
        ? (cfg.model as Record<string, unknown>)
        : null;
    const baseUrl = String(model?.baseUrl ?? "").replace(/\/+$/, "");
    const modelId =
      typeof model?.modelId === "string" ? model.modelId : "";
    const prompt = typeof cfg.prompt === "string" ? cfg.prompt : "";
    const params =
      cfg.params && typeof cfg.params === "object" && !Array.isArray(cfg.params)
        ? (cfg.params as Record<string, unknown>)
        : {};

    if (modality === "video") {
      const apiFormat =
        model && typeof model.defaults === "object" && model.defaults
          ? String(
              (model.defaults as Record<string, unknown>).api_format ?? "",
            )
          : "";
      const seedanceRelay = apiFormat === "video.seedance-relay";
      const minimaxH3Relay = apiFormat === "video.minimax-h3-relay";
      const body: Record<string, unknown> = {
        model: modelId,
        prompt,
        ...(seedanceRelay ? { _multipart: true } : {}),
      };
      if (typeof params.resolution === "string" && params.resolution) {
        body.resolution = params.resolution;
      }
      if (typeof params.aspect_ratio === "string" && params.aspect_ratio) {
        body.aspect_ratio = params.aspect_ratio;
        if (minimaxH3Relay) body.ratio = params.aspect_ratio;
      }
      if (params.duration_sec != null && params.duration_sec !== "") {
        body.duration_sec = params.duration_sec;
        if (seedanceRelay || minimaxH3Relay) {
          body.seconds = String(params.duration_sec);
        }
      }
      if (params.duration != null && params.duration !== "") {
        body.duration = params.duration;
      }
      if (params.with_audio != null) {
        body.with_audio = params.with_audio;
        if (seedanceRelay) {
          body.generate_audio =
            params.with_audio === true || params.with_audio === "true"
              ? "true"
              : "false";
        }
      }
      const refs: string[] = [];
      if (typeof params.reference_image === "string" && params.reference_image) {
        refs.push(params.reference_image);
      }
      if (
        typeof params.reference_image_end === "string" &&
        params.reference_image_end
      ) {
        refs.push(params.reference_image_end);
      }
      const listRaw = params.reference_images;
      if (typeof listRaw === "string" && listRaw.trim()) {
        const raw = listRaw.trim();
        if (raw.startsWith("[")) {
          try {
            const parsed = JSON.parse(raw) as unknown;
            if (Array.isArray(parsed)) {
              for (const x of parsed) {
                if (typeof x === "string" && x.trim()) refs.push(x.trim());
              }
            }
          } catch {
            refs.push(raw);
          }
        } else {
          refs.push(raw);
        }
      } else if (Array.isArray(listRaw)) {
        for (const x of listRaw) {
          if (typeof x === "string" && x.trim()) refs.push(x.trim());
        }
      }
      if (refs.length > 0) {
        if (minimaxH3Relay) {
          // 实际请求是 JSON content[]，不是 Seedance 的 multipart input_reference
          const multi =
            Array.isArray(params.reference_images) ||
            (typeof params.reference_images === "string" &&
              params.reference_images.trim().startsWith("["));
          body.content = refs.map((url, i) => ({
            type: "image_url",
            image_url: { url },
            role: multi
              ? "reference_image"
              : i === 0 && refs.length === 1
                ? "first_frame"
                : i === 0
                  ? "first_frame"
                  : "last_frame",
          }));
        } else {
          body.input_reference = refs.length === 1 ? refs[0] : refs;
          if (seedanceRelay) body.confirm_no_human_reference = "true";
        }
      }
      if (minimaxH3Relay) {
        const aspect =
          typeof params.aspect_ratio === "string" && params.aspect_ratio
            ? params.aspect_ratio
            : "16:9";
        const sizeMap: Record<string, string> = {
          "16:9": "1280x720",
          "9:16": "720x1280",
          "4:3": "1024x768",
          "3:4": "768x1024",
          "1:1": "768x768",
          "21:9": "1344x576",
        };
        body.size = sizeMap[aspect] ?? "1280x720";
        if (!body.resolution) body.resolution = "768p";
      }
      return {
        url:
          seedanceRelay || minimaxH3Relay
            ? `${baseUrl || "(unknown)"}/videos`
            : `${baseUrl || "(unknown)"}/videos/generations`,
        body,
      };
    }

    const n =
      typeof params.n === "number"
        ? params.n
        : typeof params.n === "string" && params.n
          ? Number(params.n) || 1
          : 1;
    const body: Record<string, unknown> = {
      model: modelId,
      prompt,
      n,
    };
    if (typeof params.size === "string" && params.size) body.size = params.size;
    if (typeof params.ratio === "string" && params.ratio) {
      body.ratio = params.ratio;
    }
    if (typeof params.quality === "string" && params.quality) {
      body.quality = params.quality;
    }
    return {
      url: `${baseUrl || "(unknown)"}/images/generations`,
      body,
    };
  }

  const compactLeft =
    modality === "image" ||
    modality === "video" ||
    modality === "audio" ||
    modality === "music";
  /**
   * Keep left form + right output the same height across modalities
   * so image/text/video panels feel consistent.
   */
  const runPanelHeightClass =
    "h-[min(34rem,calc(100dvh-9rem))] max-h-[min(34rem,calc(100dvh-9rem))]";
  /** Shared default prompt box height (was 320 for text / 180 otherwise). */
  const [promptHeight, setPromptHeight] = useState(160);
  const [paramsOpen, setParamsOpen] = useState(true);

  function startPromptResize(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const startY = e.clientY;
    const startH = promptHeight;
    const minH = 96;
    const onMove = (ev: PointerEvent) => {
      setPromptHeight(
        Math.min(480, Math.max(minH, startH + (ev.clientY - startY))),
      );
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div>
      {bootError ? (
        <p className="mb-3 text-sm text-red-600">{bootError}</p>
      ) : null}

      {models.length === 0 && allModels.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-500">
          暂无模型，请先到「模型配置」添加。
        </div>
      ) : models.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-500">
          暂无{modalityLabel(modalityFilter)}模型，请先到「模型配置」添加。
        </div>
      ) : (
        <div className="space-y-4">
          {/* 左：模型 / 提示词 / 参数 / 运行 · 右：输出 */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-stretch">
            <section
              className={`flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white ${runPanelHeightClass}`}
            >
              <div className="min-h-0 flex-1 overflow-y-auto">
                {compactLeft ? (
                  <div className="grid grid-cols-2 gap-x-2 border-b border-zinc-100 px-3.5 py-2">
                    <label className="md-field gap-1">
                      <span className="md-label">模型</span>
                      <ModelPicker
                        models={models.map((m) => ({
                          id: m.id,
                          name: `${m.name}${!m.hasApiKey ? "（无密钥）" : ""}`,
                          modality: m.modality,
                          capability: m.capability,
                          modelId: m.modelId,
                          provider: m.provider,
                        }))}
                        value={modelId}
                        onChange={setModelId}
                        disabled={models.length === 0}
                        emptyLabel={`暂无模型（${modalityLabel(modalityFilter)}）`}
                        className="md-control md-control-sm"
                      />
                    </label>
                    <label className="md-field gap-1">
                      <span className="md-label">提示词</span>
                      <PromptPresetSelect
                        compact
                        modality={formModality}
                        prompt={prompt}
                        onSelect={(preset) => {
                          setPrompt(preset.text);
                          if (preset.params) {
                            setRunParams((prev) => ({
                              ...prev,
                              ...preset.params,
                            }));
                          }
                        }}
                      />
                    </label>
                  </div>
                ) : (
                  <>
                    <div className="border-b border-zinc-100 px-3.5 py-3">
                      <label className="md-field">
                        <span className="md-label">模型</span>
                        <ModelPicker
                          models={models.map((m) => ({
                            id: m.id,
                            name: `${m.name}${!m.hasApiKey ? "（无密钥）" : ""}`,
                            modality: m.modality,
                            capability: m.capability,
                            modelId: m.modelId,
                            provider: m.provider,
                          }))}
                          value={modelId}
                          onChange={setModelId}
                          disabled={models.length === 0}
                          emptyLabel={`暂无模型（${modalityLabel(modalityFilter)}）`}
                        />
                      </label>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-3.5 py-2.5">
                      <h2 className="text-sm font-semibold text-zinc-900">
                        提示词
                      </h2>
                      <div className="min-w-[10rem] max-w-xs flex-1">
                        <PromptPresetSelect
                          compact
                          modality={formModality}
                          prompt={prompt}
                          onSelect={(preset) => {
                            setPrompt(preset.text);
                            if (preset.params) {
                              setRunParams((prev) => ({
                                ...prev,
                                ...preset.params,
                              }));
                            }
                          }}
                        />
                      </div>
                    </div>
                  </>
                )}
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  style={{ height: promptHeight }}
                  className={`w-full resize-none border-0 bg-white px-3.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 ${compactLeft ? "py-2.5 leading-snug" : "py-3 leading-relaxed"}`}
                  placeholder={
                    showVlmAttachments
                      ? "输入提示词，或仅添加附件后运行…"
                      : "输入提示词…"
                  }
                />
                <div
                  role="separator"
                  aria-orientation="horizontal"
                  aria-label="拖拽调整提示词高度"
                  title="拖拽调整高度"
                  onPointerDown={startPromptResize}
                  className={`flex cursor-row-resize items-center justify-center border-t border-zinc-100 bg-zinc-50 hover:bg-zinc-100 ${compactLeft ? "h-2" : "h-3"}`}
                >
                  <span className="h-0.5 w-10 rounded-full bg-zinc-300" />
                </div>
                {showVlmAttachments ? (
                  <div
                    className={`border-t border-zinc-100 px-3.5 ${compactLeft ? "py-2" : "py-3"}`}
                  >
                    <p
                      className={`mb-1.5 font-medium text-zinc-700 ${compactLeft ? "text-[11px]" : "text-xs"}`}
                    >
                      对话附件
                    </p>
                    <ChatAttachmentsField
                      value={runParams.chat_attachments ?? ""}
                      onChange={(next) =>
                        setRunParams((prev) => ({
                          ...prev,
                          chat_attachments: next,
                        }))
                      }
                      objectStorageReady={objectStorageReady}
                      compact={compactLeft}
                      inputClass="md-control md-control-sm"
                      max={9}
                      hint="图片可本地上传或 base64；视频/文件需对象存储公网 URL"
                    />
                  </div>
                ) : null}
                <div className="border-t border-zinc-100">
                  <button
                    type="button"
                    onClick={() => setParamsOpen((o) => !o)}
                    className={`flex w-full items-center justify-between px-3.5 text-left text-sm text-zinc-700 hover:bg-zinc-50 ${compactLeft ? "py-1.5" : "py-2.5"}`}
                  >
                    <span className="font-medium">生成参数</span>
                    <span className="text-xs text-zinc-400">
                      {paramsOpen ? "收起" : "展开"}
                    </span>
                  </button>
                  {paramsOpen ? (
                    <div
                      className={`border-t border-zinc-100 px-3.5 ${compactLeft ? "pb-2.5 pt-1.5" : "pb-3.5 pt-2"}`}
                    >
                      <RunParamsFields
                        modality={formModality}
                        values={runParams}
                        apiFormat={selectedApiFormat}
                        provider={selected?.provider}
                        modelId={selected?.modelId ?? selected?.name}
                        baseUrl={selected?.baseUrl}
                        name={selected?.name}
                        objectStorageReady={objectStorageReady}
                        compact={compactLeft}
                        excludeKeys={
                          showVlmAttachments
                            ? [CHAT_ATTACHMENTS_PARAM_KEY]
                            : undefined
                        }
                        onChange={(key, value) =>
                          setRunParams((prev) => ({ ...prev, [key]: value }))
                        }
                      />
                    </div>
                  ) : null}
                </div>
              </div>

              <div
                className={`shrink-0 border-t border-zinc-100 bg-zinc-50/70 px-3.5 ${compactLeft ? "py-2" : "py-3"}`}
              >
                <button
                  type="button"
                  disabled={!canStartRun}
                  onClick={() => void startRun()}
                  className={`w-full rounded-md bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 ${compactLeft ? "py-2" : "py-2.5"}`}
                >
                  {runningCount > 0 ? "再开一个" : "开始运行"}
                </button>
                {runningCount > 0 ? (
                  <p className="mt-1.5 text-center text-[11px] text-zinc-400">
                    进行中 {runningCount}/{MAX_CONCURRENT_SINGLE_RUNS}
                    {atConcurrencyLimit ? " · 已达上限" : ""}
                  </p>
                ) : null}
              </div>
            </section>

            <section
              className={`flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white ${runPanelHeightClass}`}
            >
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-3.5 py-2.5">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-zinc-900">输出</h2>
                  {viewedRun ? (
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] ${
                        viewedRun.inProgress
                          ? "bg-amber-50 text-amber-700"
                          : "bg-blue-50 text-blue-700"
                      }`}
                    >
                      {viewedRun.inProgress
                        ? getRunSnapById(viewedRun.runId)?.statusMsg ||
                          viewedRun.statusMsg ||
                          "进行中…"
                        : (viewedRun.statusMsg ?? "历史记录")}
                    </span>
                  ) : running ? (
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700">
                      {liveActive?.statusMsg ?? "生成中…"}
                    </span>
                  ) : liveActive?.statusMsg ? (
                    <span className="text-[11px] text-zinc-500">
                      {liveActive.statusMsg}
                    </span>
                  ) : null}
                </div>
                {viewedRun ? (
                  <button
                    type="button"
                    onClick={() => setViewedRun(null)}
                    className="rounded-md border border-zinc-200 bg-white px-3.5 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
                  >
                    返回最新运行
                  </button>
                ) : null}
              </div>

              <div className="relative min-h-0 flex-1 overflow-hidden">
                {(viewedRun ? viewedRun.error : liveActive?.error) ? (
                  <p className="absolute left-2 right-2 top-2 z-10 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
                    {viewedRun ? viewedRun.error : liveActive?.error}
                  </p>
                ) : null}
                <div className="h-full min-h-0">
                  <MediaOutput
                    modality={viewedRun ? viewedRun.modality : activeModality}
                    output={
                      viewedRun ? viewedRun.output : liveActive?.output ?? ""
                    }
                    artifactId={
                      viewedRun
                        ? viewedRun.artifactId
                        : liveActive?.artifactId ?? null
                    }
                    artifactIds={
                      viewedRun
                        ? viewedRun.artifactIds
                        : liveActive?.artifactIds ?? null
                    }
                    onImageClick={setPreviewImage}
                  />
                </div>
              </div>

              {(() => {
                const modality = viewedRun ? viewedRun.modality : activeModality;
                const artifactId = viewedRun
                  ? viewedRun.artifactId
                  : liveActive?.artifactId ?? null;
                const items = metricItemsForRun({
                  modality,
                  latencyMs: viewedRun
                    ? viewedRun.latencyMs
                    : liveActive?.latencyMs ?? null,
                  ttftMs: viewedRun
                    ? viewedRun.ttftMs
                    : liveActive?.ttftMs ?? null,
                  inputTokens: viewedRun
                    ? viewedRun.inputTokens
                    : liveActive?.inputTokens ?? null,
                  outputTokens: viewedRun
                    ? viewedRun.outputTokens
                    : liveActive?.outputTokens ?? null,
                  costUsd: viewedRun
                    ? viewedRun.costUsd
                    : liveActive?.costUsd ?? null,
                  artifactMeta: viewedRun
                    ? viewedRun.artifactMeta
                    : liveActive?.artifactMeta ?? null,
                  params: viewedRun
                    ? viewedRun.params
                    : liveActive?.params ??
                      (runParams as Record<string, unknown>),
                });
                const showMediaActions =
                  Boolean(artifactId) &&
                  (modality === "image" ||
                    modality === "video" ||
                    modality === "audio" ||
                    modality === "music");
                if (items.length === 0 && !artifactId) return null;
                return (
                  <div className="mt-auto flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-zinc-100 bg-zinc-50/70 px-3.5 py-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                      {items.length === 0 ? (
                        <span className="text-zinc-400">暂无运行指标</span>
                      ) : (
                        items.map((it) => (
                          <span
                            key={it.label}
                            className="inline-flex items-center gap-1"
                          >
                            <span className="text-zinc-400">{it.label}</span>
                            <span className="font-mono text-zinc-800">
                              {it.value}
                            </span>
                          </span>
                        ))
                      )}
                    </div>
                    {artifactId ? (
                      <div className="flex shrink-0 items-center gap-2 text-[11px]">
                        {modality !== "image" ? (
                          <a
                            className="text-zinc-600 underline hover:text-zinc-900"
                            href={artifactUrl(artifactId)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            打开
                          </a>
                        ) : null}
                        {showMediaActions ? (
                          <ArtifactDownloadButton
                            artifactId={artifactId}
                            modality={modality}
                            className="text-zinc-600 underline hover:text-zinc-900 disabled:opacity-50"
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })()}
            </section>
          </div>
        </div>
      )}

      <section className="mt-5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-zinc-900">历史</h2>
          {["", "succeeded", "failed", "cancelled", "running"].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setStatusFilter(s);
                setHistoryPage(1);
              }}
              className={`rounded-md px-3.5 py-1.5 text-sm ${
                statusFilter === s
                  ? "bg-zinc-900 text-white"
                  : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {s === "" ? "全部" : s === "succeeded" ? "成功" : s === "failed" ? "失败" : s === "cancelled" ? "已取消" : s === "running" ? "进行中" : s}
            </button>
          ))}
        </div>
        {history.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-4 text-xs text-zinc-500">
            暂无记录
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-[11px] uppercase text-zinc-500">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">时间</th>
                    <th className="px-3 py-1.5 font-medium">类型</th>
                    <th className="px-3 py-1.5 font-medium">模型</th>
                    <th className="px-3 py-1.5 font-medium">参数</th>
                    <th className="px-3 py-1.5 font-medium">状态</th>
                    <th className="px-3 py-1.5 font-medium">延迟</th>
                    <th className="px-3 py-1.5 font-medium">提示词</th>
                    <th className="px-3 py-1.5 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item) => {
                    const cfg = item.run.config ?? {};
                    const snap = modelSnapshotFromConfig(cfg);
                    const live = allModels.find(
                      (m) => m.id === item.job?.modelId,
                    );
                    const modality = snap.modality !== "—"
                      ? snap.modality
                      : live?.modality ?? "—";
                    const modelName =
                      snap.name !== "—"
                        ? snap.name
                        : live?.name ?? snap.modelId;
                    const snapModel =
                      cfg.model &&
                      typeof cfg.model === "object" &&
                      !Array.isArray(cfg.model)
                        ? (cfg.model as Record<string, unknown>)
                        : null;
                    const formatForPreview = resolveApiFormatId({
                      modality:
                        modality === "—"
                          ? live?.modality ?? "video"
                          : modality,
                      defaults:
                        live?.defaults ??
                        (snapModel?.defaults &&
                        typeof snapModel.defaults === "object" &&
                        !Array.isArray(snapModel.defaults)
                          ? (snapModel.defaults as Record<string, unknown>)
                          : null),
                      provider:
                        live?.provider ??
                        (typeof snapModel?.provider === "string"
                          ? snapModel.provider
                          : null),
                      baseUrl:
                        live?.baseUrl ??
                        (typeof snapModel?.baseUrl === "string"
                          ? snapModel.baseUrl
                          : null),
                      modelId:
                        live?.modelId ??
                        (typeof snapModel?.modelId === "string"
                          ? snapModel.modelId
                          : null),
                    });
                    const paramsPreview = formatRunParamsPreview(
                      modality === "—" ? undefined : modality,
                      cfg.params,
                      formatForPreview,
                    );
                    const promptPreview =
                      typeof cfg.prompt === "string"
                        ? cfg.prompt.slice(0, 48)
                        : "";
                    const st = item.job?.status ?? item.run.status;
                    const progressBlob =
                      item.job?.response &&
                      typeof item.job.response === "object" &&
                      item.job.response._progress &&
                      typeof item.job.response._progress === "object" &&
                      !Array.isArray(item.job.response._progress)
                        ? (item.job.response._progress as Record<
                            string,
                            unknown
                          >)
                        : null;
                    const progressDetail =
                      progressBlob?.detail != null
                        ? String(progressBlob.detail)
                        : "";
                    const progressPct = progressDetail.match(/(\d+)\s*%/);
                    const statusLabel =
                      st === "succeeded"
                        ? "成功"
                        : st === "failed"
                          ? "失败"
                          : st === "running"
                            ? progressPct
                              ? `进行中 ${progressPct[1]}%`
                              : "进行中"
                            : st === "cancelled"
                              ? "已取消"
                              : st;
                    return (
                      <tr
                        key={item.run.id}
                        className="border-b border-zinc-100 last:border-0"
                      >
                        <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[11px] text-zinc-600">
                          {new Date(item.run.createdAt).toLocaleString()}
                        </td>
                        <td className="px-3 py-1.5 text-[11px] text-zinc-700">
                          {modalityLabel(modality === "—" ? null : modality)}
                        </td>
                        <td
                          className="max-w-[9rem] truncate px-3 py-1.5 text-[11px] text-zinc-800"
                          title={modelName}
                        >
                          {modelName}
                        </td>
                        <td
                          className="max-w-[12rem] truncate px-3 py-1.5 text-[11px] text-zinc-600"
                          title={paramsPreview}
                        >
                          {paramsPreview}
                        </td>
                        <td className="px-3 py-1.5">
                          <span
                            className={
                              st === "succeeded"
                                ? "text-emerald-700"
                                : st === "failed"
                                  ? "text-red-600"
                                  : st === "running"
                                    ? "text-amber-600"
                                    : "text-zinc-600"
                            }
                          >
                            {statusLabel}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[11px]">
                          {item.job?.latencyMs != null
                            ? `${item.job.latencyMs} ms`
                            : "—"}
                        </td>
                        <td
                          className="max-w-[10rem] truncate px-3 py-1.5 text-[11px] text-zinc-600"
                          title={
                            typeof cfg.prompt === "string" ? cfg.prompt : ""
                          }
                        >
                          {promptPreview || "—"}
                        </td>
                        <td className="px-3 py-1.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-sm text-zinc-800 hover:bg-zinc-50"
                              onClick={() => viewHistoryItem(item)}
                            >
                              查看
                            </button>
                            {st === "running" || st === "queued" ? (
                              <button
                                type="button"
                                className="rounded-md border border-red-200 bg-white px-2.5 py-1 text-sm text-red-600 hover:bg-red-50"
                                onClick={() => void cancelHistoryRun(item.run.id)}
                              >
                                取消
                              </button>
                            ) : null}
                            {(() => {
                              const log = resolveHttpLog(item);
                              return (
                                <button
                                  type="button"
                                  className={`rounded-md border px-2.5 py-1 text-sm ${
                                    log
                                      ? "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                                      : "cursor-default border-zinc-100 bg-zinc-50 text-zinc-300"
                                  }`}
                                  disabled={!log}
                                  onClick={() => {
                                    if (log) setRequestLog(log);
                                  }}
                                >
                                  上游请求
                                </button>
                              );
                            })()}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <HistoryPager
              page={historyPage}
              total={historyTotal}
              onPageChange={setHistoryPage}
            />
          </>
        )}
      </section>

      {previewImage && (
        <ImagePreviewModal
          src={previewImage}
          alt="图片预览"
          onClose={() => setPreviewImage(null)}
        />
      )}
      {requestLog && (
        <RequestLogModal
          log={requestLog}
          onClose={() => setRequestLog(null)}
        />
      )}
    </div>
  );
}
