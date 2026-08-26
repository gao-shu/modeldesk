/**
 * 高级模式「查询 URL」默认模板（与各适配器原先写死的轮询路径一致）。
 * 可用 {{id}} 占位；留空时运行时仍走适配器默认。
 */

import { getApiFormat } from "./api-formats";
import { formatSupportsApiBaseUrlMode } from "./api-base-url";
import { formatSupportsChatBaseUrlMode } from "./chat-url";

function isMinimaxH3Model(modelId: string): boolean {
  const m = modelId.trim().toLowerCase();
  return (
    /minimax[-_]?h3/.test(m) ||
    /^h3$/.test(m) ||
    /mimaxh3|minimaxh3/.test(m) ||
    /hailuo[-_]?0?3/.test(m)
  );
}

function stripTrailingSlash(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function originOf(url: string): string {
  const u = stripTrailingSlash(url);
  try {
    return new URL(u).origin;
  } catch {
    return u;
  }
}

/** Whether the config form should show 查询 URL（高级 + 非 chat 文本）. */
export function formatSupportsPollUrl(apiFormatId: string): boolean {
  if (!formatSupportsApiBaseUrlMode(apiFormatId)) return false;
  if (formatSupportsChatBaseUrlMode(apiFormatId)) return false;
  const fmt = getApiFormat(apiFormatId);
  if (!fmt) return false;
  if (fmt.modality === "text") return false;
  return true;
}

/** MiniMax 专用默认（保持旧导出名兼容）. */
export function defaultMinimaxPollUrlTemplate(
  submitOrBaseUrl: string,
  modelId = "",
): string {
  const submit = stripTrailingSlash(submitOrBaseUrl);
  if (!submit) return "";

  if (/\/videos$/i.test(submit)) {
    return `${submit}/{{id}}`;
  }
  if (/\/v2\/video_generation$/i.test(submit)) {
    const root = submit.replace(/\/v2\/video_generation$/i, "");
    return `${root}/v2/query/video_generation/{{id}}`;
  }
  if (/\/v1\/video_generation$/i.test(submit)) {
    const root = submit.replace(/\/v1\/video_generation$/i, "");
    return `${root}/v1/query/video_generation?task_id={{id}}`;
  }

  let root = submit
    .replace(/\/v2\/query\/video_generation(\/\{\{id\}\})?$/i, "")
    .replace(/\/v1\/query\/video_generation(\?.*)?$/i, "")
    .replace(/\/v2\/video_generation$/i, "")
    .replace(/\/v1\/video_generation$/i, "")
    .replace(/\/videos(\/\{\{id\}\})?$/i, "")
    .replace(/\/v1$/i, "")
    .replace(/\/v2$/i, "");
  root = stripTrailingSlash(root) || "https://api.minimaxi.com";
  if (!modelId.trim() || isMinimaxH3Model(modelId)) {
    return `${root}/v2/query/video_generation/{{id}}`;
  }
  return `${root}/v1/query/video_generation?task_id={{id}}`;
}

/**
 * @param apiFormatId API 格式 id
 * @param submitOrBaseUrl 高级=生成完整 URL；简单=API 根（仅用于推导默认）
 * @param modelId 少数格式需按型号区分查询路径（如 MiniMax H3）
 */
export function defaultPollUrlTemplate(
  apiFormatId: string,
  submitOrBaseUrl: string,
  modelId = "",
): string {
  const submit = stripTrailingSlash(submitOrBaseUrl);
  if (!submit || !formatSupportsPollUrl(apiFormatId)) return "";

  if (apiFormatId === "video.minimax-hailuo") {
    return defaultMinimaxPollUrlTemplate(submit, modelId);
  }

  if (/\/contents\/generations\/tasks$/i.test(submit)) {
    return `${submit}/{{id}}`;
  }
  if (/\/videos\/(text2video|image2video)$/i.test(submit)) {
    return `${submit}/{{id}}`;
  }
  if (/\/videos\/generations$/i.test(submit)) {
    const root = submit.replace(/\/videos\/generations$/i, "");
    if (apiFormatId === "video.zhipu-cogvideox") {
      return `${root}/async-result/{{id}}`;
    }
    // OpenAI generations 中转常见：轮询 /videos/{id}
    return `${root}/videos/{{id}}`;
  }
  if (/\/videos$/i.test(submit)) {
    return `${submit}/{{id}}`;
  }
  if (/\/images\/(generations|edits)$/i.test(submit)) {
    const root = submit.replace(/\/images\/(generations|edits)$/i, "");
    return `${root}/images/tasks/{{id}}`;
  }
  if (/\/(text2video|image2video)$/i.test(submit)) {
    const root = submit.replace(/\/(text2video|image2video)$/i, "");
    return `${root}/tasks/{{id}}/creations`;
  }

  const origin = originOf(submit);

  switch (apiFormatId) {
    case "video.volcengine-seedance":
    case "video.volcengine-wan": {
      const root = /\/api\/v3$/i.test(submit)
        ? submit
        : `${origin}/api/v3`;
      return `${root}/contents/generations/tasks/{{id}}`;
    }
    case "video.kling":
      return `${origin}/v1/videos/text2video/{{id}}`;
    case "video.vidu": {
      const root = stripTrailingSlash(
        submit.replace(/\/(text2video|image2video)$/i, ""),
      );
      return `${root}/tasks/{{id}}/creations`;
    }
    case "video.zhipu-cogvideox":
      return `${origin}/api/paas/v4/async-result/{{id}}`;
    case "video.openai-videos":
    case "video.seedance-relay":
    case "video.agnes":
    case "video.agnes-25-flash":
    case "video.grok": {
      const root = /\/v1$/i.test(submit) ? submit : `${origin}/v1`;
      return `${root}/videos/{{id}}`;
    }
    case "video.openai-generations":
    case "video.openai-compatible": {
      const root = /\/v1$/i.test(submit) ? submit : `${origin}/v1`;
      return `${root}/videos/generations/{{id}}`;
    }
    case "image.openai-async": {
      const root = /\/v1$/i.test(submit) ? submit : `${origin}/v1`;
      return `${root}/images/tasks/{{id}}`;
    }
    case "image.dashscope-wanxiang": {
      const root = /\/api\/v1$/i.test(submit) ? submit : `${origin}/api/v1`;
      return `${root}/tasks/{{id}}`;
    }
    default: {
      if (/\/[a-z0-9_-]+$/i.test(submit) && !/\/v\d+$/i.test(submit)) {
        return `${submit}/{{id}}`;
      }
      return "";
    }
  }
}
