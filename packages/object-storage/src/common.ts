import { randomUUID } from "node:crypto";
import {
  buildObjectKey,
  defaultMimeForKind,
  extFromMimeOrName,
  requireMediaKind,
} from "@modeldesk/tos-storage";
import type {
  EnsurePublicUrlOpts,
  MediaKind,
  UploadInput,
  UploadResult,
} from "./types";

export function parseDataUrl(
  dataUrl: string,
): { bytes: Buffer; mime: string } | null {
  const m = /^data:([\w/+.-]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!m) return null;
  try {
    return { bytes: Buffer.from(m[2]!, "base64"), mime: m[1]! };
  } catch {
    return null;
  }
}

export function parseSchemeUri(
  scheme: string,
  value: string,
): { bucket: string; key: string } | null {
  const m = new RegExp(`^${scheme}:\\/\\/([^/]+)\\/(.+)$`, "i").exec(
    value.trim(),
  );
  if (!m) return null;
  return { bucket: m[1]!, key: m[2]! };
}

export function toSchemeUri(
  scheme: string,
  bucket: string,
  key: string,
): string {
  return `${scheme}://${bucket}/${key.replace(/^\/+/, "")}`;
}

export function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function prepareUpload(input: UploadInput): {
  bytes: Buffer;
  kind: MediaKind;
  mime: string;
  key: string;
  publicRead: boolean;
} {
  const bytes = Buffer.isBuffer(input.bytes)
    ? input.bytes
    : Buffer.from(input.bytes);
  const kind = requireMediaKind({
    mime: input.mime,
    filename: input.filename,
    kind: input.kind,
  });
  const ext = extFromMimeOrName(input.mime, input.filename, kind);
  const mime =
    (input.mime && input.mime !== "application/octet-stream"
      ? input.mime
      : defaultMimeForKind(kind, ext)) || defaultMimeForKind(kind, ext);
  const key = buildObjectKey({ kind, ext, id: randomUUID() });
  return {
    bytes,
    kind,
    mime,
    key,
    publicRead: input.publicRead !== false,
  };
}

export function makeEnsurePublicUrl(input: {
  scheme: string;
  bucket: string;
  publicBaseUrl: string;
  uploadBytes: (body: UploadInput) => Promise<UploadResult>;
}): (
  value: string | null | undefined,
  opts?: EnsurePublicUrlOpts,
) => Promise<string | undefined> {
  const { scheme, bucket, publicBaseUrl, uploadBytes } = input;
  return async (value, opts) => {
    if (!value?.trim()) return undefined;
    const v = value.trim();
    if (/^https?:\/\//i.test(v)) return v;

    const parsedUri = parseSchemeUri(scheme, v);
    if (parsedUri) {
      if (parsedUri.bucket !== bucket) {
        throw new Error(
          `${scheme}:// URI bucket mismatch: ${parsedUri.bucket} !== ${bucket}`,
        );
      }
      return `${publicBaseUrl}/${parsedUri.key}`;
    }

    if (v.startsWith("data:")) {
      const parsed = parseDataUrl(v);
      if (!parsed) throw new Error("无效的 data URI");
      const uploaded = await uploadBytes({
        bytes: parsed.bytes,
        mime: opts?.mime ?? parsed.mime,
        kind: opts?.kind,
      });
      return uploaded.publicUrl;
    }

    if (v.length >= 64 && !/\s/.test(v)) {
      const uploaded = await uploadBytes({
        bytes: Buffer.from(v, "base64"),
        mime: opts?.mime ?? "image/png",
        kind: opts?.kind ?? "image",
      });
      return uploaded.publicUrl;
    }

    return v;
  };
}

export async function uploadFileViaBytes(
  uploadBytes: (input: UploadInput) => Promise<UploadResult>,
  file: {
    arrayBuffer: () => Promise<ArrayBuffer>;
    type?: string;
    name?: string;
  },
  kind?: MediaKind,
): Promise<UploadResult> {
  const bytes = Buffer.from(await file.arrayBuffer());
  return uploadBytes({
    bytes,
    mime: file.type || "application/octet-stream",
    filename: file.name,
    kind,
  });
}
