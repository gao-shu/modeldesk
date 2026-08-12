import { RegistryError } from "./errors";
import type { ModelRegistry } from "./registry";
import type {
  ResolvedConfig,
  VideoArtifact,
  VideoSubmitInput,
  VideoTaskStatus,
  VideoTaskStatusValue,
} from "./types";

/** Adapter-level options passed after resolve + param merge (host builds these). */
export type VideoGenerateAdapterInput = {
  resolved: ResolvedConfig;
  prompt: string;
  params: Record<string, unknown>;
  signal?: AbortSignal;
  timeoutMs?: number;
  onStatus?: (status: VideoTaskStatusValue, detail?: string) => void;
  onHttpLog?: (log: { url: string; body: Record<string, unknown> }) => void;
};

export type VideoGenerateAdapterResult = {
  bytes: Uint8Array;
  mime: string;
  extension: string;
  remoteUrl?: string;
  latencyMs: number;
  taskId?: string;
  usage?: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  } | null;
};

export type VideoRuntime = {
  submitVideo: (input: VideoSubmitInput) => Promise<{ taskId: string }>;
  getVideoStatus: (taskId: string) => Promise<VideoTaskStatus>;
  waitVideo: (input: VideoSubmitInput) => Promise<VideoTaskStatus>;
};

type InternalTask = VideoTaskStatus & {
  promise?: Promise<VideoTaskStatus>;
};

function toArtifact(
  result: VideoGenerateAdapterResult,
): VideoArtifact {
  const bytes = result.bytes;
  return {
    bytes,
    mime: result.mime,
    extension: result.extension,
    remoteUrl: result.remoteUrl,
    fileSize: bytes.byteLength,
  };
}

/**
 * Standard async video facade. Host injects resolve + generateVideo adapter.
 * Phase-1: waitVideo maps 1:1 to the existing monolithic generateVideo.
 */
export function createVideoRuntime(opts: {
  registry: Pick<ModelRegistry, "resolveConfig">;
  generateVideo: (
    input: VideoGenerateAdapterInput,
  ) => Promise<VideoGenerateAdapterResult>;
}): VideoRuntime {
  const tasks = new Map<string, InternalTask>();
  let seq = 0;

  async function runGenerate(
    taskId: string,
    input: VideoSubmitInput,
  ): Promise<VideoTaskStatus> {
    const existing = tasks.get(taskId);
    if (!existing) {
      throw new RegistryError("not_found", `Unknown task: ${taskId}`);
    }

    try {
      const resolved = await opts.registry.resolveConfig(input.configId);
      existing.status = "running";
      existing.message = "generating";

      const result = await opts.generateVideo({
        resolved,
        prompt: input.prompt,
        params: input.params ?? {},
        signal: input.signal,
        timeoutMs: input.timeoutMs,
        onStatus: (status, detail) => {
          const t = tasks.get(taskId);
          if (t && t.status !== "succeeded" && t.status !== "failed") {
            t.status = status;
            t.message = detail ?? status;
          }
          input.onStatus?.(status, detail);
        },
        onHttpLog: input.onHttpLog,
      });

      const done: VideoTaskStatus = {
        taskId,
        configId: input.configId,
        status: "succeeded",
        progress: 100,
        message: "succeeded",
        artifact: toArtifact(result),
        latencyMs: result.latencyMs,
        upstreamTaskId: result.taskId ?? null,
        error: null,
        usage: result.usage ?? null,
      };
      tasks.set(taskId, done);
      return done;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Video generation failed";
      const code =
        err instanceof RegistryError
          ? err.code
          : message.toLowerCase().includes("timeout")
            ? "timeout"
            : "upstream_error";
      const failed: VideoTaskStatus = {
        taskId,
        configId: input.configId,
        status: "failed",
        message,
        artifact: null,
        error: { code, message },
      };
      tasks.set(taskId, failed);
      if (err instanceof RegistryError) throw err;
      throw new RegistryError(
        code === "timeout" ? "timeout" : "upstream_error",
        message,
        err,
      );
    }
  }

  async function waitVideo(input: VideoSubmitInput): Promise<VideoTaskStatus> {
    const taskId = `local-${Date.now()}-${++seq}`;
    const seed: InternalTask = {
      taskId,
      configId: input.configId,
      status: "queued",
      progress: null,
      message: "queued",
      artifact: null,
      error: null,
    };
    tasks.set(taskId, seed);
    return runGenerate(taskId, input);
  }

  async function submitVideo(
    input: VideoSubmitInput,
  ): Promise<{ taskId: string }> {
    const taskId = `local-${Date.now()}-${++seq}`;
    const seed: InternalTask = {
      taskId,
      configId: input.configId,
      status: "queued",
      progress: null,
      message: "queued",
      artifact: null,
      error: null,
    };
    const promise = runGenerate(taskId, input);
    seed.promise = promise;
    tasks.set(taskId, seed);
    void promise.catch(() => {
      /* status stored on task */
    });
    return { taskId };
  }

  async function getVideoStatus(taskId: string): Promise<VideoTaskStatus> {
    const t = tasks.get(taskId);
    if (!t) {
      throw new RegistryError("not_found", `Unknown task: ${taskId}`);
    }
    const { promise: _p, ...status } = t;
    return status;
  }

  return { submitVideo, getVideoStatus, waitVideo };
}
