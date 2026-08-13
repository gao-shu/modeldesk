/**
 * Phase A6 — local “business” acceptance via Gateway API + stable aliases.
 *
 * Prefers Web/Desktop :3300 (embedded /v1). Falls back to spawning headless
 * modeldesk-gateway on :3310 when MODELDESK_ACCEPT_HEADLESS=1 or :3300 is down
 * and headless spawn is allowed.
 *
 * Usage:
 *   MODELDESK_DESKTOP=1 pnpm gateway:accept
 *
 * Optional:
 *   MODELDESK_ACCEPT_BASE=http://127.0.0.1:3300
 *   MODELDESK_ACCEPT_HEADLESS=1  — spawn :3310 if needed
 *   MODELDESK_ACCEPT_TEXT_ID / MODELDESK_ACCEPT_IMAGE_ID
 *   MODELDESK_ACCEPT_SKIP_IMAGE=1
 *   MODELDESK_GATEWAY_TOKEN
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gwDir = path.join(root, "apps", "gateway");
const TOKEN = process.env.MODELDESK_GATEWAY_TOKEN?.trim() || "";
const SKIP_IMAGE = process.env.MODELDESK_ACCEPT_SKIP_IMAGE === "1";
const ALLOW_HEADLESS = process.env.MODELDESK_ACCEPT_HEADLESS === "1";

let BASE =
  process.env.MODELDESK_ACCEPT_BASE?.trim() || "http://127.0.0.1:3300";

function headers(jsonBody = false) {
  const h = {};
  if (jsonBody) h["Content-Type"] = "application/json";
  if (TOKEN) h.Authorization = `Bearer ${TOKEN}`;
  return h;
}

async function api(method, p, body) {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: headers(body !== undefined),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 500) };
  }
  if (!res.ok) {
    const msg =
      data?.error?.message || data?.error || `HTTP ${res.status} ${p}`;
    const err = new Error(String(msg));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function pickModel(models, modality, pinned) {
  if (pinned) {
    const hit = models.find((m) => m.id === pinned && m.modality === modality);
    if (!hit) throw new Error(`Pinned ${modality} model not found: ${pinned}`);
    return hit;
  }
  const candidates = models.filter(
    (m) =>
      m.modality === modality &&
      m.owned_by !== "modeldesk-alias" &&
      m.hasApiKey !== false,
  );
  const withKey = candidates.filter((m) => m.hasApiKey === true);
  const pool = withKey.length ? withKey : candidates;
  if (!pool.length) {
    throw new Error(`No ${modality} model in GET /v1/models`);
  }
  return pool[0];
}

async function probeHealth(base, timeoutMs = 1500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${base}/healthz`, { headers: headers() });
      if (!res.ok) {
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }
      const h = await res.json();
      if (h?.ok) return h;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

async function waitHealth(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const h = await probeHealth(BASE, 400);
    if (h) return h;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Gateway healthz timeout (${BASE})`);
}

function resolveTsx() {
  const candidates = [
    path.join(gwDir, "node_modules", "tsx", "dist", "cli.mjs"),
    path.join(root, "node_modules", "tsx", "dist", "cli.mjs"),
  ];
  return candidates.find((p) => fs.existsSync(p));
}

async function main() {
  let child = null;
  const report = {
    ok: false,
    base: BASE,
    dataDir: null,
    aliases: null,
    text: null,
    image: null,
  };

  try {
    let health = await probeHealth(BASE, 1200);
    if (!health && ALLOW_HEADLESS) {
      BASE = `http://127.0.0.1:${Number(process.env.MODELDESK_GATEWAY_PORT ?? "3310") || 3310}`;
      report.base = BASE;
      health = await probeHealth(BASE, 800);
      if (!health) {
        const tsxCli = resolveTsx();
        if (!tsxCli) throw new Error("tsx not found; run pnpm install");
        child = spawn(
          process.execPath,
          [tsxCli, "--tsconfig", "tsconfig.json", "src/index.ts"],
          {
            cwd: gwDir,
            stdio: ["ignore", "ignore", "pipe"],
            env: process.env,
          },
        );
        child.stderr?.on("data", () => {});
      }
      health = await waitHealth();
    } else if (!health) {
      throw new Error(
        `No Gateway at ${BASE}. Start Web/Desktop (pnpm dev), or set MODELDESK_ACCEPT_HEADLESS=1 to spawn :3310.`,
      );
    }

    report.dataDir = health.dataDir ?? null;

    const models = await api("GET", "/v1/models");
    const list = Array.isArray(models?.data) ? models.data : [];
    const textModel = pickModel(
      list,
      "text",
      process.env.MODELDESK_ACCEPT_TEXT_ID?.trim(),
    );
    const imageModel = SKIP_IMAGE
      ? null
      : pickModel(
          list,
          "image",
          process.env.MODELDESK_ACCEPT_IMAGE_ID?.trim(),
        );

    const aliasBody = { "llm-default": textModel.id };
    if (imageModel) aliasBody["image-default"] = imageModel.id;
    await api("PUT", "/v1/aliases", aliasBody);
    const aliases = await api("GET", "/v1/aliases");
    report.aliases = aliases.aliases?.filter((a) =>
      ["llm-default", "image-default"].includes(a.alias),
    );

    const chat = await api("POST", "/v1/chat/completions", {
      model: "llm-default",
      messages: [
        {
          role: "user",
          content:
            "用一句话写漫剧分镜旁白（中文，不超过40字）：雨夜街头，少年撑伞独行。",
        },
      ],
      max_tokens: 80,
    });
    const caption =
      chat?.choices?.[0]?.message?.content?.trim() || "(empty caption)";
    report.text = {
      model: chat.model,
      caption,
      latencyMs: chat?.modeldesk?.latencyMs ?? null,
      runId: chat?.modeldesk?.runId ?? null,
    };

    if (imageModel) {
      const img = await api("POST", "/v1/images/generations", {
        model: "image-default",
        prompt: `漫画分镜封面，写实插画：${caption}`,
      });
      const url = img?.data?.[0]?.url ?? null;
      let artifactBytes = 0;
      if (url) {
        const artRes = await fetch(url, { headers: headers() });
        if (artRes.ok) {
          const buf = Buffer.from(await artRes.arrayBuffer());
          artifactBytes = buf.byteLength;
        }
      }
      report.image = {
        model: img.model,
        url,
        artifactBytes,
        latencyMs: img?.modeldesk?.latencyMs ?? null,
        runId: img?.modeldesk?.runId ?? null,
      };
      if (!url || artifactBytes <= 0) {
        throw new Error("Image generation returned no downloadable artifact");
      }
    }

    report.ok = true;
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 0;
  } catch (e) {
    report.ok = false;
    report.error = e instanceof Error ? e.message : String(e);
    if (e?.data) report.errorBody = e.data;
    if (String(report.error).includes("ENCRYPTION_SECRET") && report.dataDir) {
      report.hint = `Put the same .encryption-secret as Web under ${report.dataDir} (or set ENCRYPTION_SECRET).`;
    }
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  } finally {
    if (child && !child.killed) {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
    }
  }
}

main();
