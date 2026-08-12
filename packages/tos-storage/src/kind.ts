import type { MediaKind } from "./types";
import { TEMP_PREFIX_BY_KIND } from "./types";

const IMAGE_EXT = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "bmp",
  "tif",
  "tiff",
  "heic",
  "avif",
]);
const VIDEO_EXT = new Set([
  "mp4",
  "webm",
  "mov",
  "mkv",
  "avi",
  "m4v",
  "mpeg",
  "mpg",
]);
const VOICE_EXT = new Set([
  "mp3",
  "wav",
  "m4a",
  "aac",
  "ogg",
  "flac",
  "opus",
  "wma",
]);

function extOf(filename?: string): string {
  if (!filename) return "";
  const base = filename.split(/[/\\]/).pop() ?? "";
  const i = base.lastIndexOf(".");
  if (i < 0) return "";
  return base.slice(i + 1).toLowerCase();
}

/**
 * Infer media kind from mime and/or filename.
 * Unknown → null (caller decides reject vs default).
 */
export function resolveMediaKind(input: {
  mime?: string | null;
  filename?: string | null;
}): MediaKind | null {
  const mime = (input.mime ?? "").toLowerCase().trim();
  const ext = extOf(input.filename ?? undefined);

  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "voice";

  if (IMAGE_EXT.has(ext)) return "image";
  if (VIDEO_EXT.has(ext)) return "video";
  if (VOICE_EXT.has(ext)) return "voice";

  return null;
}

/** Require a kind; unknown throws (safer than dumping into images/). */
export function requireMediaKind(input: {
  mime?: string | null;
  filename?: string | null;
  kind?: MediaKind | null;
}): MediaKind {
  if (input.kind) return input.kind;
  const resolved = resolveMediaKind(input);
  if (!resolved) {
    throw new Error(
      `无法识别媒体类型（mime=${input.mime ?? ""} file=${input.filename ?? ""}）。请显式传入 kind=image|video|voice`,
    );
  }
  return resolved;
}

export function extFromMimeOrName(
  mime: string | undefined,
  filename: string | undefined,
  kind: MediaKind,
): string {
  const fromName = extOf(filename);
  if (fromName) {
    if (fromName === "jpeg") return "jpg";
    return fromName;
  }
  const m = (mime ?? "").toLowerCase();
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  if (m.includes("webm")) return "webm";
  if (m.includes("mp4")) return "mp4";
  if (m.includes("wav")) return "wav";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("ogg")) return "ogg";
  if (kind === "video") return "mp4";
  if (kind === "voice") return "mp3";
  return "png";
}

export function defaultMimeForKind(kind: MediaKind, ext: string): string {
  if (kind === "image") {
    if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
    if (ext === "webp") return "image/webp";
    if (ext === "gif") return "image/gif";
    return "image/png";
  }
  if (kind === "video") {
    if (ext === "webm") return "video/webm";
    if (ext === "mov") return "video/quicktime";
    return "video/mp4";
  }
  if (ext === "wav") return "audio/wav";
  if (ext === "ogg") return "audio/ogg";
  if (ext === "m4a" || ext === "aac") return "audio/mp4";
  return "audio/mpeg";
}

export function buildObjectKey(input: {
  kind: MediaKind;
  ext: string;
  id: string;
  now?: Date;
}): string {
  const d = input.now ?? new Date();
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const prefix = TEMP_PREFIX_BY_KIND[input.kind];
  const ext = input.ext.replace(/^\./, "").toLowerCase() || "bin";
  return `${prefix}/${y}/${mo}/${input.id}.${ext}`;
}

export function toTosUri(bucket: string, key: string): string {
  return `tos://${bucket}/${key.replace(/^\/+/, "")}`;
}
