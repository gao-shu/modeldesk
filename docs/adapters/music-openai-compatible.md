# OpenAI 兼容音乐 — `music.openai-compatible`

## Meta

| 项 | 值 |
|----|-----|
| `api_format` | `music.openai-compatible` |
| Modality | `music` |
| Tier | `core` |
| 建议 Base URL | （用户自填） |
| 代码入口 | `api-formats.ts` · 音乐适配路径 |
| 适配度 | 待校验 |
| 上次校验 | 2026-08-10（档案初建） |

## 官方文档

| 说明 | URL |
|------|-----|
| 无统一官方 | 以自定义上游为准；字段对齐 MiniMax 常用参数集 |

## 能力矩阵

| 能力 | 文档 | 本项目 | 备注 |
|------|------|--------|------|
| 自定义音乐 endpoint | — | ✓ | 字段同 `MUSIC_COMMON_FIELDS` |

## UI 参数与约束

- 同 MiniMax 音乐公共字段

## 已知坑

- 兼容性完全依赖上游实现。

## 校验记录

| 日期 | 结论 | 变更 |
|------|------|------|
| 2026-08-10 | 档案初建 | |
