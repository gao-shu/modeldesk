# xAI Grok Imagine Image — `image.grok`

## Meta

| 项 | 值 |
|----|-----|
| `api_format` | `image.grok` |
| Modality | `image` |
| Tier | `core` |
| 建议 Base URL | `https://api.x.ai/v1` |
| 典型 Model ID | `grok-imagine-image-quality`, `grok-imagine-image-fast` |
| 代码入口 | `api-formats.ts` · `images.ts` → `generateGrokImage` |
| 适配度 | 对齐 |
| 上次校验 | 2026-08-10 |

## 官方文档

| 说明 | URL |
|------|-----|
| Images REST | https://docs.x.ai/developers/rest-api-reference/inference/images |

## 能力矩阵

| 能力 | 文档 | 本项目 | 备注 |
|------|------|--------|------|
| `POST /v1/images/generations` | ✓ | ✓ | JSON |
| `POST /v1/images/edits` | ✓ | ✓ | 官方 JSON `image`/`images`；中转多图改 multipart |
| `aspect_ratio`（文生+图生） | ✓ | ✓ | 含 `auto`（末项）与官方完整枚举 |
| `resolution` `1k` \| `2k` | ✓ | ✓ | |
| `n` | ✓ | ✓ | UI 常用 1/2/4 |
| `response_format` url / b64_json | ✓ | 部分 | 可经 params 传入；未单独做 UI |
| `storage_options` / Files `file_id` | ✓ | — | 未接 |
| OpenAI `size` 像素字段 | ✗ | — | 故意不发 |

## UI 参数与约束

- `aspect_ratio`：`16:9`（默认）· `9:16` · `1:1` · `4:3` · `3:4` · `3:2` · `2:3` · `2:1` · `1:2` · `20:9` · `9:20` · `19.5:9` · `9:19.5` · `auto`（末项）
- `resolution`：`1k` / `2k`
- `reference_images`：公网 URL 或 data URI；多图时官方要求 prompt 用 `<IMAGE_0>`、`<IMAGE_1>`…

## 已知坑

- 官方图生图走 JSON（`image.url` / `images[].url`）。
- **中转站多图**：多数不实现官方 `images[]`；本地上传两张 data URI 塞进 JSON 易触发网关 **502**。适配器对非 `api.x.ai` 主机：参考图已是公网 URL 时优先 JSON（便于透传 `aspect_ratio`），失败再回退 multipart（重复字段 `image`）；仍是 data URI 时直接 multipart。
- UI 若仍带通用 `ratio`/`size`，会在提交/执行时别名到 `aspect_ratio`/`resolution`（仅当 format 不含 `ratio`/`size` 字段时）。
- 有对象存储时，运行前会尝试把 data URI 换成短公网 URL。
- 多图时官方要求 prompt 用 `<IMAGE_0>`、`<IMAGE_1>`…（中文「图一/图二」上游不一定认）。

## 校验记录

| 日期 | 结论 | 变更 |
|------|------|------|
| 2026-08-10 | 档案初建（待校验） | 接入 format |
| 2026-08-10 | 对齐 | 图生图改为官方 JSON；补全 aspect_ratio；去掉错误的 size/multipart |
| 2026-08-10 | 部分对齐（中转） | 中转多图改 multipart；参考图尽量转公网 URL；默认画幅 16:9 |
| 2026-08-10 | 修复 | `ratio`→`aspect_ratio` 别名；中转多图公网 URL 优先 JSON 再回退 multipart |
