"use client";

import { useState } from "react";

function extensionFromMime(mime: string | null | undefined): string {
  const m = (mime ?? "").toLowerCase();
  if (m.includes("mpeg") || m.includes("mp3")) return ".mp3";
  if (m.includes("wav")) return ".wav";
  if (m.includes("ogg")) return ".ogg";
  if (m.includes("webm")) return ".webm";
  if (m.includes("mp4") || m.includes("m4a")) return ".m4a";
  if (m.includes("flac")) return ".flac";
  if (m.includes("png")) return ".png";
  if (m.includes("jpeg") || m.includes("jpg")) return ".jpg";
  if (m.includes("webp")) return ".webp";
  if (m.includes("mp4") || m.includes("video")) return ".mp4";
  return "";
}

function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const utf = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf?.[1]) {
    try {
      return decodeURIComponent(utf[1].trim().replace(/^"|"$/g, ""));
    } catch {
      return utf[1].trim().replace(/^"|"$/g, "");
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain?.[1]?.trim() ?? null;
}

/** Force a real file download (avoids browser opening/playing audio/video inline). */
export async function downloadArtifactFile(
  artifactId: string,
  preferredName?: string,
): Promise<void> {
  const res = await fetch(
    `/api/artifacts/${encodeURIComponent(artifactId)}?download=1`,
  );
  if (!res.ok) {
    throw new Error(`下载失败（${res.status}）`);
  }
  const blob = await res.blob();
  const fromHeader = filenameFromDisposition(
    res.headers.get("Content-Disposition"),
  );
  const ext =
    extensionFromMime(blob.type) ||
    extensionFromMime(res.headers.get("Content-Type"));
  const name =
    preferredName ||
    fromHeader ||
    `${artifactId}${ext || ""}`;

  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Plain text download control for a saved artifact. */
export function ArtifactDownloadButton({
  artifactId,
  className,
  label = "下载",
}: {
  artifactId: string;
  modality?: string | null;
  className?: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        if (busy) return;
        setBusy(true);
        void downloadArtifactFile(artifactId)
          .catch((err: unknown) => {
            window.alert(err instanceof Error ? err.message : "下载失败");
          })
          .finally(() => setBusy(false));
      }}
      className={
        className ??
        "inline-flex items-center rounded-md border border-zinc-300 bg-white px-3.5 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      }
    >
      {busy ? "下载中…" : label}
    </button>
  );
}

/** Trigger browser downloads for multiple artifacts (staggered to reduce popup blocking). */
export async function downloadArtifacts(ids: string[]) {
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (!id) continue;
    try {
      await downloadArtifactFile(id);
    } catch {
      /* keep going for the rest */
    }
    if (i < ids.length - 1) {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}
