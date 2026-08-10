# Security policy — ModelDesk

## Product boundary (fixed)

ModelDesk is a **local, single-user desk**:

- Configure **your** API keys and run multimodal calls on **your** machine  
- **No login / no multi-tenant SaaS / not an internet gateway**  
- Default bind: **`HOST=127.0.0.1`** (loopback only). Docker must set `HOST=0.0.0.0` **inside** the container; still do not publish ports to the public internet.

See also the banner at the top of [README.md](./README.md).

## Threat model

It stores API keys encrypted in a local SQLite database and calls upstream model APIs with *your* credentials.

It is **not**:

- a multi-tenant SaaS
- an internet-facing gateway
- an auth / SSO product

## Do not expose to the public internet

If you bind Web / Radar to `0.0.0.0` on the host, or publish Docker ports without a reverse proxy and access control:

- Anyone who can reach the ports may run probes, list models, and trigger paid upstream calls with keys stored on that host.
- Radar CORS defaults allow only `localhost` / `127.0.0.1` (set `CORS_ORIGIN=*` only if you accept the risk).
- There is no login. Physical or network access ≈ full app access.

**Recommended:** keep Radar `HOST=127.0.0.1` (the code default); open the UI only at `http://127.0.0.1:3300`.

## MCP / agent access

When the MCP server is enabled, it uses the **same** encrypted key store and run path as the Web UI.

- Prefer **stdio** launched by a trusted local host (e.g. Cursor on the same machine).  
- Do **not** publish an MCP HTTP/SSE endpoint to the LAN or internet without additional access control (none ships by default).  
- Treat MCP like the UI: **local process access ≈ ability to spend configured API keys**.  
- Logs and tool results must not echo full API keys.

MVP tool surface covers multimodal runs (`list_models` / `run_text|image|video|audio|music` / `cancel_run`). Setup: [docs/external-access.md](./docs/external-access.md), [apps/mcp/README.md](./apps/mcp/README.md).

Ensure the MCP process uses the **same** `MODELDESK_DATA_DIR` (and encryption secret — prefer `{dataDir}/.encryption-secret`) as the Web UI, or agents will not see your configured keys/models.

## CLI & OpenAI-compatible gateway

`modeldesk` / `modeldesk-gateway` (via `pnpm install:bins`) are thin shells over the same run-core and key store. Repo fallbacks: `pnpm cli` / `pnpm gateway`.

- Default gateway bind: **`127.0.0.1:3310`**. Do not set `MODELDESK_GATEWAY_HOST` to a public interface unless you accept that anyone who can reach the port can spend keys.  
- Optional `MODELDESK_GATEWAY_TOKEN` (Bearer) is a local shared-secret only — not multi-tenant auth.  
- Details: [docs/external-access.md](./docs/external-access.md), [apps/cli/README.md](./apps/cli/README.md), [apps/gateway/README.md](./apps/gateway/README.md).

## Secrets

- Prefer `ENCRYPTION_SECRET` (or Settings → generate) and never commit `.env`, `.encryption-secret`, or `*.db`.
- Rotating `ENCRYPTION_SECRET` makes existing ciphertext unreadable.
- Demo seed uses mock / placeholder keys only; never put production keys into seed scripts.
- Desktop build artifacts (`engine.zip`, `apps/desktop/src-tauri/runtime/`, `resources/`) stay out of Git.

## Before publishing

Run from the repo root before a public push or release tag:

```bash
pnpm check:oss
# equivalent: node scripts/check-oss.mjs
```

Confirm manually:

- [ ] Only `.env.example` / `.env.*.example` are tracked — never real `.env` / `.env.local` / `.env.docker`
- [ ] No `*.db` / `*.sqlite` / `.encryption-secret` / `engine.zip` in the tree
- [ ] Seed / smoke fixtures use fake keys (`sk-test…`, `change-me…`) only
- [ ] README product-boundary banner still matches this file
- [ ] Root has no committed UI screenshot dumps (`models-*.png`, `runs-*.png`, …)

## Reporting issues

If you find a vulnerability in this repository, open a private security advisory / contact the maintainers — do not file a public issue with exploit details until a fix is available.
