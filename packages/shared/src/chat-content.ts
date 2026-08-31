/**
 * OpenAI-compatible chat message shapes (plain text + VLM multimodal).
 * Used by text run pipeline (stage 3+) and chat adapters.
 */

export type ChatTextPart = { type: "text"; text: string };

export type ChatImageUrlPart = {
  type: "image_url";
  image_url: { url: string; detail?: "auto" | "low" | "high" };
};

export type ChatVideoUrlPart = {
  type: "video_url";
  video_url: { url: string };
};

export type ChatFileUrlPart = {
  type: "file_url";
  file_url: { url: string };
};

export type ChatContentPart =
  | ChatTextPart
  | ChatImageUrlPart
  | ChatVideoUrlPart
  | ChatFileUrlPart;

export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string | ChatContentPart[];
};

/** Run params key — JSON array of URLs or `{ kind, url }` objects. Not image `reference_*`. */
export const CHAT_ATTACHMENTS_PARAM_KEY = "chat_attachments";

/** Run params key — Zhipu GLM-4.6V: `enabled` | `disabled`. */
export const CHAT_THINKING_PARAM_KEY = "thinking";

export type ChatAttachmentKind = "image" | "video" | "file";

export type ChatAttachmentInput = {
  kind: ChatAttachmentKind;
  url: string;
};

const DATA_URI_PREFIX = /^data:/i;
const HTTP_URL_PREFIX = /^https?:\/\//i;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function normalizeAttachmentKind(raw: unknown): ChatAttachmentKind {
  const k = String(raw ?? "image").trim().toLowerCase();
  if (k === "video") return "video";
  if (k === "file" || k === "document" || k === "pdf") return "file";
  return "image";
}

function attachmentFromUnknown(item: unknown): ChatAttachmentInput | null {
  if (isNonEmptyString(item)) {
    return { kind: "image", url: item.trim() };
  }
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const o = item as Record<string, unknown>;
  const url =
    (isNonEmptyString(o.url) ? o.url.trim() : "") ||
    (isNonEmptyString(o.href) ? o.href.trim() : "");
  if (!url) return null;
  return { kind: normalizeAttachmentKind(o.kind ?? o.type), url };
}

/** Parse `chat_attachments` from run params (JSON string or array). */
export function parseChatAttachmentsFromParams(
  params: Record<string, unknown>,
): ChatAttachmentInput[] {
  const raw = params[CHAT_ATTACHMENTS_PARAM_KEY];
  if (raw == null || raw === "") return [];

  let items: unknown[] = [];
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (Array.isArray(parsed)) items = parsed;
        else items = [parsed];
      } catch {
        items = [trimmed];
      }
    } else {
      items = [trimmed];
    }
  } else if (Array.isArray(raw)) {
    items = raw;
  } else {
    items = [raw];
  }

  const out: ChatAttachmentInput[] = [];
  for (const item of items) {
    const att = attachmentFromUnknown(item);
    if (att) out.push(att);
  }
  return out;
}

export function resolveZhipuThinking(
  params: Record<string, unknown>,
): "enabled" | "disabled" | undefined {
  const raw = params[CHAT_THINKING_PARAM_KEY];
  if (raw === "enabled" || raw === true || raw === "true") return "enabled";
  if (raw === "disabled" || raw === false || raw === "false") return "disabled";
  return undefined;
}

/** Extract plain text from string or multimodal content (for mock / logging / gateway fallback). */
export function chatMessageTextContent(
  content: string | ChatContentPart[],
): string {
  if (typeof content === "string") return content;
  return content
    .filter((p): p is ChatTextPart => p.type === "text")
    .map((p) => p.text)
    .join("\n")
    .trim();
}

function attachmentToContentPart(att: ChatAttachmentInput): ChatContentPart {
  const url = att.url.trim();
  switch (att.kind) {
    case "video":
      return { type: "video_url", video_url: { url } };
    case "file":
      return { type: "file_url", file_url: { url } };
    default:
      return { type: "image_url", image_url: { url } };
  }
}

/**
 * Build a user message for chat completions.
 * No attachments → plain string content (backward compatible).
 */
export function buildUserChatMessage(
  prompt: string,
  attachments?: readonly ChatAttachmentInput[],
): ChatMessage {
  const atts = (attachments ?? []).filter((a) => a.url.trim());
  if (atts.length === 0) {
    return { role: "user", content: prompt };
  }

  const parts: ChatContentPart[] = atts.map(attachmentToContentPart);
  const text = prompt.trim();
  if (text) parts.push({ type: "text", text });

  return { role: "user", content: parts };
}

function redactUrl(url: string): string {
  const u = url.trim();
  if (DATA_URI_PREFIX.test(u)) {
    return `[data-uri ${u.slice(0, 32)}…]`;
  }
  if (HTTP_URL_PREFIX.test(u) && u.length > 120) {
    return `${u.slice(0, 80)}…${u.slice(-12)}`;
  }
  if (u.length > 160) return `${u.slice(0, 80)}…[${u.length} chars]`;
  return u;
}

export function redactChatContentPart(part: ChatContentPart): ChatContentPart {
  switch (part.type) {
    case "text":
      return part;
    case "image_url":
      return {
        type: "image_url",
        image_url: {
          ...part.image_url,
          url: redactUrl(part.image_url.url),
        },
      };
    case "video_url":
      return {
        type: "video_url",
        video_url: { url: redactUrl(part.video_url.url) },
      };
    case "file_url":
      return {
        type: "file_url",
        file_url: { url: redactUrl(part.file_url.url) },
      };
    default:
      return part;
  }
}

export function redactChatMessagesForLog(
  messages: readonly ChatMessage[],
): ChatMessage[] {
  return messages.map((m) => {
    if (typeof m.content === "string") return { ...m };
    return {
      ...m,
      content: m.content.map(redactChatContentPart),
    };
  });
}

/** True if at least one message has text or non-text parts (VLM attachments). */
export function chatMessagesHavePayload(messages: readonly ChatMessage[]): boolean {
  for (const m of messages) {
    if (typeof m.content === "string") {
      if (m.content.trim()) return true;
      continue;
    }
    for (const p of m.content) {
      if (p.type === "text") {
        if (p.text.trim()) return true;
      } else {
        return true;
      }
    }
  }
  return false;
}

function normalizeChatRole(raw: unknown): ChatRole {
  const r = String(raw ?? "user").trim().toLowerCase();
  if (r === "system") return "system";
  if (r === "assistant") return "assistant";
  return "user";
}

function normalizeContentPart(raw: unknown): ChatContentPart | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const type = String(o.type ?? "").trim().toLowerCase();
  if (type === "text" && isNonEmptyString(o.text)) {
    return { type: "text", text: o.text.trim() };
  }
  if (type === "image_url" && o.image_url && typeof o.image_url === "object") {
    const url = String((o.image_url as { url?: unknown }).url ?? "").trim();
    if (!url) return null;
    const detail = (o.image_url as { detail?: unknown }).detail;
    return {
      type: "image_url",
      image_url: {
        url,
        ...(detail === "auto" || detail === "low" || detail === "high"
          ? { detail }
          : {}),
      },
    };
  }
  if (type === "video_url" && o.video_url && typeof o.video_url === "object") {
    const url = String((o.video_url as { url?: unknown }).url ?? "").trim();
    if (!url) return null;
    return { type: "video_url", video_url: { url } };
  }
  if (type === "file_url" && o.file_url && typeof o.file_url === "object") {
    const url = String((o.file_url as { url?: unknown }).url ?? "").trim();
    if (!url) return null;
    return { type: "file_url", file_url: { url } };
  }
  return null;
}

/** Normalize OpenAI-shaped gateway messages for adapter dispatch. */
export function normalizeIncomingChatMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const role = normalizeChatRole(o.role);
    const content = o.content;
    if (typeof content === "string") {
      out.push({ role, content });
      continue;
    }
    if (Array.isArray(content)) {
      const parts = content
        .map(normalizeContentPart)
        .filter((p): p is ChatContentPart => p != null);
      if (parts.length > 0) out.push({ role, content: parts });
    }
  }
  return out;
}

/** Gateway / provider body: `{ thinking: { type: "enabled" } }` or run param string. */
export function resolveThinkingOption(
  source: Record<string, unknown>,
): "enabled" | "disabled" | undefined {
  const fromParams = resolveZhipuThinking(source);
  if (fromParams) return fromParams;
  const thinking = source.thinking;
  if (thinking && typeof thinking === "object" && !Array.isArray(thinking)) {
    const type = String((thinking as { type?: unknown }).type ?? "").trim();
    if (type === "enabled" || type === "disabled") return type;
  }
  return undefined;
}

function normalizeOneContentPart(part: unknown): ChatContentPart | null {
  if (!part || typeof part !== "object") return null;
  const p = part as Record<string, unknown>;
  const type = String(p.type ?? "").trim();
  if (type === "text") {
    const text = String(p.text ?? "").trim();
    return text ? { type: "text", text } : null;
  }
  if (type === "image_url" && p.image_url && typeof p.image_url === "object") {
    const url = String(
      (p.image_url as { url?: unknown }).url ?? "",
    ).trim();
    if (!url) return null;
    const detail = (p.image_url as { detail?: unknown }).detail;
    return {
      type: "image_url",
      image_url: {
        url,
        ...(detail === "auto" || detail === "low" || detail === "high"
          ? { detail }
          : {}),
      },
    };
  }
  if (type === "video_url" && p.video_url && typeof p.video_url === "object") {
    const url = String(
      (p.video_url as { url?: unknown }).url ?? "",
    ).trim();
    return url ? { type: "video_url", video_url: { url } } : null;
  }
  if (type === "file_url" && p.file_url && typeof p.file_url === "object") {
    const url = String((p.file_url as { url?: unknown }).url ?? "").trim();
    return url ? { type: "file_url", file_url: { url } } : null;
  }
  return null;
}

/** Normalize OpenAI-style chat messages from gateway / API bodies. */
export function normalizeGatewayChatMessages(raw: unknown[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    const role = m.role;
    if (role !== "system" && role !== "user" && role !== "assistant") {
      continue;
    }
    const content = m.content;
    if (typeof content === "string") {
      out.push({ role, content });
      continue;
    }
    if (Array.isArray(content)) {
      const parts = content
        .map(normalizeOneContentPart)
        .filter((p): p is ChatContentPart => p != null);
      if (parts.length > 0) out.push({ role, content: parts });
    }
  }
  return out;
}

/** Flatten messages for run storage / token estimate fallback. */
export function chatMessagesToStoragePrompt(
  messages: readonly ChatMessage[],
): string {
  const parts = messages
    .map((m) => {
      const text = chatMessageTextContent(m.content).trim();
      if (!text) return "";
      return `${m.role}: ${text}`;
    })
    .filter(Boolean);
  if (parts.length === 1 && parts[0]!.startsWith("user: ")) {
    return parts[0]!.slice("user: ".length);
  }
  return parts.join("\n\n");
}
