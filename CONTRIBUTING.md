# Contributing to ModelDesk

Thanks for helping improve ModelDesk. This project is a **local single-user** multimodal API desk (not a multi-tenant SaaS).

## Development setup

- Node.js ≥ 20
- pnpm **9.15.0** (see root `packageManager`)

```bash
pnpm install
cp .env.example apps/web/.env.local
pnpm seed
pnpm dev
```

- Web: http://127.0.0.1:3300  
- Radar: http://127.0.0.1:9800  

Keep services on loopback unless you accept the risks in [SECURITY.md](./SECURITY.md).

## Useful commands

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Web + Radar |
| `pnpm mcp` | MCP stdio server (Agent entry) |
| `pnpm mcp:smoke` | MCP `tools/list` smoke |
| `pnpm cli` | CLI list / run (`pnpm cli -- list`) |
| `pnpm gateway` | OpenAI-compatible loopback chat (`:3310`) |
| `pnpm test:radar` | Radar unit tests |
| `pnpm --filter @modeldesk/web test:unit` | Web unit tests (run-core helpers) |
| `pnpm smoke` | Phase-1 smoke (needs running stack where applicable) |
| `pnpm lint` | Package lints / typechecks where defined |
| `node scripts/check-oss.mjs` | Pre-publish hygiene scan |

MCP details: [apps/mcp/README.md](./apps/mcp/README.md). Keep MCP on the same machine and data dir as the desk ([SECURITY.md](./SECURITY.md)).

## Pull requests

1. Keep diffs focused; match existing TypeScript / React style.
2. Do not commit secrets: `.env*`, `*.db`, `.encryption-secret`, `engine.zip`, real API keys.
3. Prefer explicit `api_format` over hostname hacks for new adapters.
4. Community / relay formats stay **opt-in** (tier `relay`), not required for the default experience.
5. Update docs or `CHANGELOG.md` when behavior changes for users.

### Vendor / `api_format` changes

Adapter contracts live in [`docs/adapters/`](./docs/adapters/README.md) (not a full copy of vendor manuals).

When you **add or change** an `api_format` (or vendor request/UI constraints):

1. Update `packages/shared/src/api-formats.ts` and the matching code under `packages/adapters/`.
2. Add or update the short sheet under `docs/adapters/` (copy [`_TEMPLATE.md`](./docs/adapters/_TEMPLATE.md)).
3. Refresh the overview table in `docs/adapters/README.md` (status + last-verified date).
4. Do **not** paste large vendor doc dumps, API keys, private endpoints, or unpublished pricing.

Maintainers (or agents) can re-check a sheet against official URLs on request (`校验 MiniMax` / `校验 Seedance` / …) and then adjust UI options or adapters.

## Naming

- Product name: **ModelDesk**
- Workspace packages: `@modeldesk/*` (e.g. `@modeldesk/web`, `@modeldesk/radar-api`)
- Env / data: `MODELDESK_*`, `modeldesk.db`, `modeldesk-radar.sqlite`, `%LOCALAPPDATA%\ModelDesk`

## Releases

Desktop installers (Windows / macOS) are built on GitHub Actions and can sync to Gitee. See [docs/RELEASE.md](./docs/RELEASE.md).

## Security issues

Do not open a public issue with exploit details. Follow [SECURITY.md](./SECURITY.md).
