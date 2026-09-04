# MiniMax TTS — `audio.minimax`

## Meta

| 项 | 值 |
|----|-----|
| `api_format` | `audio.minimax` |
| Modality | `audio` |
| Tier | `core` |
| 建议 Base URL | `https://api.minimaxi.com/v1` |
| Action | `/t2a_v2` |
| 典型 Model ID | `speech-2.8-hd`, `speech-2.6-hd`, … |
| 代码入口 | `api-formats.ts` · `packages/adapters/src/minimax-tts.ts` |
| 适配度 | 待校验 |
| 上次校验 | 2026-08-10（档案初建） |

## 官方文档

| 说明 | URL |
|------|-----|
| MiniMax 开放平台 | https://platform.minimaxi.com/document/T2A%20V2 |
| （若链接变更，以控制台文档为准） | |

## 能力矩阵

| 能力 | 文档 | 本项目 | 备注 |
|------|------|--------|------|
| T2A v2 | ✓ | ✓ | |
| 音色 / 语速 / 情感 | ✓ | ✓ | UI 三列紧凑布局 |

## UI 参数与约束

- `voice`、`speed`、`emotion`

## 已知坑

-

## 校验记录

| 日期 | 结论 | 变更 |
|------|------|------|
| 2026-08-10 | 档案初建 | |
