import {
  runAudio,
  runCoreResultToPublic,
  runImage,
  runMusic,
  runVideo,
  type RunCoreAgentModality,
  type RunCoreOutcome,
} from "@/lib/server/run-core";
import { jsonResponse, openaiErrorResponse, readJsonBody } from "./http";
import { resolveModelRef } from "./resolve-model";

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
  ] as const) {
    if (body[key] !== undefined && params[key] === undefined) {
      params[key] = body[key];
    }
  }
  const refs = collectImageRefsFromBody(body);
  if (refs.length === 1 && params.reference_image === undefined) {
    params.reference_image = refs[0];
  } else if (refs.length > 0 && params.reference_images === undefined) {
    params.reference_images = JSON.stringify(refs);
  }
  return params;
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
    case "music":
      return runMusic(base);
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
    modalityHint === "audio" ||
    modalityHint === "music"
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

  const params = paramsFromBody(body);
  const modality = resolved.modality as Exclude<RunCoreAgentModality, "text">;
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
