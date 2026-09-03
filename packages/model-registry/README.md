# @modeldesk/model-registry

Standard **model config + call** foundation for ModelDesk and future apps.

This is **not** product business logic (drama pipelines, eval suites, etc.).
It is the reusable layer for:

1. Registering API configs (key, base URL, format, defaults)
2. Resolving a config for server-side calls

Video generation is orchestrated by the host (`run-core` → `executeModelJob` →
`runVideoGenerate` in ModelDesk web) calling `@modeldesk/adapters` — not via a
separate in-memory task facade in this package.

## Install (monorepo)

```json
"@modeldesk/model-registry": "workspace:*"
```

## Core usage (server)

```ts
import { createModelRegistry } from "@modeldesk/model-registry";

const registry = createModelRegistry({ store: myStore, testConfig });

await registry.saveConfig({ name, modality, capability, provider, modelId, apiKey, ... });
const resolved = await registry.resolveConfig(configId);
// Host merges run params once (run-core), then calls adapters.generateVideo
```

### Store port

Implement `ModelRegistryStore` in the host app (ModelDesk uses SQLite via `createSqliteModelStore`).

### Errors

`RegistryError` with codes: `not_found` | `invalid_key` | `timeout` | `upstream_error` | `invalid_input` | `cancelled`.

## React UI

```ts
import {
  ApiConfigForm,
  ApiConfigList,
  ModelPicker,
  emptyDefaults,
  parseDefaults,
} from "@modeldesk/model-registry/react";
```

- **ApiConfigForm / ApiConfigList** — settings “新建 API 配置”
- **ModelPicker** — pick a `configId` by modality in business pages

Pass `PROVIDER_PRESETS` (or your own catalog) into the form; inject param field UI via `renderParamFields` (ModelDesk uses `RunParamsFields`).

## Boundary

| In this package | Not in this package |
|-----------------|---------------------|
| Config CRUD + resolve + test hook | Remote registry HTTP service |
| React form / list / picker | Video job orchestration / async poll (host + SQLite) |
| Unified error codes | Format definitions (`@modeldesk/shared`) |
| | Billing, webhooks, multi-tenant auth |

Formats stay in `@modeldesk/shared`; adapters stay in `@modeldesk/adapters`.
