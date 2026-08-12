/**
 * ModelDesk OpenAI-compatible gateway (loopback by default).
 *
 *   GET  /v1/models
 *   POST /v1/chat/completions   (stream + non-stream)
 *   GET  /healthz
 *
 * Env:
 *   MODELDESK_GATEWAY_HOST   default 127.0.0.1
 *   MODELDESK_GATEWAY_PORT   default 3310
 *   MODELDESK_GATEWAY_TOKEN  optional; if set, require Bearer token
 *   MODELDESK_DATA_DIR       same data dir as Web / MCP
 */

import http from "node:http";
import { randomUUID } from "node:crypto";
import {
  getRunModel,
  listRunModels,
  runCoreResultToPublic,
  runText,
  type RunModelSummary,
} from "@/lib/server/run-core";
import { ensureDataDirs, getDataDir } from "@/lib/server/paths";

const HOST = (process.env.MODELDESK_GATEWAY_HOST ?? "127.0.0.1").trim();
const PORT = Number(process.env.MODELDESK_GATEWAY_PORT ?? "3310") || 3310;
const TOKEN = process.env.MODELDESK_GATEWAY_TOKEN?.trim() || "";

function log(...args: unknown[]) {
  console.error("[modeldesk-gateway]", ...args);
}

function isMock(m: RunModelSummary): boolean {
  return (
    m.provider === "mock" ||
    (m.baseUrl ?? "").toLowerCase().startsWith("mock://")
  );
}

function json(
  res: http.ServerResponse,
  status: number,
  body: unknown,
): void {
  const raw = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(raw),
  });
  res.end(raw);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function checkAuth(req: http.IncomingMessage): boolean {
  if (!TOKEN) return true;
  const h = req.headers.authorization ?? "";
  if (h === `Bearer ${TOKEN}`) return true;
  if (h === TOKEN) return true;
  return false;
}

/** Resolve OpenAI `model` field → ModelDesk registry id (text only). */
export function resolveTextModelRef(model: string): RunModelSummary | null {
  const direct = getRunModel(model);
  if (direct && direct.modality === "text" && !isMock(direct)) return direct;

  const all = listRunModels("text").filter((m) => !isMock(m));
  const matches = all.filter(
    (m) => m.id === model || m.name === model || m.modelId === model,
  );
  if (matches.length === 1) return matches[0]!;
  return null;
}

type ChatMessage = { role?: string; content?: unknown };

function messageContentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text?: unknown }).text ?? "");
        }
        return "";
      })
      .filter(Boolean)
      .join("");
  }
  if (content == null) return "";
  return String(content);
}

function messagesToPrompt(messages: ChatMessage[]): string {
  const parts = messages
    .map((m) => {
      const role = (m.role ?? "user").trim() || "user";
      const text = messageContentToText(m.content).trim();
      if (!text) return "";
      return `${role}: ${text}`;
    })
    .filter(Boolean);
  if (parts.length === 1 && parts[0]!.startsWith("user: ")) {
    return parts[0]!.slice("user: ".length);
  }
  return parts.join("\n\n");
}

function openaiError(
  res: http.ServerResponse,
  status: number,
  message: string,
  type = "invalid_request_error",
): void {
  json(res, status, {
    error: { message, type, param: null, code: null },
  });
}

async function handleModels(res: http.ServerResponse) {
  const models = listRunModels("text").filter((m) => !isMock(m));
  json(res, 200, {
    object: "list",
    data: models.map((m) => ({
      id: m.id,
      object: "model",
      created: Math.floor(Date.now() / 1000),
      owned_by: m.provider || "modeldesk",
      // Hints for humans / clients that show description fields
      root: m.modelId,
      name: m.name,
    })),
  });
}

async function handleChatCompletions(
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(await readBody(req)) as Record<string, unknown>;
  } catch {
    openaiError(res, 400, "Invalid JSON body");
    return;
  }

  const modelRef = typeof body.model === "string" ? body.model.trim() : "";
  if (!modelRef) {
    openaiError(res, 400, "Missing model");
    return;
  }

  const resolved = resolveTextModelRef(modelRef);
  if (!resolved) {
    openaiError(
      res,
      404,
      `Unknown text model "${modelRef}". Use GET /v1/models (registry id, name, or upstream modelId).`,
    );
    return;
  }

  const messages = Array.isArray(body.messages)
    ? (body.messages as ChatMessage[])
    : [];
  const prompt = messagesToPrompt(messages);
  if (!prompt.trim()) {
    openaiError(res, 400, "messages must include non-empty content");
    return;
  }

  const temperature =
    typeof body.temperature === "number" ? body.temperature : null;
  const maxTokens =
    typeof body.max_tokens === "number"
      ? body.max_tokens
      : typeof body.max_completion_tokens === "number"
        ? body.max_completion_tokens
        : null;
  const stream = body.stream === true;
  const completionId = `chatcmpl-${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const created = Math.floor(Date.now() / 1000);

  if (stream) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });
    const send = (payload: unknown) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };
    send({
      id: completionId,
      object: "chat.completion.chunk",
      created,
      model: resolved.id,
      choices: [
        {
          index: 0,
          delta: { role: "assistant", content: "" },
          finish_reason: null,
        },
      ],
    });

    const outcome = await runText({
      modelId: resolved.id,
      prompt,
      temperature,
      maxTokens,
      onEvent: (event, data) => {
        if (event !== "token") return;
        const text = String((data as { text?: unknown }).text ?? "");
        if (!text) return;
        send({
          id: completionId,
          object: "chat.completion.chunk",
          created,
          model: resolved.id,
          choices: [
            { index: 0, delta: { content: text }, finish_reason: null },
          ],
        });
      },
    });

    if (outcome.kind === "prepare_error") {
      send({
        id: completionId,
        object: "chat.completion.chunk",
        created,
        model: resolved.id,
        choices: [],
        error: { message: outcome.error, code: outcome.code },
      });
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    const finish = outcome.result.cancelled
      ? "stop"
      : outcome.result.ok
        ? "stop"
        : "stop";
    send({
      id: completionId,
      object: "chat.completion.chunk",
      created,
      model: resolved.id,
      choices: [{ index: 0, delta: {}, finish_reason: finish }],
      usage: {
        prompt_tokens: outcome.result.inputTokens ?? 0,
        completion_tokens: outcome.result.outputTokens ?? 0,
        total_tokens:
          (outcome.result.inputTokens ?? 0) +
          (outcome.result.outputTokens ?? 0),
      },
    });
    res.write("data: [DONE]\n\n");
    res.end();
    log("chat.completions stream", {
      model: resolved.id,
      ok: outcome.result.ok,
      latencyMs: outcome.result.latencyMs,
    });
    return;
  }

  const outcome = await runText({
    modelId: resolved.id,
    prompt,
    temperature,
    maxTokens,
  });

  if (outcome.kind === "prepare_error") {
    openaiError(res, 400, outcome.error);
    return;
  }

  const pub = runCoreResultToPublic(outcome);
  if (!pub.ok) {
    openaiError(res, 502, pub.error ?? "Upstream run failed");
    return;
  }

  json(res, 200, {
    id: completionId,
    object: "chat.completion",
    created,
    model: resolved.id,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: pub.content },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: pub.inputTokens ?? 0,
      completion_tokens: pub.outputTokens ?? 0,
      total_tokens: (pub.inputTokens ?? 0) + (pub.outputTokens ?? 0),
    },
    modeldesk: {
      runId: pub.runId,
      jobId: pub.jobId,
      latencyMs: pub.latencyMs,
      artifactId: pub.artifactId,
    },
  });
  log("chat.completions", {
    model: resolved.id,
    ok: true,
    latencyMs: pub.latencyMs,
  });
}

async function main() {
  if (HOST !== "127.0.0.1" && HOST !== "localhost" && HOST !== "::1") {
    log(
      `WARNING: binding to ${HOST}. Prefer 127.0.0.1 — this gateway can spend your API keys.`,
    );
  }

  ensureDataDirs();
  log("dataDir", getDataDir());
  log(`listening http://${HOST}:${PORT}  (GET /v1/models, POST /v1/chat/completions)`);

  const server = http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
      const path = url.pathname.replace(/\/+$/, "") || "/";

      if (req.method === "GET" && (path === "/healthz" || path === "/health")) {
        json(res, 200, { ok: true, dataDir: getDataDir() });
        return;
      }

      if (!checkAuth(req)) {
        openaiError(res, 401, "Unauthorized", "auth_error");
        return;
      }

      if (req.method === "GET" && path === "/v1/models") {
        await handleModels(res);
        return;
      }

      if (req.method === "POST" && path === "/v1/chat/completions") {
        await handleChatCompletions(req, res);
        return;
      }

      openaiError(res, 404, `Unknown route ${req.method} ${path}`);
    })().catch((err) => {
      log("handler error", err instanceof Error ? err.message : err);
      if (!res.headersSent) {
        openaiError(
          res,
          500,
          err instanceof Error ? err.message : "Internal error",
          "server_error",
        );
      } else {
        try {
          res.end();
        } catch {
          /* ignore */
        }
      }
    });
  });

  server.listen(PORT, HOST);
}

main().catch((err) => {
  console.error(
    "[modeldesk-gateway] fatal",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
