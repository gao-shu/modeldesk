/**
 * Step 6 smoke: Agnes Video 2.5 Flash text mode (workspace adapters).
 * Run from packages/adapters:
 *   node node_modules/tsx/dist/cli.mjs scripts/smoke-agnes-25-flash.mjs
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDecipheriv, createHash } from "node:crypto";
import { generateVideo } from "../src/video.ts";

const require = createRequire(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../apps/web/package.json",
  ),
);

const dataDir =
  process.env.MODELDESK_DATA_DIR || "E:/test/modeldesk/data";
const dbPath = path.join(dataDir, "modeldesk.db");

function loadSecret() {
  const fromEnv = process.env.ENCRYPTION_SECRET?.trim();
  if (fromEnv) return fromEnv;
  const p = path.join(dataDir, ".encryption-secret");
  if (fs.existsSync(p)) return fs.readFileSync(p, "utf8").trim();
  throw new Error(`No ENCRYPTION_SECRET / ${p}`);
}

function decryptSecret(enc, secret) {
  const [version, ivB64, tagB64, dataB64] = enc.split(":");
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("bad enc format (expect v1:iv:tag:cipher)");
  }
  const key = createHash("sha256").update(secret, "utf8").digest();
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

const Database = require("better-sqlite3");
const db = new Database(dbPath, { readonly: true });
const row = db
  .prepare(
    "select api_key_enc, model_id, base_url from models where id = ? or model_id = ?",
  )
  .get(
    "e06bb7ed-eb8c-4d9d-b9cf-1bc422ca438a",
    "agnes-video-2.5-flash",
  );
if (!row?.api_key_enc) throw new Error("flash model row / key missing");
const apiKey = decryptSecret(row.api_key_enc, loadSecret());
db.close();

const logs = [];
console.log("[smoke] submit Agnes 2.5 Flash text…");
const result = await generateVideo({
  baseUrl: row.base_url || "https://apihub.agnes-ai.com/v1",
  apiKey,
  model: "agnes-video-2.5-flash",
  apiFormat: "video.agnes-25-flash",
  prompt:
    "雨后的未来城市街道，霓虹灯倒映在地面，一辆银色跑车缓慢驶过，电影级运镜",
  mode: "text",
  durationSec: 5,
  aspectRatio: "16:9",
  size: "720P",
  timeoutMs: 15 * 60 * 1000,
  onHttpLog: (log) => {
    logs.push(log);
    console.log("[smoke] http", log.url);
    console.log("[smoke] body", JSON.stringify(log.body));
  },
  onStatus: (s, d) => console.log("[smoke] status", s, d ?? ""),
});

console.log(
  JSON.stringify(
    {
      ok: true,
      mime: result.mime,
      bytes: result.bytes?.length ?? 0,
      remoteUrl: result.remoteUrl,
      taskId: result.taskId,
      latencyMs: result.latencyMs,
      submitBody: logs[0]?.body ?? null,
    },
    null,
    2,
  ),
);
