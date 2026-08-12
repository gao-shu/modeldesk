/**
 * China-market video APIs: 可灵 Kling · MiniMax 海螺 · 生数 Vidu.
 * Kept separate from the OpenAI-style poller in video.ts.
 */

import { createHmac } from "node:crypto";
import { downloadBytes } from "./images";
import {
  defaultVideoPollTiming,
  nextPollDelayMs,
  sleep,
} from "./poll";
import type { TokenUsage } from "./usage";
import type { VideoGenOptions, VideoGenResult } from "./video";

function normalizeBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function getPath(obj: unknown, path: string): unknown {
  const parts = path.split(".").filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    if (Array.isArray(cur) && /^\d+$/.test(p)) {
      cur = cur[Number(p)];
      continue;
    }
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function pollSleep(
  pollIntervalMs: number,
  timingIntervalMs: number,
  maxPollIntervalMs: number,
  signal?: AbortSignal,
): Promise<number> {
  const next = nextPollDelayMs({
    currentMs: pollIntervalMs,
    baseMs: timingIntervalMs,
    maxMs: maxPollIntervalMs,
  });
  return sleep(next, signal).then(() => next);
}

/** Official Kling: AccessKey:SecretKey → HS256 JWT (iss/exp/nbf). */
export function signKlingJwt(
  accessKey: string,
  secretKey: string,
  ttlSec = 1800,
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: accessKey,
      exp: now + ttlSec,
      nbf: now - 5,
    }),
  ).toString("base64url");
  const signingInput = `${header}.${payload}`;
  const sig = createHmac("sha256", secretKey)
    .update(signingInput)
    .digest("base64url");
  return `${signingInput}.${sig}`;
}

/**
 * Resolve Authorization token for Kling.
 * - `ak:sk` / `ak|sk` → mint JWT (official api.klingai.com)
 * - otherwise treat as ready Bearer (relay / pre-minted JWT)
 */
export function resolveKlingBearer(apiKey: string): string {
  const raw = apiKey.trim();
  const sep = raw.includes("|") ? "|" : raw.includes(":") ? ":" : null;
  if (sep) {
    const i = raw.indexOf(sep);
    const ak = raw.slice(0, i).trim();
    const sk = raw.slice(i + 1).trim();
    if (ak && sk && !ak.includes(" ")) {
      return signKlingJwt(ak, sk);
    }
  }
  return raw.replace(/^Bearer\s+/i, "");
}

function klingAuthHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${resolveKlingBearer(apiKey)}`,
    "Content-Type": "application/json",
  };
}

function stripDataUri(value: string): string {
  const m = /^data:[^;]+;base64,(.+)$/i.exec(value.trim());
  return m ? m[1]! : value.trim();
}

// ─── Kling ───────────────────────────────────────────────────────────

export async function generateKlingVideo(
  options: VideoGenOptions,
): Promise<VideoGenResult> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? 600_000;
  const signal =
    options.signal ??
    (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(timeoutMs)
      : undefined);

  let base = normalizeBase(options.baseUrl);
  if (!/\/v\d+/i.test(base) && !base.includes("/kling/")) {
    base = `${base}/v1`;
  }

  const ref = options.referenceImage?.trim();
  const isI2v = Boolean(ref);
  const submitPath = isI2v ? "/videos/image2video" : "/videos/text2video";
  // Official duration enum is typically "5" | "10"
  const durationSec =
    options.durationSec != null && options.durationSec > 0
      ? options.durationSec
      : 5;
  const duration = durationSec >= 8 ? "10" : "5";
  const modeRaw = (options.mode ?? "std").trim().toLowerCase();
  const mode = modeRaw === "pro" || modeRaw === "professional" ? "pro" : "std";

  const body: Record<string, unknown> = {
    model_name: options.model,
    prompt: options.prompt,
    mode,
    duration,
    aspect_ratio: options.aspectRatio?.trim() || "16:9",
  };
  if (options.withAudio === true) body.sound = "on";
  if (isI2v && ref) {
    body.image = stripDataUri(ref);
  }

  const submitUrl = `${base}${submitPath}`;
  options.onHttpLog?.({
    url: submitUrl,
    body: { ...body, image: body.image ? "[redacted]" : undefined },
  });
  options.onStatus?.("queued");

  const submitRes = await fetch(submitUrl, {
    method: "POST",
    headers: klingAuthHeaders(options.apiKey),
    body: JSON.stringify(body),
    signal,
  });
  const submitText = await submitRes.text();
  let submitJson: unknown = null;
  try {
    submitJson = submitText ? JSON.parse(submitText) : null;
  } catch {
    /* ignore */
  }
  if (!submitRes.ok) {
    throw new Error(
      `可灵提交失败 (${submitRes.status}): ${submitText.slice(0, 300)}`,
    );
  }
  const code = getPath(submitJson, "code");
  if (code != null && Number(code) !== 0) {
    throw new Error(
      `可灵提交失败: ${String(getPath(submitJson, "message") ?? submitText).slice(0, 300)}`,
    );
  }

  const taskId = String(
    getPath(submitJson, "data.task_id") ??
      getPath(submitJson, "task_id") ??
      "",
  );
  if (!taskId) throw new Error("可灵响应缺少 task_id");

  const timing = defaultVideoPollTiming({ apiFormat: "video.kling" });
  let pollIntervalMs = options.pollIntervalMs ?? timing.intervalMs;
  const maxPollIntervalMs = Math.max(pollIntervalMs, timing.maxIntervalMs);
  options.onStatus?.("running", taskId);
  if (timing.initialDelayMs > 0) await sleep(timing.initialDelayMs, signal);

  const pollKind = isI2v ? "image2video" : "text2video";
  const deadline = Date.now() + timeoutMs;
  let remoteUrl: string | undefined;

  while (Date.now() < deadline) {
    const pollUrl = `${base}/videos/${pollKind}/${encodeURIComponent(taskId)}`;
    const pollRes = await fetch(pollUrl, {
      headers: klingAuthHeaders(options.apiKey),
      signal,
    });
    const pollText = await pollRes.text();
    let pollJson: unknown = null;
    try {
      pollJson = pollText ? JSON.parse(pollText) : null;
    } catch {
      /* ignore */
    }
    if (!pollRes.ok) {
      throw new Error(
        `可灵查询失败 (${pollRes.status}): ${pollText.slice(0, 200)}`,
      );
    }
    const pCode = getPath(pollJson, "code");
    if (pCode != null && Number(pCode) !== 0) {
      throw new Error(
        `可灵查询失败: ${String(getPath(pollJson, "message") ?? pollText).slice(0, 200)}`,
      );
    }

    const status = String(
      getPath(pollJson, "data.task_status") ??
        getPath(pollJson, "data.status") ??
        "",
    ).toLowerCase();
    if (status === "succeed" || status === "success" || status === "succeeded") {
      remoteUrl = String(
        getPath(pollJson, "data.task_result.videos.0.url") ?? "",
      );
      if (!remoteUrl) throw new Error("可灵成功但未返回视频 URL");
      break;
    }
    if (status === "failed" || status === "fail" || status === "error") {
      throw new Error(
        `可灵生成失败: ${String(
          getPath(pollJson, "data.task_status_msg") ??
            getPath(pollJson, "message") ??
            status,
        ).slice(0, 200)}`,
      );
    }
    options.onStatus?.("running", status || taskId);
    pollIntervalMs = await pollSleep(
      pollIntervalMs,
      timing.intervalMs,
      maxPollIntervalMs,
      signal,
    );
  }

  if (!remoteUrl) throw new Error("可灵生成超时");
  options.onStatus?.("downloading");
  const { bytes, mime } = await downloadBytes(remoteUrl, signal);
  options.onStatus?.("succeeded");
  return {
    bytes,
    mime: mime || "video/mp4",
    extension: "mp4",
    remoteUrl,
    latencyMs: Date.now() - started,
    taskId,
    usage: null,
  };
}

// ─── MiniMax Hailuo ──────────────────────────────────────────────────

function minimaxRoot(baseUrl: string): string {
  let u = normalizeBase(baseUrl);
  if (u.startsWith("minimax://")) u = "https://api.minimaxi.com";
  u = u.replace(/\/v1$/i, "").replace(/\/v2$/i, "");
  return u;
}

function isMinimaxH3(model: string): boolean {
  return /minimax-h3|^h3$/i.test(model.trim());
}

async function minimaxRetrieveFileUrl(
  root: string,
  apiKey: string,
  fileId: string,
  signal?: AbortSignal,
): Promise<string> {
  const url = `${root}/v1/files/retrieve?file_id=${encodeURIComponent(fileId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    throw new Error(`MiniMax 取文件失败 (${res.status}): ${text.slice(0, 200)}`);
  }
  const download =
    getPath(json, "file.download_url") ??
    getPath(json, "download_url") ??
    getPath(json, "file.downloadUrl");
  if (!download) throw new Error("MiniMax 文件响应缺少 download_url");
  return String(download);
}

function normalizeHailuoResolution(
  raw: string | undefined,
  h3: boolean,
): string {
  const r = (raw ?? "").trim().toUpperCase().replace(/P$/, "P");
  if (h3) {
    if (r === "2K" || r === "1080P" || r === "1080") return "2K";
    return "768P";
  }
  if (r === "1080P" || r === "1080") return "1080P";
  if (r === "720P" || r === "720") return "720P";
  return "768P";
}

export async function generateMinimaxHailuoVideo(
  options: VideoGenOptions,
): Promise<VideoGenResult> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? 600_000;
  const signal =
    options.signal ??
    (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(timeoutMs)
      : undefined);
  const root = minimaxRoot(options.baseUrl);
  const headers = {
    Authorization: `Bearer ${options.apiKey}`,
    "Content-Type": "application/json",
  };
  const h3 = isMinimaxH3(options.model);
  const ref = options.referenceImage?.trim();
  const refEnd = options.referenceImageEnd?.trim();

  let submitUrl: string;
  let body: Record<string, unknown>;

  if (h3) {
    submitUrl = `${root}/v2/video_generation`;
    const content: Record<string, unknown>[] = [
      { type: "text", text: options.prompt },
    ];
    if (ref) {
      content.push({
        type: "image_url",
        image_url: { url: ref },
        role: "first_frame",
      });
    }
    if (refEnd) {
      content.push({
        type: "image_url",
        image_url: { url: refEnd },
        role: "last_frame",
      });
    }
    const duration =
      options.durationSec != null && options.durationSec > 0
        ? Math.min(15, Math.max(4, Math.round(options.durationSec)))
        : 5;
    body = {
      model: options.model,
      content,
      duration,
      resolution: normalizeHailuoResolution(options.resolution, true),
    };
    if (!ref && !refEnd) {
      const ratio = options.aspectRatio?.trim() || "16:9";
      body.ratio = ratio === "adaptive" ? "16:9" : ratio;
    }
  } else {
    submitUrl = `${root}/v1/video_generation`;
    const duration =
      options.durationSec != null && options.durationSec > 0
        ? Math.round(options.durationSec)
        : 6;
    body = {
      model: options.model,
      prompt: options.prompt,
      duration,
      resolution: normalizeHailuoResolution(options.resolution, false),
      prompt_optimizer: true,
    };
    if (ref) {
      body.first_frame_image = ref;
    }
  }

  options.onHttpLog?.({
    url: submitUrl,
    body: {
      ...body,
      content: h3 ? "[multimodal]" : undefined,
      first_frame_image: body.first_frame_image ? "[redacted]" : undefined,
    },
  });
  options.onStatus?.("queued");

  const submitRes = await fetch(submitUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });
  const submitText = await submitRes.text();
  let submitJson: unknown = null;
  try {
    submitJson = submitText ? JSON.parse(submitText) : null;
  } catch {
    /* ignore */
  }
  if (!submitRes.ok) {
    throw new Error(
      `MiniMax 视频提交失败 (${submitRes.status}): ${submitText.slice(0, 300)}`,
    );
  }
  const baseCode = getPath(submitJson, "base_resp.status_code");
  if (baseCode != null && Number(baseCode) !== 0) {
    throw new Error(
      `MiniMax 视频提交失败: ${String(getPath(submitJson, "base_resp.status_msg") ?? submitText).slice(0, 300)}`,
    );
  }

  const taskId = String(
    getPath(submitJson, "task_id") ?? getPath(submitJson, "task.id") ?? "",
  );
  if (!taskId) throw new Error("MiniMax 响应缺少 task_id");

  const timing = defaultVideoPollTiming({ apiFormat: "video.minimax-hailuo" });
  let pollIntervalMs = options.pollIntervalMs ?? Math.max(timing.intervalMs, 8_000);
  const maxPollIntervalMs = Math.max(pollIntervalMs, timing.maxIntervalMs);
  options.onStatus?.("running", taskId);
  if (timing.initialDelayMs > 0) await sleep(timing.initialDelayMs, signal);

  const deadline = Date.now() + timeoutMs;
  let remoteUrl: string | undefined;
  const usage: TokenUsage | null = null;

  while (Date.now() < deadline) {
    const pollUrl = h3
      ? `${root}/v2/query/video_generation/${encodeURIComponent(taskId)}`
      : `${root}/v1/query/video_generation?task_id=${encodeURIComponent(taskId)}`;
    const pollRes = await fetch(pollUrl, {
      headers: { Authorization: headers.Authorization },
      signal,
    });
    const pollText = await pollRes.text();
    let pollJson: unknown = null;
    try {
      pollJson = pollText ? JSON.parse(pollText) : null;
    } catch {
      /* ignore */
    }
    if (!pollRes.ok) {
      throw new Error(
        `MiniMax 查询失败 (${pollRes.status}): ${pollText.slice(0, 200)}`,
      );
    }

    if (h3) {
      const status = String(
        getPath(pollJson, "task.status") ?? getPath(pollJson, "status") ?? "",
      ).toLowerCase();
      if (status === "succeeded" || status === "success") {
        remoteUrl = String(
          getPath(pollJson, "task.content.url") ??
            getPath(pollJson, "content.url") ??
            "",
        );
        if (!remoteUrl) throw new Error("MiniMax H3 成功但无 content.url");
        break;
      }
      if (status === "failed" || status === "cancelled" || status === "fail") {
        throw new Error(
          `MiniMax 生成失败: ${String(
            getPath(pollJson, "task.error.message") ??
              getPath(pollJson, "task.error") ??
              status,
          ).slice(0, 200)}`,
        );
      }
    } else {
      const status = String(getPath(pollJson, "status") ?? "");
      if (status === "Success" || status.toLowerCase() === "success") {
        const fileId = String(getPath(pollJson, "file_id") ?? "");
        if (!fileId) throw new Error("MiniMax 成功但无 file_id");
        remoteUrl = await minimaxRetrieveFileUrl(
          root,
          options.apiKey,
          fileId,
          signal,
        );
        break;
      }
      if (
        status === "Fail" ||
        status.toLowerCase() === "fail" ||
        status.toLowerCase() === "failed"
      ) {
        throw new Error(
          `MiniMax 生成失败: ${String(getPath(pollJson, "base_resp.status_msg") ?? status).slice(0, 200)}`,
        );
      }
    }

    options.onStatus?.("running", taskId);
    pollIntervalMs = await pollSleep(
      pollIntervalMs,
      timing.intervalMs,
      maxPollIntervalMs,
      signal,
    );
  }

  if (!remoteUrl) throw new Error("MiniMax 视频生成超时");
  options.onStatus?.("downloading");
  const { bytes, mime } = await downloadBytes(remoteUrl, signal);
  options.onStatus?.("succeeded");
  return {
    bytes,
    mime: mime || "video/mp4",
    extension: "mp4",
    remoteUrl,
    latencyMs: Date.now() - started,
    taskId,
    usage,
  };
}

// ─── Vidu ────────────────────────────────────────────────────────────

export async function generateViduVideo(
  options: VideoGenOptions,
): Promise<VideoGenResult> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? 600_000;
  const signal =
    options.signal ??
    (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(timeoutMs)
      : undefined);

  let base = normalizeBase(options.baseUrl);
  if (!/\/ent\/v2$/i.test(base)) {
    if (/vidu\.(cn|com)/i.test(base)) {
      const origin = base.replace(/\/ent(\/v2)?$/i, "");
      base = `${origin.replace(/\/+$/, "")}/ent/v2`;
    }
  }

  const headers = {
    Authorization: `Token ${options.apiKey.replace(/^Token\s+/i, "")}`,
    "Content-Type": "application/json",
  };

  const ref = options.referenceImage?.trim();
  const refEnd = options.referenceImageEnd?.trim();
  const duration =
    options.durationSec != null && options.durationSec > 0
      ? Math.round(options.durationSec)
      : 5;

  let submitPath: string;
  let body: Record<string, unknown>;

  if (ref && refEnd) {
    submitPath = "/start-end2video";
    body = {
      model: options.model,
      prompt: options.prompt,
      duration,
      images: [ref, refEnd],
      resolution: options.resolution?.trim() || "720p",
    };
  } else if (ref) {
    submitPath = "/img2video";
    body = {
      model: options.model,
      prompt: options.prompt,
      duration,
      images: [ref],
      resolution: options.resolution?.trim() || "720p",
      aspect_ratio: options.aspectRatio?.trim() || "16:9",
    };
  } else {
    submitPath = "/text2video";
    body = {
      model: options.model,
      prompt: options.prompt,
      duration,
      aspect_ratio: options.aspectRatio?.trim() || "16:9",
      resolution: options.resolution?.trim() || "720p",
      audio: options.withAudio !== false,
    };
  }

  const submitUrl = `${base}${submitPath}`;
  options.onHttpLog?.({
    url: submitUrl,
    body: {
      ...body,
      images: body.images ? "[redacted]" : undefined,
    },
  });
  options.onStatus?.("queued");

  const submitRes = await fetch(submitUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });
  const submitText = await submitRes.text();
  let submitJson: unknown = null;
  try {
    submitJson = submitText ? JSON.parse(submitText) : null;
  } catch {
    /* ignore */
  }
  if (!submitRes.ok) {
    throw new Error(
      `Vidu 提交失败 (${submitRes.status}): ${submitText.slice(0, 300)}`,
    );
  }

  const taskId = String(
    getPath(submitJson, "task_id") ?? getPath(submitJson, "id") ?? "",
  );
  if (!taskId) throw new Error("Vidu 响应缺少 task_id");

  const timing = defaultVideoPollTiming({ apiFormat: "video.vidu" });
  let pollIntervalMs = options.pollIntervalMs ?? timing.intervalMs;
  const maxPollIntervalMs = Math.max(pollIntervalMs, timing.maxIntervalMs);
  options.onStatus?.("running", taskId);
  if (timing.initialDelayMs > 0) await sleep(timing.initialDelayMs, signal);

  const deadline = Date.now() + timeoutMs;
  let remoteUrl: string | undefined;

  while (Date.now() < deadline) {
    const pollUrl = `${base}/tasks/${encodeURIComponent(taskId)}/creations`;
    const pollRes = await fetch(pollUrl, { headers, signal });
    const pollText = await pollRes.text();
    let pollJson: unknown = null;
    try {
      pollJson = pollText ? JSON.parse(pollText) : null;
    } catch {
      /* ignore */
    }
    if (!pollRes.ok) {
      throw new Error(
        `Vidu 查询失败 (${pollRes.status}): ${pollText.slice(0, 200)}`,
      );
    }
    const state = String(
      getPath(pollJson, "state") ?? getPath(pollJson, "status") ?? "",
    ).toLowerCase();
    if (state === "success" || state === "succeeded") {
      remoteUrl = String(getPath(pollJson, "creations.0.url") ?? "");
      if (!remoteUrl) throw new Error("Vidu 成功但无 creations.url");
      break;
    }
    if (state === "failed" || state === "fail" || state === "error") {
      throw new Error(
        `Vidu 生成失败: ${String(getPath(pollJson, "err_code") ?? state).slice(0, 200)}`,
      );
    }
    options.onStatus?.("running", state || taskId);
    pollIntervalMs = await pollSleep(
      pollIntervalMs,
      timing.intervalMs,
      maxPollIntervalMs,
      signal,
    );
  }

  if (!remoteUrl) throw new Error("Vidu 生成超时");
  options.onStatus?.("downloading");
  const { bytes, mime } = await downloadBytes(remoteUrl, signal);
  options.onStatus?.("succeeded");
  return {
    bytes,
    mime: mime || "video/mp4",
    extension: "mp4",
    remoteUrl,
    latencyMs: Date.now() - started,
    taskId,
    usage: null,
  };
}
