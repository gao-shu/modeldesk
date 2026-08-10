import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  checkRunModelReady,
  prepareErrorHttpStatus,
  runSingleModel,
} from "@/lib/server/run-core";
import {
  clearRunAbort,
  registerRunAbort,
} from "@/lib/server/run-abort";
import {
  countRunsByMode,
  listRecentSingleRuns,
} from "@/lib/server/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  modelId: z.string().min(1),
  prompt: z.string().trim().min(1).max(100_000),
  temperature: z.number().min(0).max(2).optional().nullable(),
  maxTokens: z.number().int().min(1).max(128_000).optional().nullable(),
  params: z.record(z.string(), z.unknown()).optional().nullable(),
  suiteId: z.string().optional().nullable(),
  caseId: z.string().optional().nullable(),
});

function sseEncode(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const limit = Math.min(Math.max(Number(sp.get("limit")) || 15, 1), 50);
    const offset = Math.max(Number(sp.get("offset")) || 0, 0);
    const status = sp.get("status") || undefined;
    const modality = sp.get("modality") || undefined;
    const modelId = sp.get("modelId") || undefined;
    const runs = listRecentSingleRuns(limit, offset, status, modality, modelId);
    const total = countRunsByMode("single", status, modality, modelId);
    return NextResponse.json({ ok: true, runs, total, limit, offset });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? (error.issues[0]?.message ?? "Invalid body")
        : "Invalid body";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const ready = checkRunModelReady(parsed.modelId);
  if (!("ok" in ready)) {
    return new Response(
      JSON.stringify({ ok: false, error: ready.error, code: ready.code }),
      {
        status: prepareErrorHttpStatus(ready.code),
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const encoder = new TextEncoder();
  let registeredRunId: string | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(sseEncode(event, data)));
        } catch {
          /* stream already closed */
        }
      };

      try {
        const outcome = await runSingleModel({
          modelId: parsed.modelId,
          prompt: parsed.prompt,
          temperature: parsed.temperature,
          maxTokens: parsed.maxTokens,
          params: parsed.params,
          suiteId: parsed.suiteId,
          caseId: parsed.caseId,
          onPrepared: (info) => {
            registeredRunId = info.runId;
            send("meta", {
              runId: info.runId,
              jobId: info.jobId,
              modality: info.modality,
              params: info.params,
              model: info.model,
            });
            // Decouple request disconnect from run abort; cancel via /cancel only.
            return registerRunAbort(info.runId, null);
          },
          onEvent: send,
        });

        if (outcome.kind === "prepare_error") {
          // Should be rare after checkRunModelReady; still surface on the stream.
          send("error", {
            message: outcome.error,
            code: outcome.code,
          });
          return;
        }

        const { result, runId, jobId, modality } = outcome;
        if (result.cancelled) {
          send("error", {
            message: "已取消",
            cancelled: true,
            runId,
            jobId,
            latencyMs: result.latencyMs,
            ttftMs: result.ttftMs,
            partialContent: result.content || undefined,
          });
        } else if (result.ok) {
          send("done", {
            runId,
            jobId,
            latencyMs: result.latencyMs,
            ttftMs: result.ttftMs,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            costUsd: result.costUsd,
            artifactId: result.artifactId,
            artifactIds: result.artifactIds,
            contentLength: result.content.length,
            modality,
            artifactMeta: result.artifactMeta ?? null,
          });
        } else {
          send("error", {
            message: result.error ?? "Run failed",
            runId,
            jobId,
            latencyMs: result.latencyMs,
            ttftMs: result.ttftMs,
            partialContent: result.content || undefined,
          });
        }
      } finally {
        if (registeredRunId) clearRunAbort(registeredRunId);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      // Do NOT abort the run on client disconnect — allow it to finish
      // server-side so refresh / navigate-back can still see results.
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
