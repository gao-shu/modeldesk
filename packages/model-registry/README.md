# @modeldesk/model-registry

Standard **model config + call** foundation for ModelDesk and future apps.

This is **not** product business logic (drama pipelines, eval suites, etc.).
It is the reusable layer for:

1. Registering API configs (key, base URL, format, defaults)
2. Resolving a config for server-side calls
3. Video generate facade: `submitVideo` / `getVideoStatus` / `waitVideo`

## Install (monorepo)

```json
"@modeldesk/model-registry": "workspace:*"
```

## Core usage (server)

```ts
import { createModelRegistry, createVideoRuntime } from "@modeldesk/model-registry";

const registry = createModelRegistry({ store: myStore, testConfig });
const video = createVideoRuntime({
  registry,
  generateVideo: async ({ resolved, prompt, params, ... }) => {
    // call @modeldesk/adapters (or your own) using resolved.apiKey / formatId
  },
});

await registry.saveConfig({ name, modality, capability, provider, modelId, apiKey, ... });
const resolved = await registry.resolveConfig(configId);

const done = await video.waitVideo({
  configId,
  prompt: "…",
  params: { duration_sec: 5, aspect_ratio: "16:9" },
  onStatus: (status, detail) => console.log(status, detail),
});
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

## Phase-1 boundary

| In this package | Not in this package |
|-----------------|---------------------|
| Config CRUD + resolve + test hook | Remote registry HTTP service |
| Video submit/status/wait facade | Drama / multi-step job orchestration |
| React form / list / picker | Format definitions (still `@modeldesk/shared`) |
| Unified error codes | Billing, webhooks, multi-tenant auth |

Formats stay in `@modeldesk/shared` for now; adapters stay in `@modeldesk/adapters`.
Second apps should depend on this package + shared + adapters, not copy ModelDesk pages.
