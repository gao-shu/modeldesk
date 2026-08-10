# OpenAI 兼容图 — `image.openai-compatible`

## Meta

| 项 | 值 |
|----|-----|
| `api_format` | `image.openai-compatible` |
| Modality | `image` |
| Tier | `core` |
| 建议 Base URL | （用户自填，常含 `/v1`） |
| 典型 Model ID | `gpt-image-2` 等 |
| 代码入口 | `api-formats.ts` · `images.ts`（openai 方言） |
| 适配度 | 待校验 |
| 上次校验 | 2026-08-10（档案初建） |

## 官方文档

| 说明 | URL |
|------|-----|
| OpenAI Images 参考 | https://platform.openai.com/docs/api-reference/images |
| 中转站 | 以各站文档为准 |

## 能力矩阵

| 能力 | 文档 | 本项目 | 备注 |
|------|------|--------|------|
| `/images/generations` | ✓ | ✓ | |
| `/images/edits` + 参考图 | 视上游 | ✓ | multipart；失败可回退 generations |
| size/ratio/quality | 视上游 | ✓ | 档位会换算像素 |

## UI 参数与约束

- `size`、`ratio`、`quality`、`reference_images`

## 已知坑

- 中转对 `image_url` / multipart 行为不一；异步中转请改用 `image.openai-async`。

## 校验记录

| 日期 | 结论 | 变更 |
|------|------|------|
| 2026-08-10 | 档案初建 | |
