# Google Gemini — `text.gemini`

## Meta

| 项 | 值 |
|----|-----|
| `api_format` | `text.gemini` |
| Modality | `text` |
| Tier | `core` |
| 建议 Base URL | `https://generativelanguage.googleapis.com/v1beta/openai` |
| 典型 Model ID | `gemini-2.0-flash`, `gemini-2.5-pro`, … |
| 代码入口 | `api-formats.ts` · `openai-compatible.ts`（OpenAI 兼容层） |
| 适配度 | 待校验 |
| 上次校验 | 2026-08-10（档案初建） |

## 官方文档

| 说明 | URL |
|------|-----|
| Gemini API | https://ai.google.dev/gemini-api/docs |
| OpenAI 兼容 | https://ai.google.dev/gemini-api/docs/openai |

## 能力矩阵

| 能力 | 文档 | 本项目 | 备注 |
|------|------|--------|------|
| OpenAI 兼容 Chat | ✓ | ✓ | 走兼容 Base URL |
| 原生 generateContent | ✓ | — | 文本侧故意用兼容层 |

## UI 参数与约束

- `TEXT_CHAT_FIELDS`

## 已知坑

-

## 校验记录

| 日期 | 结论 | 变更 |
|------|------|------|
| 2026-08-10 | 档案初建 | |
