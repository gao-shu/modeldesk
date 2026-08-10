/**
 * Short-lived client cache so soft-navigating between pages does not
 * always wait on /api/models again.
 */

export type CachedModelPublic = {
  id: string;
  name: string;
  modality: string;
  capability: string;
  provider: string;
  modelId: string;
  baseUrl?: string | null;
  hasApiKey: boolean;
  defaults: Record<string, unknown>;
  apiKeyMasked?: string | null;
};

const TTL_MS = 30_000;

let cache: { at: number; models: CachedModelPublic[] } | null = null;
let inflight: Promise<CachedModelPublic[]> | null = null;
const listeners = new Set<() => void>();

function emitModelsCache() {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

/** Keep-alive pages subscribe so they pick up models created elsewhere. */
export function subscribeModelsCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function peekCachedModels(): CachedModelPublic[] | null {
  if (!cache) return null;
  if (Date.now() - cache.at > TTL_MS) return null;
  return cache.models;
}

export function setCachedModels(models: CachedModelPublic[]): void {
  cache = { at: Date.now(), models };
}

export function invalidateCachedModels(): void {
  cache = null;
  emitModelsCache();
}

export async function fetchModelsCached(
  options?: { force?: boolean },
): Promise<CachedModelPublic[]> {
  if (!options?.force) {
    const hit = peekCachedModels();
    if (hit) return hit;
    if (inflight) return inflight;
  }

  const req = (async () => {
    const res = await fetch("/api/models", { cache: "no-store" });
    const data = (await res.json()) as {
      ok: boolean;
      models?: CachedModelPublic[];
      error?: string;
    };
    if (!res.ok || !data.ok || !Array.isArray(data.models)) {
      throw new Error(data.error ?? `加载模型失败（HTTP ${res.status}）`);
    }
    setCachedModels(data.models);
    return data.models;
  })();

  if (!options?.force) inflight = req;
  try {
    return await req;
  } finally {
    if (inflight === req) inflight = null;
  }
}
