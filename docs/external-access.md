# External access (after local install)

ModelDesk is a **local** multimodal desk. Configure keys in Web / Desktop once; call the **same** registry and run-core from outside via thin entrypoints — not a second product, not a public SaaS.

| Who | Use | Command |
|-----|-----|---------|
| Scripts / CI | **CLI** | `modeldesk` |
| Cursor / Claude / MCP clients | **MCP** | `modeldesk-mcp` |
| OpenAI-compatible HTTP / 本机业务 | **Gateway API** | 默认 Web `http://127.0.0.1:3300/v1`；可选无头 `modeldesk-gateway` → `:3310` |

One shared kernel: [`apps/web/src/lib/server/run-core.ts`](../apps/web/src/lib/server/run-core.ts). Do not add parallel run logic in the shells.

## Desktop install (recommended)

Installing the **Desktop** app:

1. Unpacks the engine (includes bundled CLI / MCP / Gateway)
2. Writes shims to `%LOCALAPPDATA%\ModelDesk\bin` (macOS/Linux: app-support `ModelDesk/bin`)
3. Optionally adds that folder to your **User PATH**
4. Uses the **same** data dir as the UI (`%LOCALAPPDATA%\ModelDesk` + Settings → 更改位置)

After install, open a **new** terminal:

```bash
modeldesk --version
modeldesk list
```

In the app: **系统设置 → 外部调用** — repair commands, copy Cursor MCP JSON (already filled with your data dir).

## Dev checkout (optional)

From the monorepo root (after `pnpm install`):

```bash
pnpm install:bins
# optional: also put the bin dir on your user PATH
pnpm install:bins -- --add-path
```

Dev shims point at the checkout (`tsx`). Prefer Desktop-installed bins when testing the product path.

Verify:

```bash
modeldesk --version
modeldesk --help
```

Repo fallbacks without bins: `pnpm cli` / `pnpm mcp` / `pnpm gateway`.

## Data directory (must match the UI)

Priority for **MCP / CLI** (agent entrypoints):

1. **Live Desk** — if `MODELDESK_FOLLOW_DESK` is not `0`, probe `http://127.0.0.1:3300/healthz` (then `:3310`) and use its `dataDir`
2. `MODELDESK_DATA_DIR` (explicit in MCP JSON — beats desktop `data-location.json`)
3. Settings-persisted `data-location.json` (control dir)
4. Monorepo `./data` when a checkout is detected (`MODELDESK_REPO_ROOT` or cwd)
5. OS app data `ModelDesk` (e.g. `%LOCALAPPDATA%\ModelDesk` on Windows) when no checkout

Keep Desk open while using Trae/Cursor MCP so (1) applies. Copied MCP JSON no longer pins a stale `MODELDESK_DATA_DIR`.

Prefer `{dataDir}/.encryption-secret` shared with the UI. Do not set a different `ENCRYPTION_SECRET` only on the agent side.

## CLI

```bash
modeldesk list
modeldesk list --modality video
modeldesk run text  --model <registryId> --prompt "hello"
modeldesk run image --model <registryId> --prompt "a cat" --params "{\"size\":\"1K\"}"
```

`modelId` is the **ModelDesk registry UUID** from `list` / `list_models`, not the upstream vendor string.

Details: [apps/cli/README.md](../apps/cli/README.md)

## MCP

Prefer **Settings → 外部调用 → 复制 MCP（JSON）/ 复制 Codex（TOML）**.
That snippet uses **absolute paths** (packaged `node` + `agents/mcp.mjs`, or absolute `modeldesk-mcp.cmd`) plus your current `MODELDESK_DATA_DIR` — no PATH required.

Manual example shape:

```json
{
  "mcpServers": {
    "modeldesk": {
      "command": "C:/Program Files/ModelDesk/engine/node/node.exe",
      "args": ["C:/Program Files/ModelDesk/engine/agents/mcp.mjs"],
      "env": {
        "MODELDESK_DATA_DIR": "C:/Users/You/AppData/Local/ModelDesk",
        "MODELDESK_DESKTOP": "1"
      }
    }
  }
}
```

Tools: `list_models`, `list_active_runs`, `cancel_run`, `run_text` / `run_image` / `run_video` / `run_audio` / `run_music`.

Full guide: [apps/mcp/README.md](../apps/mcp/README.md)

## Gateway API (multimodal HTTP · 默认挂在 Web)

**默认（推荐）：** 打开 Web / 桌面后直接用 `http://127.0.0.1:3300`：

```text
GET  /v1/models  /v1/aliases  /openapi.yaml  /healthz
POST /v1/chat/completions
POST /v1/images/generations | /v1/images/edits | /v1/audio/speech | /v1/music/generations
POST /v1/videos | /v1/videos/generations   （异步提交，二者相同）
GET|DELETE /v1/videos/:id                  （轮询 / 取消）
GET  /v1/videos/:id/content                （成片二进制；读本机落盘，不重拉上游）
GET  /v1/artifacts/:id
```

**视频（仅异步）：** `POST /v1/videos` 或别名 `POST /v1/videos/generations` 立刻返回 `{ id, status: "queued" }`；用 `GET /v1/videos/{id}` 轮询至 `completed` / `failed`。成片 URL 在 `url` / `data[].url`（优先上游 CDN）。需要经 ModelDesk 拉字节时用 `GET /v1/videos/{id}/content`（或 `GET /v1/files/{artifactId}`）。`DELETE /v1/videos/{id}` 可取消进行中任务。**已取消同步阻塞等待**，调用方必须轮询。

图片 / 视频成功时，`data[].url`（及 `modeldesk.artifacts[].url`）**优先返回上游 CDN 地址**；仅当上游未给出公网 URL（例如只回了 base64）时，才回落到本机 `GET /v1/artifacts/:id`。本机仍会落盘一份，供界面与历史使用。

**可选无头：** `modeldesk-gateway` → `:3310`（同一契约，不开 UI 时用）。见 [apps/gateway/README.md](../apps/gateway/README.md)。

Stable aliases：`PUT /v1/aliases` 或 `MODELDESK_ALIAS_*_DEFAULT`。  
Client：`@modeldesk/gateway-client`（默认 `:3300`）。契约：`apps/web/public/openapi.yaml`。

可选 `MODELDESK_GATEWAY_TOKEN`（comma-separated）或 `MODELDESK_GATEWAY_TOKENS_FILE`。

业务对接：[gateway-business.md](./gateway-business.md)。  
验收：`pnpm gateway:smoke`（无头）· `pnpm gateway:accept`（优先打已运行的 `:3300`）。

## Safety

Spawning CLI / MCP / Gateway ≈ ability to spend stored API keys. No multi-tenant login. Do not publish gateway ports to the internet. See [SECURITY.md](../SECURITY.md).

## Out of scope

Cursor Skills / IDE-only recipes, compare/gallery/Radar as MCP tools, public bind, multi-tenant auth.
