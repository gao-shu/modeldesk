/**
 * Official thin client for ModelDesk Gateway.
 * Contract: apps/gateway/openapi.yaml (frozen for Phase A consumers).
 */

export type GatewayClientOptions = {
  /** Default http://127.0.0.1:3300 (Web/Desktop). Headless gateway uses :3310. */
  baseUrl?: string;
  /** Optional Bearer token (MODELDESK_GATEWAY_TOKEN) */
  token?: string;
  fetch?: typeof fetch;
};

export type ChatMessage = {
  role: string;
  content: string;
};

export type MediaGenerateInput = {
  model: string;
  prompt?: string;
  input?: string;
  params?: Record<string, unknown>;
  [key: string]: unknown;
};

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export class ModelDeskGatewayClient {
  readonly baseUrl: string;
  private readonly token: string | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: GatewayClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? "http://127.0.0.1:3300").replace(/\/+$/, "");
    this.token = opts.token?.trim() || undefined;
    this.fetchImpl = opts.fetch ?? fetch;
  }

  private headers(jsonBody: boolean): HeadersInit {
    const h: Record<string, string> = {};
    if (jsonBody) h["Content-Type"] = "application/json";
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await this.fetchImpl(joinUrl(this.baseUrl, path), {
      method,
      headers: this.headers(body !== undefined),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      const err =
        data &&
        typeof data === "object" &&
        "error" in data &&
        (data as { error?: { message?: string } }).error?.message
          ? String((data as { error: { message: string } }).error.message)
          : `HTTP ${res.status}`;
      throw new Error(err);
    }
    return data as T;
  }

  healthz() {
    return this.request<{ ok: boolean; dataDir?: string; auth?: boolean }>(
      "GET",
      "/healthz",
    );
  }

  listModels(modality?: string) {
    const q = modality ? `?modality=${encodeURIComponent(modality)}` : "";
    return this.request<{ object: string; data: unknown[] }>(
      "GET",
      `/v1/models${q}`,
    );
  }

  getAliases() {
    return this.request<{
      file: string;
      aliases: Array<{
        alias: string;
        modality: string;
        modelId: string | null;
        resolved: unknown;
      }>;
    }>("GET", "/v1/aliases");
  }

  putAliases(aliases: Record<string, string | null>) {
    return this.request("PUT", "/v1/aliases", aliases);
  }

  chatCompletions(input: {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
  }) {
    return this.request("POST", "/v1/chat/completions", input);
  }

  imagesGenerations(input: MediaGenerateInput) {
    return this.request("POST", "/v1/images/generations", input);
  }

  /** Img2img / edits — requires image | image_urls | params.reference_images. */
  imagesEdits(input: MediaGenerateInput) {
    return this.request("POST", "/v1/images/edits", input);
  }

  videosGenerations(input: MediaGenerateInput) {
    return this.request("POST", "/v1/videos/generations", input);
  }

  audioSpeech(input: MediaGenerateInput) {
    return this.request("POST", "/v1/audio/speech", input);
  }

  musicGenerations(input: MediaGenerateInput) {
    return this.request("POST", "/v1/music/generations", input);
  }

  modeldeskRun(
    input: MediaGenerateInput & {
      modality?: "image" | "video" | "audio" | "music";
    },
  ) {
    return this.request("POST", "/v1/modeldesk/run", input);
  }

  artifactUrl(id: string): string {
    return joinUrl(this.baseUrl, `/v1/artifacts/${encodeURIComponent(id)}`);
  }
}

export function createGatewayClient(opts?: GatewayClientOptions) {
  return new ModelDeskGatewayClient(opts);
}
