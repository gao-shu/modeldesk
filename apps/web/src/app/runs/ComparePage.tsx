"use client";

import {
  pickRunParamsForApiFormat,
  resolveApiFormatId,
  type Modality,
} from "@modeldesk/shared";
import { ModelPicker, modalityLabel } from "@modeldesk/model-registry/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CompareResultCard } from "@/components/CompareResultCard";
import { PageHeader } from "@/components/PageHeader";
import { PromptPresetSelect } from "@/components/PromptPresetSelect";
import { RunParamsFields } from "@/components/RunParamsFields";
import { UseThisModelDialog } from "@/components/UseThisModelDialog";
import {
  initCompareSlots,
  startCompareRun,
  type CompareSlotState,
} from "@/lib/client/compare-session";
import { defaultPromptForModality } from "@/lib/client/default-prompts";
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

const MODALITIES: Modality[] = ["text", "image", "audio", "video"];

function uniqueIds(ids: string[]): boolean {
  const filled = ids.filter(Boolean);
  return new Set(filled).size === filled.length;
}

export function ComparePage() {
  const [allModels, setAllModels] = useState<ModelPublic[]>(
    () => (peekCachedModels() as ModelPublic[] | null) ?? [],
  );
  const [modality, setModality] = useState<Modality>("text");
  const [modelIds, setModelIds] = useState<string[]>(["", ""]);
  const [prompt, setPrompt] = useState(() => defaultPromptForModality("text"));
  const [runParams, setRunParams] = useState<Record<string, string>>({});
  const [paramsOpen, setParamsOpen] = useState(false);
  const [objectStorageReady, setObjectStorageReady] = useState<boolean | null>(
    null,
  );
  const [slots, setSlots] = useState<CompareSlotState[]>([]);
  const [running, setRunning] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [compareStatus, setCompareStatus] = useState<string | null>(null);
  const [useTarget, setUseTarget] = useState<{
    modelId: string;
    modelName: string;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return subscribeModelsCache(() => {
      const cached = peekCachedModels() as ModelPublic[] | null;
      if (cached) setAllModels(cached);
    });
  }, []);

  useEffect(() => {
    void fetchModelsCached().then((list) => {
      const modelsList = list as ModelPublic[];
      setAllModels(modelsList);
      setModelIds((prev) => {
        if (prev.some(Boolean)) return prev;
        const filtered = modelsList.filter(
          (m) =>
            m.modality === "text" &&
            m.provider !== "mock" &&
            !(m.baseUrl ?? "").startsWith("mock://"),
        );
        return [
          filtered[0]?.id ?? "",
          filtered[1]?.id ?? "",
        ];
      });
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

  const models = useMemo(() => {
    return allModels.filter(
      (m) =>
        m.modality === modality &&
        m.provider !== "mock" &&
        !(m.baseUrl ?? "").startsWith("mock://"),
    );
  }, [allModels, modality]);

  function changeModality(next: Modality) {
    if (next === modality) return;
    setModality(next);
    setPrompt(defaultPromptForModality(next));
    setRunParams({});
    setSlots([]);
    setCompareStatus(null);
    setBootError(null);
    const filtered = allModels.filter(
      (m) =>
        m.modality === next &&
        m.provider !== "mock" &&
        !(m.baseUrl ?? "").startsWith("mock://"),
    );
    const count = Math.min(3, Math.max(2, modelIds.length));
    const nextIds: string[] = [];
    for (const m of filtered) {
      if (nextIds.length >= count) break;
      nextIds.push(m.id);
    }
    while (nextIds.length < 2) nextIds.push("");
    setModelIds(nextIds);
  }

  const selectedModels = useMemo(
    () =>
      modelIds
        .map((id) => models.find((m) => m.id === id) ?? null)
        .filter(Boolean) as ModelPublic[],
    [modelIds, models],
  );

  const primary = selectedModels[0] ?? null;
  const selectedApiFormat = primary
    ? resolveApiFormatId({
        modality: primary.modality,
        defaults: primary.defaults,
        provider: primary.provider,
        baseUrl: primary.baseUrl,
        modelId: primary.modelId,
      })
    : null;

  const filledIds = modelIds.filter(Boolean);
  const canRun =
    !running &&
    filledIds.length >= 2 &&
    filledIds.length <= 3 &&
    uniqueIds(filledIds) &&
    Boolean(prompt.trim()) &&
    models.length >= 2;

  function setSlotModel(index: number, id: string) {
    setModelIds((prev) => {
      const next = [...prev];
      next[index] = id;
      return next;
    });
  }

  function addModelSlot() {
    setModelIds((prev) => {
      if (prev.length >= 3) return prev;
      const used = new Set(prev.filter(Boolean));
      const candidate = models.find((m) => !used.has(m.id));
      return [...prev, candidate?.id ?? ""];
    });
  }

  function removeModelSlot(index: number) {
    setModelIds((prev) => {
      if (prev.length <= 2) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }

  async function runAll() {
    if (!canRun) return;
    setBootError(null);
    setCompareStatus(null);
    const ids = modelIds.filter(Boolean);
    const names = ids.map(
      (id) => models.find((m) => m.id === id)?.name ?? id,
    );
    const params = selectedApiFormat
      ? pickRunParamsForApiFormat(selectedApiFormat, runParams)
      : { ...runParams };

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setRunning(true);
    setSlots(initCompareSlots(ids.map((id, i) => ({ id, name: names[i]! }))));

    try {
      await startCompareRun({
        modality,
        modelIds: ids,
        modelNames: names,
        prompt: prompt.trim(),
        params,
        signal: ac.signal,
        onSlots: setSlots,
        onCompareDone: (summary) => {
          setCompareStatus(summary.status);
        },
      });
    } catch (err) {
      if (!ac.signal.aborted) {
        setBootError(err instanceof Error ? err.message : "Compare 失败");
      }
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      setRunning(false);
    }
  }

  const gridCols =
    slots.length >= 3
      ? "md:grid-cols-3"
      : slots.length === 2
        ? "md:grid-cols-2"
        : "md:grid-cols-1";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 pb-8">
      <PageHeader
        title="Compare"
        description="同一输入并行测试 2～3 个同模态模型，再复制 Gateway 调用代码。"
      />

      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-xs font-medium text-zinc-600">
            Modality
            <select
              className="md-control mt-1 w-full"
              value={modality}
              disabled={running}
              onChange={(e) => changeModality(e.target.value as Modality)}
            >
              {MODALITIES.map((m) => (
                <option key={m} value={m}>
                  {modalityLabel(m)}
                </option>
              ))}
            </select>
          </label>

          {modelIds.map((id, index) => (
            <div key={`slot-${index}`} className="min-w-0">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-zinc-600">
                  Model {String.fromCharCode(65 + index)}
                </span>
                {modelIds.length > 2 ? (
                  <button
                    type="button"
                    disabled={running}
                    onClick={() => removeModelSlot(index)}
                    className="text-[11px] text-zinc-400 hover:text-zinc-700"
                  >
                    移除
                  </button>
                ) : null}
              </div>
              <ModelPicker
                models={models}
                value={id}
                modality={modality}
                disabled={running || models.length === 0}
                onChange={(next) => {
                  if (
                    next &&
                    modelIds.some((other, i) => i !== index && other === next)
                  ) {
                    setBootError("不能选择重复的模型");
                    return;
                  }
                  setBootError(null);
                  setSlotModel(index, next);
                }}
                emptyLabel={
                  models.length === 0
                    ? `暂无${modalityLabel(modality)}模型`
                    : "选择模型"
                }
              />
            </div>
          ))}
        </div>

        {modelIds.length < 3 ? (
          <button
            type="button"
            disabled={running || models.length < 3}
            onClick={addModelSlot}
            className="mt-3 text-xs font-medium text-zinc-700 underline-offset-2 hover:underline disabled:opacity-40"
          >
            + Add model
          </button>
        ) : null}

        {models.length < 2 ? (
          <p className="mt-2 text-xs text-amber-800">
            当前模态可用模型不足 2 个，请先在「模型配置」中添加。
          </p>
        ) : null}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-zinc-900">Input</h2>
          <div className="min-w-[10rem] max-w-xs flex-1">
            <PromptPresetSelect
              compact
              modality={modality}
              prompt={prompt}
              onSelect={(preset) => {
                setPrompt(preset.text);
                if (preset.params) {
                  setRunParams((prev) => ({ ...prev, ...preset.params }));
                }
              }}
            />
          </div>
        </div>
        <textarea
          value={prompt}
          disabled={running}
          onChange={(e) => setPrompt(e.target.value)}
          rows={5}
          className="w-full resize-y border-0 bg-white px-4 py-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 disabled:opacity-60"
          placeholder="同一提示词将发给所有选中模型…"
        />
        <div className="border-t border-zinc-100">
          <button
            type="button"
            onClick={() => setParamsOpen((o) => !o)}
            className="flex w-full items-center justify-between px-4 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
          >
            <span className="font-medium">生成参数</span>
            <span className="text-xs text-zinc-400">
              {paramsOpen ? "收起" : "展开"}
              {primary ? ` · 按 ${primary.name} 的格式` : ""}
            </span>
          </button>
          {paramsOpen && primary ? (
            <div className="border-t border-zinc-100 px-4 pb-3 pt-2">
              <RunParamsFields
                modality={modality}
                values={runParams}
                apiFormat={selectedApiFormat}
                provider={primary.provider}
                modelId={primary.modelId ?? primary.name}
                baseUrl={primary.baseUrl}
                name={primary.name}
                objectStorageReady={objectStorageReady}
                compact
                disabled={running}
                onChange={(key, value) =>
                  setRunParams((prev) => ({ ...prev, [key]: value }))
                }
              />
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-zinc-100 px-4 py-3">
          <button
            type="button"
            disabled={!canRun}
            onClick={() => void runAll()}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {running ? "Running…" : "Run All"}
          </button>
          {compareStatus ? (
            <span className="text-xs text-zinc-500">
              Compare status: {compareStatus}
            </span>
          ) : null}
          {bootError ? (
            <span className="text-xs text-red-700">{bootError}</span>
          ) : null}
        </div>
      </section>

      {slots.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-zinc-900">Results</h2>
          <div className={`grid grid-cols-1 gap-3 ${gridCols}`}>
            {slots.map((slot) => (
              <CompareResultCard
                key={slot.slot}
                modality={modality}
                slot={slot}
                disabledActions={running && slot.status === "running"}
                onUse={() =>
                  setUseTarget({
                    modelId: slot.modelId,
                    modelName: slot.modelName,
                  })
                }
              />
            ))}
          </div>
        </section>
      ) : (
        <p className="text-center text-xs text-zinc-400">
          选择 2～3 个模型后点击 Run All，结果将并排显示在这里。
        </p>
      )}

      <UseThisModelDialog
        open={Boolean(useTarget)}
        onClose={() => setUseTarget(null)}
        modelId={useTarget?.modelId ?? ""}
        modelName={useTarget?.modelName}
        modality={modality}
        prompt={prompt}
      />
    </div>
  );
}
