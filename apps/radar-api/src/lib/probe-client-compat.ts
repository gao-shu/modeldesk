import { familyOfModel } from "../data/probe-suites.js";
import type { DimensionStatus, ProbeDimension } from "./probe-types.js";

function messagesUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(base)) {
    return base.replace(/\/chat\/completions$/i, "/messages");
  }
  if (/\/v1$/i.test(base)) return `${base}/messages`;
  return `${base}/v1/messages`;
}

function modelsUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(base)) {
    return base.replace(/\/chat\/completions$/i, "/models");
  }
  if (/\/v1$/i.test(base)) return `${base}/models`;
  return `${base}/v1/models`;
}

/**
 * 轻量「客户端兼容」探测（不是完整 Claude Code 协议）：
 * - 模型是否出现在 /models
 * - Claude 系额外试 Anthropic Messages API（Claude Code 常用底层形态之一）
 */
export async function runClientCompatProbe(opts: {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}): Promise<ProbeDimension> {
  const family = familyOfModel(opts.model);
  const details: Record<string, unknown> = { family };
  const notes: string[] = [];
  let status: DimensionStatus = "weak";

  // 1) /models 是否列出目标模型
  let listed = false;
  try {
    const url = modelsUrl(opts.baseUrl);
    details.modelsUrl = url;
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), Math.min(10_000, opts.timeoutMs));
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${opts.apiKey}` },
      signal: c.signal,
    });
    clearTimeout(t);
    details.modelsHttp = res.status;
    if (res.ok) {
      const json = (await res.json()) as {
        data?: Array<{ id?: string }>;
      };
      const ids = (json.data ?? [])
        .map((x) => String(x.id ?? "").toLowerCase())
        .filter(Boolean);
      details.modelsCount = ids.length;
      const want = opts.model.toLowerCase();
      listed = ids.some(
        (id) => id === want || id.includes(want) || want.includes(id),
      );
      details.modelListed = listed;
      notes.push(
        listed
          ? "/models 中可见目标模型"
          : ids.length
            ? "/models 可达但未列出该模型 id"
            : "/models 返回空列表",
      );
    } else {
      notes.push(`/models HTTP ${res.status}`);
    }
  } catch (e) {
    notes.push(
      `/models 探测失败：${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // 2) Claude：试 Messages API
  let messagesOk: boolean | null = null;
  if (family === "claude") {
    try {
      const url = messagesUrl(opts.baseUrl);
      details.messagesUrl = url;
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), Math.min(15_000, opts.timeoutMs));
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${opts.apiKey}`,
          "x-api-key": opts.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: opts.model,
          max_tokens: 16,
          messages: [{ role: "user", content: "Reply with exactly: OK" }],
        }),
        signal: c.signal,
      });
      clearTimeout(t);
      details.messagesHttp = res.status;
      const text = await res.text();
      details.messagesPreview = text.slice(0, 200);
      if (res.status >= 200 && res.status < 300) {
        messagesOk = true;
        notes.push("Anthropic Messages API 可达（Claude Code 常用形态之一）");
      } else if (res.status === 404) {
        messagesOk = false;
        notes.push("无 /v1/messages（多半仅 OpenAI 兼容壳）");
      } else if (res.status === 401 || res.status === 403) {
        messagesOk = false;
        notes.push(`Messages 鉴权失败 HTTP ${res.status}`);
      } else {
        messagesOk = false;
        notes.push(`Messages HTTP ${res.status}`);
      }
    } catch (e) {
      messagesOk = false;
      notes.push(
        `Messages 探测失败：${e instanceof Error ? e.message : String(e)}`,
      );
    }
  } else {
    notes.push("非 Claude 系：跳过 Anthropic Messages 探测");
  }

  if (family === "claude") {
    if (messagesOk && listed) status = "pass";
    else if (messagesOk || listed) status = "weak";
    else status = "fail";
  } else {
    if (listed) status = "pass";
    else status = "weak";
  }

  return {
    id: "client",
    status,
    title: "客户端兼容（轻量）",
    summary: notes.join("；"),
    details: {
      ...details,
      note: "非完整 Claude Code 协议；仅作兼容性弱信号",
    },
  };
}
