# OpenAI Images — `image.openai`

## Meta

| 项 | 值 |
|----|-----|
| `api_format` | `image.openai` |
| Modality | `image` |
| Tier | `core` |
| 建议 Base URL | `https://api.openai.com/v1` |
| 典型 Model ID | `gpt-image-2`, `gpt-image-1.5`, `gpt-image-1` |
| 代码入口 | `api-formats.ts` · `images.ts` |
| 适配度 | 待校验 |
| 上次校验 | 2026-08-10（档案初建） |

## 官方文档

| 说明 | URL |
|------|-----|
| Images API | https://platform.openai.com/docs/api-reference/images |

## 能力矩阵

| 能力 | 文档 | 本项目 | 备注 |
|------|------|--------|------|
| generations | ✓ | ✓ | |
| edits（参考图） | ✓ | ✓ | 有 refs 时走 edits / 兼容路径 |
| size / ratio / quality | ✓ | ✓ | |

## UI 参数与约束

- `size`（1K–4K）、`ratio`、`quality`、`reference_images`

## 已知坑

-

## 校验记录

| 日期 | 结论 | 变更 |
|------|------|------|
| 2026-08-10 | 档案初建 | |
