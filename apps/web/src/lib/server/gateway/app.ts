/**
 * Shared Gateway HTTP app (Web :3300 default + optional headless :3310).
 * Fetch API Request → Response.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getArtifact } from "@/lib/server/artifacts";
import { ensureDataDirs, getDataDir, resolveDataPath } from "@/lib/server/paths";
import type { RunCoreAgentModality } from "@/lib/server/run-core";
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
import { checkAuthHeader, loadGatewayTokens } from "./auth";
import { chatCompletionsResponse } from "./chat";
import {
  jsonResponse,
  openaiErrorResponse,
  publicOrigin,
  readJsonBody,
} from "./http";
import { mediaGenerateResponse, modeldeskRunResponse } from "./media";
import {
  aliasEntriesForModelsList,
  listGatewayModels,
  resolveModelRef,
} from "./resolve-model";

function log(...args: unknown[]) {
  console.error("[modeldesk-gateway]", ...args);
}

function resolveOpenApiPath(): string | null {
  const candidates = [
    // Web public (default contract location after merge)
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../public/openapi.yaml",
    ),
    // Optional headless package copy
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../../gateway/openapi.yaml",
    ),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function modelsResponse(url: URL): Response {
  const modalityRaw = url.searchParams.get("modality")?.trim() ?? "";
  const modality =
    modalityRaw === "text" ||
    modalityRaw === "image" ||
    modalityRaw === "video" ||
    modalityRaw === "audio" ||
    modalityRaw === "music"
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
 * Auth: MODELDESK_GATEWAY_TOKEN when set (except /healthz, /openapi.yaml).
 */
export async function handleGatewayRequest(req: Request): Promise<Response> {
  ensureDataDirs();
  const url = new URL(req.url);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  const origin = publicOrigin(req);
  const tokens = loadGatewayTokens();

  if (
    req.method === "GET" &&
    (pathname === "/healthz" || pathname === "/health")
  ) {
    return jsonResponse(200, {
      ok: true,
      dataDir: getDataDir(),
      auth: tokens.size > 0,
      gateway: "embedded",
    });
  }

  if (req.method === "GET" && pathname === "/openapi.yaml") {
    return openApiResponse();
  }

  if (!checkAuthHeader(req.headers.get("authorization"), tokens)) {
    return openaiErrorResponse(401, "Unauthorized", "auth_error");
  }

  if (req.method === "GET" && pathname === "/v1/models") {
    return modelsResponse(url);
  }
  if (req.method === "GET" && pathname === "/v1/aliases") {
    return getAliasesResponse();
  }
  if (req.method === "PUT" && pathname === "/v1/aliases") {
    return putAliasesResponse(req);
  }
  if (req.method === "POST" && pathname === "/v1/chat/completions") {
    return chatCompletionsResponse(req);
  }
  if (req.method === "POST" && pathname === "/v1/images/generations") {
    return mediaGenerateResponse(req, {
      modality: "image",
      origin,
      openaiImages: true,
    });
  }
  if (req.method === "POST" && pathname === "/v1/videos/generations") {
    return mediaGenerateResponse(req, { modality: "video", origin });
  }
  if (req.method === "POST" && pathname === "/v1/audio/speech") {
    return mediaGenerateResponse(req, { modality: "audio", origin });
  }
  if (req.method === "POST" && pathname === "/v1/music/generations") {
    return mediaGenerateResponse(req, { modality: "music", origin });
  }
  if (req.method === "POST" && pathname === "/v1/modeldesk/run") {
    return modeldeskRunResponse(req, { origin });
  }

  const artMatch = pathname.match(/^\/v1\/artifacts\/([^/]+)$/);
  if (req.method === "GET" && artMatch) {
    return artifactResponse(decodeURIComponent(artMatch[1]!));
  }

  return openaiErrorResponse(404, `Unknown route ${req.method} ${pathname}`);
}

/** @deprecated kept for smoke / older imports */
export function resolveTextModelRef(model: string) {
  return resolveModelRef(model, "text");
}
