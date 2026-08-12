import { randomUUID } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  buildObjectKey,
  defaultMimeForKind,
  extFromMimeOrName,
  requireMediaKind,
} from "@modeldesk/tos-storage";
import type { S3Config } from "./s3-config";
import type {
  EnsurePublicUrlOpts,
  MediaKind,
  ObjectStorage,
  UploadInput,
  UploadResult,
} from "./types";

function toS3Uri(bucket: string, key: string): string {
  return `s3://${bucket}/${key.replace(/^\/+/, "")}`;
}

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

function parseS3Uri(value: string): { bucket: string; key: string } | null {
  const m = /^s3:\/\/([^/]+)\/(.+)$/i.exec(value.trim());
  if (!m) return null;
  return { bucket: m[1]!, key: m[2]! };
}

export function createS3Storage(config: S3Config): ObjectStorage {
  const client = new S3Client({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
    ...(config.endpoint
      ? {
          endpoint: config.endpoint,
          forcePathStyle: config.forcePathStyle,
        }
      : {}),
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

    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: bytes,
        ContentType: mime,
        ...(publicRead && config.objectAcl
          ? { ACL: config.objectAcl }
          : {}),
      }),
    );

    const publicUrl = `${config.publicBaseUrl}/${key}`;
    const uri = toS3Uri(config.bucket, key);
    return {
      bucket: config.bucket,
      key,
      kind,
      mime,
      uri,
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
    opts?: EnsurePublicUrlOpts,
  ): Promise<string | undefined> {
    if (!value?.trim()) return undefined;
    const v = value.trim();
    if (/^https?:\/\//i.test(v)) return v;

    const s3 = parseS3Uri(v);
    if (s3) {
      if (s3.bucket !== config.bucket) {
        throw new Error(
          `s3:// URI bucket mismatch: ${s3.bucket} !== ${config.bucket}`,
        );
      }
      return `${config.publicBaseUrl}/${s3.key}`;
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
    provider: "s3",
    isConfigured: () => true,
    uploadBytes,
    uploadFile,
    ensurePublicUrl,
  };
}
