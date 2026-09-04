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
  runText,
  runVideo,
  type RunCoreAgentModality,
  type RunCoreOutcome,
  type RunPreparedInfo,
  type RunSingleModelInput,
} from "@/lib/server/run-core";
import {
  ensureDataDirs,
  getDataDir,
  refreshAgentDataDir,
  resolveAgentDataDir,
  type AgentDataDirSource,
} from "@/lib/server/paths";
import { resolveModelRef } from "@/lib/server/gateway/resolve-model";
import { closeDb } from "@/lib/server/db";

function log(...args: unknown[]) {
  console.error("[modeldesk-mcp]", ...args);
}

/** Last resolveAgentDataDir source (for list_models). */
let dataDirSource: AgentDataDirSource = "local";

/** Re-follow :3300 before tools so Trae matches the Desk that is open now. */
async function syncDataDirFromDesk(): Promise<void> {
  const result = await refreshAgentDataDir();
  dataDirSource = result.source;
  if (result.changed) {
    closeDb();
    ensureDataDirs();
    log("dataDir switched to", result.dataDir, `(${result.source})`);
  }
}

function resolveRunModelId(
  modelRef: string,
  expectModality: RunCoreAgentModality,
): { ok: true; modelId: string } | { ok: false; error: string } {
  const resolved = resolveModelRef(modelRef, expectModality);
  if (!resolved) {
    return {
      ok: false,
      error: `Unknown ${expectModality} model "${modelRef}". Use list_models (registry UUID or unique config name).`,
    };
  }
  return { ok: true, modelId: resolved.id };
}

function isMockModel(m: { provider: string; baseUrl: string | null }): boolean {
  return (
    m.provider === "mock" ||
    (m.baseUrl ?? "").toLowerCase().startsWith("mock://")
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
  await syncDataDirFromDesk();
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
      isError: outcome.kind === "prepare_error" ? true : !outcome.result.ok,
    };
  } finally {
    untrack(runId);
  }
}

function modelResolveError(error: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ ok: false, error }, null, 2),
      },
    ],
    isError: true as const,
  };
}

const modalitySchema = z.enum(["text", "image", "video", "audio"]);

function createServer(): McpServer {
  const server = new McpServer({
    name: "modeldesk",
    version: "0.1.0",
  });

  server.tool(
    "list_models",
    "List ModelDesk-registered models for agent tools (text/image/video/audio). Same local DB as the Web UI when Desk is running (follows :3300 dataDir).",
    {
      modality: modalitySchema
        .optional()
        .describe("Optional filter by modality"),
    },
    async ({ modality }) => {
      await syncDataDirFromDesk();
      const models = listRunModelsForAgent(
        modality as RunCoreAgentModality | undefined,
      ).filter((m) => !isMockModel(m));
      const enc = getEncryptionSecretStatus();
      const dataDir = getDataDir();
      const payload = {
        dataDir,
        dataDirSource,
        hint:
          dataDirSource === "live_desk"
            ? "Using dataDir from running Desk (:3300/:3310 healthz)."
            : "Desk not reached — using local data-location / MODELDESK_DATA_DIR. Start Desk if models look wrong.",
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
    "Run a text (chat) model. modelId: registry UUID or unique config name from list_models.",
    {
      modelId: z
        .string()
        .min(1)
        .describe("Registry UUID or unique config name from list_models"),
      prompt: z.string().min(1).describe("User prompt"),
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().int().min(1).max(128_000).optional(),
    },
    async ({ modelId, prompt, temperature, maxTokens }) => {
      const resolved = resolveRunModelId(modelId, "text");
      if (!resolved.ok) return modelResolveError(resolved.error);
      return runTracked(
        "run_text",
        { modelId: resolved.modelId, promptLen: prompt.length },
        (onRunId) =>
          runText(
            withAbortTracking(
              {
                modelId: resolved.modelId,
                prompt,
                temperature: temperature ?? null,
                maxTokens: maxTokens ?? null,
              },
              onRunId,
            ),
          ),
      );
    },
  );

  server.tool(
    "run_image",
    "Run an image model. modelId: registry UUID or unique config name. Optional params mirror UI.",
    {
      modelId: z
        .string()
        .min(1)
        .describe("Registry UUID or unique config name from list_models"),
      prompt: z.string().min(1).describe("Image prompt"),
      params: z
        .record(z.unknown())
        .optional()
        .describe(
          "Optional run params (size, ratio, quality, reference_images, …)",
        ),
    },
    async ({ modelId, prompt, params }) => {
      const resolved = resolveRunModelId(modelId, "image");
      if (!resolved.ok) return modelResolveError(resolved.error);
      return runTracked(
        "run_image",
        { modelId: resolved.modelId, promptLen: prompt.length },
        (onRunId) =>
          runImage(
            withAbortTracking(
              {
                modelId: resolved.modelId,
                prompt,
                params: params ?? null,
              },
              onRunId,
            ),
          ),
      );
    },
  );

  server.tool(
    "run_video",
    "Run a video model. modelId: registry UUID or unique config name. Optional params mirror UI.",
    {
      modelId: z
        .string()
        .min(1)
        .describe("Registry UUID or unique config name from list_models"),
      prompt: z.string().min(1).describe("Video prompt"),
      params: z
        .record(z.unknown())
        .optional()
        .describe("Optional run params mirroring the video UI"),
    },
    async ({ modelId, prompt, params }) => {
      const resolved = resolveRunModelId(modelId, "video");
      if (!resolved.ok) return modelResolveError(resolved.error);
      return runTracked(
        "run_video",
        { modelId: resolved.modelId, promptLen: prompt.length },
        (onRunId) =>
          runVideo(
            withAbortTracking(
              {
                modelId: resolved.modelId,
                prompt,
                params: params ?? null,
              },
              onRunId,
            ),
          ),
      );
    },
  );

  server.tool(
    "run_audio",
    "Run an audio (speech/TTS) model. modelId: registry UUID or unique config name.",
    {
      modelId: z
        .string()
        .min(1)
        .describe("Registry UUID or unique config name from list_models"),
      prompt: z.string().min(1).describe("Audio / TTS prompt or script"),
      params: z
        .record(z.unknown())
        .optional()
        .describe("Optional run params mirroring the audio UI"),
    },
    async ({ modelId, prompt, params }) => {
      const resolved = resolveRunModelId(modelId, "audio");
      if (!resolved.ok) return modelResolveError(resolved.error);
      return runTracked(
        "run_audio",
        { modelId: resolved.modelId, promptLen: prompt.length },
        (onRunId) =>
          runAudio(
            withAbortTracking(
              {
                modelId: resolved.modelId,
                prompt,
                params: params ?? null,
              },
              onRunId,
            ),
          ),
      );
    },
  );

  return server;
}

async function main() {
  const resolved = await resolveAgentDataDir();
  dataDirSource = resolved.source;
  closeDb();
  ensureDataDirs();
  const enc = getEncryptionSecretStatus();
  log("dataDir", getDataDir(), `(${resolved.source})`);
  log("encryption", {
    configured: enc.configured,
    source: enc.source,
    filePath: enc.source === "file" || !enc.configured ? enc.filePath : "(env)",
  });
  if (!enc.configured) {
    log(
      "warning: ENCRYPTION_SECRET not configured — decrypting API keys will fail. Open Web Settings or set ENCRYPTION_SECRET / place .encryption-secret under dataDir.",
    );
  }
  log(
    "starting stdio server (list_models / list_active_runs / cancel_run / run_text|image|video|audio)",
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
