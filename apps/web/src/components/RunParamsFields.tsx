"use client";

import Link from "next/link";
import {
  RUN_PARAM_FIELDS_BY_MODALITY,
  fieldsForApiFormat,
  type RunParamField,
  type RunParamModality,
  type RunParamOption,
} from "@modeldesk/shared";
import { useEffect, useRef, useState } from "react";

const MAX_REF_IMAGE_BYTES = 4.5 * 1024 * 1024;

/**
 * Prefer a public object-storage URL when configured (some video APIs need fetchable URL).
 * Falls back to data URI when STORAGE_PROVIDER=none / not configured.
 */
async function resolveLocalImage(file: File): Promise<string> {
  const dataUrl = await readFileAsDataUrl(file);
  let configured = false;
  try {
    const status = await fetch("/api/upload", { cache: "no-store" });
    const statusData = (await status.json()) as {
      ok?: boolean;
      configured?: boolean;
      tosConfigured?: boolean;
    };
    configured = Boolean(
      statusData.configured ?? statusData.tosConfigured,
    );
  } catch {
    configured = false;
  }
  if (!configured) return dataUrl;

  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  const data = (await res.json()) as {
    ok: boolean;
    url?: string;
    error?: string;
  };
  if (!res.ok || !data.ok || !data.url) {
    throw new Error(
      data.error ??
        "对象存储上传失败。需要公网 URL 时请配置 STORAGE_PROVIDER（见设置页）。",
    );
  }
  return data.url;
}

function matchesProviderTags(
  tags: readonly string[] | undefined,
  provider: string | null | undefined,
): boolean {
  if (!tags || tags.length === 0) return true;
  if (!provider) return true;
  const p = provider.toLowerCase();
  return tags.some(
    (tag) => tag === "*" || p.includes(tag.toLowerCase()),
  );
}

/**
 * Infer TTS family when model.provider was saved as custom / openai-compatible.
 * Also matches Chinese display names like「千问 TTS Flash」.
 */
function resolveProviderHint(
  provider: string | null | undefined,
  modelId?: string | null,
  baseUrl?: string | null,
  name?: string | null,
): string {
  const bits = [provider, modelId, baseUrl, name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!bits) return provider ?? "";
  if (bits.includes("minimax")) return `${provider ?? ""} minimax`;
  if (bits.includes("qwen3-tts") || bits.includes("qwen3_tts")) {
    return `${provider ?? ""} qwen3-tts`;
  }
  if (
    bits.includes("qwen-audio") ||
    bits.includes("qwen-tts") ||
    bits.includes("cosyvoice") ||
    bits.includes("dashscope") ||
    bits.includes("qianwen") ||
    bits.includes("千问") ||
    bits.includes("qwen")
  ) {
    return `${provider ?? ""} qwen-tts`;
  }
  if (
    bits.includes("zhipu") ||
    bits.includes("bigmodel") ||
    bits.includes("cogvideox")
  ) {
    return `${provider ?? ""} zhipu bigmodel`;
  }
  if (bits.includes("agnes")) {
    return `${provider ?? ""} agnes`;
  }
  return provider ?? "";
}

function optionMatchesProvider(
  opt: RunParamOption,
  provider: string | null | undefined,
): boolean {
  return matchesProviderTags(opt.providers, provider);
}

function optionMatchesModel(
  opt: RunParamOption,
  modelId: string | null | undefined,
): boolean {
  const mid = (modelId ?? "").trim().toLowerCase();
  if (opt.excludeModels?.length) {
    if (
      mid &&
      opt.excludeModels.some((tag) => mid.includes(tag.toLowerCase()))
    ) {
      return false;
    }
  }
  if (opt.models?.length) {
    if (!mid) return false;
    return opt.models.some((tag) => mid.includes(tag.toLowerCase()));
  }
  return true;
}

function filterFieldOptions(
  options: readonly RunParamOption[] | undefined,
  provider: string | null | undefined,
  modelId: string | null | undefined,
  /** When using ApiFormatDef.fields, provider tags are ignored. */
  applyProviderFilter: boolean,
): RunParamOption[] {
  const list = options ?? [];
  return list.filter((opt) => {
    if (applyProviderFilter && !optionMatchesProvider(opt, provider)) {
      return false;
    }
    return optionMatchesModel(opt, modelId);
  });
}

function fieldMatchesProvider(
  field: RunParamField,
  provider: string | null | undefined,
): boolean {
  return matchesProviderTags(field.providers, provider);
}

function fieldMatchesModel(
  field: RunParamField,
  modelId: string | null | undefined,
): boolean {
  return optionMatchesModel(
    {
      value: "",
      label: "",
      models: field.models,
      excludeModels: field.excludeModels,
    },
    modelId,
  );
}

function isPreviewableImage(value: string): boolean {
  return (
    value.startsWith("data:image/") ||
    /^https?:\/\//i.test(value) ||
    value.startsWith("blob:")
  );
}

function describeUploadedImage(value: string): string {
  if (value.startsWith("data:")) {
    const m = /^data:(image\/[\w+.-]+);base64,/i.exec(value);
    const kind = (m?.[1] ?? "image").replace(/^image\//i, "").toUpperCase();
    const approxKb = Math.max(1, Math.round((value.length * 0.75) / 1024));
    return `${kind} · 约 ${approxKb} KB · 已上传`;
  }
  if (/^https?:\/\//i.test(value)) {
    try {
      const host = new URL(value).hostname;
      return `公网 URL · ${host}`;
    } catch {
      return "公网 URL · 已填写";
    }
  }
  return "已填写";
}

function parseImageList(raw: string): string[] {
  const s = raw?.trim() ?? "";
  if (!s) return [];
  if (s.startsWith("[")) {
    try {
      const parsed = JSON.parse(s) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .filter((x): x is string => typeof x === "string")
          .map((x) => x.trim())
          .filter(Boolean);
      }
    } catch {
      /* fall through */
    }
  }
  return [s];
}

function serializeImageList(items: string[]): string {
  return items.length > 0 ? JSON.stringify(items) : "";
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_REF_IMAGE_BYTES) {
      reject(new Error("参考图不能超过 4.5MB（智谱上限 5MB）"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === "string" ? reader.result : "");
    };
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
}

type ImagePairMode = "none" | "ref" | "pair";

function deriveImagePairMode(start: string, end: string): ImagePairMode {
  if (end.trim()) return "pair";
  if (start.trim()) return "ref";
  return "none";
}

/** Video reference input: none / single ref / first+last frame. */
function ImagePairParamControl({
  startValue,
  endValue,
  disabled,
  onChangeStart,
  onChangeEnd,
  inputClass,
  compact,
}: {
  startValue: string;
  endValue: string;
  disabled?: boolean;
  onChangeStart: (value: string) => void;
  onChangeEnd: (value: string) => void;
  inputClass: string;
  compact?: boolean;
}) {
  const [mode, setMode] = useState<ImagePairMode>(() =>
    deriveImagePairMode(startValue, endValue),
  );

  useEffect(() => {
    // Upgrade from hydrated / external values; do not force pair→ref when尾帧 empty.
    if (endValue.trim()) {
      setMode("pair");
      return;
    }
    if (startValue.trim()) {
      setMode((prev) => (prev === "pair" ? "pair" : "ref"));
    }
  }, [startValue, endValue]);

  const setModeAndValues = (next: ImagePairMode) => {
    setMode(next);
    if (next === "none") {
      if (startValue) onChangeStart("");
      if (endValue) onChangeEnd("");
      return;
    }
    if (next === "ref" && endValue) {
      onChangeEnd("");
    }
  };

  const modes: { id: ImagePairMode; label: string }[] = [
    { id: "none", label: "无" },
    { id: "ref", label: "参考图" },
    { id: "pair", label: "首尾帧" },
  ];

  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      <div
        className={`inline-flex rounded-md border border-zinc-200 bg-zinc-50 p-0.5 ${compact ? "text-[11px]" : "text-xs"}`}
        role="radiogroup"
        aria-label="参考输入模式"
      >
        {modes.map((m) => {
          const active = mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => setModeAndValues(m.id)}
              className={`rounded px-2.5 py-1 font-medium transition-colors disabled:opacity-50 ${
                active
                  ? "bg-white text-zinc-900 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {mode === "ref" ? (
        <ImageParamControl
          value={startValue}
          disabled={disabled}
          onChange={onChangeStart}
          inputClass={inputClass}
          compact={compact}
        />
      ) : null}

      {mode === "pair" ? (
        <div className={`grid grid-cols-2 ${compact ? "gap-1.5" : "gap-2"}`}>
          <div className="min-w-0">
            <p
              className={`mb-0.5 font-medium text-zinc-500 ${compact ? "text-[10px]" : "text-[11px]"}`}
            >
              首帧
            </p>
            <ImageParamControl
              value={startValue}
              disabled={disabled}
              onChange={onChangeStart}
              inputClass={inputClass}
              compact={compact}
            />
          </div>
          <div className="min-w-0">
            <p
              className={`mb-0.5 font-medium text-zinc-500 ${compact ? "text-[10px]" : "text-[11px]"}`}
            >
              尾帧
            </p>
            <ImageParamControl
              value={endValue}
              disabled={disabled}
              onChange={onChangeEnd}
              inputClass={inputClass}
              compact={compact}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Single image (e.g. video reference / Wan i2v). */
function ImageParamControl({
  value,
  disabled,
  hint,
  onChange,
  inputClass,
  compact,
}: {
  value: string;
  disabled?: boolean;
  hint?: string;
  onChange: (value: string) => void;
  inputClass: string;
  compact?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const hasValue = Boolean(value.trim());
  const preview = hasValue && isPreviewableImage(value) ? value : "";
  const isDataUri = value.startsWith("data:");
  const busy = Boolean(disabled) || uploading;
  const thumb = compact ? "h-12 w-12" : "h-16 w-16";

  const pickFile = () => fileRef.current?.click();

  return (
    <div className={compact ? "space-y-1" : "space-y-1.5"}>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        disabled={busy}
        className="hidden"
        onChange={(e) => {
          // Snapshot File before clearing — FileList is a live reference.
          const file = e.target.files?.[0] ?? null;
          e.target.value = "";
          if (!file) return;
          setUploading(true);
          void resolveLocalImage(file)
            .then((result) => onChange(result))
            .catch((err: unknown) => {
              window.alert(err instanceof Error ? err.message : "读取图片失败");
            })
            .finally(() => setUploading(false));
        }}
      />

      {uploading ? (
        <p className="text-[10px] text-zinc-500">上传中…</p>
      ) : null}

      {hasValue ? (
        <div
          className={`flex items-center gap-2 rounded border border-emerald-200 bg-emerald-50/70 ${compact ? "p-1.5" : "mt-0.5 items-start p-2"}`}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="参考图预览"
              className={`${thumb} shrink-0 rounded border border-emerald-100 bg-white object-cover`}
            />
          ) : (
            <div
              className={`flex ${thumb} shrink-0 items-center justify-center rounded border border-emerald-100 bg-white text-[10px] text-zinc-400`}
            >
              无预览
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p
              className={`font-medium text-emerald-800 ${compact ? "truncate text-[11px]" : "text-xs"}`}
            >
              {describeUploadedImage(value)}
            </p>
            {!isDataUri && value && !compact ? (
              <p className="mt-0.5 truncate font-mono text-[10px] text-zinc-500">
                {value}
              </p>
            ) : null}
            <div className={`flex flex-wrap gap-1 ${compact ? "mt-1" : "mt-1.5 gap-1.5"}`}>
              <button
                type="button"
                disabled={busy}
                onClick={pickFile}
                className={`rounded-md border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 ${compact ? "px-2 py-0.5 text-[11px]" : "px-3 py-1.5 text-sm"}`}
              >
                更换
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onChange("")}
                className={`rounded-md border border-zinc-300 bg-white text-zinc-500 hover:bg-zinc-50 disabled:opacity-50 ${compact ? "px-2 py-0.5 text-[11px]" : "px-3 py-1.5 text-sm"}`}
              >
                清除
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={pickFile}
            className={`shrink-0 rounded-md border border-dashed border-zinc-300 bg-white text-zinc-600 hover:border-zinc-400 hover:bg-zinc-50 disabled:opacity-50 ${compact ? "px-2.5 py-1 text-[11px]" : "px-3.5 py-1.5 text-sm"}`}
          >
            {uploading ? "上传中…" : "+ 上传"}
          </button>
          <input
            type="url"
            value=""
            disabled={busy}
            placeholder="或粘贴 URL"
            title={hint}
            onChange={(e) => onChange(e.target.value.trim())}
            className={inputClass}
          />
        </div>
      )}
    </div>
  );
}

/** Multi-image gallery: thumbnails + continuous add. */
function ImageListParamControl({
  value,
  disabled,
  hint,
  onChange,
  inputClass,
  max = 4,
  compact,
}: {
  value: string;
  disabled?: boolean;
  hint?: string;
  onChange: (value: string) => void;
  inputClass: string;
  max?: number;
  compact?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const items = parseImageList(value);
  const canAdd = items.length < max && !uploading;
  const thumb = compact ? "h-12 w-12" : "h-16 w-16";

  const commit = (next: string[]) => onChange(serializeImageList(next));

  const addFiles = async (files: File[]) => {
    if (!files.length) return;
    const room = max - items.length;
    if (room <= 0) {
      window.alert(`最多上传 ${max} 张参考图`);
      return;
    }
    const picked = files.slice(0, room);
    setUploading(true);
    try {
      const urls = await Promise.all(picked.map((f) => resolveLocalImage(f)));
      commit([...items, ...urls.filter(Boolean)]);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "读取图片失败");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={compact ? "space-y-1" : "space-y-1.5"}>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        multiple
        disabled={disabled || !canAdd}
        className="hidden"
        onChange={(e) => {
          // FileList is live — clear input AFTER copying, or length becomes 0.
          const files = e.target.files ? Array.from(e.target.files) : [];
          e.target.value = "";
          void addFiles(files);
        }}
      />

      <div className={`flex flex-wrap ${compact ? "gap-1.5" : "mt-0.5 gap-2"}`}>
        {items.map((src, index) => (
          <div
            key={`${index}-${src.slice(0, 24)}`}
            className={`group relative overflow-hidden rounded border border-zinc-200 bg-zinc-50 ${thumb}`}
          >
            {isPreviewableImage(src) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt={`参考图 ${index + 1}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[10px] text-zinc-400">
                #{index + 1}
              </div>
            )}
            <button
              type="button"
              disabled={disabled}
              title="删除"
              onClick={() => commit(items.filter((_, i) => i !== index))}
              className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/70 text-[10px] leading-none text-white opacity-80 hover:opacity-100 disabled:opacity-40"
            >
              ×
            </button>
          </div>
        ))}

        {canAdd && items.length > 0 ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => fileRef.current?.click()}
            className={`flex flex-col items-center justify-center rounded border border-dashed border-zinc-300 bg-white text-zinc-500 hover:border-zinc-400 hover:bg-zinc-50 disabled:opacity-50 ${thumb} ${compact ? "gap-0 text-[10px]" : "gap-0.5"}`}
          >
            <span className={compact ? "text-base leading-none" : "text-lg leading-none"}>
              +
            </span>
            {!compact ? <span className="text-[10px]">添加</span> : null}
          </button>
        ) : null}
      </div>

      {items.length > 0 ? (
        <p className="text-[10px] text-zinc-400">
          {items.length}/{max}
          {uploading ? " · 上传中…" : ""}
        </p>
      ) : uploading ? (
        <p className="text-[10px] text-zinc-400">上传中…</p>
      ) : null}

      {canAdd ? (
        <div className="flex items-center gap-1.5">
          {items.length === 0 ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => fileRef.current?.click()}
              className={`shrink-0 rounded-md border border-dashed border-zinc-300 bg-white text-zinc-600 hover:border-zinc-400 hover:bg-zinc-50 disabled:opacity-50 ${compact ? "px-2.5 py-1 text-[11px]" : "px-3.5 py-1.5 text-sm"}`}
            >
              + 添加
            </button>
          ) : null}
          <input
            ref={urlRef}
            type="url"
            disabled={disabled}
            placeholder={
              items.length === 0
                ? "或粘贴 URL 后回车"
                : "粘贴 URL 后回车"
            }
            title={hint}
            className={inputClass}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              const next = e.currentTarget.value.trim();
              if (!next) return;
              commit([...items, next]);
              e.currentTarget.value = "";
            }}
          />
          {!compact ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                const next = urlRef.current?.value.trim() ?? "";
                if (!next) return;
                commit([...items, next]);
                if (urlRef.current) urlRef.current.value = "";
              }}
              className="shrink-0 rounded-md border border-zinc-300 bg-white px-3.5 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
            >
              添加 URL
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function RunParamsFields({
  modality,
  values,
  onChange,
  disabled,
  provider,
  modelId,
  baseUrl,
  name,
  /** Preferred: model.defaults.api_format — drives image/video param schema. */
  apiFormat,
  /** When false, show a compact hint beside image upload fields. */
  objectStorageReady,
  /** Denser layout for image/video left rail. */
  compact,
}: {
  modality: string;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  disabled?: boolean;
  /** Used to filter provider-specific options (e.g. TTS voices). */
  provider?: string | null;
  modelId?: string | null;
  baseUrl?: string | null;
  /** Display name — helps detect 千问 even if provider=custom */
  name?: string | null;
  apiFormat?: string | null;
  objectStorageReady?: boolean | null;
  compact?: boolean;
}) {
  const providerHint = resolveProviderHint(provider, modelId, baseUrl, name);
  const formatFields = fieldsForApiFormat(apiFormat);
  const useFormat =
    formatFields.length > 0 &&
    (modality === "image" ||
      modality === "video" ||
      modality === "text" ||
      modality === "audio" ||
      modality === "music");

  const allFields = useFormat
    ? formatFields
    : (RUN_PARAM_FIELDS_BY_MODALITY[modality as RunParamModality] ??
      RUN_PARAM_FIELDS_BY_MODALITY.text);

  const fields = useFormat
    ? allFields.filter((field) => {
        if (!fieldMatchesModel(field, modelId)) return false;
        if (field.key === "instruction_custom") {
          return (values.instruction ?? "") === "__custom__";
        }
        return true;
      })
    : allFields.filter((field) => {
        if (!fieldMatchesProvider(field, providerHint)) return false;
        if (!fieldMatchesModel(field, modelId)) return false;
        if (field.key === "instruction_custom") {
          return (values.instruction ?? "") === "__custom__";
        }
        return true;
      });

  // Snap invalid selects back onto allowed options.
  useEffect(() => {
    for (const field of fields) {
      if (field.type !== "select" || !field.options?.length) continue;
      const options = filterFieldOptions(
        field.options,
        providerHint,
        modelId,
        !useFormat,
      );
      if (options.length === 0) continue;
      const current = values[field.key];
      if (current != null && options.some((o) => o.value === current)) continue;
      const preferred =
        options.find((o) => o.value === field.defaultValue) ??
        options.find((o) => o.value === "1920x1080") ??
        options.find((o) => o.value === "720p") ??
        options[0]!;
      if (preferred.value !== current) {
        onChange(field.key, preferred.value);
      }
    }
  }, [fields, values, onChange, providerHint, useFormat, modelId]);

  if (fields.length === 0) return null;

  const inputClass = "md-control md-control-sm";
  // Only show the object-storage tip once across image / image_list / image_pair.
  const firstImageFieldKey = fields.find(
    (f) =>
      f.type === "image" ||
      f.type === "image_list" ||
      f.type === "image_pair",
  )?.key;

  return (
    <div>
      {!compact ? (
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
          生成参数
        </p>
      ) : null}
      <div
        className={`grid ${compact ? "grid-cols-3 gap-x-1.5 gap-y-1" : "grid-cols-2 gap-x-2 gap-y-1.5"}`}
      >
        {fields.map((field) => {
          const options = filterFieldOptions(
            field.options,
            providerHint,
            modelId,
            !useFormat,
          );
          const rawValue = values[field.key] ?? field.defaultValue;
          const optionsMatch = options.some((o) => o.value === rawValue);
          const allowOrphan =
            field.key === "voice" ||
            field.key === "instruction" ||
            field.key === "instruction_custom";
          // Only snap select fields onto the option list; free-form values
          // (esp. base64 image lists) must never be reset to defaultValue.
          const value =
            field.type === "select"
              ? optionsMatch || !rawValue || allowOrphan
                ? rawValue
                : field.defaultValue
              : rawValue;
          const fieldDisabled = Boolean(disabled);
          const fieldHint = field.hint;
          const selectOptions =
            !optionsMatch && rawValue && allowOrphan
              ? [
                  ...options,
                  {
                    value: rawValue,
                    label: `${rawValue.slice(0, 24)}（当前）`,
                  } as RunParamOption,
                ]
              : options;
          const endKey =
            field.type === "image_pair"
              ? (field.endKey ?? "reference_image_end")
              : null;
          // Audio voice / emotion / instruction stay single-column in compact
          // so 音色·语速·情感 (or 风格) share one row.
          const isWide =
            field.type === "text" ||
            field.type === "textarea" ||
            field.type === "image" ||
            field.type === "image_list" ||
            field.type === "image_pair";
          const showStorageTip =
            (field.type === "image" ||
              field.type === "image_list" ||
              field.type === "image_pair") &&
            objectStorageReady === false &&
            field.key === firstImageFieldKey;

          const control =
            field.type === "select" ? (
              <select
                value={value}
                disabled={fieldDisabled}
                title={fieldHint}
                onChange={(e) => onChange(field.key, e.target.value)}
                className={`${inputClass}${fieldDisabled ? " cursor-not-allowed bg-zinc-100 text-zinc-500" : ""}`}
              >
                {selectOptions.map((opt) => (
                  <option key={opt.value || "__empty"} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : field.type === "boolean" ? (
              <select
                value={value === "true" ? "true" : "false"}
                disabled={fieldDisabled}
                title={fieldHint}
                onChange={(e) => onChange(field.key, e.target.value)}
                className={inputClass}
              >
                <option value="true">是</option>
                <option value="false">否</option>
              </select>
            ) : field.type === "number" ? (
              <input
                type="number"
                value={value}
                min={field.min}
                max={field.max}
                step={field.step}
                disabled={fieldDisabled}
                title={fieldHint}
                onChange={(e) => onChange(field.key, e.target.value)}
                className={`${inputClass} font-mono`}
              />
            ) : field.type === "textarea" ? (
              <textarea
                value={value}
                disabled={fieldDisabled}
                title={fieldHint}
                rows={compact ? 2 : 3}
                onChange={(e) => onChange(field.key, e.target.value)}
                className={inputClass}
              />
            ) : field.type === "image" ? (
              <ImageParamControl
                value={value}
                disabled={fieldDisabled}
                hint={fieldHint}
                onChange={(next) => onChange(field.key, next)}
                inputClass={inputClass}
                compact={compact}
              />
            ) : field.type === "image_list" ? (
              <ImageListParamControl
                value={value}
                disabled={fieldDisabled}
                hint={fieldHint}
                onChange={(next) => onChange(field.key, next)}
                inputClass={inputClass}
                max={field.max ?? 4}
                compact={compact}
              />
            ) : field.type === "image_pair" && endKey ? (
              <ImagePairParamControl
                key={`pair-${apiFormat ?? modality}-${modelId ?? ""}-${field.key}-${endKey}`}
                startValue={value}
                endValue={values[endKey] ?? ""}
                disabled={fieldDisabled}
                onChangeStart={(next) => onChange(field.key, next)}
                onChangeEnd={(next) => onChange(endKey, next)}
                inputClass={inputClass}
                compact={compact}
              />
            ) : (
              <input
                type="text"
                value={value}
                disabled={fieldDisabled}
                placeholder={fieldHint}
                title={fieldHint}
                onChange={(e) => onChange(field.key, e.target.value)}
                className={inputClass}
              />
            );

          const FieldTag = field.type === "image_pair" ? "div" : "label";

          return (
            <FieldTag
              key={`${field.type}-${field.key}`}
              className={`md-field ${compact ? "gap-0.5" : ""} ${
                isWide ? (compact ? "col-span-3" : "col-span-2") : ""
              }`}
            >
              <span className={`md-label${compact ? " text-[11px]" : ""}`}>
                {field.label}
              </span>
              {control}
              {showStorageTip ? (
                <span
                  className={`mt-0.5 block text-[10px] text-amber-700/90 ${compact ? "leading-tight" : "leading-snug"}`}
                >
                  {compact ? (
                    <>
                      未开对象存储，将以 base64 提交。
                      <Link
                        href="/settings"
                        className="underline hover:text-amber-900"
                      >
                        去设置
                      </Link>
                    </>
                  ) : (
                    <>
                      对象存储未启用，参考图将以 base64 提交；若上游要求公网
                      URL，请到{" "}
                      <Link
                        href="/settings"
                        className="underline hover:text-amber-900"
                      >
                        系统设置
                      </Link>{" "}
                      开启。
                      {fieldHint ? (
                        <span className="text-zinc-400"> · {fieldHint}</span>
                      ) : null}
                    </>
                  )}
                </span>
              ) : fieldHint &&
                !compact &&
                (field.type === "image" ||
                  field.type === "image_list" ||
                  field.type === "image_pair") ? (
                <span className="mt-0.5 block text-[10px] text-zinc-400">
                  {fieldHint}
                </span>
              ) : null}
            </FieldTag>
          );
        })}
      </div>
    </div>
  );
}
