# 火山 Wan — `video.volcengine-wan`

## Meta

| 项 | 值 |
|----|-----|
| `api_format` | `video.volcengine-wan` |
| Modality | `video` |
| Tier | `core` |
| 建议 Base URL | 方舟 `/api/v3` |
| 代码入口 | `api-formats.ts` · `video.ts`（Wan：参数拼进 text） |
| 适配度 | 待校验 |
| 上次校验 | 2026-08-10（档案初建） |

## 官方文档

| 说明 | URL |
|------|-----|
| 创建视频任务（共用） | https://docs.volcengine.com/docs/82379/1520757 |
| （待补 Wan 专页） | |

## 能力矩阵

| 能力 | 文档 | 本项目 | 备注 |
|------|------|--------|------|
| t2v / i2v | ✓ | ✓ | 下拉「文生/图生」，存 `wan2-1-14b-*-250225`；短别名兼容规范化 |
| 异步任务 | ✓ | ✓ | 与 Seedance 同端点族 |

## UI 参数与约束

- 见 format fields

## 已知坑

-

## 校验记录

| 日期 | 结论 | 变更 |
|------|------|------|
| 2026-08-10 | 档案初建 | |
