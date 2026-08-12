import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import {
  getEncryptionSecretStatus,
  resolveEncryptionSecret,
} from "./encryption-secret";

const ALGO = "aes-256-gcm";

let cachedKey: Buffer | null = null;

export function isEncryptionConfigured(): boolean {
  return getEncryptionSecretStatus().configured;
}

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = resolveEncryptionSecret();
  if (!secret) {
    throw new Error(
      "ENCRYPTION_SECRET is not set. Open Settings to generate one, or set it in .env.local",
    );
  }
  cachedKey = createHash("sha256").update(secret).digest();
  return cachedKey;
}

/** Encrypt plaintext API key for DB storage. Format: v1:<iv>:<tag>:<cipher> (base64) */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSecret(payload: string): string {
  const [version, ivB64, tagB64, dataB64] = payload.split(":");
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid encrypted secret format");
  }
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/** Mask for UI: sk-****abcd (keeps last 4 chars when long enough). */
export function maskSecret(plaintext: string | null | undefined): string | null {
  if (!plaintext) return null;
  if (plaintext.length <= 4) return "****";
  const prefix = plaintext.startsWith("sk-") ? "sk-" : "";
  return `${prefix}****${plaintext.slice(-4)}`;
}

export function maskEncryptedSecret(
  encrypted: string | null | undefined,
): string | null {
  if (!encrypted) return null;
  // List/detail UIs only need "has a key" affordance — do not decrypt on every row.
  return "••••••••";
}
