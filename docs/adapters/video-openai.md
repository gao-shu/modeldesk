# OpenAI 系视频 — `video.openai-*`

覆盖：`video.openai-videos` · `video.openai-compatible` · `video.openai-generations`。

## Meta

| 项 | 值 |
|----|-----|
| Modality | `video` |
| Tier | `core` |
| 代码入口 | `api-formats.ts` · `video.ts` |
| 适配度 | 待校验 |
| 上次校验 | 2026-08-10（档案初建） |

## 官方文档

| 说明 | URL |
|------|-----|
| OpenAI Videos | https://platform.openai.com/docs/api-reference/videos |
| 兼容 / generations | 以具体上游为准 |

## 能力矩阵

| 能力 | 文档 | 本项目 | 备注 |
|------|------|--------|------|
| 异步视频任务 | 视 format | ✓ | 多 format 分流 |
| 自定义 endpoint | compatible | ✓ | |

## UI 参数与约束

- 各 id 的 `fields` 见 `api-formats.ts`

## 已知坑

- 三 id 勿混用；新建配置时选与上游一致的 format。

## 校验记录

| 日期 | 结论 | 变更 |
|------|------|------|
| 2026-08-10 | 档案初建 | |
