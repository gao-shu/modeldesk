/**
 * Shared run core for Web UI, MCP, CLI, and gateway.
 * One path: resolve model → create single run → executeModelJob.
 * SSE stays in the HTTP route via `onPrepared` / `onEvent`; MCP can await the result only.
 */

import fs from "node:fs";
import { resolveRunParams } from "@modeldesk/shared";
import { getArtifact } from "@/lib/server/artifacts";
import {
  executeModelJob,
  type JobExecResult,
} from "@/lib/server/execute-job";
import {
  getModel,
  getModelApiKey,
  listModels,
  toPublicModel,
  type ModelPublic,
  type ModelRow,
} from "@/lib/server/models";
import { resolveDataPath } from "@/lib/server/paths";
import { createSingleRun } from "@/lib/server/runs";
import {
  isRunCoreAgentModality,
  isRunCoreMvpModality,
  prepareErrorHttpStatus,
  RUN_CORE_AGENT_MODALITIES,
  RUN_CORE_MVP_MODALITIES,
  type RunCoreAgentModality,
  type RunCoreMvpModality,
  type RunCorePrepareErrorCode,
} from "@/lib/server/run-core-meta";

export {
  isRunCoreAgentModality,
  isRunCoreMvpModality,
  prepareErrorHttpStatus,
  RUN_CORE_AGENT_MODALITIES,
  RUN_CORE_MVP_MODALITIES,
  type RunCoreAgentModality,
  type RunCoreMvpModality,
};

export type RunModelSummary = {
  id: string;
  name: string;
  modality: string;
  capability: string;
  provider: string;
  modelId: string;
  baseUrl: string | null;
  hasApiKey: boolean;
};

export type RunCorePrepareError = {
  kind: "prepare_error";
  error: string;
  code: RunCorePrepareErrorCode;
};

export type RunPreparedInfo = {
  runId: string;
  jobId: string;
  modality: string;
  params: Record<string, unknown>;
  model: {
    id: string;
    name: string;
    modelId: string;
    provider: string;
    modality: string;
  };
};

export type RunCoreCompleted = {
  kind: "completed";
  runId: string;
  jobId: string;
  modality: string;
  params: Record<string, unknown>;
  model: RunPreparedInfo["model"];
  result: JobExecResult;
};

export type RunCoreOutcome = RunCorePrepareError | RunCoreCompleted;

export type RunSingleModelInput = {
  modelId: string;
  prompt: string;
  temperature?: number | null;
  maxTokens?: number | null;
  params?: Record<string, unknown> | null;
  suiteId?: string | null;
  caseId?: string | null;
  signal?: AbortSignal | null;
  onEvent?: (event: string, data: unknown) => void;
  /**
   * Fired after the run/job rows exist, before upstream execute.
   * Return an AbortSignal to use for the job (e.g. registerRunAbort);
   * otherwise `input.signal` is used.
   */
  onPrepared?: (info: RunPreparedInfo) => AbortSignal | void | null;
  /** When set, reject if the model modality differs. */
  expectModality?: string | null;
};

function toSummary(m: ModelPublic): RunModelSummary {
  return {
    id: m.id,
    name: m.name,
    modality: m.modality,
    capability: m.capability,
    provider: m.provider,
    modelId: m.modelId,
    baseUrl: m.baseUrl,
    hasApiKey: m.hasApiKey,
  };
}

/** List registered models (optional modality filter). */
export function listRunModels(modality?: string): RunModelSummary[] {
  return listModels(modality).map(toSummary);
}

/** List models suitable for agent surfaces (text/image/video/audio/music). */
export function listRunModelsForAgent(
  modality?: RunCoreAgentModality,
): RunModelSummary[] {
  if (modality) {
    return listRunModels(modality);
  }
  return listRunModels().filter((m) => isRunCoreAgentModality(m.modality));
}

/** @deprecated Prefer listRunModelsForAgent */
export function listRunModelsForMvp(
  modality?: RunCoreAgentModality,
): RunModelSummary[] {
  return listRunModelsForAgent(modality);
}

export function getRunModel(id: string): RunModelSummary | null {
  const row = getModel(id);
  if (!row) return null;
  return toSummary(toPublicModel(row));
}

/**
 * Validate model readiness without creating a run (for HTTP 4xx before SSE).
 */
export function checkRunModelReady(
  modelId: string,
  expectModality?: string | null,
): RunCorePrepareError | { ok: true; row: ModelRow; apiKey: string | null } {
  const row = getModel(modelId);
  if (!row) {
    return {
      kind: "prepare_error",
      error: "Model not found",
      code: "not_found",
    };
  }

  if (expectModality && row.modality !== expectModality) {
    return {
      kind: "prepare_error",
      error: `Model modality is ${row.modality}, expected ${expectModality}`,
      code: "modality_mismatch",
    };
  }

  const isMock = (row.base_url ?? "").startsWith("mock://");
  const apiKey = getModelApiKey(modelId);
  if (!apiKey && !isMock) {
    return {
      kind: "prepare_error",
      error: "Model has no API key",
      code: "no_key",
    };
  }

  if (!row.base_url?.trim()) {
    return {
      kind: "prepare_error",
      error: "Model has no base URL",
      code: "no_base_url",
    };
  }

  return { ok: true, row, apiKey };
}

/**
 * Create a persisted single-run + execute via adapters.
 * HTTP routes pass `onPrepared` (meta + abort) and `onEvent` (SSE);
 * MCP/CLI can omit both and await the final result.
 */
export async function runSingleModel(
  input: RunSingleModelInput,
): Promise<RunCoreOutcome> {
  const ready = checkRunModelReady(input.modelId, input.expectModality);
  if (!("ok" in ready)) return ready;

  const { row, apiKey } = ready;
  const publicModel = toPublicModel(row);
  const params = resolveRunParams(row.modality, publicModel.defaults, {
    ...(input.params ?? {}),
    ...(input.temperature != null ? { temperature: input.temperature } : {}),
    ...(input.maxTokens != null ? { max_tokens: input.maxTokens } : {}),
  });
  const temperature =
    typeof params.temperature === "number" ? params.temperature : null;
  const maxTokens =
    typeof params.max_tokens === "number" ? params.max_tokens : null;

  const { run, job } = createSingleRun({
    modelId: row.id,
    prompt: input.prompt,
    temperature,
    maxTokens,
    params,
    modality: row.modality,
    suiteId: input.suiteId,
    caseId: input.caseId,
    modelSnapshot: {
      id: publicModel.id,
      name: publicModel.name,
      provider: publicModel.provider,
      modelId: publicModel.modelId,
      baseUrl: publicModel.baseUrl,
      modality: publicModel.modality,
    },
  });

  const modelMeta: RunPreparedInfo["model"] = {
    id: publicModel.id,
    name: publicModel.name,
    modelId: publicModel.modelId,
    provider: publicModel.provider,
    modality: publicModel.modality,
  };

  const prepared: RunPreparedInfo = {
    runId: run.id,
    jobId: job.id,
    modality: row.modality,
    params,
    model: modelMeta,
  };

  const fromPrepared = input.onPrepared?.(prepared);
  const signal =
    fromPrepared instanceof AbortSignal
      ? fromPrepared
      : (input.signal ?? null);

  const result = await executeModelJob({
    runId: run.id,
    jobId: job.id,
    row,
    apiKey: apiKey ?? "mock",
    prompt: input.prompt,
    temperature,
    maxTokens,
    params,
    signal,
    onEvent: input.onEvent,
  });

  return {
    kind: "completed",
    runId: run.id,
    jobId: job.id,
    modality: row.modality,
    params,
    model: modelMeta,
    result,
  };
}

/** Convenience: run a text model (prepare error if modality ≠ text). */
export async function runText(
  input: Omit<RunSingleModelInput, "expectModality">,
): Promise<RunCoreOutcome> {
  return runSingleModel({ ...input, expectModality: "text" });
}

/** Convenience: run an image model (prepare error if modality ≠ image). */
export async function runImage(
  input: Omit<RunSingleModelInput, "expectModality">,
): Promise<RunCoreOutcome> {
  return runSingleModel({ ...input, expectModality: "image" });
}

/** Convenience: run a video model. */
export async function runVideo(
  input: Omit<RunSingleModelInput, "expectModality">,
): Promise<RunCoreOutcome> {
  return runSingleModel({ ...input, expectModality: "video" });
}

/** Convenience: run an audio (TTS/speech) model. */
export async function runAudio(
  input: Omit<RunSingleModelInput, "expectModality">,
): Promise<RunCoreOutcome> {
  return runSingleModel({ ...input, expectModality: "audio" });
}

/** Convenience: run a music model. */
export async function runMusic(
  input: Omit<RunSingleModelInput, "expectModality">,
): Promise<RunCoreOutcome> {
  return runSingleModel({ ...input, expectModality: "music" });
}

export type RunCoreArtifactPublic = {
  id: string;
  type: string | null;
  mime: string | null;
  /** Absolute filesystem path under the data dir (for agents / CLI). */
  path: string | null;
  relativeUri: string | null;
  url: string;
};

function toArtifactPublic(id: string): RunCoreArtifactPublic {
  const row = getArtifact(id);
  if (!row) {
    return {
      id,
      type: null,
      mime: null,
      path: null,
      relativeUri: null,
      url: `/api/artifacts/${id}`,
    };
  }
  let abs: string | null = null;
  try {
    abs = resolveDataPath(row.uri);
    if (!fs.existsSync(abs)) abs = null;
  } catch {
    abs = null;
  }
  return {
    id: row.id,
    type: row.type,
    mime: row.mime,
    path: abs,
    relativeUri: row.uri,
    url: `/api/artifacts/${row.id}`,
  };
}

/** Flatten a completed outcome into a JSON-friendly agent payload. */
export function runCoreResultToPublic(outcome: RunCoreCompleted): {
  ok: boolean;
  cancelled: boolean;
  runId: string;
  jobId: string;
  modality: string;
  model: RunCoreCompleted["model"];
  params: Record<string, unknown>;
  content: string;
  artifactId: string | null;
  artifactIds: string[] | null;
  /** Primary artifact with absolute `path` when present. */
  artifact: RunCoreArtifactPublic | null;
  /** All artifacts (multi-image etc.) with absolute paths. */
  artifacts: RunCoreArtifactPublic[] | null;
  latencyMs: number;
  ttftMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  error: string | null;
  artifactMeta: Record<string, unknown> | null;
} {
  const { result } = outcome;
  const ids =
    result.artifactIds && result.artifactIds.length > 0
      ? result.artifactIds
      : result.artifactId
        ? [result.artifactId]
        : [];
  const artifacts = ids.length > 0 ? ids.map(toArtifactPublic) : null;
  return {
    ok: result.ok,
    cancelled: Boolean(result.cancelled),
    runId: outcome.runId,
    jobId: outcome.jobId,
    modality: outcome.modality,
    model: outcome.model,
    params: outcome.params,
    content: result.content,
    artifactId: result.artifactId,
    artifactIds: result.artifactIds ?? null,
    artifact: artifacts?.[0] ?? null,
    artifacts,
    latencyMs: result.latencyMs,
    ttftMs: result.ttftMs,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd,
    error: result.error ?? null,
    artifactMeta: result.artifactMeta ?? null,
  };
}
