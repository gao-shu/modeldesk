# ModelDesk

**ModelDesk** is a **local, single-user** multimodal API desk: configure your own keys, run text / image / audio / video / music against real providers, and keep results on your machine.

> **Product boundary**
>
> - **Local single-user** tool — your API keys, your machine  
> - **No login / no multi-tenant SaaS**  
> - **Do not** expose Web / Radar ports to the public internet (no auth ≈ anyone can spend your keys)  
> - Default bind: **`127.0.0.1`**; Docker needs `HOST=0.0.0.0` *inside* the container (see `docker-compose.yml`)  
> - Security & publish checklist: [SECURITY.md](./SECURITY.md)

中文摘要：模型配置 → 实测 → 运行记录与产物；工作区包 `@modeldesk/*`，环境变量 / 数据目录统一为 `MODELDESK_*` / `ModelDesk`。对外接入：`pnpm install:bins` 后用 **`modeldesk` / `modeldesk-mcp` / `modeldesk-gateway`** 调用同一套内核（见 [docs/external-access.md](docs/external-access.md)）。

```text
模型配置 /models  →  实测 /runs/*  ·  生成结果 /gallery
```

---

## Features

### Available now

| Capability | What you get |
|------------|----------------|
| **Model config** | Register multimodal APIs (format, base URL, key); keys encrypted on disk so you are not hunting consoles every switch |
| **Per-modality runs** | Separate desks for text / image / audio / video / music — prompt, params, output, and history in one place instead of scattered provider playgrounds |
| **Runs & artifacts** | Each run is reviewable (prompt, params, latency, success/fail); media stays local so experiments are reproducible, not chat-and-gone |
| **Verify / probe** | Latency and availability checks on configured endpoints before you trust them in a workflow |
| **Local-first storage** | Config and history on your machine; optional object storage only when a model needs a public URL |
| **Desktop app** | Optional Tauri window around the same stack — keep the desk open without living in a browser tab |
| **Boundary** | Single-user, no accounts; default bind is loopback so keys are not exposed on the LAN |

### Roadmap

Planned core work (not a kitchen-sink backlog):

1. **Local inference** — Connect already-running local services (e.g. ComfyUI, OpenAI-compatible local ports); submit from the same desk and write results back into runs/artifacts  
2. **Multi-model compare** — Same prompt across several registered models; side-by-side output and latency for selection  
3. **Cloud + local scheduling & desktop polish** — One run flow for cloud APIs and local services; deepen the desktop app as the default long-running entry  
4. **Prompt library & test packs** — User-managed prompts and reusable packs (prompt + params + focus notes), wired into compare runs for repeatable experiments  
5. **Agent access (MCP)** — MVP shipped (`pnpm mcp`: `list_models` / `run_text` / `run_image`); deepen tools later as needed

**Out of scope:** multi-tenant login / public SaaS, selling relay tokens, building a second node editor, shipping a full ComfyUI distribution inside the app.

---

## Agent / external access

**Product line:** ModelDesk is a **local multimodal desk**. People configure keys in Web/Desktop; **scripts and agents** reuse the same models through thin shells (not a second product, not public SaaS).

| Channel | Role | Command |
|---------|------|---------|
| Web / Desktop UI | Primary product | — |
| **CLI** | Scripts / CI | `modeldesk` |
| **MCP** | Agent hosts (Cursor, Claude, …) | `modeldesk-mcp` |
| **Gateway** | OpenAI-compatible HTTP (chat) | `modeldesk-gateway` |

**Install once (agent bins on PATH):**

```bash
# Desktop installer installs modeldesk / modeldesk-mcp automatically.
# Or from monorepo:
pnpm install
pnpm install:bins -- --add-path
modeldesk --help
```

Full guide: [docs/external-access.md](docs/external-access.md).

**Run core:** [`apps/web/src/lib/server/run-core.ts`](apps/web/src/lib/server/run-core.ts).

### Quick start (MCP)

1. Configure models in the UI; note Settings → data directory.  
2. `pnpm install:bins`  
3. Point Cursor at [`apps/mcp/mcp.cursor.example.json`](apps/mcp/mcp.cursor.example.json) (`command`: `modeldesk-mcp`, set `MODELDESK_DATA_DIR`).  
4. Agent: `list_models` → `run_text` / `run_image` / …

### Acceptance checklist

- [ ] `pnpm install:bins` then `modeldesk --version` works  
- [ ] `pnpm mcp:smoke` prints `ok: true` with the eight tool names  
- [ ] Cursor lists those tools via `modeldesk-mcp`  
- [ ] `list_models` `dataDir` matches Settings  
- [ ] `modeldesk list` shows the same models  
- [ ] `modeldesk-gateway` + `curl http://127.0.0.1:3310/v1/models` works  

### CLI & gateway examples

```bash
modeldesk list
modeldesk run text --model <registryId> --prompt "hello"

modeldesk-gateway   # http://127.0.0.1:3310
```

- CLI: [apps/cli/README.md](apps/cli/README.md)  
- MCP: [apps/mcp/README.md](apps/mcp/README.md)  
- Gateway: [apps/gateway/README.md](apps/gateway/README.md) — keep host `127.0.0.1`; optional `MODELDESK_GATEWAY_TOKEN`  

---

## Requirements

- Node.js ≥ 20  
- pnpm **9.15.0** (`packageManager` pinned)

Default ports: Web **3300**, Radar **9800** (loopback). On Windows, if Hyper-V blocks a range, set `PORT` / `MODELDESK_WEB_PORT`.

---

## Quick start

```bash
cd modeldesk   # or your clone directory
pnpm install
pnpm seed                 # radar demo catalog
cp .env.example apps/web/.env.local   # set ENCRYPTION_SECRET, RADAR_API_BASE if needed
pnpm dev                  # web + radar-api on loopback
```

| Service | URL |
|---------|-----|
| Web | http://127.0.0.1:3300 |
| Radar API | http://127.0.0.1:9800 |
| Same-origin proxy | http://127.0.0.1:3300/proxy/radar/* |

```bash
pnpm dev:web      # Next only
pnpm dev:radar    # Fastify only (HOST=127.0.0.1 by default)
```

---

## Scripts

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Web + Radar |
| `pnpm build` | Build Web |
| `pnpm seed` | Import `data/seed` demos |
| `pnpm smoke` | Phase-1 smoke |
| `pnpm test:radar` | Radar unit tests |
| `pnpm check:oss` | Pre-publish hygiene scan |
| `pnpm mcp` | ModelDesk MCP stdio server (Agent entry) |
| `pnpm mcp:smoke` | MCP `tools/list` smoke |
| `pnpm cli` | CLI list / run (pass args after `--`) |
| `pnpm gateway` | OpenAI-compatible loopback chat gateway |
| `pnpm install:bins` | Install `modeldesk` / `modeldesk-mcp` / `modeldesk-gateway` shims (`-- --add-path` optional) |
| `pnpm desktop:dev` | Tauri desktop (optional) |
| `pnpm desktop:build` | Windows installer (optional) |

---

## Desktop (optional)

| Role | Notes |
|------|--------|
| Tauri shell | Native window, tray, single instance |
| Sidecar | Node starts Radar (:9800) + Next (:3300) on `127.0.0.1` |
| Data dir | `%LOCALAPPDATA%\ModelDesk\` (override with `MODELDESK_DATA_DIR`) |

Needs Rust + [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) (WebView2 on Windows).

```bash
pnpm install
pnpm --filter @modeldesk/desktop install
pnpm desktop:dev
```

```bash
pnpm desktop:build
# → apps/desktop/src-tauri/target/release/bundle/nsis/ModelDesk_0.1.0_x64-setup.exe
```

Do **not** commit `engine.zip` / `runtime/` (gitignored).

---

## Docker (local)

```bash
cd modeldesk
cp .env.docker.example .env.docker
# Edit ENCRYPTION_SECRET to match your local DB (never commit .env.docker)

docker compose --env-file .env.docker up --build -d
```

| Service | URL |
|---------|-----|
| Web | http://127.0.0.1:3020 (`WEB_HOST_PORT` to remap) |
| Radar | http://127.0.0.1:9800 |

Container processes bind `0.0.0.0`; **do not** publish host ports to the open internet. See [SECURITY.md](./SECURITY.md).

---

## Environment (summary)

Templates: [`.env.example`](./.env.example), [`apps/radar-api/.env.example`](./apps/radar-api/.env.example).

| Variable | Purpose |
|----------|---------|
| `ENCRYPTION_SECRET` | Encrypt API keys / object-storage credentials in SQLite |
| `MODELDESK_DATA_DIR` | Data root (`modeldesk.db`, artifacts, encryption secret) |
| `MODELDESK_REPO_ROOT` | Monorepo root (auto-set by agent bins; optional override) |
| `RADAR_API_BASE` | Web → Radar base (default `http://127.0.0.1:9800`) |
| `HOST` | Radar bind (**default `127.0.0.1`**; Docker `0.0.0.0`) |
| `PORT` | Web or Radar port |
| `CORS_ORIGIN` | Radar CORS (default localhost only) |

---

## Layout

```text
modeldesk/
├── apps/
│   ├── web/                 # Next UI
│   ├── radar-api/           # Fastify probe / catalog
│   └── desktop/             # Tauri (optional)
├── packages/                # shared / adapters / model-registry …
├── docs/
│   ├── adapters/            # api_format ↔ vendor doc contracts
│   ├── external-access.md   # CLI / MCP / Gateway after local install
│   └── RELEASE.md
├── data/seed/               # demo seeds (no real keys)
├── scripts/check-oss.mjs
├── CONTRIBUTING.md
├── SECURITY.md
└── LICENSE                  # MIT
```

SQLite: Web `modeldesk.db`；Radar `modeldesk-radar.sqlite`（或 `MODELDESK_RADAR_DB`）。

厂商对接对照表（文档链接、能力矩阵、适配度）：[docs/adapters/README.md](./docs/adapters/README.md)。

---

## Desktop releases (GitHub → Gitee)

Windows / macOS 安装包由 GitHub Actions 构建；配置 Secrets 后可自动同步到 Gitee Releases（国内下载）。

详见 [docs/RELEASE.md](./docs/RELEASE.md)。

## Contributing & conduct

- [CONTRIBUTING.md](./CONTRIBUTING.md)  
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)  
- [CHANGELOG.md](./CHANGELOG.md)  

CI runs on GitHub Actions (`.github/workflows/ci.yml`): OSS scan, Radar typecheck/tests.  
Desktop release: `.github/workflows/release-desktop.yml` (see [docs/RELEASE.md](./docs/RELEASE.md)).

### Before a public push

```bash
pnpm check:oss
```

Also see [SECURITY.md · Before publishing](./SECURITY.md#before-publishing).

---

## Manual smoke (local)

1. Open http://127.0.0.1:3300/  
2. Models → create (mock or real key) → save  
3. Run once; browse / download in Gallery  
4. Settings → encryption secret; object storage off by default  

---

## License

MIT — see [LICENSE](./LICENSE).
