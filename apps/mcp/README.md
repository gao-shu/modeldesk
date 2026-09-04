# ModelDesk MCP (stdio)

Local **agent entry** for Cursor / Claude Desktop / any MCP client. Uses the **same** SQLite data directory, encryption secret, and [`run-core`](../web/src/lib/server/run-core.ts) as the Web UI — not a second product.

## Install

```bash
# from monorepo root
pnpm install:bins -- --add-path
modeldesk-mcp   # normally launched by the MCP host, not by hand
```

Dev without global link: `pnpm mcp` from the repo root.

## Prerequisites

1. Repo installed: `pnpm install` at the monorepo root  
2. At least one model configured in the Web UI (with API key) for the modality you want to call  
3. Encryption secret available the **same** way as Web (`ENCRYPTION_SECRET` in env, **or** `{dataDir}/.encryption-secret` created via Settings)

## Tools

| Tool | Args | Purpose |
|------|------|---------|
| `list_models` | `modality?`: `text` \| `image` \| `video` \| `audio` | List non-mock registry models; also returns `dataDir` + encryption status |
| `list_active_runs` | — | In-flight runs started by **this** MCP process |
| `cancel_run` | `runId` | Abort an in-flight run in this process |
| `run_text` | `modelId`, `prompt`, `temperature?`, `maxTokens?` | Chat completion |
| `run_image` | `modelId`, `prompt`, `params?` | Image generation |
| `run_video` | `modelId`, `prompt`, `params?` | Video generation |
| `run_audio` | `modelId`, `prompt`, `params?` | Audio / TTS |

`modelId` is the **ModelDesk registry UUID** from `list_models` (not the upstream vendor model string).

Successful media runs include `artifact` / `artifacts` with an absolute filesystem `path` under the data dir (plus `artifactId` for the Web gallery URL).

`cancel_run` only works for runs still tracked in **this** MCP process (not runs started by the Web UI in another Node process).

## Data directory & encryption (must match Web)

| Mode | Default |
|------|---------|
| **Desk running (default)** | MCP probes `http://127.0.0.1:3300/healthz` and uses that `dataDir` (`MODELDESK_FOLLOW_DESK=1`) |
| Dev / offline | control `data-location.json` → `MODELDESK_DATA_DIR` → repo `./data` or OS app-data |
| Disable follow | `MODELDESK_FOLLOW_DESK=0` |

**Alignment checklist**

1. Keep Web / Desktop open on `:3300` while using Trae / Cursor MCP.  
2. Prefer **Settings → 外部调用 → 复制 MCP**（不再写死过期的 `MODELDESK_DATA_DIR`）.  
3. After updating engine / MCP, **reload MCP** in the IDE.  
4. `list_models` returns `dataDir` + `dataDirSource` (`live_desk` | `local`) — if `local` and models look wrong, start Desk.

On stderr startup you should see `[modeldesk-mcp] dataDir … (live_desk|local)`.

## Cursor / WorkBuddy / Codex

Prefer **系统设置 → 外部调用 → 复制 MCP（JSON）** or **复制 Codex（TOML）**.
The copied config uses absolute paths and your live data directory (no PATH dependency).

Fallback without Settings: see [`mcp.cursor.example.json`](./mcp.cursor.example.json) and replace paths.

## Safety

- **No login.** Spawning this process ≈ ability to list models and spend stored keys.  
- stdio only; do not expose an HTTP MCP endpoint to the LAN/internet.  
- Same threat model as the desk — see [SECURITY.md](../../SECURITY.md).

More: [docs/external-access.md](../../docs/external-access.md).

## Out of scope (still)

Compare runs, gallery browsing as tools, Radar-as-tools, public bind, multi-tenant auth.
