# Google Nano Banana — `image.google-nano-banana`

## Meta

| 项 | 值 |
|----|-----|
| `api_format` | `image.google-nano-banana` |
| Modality | `image` |
| Tier | `core` |
| 建议 Base URL | `https://generativelanguage.googleapis.com/v1beta` |
| 典型 Model ID | `gemini-2.5-flash-image`, `gemini-3-pro-image`, … |
| 代码入口 | `api-formats.ts` · `images.ts`（google） |
| 适配度 | 待校验 |
| 上次校验 | 2026-08-10（档案初建） |

## 官方文档

| 说明 | URL |
|------|-----|
| Gemini Image | https://ai.google.dev/gemini-api/docs/image-generation |

## 能力矩阵

| 能力 | 文档 | 本项目 | 备注 |
|------|------|--------|------|
| generateContent 出图 | ✓ | ✓ | |
| 分辨率 / 比例 | ✓ | ✓ | |
| 参考图 | ✓ | ✓ | `reference_images` |

## UI 参数与约束

- `size`、`ratio`、`reference_images`

## 已知坑

-

## 校验记录

| 日期 | 结论 | 变更 |
|------|------|------|
| 2026-08-10 | 档案初建 | |
