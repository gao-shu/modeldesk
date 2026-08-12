# Vidu 生数 — `video.vidu`

## Meta

| 项 | 值 |
|----|-----|
| `api_format` | `video.vidu` |
| Modality | `video` |
| Tier | `core` |
| 建议 Base URL | `https://api.vidu.cn/ent/v2` |
| Action | `POST /ent/v2/text2video`（及 img2video / start-end2video） |
| 典型 Model ID | `viduq3-pro` · `viduq3-turbo` · `viduq2` · `viduq1` |
| 代码入口 | `api-formats.ts` · `packages/adapters/src/video-cn.ts` |
| 适配度 | **部分对齐** |
| 上次校验 | 2026-08-11 |

## 官方文档

| 说明 | URL |
|------|-----|
| 文生视频 | https://platform.vidu.cn/docs/text-to-video |
| 开放平台 | https://platform.vidu.cn/ |

## 鉴权

- **`Authorization: Token {api_key}`**（注意：不是 Bearer）
- ModelDesk 会自动加 `Token ` 前缀；若用户已带前缀则去重

## 流程对照

1. 提交：`POST …/text2video` | `…/img2video` | `…/start-end2video` → `task_id`
2. 轮询：`GET …/tasks/{task_id}/creations` → `state` + `creations[].url`

## 能力矩阵

| 能力 | 文档 | 本项目 | 备注 |
|------|------|--------|------|
| 文生视频 | ✓ | ✓ | |
| 图生视频 | ✓ | ✓ | 单张参考图 |
| 首尾帧 | ✓ | ✓ | 两张参考图 → start-end2video |
| 参考生视频 / 模板等 | ✓ | — | 未接 |
| audio | ✓ | ✓ | 文生 `with_audio` |
| aspect_ratio / resolution / duration | ✓ | ✓ | 枚举随型号变化，UI 给常用值 |

## UI 参数与约束

- Base URL 须含 `/ent/v2`（简单模式会补全）
- 国际域名 `api.vidu.com` 协议相同，可手改 Base URL

## 已知坑

- 鉴权 scheme 写错成 Bearer 会 401
- 不同型号 duration / resolution 可选值不同；非法组合由官方报错

## 校验记录

| 日期 | 结论 | 变更 |
|------|------|------|
| 2026-08-11 | 部分对齐 | 初建：Token 鉴权、T2V/I2V/首尾帧、creations 轮询 |
