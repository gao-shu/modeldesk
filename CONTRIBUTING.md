# Contributing to ModelDesk

Thanks for helping improve ModelDesk. This project is a **local single-user** multimodal API desk (not a multi-tenant SaaS).

## Development setup

- Node.js **22** (`.nvmrc` / `.node-version`; do not mix majors — native deps like `better-sqlite3` break across ABI)
- pnpm **9.15.0** (see root `packageManager`)

```bash
pnpm install
cp .env.example apps/web/.env.local
pnpm dev
```

- Web: http://127.0.0.1:3300  

Keep the service on loopback unless you accept the risks in [SECURITY.md](./SECURITY.md).

## Useful commands

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Web |
| `pnpm mcp` | MCP stdio server (Agent entry) |
| `pnpm mcp:smoke` | MCP `tools/list` smoke |
| `pnpm cli` | CLI list / run (`pnpm cli -- list`) |
| `pnpm gateway` | Optional headless Gateway (`:3310`); default API is Web `:3300/v1` |
| `pnpm gateway:smoke` | Headless smoke (health / models / aliases / OpenAPI) |
| `pnpm gateway:accept` | 业务验收（优先 `:3300`；`MODELDESK_ACCEPT_HEADLESS=1` 可起无头） |
| `pnpm --filter @modeldesk/web test:unit` | Web unit tests (run-core helpers) |
| `pnpm smoke` | Smoke (needs running Web) |
| `pnpm lint` | Package lints / typechecks where defined |
| `node scripts/check-oss.mjs` | Pre-publish hygiene scan |

MCP details: [apps/mcp/README.md](./apps/mcp/README.md). Keep MCP on the same machine and data dir as the desk ([SECURITY.md](./SECURITY.md)).

## Pull requests

- Prefer small, reviewable diffs.
- Do not commit secrets, `.env*`, SQLite DBs, or desktop `engine.zip` / `runtime/`.
- Run `pnpm check:oss` before proposing a public-facing change.
- Update adapter docs under `docs/adapters/` when changing API formats.

## Code of conduct

See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
