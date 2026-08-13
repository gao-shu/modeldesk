import { randomUUID } from "node:crypto";
import { runCoreResultToPublic, runText } from "@/lib/server/run-core";
import { jsonResponse, openaiErrorResponse, readJsonBody } from "./http";
import { resolveModelRef } from "./resolve-model";

function log(...args: unknown[]) {
  console.error("[modeldesk-gateway]", ...args);
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

export async function chatCompletionsResponse(req: Request): Promise<Response> {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return openaiErrorResponse(400, "Invalid JSON body");
  const body = parsed.body;

  const modelRef = typeof body.model === "string" ? body.model.trim() : "";
  if (!modelRef) return openaiErrorResponse(400, "Missing model");

  const resolved = resolveModelRef(modelRef, "text");
  if (!resolved) {
    return openaiErrorResponse(
      404,
      `Unknown text model "${modelRef}". Use GET /v1/models, registry id/name/modelId, or alias llm-default.`,
    );
  }

  const messages = Array.isArray(body.messages)
    ? (body.messages as ChatMessage[])
    : [];
  const prompt = messagesToPrompt(messages);
  if (!prompt.trim()) {
    return openaiErrorResponse(400, "messages must include non-empty content");
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
    const encoder = new TextEncoder();
    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (payload: unknown) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
          );
        };
        try {
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
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            return;
          }

          send({
            id: completionId,
            object: "chat.completion.chunk",
            created,
            model: resolved.id,
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
            usage: {
              prompt_tokens: outcome.result.inputTokens ?? 0,
              completion_tokens: outcome.result.outputTokens ?? 0,
              total_tokens:
                (outcome.result.inputTokens ?? 0) +
                (outcome.result.outputTokens ?? 0),
            },
          });
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          log("chat.completions stream", {
            model: resolved.id,
            ok: outcome.result.ok,
            latencyMs: outcome.result.latencyMs,
          });
        } catch (err) {
          try {
            send({
              error: {
                message: err instanceof Error ? err.message : "Internal error",
              },
            });
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch {
            /* ignore */
          }
        }
      },
    });

    return new Response(readable, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  const outcome = await runText({
    modelId: resolved.id,
    prompt,
    temperature,
    maxTokens,
  });

  if (outcome.kind === "prepare_error") {
    return openaiErrorResponse(400, outcome.error);
  }

  const pub = runCoreResultToPublic(outcome);
  if (!pub.ok) {
    return openaiErrorResponse(502, pub.error ?? "Upstream run failed");
  }

  log("chat.completions", {
    model: resolved.id,
    ok: true,
    latencyMs: pub.latencyMs,
  });

  return jsonResponse(200, {
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
}
