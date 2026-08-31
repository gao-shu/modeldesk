/**
 * Text chat run: build multimodal messages + resolve attachment URLs for upstream.
 */

import {
  buildUserChatMessage,
  chatMessageTextContent,
  parseChatAttachmentsFromParams,
  resolveThinkingOption,
  type ChatAttachmentInput,
  type ChatContentPart,
  type ChatMessage,
} from "@modeldesk/shared";
import { ensurePublicChatAttachmentUrl } from "./tos";

export type PrepareTextChatInput = {
  prompt: string;
  params: Record<string, unknown>;
  /** When set (gateway), use instead of building from prompt + chat_attachments. */
  messages?: ChatMessage[] | null;
};

export type PreparedTextChat = {
  messages: ChatMessage[];
  thinking: "enabled" | "disabled" | undefined;
  /** Plain text for token estimates / run record fallback. */
  promptText: string;
};

async function resolveAttachmentUrl(
  att: ChatAttachmentInput,
): Promise<ChatAttachmentInput | null> {
  const url = await ensurePublicChatAttachmentUrl(att.url, att.kind);
  if (!url?.trim()) return null;
  return { kind: att.kind, url: url.trim() };
}

async function resolveContentPartUrls(
  parts: ChatContentPart[],
): Promise<ChatContentPart[]> {
  const out: ChatContentPart[] = [];
  for (const part of parts) {
    if (part.type === "text") {
      out.push(part);
      continue;
    }
    if (part.type === "image_url") {
      const url = await ensurePublicChatAttachmentUrl(
        part.image_url.url,
        "image",
      );
      if (url) out.push({ ...part, image_url: { ...part.image_url, url } });
      continue;
    }
    if (part.type === "video_url") {
      const url = await ensurePublicChatAttachmentUrl(
        part.video_url.url,
        "video",
      );
      if (url) out.push({ ...part, video_url: { url } });
      continue;
    }
    if (part.type === "file_url") {
      const url = await ensurePublicChatAttachmentUrl(
        part.file_url.url,
        "file",
      );
      if (url) out.push({ ...part, file_url: { url } });
    }
  }
  return out;
}

async function resolveChatMessageUrls(
  messages: ChatMessage[],
): Promise<ChatMessage[]> {
  const out: ChatMessage[] = [];
  for (const m of messages) {
    if (typeof m.content === "string") {
      out.push(m);
      continue;
    }
    const content = await resolveContentPartUrls(m.content);
    if (content.length > 0) out.push({ ...m, content });
  }
  return out;
}

function promptTextFromMessages(messages: ChatMessage[]): string {
  return messages
    .map((m) => chatMessageTextContent(m.content))
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

export async function prepareTextChat(
  input: PrepareTextChatInput,
): Promise<PreparedTextChat> {
  const thinking = resolveThinkingOption(input.params);

  if (input.messages && input.messages.length > 0) {
    const messages = await resolveChatMessageUrls(input.messages);
    return {
      messages,
      thinking,
      promptText: promptTextFromMessages(messages) || input.prompt.trim(),
    };
  }

  const rawAttachments = parseChatAttachmentsFromParams(input.params);
  const attachments: ChatAttachmentInput[] = [];
  for (const att of rawAttachments) {
    const resolved = await resolveAttachmentUrl(att);
    if (resolved) attachments.push(resolved);
  }

  const userMessage = buildUserChatMessage(input.prompt, attachments);
  const messages = [userMessage];

  return {
    messages,
    thinking,
    promptText:
      chatMessageTextContent(userMessage.content) || input.prompt.trim(),
  };
}
