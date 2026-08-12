import {
  isCloudStorageProvider,
  type CloudStorageProvider,
} from "@modeldesk/object-storage";
import { getDb, nowIso } from "./db";

const KEY_ENABLED = "object_storage.enabled";
const KEY_PROVIDER = "object_storage.provider";

export type ObjectStoragePrefs = {
  /** UI switch — off by default. */
  enabled: boolean;
  /** Selected cloud provider when enabled. */
  provider: CloudStorageProvider;
};

function getSetting(key: string): string | null {
  const row = getDb()
    .prepare(`SELECT value FROM app_settings WHERE key = ?`)
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function setSetting(key: string, value: string) {
  getDb()
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(key, value, nowIso());
}

export function getObjectStoragePrefs(): ObjectStoragePrefs {
  const enabledRaw = getSetting(KEY_ENABLED);
  const providerRaw = getSetting(KEY_PROVIDER);
  const provider =
    providerRaw && isCloudStorageProvider(providerRaw) ? providerRaw : "tos";
  return {
    enabled: enabledRaw === "1" || enabledRaw === "true",
    provider,
  };
}

export function setObjectStoragePrefs(input: {
  enabled: boolean;
  provider: CloudStorageProvider;
}): ObjectStoragePrefs {
  if (!isCloudStorageProvider(input.provider)) {
    throw new Error("无效的对象存储提供商");
  }
  setSetting(KEY_ENABLED, input.enabled ? "1" : "0");
  setSetting(KEY_PROVIDER, input.provider);
  return getObjectStoragePrefs();
}
