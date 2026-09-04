# Changelog

All notable changes to ModelDesk are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/) when tagged releases are cut.

## [Unreleased]

### Removed

- Music modality（`music` 实测 / Gateway `/v1/music/generations` / MCP `run_music` / CLI `run music`）；旧 `type=music` 产物仍可在生成结果中回放

### Changed

- 模型配置默认隐藏社区中转视频 format（勾选后可见）；对象存储 UI 统一为 S3 兼容（七牛等走同一套），字段标签/占位中英对照

## [0.2.3] - 2026-09-02

### Added

- Agnes Image：`agnes-image-2.5-flash` / `2.1` / `2.0` 均可在模型配置选择
- Agnes Video 2.5 Flash 适配
- 拾光 MiniMax-H3 视频中转（多参 `content[]`）
- VLM 对话附件（文本 run / Gateway chat）
- 宝塔 Docker 部署脚本（仅本机回环绑定）

### Changed

- Grok 视频：去掉过时 `grok-imagine-video`；默认 / 多参考用 `1.5` 系；补拾光常见别名
- 中转视频 / 对象存储（七牛）与相关文档整理

## [0.2.2] - 2026-08-25

### Added

- 对象存储支持七牛 Kodo（S3 兼容）示例与驱动
- Seedance 中转 / OpenAI Videos 相关适配与离线 smoke 脚本

### Fixed

- 火山方舟 Base URL 保存时把 `/api/v3` 叠成 `/api/api/…` 的问题
- 「高级」模式不再自动改写 Base URL

### Changed

- 模型配置、Gateway、视频/图片适配若干兼容与体验调整

## [0.2.1] - 2026-08-13

### Changed

- Desktop release：本版 CI **仅打包 Windows**（跳过 macOS）；workflow 支持 `platforms=windows|macos|all`
- Active run 轮询改为 5 秒；视频最长等待 30 分钟，离开页面后仍可同步状态

## [0.2.0] - 2026-08-13

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
- MiniMax Hailuo H3：高级 Base/查询 URL、多参参考、进度文案；中转站结果 URL 兼容 `metadata.url`
- Run status APIs：`GET /api/runs/active`、`GET /api/runs/:id`；历史列表与状态轮询解耦
- Settings 对象存储表单：各云厂商假数据占位示例（不含真实密钥）
- Docs: [docs/gateway-business.md](./docs/gateway-business.md) — 本机业务经 Gateway + 别名对接

### Changed

- `/api/runs/single` delegates to run-core (`onPrepared` for SSE meta + abort registry)
- OpenAI-compatible image path: prefer `POST /images/edits` when reference images are present
- Model config and gallery cards share a denser grid footprint
- In-flight run progress no longer re-fetches the full history page every few seconds

### Fixed

- Artifact file streaming via `Readable.toWeb` (avoids closed-stream errors under Next)
- Sidebar height locked to viewport (`h-dvh` / main scroll)

## [0.1.0] - 2026-08-01

### Added

- Initial ModelDesk monorepo: Web desk, Radar probe API, optional Tauri desktop, MIT license
