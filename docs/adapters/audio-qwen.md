# 千问 TTS — `audio.qwen`

## Meta

| 项 | 值 |
|----|-----|
| `api_format` | `audio.qwen` |
| Modality | `audio` |
| Tier | `core` |
| 建议 Base URL | `https://dashscope.aliyuncs.com/api/v1` |
| 典型 Model ID | `qwen3-tts-flash`, `qwen-audio-3.0-tts-flash` |
| 代码入口 | `api-formats.ts` · `packages/adapters/src/qwen-tts.ts` |
| 适配度 | 待校验 |
| 上次校验 | 2026-08-10（档案初建） |

## 官方文档

| 说明 | URL |
|------|-----|
| DashScope 语音合成 | https://help.aliyun.com/zh/model-studio/developer-reference/speech-synthesis-quick-start |
| （待补具体模型页） | |

## 能力矩阵

| 能力 | 文档 | 本项目 | 备注 |
|------|------|--------|------|
| TTS | ✓ | ✓ | |
| 音色列表 | ✓ | ✓ | UI 含 qwen3 / Flash 等多音色 |
| 风格 instruction | ✓ | ✓ | 含自定义 |

## UI 参数与约束

- `voice`、`speed`、`instruction` / `instruction_custom`

## 已知坑

-

## 校验记录

| 日期 | 结论 | 变更 |
|------|------|------|
| 2026-08-10 | 档案初建 | |
