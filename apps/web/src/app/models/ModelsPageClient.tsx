"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CAPABILITIES_BY_MODALITY,
  MODALITIES,
  PROVIDER_PRESETS,
  apiBaseUrlModeFromDefaults,
  canonicalizeApiModelId,
  defaultApiFormatId,
  defaultPollUrlTemplate,
  formatSupportsApiBaseUrlMode,
  formatSupportsPollUrl,
  getApiFormat,
  inferApiBaseUrlMode,
  normalizeVolcengineArkBaseUrl,
  resolveApiFormatId,
  type Modality,
} from "@modeldesk/shared";
import {
  ApiConfigForm,
  ApiConfigList,
  ModalityFilter,
  emptyDefaults,
  modalityLabel,
  parseDefaults,
  suggestedConfigName,
  type ApiConfigFormState,
  type ApiConfigListItem,
} from "@modeldesk/model-registry/react";
import { HistoryPager, PAGE_SIZE } from "@/components/HistoryPager";
import {
  fetchModelsCached,
  invalidateCachedModels,
  peekCachedModels,
  setCachedModels,
} from "@/lib/client/models-cache";

type SmokeResult = {
  ok: boolean;
  kind: string;
  latencyMs: number;
  message: string;
};

function initialForm(): ApiConfigFormState {
  const modality: Modality = "text";
  const apiFormat = defaultApiFormatId(modality);
  const fmt = getApiFormat(apiFormat);
  const baseUrl = fmt?.suggestedBaseUrl ?? "https://api.deepseek.com";
  return {
    name: "",
    modality,
    capability: CAPABILITIES_BY_MODALITY[modality][0],
    provider: "custom",
    presetId: "custom",
    apiFormat,
    baseUrl,
    baseUrlMode: inferApiBaseUrlMode(baseUrl, apiFormat),
    pollUrl: "",
    apiKey: "",
    modelId: fmt?.suggestedModelId ?? "deepseek-v4-pro",
    defaults: emptyDefaults(modality, apiFormat),
  };
}

function formFromModel(model: ApiConfigListItem): ApiConfigFormState {
  const modality = (MODALITIES as readonly string[]).includes(model.modality)
    ? (model.modality as Modality)
    : "text";
  const preset =
    PROVIDER_PRESETS.find((p) => p.id === model.provider) ??
    PROVIDER_PRESETS.find((p) => p.id === "custom")!;
  const apiFormat = resolveApiFormatId({
    modality,
    defaults: model.defaults,
    provider: model.provider,
    baseUrl: model.baseUrl,
    modelId: model.modelId,
  });
  const defaults = emptyDefaults(modality, apiFormat);
  for (const [k, v] of Object.entries(model.defaults ?? {})) {
    if (
      k === "api_format" ||
      k === "apiFormat" ||
      k === "base_url_mode" ||
      k === "poll_url"
    ) {
      continue;
    }
    defaults[k] = v == null ? "" : String(v);
  }
  const baseUrlRaw = model.baseUrl ?? "";
  const baseUrl = normalizeVolcengineArkBaseUrl(baseUrlRaw);
  const pollUrlRaw = model.defaults?.poll_url;
  const baseUrlMode =
    apiBaseUrlModeFromDefaults(model.defaults) ??
    inferApiBaseUrlMode(baseUrl, apiFormat);
  const modelId = canonicalizeApiModelId(apiFormat, model.modelId);
  const savedPoll =
    typeof pollUrlRaw === "string" && pollUrlRaw.trim()
      ? pollUrlRaw.trim()
      : "";
  return {
    name: model.name,
    modality,
    capability: model.capability,
    provider: model.provider,
    presetId: preset.id,
    apiFormat,
    baseUrl,
    baseUrlMode,
    pollUrl:
      savedPoll ||
      (baseUrlMode === "advanced" && formatSupportsPollUrl(apiFormat)
        ? defaultPollUrlTemplate(apiFormat, baseUrl, modelId)
        : ""),
    apiKey: "",
    modelId,
    defaults,
  };
}

export function ModelsPageClient({
  initialModels = [],
}: {
  initialModels?: ApiConfigListItem[];
}) {
  const [models, setModels] = useState<ApiConfigListItem[]>(() => {
    if (initialModels.length > 0) return initialModels;
    return (peekCachedModels() as ApiConfigListItem[] | null) ?? [];
  });
  const [modalityFilter, setModalityFilter] = useState<string>("text");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(
    () =>
      initialModels.length === 0 &&
      ((peekCachedModels() as ApiConfigListItem[] | null) ?? []).length === 0,
  );
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ApiConfigFormState>(initialForm);
  const [busy, setBusy] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [lastTest, setLastTest] = useState<{
    id: string;
    result: SmokeResult;
  } | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const name = sp.get("name")?.trim() || "";
    const baseUrl = sp.get("baseUrl")?.trim() || "";
    const modelId = sp.get("modelId")?.trim() || "";
    const website = sp.get("website")?.trim() || "";
    const modalityRaw = sp.get("modality")?.trim() || "";
    if (!name && !baseUrl && !modelId && !website) return;

    const modality: Modality = (
      (MODALITIES as readonly string[]).includes(modalityRaw)
        ? modalityRaw
        : "text"
    ) as Modality;
    const apiFormat = defaultApiFormatId(modality);
    const fmt = getApiFormat(apiFormat);
    const nextBaseUrl = baseUrl || fmt?.suggestedBaseUrl || "";
    setModalityFilter(modality);
    setEditingId(null);
    setForm({
      name: name || "from-link",
      modality,
      capability: CAPABILITIES_BY_MODALITY[modality][0],
      provider: "custom",
      presetId: "custom",
      apiFormat,
      baseUrl: nextBaseUrl,
      baseUrlMode: inferApiBaseUrlMode(nextBaseUrl, apiFormat),
      pollUrl: "",
      apiKey: "",
      modelId:
        modelId ||
        fmt?.suggestedModelId ||
        (modality === "text" ? "gpt-4o-mini" : ""),
      defaults: emptyDefaults(modality, apiFormat),
    });
    setFormOpen(true);
    setMessage(
      baseUrl
        ? "已预填 Base URL，请补全 API Key 后保存。"
        : website
          ? `已预填名称；官网 ${website}（请自行填写 API Base URL 与 Key）。`
          : "已从链接预填，请补全后保存。",
    );
    // Drop query so refresh / share doesn't re-open the drawer.
    const next = window.location.pathname + window.location.hash;
    window.history.replaceState(null, "", next);
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    const hadData = models.length > 0;
    if (!hadData) setLoading(true);
    try {
      const next = (await fetchModelsCached({
        force: true,
      })) as ApiConfigListItem[];
      setModels(next);
      if (next.length === 0) {
        setMessage("接口返回 0 条配置。若刚迁移数据，请重启 pnpm dev 后再刷新。");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      if (!hadData) setModels([]);
    } finally {
      setLoading(false);
    }
  }, [models.length]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const force = models.length === 0 && !peekCachedModels();
        const next = (await fetchModelsCached({
          force,
        })) as ApiConfigListItem[];
        if (cancelled) return;
        setModels(next);
        setLoading(false);
        if (next.length === 0) {
          setMessage(
            "接口返回 0 条配置。若刚迁移数据，请重启 pnpm dev 后再刷新。",
          );
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Keep-alive: run once per page mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (initialModels.length > 0) {
      setModels(initialModels);
      setCachedModels(initialModels);
      setLoading(false);
    }
  }, [initialModels]);

  const visibleModels = useMemo(
    () =>
      modalityFilter
        ? models.filter((m) => m.modality === modalityFilter)
        : models,
    [models, modalityFilter],
  );

  const totalPages = Math.max(1, Math.ceil(visibleModels.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedModels = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return visibleModels.slice(start, start + PAGE_SIZE);
  }, [visibleModels, safePage]);

  useEffect(() => {
    setPage(1);
  }, [modalityFilter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (!formOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setFormOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [formOpen]);

  function openCreate() {
    const modality = (
      (MODALITIES as readonly string[]).includes(modalityFilter)
        ? modalityFilter
        : "text"
    ) as Modality;
    const apiFormat = defaultApiFormatId(modality);
    const fmt = getApiFormat(apiFormat);
    const modelId = fmt?.suggestedModelId ?? "";
    const nextBaseUrl = fmt?.suggestedBaseUrl ?? "";
    setEditingId(null);
    setForm({
      name: suggestedConfigName(fmt?.label, modelId),
      modality,
      capability: CAPABILITIES_BY_MODALITY[modality][0],
      provider: "custom",
      presetId: "custom",
      apiFormat,
      baseUrl: nextBaseUrl,
      baseUrlMode: inferApiBaseUrlMode(nextBaseUrl, apiFormat),
      pollUrl: "",
      apiKey: "",
      modelId,
      defaults: emptyDefaults(modality, apiFormat),
    });
    setFormOpen(true);
    setMessage(null);
    setError(null);
  }

  function openEdit(model: ApiConfigListItem) {
    setEditingId(model.id);
    setForm(formFromModel(model));
    setFormOpen(true);
    setMessage(null);
    setError(null);
  }

  async function submitForm() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      let nextBaseUrl = normalizeVolcengineArkBaseUrl(form.baseUrl.trim());
      const payload = {
        name: form.name.trim(),
        modality: form.modality,
        capability: form.capability,
        provider: form.provider.trim() || form.presetId || "custom",
        baseUrl: nextBaseUrl || null,
        modelId:
          form.baseUrlMode === "advanced"
            ? form.modelId.trim()
            : canonicalizeApiModelId(form.apiFormat, form.modelId.trim()),
        defaults: {
          ...parseDefaults(form.defaults, form.apiFormat),
          ...(formatSupportsApiBaseUrlMode(form.apiFormat)
            ? { base_url_mode: form.baseUrlMode }
            : {}),
          ...(form.baseUrlMode === "advanced" &&
          formatSupportsPollUrl(form.apiFormat)
            ? {
                poll_url:
                  (form.pollUrl ?? "").trim() ||
                  defaultPollUrlTemplate(
                    form.apiFormat,
                    nextBaseUrl || form.baseUrl,
                    form.modelId,
                  ),
              }
            : {}),
        },
        ...(form.apiKey.trim()
          ? { apiKey: form.apiKey.trim() }
          : editingId
            ? {}
            : {}),
      };

      const res = await fetch(
        editingId ? `/api/models/${editingId}` : "/api/models",
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        model?: ApiConfigListItem;
      };
      if (!data.ok) {
        setError(data.error ?? "保存失败");
        return;
      }
      setMessage(
        editingId
          ? `已更新「${data.model?.name ?? "模型"}」。`
          : `已创建「${data.model?.name ?? "模型"}」。`,
      );
      setFormOpen(false);
      setEditingId(null);
      invalidateCachedModels();
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeModel(id: string, name: string) {
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/models/${id}`, { method: "DELETE" });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "删除失败");
        return;
      }
      setMessage(`已删除「${name}」。`);
      if (editingId === id) {
        setFormOpen(false);
        setEditingId(null);
      }
      invalidateCachedModels();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  }

  async function runTest(id: string) {
    setTestingId(id);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/models/${id}/test`, { method: "POST" });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        result?: SmokeResult;
      };
      if (!data.result) {
        setError(data.error ?? "测试失败");
        return;
      }
      setLastTest({ id, result: data.result });
      setMessage(
        data.result.ok
          ? `测试通过（${data.result.latencyMs}ms）：${data.result.message}`
          : `测试失败：${data.result.message}`,
      );
      if (!data.result.ok) setError(data.result.message);
    } finally {
      setTestingId(null);
    }
  }

  return (
    <div>
      <div
        className="flex flex-wrap items-center justify-between gap-2"
        style={{ marginBottom: "var(--md-page-title-mb)" }}
      >
        <div className="min-w-0">
          <h1
            className="font-semibold tracking-tight text-zinc-900"
            style={{ fontSize: "var(--md-page-title)" }}
          >
            模型配置
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            className="h-9 rounded-md border border-zinc-300 bg-white px-3.5 text-sm text-zinc-800 hover:bg-zinc-50"
          >
            刷新
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="h-9 rounded-md bg-zinc-900 px-3.5 text-sm text-white hover:bg-zinc-800"
          >
            新建配置
          </button>
        </div>
      </div>

      <ModalityFilter
        label="类型"
        value={modalityFilter}
        onChange={setModalityFilter}
      />

      {error ? <p className="mb-2 text-xs text-red-600">{error}</p> : null}
      {message ? <p className="mb-2 text-xs text-emerald-700">{message}</p> : null}

      <ApiConfigList
        configs={pagedModels}
        modalityFilter={modalityFilter}
        testingId={testingId}
        lastTest={lastTest}
        onEdit={openEdit}
        onTest={(id) => void runTest(id)}
        onDelete={(id, name) => void removeModel(id, name)}
        emptyHint={
          loading
            ? "加载中…"
            : "暂无配置"
        }
      />
      <HistoryPager
        page={safePage}
        total={visibleModels.length}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />

      {formOpen ? (
        <>
          <button
            type="button"
            className="md-drawer-backdrop"
            aria-label="关闭配置面板"
            onClick={() => setFormOpen(false)}
          />
          <div
            className="md-drawer-panel"
            role="dialog"
            aria-modal="true"
            aria-label={editingId ? "编辑配置" : "新建配置"}
          >
            <ApiConfigForm
              variant="drawer"
              form={form}
              onChange={(partial) =>
                setForm((prev) => ({ ...prev, ...partial }))
              }
              editing={Boolean(editingId)}
              busy={busy}
              onSubmit={submitForm}
              onCancel={() => setFormOpen(false)}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
