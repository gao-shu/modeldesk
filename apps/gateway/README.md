# ModelDesk OpenAI-compatible gateway

Loopback HTTP facade over the shared **run-core** (text only for MVP).

## Install

```bash
pnpm install:bins
modeldesk-gateway
```

Or from the repo: `pnpm gateway`.

## Endpoints

| Method | Path | Notes |
|--------|------|--------|
| `GET` | `/healthz` | Liveness + dataDir |
| `GET` | `/v1/models` | Text models from the local registry |
| `POST` | `/v1/chat/completions` | Non-stream + `stream: true` |

`model` accepts registry **id**, display **name**, or upstream **modelId** (must be unique).

## Run

```bash
modeldesk-gateway
# or: pnpm gateway
```

Defaults: `http://127.0.0.1:3310`

| Env | Default | Purpose |
|-----|---------|---------|
| `MODELDESK_GATEWAY_HOST` | `127.0.0.1` | Bind address (keep loopback) |
| `MODELDESK_GATEWAY_PORT` | `3310` | Port |
| `MODELDESK_GATEWAY_TOKEN` | _(empty)_ | If set, require `Authorization: Bearer …` |
| `MODELDESK_DATA_DIR` | same as Web | SQLite / keys |

## Example

```bash
curl -s http://127.0.0.1:3310/v1/models
curl -s http://127.0.0.1:3310/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"<registry-id>","messages":[{"role":"user","content":"hi"}]}'
```

## Safety

No multi-tenant auth by default. Binding beyond loopback lets anyone who can reach the port spend your keys. See [SECURITY.md](../../SECURITY.md).
