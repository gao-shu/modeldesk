/**
 * China-market video APIs: 可灵 Kling · MiniMax 海螺 · 生数 Vidu.
 * Kept separate from the OpenAI-style poller in video.ts.
 */

import {
  inferApiBaseUrlMode,
  resolveApiActionUrl,
  resolveApiBaseUrl,
  VIDEO_WAIT_TIMEOUT_MS,
} from "@modeldesk/shared";
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
  const timeoutMs = options.timeoutMs ?? VIDEO_WAIT_TIMEOUT_MS;
  const signal =
    options.signal ??
    (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(timeoutMs)
      : undefined);

  const formatId = options.apiFormat ?? "video.kling";
  const mode =
    options.baseUrlMode ??
    inferApiBaseUrlMode(options.baseUrl, formatId);
  let base = normalizeBase(
    resolveApiBaseUrl(options.baseUrl, formatId) || options.baseUrl,
  );
  if (!/\/v\d+/i.test(base) && !base.includes("/kling/")) {
    base = `${base}/v1`;
  }

  const ref = options.referenceImage?.trim();
  const isI2v = Boolean(ref);
  const defaultSubmitPath = isI2v ? "/videos/image2video" : "/videos/text2video";
  // Official duration enum is typically "5" | "10"
  const durationSec =
    options.durationSec != null && options.durationSec > 0
      ? options.durationSec
      : 5;
  const duration = durationSec >= 8 ? "10" : "5";
  const modeRaw = (options.mode ?? "std").trim().toLowerCase();
  const genMode = modeRaw === "pro" || modeRaw === "professional" ? "pro" : "std";

  const body: Record<string, unknown> = {
    model_name: options.model,
    prompt: options.prompt,
    mode: genMode,
    duration,
    aspect_ratio: options.aspectRatio?.trim() || "16:9",
  };
  if (options.withAudio === true) body.sound = "on";
  if (isI2v && ref) {
    body.image = stripDataUri(ref);
  }

  const submitUrl = options.http?.submitPath
    ? `${base}${options.http.submitPath}`
    : mode === "advanced"
      ? resolveApiActionUrl(options.baseUrl, formatId, "advanced")
      : `${base}${defaultSubmitPath}`;
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
    const customPoll = options.http?.pollPathTemplate?.trim();
    let pollUrl: string;
    if (customPoll) {
      if (/\{\{id\}\}/i.test(customPoll)) {
        pollUrl = customPoll.replace(
          /\{\{id\}\}/gi,
          encodeURIComponent(taskId),
        );
      } else if (/^https?:\/\//i.test(customPoll)) {
        pollUrl = `${customPoll.replace(/\/+$/, "")}/${encodeURIComponent(taskId)}`;
      } else {
        pollUrl = `${base}${customPoll.startsWith("/") ? customPoll : `/${customPoll}`}`.replace(
          /\{\{id\}\}/gi,
          encodeURIComponent(taskId),
        );
      }
    } else {
      pollUrl = `${base}/videos/${pollKind}/${encodeURIComponent(taskId)}`;
    }
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
  const m = model.trim().toLowerCase();
  return (
    /minimax[-_]?h3/.test(m) ||
    /^h3$/.test(m) ||
    /mimaxh3|minimaxh3/.test(m) ||
    /hailuo[-_]?0?3/.test(m)
  );
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

function readPollProgress(pollJson: unknown): number | null {
  const raw =
    getPath(pollJson, "progress") ?? getPath(pollJson, "task.progress");
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(0, Math.min(100, Math.round(raw)));
  }
  if (typeof raw === "string" && /^\d+(\.\d+)?$/.test(raw.trim())) {
    return Math.max(0, Math.min(100, Math.round(Number(raw))));
  }
  return null;
}

function formatPollProgressDetail(
  status: string,
  progress: number | null,
  fallback: string,
): string {
  const label = (status || "").trim() || "running";
  if (progress != null) return `${label} ${progress}%`;
  return fallback;
}

export async function generateMinimaxHailuoVideo(
  options: VideoGenOptions,
): Promise<VideoGenResult> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? VIDEO_WAIT_TIMEOUT_MS;
  const signal =
    options.signal ??
    (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(timeoutMs)
      : undefined);
  const formatId = options.apiFormat ?? "video.minimax-hailuo";
  const mode =
    options.baseUrlMode ??
    inferApiBaseUrlMode(options.baseUrl, formatId);
  const apiRoot = resolveApiBaseUrl(options.baseUrl, formatId) || options.baseUrl;
  const root = minimaxRoot(apiRoot);
  const headers = {
    Authorization: `Bearer ${options.apiKey}`,
    "Content-Type": "application/json",
  };
  const h3 = isMinimaxH3(options.model);
  // 简单/官方：规范化为 MiniMax-H3；高级：原样使用配置里的 Model ID（中转常要 minimax-h3）
  const modelId =
    h3 && mode !== "advanced" ? "MiniMax-H3" : options.model.trim();
  const ref = options.referenceImage?.trim();
  const refEnd = options.referenceImageEnd?.trim();
  const multiRefs = (options.referenceImages ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 9);
  const audioRefs = (options.referenceAudios ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
  const r2va = multiRefs.length > 0 || audioRefs.length > 0;

  let submitUrl: string;
  let body: Record<string, unknown>;

  const defaultSubmit = h3
    ? `${root}/v2/video_generation`
    : `${root}/v1/video_generation`;
  if (options.http?.submitPath) {
    submitUrl = `${root}${options.http.submitPath}`;
  } else if (mode === "advanced") {
    // 高级：原样使用所填完整 URL（例如中转 …/v1/videos）
    submitUrl = resolveApiActionUrl(options.baseUrl, formatId, "advanced");
  } else {
    submitUrl = defaultSubmit;
  }

  if (h3) {
    if (r2va && (ref || refEnd)) {
      throw new Error(
        "MiniMax H3：多参参考（reference_image）与首尾帧不能同时使用，请只选一种模式。",
      );
    }
    if (r2va && multiRefs.length === 0 && audioRefs.length > 0) {
      throw new Error(
        "MiniMax H3 多模态参考：仅音频不够，请至少加一张参考图，或改用首帧/首尾帧。",
      );
    }
    const content: Record<string, unknown>[] = [
      { type: "text", text: options.prompt },
    ];
    const duration =
      options.durationSec != null && options.durationSec > 0
        ? Math.min(15, Math.max(4, Math.round(options.durationSec)))
        : 5;

    if (r2va) {
      for (const url of multiRefs) {
        content.push({
          type: "image_url",
          image_url: { url },
          role: "reference_image",
        });
      }
      for (const url of audioRefs) {
        content.push({
          type: "audio_url",
          audio_url: { url },
          role: "reference_audio",
        });
      }
      const ratio = options.aspectRatio?.trim() || "adaptive";
      body = {
        model: modelId,
        content,
        duration,
        resolution: normalizeHailuoResolution(options.resolution, true),
        ratio,
      };
    } else {
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
      body = {
        model: modelId,
        content,
        duration,
        resolution: normalizeHailuoResolution(options.resolution, true),
      };
      if (!ref && !refEnd) {
        // t2va: ratio required and must not be adaptive
        const ratio = options.aspectRatio?.trim() || "16:9";
        body.ratio = ratio === "adaptive" ? "16:9" : ratio;
      } else {
        // i2va: aspect comes from input image; adaptive is ignored if other values sent
        body.ratio = "adaptive";
      }
    }
  } else {
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
      _pollUrlTemplate:
        options.http?.pollPathTemplate?.trim() ||
        (mode === "advanced" && /\/videos$/i.test(submitUrl.replace(/\/+$/, ""))
          ? `${submitUrl.replace(/\/+$/, "")}/{{id}}`
          : undefined),
      _refCount: multiRefs.length || (ref ? 1 : 0) + (refEnd ? 1 : 0),
      _audioRefCount: audioRefs.length,
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
    const errMsg =
      getPath(submitJson, "error.message") ??
      getPath(submitJson, "base_resp.status_msg");
    throw new Error(
      `MiniMax 视频提交失败 (${submitRes.status}): ${String(errMsg ?? submitText).slice(0, 300)}`,
    );
  }
  // v1 envelope; H3/v2 typically uses HTTP status + error object instead
  const baseCode = getPath(submitJson, "base_resp.status_code");
  if (baseCode != null && Number(baseCode) !== 0) {
    throw new Error(
      `MiniMax 视频提交失败: ${String(getPath(submitJson, "base_resp.status_msg") ?? submitText).slice(0, 300)}`,
    );
  }
  const openaiErr = getPath(submitJson, "error.message");
  if (h3 && openaiErr != null && String(openaiErr).trim()) {
    throw new Error(`MiniMax 视频提交失败: ${String(openaiErr).slice(0, 300)}`);
  }

  const taskId = String(
    getPath(submitJson, "task_id") ??
      getPath(submitJson, "task.id") ??
      getPath(submitJson, "id") ??
      getPath(submitJson, "data.task_id") ??
      "",
  );
  if (!taskId) {
    const preview = submitText.trim().slice(0, 220).replace(/\s+/g, " ");
    const looksHtml = /^<!doctype html|<html[\s>]/i.test(preview);
    throw new Error(
      looksHtml
        ? `MiniMax 响应缺少 task_id：当前 URL 返回的是网页而非 API（多半中转未实现 /v2/video_generation）。实际请求 ${submitUrl}；响应头：${preview}`
        : `MiniMax 响应缺少 task_id（${submitUrl}）：${preview || "(空响应)"}`,
    );
  }

  const timing = defaultVideoPollTiming({ apiFormat: "video.minimax-hailuo" });
  let pollIntervalMs = options.pollIntervalMs ?? Math.max(timing.intervalMs, 8_000);
  const maxPollIntervalMs = Math.max(pollIntervalMs, timing.maxIntervalMs);
  options.onStatus?.("running", taskId);
  if (timing.initialDelayMs > 0) await sleep(timing.initialDelayMs, signal);

  const deadline = Date.now() + timeoutMs;
  let remoteUrl: string | undefined;
  const usage: TokenUsage | null = null;

  while (Date.now() < deadline) {
    const submitTrim = submitUrl.replace(/\/+$/, "");
    // 高级自定义若走 OpenAI 形 …/videos，则轮询 …/videos/{id}
    const openaiVideosStyle = /\/videos$/i.test(submitTrim);
    const customPoll = options.http?.pollPathTemplate?.trim();
    let pollUrl: string;
    if (customPoll) {
      if (/\{\{id\}\}/i.test(customPoll)) {
        pollUrl = customPoll.replace(
          /\{\{id\}\}/gi,
          encodeURIComponent(taskId),
        );
      } else {
        const base = customPoll.replace(/\/+$/, "");
        pollUrl = `${base}/${encodeURIComponent(taskId)}`;
      }
    } else if (openaiVideosStyle) {
      pollUrl = `${submitTrim}/${encodeURIComponent(taskId)}`;
    } else if (h3) {
      pollUrl = `${root}/v2/query/video_generation/${encodeURIComponent(taskId)}`;
    } else {
      pollUrl = `${root}/v1/query/video_generation?task_id=${encodeURIComponent(taskId)}`;
    }
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

    if (h3 || openaiVideosStyle || /\/videos\//i.test(pollUrl)) {
      // 官方 H3：task.content.url；中转站（…/videos/{id}）：metadata.url
      const status = String(
        getPath(pollJson, "task.status") ?? getPath(pollJson, "status") ?? "",
      ).toLowerCase();
      const progress = readPollProgress(pollJson);
      if (
        status === "succeeded" ||
        status === "success" ||
        status === "completed" ||
        status === "done"
      ) {
        const fromTask = String(
          getPath(pollJson, "task.content.url") ?? "",
        ).trim();
        const fromMeta = String(
          getPath(pollJson, "metadata.url") ?? "",
        ).trim();
        // 先官方/上游字段，再中转站字段
        remoteUrl =
          (/^https?:\/\//i.test(fromTask) ? fromTask : "") ||
          (/^https?:\/\//i.test(fromMeta) ? fromMeta : "") ||
          "";
        if (!remoteUrl) {
          // 已完成但 URL 尚未回填：继续轮询
          options.onStatus?.(
            "running",
            formatPollProgressDetail(status, progress, `${status} (waiting url)`),
          );
          pollIntervalMs = await pollSleep(
            pollIntervalMs,
            timing.intervalMs,
            maxPollIntervalMs,
            signal,
          );
          continue;
        }
        break;
      }
      if (
        status === "failed" ||
        status === "cancelled" ||
        status === "fail" ||
        status === "error"
      ) {
        throw new Error(
          `视频生成失败: ${String(
            getPath(pollJson, "task.error.message") ??
              getPath(pollJson, "error.message") ??
              getPath(pollJson, "task.error") ??
              status,
          ).slice(0, 200)}`,
        );
      }
      // queued / in_progress 等：把中转 progress 传给 UI（如 queued 20%）
      options.onStatus?.(
        "running",
        formatPollProgressDetail(status, progress, taskId),
      );
      pollIntervalMs = await pollSleep(
        pollIntervalMs,
        timing.intervalMs,
        maxPollIntervalMs,
        signal,
      );
      continue;
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
  const timeoutMs = options.timeoutMs ?? VIDEO_WAIT_TIMEOUT_MS;
  const signal =
    options.signal ??
    (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(timeoutMs)
      : undefined);

  const formatId = options.apiFormat ?? "video.vidu";
  const urlMode =
    options.baseUrlMode ??
    inferApiBaseUrlMode(options.baseUrl, formatId);
  let base = normalizeBase(
    resolveApiBaseUrl(options.baseUrl, formatId) || options.baseUrl,
  );
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

  const submitUrl = options.http?.submitPath
    ? `${base}${options.http.submitPath}`
    : urlMode === "advanced"
      ? resolveApiActionUrl(options.baseUrl, formatId, "advanced")
      : `${base}${submitPath}`;
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
    const customPoll = options.http?.pollPathTemplate?.trim();
    let pollUrl: string;
    if (customPoll) {
      if (/\{\{id\}\}/i.test(customPoll)) {
        pollUrl = customPoll.replace(
          /\{\{id\}\}/gi,
          encodeURIComponent(taskId),
        );
      } else if (/^https?:\/\//i.test(customPoll)) {
        pollUrl = `${customPoll.replace(/\/+$/, "")}/${encodeURIComponent(taskId)}`;
      } else {
        pollUrl = `${base}${customPoll.startsWith("/") ? customPoll : `/${customPoll}`}`.replace(
          /\{\{id\}\}/gi,
          encodeURIComponent(taskId),
        );
      }
    } else {
      pollUrl = `${base}/tasks/${encodeURIComponent(taskId)}/creations`;
    }
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
