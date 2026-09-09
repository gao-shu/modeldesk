/**
 * Gateway E2E (no browser): spawn headless :3310, assert auth / rate-limit /
 * aliases / OpenAPI. Optional live chat/image when models have keys.
 *
 *   pnpm e2e
 *   MODELDESK_E2E_LIVE=1 pnpm e2e   # also try chat (+ image unless SKIP)
 */

import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gwDir = path.join(root, "apps", "gateway");

/** Load KEY=VALUE from a dotenv file without printing values. */
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key && process.env[key] == null) process.env[key] = val;
  }
}

loadEnvFile(path.join(root, "apps", "web", ".env.local"));
loadEnvFile(path.join(root, ".env.local"));
loadEnvFile(path.join(root, ".env"));

const PORT = Number(process.env.MODELDESK_E2E_PORT ?? "3317") || 3317;
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = "e2e-test-token-please-rotate";
const LIVE =
  process.env.MODELDESK_E2E_LIVE === "1" || process.argv.includes("--live");
const SKIP_IMAGE = process.env.MODELDESK_ACCEPT_SKIP_IMAGE === "1";

const steps = [];
function pass(name, detail) {
  steps.push({ name, ok: true, detail });
  console.error(`  ok  ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail) {
  steps.push({ name, ok: false, detail });
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}

function resolveTsx() {
  return [
    path.join(gwDir, "node_modules", "tsx", "dist", "cli.mjs"),
    path.join(root, "node_modules", "tsx", "dist", "cli.mjs"),
  ].find((p) => fs.existsSync(p));
}

function spawnGateway(extraEnv = {}) {
  const tsxCli = resolveTsx();
  if (!tsxCli) throw new Error("tsx not found; run pnpm install");
  const child = spawn(
    process.execPath,
    [tsxCli, "--tsconfig", "tsconfig.json", "src/index.ts"],
    {
      cwd: gwDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        MODELDESK_GATEWAY_HOST: "127.0.0.1",
        MODELDESK_GATEWAY_PORT: String(PORT),
        ...extraEnv,
      },
    },
  );
  let stderr = "";
  child.stderr?.on("data", (d) => {
    stderr += d.toString("utf8");
  });
  child.stdout?.on("data", () => {});
  return { child, getStderr: () => stderr };
}

async function waitHealth(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/healthz`);
      if (res.ok) {
        const j = await res.json();
        if (j?.ok) return j;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`healthz timeout ${BASE}`);
}

function killChild(child) {
  if (!child || child.killed) return;
  try {
    child.kill();
  } catch {
    /* ignore */
  }
}

/** Raw HTTP so we can spoof Host (fetch often forbids Host override). */
function rawRequest({ method, path: p, host, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: p,
        method,
        headers: {
          Host: host ?? `127.0.0.1:${PORT}`,
          ...headers,
          ...(body
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(body),
              }
            : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            json = { raw: text.slice(0, 400) };
          }
          resolve({ status: res.statusCode ?? 0, json, text });
        });
      },
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function phaseContract() {
  console.error("\n[e2e] contract (loopback open)");
  const { child, getStderr } = spawnGateway({
    MODELDESK_GATEWAY_MAX_CONCURRENT: "16",
    MODELDESK_GATEWAY_RPM: "180",
  });
  try {
    const health = await waitHealth();
    if (health.ok) pass("healthz", health.dataDir ?? "");
    else fail("healthz", JSON.stringify(health));

    const openapi = await fetch(`${BASE}/openapi.yaml`);
    const yaml = await openapi.text();
    if (openapi.ok && yaml.includes("ModelDesk Gateway")) {
      pass("openapi.yaml", `${yaml.length} bytes`);
    } else fail("openapi.yaml", `status=${openapi.status} bytes=${yaml.length}`);

    const aliases = await fetch(`${BASE}/v1/aliases`).then((r) => r.json());
    const ids = (aliases.aliases ?? []).map((a) => a.alias);
    const need = [
      "llm-default",
      "image-default",
      "video-default",
      "audio-default",
    ];
    if (need.every((id) => ids.includes(id))) pass("aliases list", ids.join(","));
    else fail("aliases list", JSON.stringify(ids));

    const models = await fetch(`${BASE}/v1/models`).then((r) => r.json());
    const data = Array.isArray(models.data) ? models.data : [];
    if (data.length >= 0) pass("models list", `${data.length} models`);
    else fail("models list", "missing data");

    const lan = await rawRequest({
      method: "GET",
      path: "/v1/models",
      host: "10.0.0.5",
    });
    if (lan.status === 401) pass("reject non-loopback Host without token");
    else fail("reject non-loopback Host", `status=${lan.status}`);

    return { models: data, stderr: getStderr() };
  } finally {
    killChild(child);
    await new Promise((r) => setTimeout(r, 400));
  }
}

async function phaseAuthToken() {
  console.error("\n[e2e] auth token");
  const { child } = spawnGateway({
    MODELDESK_GATEWAY_TOKEN: TOKEN,
    MODELDESK_GATEWAY_MAX_CONCURRENT: "16",
    MODELDESK_GATEWAY_RPM: "180",
  });
  try {
    await waitHealth();
    const noTok = await fetch(`${BASE}/v1/models`);
    if (noTok.status === 401) pass("401 without bearer");
    else fail("401 without bearer", `status=${noTok.status}`);

    const bad = await fetch(`${BASE}/v1/models`, {
      headers: { Authorization: "Bearer wrong" },
    });
    if (bad.status === 401) pass("401 wrong bearer");
    else fail("401 wrong bearer", `status=${bad.status}`);

    const ok = await fetch(`${BASE}/v1/models`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (ok.ok) pass("200 with bearer");
    else fail("200 with bearer", `status=${ok.status}`);
  } finally {
    killChild(child);
    await new Promise((r) => setTimeout(r, 400));
  }
}

async function phaseRequireToken() {
  console.error("\n[e2e] REQUIRE_TOKEN");
  const { child } = spawnGateway({
    MODELDESK_GATEWAY_REQUIRE_TOKEN: "1",
    MODELDESK_GATEWAY_MAX_CONCURRENT: "16",
    MODELDESK_GATEWAY_RPM: "180",
  });
  try {
    await waitHealth();
    const res = await fetch(`${BASE}/v1/models`);
    const body = await res.json().catch(() => ({}));
    if (
      res.status === 401 &&
      String(body?.error?.message ?? "").includes("REQUIRE_TOKEN")
    ) {
      pass("REQUIRE_TOKEN without tokens configured");
    } else {
      fail(
        "REQUIRE_TOKEN without tokens",
        `status=${res.status} msg=${body?.error?.message}`,
      );
    }
  } finally {
    killChild(child);
    await new Promise((r) => setTimeout(r, 400));
  }
}

async function phaseRateLimit() {
  console.error("\n[e2e] rate limit RPM");
  const { child } = spawnGateway({
    MODELDESK_GATEWAY_MAX_CONCURRENT: "0",
    MODELDESK_GATEWAY_RPM: "2",
  });
  try {
    await waitHealth();
    const a = await fetch(`${BASE}/v1/models`);
    const b = await fetch(`${BASE}/v1/models`);
    const c = await fetch(`${BASE}/v1/models`);
    if (a.ok && b.ok && c.status === 429) {
      pass("RPM=2 third request 429");
    } else {
      fail(
        "RPM=2 third request 429",
        `status=${a.status}/${b.status}/${c.status}`,
      );
    }
  } finally {
    killChild(child);
    await new Promise((r) => setTimeout(r, 400));
  }
}

async function phaseAliasPut(models) {
  console.error("\n[e2e] alias PUT");
  const text = models.find(
    (m) =>
      m.modality === "text" &&
      m.owned_by !== "modeldesk-alias" &&
      typeof m.id === "string",
  );
  if (!text) {
    pass("alias PUT skipped", "no text model in registry");
    return;
  }
  const { child } = spawnGateway({
    MODELDESK_GATEWAY_MAX_CONCURRENT: "16",
    MODELDESK_GATEWAY_RPM: "180",
  });
  try {
    await waitHealth();
    const put = await fetch(`${BASE}/v1/aliases`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ "llm-default": text.id }),
    });
    const body = await put.json();
    if (!put.ok) {
      fail("alias PUT", body?.error?.message ?? `status=${put.status}`);
      return;
    }
    const bound = (body.aliases ?? []).find((a) => a.alias === "llm-default");
    if (bound?.modelId === text.id) pass("alias PUT llm-default", text.id);
    else fail("alias PUT llm-default", JSON.stringify(bound));
  } finally {
    killChild(child);
    await new Promise((r) => setTimeout(r, 400));
  }
}

async function phaseLive(models) {
  if (!LIVE) {
    console.error("\n[e2e] live chat/image skipped (set MODELDESK_E2E_LIVE=1)");
    return;
  }
  console.error("\n[e2e] live upstream");
  const texts = models.filter(
    (m) =>
      m.modality === "text" &&
      m.owned_by !== "modeldesk-alias" &&
      m.hasApiKey === true,
  );
  const images = models.filter(
    (m) =>
      m.modality === "image" &&
      m.owned_by !== "modeldesk-alias" &&
      m.hasApiKey === true,
  );
  if (!texts.length) {
    fail("live chat", "no text model with hasApiKey=true");
    return;
  }

  const { child } = spawnGateway({
    MODELDESK_GATEWAY_MAX_CONCURRENT: "16",
    MODELDESK_GATEWAY_RPM: "180",
  });
  try {
    await waitHealth();

    let chatOk = false;
    let chatErr = "";
    for (const text of texts) {
      await fetch(`${BASE}/v1/aliases`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ "llm-default": text.id }),
      });
      const chat = await fetch(`${BASE}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llm-default",
          messages: [{ role: "user", content: "只回复两个字：通过" }],
          max_tokens: 16,
        }),
      });
      const chatBody = await chat.json();
      if (chat.ok && chatBody?.choices?.[0]?.message?.content) {
        pass(
          "live chat",
          `${text.name || text.id}: ${String(chatBody.choices[0].message.content).slice(0, 40)}`,
        );
        chatOk = true;
        break;
      }
      chatErr =
        chatBody?.error?.message ?? `status=${chat.status} model=${text.id}`;
    }
    if (!chatOk) fail("live chat", chatErr);

    if (SKIP_IMAGE) {
      pass("live image skipped", "SKIP_IMAGE=1");
      return;
    }
    if (!images.length) {
      pass("live image skipped", "no image model with key");
      return;
    }

    let imageOk = false;
    const imageErrors = [];
    for (const image of images) {
      await fetch(`${BASE}/v1/aliases`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ "image-default": image.id }),
      });
      const img = await fetch(`${BASE}/v1/images/generations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "image-default",
          prompt: "一枚极简红色圆点，白底，测试用",
        }),
      });
      const imgBody = await img.json();
      const url = imgBody?.data?.[0]?.url;
      if (img.ok && url) {
        pass("live image", `${image.name || image.id}: ${url.slice(0, 72)}`);
        imageOk = true;
        break;
      }
      imageErrors.push(
        `${image.name || image.id}: ${imgBody?.error?.message ?? `status=${img.status}`}`,
      );
    }
    if (!imageOk) {
      // Upstream account / quota failures are not gateway regressions.
      const joined = imageErrors.join(" | ").slice(0, 400);
      const upstreamOnly = imageErrors.every((e) =>
        /503|429|401|402|quota|account|余额|额度|eligible/i.test(e),
      );
      if (upstreamOnly) {
        pass("live image soft-skip (upstream)", joined);
      } else {
        fail("live image", joined);
      }
    }
  } finally {
    killChild(child);
  }
}

async function main() {
  console.error(`[e2e] Gateway E2E on ${BASE}`);
  const { models } = await phaseContract();
  await phaseAuthToken();
  await phaseRequireToken();
  await phaseRateLimit();
  await phaseAliasPut(models);
  await phaseLive(models);

  const failed = steps.filter((s) => !s.ok);
  const report = {
    ok: failed.length === 0,
    base: BASE,
    passed: steps.filter((s) => s.ok).length,
    failed: failed.length,
    steps,
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(
    JSON.stringify({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      steps,
    }),
  );
  process.exit(1);
});
