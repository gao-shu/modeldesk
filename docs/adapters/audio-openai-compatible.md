# OpenAI 兼容 TTS — `audio.openai-compatible`

## Meta

| 项 | 值 |
|----|-----|
| `api_format` | `audio.openai-compatible` |
| Modality | `audio` |
| Tier | `core` |
| Action | `/audio/speech` |
| 典型 Model ID | `tts-1`, `tts-1-hd`, `gpt-4o-mini-tts` |
| 代码入口 | `api-formats.ts` · `tts.ts` / OpenAI 兼容路径 |
| 适配度 | 待校验 |
| 上次校验 | 2026-08-10（档案初建） |

## 官方文档

| 说明 | URL |
|------|-----|
| Speech | https://platform.openai.com/docs/api-reference/audio/createSpeech |

## 能力矩阵

| 能力 | 文档 | 本项目 | 备注 |
|------|------|--------|------|
| `/audio/speech` | ✓ | ✓ | |
| voice / speed | ✓ | ✓ | |

## UI 参数与约束

- `voice`、`speed`

## 已知坑

-

## 校验记录

| 日期 | 结论 | 变更 |
|------|------|------|
| 2026-08-10 | 档案初建 | |
