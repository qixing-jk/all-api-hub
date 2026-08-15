# 支持的导出工具列表

> 如果你已经在下面这些客户端、CLI 工具或自建后台里使用 API，All API Hub 可以帮你更快把站点配置带过去，少掉重复填写 `Base URL`、`API Key` 和模型名的步骤。

## 聊天客户端

| 产品 | 官方描述 | 官方链接 |
|------|----------|----------|
| Cherry Studio | AI 生产力工作室，提供智能对话、自主代理和 300+ 助手，统一接入前沿大模型。 | [官网](https://www.cherry-ai.com/) / [GitHub](https://github.com/CherryHQ/cherry-studio) |
| Kelivo | 支持移动端与桌面端的 Flutter 大模型聊天客户端。 | [GitHub](https://github.com/Chevey339/kelivo) |

## 编程 Agents

| 产品 | 官方描述 | 官方链接 |
|------|----------|----------|
| CC Switch | 面向 Claude Code、Codex、Gemini CLI、Grok CLI、Hermes、OpenCode 与 OpenClaw 的跨平台桌面一体化助手。 | [GitHub](https://github.com/farion1231/cc-switch) |
| Kilo Code | Kilo 是一体化的 Agentic Engineering 平台。 | [官网](https://kilocode.ai/) / [GitHub](https://github.com/Kilo-Org/kilocode) |
| Roo Code | Roo Code 让一整支 AI 开发团队直接驻留在你的代码编辑器里。 | [官网](https://roocode.com/) / [GitHub](https://github.com/RooCodeInc/Roo-Code) |
| Cursor++ | 通过自备 API 密钥在 Cursor 中使用 Anthropic、OpenAI 与 Gemini 等模型。 | [官网](https://ccursor.cometix.dev/) |

## 网关与路由工具

| 产品 | 官方描述 | 官方链接 |
|------|----------|----------|
| CLIProxyAPI | 将 Gemini CLI、Antigravity、ChatGPT Codex、Claude Code、Qwen Code、iFlow 封装为兼容 OpenAI / Gemini / Claude / Codex 的 API 服务。 | [文档](https://help.router-for.me/) / [GitHub](https://github.com/router-for-me/CLIProxyAPI) |
| Claude Code Router | 以 Claude Code 作为编码基础设施，让你在持续获得 Anthropic 更新的同时，自行决定如何与模型交互。 | [官网](https://musistudio.github.io/claude-code-router/) / [GitHub](https://github.com/musistudio/claude-code-router) |

## Kelivo 移动端导出

在账号密钥或 API 凭据的操作区选择“导出到 Kelivo 移动端”。弹窗会预填协议、提供商名称、API 密钥和 Base URL；复制前可以检查并修改这些字段。然后在 Kelivo 移动端的提供商管理中选择导入，扫描弹窗中的二维码，或把复制的移动端导入码粘贴到文本框。账号密钥本身没有固定协议，因此默认按 OpenAI Compatible 预填，也可以改为 Anthropic 或 Google。

Kelivo PC 端目前没有提供商导入入口，无法使用二维码或导入码。需要在 PC 端使用时，请参照弹窗中显示的协议、提供商名称、API 密钥和 Base URL 手动新增提供商。

导入码只包含提供商名称、API 密钥、提供商类型，以及适用时的 Base URL。它不包含模型列表、自定义请求头或其他 All API Hub 配置。OpenAI Compatible 和 Anthropic 协议会按弹窗中显示的 Base URL 原样导出。Google 提供商只支持官方 API 地址，因此选择 Google 后会固定该地址；切回其他协议时，先前填写的 Base URL 仍会保留。

Kelivo 本身也支持 OpenAI Responses，但当前 `ai-provider:v1` 导入码没有保存 Responses 开关；`openai` 类型导入后固定为 OpenAI Compatible。若要使用 Responses，请先完成导入，再到 Kelivo 的提供商设置中开启。

::: warning 请保护导入内容
二维码和 Kelivo 移动端导入码都包含明文 API 密钥。请勿截图分享，也不要粘贴到公开聊天、Issue、日志或版本库中。
:::

## Cursor++ 导出

在账号密钥或 API 凭据的操作区选择“导出 Cursor++ 提供商配置”，All API Hub 会读取 OpenAI 兼容模型列表，并生成 Cursor++ 0.0.13 使用的 `provider` 对象。其中包含稳定的提供商 ID、名称、`baseUrl`、API 密钥认证信息，以及带有 `defaultOn: true` 的模型列表。

导出前可以搜索、移除已发现的模型，也可以输入或粘贴多个模型 ID。默认使用账号现有的 OpenAI 兼容地址；如果所选原生协议使用不同路径，可以直接调整提供商 Base URL。

Cursor++ 当前支持以下协议类型：

- **OpenAI Chat Completions**（默认）：导出 `type: "openai-chat"`。
- **OpenAI Responses**：导出 `type: "openai-responses"`。
- **Anthropic Messages**：导出 `type: "anthropic"`。
- **Gemini**：导出 `type: "gemini"`。

协议选择只改变 Cursor++ 调用提供商的方式。All API Hub 的模型发现仍使用账号现有的 OpenAI 兼容模型接口，不会因为切换协议而自动验证对应的原生协议端点。

复制后，在 Cursor++ 中打开 **Edit Providers Config**，把这个对象加入 `~/.ccursor/providers.json` 的 `providers` 数组。复制内容只是单个 `provider`，不会覆盖或替代完整配置文件。模型发现失败或返回空列表时，可以手动添加一个或多个模型 ID 后继续复制。

::: warning 请保护复制内容
导出的 JSON 包含明文 API 密钥。请勿粘贴到公开聊天、Issue、日志或版本库中。
:::

## Kilo Code / Roo Code 导出

### Kilo Code 7.x

选择 Kilo Code 7.x 后，每个账号密钥或 API 凭据会导出为一个名称易读的 `provider`。每个 `provider` 都包含从对应接口发现并规范化的全部模型 ID，以及为该 `provider` 手动输入并保留的模型 ID。无论模型 ID 来自接口还是手动输入，被包含在导出中都不代表 All API Hub 验证了该模型适用于所有工作流。请先选择默认 `model`；导出多个 `provider` 时，还需选择默认 `provider`。

每个 `provider` 可选择以下 API 协议：

- **OpenAI Compatible**（默认）：导出 `@ai-sdk/openai-compatible`。
- **OpenAI Responses**：导出 `@ai-sdk/openai`。
- **Anthropic Messages**：导出 `@ai-sdk/anthropic`。

协议选择只改变 Kilo Code 的 AI SDK provider 包。All API Hub 仍沿用现有模型发现流程并导出完整加载结果，不会因为选择 Anthropic Messages 而跳过模型发现，也不会额外改写模型 ID 或补充未经验证的模型元数据。

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
| Sub2API | Sub2API-CRS2 一站式开源中转服务，让 Claude、OpenAI、Gemini、Antigravity 订阅统一接入。 | [GitHub](https://github.com/Wei-Shaw/sub2api) |
| AxonHub | 开源 AI Gateway，可通过任意 SDK 调用 100+ LLM，内置故障切换、负载均衡、成本控制与全链路追踪。 | [官网](https://axonhub.onrender.com/) / [GitHub](https://github.com/looplj/axonhub) |
| Claude Code Hub | 面向团队的多供应商 AI API 代理与运营平台，统一接入 Claude、OpenAI Compatible、Codex 与 Gemini，并支持弹性调度、监控与价格管理。 | [GitHub](https://github.com/ding113/claude-code-hub) |
| Octopus | 面向个人的 LLM API 聚合服务。 | [GitHub](https://github.com/bestruirui/octopus) |
| Veloera | 本项目已停止维护。 | [GitHub](https://github.com/Veloera/Veloera) |
| DoneHub | 本项目是基于 one-hub 二次开发而来的。 | [GitHub](https://github.com/deanxv/done-hub) |

## 相关文档

- [支持的站点列表](./supported-sites.md)
- [快速导出站点配置](./quick-export.md)
- [CLIProxyAPI 集成](./cliproxyapi-integration.md)
- [自建站点管理](./self-hosted-site-management.md)

