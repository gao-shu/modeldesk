/**
 * Resolve ENCRYPTION_SECRET for local / future exe builds.
 * Priority: process env → `{dataDir}/.encryption-secret` (generated).
 * All callers should go through this module (not Next pages).
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ensureDataDirs, getDataDir } from "./paths";

const SECRET_FILENAME = ".encryption-secret";

export type EncryptionSecretSource = "env" | "file" | "none";

export function getEncryptionSecretPath(): string {
  return path.join(getDataDir(), SECRET_FILENAME);
}

function readSecretFile(): string | null {
  try {
    const filePath = getEncryptionSecretPath();
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8").trim();
    return raw || null;
  } catch {
    return null;
  }
}

/** Plaintext secret for crypto; never expose via HTTP. */
export function resolveEncryptionSecret(): string | null {
  const fromEnv = process.env.ENCRYPTION_SECRET?.trim();
  if (fromEnv) return fromEnv;
  return readSecretFile();
}

export function getEncryptionSecretStatus(): {
  configured: boolean;
  source: EncryptionSecretSource;
  filePath: string;
} {
  const filePath = getEncryptionSecretPath();
  if (process.env.ENCRYPTION_SECRET?.trim()) {
    return { configured: true, source: "env", filePath };
  }
  if (readSecretFile()) {
    return { configured: true, source: "file", filePath };
  }
  return { configured: false, source: "none", filePath };
}

/**
 * Create `{dataDir}/.encryption-secret` when missing.
 * Never overwrites — changing the secret would invalidate encrypted DB fields.
 */
export function generateEncryptionSecretIfMissing(): {
  created: boolean;
  source: EncryptionSecretSource;
  filePath: string;
} {
  const current = getEncryptionSecretStatus();
  if (current.configured) {
    return {
      created: false,
      source: current.source,
      filePath: current.filePath,
    };
  }

  ensureDataDirs();
  const filePath = getEncryptionSecretPath();
  const secret = randomBytes(32).toString("base64url");
  fs.writeFileSync(filePath, `${secret}\n`, { encoding: "utf8", mode: 0o600 });

  return { created: true, source: "file", filePath };
}
