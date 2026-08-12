# MiniMax 海螺 — `video.minimax-hailuo`

## Meta

| 项 | 值 |
|----|-----|
| `api_format` | `video.minimax-hailuo` |
| Modality | `video` |
| Tier | `core` |
| 建议 Base URL | `https://api.minimaxi.com` |
| Action | v1：`POST /v1/video_generation`；H3：`POST /v2/video_generation` |
| 典型 Model ID | `MiniMax-Hailuo-2.3` · `MiniMax-Hailuo-02` · `MiniMax-H3` |
| 代码入口 | `api-formats.ts` · `packages/adapters/src/video-cn.ts` |
| 适配度 | **部分对齐** |
| 上次校验 | 2026-08-11 |

## 官方文档

| 说明 | URL |
|------|-----|
| 文生视频（v1） | https://platform.minimaxi.com/docs/api-reference/video-generation-t2v |
| 图生视频（v1） | https://platform.minimaxi.com/docs/api-reference/video-generation-i2v |
| 查询任务（v1） | https://platform.minimaxi.com/docs/api-reference/video-generation-query |
| 视频下载 / 文件检索 | https://platform.minimaxi.com/docs/api-reference/video-generation-download |
| 创建任务（v2 · H3） | https://platform.minimaxi.com/docs/api-reference/video-generation-v2-create |
| 查询任务（v2） | https://platform.minimaxi.com/docs/api-reference/video-generation-v2-query |

## 鉴权

- `Authorization: Bearer <API_key>`（国内站 `api.minimaxi.com`）

## 流程对照

### Hailuo / 旧型号（v1）

1. `POST /v1/video_generation` → `task_id`
2. `GET /v1/query/video_generation?task_id=` → `status`：`Preparing` / `Queueing` / `Processing` / `Success` / `Fail`
3. 成功后 `file_id` → `GET /v1/files/retrieve?file_id=` → `file.download_url`（约 1 小时有效）

### MiniMax-H3（v2）

1. `POST /v2/video_generation`，`content[]` 多模态（必含 `text`）
2. `GET /v2/query/video_generation/{task_id}` → `task.status`：`queued` / `running` / `succeeded` / …
3. 成功后直接 `task.content.url`（无需 file retrieve）

## 能力矩阵

| 能力 | 文档 | 本项目 | 备注 |
|------|------|--------|------|
| Hailuo T2V / I2V（首帧） | ✓ | ✓ | `first_frame_image` |
| Hailuo 首尾帧 / 主体参考 | ✓ | — | 未接独立接口 |
| H3 文生 / 首尾帧 | ✓ | ✓ | `role=first_frame/last_frame` |
| H3 多模态参考（视频/音频） | ✓ | — | 故意未做 |
| 分辨率 768P / 1080P / 2K | ✓ | ✓ | H3：768P·2K；1080P UI 映射为 2K |
| 运镜 `[指令]` | ✓（prompt） | ✓ | 用户写在 prompt 内 |

## UI 参数与约束

- 选 `MiniMax-H3` 时走 v2；其余走 v1
- Hailuo：`duration` 与 `resolution` 互相约束（1080P 仅 6s；10s 仅 768P）— UI 列出常用组合，极端组合可能被官方拒
- H3 文生：`ratio` 必填且不能为 `adaptive`

## 已知坑

- v1 成功返回的是 `file_id`，不是直接 URL
- 国际站域名可能是 `api.minimax.io`；本项目默认国内 `minimaxi.com`
- H3 大文件勿塞 Base64（官方建议公网 URL / `mm_file://`）

## 校验记录

| 日期 | 结论 | 变更 |
|------|------|------|
| 2026-08-11 | 部分对齐 | 对照官方 OpenAPI：v1 轮询+files/retrieve；H3 v2 content/url；多模态参考未接 |
