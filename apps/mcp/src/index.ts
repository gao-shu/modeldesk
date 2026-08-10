/**
 * ModelDesk MCP — stdio tools over the shared Web run-core.
 * Log only to stderr (stdout is the MCP JSON-RPC channel).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  abortRun,
  clearRunAbort,
  hasRunAbort,
  registerRunAbort,
} from "@/lib/server/run-abort";
import { getEncryptionSecretStatus } from "@/lib/server/encryption-secret";
import {
  listRunModelsForAgent,
  runAudio,
  runCoreResultToPublic,
  runImage,
  runMusic,
  runText,
  runVideo,
  type RunCoreAgentModality,
  type RunCoreOutcome,
  type RunPreparedInfo,
  type RunSingleModelInput,
} from "@/lib/server/run-core";
import { ensureDataDirs, getDataDir } from "@/lib/server/paths";

function log(...args: unknown[]) {
  console.error("[modeldesk-mcp]", ...args);
}

function isMockModel(m: { provider: string; baseUrl: string | null }): boolean {
  return (
    m.provider === "mock" || (m.baseUrl ?? "").toLowerCase().startsWith("mock://")
  );
}

type ActiveRun = {
  runId: string;
  jobId: string;
  modelId: string;
  modality: string;
  startedAt: string;
};

const activeRuns = new Map<string, ActiveRun>();

function trackPrepared(info: RunPreparedInfo): AbortSignal {
  activeRuns.set(info.runId, {
    runId: info.runId,
    jobId: info.jobId,
    modelId: info.model.id,
    modality: info.modality,
    startedAt: new Date().toISOString(),
  });
  return registerRunAbort(info.runId);
}

function untrack(runId: string | null | undefined) {
  if (!runId) return;
  activeRuns.delete(runId);
  clearRunAbort(runId);
}

function withAbortTracking(
  input: Omit<RunSingleModelInput, "onPrepared" | "expectModality">,
  onRunId?: (runId: string) => void,
): Omit<RunSingleModelInput, "expectModality"> {
  return {
    ...input,
    onPrepared: (info) => {
      onRunId?.(info.runId);
      return trackPrepared(info);
    },
  };
}

function outcomeToText(outcome: RunCoreOutcome): string {
  if (outcome.kind === "prepare_error") {
    return JSON.stringify(
      {
        ok: false,
        error: outcome.error,
        code: outcome.code,
      },
      null,
      2,
    );
  }
  return JSON.stringify(runCoreResultToPublic(outcome), null, 2);
}

async function runTracked(
  label: string,
  meta: Record<string, unknown>,
  fn: (onRunId: (runId: string) => void) => Promise<RunCoreOutcome>,
) {
  log(label, meta);
  let runId: string | null = null;
  try {
    const outcome = await fn((id) => {
      runId = id;
    });
    if (outcome.kind === "prepare_error") {
      log(`${label} prepare_error`, outcome.code);
    } else {
      runId = outcome.runId;
      log(`${label} done`, {
        runId: outcome.runId,
        ok: outcome.result.ok,
        cancelled: Boolean(outcome.result.cancelled),
        artifactId: outcome.result.artifactId,
        latencyMs: outcome.result.latencyMs,
      });
    }
    return {
      content: [{ type: "text" as const, text: outcomeToText(outcome) }],
      isError:
        outcome.kind === "prepare_error" ? true : !outcome.result.ok,
    };
  } finally {
    untrack(runId);
  }
}

const modalitySchema = z.enum(["text", "image", "video", "audio", "music"]);

function createServer(): McpServer {
  const server = new McpServer({
    name: "modeldesk",
    version: "0.1.0",
  });

  server.tool(
    "list_models",
    "List ModelDesk-registered models for agent tools (text/image/video/audio/music). Same local DB as the Web UI.",
    {
      modality: modalitySchema
        .optional()
        .describe("Optional filter by modality"),
    },
    async ({ modality }) => {
      const models = listRunModelsForAgent(
        modality as RunCoreAgentModality | undefined,
      ).filter((m) => !isMockModel(m));
      const enc = getEncryptionSecretStatus();
      const payload = {
        dataDir: getDataDir(),
        encryption: {
          configured: enc.configured,
          source: enc.source,
        },
        count: models.length,
        models: models.map((m) => ({
          id: m.id,
          name: m.name,
          modality: m.modality,
          capability: m.capability,
          provider: m.provider,
          modelId: m.modelId,
          hasApiKey: m.hasApiKey,
        })),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      };
    },
  );

  server.tool(
    "list_active_runs",
    "List in-flight runs started by this MCP process (for cancel_run).",
    {},
    async () => {
      const runs = [...activeRuns.values()];
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ count: runs.length, runs }, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "cancel_run",
    "Cancel an in-flight run started by this MCP process (same process only).",
    {
      runId: z.string().min(1).describe("runId from a previous tool result"),
    },
    async ({ runId }) => {
      const tracked = activeRuns.has(runId) || hasRunAbort(runId);
      const aborted = abortRun(runId);
      const payload = {
        ok: aborted,
        runId,
        wasTracked: tracked,
        message: aborted
          ? "Abort signal sent; wait for the run tool to return cancelled"
          : "No in-flight abort controller for this runId in this process",
      };
      log("cancel_run", payload);
      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        isError: !aborted,
      };
    },
  );

  server.tool(
    "run_text",
    "Run a text (chat) model configured in ModelDesk. modelId is the registry UUID from list_models.",
    {
      modelId: z.string().min(1).describe("ModelDesk model config id"),
      prompt: z.string().min(1).describe("User prompt"),
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().int().min(1).max(128_000).optional(),
    },
    async ({ modelId, prompt, temperature, maxTokens }) =>
      runTracked("run_text", { modelId, promptLen: prompt.length }, (onRunId) =>
        runText(
          withAbortTracking(
            {
              modelId,
              prompt,
              temperature: temperature ?? null,
              maxTokens: maxTokens ?? null,
            },
            onRunId,
          ),
        ),
      ),
  );

  server.tool(
    "run_image",
    "Run an image model. Optional params mirror UI (size, ratio, quality, reference_images, …). Result includes artifact.path (absolute).",
    {
      modelId: z.string().min(1).describe("ModelDesk model config id"),
      prompt: z.string().min(1).describe("Image prompt"),
      params: z
        .record(z.unknown())
        .optional()
        .describe("Optional run params (size, ratio, quality, reference_images, …)"),
    },
    async ({ modelId, prompt, params }) =>
      runTracked("run_image", { modelId, promptLen: prompt.length }, (onRunId) =>
        runImage(
          withAbortTracking(
            {
              modelId,
              prompt,
              params: params ?? null,
            },
            onRunId,
          ),
        ),
      ),
  );

  server.tool(
    "run_video",
    "Run a video model. Optional params mirror UI (duration, ratio, reference images / image_pair, …). Result includes artifact.path.",
    {
      modelId: z.string().min(1).describe("ModelDesk model config id"),
      prompt: z.string().min(1).describe("Video prompt"),
      params: z
        .record(z.unknown())
        .optional()
        .describe("Optional run params mirroring the video UI"),
    },
    async ({ modelId, prompt, params }) =>
      runTracked("run_video", { modelId, promptLen: prompt.length }, (onRunId) =>
        runVideo(
          withAbortTracking(
            {
              modelId,
              prompt,
              params: params ?? null,
            },
            onRunId,
          ),
        ),
      ),
  );

  server.tool(
    "run_audio",
    "Run an audio (speech/TTS) model. Optional params mirror UI. Result includes artifact.path when audio is saved.",
    {
      modelId: z.string().min(1).describe("ModelDesk model config id"),
      prompt: z.string().min(1).describe("Audio / TTS prompt or script"),
      params: z
        .record(z.unknown())
        .optional()
        .describe("Optional run params mirroring the audio UI"),
    },
    async ({ modelId, prompt, params }) =>
      runTracked("run_audio", { modelId, promptLen: prompt.length }, (onRunId) =>
        runAudio(
          withAbortTracking(
            {
              modelId,
              prompt,
              params: params ?? null,
            },
            onRunId,
          ),
        ),
      ),
  );

  server.tool(
    "run_music",
    "Run a music model. Optional params mirror UI. Result includes artifact.path when audio is saved.",
    {
      modelId: z.string().min(1).describe("ModelDesk model config id"),
      prompt: z.string().min(1).describe("Music prompt"),
      params: z
        .record(z.unknown())
        .optional()
        .describe("Optional run params mirroring the music UI"),
    },
    async ({ modelId, prompt, params }) =>
      runTracked("run_music", { modelId, promptLen: prompt.length }, (onRunId) =>
        runMusic(
          withAbortTracking(
            {
              modelId,
              prompt,
              params: params ?? null,
            },
            onRunId,
          ),
        ),
      ),
  );

  return server;
}

async function main() {
  ensureDataDirs();
  const enc = getEncryptionSecretStatus();
  log("dataDir", getDataDir());
  log("encryption", {
    configured: enc.configured,
    source: enc.source,
    // path only — never print the secret
    filePath: enc.source === "file" || !enc.configured ? enc.filePath : "(env)",
  });
  if (!enc.configured) {
    log(
      "warning: ENCRYPTION_SECRET not configured — decrypting API keys will fail. Open Web Settings or set ENCRYPTION_SECRET / place .encryption-secret under dataDir.",
    );
  }
  log(
    "starting stdio server (list_models / list_active_runs / cancel_run / run_text|image|video|audio|music)",
  );

  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(
    "[modeldesk-mcp] fatal",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
