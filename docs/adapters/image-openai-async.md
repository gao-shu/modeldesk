# OpenAI 异步图（社区中转）— `image.openai-async`

## Meta

| 项 | 值 |
|----|-----|
| `api_format` | `image.openai-async` |
| Modality | `image` |
| Tier | **relay**（opt-in） |
| 建议 Base URL | （用户自填，如 `https://…/v1`） |
| 典型 Model ID | `gpt-image-2` 等 |
| 代码入口 | `api-formats.ts` · `images.ts`（`generateOpenAiAsyncImage`） |
| 适配度 | 部分对齐 |
| 上次校验 | 2026-08-10 |

## 官方文档

| 说明 | URL |
|------|-----|
| 无统一官方 | 以具体中转站「图片生成对接文档」为准 |
| 约定形态 | `POST …/images/generations` → `image.task` → `GET …/images/tasks/{id}`；编辑 `POST …/images/edits`（multipart） |

## 能力矩阵

| 能力 | 文档（典型中转） | 本项目 | 备注 |
|------|------------------|--------|------|
| 异步文生图 | ✓ | ✓ | 轮询 tasks |
| 异步 edits | ✓ | ✓ | 仅 `image` 文件字段，勿附带巨大 `image_url` |
| quality auto/2k/4k | ✓ | ✓ | |
| size 为比例 | ✓ | ✓ | `mapOpenAiAsyncSize` |

## UI 参数与约束

- `quality`：auto / 2k / 4k
- `size`：1:1、16:9、…
- `reference_images`

## 已知坑

- Legacy id `image.shiguang` 解析为本 format。
- 同步路径多塞 `image_url` data URI 易导致中转 502；异步 edits 已收紧为文档式 multipart。

## 校验记录

| 日期 | 结论 | 变更 |
|------|------|------|
| 2026-08-10 | 部分对齐 | 异步 edits 按常见中转文档收紧；各站仍需个案校验 |
