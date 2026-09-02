# OpenAI 兼容图 — `image.openai-compatible`

## Meta

| 项 | 值 |
|----|-----|
| `api_format` | `image.openai-compatible` |
| Modality | `image` |
| Tier | `core` |
| 建议 Base URL | `https://ark.cn-beijing.volces.com/api/v3`（火山方舟 OpenAI 兼容；勿填 `api.openai.com`） |
| 典型 Model ID | `gpt-image-2` 等 |
| 代码入口 | `api-formats.ts` · `images.ts`（openai 方言） |
| 适配度 | 部分对齐 |
| 上次校验 | 2026-08-13 |

## 官方文档

| 说明 | URL |
|------|-----|
| OpenAI Images 参考 | https://platform.openai.com/docs/api-reference/images |
| 中转站 | 以各站文档为准 |

## 能力矩阵

| 能力 | 文档 | 本项目 | 备注 |
|------|------|--------|------|
| `/images/generations` | ✓ | ✓ | |
| `/images/edits` + 参考图 | 视上游 | ✓ | multipart 文件优先；失败可回退 generations |
| size/ratio/quality | 视上游 | ✓ | 档位会换算像素 |
| 参考图 JSON | 视上游 | ✓ | **仅** `image_urls`（不喷 `image` / `images`） |

## UI 参数与约束

- `size`、`ratio`、`quality`、`reference_images`

## 已知坑

- 国内常用火山方舟根地址 `https://ark.cn-beijing.volces.com/api/v3`；官方 OpenAI 请选 `image.openai`，不要在本 format 填 `api.openai.com`。
- 严格中转（`unknown field`）只能发上游认识的字段；兼容路径 JSON 参考图只发 `image_urls`。
- 异步中转请改用 `image.openai-async`（同一套 `image_urls` 精简）。
- edits：有本地/可编码文件走 multipart `image`；仅公网 URL 且无文件时用 `image_urls[]`。

## 校验记录

| 日期 | 结论 | 变更 |
|------|------|------|
| 2026-08-13 | 部分对齐 | 参考图精简：去掉同喷 `image` / `images` / edits `image_url` |
| 2026-08-10 | 档案初建 | |
