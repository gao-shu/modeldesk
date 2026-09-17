# ModelDesk

**Test. Compare. Use.**

Local multimodal AI playground with model comparison and an OpenAI-compatible gateway.

Test text, image, audio and video models locally.  
Compare 2–3 models on the same input.  
Then copy ready-to-use curl, Python or Java code.

本机多模态 AI 配测台。

测试文本、图片、语音、视频模型；  
用同一输入并行对比 2～3 个模型；  
选中结果后直接复制 curl / Python / Java 调用代码，  
通过本地 OpenAI-compatible Gateway 接入你的应用。

[![Download Windows](https://img.shields.io/badge/Download-Windows%20installer-181717?style=for-the-badge&logo=github)](https://github.com/gao-shu/modeldesk/releases/download/v0.2.1/ModelDesk_0.2.1_x64-setup.exe)
[![All releases](https://img.shields.io/badge/Releases-GitHub-181717?style=for-the-badge&logo=github)](https://github.com/gao-shu/modeldesk/releases)
[![Source (Gitee)](https://img.shields.io/badge/Source-Gitee-c71d23?style=for-the-badge)](https://gitee.com/gaoshuteacher/modeldesk)

[Quick Start](#quick-start) · [Demo](#demo) · [Compare](#compare-models)

> **Installers:** latest published Windows build on GitHub is **[v0.2.1](https://github.com/gao-shu/modeldesk/releases/tag/v0.2.1)** (`ModelDesk_0.2.1_x64-setup.exe`). macOS `.dmg` is on **[v0.1.0](https://github.com/gao-shu/modeldesk/releases/tag/v0.1.0)**. Repo / `package.json` source version is **0.2.3** (no `v0.2.3` GitHub Release assets yet).

```text
Configure a model
       ↓
Test in Playground
       ↓
Compare 2–3 models
       ↓
Inspect output / latency / tokens
       ↓
Use this model
       ↓
Copy curl / Python / Java
       ↓
OpenAI-compatible Gateway
       ↓
Cursor / MCP / Your App
```

ModelDesk is built around a simple loop: test a model, compare alternatives, then take the selected model into your own application.

Product definition: [docs/PRODUCT.md](./docs/PRODUCT.md).

---

## Why ModelDesk

Vendor playgrounds are fine for a single model. Comparing providers usually means juggling several consoles, keys, and result formats — then rewriting calls by hand for your app.

ModelDesk keeps that loop in one local desk:

- One place to configure Text / Image / Audio / Video APIs
- Same input compared across 2–3 models
- Latency, TTFT, and token usage when the upstream returns them
- **Use this model** → curl / Python / Java against your local gateway
- Keys and artifacts stay on your machine by default

Not a chat product. A small developer tool: configure → test → compare → use.

---

## What you can do

### 1. Test

Playground for **Text / Image / Audio / Video** — one model at a time (`/runs/text`, `/runs/image`, …).

### 2. Compare

Same input, **2–3 models of the same modality**, run in parallel (`/runs/compare`).

### 3. Inspect

Per-model output plus **latency**, **TTFT**, **input / output tokens** (when provided), and errors — including partial success if one slot fails.

### 4. Use

On a Compare result card, click **Use this model** and copy **curl / Python / Java** for the local gateway.

### 5. Connect

Point clients at:

```text
http://127.0.0.1:3300/v1
```

Use from your app, scripts, **Cursor / MCP**, or CLI — same configured models.

---

## Demo

> **Demo video**
>
> A short demo is being recorded.
>
> It will show the complete ModelDesk workflow:
>
> **Test → Compare → Inspect → Use this model → curl / Python / Java → Local Gateway**
>
> The current build already supports this workflow.

---

## Quick Start

### Desktop (recommended)

1. Download the Windows installer: [ModelDesk_0.2.1_x64-setup.exe](https://github.com/gao-shu/modeldesk/releases/download/v0.2.1/ModelDesk_0.2.1_x64-setup.exe)  
   Or browse [all GitHub Releases](https://github.com/gao-shu/modeldesk/releases) (macOS builds: [v0.1.0](https://github.com/gao-shu/modeldesk/releases/tag/v0.1.0)).  
   Source mirror: [Gitee](https://gitee.com/gaoshuteacher/modeldesk).
2. Launch **ModelDesk** (first start may unpack the engine for 1–2 minutes).
3. Open **模型配置 / Models**, add an API key, save.
4. Open **图片 / Image** (or Text) and run once.
5. Then try Compare:

```text
1. Configure at least two models with the same modality
2. Open Compare  →  /runs/compare
3. Select Model A and Model B (optional third)
4. Enter the same input
5. Click Run All
6. Inspect results (latency / TTFT / tokens / errors)
7. Click Use this model → copy curl / Python / Java
```

CN walkthrough: [5 分钟跑通第一张图](./docs/quickstart-first-image.md) · [操作手册](./docs/user-guide.md).

### From source

```bash
pnpm install
cp .env.example apps/web/.env.local
pnpm dev   # http://127.0.0.1:3300
```

Requires **Node.js 22** and **pnpm 9.15.0** (see root `package.json`).

Gateway is embedded with the Web UI — no separate process required for `:3300/v1`.

---

## Compare models

Path: **`/runs/compare`** (sidebar: **Compare**).

Run the **same input** against **2–3 models** of the **same modality** in parallel.

You get:

- Shared prompt / modality inputs
- Parallel execution with live (SSE) updates
- Per-slot output or artifact
- Latency, TTFT, token usage when available
- Errors and partial failure (one model can fail while others succeed)

No automatic scores, rankings, or AI judges — just side-by-side results you can inspect.

---

## Use this model

On a **Compare** result card, click **Use this model**.

You get copyable snippets for:

- **curl**
- **Python** (OpenAI SDK → local gateway)
- **Java** (HTTP client → local gateway)

They target:

```text
http://127.0.0.1:3300/v1
```

Settings → **外部调用** also has Gateway curl / client examples and MCP JSON for editors.

---

## Gateway

Default OpenAI-compatible endpoint (same process as Web / Desktop):

```text
http://127.0.0.1:3300/v1
```

```text
ModelDesk
   ↓
Gateway (/v1)
   ↓
Your App / Script / Cursor / MCP
```

Optional headless process: `modeldesk-gateway` on `:3310` (same contract).

Aliases, business notes, and accept scripts: [docs/gateway-business.md](./docs/gateway-business.md) · [docs/external-access.md](./docs/external-access.md).

---

## MCP / Cursor

```text
Cursor → ModelDesk MCP → your configured models → result
```

1. `pnpm install:bins` (Desktop often already on PATH).  
2. Settings → **外部调用** → copy MCP JSON into Cursor.  
3. Tools include `list_models`, `run_text` / `run_image` / `run_video` / `run_audio`, `cancel_run`.

Details: [docs/external-access.md](./docs/external-access.md) · [apps/mcp/README.md](./apps/mcp/README.md).

MCP is a **Use** path for editors — not an agent platform.

---

## Architecture

```text
UI (Playground · Compare · Models)
        ↓
   packages/run-core
        ↓
 adapters + model registry
        ↓
 encrypted keys / SQLite (data dir)

UI ──► OpenAI-compatible Gateway (:3300/v1)
              ↓
     Your App / Cursor / MCP / CLI
```

| Surface | Role |
|---------|------|
| Playground | Test one model |
| Compare | Compare 2–3 models |
| Gateway `/v1` | Use from OpenAI-compatible clients |
| MCP / CLI | Use from editors & scripts |

---

## Security / Local-first

- API keys stored **locally**, encrypted at rest  
- Default bind: **localhost** — do not publish ports to the public internet  
- You bring provider keys; ModelDesk does not sell tokens  
- No login and no multi-tenant cloud sync  
- Object storage / community relays are **opt-in** when an upstream needs a public URL  

See [SECURITY.md](./SECURITY.md).

Windows data dir: `%LOCALAPPDATA%\ModelDesk\`. Dev default: repo `data/`. MCP / CLI / Gateway must share the same `MODELDESK_DATA_DIR`.

---

## Documentation

| Doc | Purpose |
|-----|---------|
| [docs/PRODUCT.md](./docs/PRODUCT.md) | Product freeze (nav, Compare, Use, boundaries) |
| [docs/quickstart-first-image.md](./docs/quickstart-first-image.md) | First image in ~5 minutes |
| [docs/user-guide.md](./docs/user-guide.md) | Operator handbook (includes Compare) |
| [docs/adapters/README.md](./docs/adapters/README.md) | Vendor / format sheets |
| [docs/external-access.md](./docs/external-access.md) | CLI · MCP · Gateway |
| [docs/gateway-business.md](./docs/gateway-business.md) | Gateway aliases & business accept |
| [docs/RELEASE.md](./docs/RELEASE.md) | Desktop release naming |

---

## Development

```bash
pnpm install
pnpm dev                 # Web + Gateway on :3300
pnpm smoke
pnpm check:oss           # before a public push
pnpm desktop:dev         # needs Rust / Tauri
pnpm install:bins -- --add-path
```

| Path | Notes |
|------|--------|
| `apps/web` | Next UI + embedded `/v1` |
| `apps/desktop` | Tauri shell |
| `apps/cli` · `mcp` · `gateway` | Same run-core |
| `packages/*` | Shared core, adapters, registry |

Env template: [`.env.example`](./.env.example) → copy to `apps/web/.env.local`. Docker (localhost only): compose + [docs/deploy-baota.md](./docs/deploy-baota.md).

---

## Contributing

[CONTRIBUTING.md](./CONTRIBUTING.md) · [CHANGELOG.md](./CHANGELOG.md) · [SECURITY.md](./SECURITY.md)

Before publishing: `pnpm check:oss`.

## License

MIT — [LICENSE](./LICENSE).
