# 即梦 Seedance — `video.volcengine-seedance`

## Meta

| 项 | 值 |
|----|-----|
| `api_format` | `video.volcengine-seedance` |
| Modality | `video` |
| Tier | `core` |
| 建议 Base URL | `https://ark.cn-beijing.volces.com/api/v3` |
| Action | `/contents/generations/tasks` |
| 典型 Model ID | 见下表 |
| 代码入口 | `api-formats.ts` · `packages/adapters/src/video.ts` · `RunParamsFields`（按 model 过滤选项） |
| 适配度 | **部分对齐** |
| 上次校验 | 2026-08-11 |

## 官方文档

| 说明 | URL |
|------|-----|
| 创建视频生成任务 | https://docs.volcengine.com/docs/82379/1520757 |
| Seedance 2.5 教程 | https://docs.volcengine.com/docs/82379/2607688 |

## 型号对照（文档 vs 本项目）

| 型号 | 官方 Model ID | UI 展示 | 时长 | 分辨率（文档 / UI） |
|------|---------------|---------|------|---------------------|
| 2.5 | `doubao-seedance-2-5-260628` | Doubao-Seedance-2.5 | 4–30s / -1；30s 仅 2.5 可见 | 文档 480p·720p；UI 已按型号隐藏 1080p/4K |
| 2.0 | `doubao-seedance-2-0-260128` | Doubao-Seedance-2.0 | 4–15s / -1 | 480p–4K |
| 2.0-fast | `…-fast-260128` | Doubao-Seedance-2.0-fast | 4–15s | 仅 480p·720p |
| 2.0-mini | `…-mini-260615` | Doubao-Seedance-2.0-mini | 4–15s | 仅 480p·720p |

**约定**：下拉显示产品短名，`value` / 库内存官方完整 ID；短别名在保存与请求时由 `canonicalizeApiModelId` / adapter 规范化。

## 能力矩阵

| 能力 | 文档 | 本项目 | 备注 |
|------|------|--------|------|
| 异步创建 + 轮询任务 | ✓ | ✓ | |
| 文生视频 | ✓ | ✓ | |
| 首帧 / 首尾帧 | ✓ | ✓ | `first_frame` / `last_frame` |
| 多参考图 `role=reference_image`（1–9） | ✓ | ✓ | UI「多参考」→ `reference_images`；与首尾帧互斥 |
| generate_audio | ✓ | ✓ | `with_audio` |
| camera_fixed | 1.x ✓；2.x ✗ | 2.x 字段隐藏且不传 | |
| 按型号过滤分辨率 / 30s | ✓ | ✓ | `RunParamOption.models` / `excludeModels` |
| 2.5 多模态参考（视频/音频） | ✓ | — | 本期仅多图；视/音后续 |
| 视频编辑 / 延长 / 时间戳 | ✓（2.5） | — | 故意未做 |

## UI 参数与约束

- `duration_sec`：`30` 带 `models: ["2-5","2.5"]`
- `resolution`：`1080p`/`4k` 对 2.5 / fast / mini `excludeModels`
- `camera_fixed`：对 Seedance 2.x `excludeModels`
- 参考输入：无 / 单张图生 / 首尾帧 / **多参考（最多 9）**

文档若日后为 2.5 开放 1080p：去掉对应 `excludeModels`，更新本表校验记录即可。

## 已知坑

- 1.0 系参数拼进 text；1.5+ / 2.x 用顶层结构化字段。
- 旧配置若仍是短 ID，打开编辑或保存会规范化为官方完整 ID。
- 多参考与首尾帧不可混用；方舟图须公网 URL（TOS）。

## 校验记录

| 日期 | 结论 | 变更 |
|------|------|------|
| 2026-08-11 | 部分对齐 | 多参考图 `reference_image` role 接通 UI+适配器；视/音参考仍缺 |
| 2026-08-10 | 部分对齐 | 对照 2.5 教程：官方 ID、分辨率/30s/camera 按型号落地 UI；多模态参考仍缺；UI 统一官方完整 ID |
