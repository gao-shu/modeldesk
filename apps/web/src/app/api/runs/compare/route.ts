import { NextRequest } from "next/server";
import { z } from "zod";
import {
  checkCompareModelsReady,
  prepareErrorHttpStatus,
  runCompareModels,
} from "@/lib/server/run-core";
import {
  clearRunAbort,
  registerRunAbort,
} from "@/lib/server/run-abort";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  modality: z.enum(["text", "image", "audio", "video"]),
  modelIds: z.array(z.string().min(1)).min(2).max(3),
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

  const ready = checkCompareModelsReady(parsed.modelIds, parsed.modality);
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
        const outcome = await runCompareModels({
          modelIds: parsed.modelIds,
          prompt: parsed.prompt,
          temperature: parsed.temperature,
          maxTokens: parsed.maxTokens,
          params: parsed.params,
          suiteId: parsed.suiteId,
          caseId: parsed.caseId,
          expectModality: parsed.modality,
          onPrepared: (info) => {
            registeredRunId = info.runId;
            send("meta", {
              runId: info.runId,
              modality: info.modality,
              params: info.params,
              sides: info.sides,
            });
            return registerRunAbort(info.runId, null);
          },
          onEvent: send,
        });

        if (outcome.kind === "prepare_error") {
          send("error", {
            message: outcome.error,
            code: outcome.code,
          });
          return;
        }

        // Per-slot done/error already streamed from runCompareModels as each job finishes.
        const okCount = outcome.sides.filter((s) => s.result.ok).length;
        const failCount = outcome.sides.length - okCount;
        const compareStatus =
          okCount === outcome.sides.length
            ? "succeeded"
            : okCount === 0
              ? "failed"
              : "partial";

        send("compare_done", {
          runId: outcome.runId,
          status: compareStatus,
          okCount,
          failCount,
          sides: outcome.sides.map((s) => ({
            slot: s.slot,
            modelId: s.model.id,
            jobId: s.jobId,
            ok: s.result.ok,
            cancelled: Boolean(s.result.cancelled),
          })),
        });
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
      // Do NOT abort on client disconnect — same policy as single run.
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
