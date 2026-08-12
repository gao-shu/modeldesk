# 种子数据

| 文件 | 说明 |
|------|------|
| providers.sample.json | 演示服务商（中性 example.com，无优惠码） |
| models.sample.json | 热门模型样例 |
| prices.sample.json | 跨站价格样例 |
| guides.sample.json | 指南样例 |
| verifications.sample.json | 核验记录样例 |

导入：`pnpm seed`（读取本目录写入 Radar SQLite）。
适配 Skill 由 Web 运行时按需复制，不经过 `pnpm seed`。
