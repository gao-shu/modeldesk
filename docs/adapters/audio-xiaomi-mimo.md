# 小米 MiMo TTS — `audio.xiaomi-mimo`

## Meta

| 项 | 值 |
|----|-----|
| `api_format` | `audio.xiaomi-mimo` |
| Modality | `audio` |
| Tier | `core` |
| 建议 Base URL | `https://api.xiaomimimo.com/v1` |
| Action | `/chat/completions` |
| 典型 Model ID | `mimo-v2.5-tts`, `mimo-v2.5-tts-voiceclone`, `mimo-v2.5-tts-voicedesign` |
| 代码入口 | `api-formats.ts` · `packages/adapters/src/mimo-tts.ts` |
| 适配度 | 部分对齐 |
| 上次校验 | 2026-08-13 |

## 官方文档

| 说明 | URL |
|------|-----|
| 语音合成 API（OpenAI 兼容） | https://mimo.mi.com/docs/zh-CN/api/audio/tts |
| 使用指南 V2.5 | https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/audio/speech-synthesis-v2.5 |
| 按量计费（TTS 限时免费） | https://mimo.mi.com/docs/zh-CN/price/pay-as-you-go |
| 模型页 · 预置音色 | https://mimo.mi.com/models/zh-CN/mimo-v2.5-tts |
| 模型页 · 音色克隆 | https://mimo.mi.com/models/zh-CN/mimo-v2.5-tts-voiceclone |
| 模型页 · 音色设计 | https://mimo.mi.com/models/zh-CN/mimo-v2.5-tts-voicedesign |

## 能力矩阵

| 能力 | 文档 | 本项目 | 备注 |
|------|------|--------|------|
| 预置音色 TTS | ✓ | ✓ | `mimo-v2.5-tts` + `audio.voice` |
| 风格指令（user） | ✓ | ✓ | `instruction` → user message |
| 内联音频标签 | ✓ | ✓ | 写在主提示词（assistant）内即可 |
| 音色克隆 | ✓ | ✓ | `reference_audio` → data URI / URL |
| 音色设计 | ✓ | ✓ | `instruction` 必填；`optimize_text_preview` |
| 流式 pcm16 | ✓ | — | 当前非流式 wav |
| 唱歌模式 | ✓ | 部分 | 在文本前加 `(唱歌)` 标签即可 |

## UI 参数与约束

- 合成文本放在运行页主提示词（→ `assistant`）；风格 / 音色描述 → `instruction`（`user`）
- `voice` 仅 `mimo-v2.5-tts`：mimo_default / 冰糖 / 茉莉 / 苏打 / 白桦 / Mia / Chloe / Milo / Dean
- `reference_audio` 仅 `voiceclone`：mp3/wav ≤10MB
- `optimize_text_preview` 仅 `voicedesign`

## 已知坑

- 认证同时支持 `Authorization: Bearer` 与 `api-key`；本适配两者都发
- TTS 系列定价页标注「限时免费」，到期后以官方为准
- `voiceclone` / `voicedesign` 模型 ID 含 `mimo-v2.5-tts` 前缀；字段显隐用 `voiceclone` / `voicedesign` 子串，避免误匹配预置音色下拉

## 校验记录

| 日期 | 结论 | 变更 |
|------|------|------|
| 2026-08-13 | 部分对齐 | 初接三模型（非流式）；对照官方文档与定价页 |
