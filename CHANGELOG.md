# Changelog

All notable changes to ModelDesk are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/) when tagged releases are cut.

## [Unreleased]

### Removed

- **Radar（API 雷达）**：删除 `apps/radar-api`、`packages/radar-types` 及 Docker / 桌面 sidecar / Web 代理接线；`pnpm dev` 仅启动 Web

### Added

- **MCP** (`apps/mcp`, `pnpm mcp`): stdio tools `list_models` / `list_active_runs` / `cancel_run` / `run_text|image|video|audio|music` over the shared Web run-core; media results include absolute `artifact.path`; Cursor example + `pnpm mcp:smoke`
- **CLI** (`apps/cli`, `pnpm cli`): `list` / `run text|image` over the same run-core
- **Gateway Phase A**：多模态 `/v1`（文/图/音/视/乐、别名、OpenAPI、Client、可选 token）**默认挂在 Web/桌面 `:3300`**；`modeldesk-gateway`（`:3310`）降为可选无头；`@modeldesk/gateway-client` 默认 `:3300`
- Shared **run-core** (`apps/web/src/lib/server/run-core.ts`): single-run HTTP, MCP, CLI, and gateway use one prepare → execute path (`runVideo` / `runAudio` / `runMusic` included)
- Desktop release pipeline: GitHub Actions builds Windows + macOS installers; optional sync to Gitee Releases (`docs/RELEASE.md`)
- Desktop runtime bundles portable Node on macOS (arm64/x64) as well as Windows; copies `env.mjs` into engine
- Open-source hygiene: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, GitHub Actions CI, `scripts/check-oss.mjs`
- Image format `image.openai-async` (opt-in relay): generations/edits + `/images/tasks` polling; legacy `image.shiguang` aliases here
- **通义万相** `image.dashscope-wanxiang`：DashScope 文生图适配（非 OpenAI 兼容；wan2.6+ 同步/异步，更早型号异步 text2image）
- Gallery: full timestamps, `object-contain` image previews, video first-frame preview
- Video multi-ref：Seedance「多参考」→ `role=reference_image`（最多 9）；Grok R2V → `reference_images`（最多 7，仅 1.5；与 I2V 互斥）
- Docs: [docs/gateway-business.md](./docs/gateway-business.md) — 本机业务经 Gateway + 别名对接

### Changed

- `/api/runs/single` delegates to run-core (`onPrepared` for SSE meta + abort registry)
- OpenAI-compatible image path: prefer `POST /images/edits` when reference images are present
- Model config and gallery cards share a denser grid footprint

### Fixed

- Artifact file streaming via `Readable.toWeb` (avoids closed-stream errors under Next)
- Sidebar height locked to viewport (`h-dvh` / main scroll)

## [0.1.0] - 2026-08-01

### Added

- Initial ModelDesk monorepo: Web desk, Radar probe API, optional Tauri desktop, MIT license
