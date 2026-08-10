/**
 * Real TOS smoke upload for temp/images|videos|voice.
 * Usage (from repo root, with apps/web/.env.local loaded manually or env set):
 *   pnpm --filter @modeldesk/tos-storage smoke:upload
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createTosStorageFromEnv } from "../src/index";

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

const storage = createTosStorageFromEnv();
if (!storage) {
  console.error("TOS not configured");
  process.exit(1);
}

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC",
  "base64",
);
// Minimal-ish placeholders (not real decodable media; enough for object PUT + GET).
const TINY_MP4 = Buffer.from("ModelDesk smoke video placeholder\n", "utf8");
const TINY_WAV = Buffer.from("ModelDesk smoke voice placeholder\n", "utf8");

async function check(label: string, publicUrl: string) {
  const res = await fetch(publicUrl);
  const ok = res.status === 200;
  console.log(
    JSON.stringify({
      label,
      status: res.status,
      ok,
      contentType: res.headers.get("content-type"),
      url: publicUrl,
    }),
  );
  if (!ok) throw new Error(`${label} fetch failed: ${res.status}`);
}

const image = await storage.uploadBytes({
  bytes: TINY_PNG,
  mime: "image/png",
  filename: "smoke.png",
  kind: "image",
});
const video = await storage.uploadBytes({
  bytes: TINY_MP4,
  mime: "video/mp4",
  filename: "smoke.mp4",
  kind: "video",
});
const voice = await storage.uploadBytes({
  bytes: TINY_WAV,
  mime: "audio/wav",
  filename: "smoke.wav",
  kind: "voice",
});

for (const r of [image, video, voice]) {
  const expected =
    r.kind === "image"
      ? "temp/images/"
      : r.kind === "video"
        ? "temp/videos/"
        : "temp/voice/";
  console.log(
    JSON.stringify({
      kind: r.kind,
      key: r.key,
      tosUri: r.tosUri,
      publicUrl: r.publicUrl,
    }),
  );
  if (!r.key.startsWith(expected)) {
    throw new Error(`bad key prefix for ${r.kind}: ${r.key}`);
  }
}

await check("image", image.publicUrl);
await check("video", video.publicUrl);
await check("voice", voice.publicUrl);
console.log("smoke:upload ALL OK");
