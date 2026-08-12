# Brand assets

| File | Use |
|------|-----|
| `logo-source.png` | Master artwork |
| `logo-512.png` / `logo-256.png` | Marketing / docs |
| `../src-tauri/icons/*` | Tauri / Windows installer tray & .exe |

Motif: filled teal squircle with a bold white **M** (ModelDesk).

Regenerate Tauri / Windows icons from the master:

```bash
pnpm --filter @modeldesk/desktop exec tauri icon ./brand/logo-source.png
```
