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

  /**
   * Async video submit (alias path). Same contract as `videosCreate` —
   * returns immediately with task id; poll `videosGet`.
   */
  videosGenerations(input: MediaGenerateInput) {
    return this.videosCreate(input, "/v1/videos/generations");
  }

  /** Async video submit — returns immediately with task id. */
  videosCreate(
    input: MediaGenerateInput,
    path: "/v1/videos" | "/v1/videos/generations" = "/v1/videos",
  ) {
    return this.request<{
      id: string;
      object: "video";
      created_at: number;
      status: string;
      model?: string;
      progress?: number;
      modeldesk?: { runId: string; jobId: string };
    }>("POST", path, input);
  }

  /** Poll async video task (id = job id from videosCreate). */
  videosGet(id: string) {
    return this.request<{
      id: string;
      object: "video";
      created_at: number;
      status: string;
      progress?: number;
      model?: string;
      url?: string;
      data?: Array<{
        url: string;
        remoteUrl?: string | null;
        mime?: string | null;
        id?: string;
      }>;
      error?: { message: string; type?: string };
      modeldesk?: Record<string, unknown>;
    }>("GET", `/v1/videos/${encodeURIComponent(id)}`);
  }

  /** Cancel an in-flight async video task. */
  videosCancel(id: string) {
    return this.request("DELETE", `/v1/videos/${encodeURIComponent(id)}`);
  }

  /**
   * Download completed video bytes (OpenAI Videos–shaped).
   * Serves ModelDesk local artifact — poll until `completed` first.
   */
  async videosContent(id: string): Promise<{
    bytes: Uint8Array;
    contentType: string;
    status: number;
  }> {
    const res = await this.fetchImpl(
      joinUrl(this.baseUrl, `/v1/videos/${encodeURIComponent(id)}/content`),
      {
        method: "GET",
        headers: this.headers(false),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      let message = `HTTP ${res.status}`;
      try {
        const data = text ? (JSON.parse(text) as { error?: { message?: string } }) : null;
        if (data?.error?.message) message = String(data.error.message);
      } catch {
        if (text.trim()) message = text.slice(0, 200);
      }
      throw new Error(message);
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    return {
      bytes: buf,
      contentType: res.headers.get("content-type") || "video/mp4",
      status: res.status,
    };
  }

  audioSpeech(input: MediaGenerateInput) {
    return this.request("POST", "/v1/audio/speech", input);
  }

  modeldeskRun(
    input: MediaGenerateInput & {
      modality?: "image" | "video" | "audio";
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
