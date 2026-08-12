/**
 * App-level object-storage helpers — thin wrapper over `@modeldesk/object-storage`.
 * Runtime: Settings UI prefs (SQLite) + credentials from DB (preferred) or env.
 */
import {
  CLOUD_STORAGE_PROVIDERS,
  createNoneStorage,
  createObjectStorageForProvider,
  createObjectStorageFromCloudConfig,
  providerCredentialsReady,
  type MediaKind,
  type ObjectStorage,
  type StorageProvider,
  type UploadResult,
} from "@modeldesk/object-storage";
import { getObjectStorageConfigSecrets } from "./object-storage-configs";
import { getObjectStoragePrefs } from "./object-storage-prefs";

export type { MediaKind, ObjectStorage, StorageProvider, UploadResult };

export type CredentialSource = "db" | "env" | "none";

let cached: ObjectStorage | null = null;
let cachedKey: string | null = null;

function resolveCredentialSource(
  provider: StorageProvider,
): CredentialSource {
  if (provider === "none") return "none";
  if (getObjectStorageConfigSecrets(provider)) return "db";
  if (providerCredentialsReady(provider)) return "env";
  return "none";
}

function cacheKey(): string {
  const prefs = getObjectStoragePrefs();
  if (!prefs.enabled) return "off";
  const secrets = getObjectStorageConfigSecrets(prefs.provider);
  if (secrets) return `on:db:${prefs.provider}:${secrets.updatedAt}`;
  return `on:env:${prefs.provider}`;
}

/**
 * Active storage driver.
 * Priority when enabled: SQLite credentials → env → unready stub.
 */
export function getObjectStorage(): ObjectStorage {
  const key = cacheKey();
  if (!cached || cachedKey !== key) {
    const prefs = getObjectStoragePrefs();
    if (!prefs.enabled) {
      cached = createNoneStorage();
    } else {
      const secrets = getObjectStorageConfigSecrets(prefs.provider);
      cached = secrets
        ? createObjectStorageFromCloudConfig(prefs.provider, secrets)
        : createObjectStorageForProvider(prefs.provider);
    }
    cachedKey = key;
  }
  return cached;
}

export function resetObjectStorageCache() {
  cached = null;
  cachedKey = null;
}

/** True when uploads can produce a public https URL. */
export function isObjectStorageConfigured(): boolean {
  return getObjectStorage().isConfigured();
}

/** @deprecated Prefer isObjectStorageConfigured */
export function isTosConfigured(): boolean {
  return isObjectStorageConfigured();
}

export function getObjectStorageRuntimeStatus() {
  const prefs = getObjectStoragePrefs();
  const storage = getObjectStorage();
  const source = prefs.enabled
    ? resolveCredentialSource(prefs.provider)
    : "none";
  return {
    enabled: prefs.enabled,
    selectedProvider: prefs.provider,
    provider: storage.provider,
    configured: storage.isConfigured(),
    credentialSource: source,
    providers: CLOUD_STORAGE_PROVIDERS.map((provider) => {
      const dbReady = Boolean(getObjectStorageConfigSecrets(provider));
      const envReady = providerCredentialsReady(provider);
      return {
        provider,
        ready: dbReady || envReady,
        source: (dbReady ? "db" : envReady ? "env" : "none") as CredentialSource,
      };
    }),
  };
}

function toLegacyUpload(result: UploadResult): {
  url: string;
  key: string;
  tosUri: string;
  kind: MediaKind;
} {
  return {
    url: result.publicUrl,
    key: result.key,
    tosUri: result.tosUri ?? result.uri,
    kind: result.kind,
  };
}

export async function uploadBytesToObjectStorage(input: {
  bytes: Buffer;
  mime: string;
  filename?: string;
  kind?: MediaKind;
}): Promise<{ url: string; key: string; tosUri: string; kind: MediaKind }> {
  const result = await getObjectStorage().uploadBytes(input);
  return toLegacyUpload(result);
}

/** @deprecated Prefer uploadBytesToObjectStorage */
export async function uploadBytesToTos(input: {
  bytes: Buffer;
  mime: string;
  filename?: string;
  kind?: MediaKind;
}): Promise<{ url: string; key: string; tosUri: string; kind: MediaKind }> {
  return uploadBytesToObjectStorage(input);
}

export async function uploadFileToObjectStorage(
  file: {
    arrayBuffer: () => Promise<ArrayBuffer>;
    type?: string;
    name?: string;
  },
  kind?: MediaKind,
): Promise<{ url: string; key: string; tosUri: string; kind: MediaKind }> {
  const result = await getObjectStorage().uploadFile(file, kind);
  return toLegacyUpload(result);
}

/** @deprecated Prefer uploadFileToObjectStorage */
export async function uploadFileToTos(
  file: {
    arrayBuffer: () => Promise<ArrayBuffer>;
    type?: string;
    name?: string;
  },
  kind?: MediaKind,
): Promise<{ url: string; key: string; tosUri: string; kind: MediaKind }> {
  return uploadFileToObjectStorage(file, kind);
}

export async function ensurePublicImageUrl(
  value: string | undefined | null,
): Promise<string | undefined> {
  if (!value?.trim()) return undefined;
  const v = value.trim();
  if (/^https?:\/\//i.test(v)) return v;
  return getObjectStorage().ensurePublicUrl(v, { kind: "image" });
}
