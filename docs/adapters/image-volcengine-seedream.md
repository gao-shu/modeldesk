# 即梦 Seedream — `image.volcengine-seedream`

## Meta

| 项 | 值 |
|----|-----|
| `api_format` | `image.volcengine-seedream` |
| Modality | `image` |
| Tier | `core` |
| 建议 Base URL | `https://ark.cn-beijing.volces.com/api/v3` |
| 典型 Model ID | `doubao-seedream-5-0-pro-260628`, lite/4.5/4.0 等 |
| 代码入口 | `api-formats.ts` · `packages/adapters/src/images.ts`（seedream） |
| 适配度 | 待校验 |
| 上次校验 | 2026-08-10（档案初建） |

## 官方文档

| 说明 | URL |
|------|-----|
| 火山方舟 · 图片生成 | https://docs.volcengine.com/docs/82379/1541523 |
| （待确认最新 Seedream 页） | |

## 能力矩阵

| 能力 | 文档 | 本项目 | 备注 |
|------|------|--------|------|
| 文生图 | ✓ | ✓ | `/images/generations` |
| 图生图参考 | ✓ | ✓ | `reference_images` → `image` |
| 分辨率档 / 宽高比 | ✓ | ✓ | size + ratio 映射像素 |

## UI 参数与约束

- `size`：2K / 3K / 4K（按型号）
- `ratio`：含 adaptive
- `reference_images`

## 已知坑

- Model ID 下拉显示产品名，保存/调用为官方完整 `doubao-seedream-*`；短别名保存时规范化。

## 校验记录

| 日期 | 结论 | 变更 |
|------|------|------|
| 2026-08-10 | 档案初建 | |
