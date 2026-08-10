# MiniMax 音乐 — `music.minimax`

## Meta

| 项 | 值 |
|----|-----|
| `api_format` | `music.minimax` |
| Modality | `music` |
| Tier | `core` |
| 建议 Base URL | `https://api.minimaxi.com/v1` |
| Action | `/music_generation` |
| 典型 Model ID | `music-3.0`, `music-2.5` |
| 代码入口 | `api-formats.ts` · `packages/adapters/src/minimax-music.ts` |
| 适配度 | 待校验 |
| 上次校验 | 2026-08-10（档案初建） |

## 官方文档

| 说明 | URL |
|------|-----|
| MiniMax 音乐（待确认最新 URL） | https://platform.minimaxi.com/document |

## 能力矩阵

| 能力 | 文档 | 本项目 | 备注 |
|------|------|--------|------|
| 音乐生成 | ✓ | ✓ | |
| 纯伴奏 | ✓ | ✓ | `is_instrumental` |
| 自动写词 | ✓ | ✓ | `lyrics_optimizer` + 歌词生成 |
| 自定义歌词 | ✓ | ✓ | |
| 目标时长 | 视文档 | ✓ | `duration_sec` |

## UI 参数与约束

- 三列：纯伴奏｜自动写词｜目标时长；歌词整行

## 已知坑

-

## 校验记录

| 日期 | 结论 | 变更 |
|------|------|------|
| 2026-08-10 | 档案初建 | |
