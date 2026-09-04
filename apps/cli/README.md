# ModelDesk CLI

Thin wrapper over the shared Web **run-core** (same DB / keys as UI & MCP).

## Install

```bash
# from monorepo root
pnpm install:bins -- --add-path
modeldesk --help
```

Without a global link: `pnpm cli -- …` from the repo root.

## Usage

```bash
modeldesk list
modeldesk list --modality video
modeldesk run text  --model <registryId> --prompt "hello"
modeldesk run image --model <registryId> --prompt "a cat" --params "{\"size\":\"1K\"}"
modeldesk run video --model <registryId> --prompt "…"
modeldesk run audio --model <registryId> --prompt "…"
```

Set `MODELDESK_DATA_DIR` to the **same** directory as Web → Settings. Prefer the shared `{dataDir}/.encryption-secret`.

See [docs/external-access.md](../../docs/external-access.md).
