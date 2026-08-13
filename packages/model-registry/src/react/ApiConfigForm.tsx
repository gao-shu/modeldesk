"use client";

import { useId } from "react";
import {
  DEFAULT_PARAM_KEYS_BY_MODALITY,
  apiFormatsForModality,
  buildParamsForApiFormat,
  canonicalizeApiModelId,
  defaultPollUrlTemplate,
  formatSupportsApiBaseUrlMode,
  formatSupportsPollUrl,
  getApiFormat,
  inferApiBaseUrlMode,
  modalityLabel,
  modalityUsesApiFormatPicker,
  previewResolvedApiBaseUrl,
  toAdvancedApiBaseUrl,
  toSimpleApiBaseUrl,
  type ApiBaseUrlMode,
  type Modality,
} from "@modeldesk/shared";
import type {
  ApiConfigFormState,
  ProviderPresetOption,
} from "./types";

export type ApiConfigFormProps = {
  form: ApiConfigFormState;
  /** Merge patch into latest form state (parent should use functional setState). */
  onChange: (partial: Partial<ApiConfigFormState>) => void;
  editing: boolean;
  busy?: boolean;
  /** @deprecated Preset picker removed; kept for call-site compatibility. */
  presets?: readonly ProviderPresetOption[];
  onSubmit: () => void | Promise<void>;
  onCancel: () => void;
  /** `drawer` fills a side panel; `card` is a bordered standalone block. */
  variant?: "drawer" | "card";
};

export function suggestedConfigName(
  formatLabel: string | undefined,
  modelId: string,
): string {
  const id = modelId.trim().toLowerCase();
  const raw = modelId.trim();
  const label = (formatLabel ?? "").trim();
  const labelLower = label.toLowerCase();

  if (id.startsWith("deepseek-")) {
    return raw ? `DeepSeek · ${raw}` : "DeepSeek";
  }
  if (id.startsWith("glm-") && !id.startsWith("glm-image")) {
    if (id === "glm-4.7-flash") return "智谱 GLM-4.7 Flash（免费）";
    return raw ? `智谱 ${raw}` : "智谱";
  }

  // Seedream（按格式标签优先，避免与 OpenAI 简写冲突）
  if (
    labelLower.includes("seedream") ||
    id.startsWith("doubao-seedream") ||
    id.includes("seedream") ||
    ((id === "5" ||
      id === "5.0" ||
      id === "4.5" ||
      id === "4.0" ||
      id === "4") &&
      !labelLower.includes("openai"))
  ) {
    if (id.includes("5-0-pro") || id.includes("5.0-pro")) {
      return "Doubao-Seedream-5.0-pro";
    }
    if (
      id.includes("5-0") ||
      id.includes("5.0") ||
      id === "5" ||
      id.includes("seedream-5")
    ) {
      return "Doubao-Seedream-5.0-lite";
    }
    if (id.includes("4.5") || id.includes("4-5")) {
      return "Doubao-Seedream-4.5";
    }
    if (
      id === "4" ||
      id.endsWith("-4") ||
      id.includes("4.0") ||
      id.includes("4-0")
    ) {
      return "Doubao-Seedream-4.0";
    }
    if (raw.startsWith("Seedream-") || raw.startsWith("seedream-")) {
      return raw.replace(/^seedream-/i, "Doubao-Seedream-");
    }
    return raw ? `Doubao-Seedream · ${raw}` : "Seedream";
  }

  // 通义万相 · 文生图（须先于视频 Wan，避免 wan2.*-t2i 被当成视频）
  if (
    labelLower.includes("万相") ||
    labelLower.includes("wanxiang") ||
    id.startsWith("wanx") ||
    id.includes("t2i")
  ) {
    return raw ? `通义万相 · ${raw}` : "通义万相";
  }

  // Wan 视频（方舟）
  if (
    labelLower.includes("wan") ||
    id.startsWith("wan2") ||
    id === "t2v" ||
    id === "i2v"
  ) {
    if (id.includes("i2v") || id === "i2v") return "Wan · 图生视频";
    if (id.includes("t2v") || id === "t2v") return "Wan · 文生视频";
    return raw ? `Wan · ${raw}` : "Wan";
  }

  // Grok（xAI）
  if (
    labelLower.includes("grok") ||
    id.startsWith("grok-imagine") ||
    id.includes("imagine-video") ||
    id.includes("imagine-image")
  ) {
    return raw ? `Grok · ${raw}` : "Grok";
  }

  if (
    labelLower.includes("kling") ||
    labelLower.includes("可灵") ||
    id.startsWith("kling-")
  ) {
    return raw ? `可灵 · ${raw}` : "可灵 Kling";
  }
  if (
    labelLower.includes("海螺") ||
    labelLower.includes("hailuo") ||
    id.includes("hailuo") ||
    id.startsWith("minimax-h") ||
    id === "minimax-h3" ||
    id === "mimaxh3" ||
    id === "minimaxh3" ||
    id.startsWith("t2v-01")
  ) {
    return raw ? `海螺 · ${raw}` : "MiniMax 海螺";
  }
  if (
    labelLower.includes("vidu") ||
    labelLower.includes("生数") ||
    id.startsWith("vidu")
  ) {
    return raw ? `Vidu · ${raw}` : "Vidu";
  }

  // Seedance
  if (
    labelLower.includes("seedance") ||
    id.startsWith("doubao-seedance") ||
    id.includes("seedance")
  ) {
    if (id.includes("2-5") || id.includes("2.5")) {
      return "Doubao-Seedance-2.5";
    }
    if (id.includes("2-0-mini") || id.includes("2.0-mini")) {
      return "Doubao-Seedance-2.0-mini";
    }
    if (id.includes("2-0-fast") || id.includes("2.0-fast")) {
      return "Doubao-Seedance-2.0-fast";
    }
    if (
      id.includes("2-0") ||
      id.includes("2.0") ||
      id === "2" ||
      id === "2.0"
    ) {
      return "Doubao-Seedance-2.0";
    }
    if (id.includes("1-5") || id.includes("1.5") || id === "1.5") {
      return "Doubao-Seedance-1.5-pro";
    }
    if (id.includes("1-0") || id.includes("1.0") || id === "1") {
      return "Doubao-Seedance-1.0";
    }
    return raw ? `Doubao-Seedance · ${raw}` : "Seedance";
  }

  // OpenAI 图片（须在 Seedance 通配之前用标签判定）
  if (
    labelLower.includes("openai") ||
    id.startsWith("gpt-image") ||
    id.startsWith("dall-e")
  ) {
    const short =
      id.includes("image-2") || id === "2"
        ? "gpt-image-2"
        : id.includes("1.5")
          ? "gpt-image-1.5"
          : id === "1" || id.includes("image-1")
            ? "gpt-image-1"
            : id.startsWith("dall-e")
              ? raw
              : raw.startsWith("gpt-image")
                ? raw
                : raw;
    return short || "OpenAI";
  }

  if (
    id.startsWith("cogview") ||
    id === "glm-image" ||
    id.startsWith("glm-image")
  ) {
    return raw ? `智谱 · ${raw}` : "智谱";
  }
  if (id.startsWith("cogvideox") || id.includes("cogvideox")) {
    if (id === "cogvideox-flash") return "智谱 · cogvideox-flash（免费）";
    return raw ? `智谱 · ${raw}` : "智谱";
  }
  if (
    id === "t2v" ||
    id === "i2v" ||
    id.startsWith("wan2") ||
    id.startsWith("wan-") ||
    id.includes("wan2")
  ) {
    const short =
      id === "t2v" || id.includes("t2v")
        ? "t2v"
        : id === "i2v" || id.includes("i2v")
          ? "i2v"
          : raw;
    return short ? `万相 Wan · ${short}` : "万相 Wan";
  }
  if (id.startsWith("speech-") || id.startsWith("music-")) {
    return raw ? `MiniMax · ${raw}` : "MiniMax";
  }
  if (id.startsWith("qwen") && (id.includes("tts") || id.includes("audio"))) {
    return raw ? `千问 TTS · ${raw}` : "千问 TTS";
  }
  if (
    id.includes("flash-image") ||
    id.includes("pro-image") ||
    id.includes("flash-lite-image") ||
    id.includes("nano-banana")
  ) {
    return raw ? `Google · ${raw}` : "Google（Nano Banana）";
  }
  if (id.startsWith("sora")) {
    return raw ? `OpenAI · ${raw}` : "OpenAI";
  }
  if (formatLabel && raw) {
    return `${formatLabel} · ${raw}`;
  }
  return formatLabel?.trim() || raw || "";
}

export function emptyDefaults(
  modality: Modality,
  apiFormat?: string,
): Record<string, string> {
  if (apiFormat && modalityUsesApiFormatPicker(modality)) {
    return buildParamsForApiFormat(apiFormat, {});
  }
  const keys = DEFAULT_PARAM_KEYS_BY_MODALITY[modality];
  const out: Record<string, string> = {};
  for (const key of keys) {
    if (key === "temperature") out[key] = "0.2";
    else if (key === "max_tokens") out[key] = "1024";
    else if (key === "n") out[key] = "1";
    else if (key === "size") out[key] = "1K";
    else if (key === "ratio") out[key] = "16:9";
    else if (key === "quality") out[key] = "high";
    else if (key === "speed") out[key] = "1";
    else out[key] = "";
  }
  return out;
}

export function parseDefaults(
  raw: Record<string, string>,
  apiFormat: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (apiFormat) out.api_format = apiFormat;
  for (const [key, value] of Object.entries(raw)) {
    if (
      key === "api_format" ||
      key === "apiFormat" ||
      key === "base_url_mode" ||
      key === "poll_url"
    ) {
      continue;
    }
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (trimmed === "true" || trimmed === "false") {
      out[key] = trimmed === "true";
      continue;
    }
    const asNum = Number(trimmed);
    out[key] =
      Number.isFinite(asNum) && /^-?\d+(\.\d+)?$/.test(trimmed)
        ? asNum
        : trimmed;
  }
  return out;
}

export function ApiConfigForm({
  form,
  onChange,
  editing,
  busy,
  onSubmit,
  onCancel,
  variant = "drawer",
}: ApiConfigFormProps) {
  const modelSuggestionsListId = useId();
  const formatOptions = [
    ...apiFormatsForModality(form.modality, {
      includeExtended: false,
      includeRelay: false,
    }),
  ];
  // Keep current format visible even if it is somehow missing from the list.
  if (
    form.apiFormat &&
    !formatOptions.some((f) => f.id === form.apiFormat)
  ) {
    const orphan = getApiFormat(form.apiFormat);
    if (orphan) formatOptions.unshift(orphan);
  }
  const activeFormat = getApiFormat(form.apiFormat);
  const modelOptions = activeFormat?.modelOptions ?? [];
  const modelOptionLabels = activeFormat?.modelOptionLabels ?? {};
  // 高级：自由填写上游 Model ID（中转常用小写 id）；简单：兼容格式可自定义，其它用下拉
  const allowCustomModelId =
    form.baseUrlMode === "advanced" ||
    form.apiFormat.endsWith("-compatible");
  const showBaseUrlMode = formatSupportsApiBaseUrlMode(form.apiFormat);
  const baseUrlMode: ApiBaseUrlMode = form.baseUrlMode;
  // 高级模式：所有支持简单/高级的非 chat 模型都显示查询 URL（简单不显示）
  const showPollUrl =
    baseUrlMode === "advanced" && formatSupportsPollUrl(form.apiFormat);
  const pollUrlSafe = (form.pollUrl ?? "").trim();
  const pollUrlDefault = showPollUrl
    ? defaultPollUrlTemplate(form.apiFormat, form.baseUrl, form.modelId)
    : "";
  const resolvedActionUrl = form.baseUrl.trim()
    ? previewResolvedApiBaseUrl(form.baseUrl, form.apiFormat, baseUrlMode)
    : "";

  function patch(partial: Partial<ApiConfigFormState>) {
    onChange(partial);
  }

  /** 高级：预填协议默认查询 URL；用户改过后不再自动覆盖。简单：清空。 */
  function nextPollUrlFor(
    apiFormat: string,
    mode: ApiBaseUrlMode,
    baseUrl: string,
    modelId: string,
    currentPoll: string,
    prevBaseUrl: string,
    prevModelId: string,
    prevApiFormat = apiFormat,
  ): string {
    if (mode !== "advanced" || !formatSupportsPollUrl(apiFormat)) return "";
    const nextDefault = defaultPollUrlTemplate(apiFormat, baseUrl, modelId);
    const prevDefault = defaultPollUrlTemplate(
      prevApiFormat,
      prevBaseUrl,
      prevModelId,
    );
    const cur = (currentPoll ?? "").trim();
    if (!cur || cur === prevDefault) return nextDefault;
    return currentPoll;
  }

  function setBaseUrlMode(mode: "simple" | "advanced") {
    const fallback =
      activeFormat?.suggestedBaseUrl?.trim() ||
      (form.apiFormat === "text.deepseek"
        ? "https://api.deepseek.com"
        : "");
    if (mode === "simple") {
      patch({
        baseUrl: toSimpleApiBaseUrl(form.baseUrl, form.apiFormat, fallback),
        baseUrlMode: "simple",
        pollUrl: "",
        presetId: "custom",
      });
      return;
    }
    // 高级：默认填入「简单」补全后的完整 URL，之后可再改
    const nextBase = toAdvancedApiBaseUrl(
      form.baseUrl,
      form.apiFormat,
      fallback || "https://api.deepseek.com",
    );
    patch({
      baseUrl: nextBase,
      baseUrlMode: "advanced",
      pollUrl: nextPollUrlFor(
        form.apiFormat,
        "advanced",
        nextBase,
        form.modelId,
        "",
        form.baseUrl,
        form.modelId,
      ),
      presetId: "custom",
    });
  }

  function changeApiFormat(apiFormat: string) {
    const fmt = getApiFormat(apiFormat);
    const nextModelId = canonicalizeApiModelId(
      apiFormat,
      fmt?.suggestedModelId || form.modelId,
    );
    const autoName = suggestedConfigName(fmt?.label, nextModelId);
    const prevAuto = suggestedConfigName(
      activeFormat?.label,
      form.modelId || activeFormat?.suggestedModelId || "",
    );
    const nameIsAuto = !form.name.trim() || form.name.trim() === prevAuto;
    const nextBaseUrl = fmt?.suggestedBaseUrl || form.baseUrl;
    const nextMode = inferApiBaseUrlMode(nextBaseUrl, apiFormat);
    patch({
      apiFormat,
      defaults: emptyDefaults(form.modality, apiFormat),
      baseUrl: nextBaseUrl,
      baseUrlMode: nextMode,
      pollUrl: nextPollUrlFor(
        apiFormat,
        nextMode,
        nextBaseUrl,
        nextModelId,
        "",
        form.baseUrl,
        form.modelId,
      ),
      modelId: nextModelId,
      presetId: "custom",
      ...(nameIsAuto && autoName ? { name: autoName } : {}),
    });
  }

  const nameExample = suggestedConfigName(
    activeFormat?.label,
    form.modelId || activeFormat?.suggestedModelId || "",
  );

  const shellClass =
    variant === "card"
      ? "rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
      : "flex h-full min-h-0 flex-col bg-white";

  function pickModelId(modelId: string) {
    // 高级：原样保留用户输入；简单：仍做官方别名规范化
    const next =
      form.baseUrlMode === "advanced"
        ? modelId.trim()
        : canonicalizeApiModelId(form.apiFormat, modelId);
    const autoName = suggestedConfigName(activeFormat?.label, next);
    patch({
      modelId: next,
      pollUrl: nextPollUrlFor(
        form.apiFormat,
        form.baseUrlMode,
        form.baseUrl,
        next,
        form.pollUrl,
        form.baseUrl,
        form.modelId,
      ),
      ...(form.name.trim() &&
      form.name !== suggestedConfigName(activeFormat?.label, form.modelId)
        ? {}
        : autoName
          ? { name: autoName }
          : {}),
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit();
      }}
      className={shellClass}
    >
      <div
        className={
          variant === "drawer"
            ? "shrink-0 border-b border-zinc-100 px-4 py-3"
            : "mb-3"
        }
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-zinc-900">
              {editing ? "编辑配置" : "新建配置"}
            </h2>
            <p className="md-hint mt-0.5">先选 API 格式，再填地址与密钥</p>
          </div>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800"
            onClick={onCancel}
            aria-label="关闭"
          >
            ✕
          </button>
        </div>
      </div>

      <div
        className={
          variant === "drawer"
            ? "min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4"
            : "space-y-4"
        }
      >
        <label className="md-field">
          <span className="md-label">配置名称</span>
          <input
            required
            value={form.name}
            onChange={(e) => patch({ name: e.target.value })}
            className="md-control"
            placeholder={
              nameExample ? `例如：${nameExample}` : "例如：DeepSeek V4 Pro"
            }
          />
        </label>

        {modalityUsesApiFormatPicker(form.modality) ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="md-field">
                <span className="md-label">API 格式</span>
                <select
                  required
                  value={form.apiFormat}
                  onChange={(e) => changeApiFormat(e.target.value)}
                  className="md-control md-control-emphasis"
                >
                  {formatOptions.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="md-field">
                <span className="md-label">Model ID</span>
                {modelOptions.length > 0 && !allowCustomModelId ? (
                  <select
                    required
                    value={form.modelId || modelOptions[0]}
                    onChange={(e) => pickModelId(e.target.value)}
                    className="md-control md-control-mono"
                  >
                    {!modelOptions.includes(form.modelId) && form.modelId ? (
                      <option value={form.modelId}>{form.modelId}</option>
                    ) : null}
                    {modelOptions.map((id) => (
                      <option key={id} value={id}>
                        {modelOptionLabels[id] ?? id}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <input
                      required
                      list={
                        modelOptions.length > 0
                          ? modelSuggestionsListId
                          : undefined
                      }
                      value={form.modelId}
                      onChange={(e) => pickModelId(e.target.value)}
                      className="md-control md-control-mono"
                      placeholder={
                        baseUrlMode === "advanced"
                          ? "例如 minimax-h3（按中转原样填写）"
                          : "model-id"
                      }
                    />
                    {modelOptions.length > 0 ? (
                      <datalist id={modelSuggestionsListId}>
                        {modelOptions.map((id) => (
                          <option
                            key={id}
                            value={id}
                            label={modelOptionLabels[id] ?? id}
                          />
                        ))}
                      </datalist>
                    ) : null}
                  </>
                )}
              </label>
            </div>
          </>
        ) : (
          <>
            <label className="md-field">
              <span className="md-label">Model ID</span>
              <input
                required
                value={form.modelId}
                onChange={(e) => patch({ modelId: e.target.value })}
                className="md-control md-control-mono"
                placeholder="model-id"
              />
            </label>
            <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
              当前模态（{modalityLabel(form.modality)}）暂不区分 API
              格式，按服务商字段直连即可。
            </p>
          </>
        )}

        {showBaseUrlMode ? (
          <span className="inline-flex h-8 w-fit overflow-hidden rounded-md border border-zinc-300 text-sm">
            <button
              type="button"
              onClick={() => setBaseUrlMode("simple")}
              className={`px-3 ${
                baseUrlMode === "simple"
                  ? "bg-zinc-900 text-white"
                  : "bg-white text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              简单
            </button>
            <button
              type="button"
              onClick={() => setBaseUrlMode("advanced")}
              className={`px-3 ${
                baseUrlMode === "advanced"
                  ? "bg-zinc-900 text-white"
                  : "bg-white text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              高级
            </button>
          </span>
        ) : null}

        <label className="md-field">
          <span className="md-label">Base URL</span>
          <input
            value={form.baseUrl}
            onChange={(e) => {
              const baseUrl = e.target.value;
              // 深层 path → 升为高级；输入时绝不自动降回简单（避免盖掉用户刚点的「高级」）
              const inferred = inferApiBaseUrlMode(baseUrl, form.apiFormat);
              const nextMode =
                inferred === "advanced" ? ("advanced" as const) : baseUrlMode;
              patch({
                baseUrl,
                presetId: "custom",
                provider:
                  form.provider === "custom" ? "custom" : form.provider,
                ...(inferred === "advanced"
                  ? { baseUrlMode: "advanced" as const }
                  : {}),
                pollUrl: nextPollUrlFor(
                  form.apiFormat,
                  nextMode,
                  baseUrl,
                  form.modelId,
                  form.pollUrl,
                  form.baseUrl,
                  form.modelId,
                ),
              });
            }}
            className="md-control md-control-mono"
            placeholder={
              showBaseUrlMode && baseUrlMode === "simple"
                ? form.modality === "text"
                  ? "例如 https://api.deepseek.com"
                  : activeFormat?.suggestedBaseUrl ||
                    "例如 https://ark.cn-beijing.volces.com/api/v3"
                : showBaseUrlMode
                  ? form.modality === "text"
                    ? "例如 https://api.deepseek.com/v1/chat/completions"
                    : activeFormat?.apiActionPath
                      ? `例如 ${(activeFormat.suggestedBaseUrl || "").replace(/\/+$/, "")}${activeFormat.apiActionPath}`
                      : activeFormat?.suggestedBaseUrl ||
                        "例如 https://ark.cn-beijing.volces.com/api/v3/images/generations"
                  : "例如 https://api.example.com/v1"
            }
          />
          {showBaseUrlMode && resolvedActionUrl ? (
            <p className="md-hint mt-0.5 min-w-0 break-all">
              实际访问：
              <span className="font-mono text-zinc-500">
                {resolvedActionUrl}
              </span>
            </p>
          ) : null}
        </label>

        {showPollUrl ? (
          <label className="md-field">
            <span className="md-label">查询 URL</span>
            <input
              value={pollUrlSafe || pollUrlDefault}
              onChange={(e) =>
                patch({ pollUrl: e.target.value, presetId: "custom" })
              }
              onFocus={() => {
                if (!pollUrlSafe && pollUrlDefault) {
                  patch({ pollUrl: pollUrlDefault });
                }
              }}
              className="md-control md-control-mono"
              placeholder={pollUrlDefault}
            />
            <p className="md-hint mt-0.5">
              轮询任务状态；默认按当前协议预填，可改。{"{{id}}"} 为任务
              id。
            </p>
          </label>
        ) : null}

        <label className="md-field">
          <span className="md-label">API Key</span>
          <input
            type="password"
            autoComplete="off"
            value={form.apiKey}
            onChange={(e) => patch({ apiKey: e.target.value })}
            className="md-control md-control-mono"
            placeholder={
              editing
                ? "••••••••（留空则保留）"
                : form.apiFormat === "video.kling"
                  ? "AccessKey:SecretKey"
                  : form.apiFormat === "video.vidu"
                    ? "Token …"
                    : "sk-..."
            }
            required={!editing}
          />
          {form.apiFormat === "video.kling" ? (
            <p className="md-hint mt-0.5">
              官方可灵用 AccessKey+SecretKey；用冒号或竖线拼接，服务端签发 JWT
            </p>
          ) : form.apiFormat === "video.vidu" ? (
            <p className="md-hint mt-0.5">
              请求头为 Authorization: Token …（不是 Bearer）
            </p>
          ) : null}
        </label>
      </div>

      <div
        className={
          variant === "drawer"
            ? "shrink-0 border-t border-zinc-100 px-4 py-3"
            : "mt-4"
        }
      >
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={busy}
            className="h-9 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {busy ? "保存中…" : editing ? "保存更改" : "创建配置"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="h-9 rounded-md border border-zinc-300 bg-white px-4 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            取消
          </button>
        </div>
      </div>
    </form>
  );
}
