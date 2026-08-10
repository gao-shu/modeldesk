# Changelog

All notable changes to ModelDesk are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/) when tagged releases are cut.

## [Unreleased]

### Added

- **MCP** (`apps/mcp`, `pnpm mcp`): stdio tools `list_models` / `list_active_runs` / `cancel_run` / `run_text|image|video|audio|music` over the shared Web run-core; media results include absolute `artifact.path`; Cursor example + `pnpm mcp:smoke`
- **CLI** (`apps/cli`, `pnpm cli`): `list` / `run text|image` over the same run-core
- **OpenAI-compatible gateway** (`apps/gateway`, `pnpm gateway`): loopback `GET /v1/models` + `POST /v1/chat/completions` (stream + non-stream)
- Shared **run-core** (`apps/web/src/lib/server/run-core.ts`): single-run HTTP, MCP, CLI, and gateway use one prepare → execute path (`runVideo` / `runAudio` / `runMusic` included)
- Desktop release pipeline: GitHub Actions builds Windows + macOS installers; optional sync to Gitee Releases (`docs/RELEASE.md`)
- Desktop runtime bundles portable Node on macOS (arm64/x64) as well as Windows; copies `env.mjs` into engine
- Open-source hygiene: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, GitHub Actions CI, `scripts/check-oss.mjs`
- Image format `image.openai-async` (opt-in relay): generations/edits + `/images/tasks` polling; legacy `image.shiguang` aliases here
- Gallery: full timestamps, `object-contain` image previews, video first-frame preview
- Verify / probe: clearer authenticity verdicts, official-host short-circuit, domestic model families

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
