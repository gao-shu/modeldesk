"use client";

import { ModalityFilter, modalityLabel } from "@modeldesk/model-registry/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArtifactDownloadButton } from "@/components/ArtifactDownloadButton";
import { AudioPlayer } from "@/components/AudioPlayer";
import { ImagePreviewModal } from "@/components/ImagePreviewModal";
import { PageHeader } from "@/components/PageHeader";

type ArtifactPublic = {
  id: string;
  type: string;
  uri: string;
  mime: string | null;
  url: string;
  createdAt: string;
  meta: Record<string, unknown>;
};

function isDownloadable(type: string) {
  return (
    type === "image" ||
    type === "video" ||
    type === "audio" ||
    type === "music" ||
    type === "text"
  );
}

function thumbUrl(url: string) {
  // Dedicated thumb route so broken sharp cannot break full-size /api/artifacts/[id].
  if (url.includes("/api/artifacts/") && !url.endsWith("/thumb")) {
    return `${url.replace(/\/?$/, "")}/thumb`;
  }
  return url;
}

/** Show first frame without autoplay; click enables controls + play. */
function VideoCardPreview({ id, url }: { id: string; url: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  async function start() {
    const el = ref.current;
    if (!el) return;
    setPlaying(true);
    el.muted = false;
    try {
      await el.play();
    } catch {
      // Ignore autoplay policy / abort; controls remain available.
    }
  }

  return (
    <div className="relative aspect-square w-full overflow-hidden bg-zinc-950">
      <video
        ref={ref}
        key={id}
        controls={playing}
        playsInline
        preload="metadata"
        muted={!playing}
        // #t=0.1 nudges browsers to decode & paint a preview frame.
        src={`${url}#t=0.1`}
        className="h-full w-full object-contain"
        onLoadedMetadata={(e) => {
          if (playing) return;
          const v = e.currentTarget;
          if (v.currentTime < 0.05) {
            try {
              v.currentTime = 0.1;
            } catch {
              // Some formats reject seek before enough data.
            }
          }
        }}
      />
      {!playing ? (
        <button
          type="button"
          onClick={() => void start()}
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/20 text-zinc-100 hover:bg-black/35"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/50 bg-black/40 text-lg backdrop-blur-sm">
            ▶
          </span>
          <span className="text-xs text-zinc-200">点击播放</span>
        </button>
      ) : null}
    </div>
  );
}

function ArtifactCardMedia({
  artifact,
  textPreview,
  onPreviewImage,
}: {
  artifact: ArtifactPublic;
  textPreview?: string;
  onPreviewImage: (url: string) => void;
}) {
  const { type, url, id } = artifact;

  if (type === "image") {
    return (
      <button
        type="button"
        onClick={() => onPreviewImage(url)}
        className="group block aspect-square w-full cursor-zoom-in overflow-hidden bg-zinc-100 transition-colors hover:bg-zinc-50"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbUrl(url)}
          alt={id}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-contain"
          onError={(e) => {
            const img = e.currentTarget;
            if (img.dataset.fallback === "1") return;
            img.dataset.fallback = "1";
            img.src = url;
          }}
        />
      </button>
    );
  }

  if (type === "video") {
    return <VideoCardPreview id={id} url={url} />;
  }

  if (type === "audio" || type === "music") {
    return (
      <div className="flex aspect-square w-full flex-col justify-center bg-zinc-50 px-2.5 py-3">
        <AudioPlayer
          src={url}
          preload="metadata"
          badge={type === "music" ? "曲" : "音"}
        />
      </div>
    );
  }

  if (type === "text") {
    // undefined = pending; "" = failed; non-empty = preview text
    const failed = textPreview === "";
    return (
      <div className="aspect-square w-full overflow-hidden bg-zinc-50 p-2.5 text-left">
        {textPreview ? (
          <pre className="h-full overflow-hidden text-[10px] leading-snug whitespace-pre-wrap text-zinc-700">
            {textPreview}
          </pre>
        ) : (
          <span className="flex h-full items-center justify-center text-xs text-zinc-400">
            {failed ? "无法预览" : "加载中…"}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex aspect-square w-full items-center justify-center bg-zinc-50 px-3 text-center text-xs text-zinc-400">
      类型「{type}」暂不支持预览
    </div>
  );
}

export default function GalleryPage() {
  const [artifacts, setArtifacts] = useState<ArtifactPublic[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>("text");
  const [textPreview, setTextPreview] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const qs = `?type=${encodeURIComponent(typeFilter)}&limit=24`;
    const res = await fetch(`/api/artifacts${qs}`);
    const data = (await res.json()) as {
      ok: boolean;
      artifacts?: ArtifactPublic[];
      error?: string;
    };
    if (!data.ok || !data.artifacts) {
      setError(data.error ?? "加载产物失败");
      return;
    }
    setArtifacts(data.artifacts);
  }, [typeFilter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (typeFilter !== "text" || artifacts.length === 0) return;
    let cancelled = false;

    void (async () => {
      // undefined = not attempted; "" = failed; non-empty = ok
      const pending = artifacts.filter((a) => textPreview[a.id] === undefined);
      if (pending.length === 0) return;

      const updates: Record<string, string> = {};
      await Promise.all(
        pending.map(async (a) => {
          const ctrl = new AbortController();
          const timer = window.setTimeout(() => ctrl.abort(), 12_000);
          try {
            const res = await fetch(a.url, { signal: ctrl.signal });
            if (cancelled) return;
            if (!res.ok) {
              updates[a.id] = "";
              return;
            }
            const text = await res.text();
            updates[a.id] = text.slice(0, 1200) || "(空文本)";
          } catch {
            if (!cancelled) updates[a.id] = "";
          } finally {
            window.clearTimeout(timer);
          }
        }),
      );
      if (cancelled || Object.keys(updates).length === 0) return;
      setTextPreview((prev) => ({ ...prev, ...updates }));
    })();

    return () => {
      cancelled = true;
    };
    // Only re-fetch when the artifact list / filter changes — not when previews update.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [artifacts, typeFilter]);

  return (
    <div>
      <PageHeader title="生成结果" />

      <ModalityFilter
        label="类型"
        value={typeFilter}
        onChange={setTypeFilter}
      />

      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

      {artifacts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-500">
          暂无结果
        </div>
      ) : (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-zinc-900">
            {modalityLabel(typeFilter)}
          </h2>
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(16rem,1fr))]">
            {artifacts.map((a) => {
              const createdAtLabel = new Date(a.createdAt).toLocaleString(
                "zh-CN",
                {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  hour12: false,
                },
              );
              return (
              <div
                key={a.id}
                className="overflow-hidden rounded-md border border-zinc-200 bg-white"
              >
                <ArtifactCardMedia
                  artifact={a}
                  textPreview={textPreview[a.id]}
                  onPreviewImage={setPreviewImage}
                />

                <div className="flex items-center justify-between gap-2 border-t border-zinc-100 px-2 py-1.5 text-[11px] text-zinc-500">
                  <span
                    className="min-w-0 truncate"
                    title={`${a.id} · ${createdAtLabel}`}
                  >
                    {a.id.slice(0, 8)}… · {createdAtLabel}
                  </span>
                  {isDownloadable(a.type) ? (
                    <ArtifactDownloadButton
                      artifactId={a.id}
                      className="shrink-0 text-[11px] text-zinc-600 underline hover:text-zinc-900 disabled:opacity-50"
                    />
                  ) : null}
                </div>
              </div>
              );
            })}
          </div>
        </section>
      )}

      {previewImage && (
        <ImagePreviewModal
          src={previewImage}
          alt="图片预览"
          onClose={() => setPreviewImage(null)}
        />
      )}
    </div>
  );
}
