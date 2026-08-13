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
import { createPortal } from "react-dom";
import { ImagePreviewModal } from "./ImagePreviewModal";

/** Soft cap for local reference images (UI / React state). Not a universal vendor limit. */
const MAX_REF_IMAGE_BYTES = 6 * 1024 * 1024;
/** Skip canvas recompress when already small enough for snappy React state. */
const SKIP_COMPRESS_BYTES = 800 * 1024;
const MAX_IMAGE_EDGE = 2048;

/**
 * Prefer a public object-storage URL when configured (some video APIs need fetchable URL).
 * Falls back to data URI when STORAGE_PROVIDER=none / not configured.
 * Large phone photos are resized/compressed so they still preview and submit.
 */
async function resolveLocalImage(file: File): Promise<string> {
  const prepared = await prepareLocalImage(file);
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
  if (!configured) return prepared.dataUrl;

  const fd = new FormData();
  fd.append("file", prepared.uploadBlob, prepared.uploadName);
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

function assertImageFile(file: File) {
  const okType =
    /^image\/(png|jpeg|jpg|webp)$/i.test(file.type) ||
    /\.(png|jpe?g|webp)$/i.test(file.name);
  if (!okType) {
    throw new Error("请选择 PNG / JPEG / WebP 图片（不支持 HEIC 等格式）");
  }
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === "string" ? reader.result : "");
    };
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(blob);
  });
}

/** Downscale + JPEG compress until under MAX_REF_IMAGE_BYTES. */
async function compressImageFile(
  file: File,
): Promise<{ dataUrl: string; blob: Blob }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("无法解码该图片，请换一张 PNG / JPEG / WebP");
  }
  try {
    let { width, height } = bitmap;
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(width, height, 1));
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法处理图片");
    ctx.drawImage(bitmap, 0, 0, width, height);

    let quality = 0.85;
    let blob: Blob | null = null;
    for (let i = 0; i < 8; i++) {
      blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );
      if (blob && blob.size <= MAX_REF_IMAGE_BYTES) break;
      quality *= 0.72;
    }
    if (!blob || blob.size > MAX_REF_IMAGE_BYTES) {
      throw new Error(
        "图片过大，压缩后仍超过 6MB，请换一张更小的图或先缩小后再传",
      );
    }
    return { dataUrl: await blobToDataUrl(blob), blob };
  } finally {
    bitmap.close();
  }
}

async function prepareLocalImage(file: File): Promise<{
  dataUrl: string;
  uploadBlob: Blob;
  uploadName: string;
}> {
  assertImageFile(file);
  if (file.size <= SKIP_COMPRESS_BYTES) {
    const dataUrl = await blobToDataUrl(file);
    if (!dataUrl.startsWith("data:image/")) {
      throw new Error("读取图片失败：不是有效的图片数据");
    }
    return { dataUrl, uploadBlob: file, uploadName: file.name || "ref.png" };
  }
  const compressed = await compressImageFile(file);
  return {
    dataUrl: compressed.dataUrl,
    uploadBlob: compressed.blob,
    uploadName: "ref.jpg",
  };
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
  if (
    bits.includes("xiaomimimo") ||
    bits.includes("mimo-v2.5-tts") ||
    bits.includes("小米") ||
    (bits.includes("mimo") && bits.includes("tts"))
  ) {
    return `${provider ?? ""} xiaomi-mimo mimo`;
  }
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

/** Seedance 2.5 allows duration up to 30s; other Seedance 2.x stay at field.max. */
function rangeBounds(
  field: RunParamField,
  modelId: string | null | undefined,
): { min: number; max: number; step: number } {
  const min = field.min ?? 0;
  let max = field.max ?? 100;
  const step = field.step ?? 1;
  if (field.key === "duration_sec" || field.key === "duration") {
    const mid = (modelId ?? "").toLowerCase();
    if (mid.includes("2-5") || mid.includes("2.5")) {
      max = Math.max(max, 30);
    }
  }
  return { min, max, step };
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

/**
 * Thumbnail with hover enlarge via portal (avoids overflow clipping).
 * Click opens fullscreen preview. Floating hover: no white border; capped beside thumb.
 */
function ImageHoverThumb({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className: string;
}) {
  const thumbRef = useRef<HTMLImageElement>(null);
  const [hover, setHover] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [box, setBox] = useState<{
    top: number;
    left: number;
    maxW: number;
    maxH: number;
  } | null>(null);

  const place = () => {
    const el = thumbRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 10;
    const margin = 8;
    const max = 360;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = r.right + gap;
    let top = r.top;
    if (left + max > vw - margin) {
      left = r.left - max - gap;
    }
    if (left < margin) left = margin;
    if (top + max > vh - margin) {
      top = Math.max(margin, vh - max - margin);
    }
    if (top < margin) top = margin;

    setBox({ top, left, maxW: max, maxH: max });
  };

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={thumbRef}
        src={src}
        alt={alt}
        role="button"
        tabIndex={0}
        title="悬停预览 · 点击全屏"
        className={`${className} cursor-zoom-in`}
        onMouseEnter={() => {
          if (fullscreen) return;
          place();
          setHover(true);
        }}
        onMouseLeave={() => setHover(false)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setHover(false);
          setFullscreen(true);
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          setHover(false);
          setFullscreen(true);
        }}
      />
      {hover && !fullscreen && box && typeof document !== "undefined"
        ? createPortal(
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt=""
              aria-hidden
              className="pointer-events-none fixed z-[200] object-contain shadow-2xl"
              style={{
                top: box.top,
                left: box.left,
                maxWidth: box.maxW,
                maxHeight: box.maxH,
                width: "auto",
                height: "auto",
                border: "none",
                background: "transparent",
                padding: 0,
                borderRadius: 4,
              }}
            />,
            document.body,
          )
        : null}
      {fullscreen ? (
        <ImagePreviewModal
          src={src}
          alt={alt}
          onClose={() => setFullscreen(false)}
        />
      ) : null}
    </>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return blobToDataUrl(file);
}

async function resolveLocalAudio(file: File): Promise<string> {
  const okType =
    /^audio\/(mpeg|mp3|wav|x-wav|mp4|m4a|aac|ogg|webm)$/i.test(file.type) ||
    /\.(mp3|wav|m4a|aac|ogg|webm)$/i.test(file.name);
  if (!okType) {
    throw new Error("请选择 MP3 / WAV / M4A / AAC / OGG / WebM 音频");
  }
  if (file.size > 20 * 1024 * 1024) {
    throw new Error("音频不能超过 20MB");
  }

  let configured = false;
  try {
    const status = await fetch("/api/upload", { cache: "no-store" });
    const statusData = (await status.json()) as {
      configured?: boolean;
      tosConfigured?: boolean;
    };
    configured = Boolean(statusData.configured ?? statusData.tosConfigured);
  } catch {
    configured = false;
  }
  if (!configured) {
    throw new Error(
      "参考音频需要公网 URL。请到「系统设置」开启对象存储后再上传，或直接粘贴公网链接。",
    );
  }

  const fd = new FormData();
  fd.append("file", file, file.name);
  fd.append("kind", "voice");
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  const data = (await res.json()) as {
    ok: boolean;
    url?: string;
    error?: string;
  };
  if (!res.ok || !data.ok || !data.url) {
    throw new Error(data.error ?? "音频上传失败");
  }
  return data.url;
}

/** Soft cap for MiMo voiceclone reference audio (official ≤10MB). */
const MAX_REF_AUDIO_BYTES = 10 * 1024 * 1024;

async function resolveLocalAudioAsDataUrl(file: File): Promise<string> {
  const okType =
    /^audio\/(mpeg|mp3|wav|x-wav)$/i.test(file.type) ||
    /\.(mp3|wav)$/i.test(file.name);
  if (!okType) {
    throw new Error("请选择 MP3 或 WAV 音频");
  }
  if (file.size > MAX_REF_AUDIO_BYTES) {
    throw new Error("参考音频不能超过 10MB");
  }
  return readFileAsDataUrl(file);
}

function describeUploadedAudio(value: string): string {
  if (value.startsWith("data:")) {
    const m = /^data:(audio\/[\w+.-]+);base64,/i.exec(value);
    const kind = (m?.[1] ?? "audio").replace(/^audio\//i, "").toUpperCase();
    const approxKb = Math.max(1, Math.round((value.length * 0.75) / 1024));
    return `${kind} · 约 ${approxKb} KB · 已上传`;
  }
  if (/^https?:\/\//i.test(value)) {
    try {
      return `公网 URL · ${new URL(value).hostname}`;
    } catch {
      return "公网 URL · 已填写";
    }
  }
  return "已填写";
}

/**
 * Single reference audio → data URI (MiMo voiceclone) or paste URL.
 * Does not require object storage.
 */
function AudioParamControl({
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
  const [urlDraft, setUrlDraft] = useState("");
  const hasValue = Boolean(value.trim());
  const busy = Boolean(disabled) || uploading;

  const clear = () => onChange("");

  const addFiles = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setUploading(true);
    try {
      onChange(await resolveLocalAudioAsDataUrl(file));
      setUrlDraft("");
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "上传音频失败");
    } finally {
      setUploading(false);
    }
  };

  const commitUrl = (raw: string) => {
    const next = raw.trim();
    if (!next) return;
    if (
      !/^https?:\/\//i.test(next) &&
      !/^data:audio\//i.test(next)
    ) {
      window.alert("请填写 http(s) 公网 URL 或 data:audio/...;base64,...");
      return;
    }
    onChange(next);
    setUrlDraft("");
  };

  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      <input
        ref={fileRef}
        type="file"
        accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,.mp3,.wav"
        disabled={busy}
        className="hidden"
        onChange={(e) => {
          const files = e.target.files ? Array.from(e.target.files) : [];
          e.target.value = "";
          void addFiles(files);
        }}
      />
      {hasValue ? (
        <div className="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50/60 px-2 py-1.5">
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-700">
            {describeUploadedAudio(value)}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={clear}
            className="shrink-0 rounded border border-zinc-300 bg-white px-2 py-0.5 text-[11px] text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
          >
            清除
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {uploading ? "读取中…" : "上传 mp3/wav"}
          </button>
          <input
            type="text"
            value={urlDraft}
            disabled={busy}
            placeholder="或粘贴公网 URL / data URI"
            title={hint}
            onChange={(e) => setUrlDraft(e.target.value)}
            onBlur={() => commitUrl(urlDraft)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitUrl(urlDraft);
              }
            }}
            className={`${inputClass} min-w-[12rem] flex-1`}
          />
        </div>
      )}
      {hint ? (
        <p className={`text-zinc-400 ${compact ? "text-[10px]" : "text-[11px]"}`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Multi audio refs as JSON string array (Seedance reference_audio).
 * Requires object-storage public URL (Ark cannot fetch data URI audio).
 */
function AudioListParamControl({
  value,
  disabled,
  onChange,
  inputClass,
  max = 3,
  compact,
}: {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  inputClass: string;
  max?: number;
  compact?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const items = parseImageList(value);

  const commit = (next: string[]) => onChange(serializeImageList(next));

  const removeAt = (index: number) => {
    const next = items.slice();
    next.splice(index, 1);
    commit(next);
  };

  const addUrl = (raw: string) => {
    const url = raw.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      window.alert("请填写 http(s) 公网音频 URL");
      return;
    }
    if (items.length >= max) {
      window.alert(`最多 ${max} 段参考音频`);
      return;
    }
    commit([...items, url]);
    setUrlDraft("");
  };

  const addFiles = async (files: File[]) => {
    if (!files.length) return;
    const room = max - items.length;
    if (room <= 0) {
      window.alert(`最多 ${max} 段参考音频`);
      return;
    }
    setUploading(true);
    try {
      const urls = await Promise.all(
        files.slice(0, room).map((f) => resolveLocalAudio(f)),
      );
      commit([...items, ...urls.filter(Boolean)]);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "上传音频失败");
    } finally {
      setUploading(false);
    }
  };

  const busy = Boolean(disabled) || uploading;

  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      <div
        className={`font-medium text-zinc-500 ${compact ? "text-[10px]" : "text-[11px]"}`}
      >
        参考音频
        <span className="ml-1 font-normal text-zinc-400">
          （最多 {max}；须同时有参考图）
        </span>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/aac,audio/ogg,audio/webm,.mp3,.wav,.m4a,.aac,.ogg,.webm"
        multiple
        disabled={busy || items.length >= max}
        className="hidden"
        onChange={(e) => {
          const files = e.target.files ? Array.from(e.target.files) : [];
          e.target.value = "";
          void addFiles(files);
        }}
      />
      {items.length > 0 ? (
        <ul className="space-y-1">
          {items.map((url, index) => (
            <li
              key={`${index}-${url.slice(0, 48)}`}
              className="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50/60 px-2 py-1.5"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-700">
                音频 {index + 1} · {url}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => removeAt(index)}
                className="shrink-0 rounded border border-zinc-300 bg-white px-2 py-0.5 text-[11px] text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
              >
                删除
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {items.length < max ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className={`rounded-md border border-dashed border-zinc-300 bg-white text-zinc-600 hover:border-zinc-400 hover:bg-zinc-50 disabled:opacity-50 ${compact ? "px-2.5 py-1 text-[11px]" : "px-3.5 py-1.5 text-sm"}`}
          >
            {uploading ? "上传中…" : "上传音频"}
          </button>
          <input
            type="url"
            value={urlDraft}
            disabled={busy}
            placeholder="或粘贴音频 URL 后回车"
            onChange={(e) => setUrlDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              addUrl(urlDraft);
            }}
            onBlur={() => {
              if (urlDraft.trim()) addUrl(urlDraft);
            }}
            className={`${inputClass} min-w-[12rem] flex-1`}
          />
        </div>
      ) : null}
    </div>
  );
}

type ImagePairMode = "none" | "ref" | "pair" | "refs";

function deriveImagePairMode(
  start: string,
  end: string,
  listRaw: string,
): ImagePairMode {
  if (parseImageList(listRaw).length > 0) return "refs";
  if (end.trim()) return "pair";
  if (start.trim()) return "ref";
  return "none";
}

/** Video reference input: none / single ref / first+last / multi refs (optional). */
  function ImagePairParamControl({
  startValue,
  endValue,
  listValue,
  listMax,
  audioListValue,
  audioListMax,
  allowMultiRefs,
  allowPair = true,
  audioOnlyInRefsMode = false,
  refModeLabel = "参考图",
  disabled,
  onChangeStart,
  onChangeEnd,
  onChangeList,
  onChangeAudioList,
  inputClass,
  compact,
}: {
  startValue: string;
  endValue: string;
  listValue?: string;
  listMax?: number;
  audioListValue?: string;
  audioListMax?: number;
  allowMultiRefs?: boolean;
  /** When false, hide「首尾帧」(e.g. Grok I2V + R2V only). */
  allowPair?: boolean;
  /** MiniMax H3：参考音频只在「多参」下出现，不与首帧/首尾帧混用. */
  audioOnlyInRefsMode?: boolean;
  /** Single-image mode tab label (Grok:「首帧图」). */
  refModeLabel?: string;
  disabled?: boolean;
  onChangeStart: (value: string) => void;
  onChangeEnd: (value: string) => void;
  onChangeList?: (value: string) => void;
  onChangeAudioList?: (value: string) => void;
  inputClass: string;
  compact?: boolean;
}) {
  const listRaw = listValue ?? "";
  const audioRaw = audioListValue ?? "";
  const [mode, setMode] = useState<ImagePairMode>(() =>
    deriveImagePairMode(startValue, endValue, listRaw),
  );

  useEffect(() => {
    if (parseImageList(listRaw).length > 0) {
      setMode("refs");
      return;
    }
    if (allowPair && endValue.trim()) {
      setMode("pair");
      return;
    }
    if (startValue.trim()) {
      setMode((prev) => (allowPair && prev === "pair" ? "pair" : "ref"));
    }
  }, [startValue, endValue, listRaw, allowPair]);

  const clearList = () => {
    if (listRaw && onChangeList) onChangeList("");
  };

  const clearAudio = () => {
    if (audioRaw && onChangeAudioList) onChangeAudioList("");
  };

  const setModeAndValues = (next: ImagePairMode) => {
    setMode(next);
    if (next === "none") {
      if (startValue) onChangeStart("");
      if (endValue) onChangeEnd("");
      clearList();
      clearAudio();
      return;
    }
    if (next === "ref") {
      if (endValue) onChangeEnd("");
      clearList();
      if (audioOnlyInRefsMode) clearAudio();
      return;
    }
    if (next === "pair") {
      clearList();
      if (audioOnlyInRefsMode) clearAudio();
      return;
    }
    if (next === "refs") {
      if (startValue) onChangeStart("");
      if (endValue) onChangeEnd("");
    }
  };

  const modes: { id: ImagePairMode; label: string }[] = [
    { id: "none", label: "无" },
    { id: "ref", label: refModeLabel },
    ...(allowPair ? [{ id: "pair" as const, label: "首尾帧" }] : []),
    ...(allowMultiRefs ? [{ id: "refs" as const, label: "多参" }] : []),
  ];

  const showAudio =
    Boolean(onChangeAudioList) &&
    (audioOnlyInRefsMode
      ? mode === "refs"
      : mode === "ref" || mode === "pair" || mode === "refs");

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
        <div className={compact ? "space-y-1.5" : "space-y-2"}>
          <div>
            <div
              className={`mb-0.5 text-[10px] font-medium text-zinc-500 ${compact ? "" : ""}`}
            >
              首帧
            </div>
            <ImageParamControl
              value={startValue}
              disabled={disabled}
              onChange={onChangeStart}
              inputClass={inputClass}
              compact={compact}
            />
          </div>
          <div>
            <div className="mb-0.5 text-[10px] font-medium text-zinc-500">
              尾帧
            </div>
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

      {mode === "refs" && onChangeList ? (
        <ImageListParamControl
          value={listRaw}
          disabled={disabled}
          onChange={onChangeList}
          inputClass={inputClass}
          max={listMax ?? 9}
          compact={compact}
        />
      ) : null}

      {showAudio && onChangeAudioList ? (
        <AudioListParamControl
          value={audioRaw}
          disabled={disabled}
          onChange={onChangeAudioList}
          inputClass={inputClass}
          max={audioListMax ?? 3}
          compact={compact}
        />
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
  const [localError, setLocalError] = useState<string | null>(null);
  /** Instant blob preview while FileReader / compress / TOS upload runs. */
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  // Draft so typing a URL does not flip into preview on the first character.
  const [urlDraft, setUrlDraft] = useState("");
  const hasValue = Boolean(value.trim());
  const valuePreview = hasValue && isPreviewableImage(value) ? value : "";
  const preview = localPreview || valuePreview;
  const showFilled = hasValue || Boolean(localPreview);
  const isDataUri = value.startsWith("data:");
  const busy = Boolean(disabled) || uploading;
  const thumb = compact ? "h-12 w-12" : "h-16 w-16";

  const revokeLocalPreview = () => {
    setLocalPreview((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
  };

  useEffect(() => {
    if (valuePreview) revokeLocalPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only sync when committed value is previewable
  }, [valuePreview]);

  useEffect(() => {
    return () => {
      if (localPreview?.startsWith("blob:")) URL.revokeObjectURL(localPreview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickFile = () => fileRef.current?.click();

  const commitUrlDraft = () => {
    const next = urlDraft.trim();
    if (!next) return;
    setLocalError(null);
    revokeLocalPreview();
    onChange(next);
    setUrlDraft("");
  };

  const handleFile = (file: File) => {
    setLocalError(null);
    const blobUrl = URL.createObjectURL(file);
    setLocalPreview((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return blobUrl;
    });
    setUploading(true);
    void resolveLocalImage(file)
      .then((result) => {
        onChange(result);
      })
      .catch((err: unknown) => {
        revokeLocalPreview();
        const message = err instanceof Error ? err.message : "读取图片失败";
        setLocalError(message);
      })
      .finally(() => setUploading(false));
  };

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
          handleFile(file);
        }}
      />

      {uploading ? (
        <p className="text-[10px] text-zinc-500">处理图片中…</p>
      ) : null}

      {localError ? (
        <p className="text-[10px] text-red-600">{localError}</p>
      ) : null}

      {showFilled ? (
        <div
          className={`flex items-center gap-2 rounded border border-emerald-200 bg-emerald-50/70 ${compact ? "p-1.5" : "mt-0.5 items-start p-2"}`}
        >
          {preview ? (
            <ImageHoverThumb
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
              {uploading && !hasValue
                ? "处理中…"
                : hasValue
                  ? describeUploadedImage(value)
                  : "已选择"}
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
                onClick={() => {
                  setLocalError(null);
                  revokeLocalPreview();
                  onChange("");
                }}
                className={`rounded-md border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 ${compact ? "px-2 py-0.5 text-[11px]" : "px-3 py-1.5 text-sm"}`}
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
            {uploading ? "处理中…" : "+ 上传"}
          </button>
          <input
            type="url"
            value={urlDraft}
            disabled={busy}
            placeholder="或粘贴 URL 后回车"
            title={hint}
            onChange={(e) => setUrlDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              commitUrlDraft();
            }}
            onBlur={commitUrlDraft}
            className={inputClass}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Multi-image refs as numbered slots (not one shared "append URL" box).
 * Shows filled slots + one empty next slot; each slot is upload OR paste URL.
 */
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
  const multiFileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const items = parseImageList(value);
  const slotCount = Math.min(max, items.length + (items.length < max ? 1 : 0));

  const commit = (next: string[]) => onChange(serializeImageList(next));

  const setSlot = (index: number, nextValue: string) => {
    const trimmed = nextValue.trim();
    const nextItems = items.slice();
    if (index < nextItems.length) {
      if (!trimmed) nextItems.splice(index, 1);
      else nextItems[index] = trimmed;
    } else if (trimmed && index === nextItems.length) {
      nextItems.push(trimmed);
    }
    commit(nextItems);
  };

  const addFiles = async (files: File[]) => {
    if (!files.length) return;
    const room = max - items.length;
    if (room <= 0) {
      window.alert(`最多 ${max} 张参考图`);
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
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      <input
        ref={multiFileRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        multiple
        disabled={disabled || uploading || items.length >= max}
        className="hidden"
        onChange={(e) => {
          const files = e.target.files ? Array.from(e.target.files) : [];
          e.target.value = "";
          void addFiles(files);
        }}
      />

      <div
        className={`grid ${compact ? "grid-cols-2 gap-1.5" : "grid-cols-2 gap-2"}`}
      >
        {Array.from({ length: slotCount }, (_, index) => {
          const filled = index < items.length;
          return (
            <div
              key={filled ? `filled-${index}` : `empty-${index}`}
              className="min-w-0 rounded-md border border-zinc-200 bg-zinc-50/60 p-1.5"
            >
              <div className="mb-1 flex items-center justify-between gap-1">
                <p
                  className={`font-medium text-zinc-500 ${compact ? "text-[10px]" : "text-[11px]"}`}
                >
                  参考图 {index + 1}
                  {!filled ? (
                    <span className="font-normal text-zinc-400"> · 待添加</span>
                  ) : null}
                </p>
              </div>
              <ImageParamControl
                value={items[index] ?? ""}
                disabled={disabled || uploading}
                hint={hint}
                onChange={(v) => setSlot(index, v)}
                inputClass={inputClass}
                compact={compact}
              />
            </div>
          );
        })}
      </div>

      <div
        className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${compact ? "text-[10px]" : "text-[11px]"} text-zinc-400`}
      >
        <span>
          {items.length}/{max}
          {uploading ? " · 上传中…" : ""}
        </span>
        {items.length < max && !uploading ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => multiFileRef.current?.click()}
            className="text-zinc-600 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900 disabled:opacity-50"
          >
            一次多选本地图
          </button>
        ) : null}
      </div>
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

  // Snap invalid selects; clamp range when model max changes (e.g. 2.5 → 2.0).
  useEffect(() => {
    for (const field of fields) {
      if (field.type === "range") {
        const { min, max } = rangeBounds(field, modelId);
        const raw = values[field.key] ?? field.defaultValue;
        if (raw === "-1") continue;
        const n = Number(raw);
        if (!Number.isFinite(n)) {
          onChange(field.key, field.defaultValue);
          continue;
        }
        const clamped = Math.min(max, Math.max(min, Math.round(n)));
        if (String(clamped) !== String(raw)) {
          onChange(field.key, String(clamped));
        }
        continue;
      }
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
            field.type === "range" ||
            field.type === "image" ||
            field.type === "image_list" ||
            field.type === "image_pair" ||
            field.type === "audio";
          const showStorageTip =
            (field.type === "image" ||
              field.type === "image_list" ||
              field.type === "image_pair") &&
            objectStorageReady === false &&
            field.key === firstImageFieldKey;

          const bounds =
            field.type === "range"
              ? rangeBounds(field, modelId)
              : null;
          const rangeAuto = field.type === "range" && value === "-1";
          const rangeSliderValue = (() => {
            if (!bounds) return 0;
            const n = Number(value);
            if (!Number.isFinite(n) || n < 0) return bounds.min;
            return Math.min(bounds.max, Math.max(bounds.min, Math.round(n)));
          })();

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
            ) : field.type === "range" && bounds ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <input
                  type="range"
                  min={bounds.min}
                  max={bounds.max}
                  step={bounds.step}
                  value={rangeSliderValue}
                  disabled={fieldDisabled || rangeAuto}
                  title={fieldHint}
                  onChange={(e) => onChange(field.key, e.target.value)}
                  className="min-w-0 flex-1 accent-zinc-900 disabled:opacity-40"
                />
                <span className="w-10 shrink-0 text-right font-mono text-xs text-zinc-800">
                  {rangeAuto ? "自动" : `${rangeSliderValue}s`}
                </span>
                <label
                  className={`flex shrink-0 items-center gap-1 text-zinc-600 ${
                    compact ? "text-[11px]" : "text-xs"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={rangeAuto}
                    disabled={fieldDisabled}
                    onChange={(e) =>
                      onChange(
                        field.key,
                        e.target.checked
                          ? "-1"
                          : String(
                              Number.isFinite(Number(field.defaultValue))
                                ? field.defaultValue
                                : bounds.min,
                            ),
                      )
                    }
                  />
                  自动
                </label>
              </div>
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
            ) : field.type === "audio" ? (
              <AudioParamControl
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
                key={`pair-${apiFormat ?? modality}-${modelId ?? ""}-${field.key}-${endKey}-${field.listKey ?? ""}-${field.audioListKey ?? ""}`}
                startValue={value}
                endValue={values[endKey] ?? ""}
                listValue={
                  field.listKey ? (values[field.listKey] ?? "") : undefined
                }
                listMax={field.listMax}
                audioListValue={
                  field.audioListKey
                    ? (values[field.audioListKey] ?? "")
                    : undefined
                }
                audioListMax={field.audioListMax}
                allowMultiRefs={Boolean(field.listKey?.trim())}
                allowPair={field.allowPair !== false}
                audioOnlyInRefsMode={Boolean(field.audioOnlyInRefsMode)}
                refModeLabel={field.refModeLabel}
                disabled={fieldDisabled}
                onChangeStart={(next) => onChange(field.key, next)}
                onChangeEnd={(next) => onChange(endKey, next)}
                onChangeList={
                  field.listKey
                    ? (next) => onChange(field.listKey!, next)
                    : undefined
                }
                onChangeAudioList={
                  field.audioListKey
                    ? (next) => onChange(field.audioListKey!, next)
                    : undefined
                }
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

          // image / image_list / image_pair contain a hidden <input type="file">.
          // Wrapping them in <label> makes clicks on 删除 / 更换 / 缩略图 also
          // activate the file picker (label → first form control).
          const FieldTag =
            field.type === "image" ||
            field.type === "image_list" ||
            field.type === "image_pair"
              ? "div"
              : "label";

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
