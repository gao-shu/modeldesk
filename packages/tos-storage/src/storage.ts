import { randomUUID } from "node:crypto";
import { ACLType, TosClient } from "@volcengine/tos-sdk";
import { assertTosConfig, tosConfigFromEnv } from "./config";
import {
  buildObjectKey,
  defaultMimeForKind,
  extFromMimeOrName,
  requireMediaKind,
  toTosUri,
} from "./kind";
import type {
  MediaKind,
  TosConfig,
  UploadInput,
  UploadResult,
} from "./types";

export type TosStorage = {
  readonly config: TosConfig;
  isConfigured(): boolean;
  uploadBytes(input: UploadInput): Promise<UploadResult>;
  uploadFile(file: {
    arrayBuffer: () => Promise<ArrayBuffer>;
    type?: string;
    name?: string;
  }, kind?: MediaKind): Promise<UploadResult>;
  /**
   * Ensure a public HTTPS URL.
   * - https?:// → passthrough
   * - data: / raw base64 → upload then return publicUrl
   * - tos://bucket/key → map to publicUrl (no re-upload)
   */
  ensurePublicUrl(
    value: string | null | undefined,
    opts?: { kind?: MediaKind; mime?: string },
  ): Promise<string | undefined>;
};

function parseDataUrl(
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

function parseTosUri(
  value: string,
): { bucket: string; key: string } | null {
  const m = /^tos:\/\/([^/]+)\/(.+)$/i.exec(value.trim());
  if (!m) return null;
  return { bucket: m[1]!, key: m[2]! };
}

export function createTosStorage(config: TosConfig): TosStorage {
  const client = new TosClient({
    accessKeyId: config.accessKey,
    accessKeySecret: config.secretKey,
    region: config.region,
    endpoint: config.endpoint,
  });

  async function uploadBytes(input: UploadInput): Promise<UploadResult> {
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
    const publicRead = input.publicRead !== false;

    await client.putObject({
      bucket: config.bucket,
      key,
      body: bytes,
      contentType: mime,
      ...(publicRead ? { acl: ACLType.ACLPublicRead } : {}),
    });

    const publicUrl = `${config.publicBaseUrl}/${key}`;
    return {
      bucket: config.bucket,
      key,
      kind,
      mime,
      tosUri: toTosUri(config.bucket, key),
      publicUrl,
      url: publicUrl,
    };
  }

  async function uploadFile(
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

  async function ensurePublicUrl(
    value: string | null | undefined,
    opts?: { kind?: MediaKind; mime?: string },
  ): Promise<string | undefined> {
    if (!value?.trim()) return undefined;
    const v = value.trim();
    if (/^https?:\/\//i.test(v)) return v;

    const tos = parseTosUri(v);
    if (tos) {
      if (tos.bucket !== config.bucket) {
        throw new Error(
          `tos:// URI bucket mismatch: ${tos.bucket} !== ${config.bucket}`,
        );
      }
      return `${config.publicBaseUrl}/${tos.key}`;
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
  }

  return {
    config,
    isConfigured: () => true,
    uploadBytes,
    uploadFile,
    ensurePublicUrl,
  };
}

/** Create from env; returns null when TOS_* incomplete. */
export function createTosStorageFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): TosStorage | null {
  const cfg = tosConfigFromEnv(env);
  if (!cfg) return null;
  return createTosStorage(cfg);
}

/** Create from env or throw. */
export function requireTosStorage(
  env: NodeJS.ProcessEnv = process.env,
): TosStorage {
  return createTosStorage(assertTosConfig(tosConfigFromEnv(env)));
}
