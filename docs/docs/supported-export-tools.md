# 支持的导出工具列表

> 如果你已经在下面这些客户端、CLI 工具或自建后台里使用 API，All API Hub 可以帮你更快把站点配置带过去，少掉重复填写 `Base URL`、`API Key` 和模型名的步骤。

## 常用客户端与工具

| 产品 | 官方描述 | 官方链接 |
|------|----------|----------|
| Cherry Studio | AI 生产力工作室，提供智能对话、自主代理和 300+ 助手，统一接入前沿大模型。 | [官网](https://www.cherry-ai.com/) / [GitHub](https://github.com/CherryHQ/cherry-studio) |
| CC Switch | 面向 Claude Code、Codex、OpenCode、openclaw 与 Gemini CLI 的跨平台桌面一体化助手。 | [GitHub](https://github.com/farion1231/cc-switch) |
| Kilo Code | Kilo 是一体化的 Agentic Engineering 平台。 | [官网](https://kilocode.ai/) / [GitHub](https://github.com/Kilo-Org/kilocode) |
| Roo Code | Roo Code 让一整支 AI 开发团队直接驻留在你的代码编辑器里。 | [官网](https://roocode.com/) / [GitHub](https://github.com/RooCodeInc/Roo-Code) |
| CLIProxyAPI | 将 Gemini CLI、Antigravity、ChatGPT Codex、Claude Code、Qwen Code、iFlow 封装为兼容 OpenAI / Gemini / Claude / Codex 的 API 服务。 | [文档](https://help.router-for.me/) / [GitHub](https://github.com/router-for-me/CLIProxyAPI) |
| Claude Code Router | 以 Claude Code 作为编码基础设施，让你在持续获得 Anthropic 更新的同时，自行决定如何与模型交互。 | [官网](https://musistudio.github.io/claude-code-router/) / [GitHub](https://github.com/musistudio/claude-code-router) |

## Kilo Code / Roo Code 导出

### Kilo Code 7.x

选择 Kilo Code 7.x 后，每个账号密钥或 API 凭据会导出为一个名称易读的 `provider`。每个 `provider` 都包含从对应接口发现并规范化的全部模型 ID，以及为该 `provider` 手动输入并保留的模型 ID。无论模型 ID 来自接口还是手动输入，被包含在导出中都不代表 All API Hub 验证了该模型适用于所有工作流。请先选择默认 `model`；导出多个 `provider` 时，还需选择默认 `provider`。

你可以按需要选择两种使用方式：

- **下载设置文件**：点击“下载 Kilo 7.x 设置”，再到 Kilo Code 的设置 → About Kilo Code → Import 中选择下载的 `kilo-settings.json`，确认内容后保存。下载文件是可直接走当前 Kilo Code 导入流程的设置文件。
- **复制配置**：点击“复制 provider 配置”会得到顶层 `{ provider, model }` 片段。请把这两个字段合并到现有设置 JSON 的同名顶层字段；这个片段本身不是完整的导入文件。

Kilo Code 当前的设置导入大小上限为 1 MiB。文件超出限制时，单个 API 凭据导出需改用复制配置并手动合并；账号密钥批量导出可减少选中的 `provider`，或改用复制配置并手动合并。

::: tip 导入后 API 密钥字段可能为空
导入包含内联 API 密钥的设置后，Kilo Code 的 `provider` 编辑页可能仍将 API 密钥字段显示为空。这是 Kilo Code 当前的界面限制，不表示导出失败：导入的内联密钥与编辑器认证状态分开存储，运行时仍可使用该密钥。
:::

### 旧版 Roo Code / Kilo Code 5.x

旧版格式每个配置只导出一个模型。点击“复制旧版 apiConfigs”后，请把复制内容合并到设置中的 `providerProfiles.apiConfigs`；如需完整设置文件，则下载 `kilo-code-settings.json`，再使用对应版本的设置导入功能。

## 自建后台 / 管理面板

如果你自己也搭了 AI 中转或聚合后台，All API Hub 还可以把当前站点直接导入到你选中的后台目标里。

| 产品 | 官方描述 | 官方链接 |
|------|----------|----------|
| New API | 统一的 AI 模型聚合与分发中心。 | [官网](https://www.newapi.ai/) / [GitHub](https://github.com/QuantumNous/new-api) |
| DoneHub | 本项目是基于 one-hub 二次开发而来的。 | [GitHub](https://github.com/deanxv/done-hub) |
| Veloera | 本项目已停止维护。 | [GitHub](https://github.com/Veloera/Veloera) |
| Octopus | 面向个人的 LLM API 聚合服务。 | [GitHub](https://github.com/bestruirui/octopus) |
| AxonHub | 开源 AI Gateway，可通过任意 SDK 调用 100+ LLM，内置故障切换、负载均衡、成本控制与全链路追踪。 | [官网](https://axonhub.onrender.com/) / [GitHub](https://github.com/looplj/axonhub) |
| Claude Code Hub | 面向团队的多供应商 AI API 代理与运营平台，统一接入 Claude、OpenAI Compatible、Codex 与 Gemini，并支持弹性调度、监控与价格管理。 | [GitHub](https://github.com/ding113/claude-code-hub) |

## 相关文档

- [支持的站点列表](./supported-sites.md)
- [快速导出站点配置](./quick-export.md)
- [CLIProxyAPI 集成](./cliproxyapi-integration.md)
- [自建站点管理](./self-hosted-site-management.md)

