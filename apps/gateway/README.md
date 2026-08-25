# ModelDesk Gateway（可选无头）

**默认：** 业务请打 **Web / 桌面 `:3300`** 上的同一套 `/v1/*`（开着 Desk 即可，不必另起进程）。

本包是**可选**独立进程（默认 `:3310`），适合不想开 UI、只要 HTTP API 的场景。契约与 Web 相同。

| 入口 | 地址 | 何时用 |
|------|------|--------|
| **默认** Web / Desktop | `http://127.0.0.1:3300` | 日常本机业务 |
| 可选 headless | `http://127.0.0.1:3310` | `modeldesk-gateway` / `pnpm gateway` |

Contract: [`../web/public/openapi.yaml`](../web/public/openapi.yaml)（本目录有同步副本）  
Client: [`@modeldesk/gateway-client`](../../packages/gateway-client)（默认 `baseUrl` → `:3300`）

## Headless 启动

```bash
modeldesk-gateway
# or: pnpm gateway
```

| Env | Default | Purpose |
|-----|---------|---------|
| `MODELDESK_GATEWAY_HOST` | `127.0.0.1` | Bind |
| `MODELDESK_GATEWAY_PORT` | `3310` | Port |
| `MODELDESK_GATEWAY_TOKEN` | _(empty)_ | Optional Bearer（多值逗号分隔） |
| `MODELDESK_GATEWAY_TOKENS_FILE` | _(empty)_ | 每行一个 token |
| `MODELDESK_DATA_DIR` | same as Web | SQLite / keys / aliases |

## Endpoints（与 Web 相同）

`/healthz` · `/openapi.yaml` · `/v1/models` · `/v1/aliases` · `/v1/chat/completions` · `/v1/images/generations` · `/v1/images/edits` · `/v1/videos|music/generations` · `/v1/audio/speech` · `/v1/modeldesk/run` · `/v1/artifacts/:id`

Business guide: [docs/gateway-business.md](../../docs/gateway-business.md).

## Safety

No multi-tenant auth. Prefer loopback. See [SECURITY.md](../../SECURITY.md).
