# `@modeldesk/gateway-client`

Official thin HTTP client for **ModelDesk Gateway** (Phase A).

Contract source of truth: [`apps/gateway/openapi.yaml`](../../apps/gateway/openapi.yaml).

## Usage

```ts
import { createGatewayClient } from "@modeldesk/gateway-client";

const md = createGatewayClient({
  // default: http://127.0.0.1:3300 (Web/Desktop — no separate process)
  // baseUrl: "http://127.0.0.1:3310", // optional headless modeldesk-gateway
  // token: process.env.MODELDESK_GATEWAY_TOKEN,
});

await md.putAliases({ "llm-default": "<registry-uuid>" });
const chat = await md.chatCompletions({
  model: "llm-default",
  messages: [{ role: "user", content: "hi" }],
});

const img = await md.imagesGenerations({
  model: "image-default",
  prompt: "a cat",
});
```

Start **Web/Desktop** first (`pnpm dev` or the app) — `/v1` is on `:3300`.  
Optional headless: `modeldesk-gateway` / `pnpm gateway` on `:3310`.

Acceptance / business flow: [docs/gateway-business.md](../../docs/gateway-business.md).
