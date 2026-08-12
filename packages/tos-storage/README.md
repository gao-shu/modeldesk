# `@modeldesk/tos-storage`

火山引擎 TOS 上传实现（对象存储 **driver** 之一）。

> **约定（阶段 0）**：自托管默认不需要本包。应用层将通过 `STORAGE_PROVIDER=none|tos|s3` 选择驱动；详见仓库根目录 [README · 对象存储](../../README.md#对象存储可选) 与 [`.env.example`](../../.env.example)。本包在 `STORAGE_PROVIDER=tos`（或仅配置了 `TOS_*` 的兼容模式）时使用。

## 目录约定

| kind | Object Key 前缀 | tos URI 示例 |
|------|-----------------|--------------|
| `image` | `temp/images/` | `tos://your-bucket/temp/images/2026/07/{uuid}.png` |
| `video` | `temp/videos/` | `tos://your-bucket/temp/videos/...` |
| `voice` | `temp/voice/` | `tos://your-bucket/temp/voice/...` |

完整 key：`temp/{images\|videos\|voice}/{yyyy}/{mm}/{uuid}.{ext}`

### 每月清理

在 TOS 控制台给桶配置**生命周期规则**：前缀 `temp/`，到期删除（例如 30 天）。上传临时素材走 `temp/`，即可按月自动清历史。

## 环境变量

```bash
TOS_BUCKET=your-bucket
TOS_ENDPOINT=tos-cn-beijing.volces.com
TOS_REGION=cn-beijing
TOS_ACCESS_KEY=...
TOS_SECRET_KEY=...
TOS_PUBLIC_BASE_URL=https://your-bucket.tos-cn-beijing.volces.com
```

## 用法

```ts
import { createTosStorageFromEnv, requireTosStorage } from "@modeldesk/tos-storage";

const tos = requireTosStorage();

const image = await tos.uploadBytes({
  bytes,
  mime: "image/png",
  filename: "ref.png",
  // kind 可省略，按 mime/扩展名推断
});
// image.publicUrl  → https://...
// image.tosUri     → tos://your-bucket/temp/images/...

const video = await tos.uploadFile(file, "video");
const voice = await tos.uploadBytes({ bytes, mime: "audio/wav", kind: "voice" });

// data URI / base64 → 公网 URL（已是 https 则原样返回）
const url = await tos.ensurePublicUrl(dataUri, { kind: "image" });
```

也可显式传入配置（不读 env）：

```ts
import { createTosStorage } from "@modeldesk/tos-storage";

const tos = createTosStorage({
  bucket: "your-bucket",
  endpoint: "tos-cn-beijing.volces.com",
  region: "cn-beijing",
  accessKey: "...",
  secretKey: "...",
  publicBaseUrl: "https://your-bucket.tos-cn-beijing.volces.com",
});
```

## 测试

```bash
pnpm --filter @modeldesk/tos-storage test:kinds
pnpm --filter @modeldesk/tos-storage smoke:upload   # 需已配置 TOS_*
```
