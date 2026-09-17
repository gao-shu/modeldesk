"use client";

import { useState } from "react";
import { ArtifactDownloadButton } from "@/components/ArtifactDownloadButton";
import { AudioPlayer } from "@/components/AudioPlayer";
import { ImagePreviewModal } from "@/components/ImagePreviewModal";
import { VideoPlayer } from "@/components/VideoPlayer";
import type { CompareSlotState } from "@/lib/client/compare-session";

function artifactUrl(id: string) {
  return `/api/artifacts/${id}`;
}

function formatLatency(ms: number | null | undefined): string | null {
  if (ms == null) return null;
  if (ms >= 10_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms}ms`;
}

function statusLabel(status: CompareSlotState["status"]): string {
  switch (status) {
    case "idle":
      return "待命";
    case "queued":
      return "排队中";
    case "running":
      return "运行中";
    case "success":
      return "完成";
    case "error":
      return "失败";
    case "cancelled":
      return "已取消";
    default:
      return status;
  }
}

function statusDotClass(status: CompareSlotState["status"]): string {
  switch (status) {
    case "success":
      return "bg-emerald-500";
    case "error":
      return "bg-red-500";
    case "cancelled":
      return "bg-zinc-400";
    case "running":
    case "queued":
      return "bg-amber-500 animate-pulse";
    default:
      return "bg-zinc-300";
  }
}

function MediaBody({
  modality,
  slot,
  onImageClick,
}: {
  modality: string;
  slot: CompareSlotState;
  onImageClick: (url: string) => void;
}) {
  const { artifactId, artifactIds, output } = slot;
  if (artifactId && modality === "image") {
    const allIds =
      artifactIds && artifactIds.length > 1 ? artifactIds : [artifactId];
    return (
      <div className="grid min-h-[8rem] flex-1 grid-cols-1 gap-2 overflow-auto bg-zinc-50/80 p-2">
        {allIds.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onImageClick(artifactUrl(id))}
            className="flex cursor-zoom-in items-center justify-center"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={artifactUrl(id)}
              alt="生成内容"
              className="max-h-48 max-w-full rounded-md object-contain"
            />
          </button>
        ))}
      </div>
    );
  }
  if (artifactId && (modality === "audio" || modality === "music")) {
    return (
      <div className="flex flex-1 items-center justify-center px-3 py-4">
        <AudioPlayer
          src={artifactUrl(artifactId)}
          preload="metadata"
          className="w-full"
          badge={modality === "music" ? "曲" : "音"}
        />
      </div>
    );
  }
  if (artifactId && modality === "video") {
    return (
      <VideoPlayer
        src={artifactUrl(artifactId)}
        wrapperClassName="flex min-h-[10rem] flex-1 flex-col gap-2 overflow-hidden bg-zinc-50/80 p-2"
        className="rounded-md object-contain"
      />
    );
  }
  return (
    <div className="min-h-[8rem] flex-1 overflow-auto bg-zinc-50 p-3">
      {output ? (
        <pre className="whitespace-pre-wrap break-words font-mono text-xs text-zinc-800">
          {output}
        </pre>
      ) : (
        <div className="flex h-full min-h-[6rem] items-center justify-center text-xs text-zinc-400">
          {slot.statusMsg || "等待结果…"}
        </div>
      )}
    </div>
  );
}

export function CompareResultCard({
  modality,
  slot,
  disabledActions,
  onUse,
}: {
  modality: string;
  slot: CompareSlotState;
  disabledActions?: boolean;
  onUse: () => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const metrics: { label: string; value: string }[] = [];
  const latency = formatLatency(slot.latencyMs);
  if (latency) metrics.push({ label: "Latency", value: latency });
  if (slot.ttftMs != null) {
    metrics.push({ label: "TTFT", value: formatLatency(slot.ttftMs)! });
  }
  if (slot.inputTokens != null) {
    metrics.push({ label: "In", value: `${slot.inputTokens}` });
  }
  if (slot.outputTokens != null) {
    metrics.push({ label: "Out", value: `${slot.outputTokens}` });
  }

  async function copyResult() {
    const text = slot.output?.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }

  const canCopyText = Boolean(slot.output?.trim()) && modality === "text";
  const canDownload = Boolean(slot.artifactId);

  return (
    <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-zinc-900">
            {slot.modelName || slot.modelId}
          </div>
          <div className="truncate font-mono text-[11px] text-zinc-400">
            {slot.modelId}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-xs text-zinc-600">
          <span
            className={`inline-block h-2 w-2 rounded-full ${statusDotClass(slot.status)}`}
            aria-hidden
          />
          <span>{statusLabel(slot.status)}</span>
        </div>
      </div>

      {slot.error ? (
        <div className="border-b border-red-100 bg-red-50 px-3 py-2 text-xs text-red-800">
          <div className="font-medium">Error</div>
          <div className="mt-0.5 break-words">{slot.error}</div>
        </div>
      ) : null}

      <MediaBody
        modality={modality}
        slot={slot}
        onImageClick={setPreview}
      />

      {metrics.length > 0 ? (
        <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-zinc-100 px-3 py-2 text-[11px] text-zinc-600">
          {metrics.map((m) => (
            <span key={m.label}>
              <span className="text-zinc-400">{m.label}</span> {m.value}
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 border-t border-zinc-100 px-3 py-2">
        {canCopyText ? (
          <button
            type="button"
            disabled={disabledActions}
            onClick={() => void copyResult()}
            className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {copied ? "已复制" : "Copy result"}
          </button>
        ) : null}
        {canDownload && slot.artifactId ? (
          <ArtifactDownloadButton
            artifactId={slot.artifactId}
            className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
          />
        ) : null}
        <button
          type="button"
          disabled={disabledActions || !slot.modelId}
          onClick={onUse}
          className="rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          Use this model
        </button>
      </div>

      {preview ? (
        <ImagePreviewModal
          src={preview}
          alt="预览"
          onClose={() => setPreview(null)}
        />
      ) : null}
    </div>
  );
}
