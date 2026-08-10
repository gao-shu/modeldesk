# 智谱 CogView / GLM-Image — `image.zhipu-cogview`

## Meta

| 项 | 值 |
|----|-----|
| `api_format` | `image.zhipu-cogview` |
| Modality | `image` |
| Tier | `core` |
| 建议 Base URL | `https://open.bigmodel.cn/api/paas/v4` |
| 典型 Model ID | `glm-image`, `cogview-4`, `cogview-3-flash`（免费） |
| 代码入口 | `api-formats.ts` · `images.ts`（zhipu） |
| 适配度 | 部分对齐 |
| 上次校验 | 2026-08-10 |

## 官方文档

| 说明 | URL |
|------|-----|
| 开放平台 · 图像 | https://open.bigmodel.cn/dev/api/image-model/cogview |
| （待补 glm-image 专页） | |

## 能力矩阵

| 能力 | 文档 | 本项目 | 备注 |
|------|------|--------|------|
| 文生图 | ✓ | ✓ | `/images/generations` |
| size / quality | ✓ | ✓ | glm-image 质量常锁 hd |
| 图生图 `image` | 待确认 | ✓ | 2026-08-10 已加 UI + 请求体；需官方校验 |

## UI 参数与约束

- `size`、`quality`、`reference_images`

## 已知坑

- cogview-3-flash 等免费模型能力以控制台为准。

## 校验记录

| 日期 | 结论 | 变更 |
|------|------|------|
| 2026-08-10 | 部分对齐 | 补参考图 UI/提交；官方图生图字段待校验 |
