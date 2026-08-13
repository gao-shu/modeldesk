# 5 分钟：跑通第一张图

面向第一次安装的用户。目标：装好 ModelDesk → 配一个图片模型 Key → 生成并看到结果。

## 1. 下载并安装

1. 打开发行版（任选其一）：
   - **Windows（国内）：** [Gitee · v0.1.0](https://gitee.com/gaoshuteacher/modeldesk/releases/tag/v0.1.0) → `ModelDesk_0.1.0_x64-setup.exe`
   - **Win / macOS 全量：** [GitHub · v0.1.0](https://github.com/gao-shu/modeldesk/releases/tag/v0.1.0)
2. 安装并启动 **ModelDesk**。

> 首次启动会解压内置引擎，大约 **1～2 分钟**，属正常现象。托盘图标出现后，窗口会打开本机界面（`http://127.0.0.1:3300`）。

Windows 数据默认在：`%LOCALAPPDATA%\ModelDesk\`。

## 2. 生成加密密钥（若提示未配置）

打开 **系统设置**。若显示尚未配置 `ENCRYPTION_SECRET`，点 **生成加密密钥**。  
保存 API Key 前需要这一步。

## 3. 配置一个图片模型

1. 打开 **模型配置** → **新建配置**。
2. 类型选 **图片**，填入：
   - 你常用的图片 API（如 OpenAI 兼容中转、火山 Seedream、智谱等）
   - Base URL、模型 ID、API Key
3. 保存后可点 **测试** 确认连通（失败时看弹窗/日志里的报错）。

不会把 Key 明文写进文档；密钥在本地加密存放。

## 4. 生成第一张图

1. 左侧进入 **实测 → 图片**。
2. 上方选中刚保存的模型。
3. 提示词随便写一句，例如：`一只橘猫坐在窗台上，阳光，写实`。
4. 尺寸 / 比例可先用默认，点 **开始运行**。
5. 右侧出现结果后，可 **下载**；下方 **历史** 可回看。

更多成品集中在 **生成结果**。

## 5. 可选：给 Cursor 用

同一数据目录下，脚本 / Agent 可复用模型：

- **系统设置 → 外部调用** → **复制 MCP（JSON）**
- 详细说明见 [external-access.md](./external-access.md)

## 卡住了？

| 现象 | 建议 |
|------|------|
| 启动很久白屏 | 等引擎解压结束；看 `%LOCALAPPDATA%\ModelDesk\sidecar.log` |
| 保存 Key 失败 | 先在设置里生成加密密钥 |
| 运行报鉴权 / 404 | 核对 Base URL、模型 ID 是否与厂商文档一致 |
| 磁盘变大 | **系统设置 → 磁盘占用 → 清理生成结果** |

更完整的操作图文见 [user-guide.md](./user-guide.md)；能力说明见仓库根目录 [README.md](../README.md)。
