# ModelDesk Desktop

Tauri 2 shell around the existing Next stack (see repo README 「桌面端」).

## Dev

From monorepo root (requires Rust + Node **22** + pnpm):

```bash
pnpm install
pnpm --filter @modeldesk/desktop install
pnpm desktop:dev
```

Or only the engine (browser at http://127.0.0.1:3300):

```bash
pnpm desktop:sidecar
```

## Build installer (local)

```bash
pnpm desktop:build
# or from apps/desktop: pnpm build
```

The engine zip includes **CLI / MCP / Gateway** bundles. The Windows installer (and first launch) writes `modeldesk` / `modeldesk-mcp` / `modeldesk-gateway` into `%LOCALAPPDATA%\ModelDesk\bin` and can add that folder to User PATH — same data dir as the UI. See [docs/external-access.md](../../docs/external-access.md).

Artifacts (when run on that OS):

- Windows: `src-tauri/target/release/bundle/nsis/ModelDesk_*_x64-setup.exe`
- macOS: `src-tauri/target/*/release/bundle/dmg/*.dmg`

CI 自动发版（Win + macOS → GitHub → 可选同步 Gitee）见仓库根目录 [docs/RELEASE.md](../../docs/RELEASE.md)。

Skip re-preparing the engine when `resources/engine.zip` already exists:

```bash
SKIP_DESKTOP_PREPARE=1 pnpm desktop:build
```

`build-desktop-runtime.mjs` prunes pack-only dead weight before zipping (source maps, `*.d.ts`, docs/tests, native addon sources, duplicate `sharp`, npm extras). Portable Node ships as `node.exe` / `node` only so a clean machine still runs without a system Node install.

Windows NSIS (`windows/hooks.nsh`) extracts `engine.zip` **during install**, so the first app launch only starts local services (no multi-minute unpack surprise).
