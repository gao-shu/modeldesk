import fs from "node:fs";
import path from "node:path";
import { getArtifact, listArtifactsForJob } from "@/lib/server/artifacts";
import { coerceMediaUrlList } from "@/lib/server/media-url-list";
import { resolveDataPath } from "@/lib/server/paths";
import {
  runAudio,
  runCoreResultToPublic,
  runImage,
  runVideo,
  submitVideo,
  type RunCoreAgentModality,
  type RunCoreOutcome,
} from "@/lib/server/run-core";
import { abortRun } from "@/lib/server/run-abort";
import {
  cancelRunJobs,
  getJob,
  getRun,
  getRunWithJob,
  toPublicJob,
} from "@/lib/server/runs";
import { jsonResponse, openaiErrorResponse, readJsonBody } from "./http";
import { resolveModelRef } from "./resolve-model";
import {
  isoToUnixSeconds,
  mapJobStatusToVideoStatus,
  progressFromJobState,
} from "./video-task";

function log(...args: unknown[]) {
  console.error("[modeldesk-gateway]", ...args);
}

function artifactUrl(origin: string, artifactId: string): string {
  return `${origin.replace(/\/+$/, "")}/v1/artifacts/${artifactId}`;
}

/** Prefer upstream CDN URL for external callers; fall back to local /v1/artifacts. */
function mediaPublicUrl(
  origin: string,
  artifact: { id: string; remoteUrl?: string | null },
): string {
  const remote = artifact.remoteUrl?.trim();
  if (remote && /^https?:\/\//i.test(remote)) return remote;
  return artifactUrl(origin, artifact.id);
}

function pushImageRef(out: string[], value: unknown): void {
  if (typeof value === "string" && value.trim()) {
    out.push(value.trim());
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) pushImageRef(out, item);
    return;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.url === "string") pushImageRef(out, obj.url);
    else if (typeof obj.b64_json === "string") {
      const mime =
        typeof obj.mime === "string" && obj.mime.trim()
          ? obj.mime.trim()
          : "image/png";
      pushImageRef(out, `data:${mime};base64,${obj.b64_json.trim()}`);
    }
  }
}

/** OpenAI-shaped + ModelDesk params → reference URLs / data URIs. */
export function collectImageRefsFromBody(
  body: Record<string, unknown>,
): string[] {
  const out: string[] = [];
  pushImageRef(out, body.image);
  pushImageRef(out, body.images);
  pushImageRef(out, body.image_url);
  pushImageRef(out, body.image_urls);
  pushImageRef(out, body.input_reference);
  const params =
    body.params && typeof body.params === "object" && !Array.isArray(body.params)
      ? (body.params as Record<string, unknown>)
      : null;
  if (params) {
    pushImageRef(out, params.image);
    pushImageRef(out, params.images);
    pushImageRef(out, params.image_url);
    pushImageRef(out, params.image_urls);
    pushImageRef(out, params.reference_images);
    pushImageRef(out, params.reference_image);
    pushImageRef(out, params.reference_image_2);
    pushImageRef(out, params.input_reference);
  }
  return [...new Set(out)];
}

function paramsFromBody(body: Record<string, unknown>): Record<string, unknown> {
  const params =
    body.params && typeof body.params === "object" && !Array.isArray(body.params)
      ? { ...(body.params as Record<string, unknown>) }
      : {};
  for (const key of [
    "size",
    "quality",
    "style",
    "n",
    "response_format",
    "voice",
    "speed",
    "format",
    "duration",
    "duration_sec",
    "seconds",
    "mode",
    "aspect_ratio",
    "resolution",
    "input_reference",
    "reference_image",
    "reference_image_end",
    "reference_images",
    "reference_audios",
  ] as const) {
    if (body[key] !== undefined && params[key] === undefined) {
      params[key] = body[key];
    }
  }

  // Normalize OpenAI-shaped [{url}] / string[] into string URL lists.
  if (params.reference_images !== undefined) {
    const urls = coerceMediaUrlList(params.reference_images);
    if (urls.length > 0) params.reference_images = urls;
    else delete params.reference_images;
  }
  if (params.reference_audios !== undefined) {
    const urls = coerceMediaUrlList(params.reference_audios);
    if (urls.length > 0) params.reference_audios = urls;
    else delete params.reference_audios;
  }
  if (typeof params.reference_image === "object" && params.reference_image) {
    const urls = coerceMediaUrlList(params.reference_image);
    if (urls[0]) params.reference_image = urls[0];
    else delete params.reference_image;
  }
  if (
    typeof params.reference_image_end === "object" &&
    params.reference_image_end
  ) {
    const urls = coerceMediaUrlList(params.reference_image_end);
    if (urls[0]) params.reference_image_end = urls[0];
    else delete params.reference_image_end;
  }

  // Also pick up top-level image / image_urls aliases when refs not set yet.
  const refs = collectImageRefsFromBody(body);
  // Include top-level reference_images objects that collectImageRefsFromBody
  // may miss when only nested under body (it already reads params.*; body top
  // level is copied above and normalized).
  const topRefs = coerceMediaUrlList(body.reference_images);
  const mergedRefs = [...new Set([...refs, ...topRefs])];

  // External / gateway callers: when image URLs are present but neither
  // reference_image nor reference_images was set explicitly, default to
  // multi-ref (reference_images) so MiniMax H3 etc. emit content[].role=
  // reference_image — not first_frame. Explicit reference_image(_end) still
  // selects first/last-frame mode.
  if (
    mergedRefs.length > 0 &&
    params.reference_images === undefined &&
    params.reference_image === undefined
  ) {
    params.reference_images = mergedRefs;
  }
  return params;
}

/**
 * External video callers: prefer multi-ref (`reference_images` / `reference_audios`)
 * so URLs go to upstream content[].role=reference_image|reference_audio.
 * Explicit first+last frame (reference_image + reference_image_end) is preserved.
 */
function preferMultiRefVideoParams(
  params: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...params };
  const end =
    typeof out.reference_image_end === "string"
      ? out.reference_image_end.trim()
      : "";
  const first =
    typeof out.reference_image === "string" ? out.reference_image.trim() : "";

  const existingImages = coerceMediaUrlList(out.reference_images);
  const existingAudios = coerceMediaUrlList(out.reference_audios);
  if (existingAudios.length > 0) {
    out.reference_audios = existingAudios;
  } else {
    delete out.reference_audios;
  }

  if (existingImages.length > 0) {
    out.reference_images = existingImages;
    if (!end) {
      delete out.reference_image;
      delete out.reference_image_end;
    }
    return out;
  }

  // Single first-frame field only → treat as one-item multi-ref.
  if (first && !end) {
    const firstUrls = coerceMediaUrlList(first);
    out.reference_images = firstUrls.length > 0 ? firstUrls : [first];
    delete out.reference_image;
    delete out.reference_image_end;
  }
  return out;
}

function promptFromBody(body: Record<string, unknown>): string {
  if (typeof body.prompt === "string") return body.prompt;
  if (typeof body.input === "string") return body.input;
  return "";
}

async function runModality(
  modality: RunCoreAgentModality,
  input: {
    modelId: string;
    prompt: string;
    params: Record<string, unknown>;
  },
): Promise<RunCoreOutcome> {
  const base = {
    modelId: input.modelId,
    prompt: input.prompt,
    params: input.params,
  };
  switch (modality) {
    case "image":
      return runImage(base);
    case "video":
      return runVideo(base);
    case "audio":
      return runAudio(base);
    default:
      return {
        kind: "prepare_error",
        error: `Unsupported modality ${modality}`,
        code: "modality_mismatch",
      };
  }
}

function modeldeskMeta(
  pub: ReturnType<typeof runCoreResultToPublic>,
  origin: string,
) {
  const artifacts =
    pub.artifacts?.map((a) => ({
      id: a.id,
      type: a.type,
      mime: a.mime,
      path: a.path,
      remoteUrl: a.remoteUrl,
      url: mediaPublicUrl(origin, a),
    })) ?? null;
  return {
    runId: pub.runId,
    jobId: pub.jobId,
    latencyMs: pub.latencyMs,
    artifactId: pub.artifactId,
    artifact: artifacts?.[0] ?? null,
    artifacts,
  };
}

export async function mediaGenerateResponse(
  req: Request,
  opts: {
    modality: Exclude<RunCoreAgentModality, "text">;
    origin: string;
    openaiImages?: boolean;
    /** POST /v1/images/edits — require at least one reference image. */
    imageEdits?: boolean;
  },
): Promise<Response> {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return openaiErrorResponse(400, "Invalid JSON body");
  const body = parsed.body;

  const modelRef = typeof body.model === "string" ? body.model.trim() : "";
  if (!modelRef) return openaiErrorResponse(400, "Missing model");

  const resolved = resolveModelRef(modelRef, opts.modality);
  if (!resolved) {
    return openaiErrorResponse(
      404,
      `Unknown ${opts.modality} model "${modelRef}". Use GET /v1/models or configure a stable alias.`,
    );
  }

  const prompt = promptFromBody(body).trim();
  if (!prompt) {
    return openaiErrorResponse(400, "prompt (or input) is required");
  }

  const params = paramsFromBody(body);
  if (opts.imageEdits) {
    const refs = collectImageRefsFromBody(body);
    if (refs.length === 0) {
      return openaiErrorResponse(
        400,
        "image / image_urls / reference_images required for /v1/images/edits",
      );
    }
  }

  const outcome = await runModality(opts.modality, {
    modelId: resolved.id,
    prompt,
    params,
  });

  if (outcome.kind === "prepare_error") {
    return openaiErrorResponse(400, outcome.error);
  }

  const pub = runCoreResultToPublic(outcome);
  if (!pub.ok) {
    return openaiErrorResponse(502, pub.error ?? "Upstream run failed");
  }

  const created = Math.floor(Date.now() / 1000);
  const meta = modeldeskMeta(pub, opts.origin);

  log(`${opts.modality}.generate`, {
    model: resolved.id,
    ok: true,
    latencyMs: pub.latencyMs,
  });

  if (opts.openaiImages) {
    return jsonResponse(200, {
      created,
      data: (pub.artifacts ?? []).map((a) => ({
        url: mediaPublicUrl(opts.origin, a),
        b64_json: null,
      })),
      model: resolved.id,
      modeldesk: meta,
    });
  }

  return jsonResponse(200, {
    created,
    model: resolved.id,
    modality: opts.modality,
    prompt,
    content: pub.content,
    data: (pub.artifacts ?? []).map((a) => ({
      url: mediaPublicUrl(opts.origin, a),
      remoteUrl: a.remoteUrl,
      path: a.path,
      mime: a.mime,
      id: a.id,
    })),
    modeldesk: meta,
  });
}

function remoteUrlFromMeta(meta: Record<string, unknown>): string | null {
  const raw = meta.remoteUrl;
  if (typeof raw !== "string") return null;
  const url = raw.trim();
  return /^https?:\/\//i.test(url) ? url : null;
}

function resolveVideoJob(id: string): {
  job: ReturnType<typeof toPublicJob>;
  runId: string;
} | null {
  const byJob = getJob(id);
  if (byJob) {
    return { job: toPublicJob(byJob), runId: byJob.run_id };
  }
  const byRun = getRunWithJob(id);
  if (byRun?.job) {
    return { job: byRun.job, runId: byRun.run.id };
  }
  return null;
}

function videoTaskPayload(
  job: ReturnType<typeof toPublicJob>,
  origin: string,
  extras?: { cancelled?: boolean },
) {
  const status = extras?.cancelled
    ? "failed"
    : mapJobStatusToVideoStatus(job.status);
  const response =
    job.response && typeof job.response === "object" && !Array.isArray(job.response)
      ? (job.response as Record<string, unknown>)
      : null;
  const progress = progressFromJobState({
    jobStatus: extras?.cancelled ? "cancelled" : job.status,
    response,
  });

  const arts: Array<{
    id: string;
    mime: string | null;
    path: string | null;
    remoteUrl: string | null;
    url: string;
  }> = listArtifactsForJob(job.id).map((a) => {
    const remoteUrl = remoteUrlFromMeta(a.meta);
    return {
      id: a.id,
      mime: a.mime,
      path: a.uri,
      remoteUrl,
      url: mediaPublicUrl(origin, { id: a.id, remoteUrl }),
    };
  });

  // Prefer artifact rows; fall back to response_json.artifactId / remoteUrl.
  if (arts.length === 0 && response) {
    const artifactId =
      typeof response.artifactId === "string" ? response.artifactId.trim() : "";
    const remote =
      typeof response.remoteUrl === "string" &&
      /^https?:\/\//i.test(response.remoteUrl.trim())
        ? response.remoteUrl.trim()
        : null;
    if (artifactId) {
      arts.push({
        id: artifactId,
        mime: null,
        path: null,
        remoteUrl: remote,
        url: mediaPublicUrl(origin, { id: artifactId, remoteUrl: remote }),
      });
    } else if (remote) {
      arts.push({
        id: "",
        mime: null,
        path: null,
        remoteUrl: remote,
        url: remote,
      });
    }
  }

  const primaryUrl = arts[0]?.url ?? null;
  const errorMessage =
    status === "failed"
      ? job.error ||
        (extras?.cancelled ? "已取消" : null) ||
        "Video generation failed"
      : null;

  return {
    id: job.id,
    object: "video" as const,
    created_at: isoToUnixSeconds(job.createdAt),
    status,
    progress,
    model: job.modelId,
    ...(primaryUrl && status === "completed" ? { url: primaryUrl } : {}),
    ...(status === "completed"
      ? {
          data: arts.map((a) => ({
            url: a.url,
            remoteUrl: a.remoteUrl,
            path: a.path,
            mime: a.mime,
            id: a.id || undefined,
          })),
        }
      : {}),
    ...(errorMessage
      ? { error: { message: errorMessage, type: "video_error" } }
      : {}),
    modeldesk: {
      runId: job.runId,
      jobId: job.id,
      latencyMs: job.latencyMs,
      artifactId: arts[0]?.id || null,
      artifacts: status === "completed" ? arts : null,
    },
  };
}

/** POST /v1/videos — async submit; returns immediately with task id. */
export async function videosSubmitResponse(
  req: Request,
  opts: { origin: string },
): Promise<Response> {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return openaiErrorResponse(400, "Invalid JSON body");
  const body = parsed.body;

  const modelRef = typeof body.model === "string" ? body.model.trim() : "";
  if (!modelRef) return openaiErrorResponse(400, "Missing model");

  const resolved = resolveModelRef(modelRef, "video");
  if (!resolved) {
    return openaiErrorResponse(
      404,
      `Unknown video model "${modelRef}". Use GET /v1/models or configure a stable alias.`,
    );
  }

  const prompt = promptFromBody(body).trim();
  if (!prompt) {
    return openaiErrorResponse(400, "prompt (or input) is required");
  }

  const params = preferMultiRefVideoParams(paramsFromBody(body));
  const outcome = submitVideo({
    modelId: resolved.id,
    prompt,
    params,
  });

  if (outcome.kind === "prepare_error") {
    return openaiErrorResponse(400, outcome.error);
  }

  log("video.submit", {
    model: resolved.id,
    runId: outcome.runId,
    jobId: outcome.jobId,
  });

  return jsonResponse(200, {
    id: outcome.jobId,
    object: "video",
    created_at: Math.floor(Date.now() / 1000),
    status: "queued",
    model: resolved.id,
    progress: 0,
    modeldesk: {
      runId: outcome.runId,
      jobId: outcome.jobId,
    },
  });
}

/** GET /v1/videos/{id} — poll async video task (id = jobId or runId). */
export function videosStatusResponse(
  id: string,
  opts: { origin: string },
): Response {
  const resolved = resolveVideoJob(id);
  if (!resolved) {
    return openaiErrorResponse(404, `Unknown video task "${id}"`);
  }
  return jsonResponse(200, videoTaskPayload(resolved.job, opts.origin));
}

/**
 * GET /v1/videos/{id}/content — OpenAI Videos–shaped binary download.
 * Serves the local artifact already saved when the job completed (no upstream re-fetch).
 */
export function videosContentResponse(id: string): Response {
  const resolved = resolveVideoJob(id);
  if (!resolved) {
    return openaiErrorResponse(404, `Unknown video task "${id}"`);
  }

  const pubStatus = mapJobStatusToVideoStatus(resolved.job.status);
  if (pubStatus !== "completed") {
    return openaiErrorResponse(
      409,
      `Video task is not ready (status=${pubStatus}). Poll GET /v1/videos/{id} until completed.`,
    );
  }

  const arts = listArtifactsForJob(resolved.job.id);
  let artifactId = arts[0]?.id?.trim() || "";
  if (!artifactId) {
    const response =
      resolved.job.response &&
      typeof resolved.job.response === "object" &&
      !Array.isArray(resolved.job.response)
        ? (resolved.job.response as Record<string, unknown>)
        : null;
    const fromResponse =
      typeof response?.artifactId === "string" ? response.artifactId.trim() : "";
    artifactId = fromResponse;
  }
  if (!artifactId) {
    return openaiErrorResponse(
      404,
      "No local video artifact for this task. Use the CDN url from GET /v1/videos/{id} if present.",
    );
  }

  const row = getArtifact(artifactId);
  if (!row) {
    return openaiErrorResponse(404, "Artifact not found");
  }
  let abs: string;
  try {
    abs = resolveDataPath(row.uri);
  } catch {
    return openaiErrorResponse(404, "Artifact path invalid");
  }
  if (!fs.existsSync(abs)) {
    return openaiErrorResponse(404, "Artifact file missing");
  }

  const buf = fs.readFileSync(abs);
  const ext = path.extname(abs) || ".mp4";
  const filename = `${artifactId}${ext.startsWith(".") ? ext : `.${ext}`}`;
  log("video.content", {
    jobId: resolved.job.id,
    artifactId,
    bytes: buf.byteLength,
  });
  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": row.mime || "video/mp4",
      "Content-Length": String(buf.byteLength),
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

/** DELETE /v1/videos/{id} — cancel in-flight task. */
export function videosCancelResponse(
  id: string,
  opts: { origin: string },
): Response {
  const resolved = resolveVideoJob(id);
  if (!resolved) {
    return openaiErrorResponse(404, `Unknown video task "${id}"`);
  }
  const run = getRun(resolved.runId);
  if (!run) {
    return openaiErrorResponse(404, `Unknown video task "${id}"`);
  }

  const jobStatus = resolved.job.status;
  if (jobStatus === "succeeded" || jobStatus === "failed" || jobStatus === "cancelled") {
    return jsonResponse(200, videoTaskPayload(resolved.job, opts.origin));
  }

  abortRun(resolved.runId);
  cancelRunJobs(resolved.runId, "已取消");

  const refreshed = getJob(resolved.job.id);
  const job = refreshed ? toPublicJob(refreshed) : resolved.job;
  log("video.cancel", { jobId: job.id, runId: resolved.runId });
  return jsonResponse(
    200,
    videoTaskPayload(job, opts.origin, { cancelled: true }),
  );
}

export async function modeldeskRunResponse(
  req: Request,
  opts: { origin: string },
): Promise<Response> {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return openaiErrorResponse(400, "Invalid JSON body");
  const body = parsed.body;

  const modelRef = typeof body.model === "string" ? body.model.trim() : "";
  if (!modelRef) return openaiErrorResponse(400, "Missing model");

  const modalityHint =
    typeof body.modality === "string" ? body.modality.trim() : "";
  const expect =
    modalityHint === "image" ||
    modalityHint === "video" ||
    modalityHint === "audio"
      ? modalityHint
      : null;

  const resolved = resolveModelRef(modelRef, expect);
  if (!resolved) {
    return openaiErrorResponse(
      404,
      `Unknown model "${modelRef}". Use GET /v1/models or a stable alias.`,
    );
  }

  if (resolved.modality === "text") {
    return openaiErrorResponse(
      400,
      "Text models use POST /v1/chat/completions",
    );
  }

  const prompt = promptFromBody(body).trim();
  if (!prompt) {
    return openaiErrorResponse(400, "prompt (or input) is required");
  }

  const rawParams = paramsFromBody(body);
  const modality = resolved.modality as Exclude<RunCoreAgentModality, "text">;
  const params =
    modality === "video" ? preferMultiRefVideoParams(rawParams) : rawParams;

  // Video is async-only on the gateway — same contract as POST /v1/videos.
  if (modality === "video") {
    const outcome = submitVideo({
      modelId: resolved.id,
      prompt,
      params,
    });
    if (outcome.kind === "prepare_error") {
      return openaiErrorResponse(400, outcome.error);
    }
    log("modeldesk.run.video.submit", {
      model: resolved.id,
      runId: outcome.runId,
      jobId: outcome.jobId,
    });
    return jsonResponse(200, {
      id: outcome.jobId,
      object: "video",
      created_at: Math.floor(Date.now() / 1000),
      status: "queued",
      model: resolved.id,
      modality: "video",
      progress: 0,
      modeldesk: {
        runId: outcome.runId,
        jobId: outcome.jobId,
      },
    });
  }

  const outcome = await runModality(modality, {
    modelId: resolved.id,
    prompt,
    params,
  });

  if (outcome.kind === "prepare_error") {
    return openaiErrorResponse(400, outcome.error);
  }

  const pub = runCoreResultToPublic(outcome);
  if (!pub.ok) {
    return openaiErrorResponse(502, pub.error ?? "Upstream run failed");
  }

  log("modeldesk.run", {
    model: resolved.id,
    modality,
    ok: true,
    latencyMs: pub.latencyMs,
  });

  return jsonResponse(200, {
    created: Math.floor(Date.now() / 1000),
    model: resolved.id,
    modality,
    prompt,
    content: pub.content,
    data: (pub.artifacts ?? []).map((a) => ({
      url: mediaPublicUrl(opts.origin, a),
      remoteUrl: a.remoteUrl,
      path: a.path,
      mime: a.mime,
      id: a.id,
    })),
    modeldesk: modeldeskMeta(pub, opts.origin),
  });
}
