# xAI Grok Imagine Video — `video.grok`

## Meta

| 项 | 值 |
|----|-----|
| `api_format` | `video.grok` |
| Modality | `video` |
| Tier | `core` |
| 建议 Base URL | `https://api.x.ai/v1` |
| 典型 Model ID | `grok-imagine-video-1.5`（官方）；中转常见 `grok-video-1.5` / `grok-image-video` / `grok-video-3` |
| 代码入口 | `api-formats.ts` · `video.ts` → `generateVideo`（`grok` 分支） |
| 适配度 | 部分对齐 |
| 上次校验 | 2026-08-11 |

## 官方文档

| 说明 | URL |
|------|-----|
| Videos REST | https://docs.x.ai/developers/rest-api-reference/inference/videos |
| Generation 指南 | https://docs.x.ai/developers/model-capabilities/video/generation |

## 能力矩阵

| 能力 | 文档 | 本项目 | 备注 |
|------|------|--------|------|
| `POST /v1/videos/generations` | ✓ | ✓ | 异步，返回 `request_id` |
| `GET /v1/videos/{request_id}` | ✓ | ✓ | `status=done` → `video.url`；识别 `pending`/`failed` |
| `duration` 1–15（默认 8） | ✓ | ✓ | UI 字段 `duration` |
| `aspect_ratio` | ✓ | ✓ | `1:1` · `16:9` · `9:16` · `4:3` · `3:4` · `3:2` · `2:3` |
| `resolution` 480p/720p/1080p | ✓ | ✓ | 1080p 仅 1.5（UI `models` 过滤 + 适配器硬校验） |
| 图生视频 `image.url` | ✓ | ✓ | 单张首帧；payload 仅 `{ url }` |
| 轮询 `expired` | ✓ | ✓ | 与 `failed` 一样立刻失败，不再空转超时 |
| `reference_images`（R2V） | ✓ | ✓ | UI「多参考」；与 I2V `image` 互斥；**仅型号名含 `1.5`**（最多 7） |
| `reference_audios` | ✓ | — | 未接 |
| `POST /videos/edits` | ✓ | — | 未接；官方需 `video.url` + prompt，产品无片源字段 |
| `POST /videos/extensions` | ✓ | — | 未接 |
| `storage_options` / `output.upload_url` | ✓ | — | 未接；默认靠结果里的 `video.url` |

## UI 参数与约束

- `duration`：1 / 3 / 5 / **8（默认）** / 10 / 15
- `aspect_ratio`：上表 7 项（与图片枚举不同，无 `auto`）
- `resolution`：480p / 720p / 1080p
- 参考输入：无 / **首帧图（I2V）** / **多参考（R2V）**；无首尾帧

## 已知坑

- 轮询成功但 `video.respect_moderation=false` 时 `url` 为空；适配器会直接失败，避免空转超时。
- 状态为 `pending` 时带 `progress`（0–99）；`done` 时为 100；`expired` / `failed` 立刻报错。
- 勿把图片侧的超宽比例（如 `20:9`）套到视频上。
- **1080p / R2V**：仅型号名含 `1.5`（官方 `grok-imagine-video-1.5`，或中转 `grok-video-1.5`）；非 1.5 适配器会拒发。已移除过时的 `grok-imagine-video` 选项。
- **R2V**：传 `reference_images: [{ url }]`；勿与 I2V `image` 同传；prompt 可用 `<IMAGE_1>` 等标注。
- **视频编辑 / 延长**与图生图不同：编辑走独立 `POST /videos/edits`，输入是已有 **视频**，不是参考图；官方编辑不支持自定义 `aspect_ratio` / `duration` / `resolution`。
- **中转站**（如拾光）：Base URL `…/v1`，型号用站内清单（`grok-video-1.5` 等）；上游可能仍按 OpenAI Videos 返回 `video_*` + `/v1/videos/{id}/content`。适配器会拼相对 `/content` 并带 Bearer 下载。多参考务必选带 `1.5` 的型号。

## 校验记录

| 日期 | 结论 | 变更 |
|------|------|------|
| 2026-09-01 | 部分对齐 | 去掉过时 `grok-imagine-video`；下拉补拾光常见别名；R2V/1080p 按型号名含 `1.5` 判定 |
| 2026-08-11 | 部分对齐 | 对照能力文档：R2V 恢复仅 1.5；说明中转「1 张首图」误报 |
| 2026-08-11 | 部分对齐 | 对照 REST：曾对所有型号下发 `reference_images`（后按能力文档收回） |
| 2026-08-11 | 部分对齐 | 修复 `resolveRunParamsForFormat` 丢弃 `reference_images`（多参考未进请求） |
| 2026-08-11 | 部分对齐 | 接通 R2V `reference_images`；音频参考 / edits / extend 仍缺 |
| 2026-08-10 | 档案初建（待校验） | 接入 format |
| 2026-08-10 | 部分对齐 | 补全画幅；默认时长 8；接 I2V `image`；处理 moderation / pending |
| 2026-08-10 | 部分对齐（复核） | 对照官方 REST：生成+查询对齐；去掉 I2V 多余 `type`；确认 edits/extensions 未接 |
| 2026-08-10 | 部分对齐（中转） | Grok 配置兼容中转返回的 `video_*` + `/videos/{id}/content` 相对路径取片 |
| 2026-08-11 | 部分对齐 | 轮询识别 `expired`；1080p 按型号过滤 + 硬校验 |
