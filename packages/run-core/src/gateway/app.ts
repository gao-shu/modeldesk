/**
 * Shared Gateway HTTP app (Web :3300 default + optional headless :3310).
 * Fetch API Request → Response.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getArtifact } from "../artifacts";
import { ensureDataDirs, getDataDir, resolveDataPath } from "../paths";
import type { RunCoreAgentModality } from "../run-core";
import {
  STABLE_ALIASES,
  aliasesFilePath,
  isStableAlias,
  loadAliases,
  loadStoredAliases,
  saveAliases,
  type AliasMap,
  type StableAlias,
} from "./aliases";
import {
  checkGatewayAuth,
  hostnameFromHostHeader,
  loadGatewayTokens,
} from "./auth";
import { chatCompletionsResponse } from "./chat";
import {
  jsonResponse,
  openaiErrorResponse,
  publicOrigin,
  readJsonBody,
} from "./http";
import {
  mediaGenerateResponse,
  modeldeskRunResponse,
  videosCancelResponse,
  videosContentResponse,
  videosStatusResponse,
  videosSubmitResponse,
} from "./media";
import { acquireGatewaySlot } from "./rate-limit";
import {
  aliasEntriesForModelsList,
  listGatewayModels,
  resolveModelRef,
} from "./resolve-model";

function log(...args: unknown[]) {
  console.error("[modeldesk-gateway]", ...args);
}

function accessLog(fields: Record<string, unknown>) {
  console.log(JSON.stringify({ type: "gateway_access", ...fields }));
}

function requestHostname(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-host");
  const host = forwarded?.split(",")[0]?.trim() || req.headers.get("host");
  const fromHeader = hostnameFromHostHeader(host);
  if (fromHeader) return fromHeader;
  try {
    return new URL(req.url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function resolveOpenApiPath(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // Single source of truth: apps/web/public/openapi.yaml
  const p = path.resolve(here, "../../../../apps/web/public/openapi.yaml");
  return fs.existsSync(p) ? p : null;
}

function modelsResponse(url: URL): Response {
  const modalityRaw = url.searchParams.get("modality")?.trim() ?? "";
  const modality =
    modalityRaw === "text" ||
    modalityRaw === "image" ||
    modalityRaw === "video" ||
    modalityRaw === "audio"
      ? (modalityRaw as RunCoreAgentModality)
      : undefined;

  const models = listGatewayModels(modality);
  const created = Math.floor(Date.now() / 1000);
  const data = [
    ...aliasEntriesForModelsList().filter(
      (a) => !modality || a.modality === modality,
    ),
    ...models.map((m) => ({
      id: m.id,
      object: "model" as const,
      created,
      owned_by: m.provider || "modeldesk",
      root: m.modelId,
      name: m.name,
      modality: m.modality,
      hasApiKey: m.hasApiKey,
    })),
  ];
  return jsonResponse(200, { object: "list", data });
}

function getAliasesResponse(): Response {
  const aliases = loadAliases();
  const entries = (Object.keys(STABLE_ALIASES) as StableAlias[]).map((id) => {
    const target = aliases[id] ?? null;
    const resolved = target ? resolveModelRef(id) : null;
    return {
      alias: id,
      modality: STABLE_ALIASES[id],
      modelId: target,
      resolved: resolved
        ? {
            id: resolved.id,
            name: resolved.name,
            modelId: resolved.modelId,
            provider: resolved.provider,
          }
        : null,
    };
  });
  return jsonResponse(200, {
    file: aliasesFilePath(),
    aliases: entries,
  });
}

async function putAliasesResponse(req: Request): Promise<Response> {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return openaiErrorResponse(400, "Invalid JSON body");
  const body = parsed.body;
  const current = loadStoredAliases();
  const next: AliasMap = { ...current };

  for (const [key, value] of Object.entries(body)) {
    if (!isStableAlias(key)) {
      return openaiErrorResponse(
        400,
        `Unknown alias "${key}". Allowed: ${Object.keys(STABLE_ALIASES).join(", ")}`,
      );
    }
    if (value === null || value === "") {
      delete next[key];
      continue;
    }
    if (typeof value !== "string") {
      return openaiErrorResponse(
        400,
        `Alias "${key}" must be a registry id string or null`,
      );
    }
    const modality = STABLE_ALIASES[key];
    const row = resolveModelRef(value.trim(), modality);
    if (!row) {
      return openaiErrorResponse(
        400,
        `Cannot bind ${key}: no ${modality} model matching "${value}"`,
      );
    }
    next[key] = row.id;
  }

  const saved = saveAliases(next);
  log("aliases updated", saved);
  return getAliasesResponse();
}

function artifactResponse(id: string): Response {
  const row = getArtifact(id);
  if (!row) return openaiErrorResponse(404, "Artifact not found");
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
  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": row.mime || "application/octet-stream",
      "Content-Length": String(buf.byteLength),
      "Cache-Control": "private, max-age=3600",
    },
  });
}

function openApiResponse(): Response {
  const p = resolveOpenApiPath();
  if (!p) return openaiErrorResponse(404, "openapi.yaml not found");
  const raw = fs.readFileSync(p, "utf8");
  return new Response(raw, {
    status: 200,
    headers: {
      "Content-Type": "application/yaml; charset=utf-8",
      "Content-Length": String(Buffer.byteLength(raw)),
    },
  });
}

/**
 * Dispatch a Gateway request. Pathname may be absolute URL path.
 * Auth: loopback-open without tokens; Bearer when tokens set
 * (except /healthz, /openapi.yaml). See SECURITY.md.
 */
export async function handleGatewayRequest(req: Request): Promise<Response> {
  ensureDataDirs();
  const started = Date.now();
  const url = new URL(req.url);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  const origin = publicOrigin(req);
  const tokens = loadGatewayTokens();
  const hostname = requestHostname(req);
  let modelHint: string | undefined;
  let slotRelease: (() => void) | undefined;

  const finish = (response: Response): Response => {
    accessLog({
      method: req.method,
      path: pathname,
      status: response.status,
      ms: Date.now() - started,
      host: hostname || undefined,
      model: modelHint,
    });
    return response;
  };

  try {
    if (
      req.method === "GET" &&
      (pathname === "/healthz" || pathname === "/health")
    ) {
      return finish(
        jsonResponse(200, {
          ok: true,
          dataDir: getDataDir(),
          auth: tokens.size > 0,
          requireToken: process.env.MODELDESK_GATEWAY_REQUIRE_TOKEN === "1",
          allowOpen: process.env.MODELDESK_GATEWAY_ALLOW_OPEN === "1",
          gateway: "embedded",
        }),
      );
    }

    if (req.method === "GET" && pathname === "/openapi.yaml") {
      return finish(openApiResponse());
    }

    const auth = checkGatewayAuth(
      req.headers.get("authorization"),
      tokens,
      hostname,
    );
    if (!auth.ok) {
      return finish(
        openaiErrorResponse(auth.status ?? 401, auth.reason, "auth_error"),
      );
    }

    const slot = acquireGatewaySlot(hostname || "default");
    if (!slot.ok) {
      return finish(
        openaiErrorResponse(slot.status, slot.reason, "rate_limit_error"),
      );
    }
    slotRelease = slot.release;

    if (req.method === "GET" && pathname === "/v1/models") {
      return finish(modelsResponse(url));
    }
    if (req.method === "GET" && pathname === "/v1/aliases") {
      return finish(getAliasesResponse());
    }
    if (req.method === "PUT" && pathname === "/v1/aliases") {
      return finish(await putAliasesResponse(req));
    }
    if (req.method === "POST" && pathname === "/v1/chat/completions") {
      modelHint = "chat";
      return finish(await chatCompletionsResponse(req));
    }
    if (req.method === "POST" && pathname === "/v1/images/generations") {
      modelHint = "image";
      return finish(
        await mediaGenerateResponse(req, {
          modality: "image",
          origin,
          openaiImages: true,
        }),
      );
    }
    if (req.method === "POST" && pathname === "/v1/images/edits") {
      modelHint = "image-edits";
      return finish(
        await mediaGenerateResponse(req, {
          modality: "image",
          origin,
          openaiImages: true,
          imageEdits: true,
        }),
      );
    }
    // Both paths are async submit (same response). Sync wait was removed — poll GET /v1/videos/{id}.
    if (
      req.method === "POST" &&
      (pathname === "/v1/videos" || pathname === "/v1/videos/generations")
    ) {
      modelHint = "video";
      return finish(await videosSubmitResponse(req, { origin }));
    }
    const videoContentMatch = pathname.match(/^\/v1\/videos\/([^/]+)\/content$/);
    if (req.method === "GET" && videoContentMatch) {
      return finish(
        await videosContentResponse(decodeURIComponent(videoContentMatch[1]!)),
      );
    }
    const videoMatch = pathname.match(/^\/v1\/videos\/([^/]+)$/);
    if (videoMatch) {
      const videoId = decodeURIComponent(videoMatch[1]!);
      if (req.method === "GET") {
        return finish(await videosStatusResponse(videoId, { origin }));
      }
      if (req.method === "DELETE") {
        return finish(await videosCancelResponse(videoId, { origin }));
      }
    }
    if (req.method === "POST" && pathname === "/v1/audio/speech") {
      modelHint = "audio";
      return finish(
        await mediaGenerateResponse(req, { modality: "audio", origin }),
      );
    }
    if (req.method === "POST" && pathname === "/v1/modeldesk/run") {
      modelHint = "modeldesk-run";
      return finish(await modeldeskRunResponse(req, { origin }));
    }

    const artMatch = pathname.match(/^\/v1\/artifacts\/([^/]+)$/);
    if (req.method === "GET" && artMatch) {
      return finish(artifactResponse(decodeURIComponent(artMatch[1]!)));
    }

    return finish(
      openaiErrorResponse(404, `Unknown route ${req.method} ${pathname}`),
    );
  } finally {
    slotRelease?.();
  }
}

/** @deprecated kept for smoke / older imports */
export function resolveTextModelRef(model: string) {
  return resolveModelRef(model, "text");
}
