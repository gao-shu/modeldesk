# External access (after local install)

ModelDesk is a **local** multimodal desk. Configure keys in Web / Desktop once; call the **same** registry and run-core from outside via thin entrypoints — not a second product, not a public SaaS.

| Who | Use | Command |
|-----|-----|---------|
| Scripts / CI | **CLI** | `modeldesk` |
| Cursor / Claude / MCP clients | **MCP** | `modeldesk-mcp` |
| OpenAI-compatible HTTP clients | **Gateway** | `modeldesk-gateway` → `http://127.0.0.1:3310` |

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

Priority:

1. Settings-persisted `data-location.json` (control dir)
2. `MODELDESK_DATA_DIR`
3. Monorepo `./data` when a checkout is detected (`MODELDESK_REPO_ROOT` or cwd)
4. OS app data `ModelDesk` (e.g. `%LOCALAPPDATA%\ModelDesk` on Windows) when no checkout

**Agents should set `MODELDESK_DATA_DIR` to the path shown in Web → Settings** so keys and models match.

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

## Gateway (chat HTTP)

```bash
modeldesk-gateway
# GET  http://127.0.0.1:3310/v1/models
# POST http://127.0.0.1:3310/v1/chat/completions
```

Keep bind on loopback. Optional `MODELDESK_GATEWAY_TOKEN`. See [apps/gateway/README.md](../apps/gateway/README.md).

## Safety

Spawning CLI / MCP / Gateway ≈ ability to spend stored API keys. No multi-tenant login. Do not publish gateway ports to the internet. See [SECURITY.md](../SECURITY.md).

## Out of scope

Cursor Skills / IDE-only recipes, compare/gallery/Radar as MCP tools, public bind, multi-tenant auth.
