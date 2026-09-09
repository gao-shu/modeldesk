import {
  CLOUD_STORAGE_PROVIDERS,
  isCloudStorageProvider,
  type CloudStorageProvider,
} from "@modeldesk/object-storage";
import {
  encryptSecret,
  decryptSecret,
  isEncryptionConfigured,
  maskEncryptedSecret,
} from "./crypto";
import { getDb, nowIso } from "./db";

type ConfigRow = {
  provider: string;
  bucket: string;
  region: string;
  endpoint: string;
  access_key_enc: string | null;
  secret_key_enc: string | null;
  public_base_url: string;
  force_path_style: number;
  skip_acl: number;
  updated_at: string;
};

/** Plaintext fields for write (secrets optional = keep existing). */
export type ObjectStorageConfigInput = {
  bucket?: string;
  region?: string;
  endpoint?: string;
  /** Omit / empty / null → keep previous ciphertext. */
  accessKey?: string | null;
  secretKey?: string | null;
  publicBaseUrl?: string;
  forcePathStyle?: boolean;
  skipAcl?: boolean;
};

/** Decrypted config for server-side drivers (never send to client). */
export type ObjectStorageConfigSecrets = {
  provider: CloudStorageProvider;
  bucket: string;
  region: string;
  endpoint: string;
  accessKey: string;
  secretKey: string;
  publicBaseUrl: string;
  forcePathStyle: boolean;
  skipAcl: boolean;
  updatedAt: string;
};

/** Safe for API / UI — secrets masked only. */
export type ObjectStorageConfigPublic = {
  provider: CloudStorageProvider;
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyMasked: string | null;
  secretKeyMasked: string | null;
  hasAccessKey: boolean;
  hasSecretKey: boolean;
  publicBaseUrl: string;
  forcePathStyle: boolean;
  skipAcl: boolean;
  /** bucket + both keys present. */
  ready: boolean;
  updatedAt: string | null;
};

function emptyPublic(provider: CloudStorageProvider): ObjectStorageConfigPublic {
  return {
    provider,
    bucket: "",
    region: "",
    endpoint: "",
    accessKeyMasked: null,
    secretKeyMasked: null,
    hasAccessKey: false,
    hasSecretKey: false,
    publicBaseUrl: "",
    forcePathStyle: false,
    skipAcl: false,
    ready: false,
    updatedAt: null,
  };
}

function toPublic(row: ConfigRow): ObjectStorageConfigPublic {
  const provider = row.provider as CloudStorageProvider;
  const hasAccessKey = Boolean(row.access_key_enc);
  const hasSecretKey = Boolean(row.secret_key_enc);
  const bucket = row.bucket?.trim() ?? "";
  return {
    provider,
    bucket,
    region: row.region ?? "",
    endpoint: row.endpoint ?? "",
    accessKeyMasked: maskEncryptedSecret(row.access_key_enc),
    secretKeyMasked: maskEncryptedSecret(row.secret_key_enc),
    hasAccessKey,
    hasSecretKey,
    publicBaseUrl: row.public_base_url ?? "",
    forcePathStyle: row.force_path_style === 1,
    skipAcl: row.skip_acl === 1,
    ready: Boolean(bucket && hasAccessKey && hasSecretKey),
    updatedAt: row.updated_at,
  };
}

function assertProvider(provider: string): CloudStorageProvider {
  if (!isCloudStorageProvider(provider)) {
    throw new Error("无效的对象存储提供商");
  }
  return provider;
}

function requireEncryption() {
  if (!isEncryptionConfigured()) {
    throw new Error(
      "ENCRYPTION_SECRET is not set. Open Settings to generate one",
    );
  }
}

function getRow(provider: CloudStorageProvider): ConfigRow | undefined {
  return getDb()
    .prepare(`SELECT * FROM object_storage_configs WHERE provider = ?`)
    .get(provider) as ConfigRow | undefined;
}

function tryDecrypt(enc: string | null | undefined): string {
  if (!enc) return "";
  try {
    return decryptSecret(enc);
  } catch {
    return "";
  }
}

/** List all cloud providers (missing rows → empty public shape). */
export function listObjectStorageConfigs(): ObjectStorageConfigPublic[] {
  return CLOUD_STORAGE_PROVIDERS.map((provider) => {
    const row = getRow(provider);
    return row ? toPublic(row) : emptyPublic(provider);
  });
}

export function getObjectStorageConfigPublic(
  provider: string,
): ObjectStorageConfigPublic {
  const p = assertProvider(provider);
  const row = getRow(p);
  return row ? toPublic(row) : emptyPublic(p);
}

/**
 * Decrypted credentials for building a driver.
 * Returns null when no row or not ready (missing bucket/keys).
 */
export function getObjectStorageConfigSecrets(
  provider: string,
): ObjectStorageConfigSecrets | null {
  const p = assertProvider(provider);
  const row = getRow(p);
  if (!row) return null;
  const bucket = row.bucket?.trim() ?? "";
  const accessKey = tryDecrypt(row.access_key_enc);
  const secretKey = tryDecrypt(row.secret_key_enc);
  if (!bucket || !accessKey || !secretKey) return null;
  return {
    provider: p,
    bucket,
    region: row.region ?? "",
    endpoint: row.endpoint ?? "",
    accessKey,
    secretKey,
    publicBaseUrl: row.public_base_url ?? "",
    forcePathStyle: row.force_path_style === 1,
    skipAcl: row.skip_acl === 1,
    updatedAt: row.updated_at,
  };
}

export function upsertObjectStorageConfig(
  provider: string,
  input: ObjectStorageConfigInput,
): ObjectStorageConfigPublic {
  const p = assertProvider(provider);
  const existing = getRow(p);
  const ts = nowIso();

  const nextAccessKey = input.accessKey?.trim() ?? "";
  const nextSecretKey = input.secretKey?.trim() ?? "";
  if (nextAccessKey || nextSecretKey) {
    requireEncryption();
  }

  let accessKeyEnc = existing?.access_key_enc ?? null;
  let secretKeyEnc = existing?.secret_key_enc ?? null;
  if (nextAccessKey) {
    accessKeyEnc = encryptSecret(nextAccessKey);
  }
  if (nextSecretKey) {
    secretKeyEnc = encryptSecret(nextSecretKey);
  }

  const bucket =
    input.bucket !== undefined
      ? input.bucket.trim()
      : (existing?.bucket ?? "");
  const region =
    input.region !== undefined
      ? input.region.trim()
      : (existing?.region ?? "");
  const endpoint =
    input.endpoint !== undefined
      ? input.endpoint.trim()
      : (existing?.endpoint ?? "");
  const publicBaseUrl =
    input.publicBaseUrl !== undefined
      ? input.publicBaseUrl.trim()
      : (existing?.public_base_url ?? "");
  const forcePathStyle =
    input.forcePathStyle !== undefined
      ? input.forcePathStyle
      : existing?.force_path_style === 1;
  const skipAcl =
    input.skipAcl !== undefined ? input.skipAcl : existing?.skip_acl === 1;

  getDb()
    .prepare(
      `INSERT INTO object_storage_configs (
         provider, bucket, region, endpoint,
         access_key_enc, secret_key_enc, public_base_url,
         force_path_style, skip_acl, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(provider) DO UPDATE SET
         bucket = excluded.bucket,
         region = excluded.region,
         endpoint = excluded.endpoint,
         access_key_enc = excluded.access_key_enc,
         secret_key_enc = excluded.secret_key_enc,
         public_base_url = excluded.public_base_url,
         force_path_style = excluded.force_path_style,
         skip_acl = excluded.skip_acl,
         updated_at = excluded.updated_at`,
    )
    .run(
      p,
      bucket,
      region,
      endpoint,
      accessKeyEnc,
      secretKeyEnc,
      publicBaseUrl,
      forcePathStyle ? 1 : 0,
      skipAcl ? 1 : 0,
      ts,
    );

  return getObjectStorageConfigPublic(p);
}

export function deleteObjectStorageConfig(provider: string): boolean {
  const p = assertProvider(provider);
  const result = getDb()
    .prepare(`DELETE FROM object_storage_configs WHERE provider = ?`)
    .run(p);
  return result.changes > 0;
}
