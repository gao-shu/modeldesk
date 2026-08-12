# `@modeldesk/object-storage`

Optional **public temp URL** uploads. Local artifacts stay under `data/artifacts/`.

| `STORAGE_PROVIDER` | Driver |
|--------------------|--------|
| `none` (default) | Pass-through |
| `tos` | Volcengine (`@modeldesk/tos-storage`) |
| `s3` | S3-compatible (`@aws-sdk/client-s3`) |
| `oss` | Alibaba Cloud (`ali-oss`) |
| `cos` | Tencent Cloud (`cos-nodejs-sdk-v5`) |
| `bos` | Baidu Cloud (`bce-sdk-js`) |

Legacy: unset provider + complete `TOS_*` → `tos`.  
Others require explicit `STORAGE_PROVIDER`.

```bash
pnpm --filter @modeldesk/object-storage test
STORAGE_PROVIDER=s3 pnpm --filter @modeldesk/object-storage smoke:s3
```

See repo root README · 对象存储 and `.env.example`.
