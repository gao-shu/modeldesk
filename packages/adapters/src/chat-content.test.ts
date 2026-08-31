import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildUserChatMessage,
  chatMessageTextContent,
  parseChatAttachmentsFromParams,
  redactChatMessagesForLog,
  resolveZhipuThinking,
} from "@modeldesk/shared";

describe("chat-content", () => {
  it("buildUserChatMessage keeps plain string without attachments", () => {
    const msg = buildUserChatMessage("hello");
    assert.deepEqual(msg, { role: "user", content: "hello" });
  });

  it("buildUserChatMessage builds multimodal parts", () => {
    const msg = buildUserChatMessage("describe", [
      { kind: "image", url: "https://example.com/a.png" },
    ]);
    assert.equal(msg.role, "user");
    assert.ok(Array.isArray(msg.content));
    if (!Array.isArray(msg.content)) return;
    assert.equal(msg.content.length, 2);
    assert.equal(msg.content[0]!.type, "image_url");
    assert.equal(msg.content[1]!.type, "text");
  });

  it("parseChatAttachmentsFromParams accepts JSON array", () => {
    const atts = parseChatAttachmentsFromParams({
      chat_attachments: '[{"kind":"video","url":"https://v.mp4"}]',
    });
    assert.equal(atts.length, 1);
    assert.equal(atts[0]!.kind, "video");
  });

  it("chatMessageTextContent extracts text parts only", () => {
    const text = chatMessageTextContent([
      { type: "image_url", image_url: { url: "https://x" } },
      { type: "text", text: "hi" },
    ]);
    assert.equal(text, "hi");
  });

  it("resolveZhipuThinking normalizes enabled/disabled", () => {
    assert.equal(resolveZhipuThinking({ thinking: "enabled" }), "enabled");
    assert.equal(resolveZhipuThinking({ thinking: "false" }), "disabled");
    assert.equal(resolveZhipuThinking({}), undefined);
  });

  it("redactChatMessagesForLog shortens data URIs", () => {
    const redacted = redactChatMessagesForLog([
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: "data:image/png;base64,AAAA" },
          },
        ],
      },
    ]);
    const part = redacted[0]!.content;
    assert.ok(Array.isArray(part));
    const first = part[0];
    assert.equal(first?.type, "image_url");
    if (first?.type === "image_url") {
      assert.match(first.image_url.url, /^\[data-uri/);
    }
  });
});
