/**
 * Real S3-compatible smoke upload (MinIO / AWS / gateway).
 * Usage (from repo root, with apps/web/.env.local or env set):
 *   STORAGE_PROVIDER=s3 pnpm --filter @modeldesk/object-storage smoke:s3
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createObjectStorageFromEnv } from "../src/index";

function loadEnvLocal() {
  const candidates = [
    resolve(process.cwd(), "../../apps/web/.env.local"),
    resolve(process.cwd(), "apps/web/.env.local"),
    resolve(process.cwd(), ".env.local"),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 0) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
    console.log(`loaded env from ${p}`);
    return;
  }
}

loadEnvLocal();
if (!process.env.STORAGE_PROVIDER) process.env.STORAGE_PROVIDER = "s3";

const storage = createObjectStorageFromEnv();
if (storage.provider !== "s3" || !storage.isConfigured()) {
  console.error(
    JSON.stringify({
      ok: false,
      provider: storage.provider,
      configured: storage.isConfigured(),
      hint: "Set STORAGE_PROVIDER=s3 and S3_BUCKET / S3_ACCESS_KEY / S3_SECRET_KEY",
    }),
  );
  process.exit(1);
}

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC",
  "base64",
);

const image = await storage.uploadBytes({
  bytes: TINY_PNG,
  mime: "image/png",
  filename: "smoke.png",
  kind: "image",
});

console.log(
  JSON.stringify({
    provider: storage.provider,
    key: image.key,
    uri: image.uri,
    publicUrl: image.publicUrl,
  }),
);

if (!image.key.startsWith("temp/images/")) {
  throw new Error(`bad key prefix: ${image.key}`);
}

const res = await fetch(image.publicUrl);
console.log(
  JSON.stringify({
    fetchStatus: res.status,
    ok: res.status === 200,
    contentType: res.headers.get("content-type"),
  }),
);
if (res.status !== 200) {
  throw new Error(
    `public URL fetch failed: ${res.status} (check ACL / bucket policy / S3_PUBLIC_BASE_URL)`,
  );
}
console.log("smoke:s3 ALL OK");
