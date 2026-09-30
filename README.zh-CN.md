# MarginDeck MCP

[English](README.md) · [MarginDeck 官网](https://www.margindeck.app/zh) · [问题反馈](https://github.com/clot/margindeck-mcp/issues)

使用 Node.js 实现的 Claude Desktop 本地扩展，连接**已安装的 MarginDeck Mac 应用**。你可以询问已记录的产品收入、成本、预计贡献利润和现金跑道。读取财务数据前需要在 MarginDeck 中批准配对，拟保存的记录仍需在 App 内单独审核确认。

## 当前状态

连接器初始版本为 **0.1.0**。仓库用于准备 Claude 桌面扩展目录申请，**尚未被 Anthropic 收录或认证**。自动测试使用虚构数据；正式提交前，仍需使用 Claude Desktop 和签名发行版 App 完成此 Node.js 安装包的人工安装与配对验证。详见[送审检查](docs/submission.md)。

## 使用条件

- macOS 14 或更新版本，不支持 Windows、Linux、Claude 网页版或移动版。
- 已安装并运行 MarginDeck **1.6.0 或更新版本**，在 **AI 连接**中开启 MCP。
- 支持桌面扩展的 Claude Desktop；Node 扩展使用客户端提供的 Node.js。开发和手动命令行运行需要 Node.js 20 或更新版本。

安装扩展不会安装或启动 MarginDeck，不会解锁 Pro，也不会代替你批准访问。App 原有的权益及操作限制仍然适用。此扩展与 App 内导出的二进制扩展是两种连接方式，请只安装其中一种，以免工具和配对重复。

## 构建与安装

```sh
git clone https://github.com/clot/margindeck-mcp.git
cd margindeck-mcp
npm ci --ignore-scripts
npm run check
```

生成文件：`dist/margindeck-0.1.0.mcpb`。连接器没有第三方运行时依赖，开发用打包工具不包含在安装包中。

1. 打开 MarginDeck，在 **AI 连接**中开启 MCP。
2. 在 Claude Desktop 的 **Settings → Extensions → Advanced settings → Install Extension…** 中选择安装包。
3. 设置 MarginDeck 应用位置，默认 `/Applications/MarginDeck.app`。
4. 让 Claude 调用 `get_status`，在 MarginDeck 中核对配对码并批准该客户端。
5. 开始查询财务数据。所有拟保存的记录都需要在 MarginDeck 中审核确认。

示例：“汇总本月已记录的收入和成本。”“比较各产品的预计贡献利润。”“根据已记录的现金和经常性成本解释现金跑道。”贡献利润是经营估算，现金跑道是基于记录的规划预测，均由 App 计算。

## 本地依赖与数据处理

Node.js 负责 JSON-RPC 分帧、HTTP 转发、协议协商、响应校验、超时和凭证更新。它只调用已安装 App 的签名 `MCPHeaders headers` 辅助程序获取短期凭证，不调用辅助程序的 `stdio` 实现。App 和原生辅助程序是明确的外部依赖，不包含在此仓库或扩展包内。

连接器校验 App 和辅助程序的签名身份，只连接固定的 `127.0.0.1:39983/mcp`。凭证仅保存在进程内存，不写日志或磁盘。连接器不直接访问数据库，不发送遥测，不自动批准连接，不绕过 App 内审核。

**返回给 Claude 的数据会与 Claude 共享。** 账本保存在 Mac，不意味着经授权发送给 AI 的内容仍只在本机。详见[数据处理说明](PRIVACY.md)及[产品隐私政策](https://www.margindeck.app/zh/privacy)。

App 未安装、版本过旧或路径不正确时，请安装更新或修改扩展设置。App 已关闭或 MCP 未启用时，请先在 App 中开启。配对过期或撤销后需要重新授权。写入响应丢失时，应先检查 `get_operation` 和 App 中的记录，再决定是否重新提交。

在 MarginDeck 的 AI 连接中撤销授权；在 Claude Desktop 中卸载扩展。卸载扩展不会删除账本。

## 许可

本仓库的连接器源码和文档采用 [MIT 许可](LICENSE)。单独分发的 MarginDeck App 及其原生辅助程序不属于本仓库，也不因此改为 MIT 许可。本仓库不包含 App 源码、App 二进制或用户数据。
