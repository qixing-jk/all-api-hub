# 快速导出站点配置

<<<<<<< HEAD
> 把已录入的中转站账号或「API 凭证」导出到 CherryStudio、CC Switch、CLIProxyAPI、Claude Code Router、Kilo Code / Roo Code 等工具，或导入到你自建的 New API、DoneHub、Veloera、Octopus、AxonHub 后台，省去重复填写 Base URL、密钥与模型列表的麻烦。
=======
> 将已录入的聚合中转站账号，一键同步到 CherryStudio、CC Switch、New API、Claude Code Hub 等下游系统，避免重复输入 Base URL、密钥与模型列表。
>>>>>>> main

## 支持目标

### 常用客户端与 CLI 工具

| 目标 | 方式 | 备注 |
|------|------|------|
<<<<<<< HEAD
| CherryStudio | 通过本地协议唤起客户端，自动填充 API 信息 | 需启动 CherryStudio 桌面端并授权浏览器唤起 `cherrystudio://` 协议 |
| CC Switch | 通过 `ccswitch://v1/import` 唤起，内置专用字段映射 | 可选择上游应用：`Claude` / `Codex` / `Gemini` / `OpenCode` / `OpenClaw`；`Codex` 会默认补全 `/v1` 接口地址 |
| CLIProxyAPI | 调用 CLIProxyAPI 管理接口创建/更新 Provider | 需在「设置 → CLIProxyAPI 设置」填写管理地址与管理密钥；支持连接检测与 Provider 类型选择 |
| Claude Code Router | 调用 Router 接口创建/更新 Provider | 需在「设置 → Claude Code Router 设置」填写 Base URL 与管理 API Key |
| Kilo Code / Roo Code | 生成 `apiConfigs` 片段或下载 `settings` JSON 供导入 | 导入为增量添加，不会清空你已有的 provider；导出时需为每个密钥选择上游模型 ID |
=======
| CherryStudio | 通过本地协议唤起客户端，自动填充 API 信息 | 需启动 CherryStudio 桌面端并授权 |
| CC Switch | 以 JSON/剪贴板格式输出，内置专用字段映射 | 需在 CC Switch 内使用导入功能粘贴内容 |
| 自建托管站点（New API / DoneHub / Veloera / Octopus / AxonHub / Claude Code Hub） | 调用目标后台管理接口，自动创建或更新 Channel / Provider | 需先在扩展中完成对应后台配置 |
>>>>>>> main

### 自建后台/管理面板

<<<<<<< HEAD
如果你自己也搭了 AI 中转或聚合后台，All API Hub 还可以把当前站点直接导入到你选中的后台目标里，作为「渠道」管理。

| 目标 | 说明 | 相关文档 |
|------|------|----------|
| New API | 调用 `/api/channel`，自动创建/更新渠道并关联模型 | [New API 渠道管理](./new-api-channel-management.md) |
| DoneHub | 同样走 `/api/channel` 渠道接口（基于 one-hub 二次开发） | [New API 渠道管理](./new-api-channel-management.md) |
| Veloera | 渠道管理；当前不支持基于 `Base URL` 的渠道定位，相关入口会自动隐藏 | [New API 渠道管理](./new-api-channel-management.md) |
| Octopus | 连接 Octopus 后台并把账号 API 密钥导入为渠道 | [Octopus 渠道管理](./octopus-channel-management.md) |
| AxonHub | 通过 GraphQL admin 接口联动 AxonHub 后台 | — |

::: tip 自建后台需先配置
导入到自建后台前，需在「设置 → 自建站点管理」中选中目标托管站点类型，并填写「基础 URL / 用户 ID / 管理员凭据」等信息。若配置不完整，渠道对话框会提示缺少配置并提供跳转入口。
:::

## 导出前的准备

1. **确认可导出的内容**：
   - 从「密钥管理」导出：先完成账号识别，确保密钥列表中有可导出的 API。
   - 从「API 凭证」导出：即使没有站点账号，只要有 `Base URL` + `API Key` 也能直接导出。
2. **客户端类目标的提前准备**：
   - CherryStudio / CC Switch：需保持对应桌面端或浏览器扩展可用。
   - CLIProxyAPI：在「设置 → CLIProxyAPI 设置」填写管理地址、管理密钥；保存后可执行「连接检测」。
   - Claude Code Router：在「设置 → Claude Code Router 设置」填写 Router Base URL 与管理 API Key。
3. **模型列表**：若需导出带模型白名单的渠道，可在「New API 模型同步」中预先筛选模型；导出 Kilo Code / Roo Code 时也需为每个密钥选择上游模型 ID。

## 操作步骤

1. 打开插件 → **密钥管理**（或 **API 凭证**），在站点/凭证卡片中点击 **「导出」**。
2. 选择目标类型：`CherryStudio` / `CC Switch` / `CLIProxyAPI` / `Claude Code Router` / `Kilo Code`，或导入到自建后台。
3. 根据目标完成操作：
   - **CherryStudio**：浏览器会提示是否打开桌面客户端，确认后自动完成填充。
   - **CC Switch**：选择上游应用并确认后，浏览器唤起 CC Switch 导入；`OpenCode` / `OpenClaw` 导入后仍需在 CC Switch 内调整 API 格式。
   - **CLIProxyAPI**：保存管理地址后可执行「连接检测」，确认连通后再导入 Provider。
   - **Claude Code Router**：在 Router 中自动创建/更新对应 Provider。
   - **Kilo Code / Roo Code**：复制 `apiConfigs` 片段粘贴，或下载 `settings.json` 导入。
   - **自建后台**：后台调用管理员接口，若检测到相同 Base URL，会提示更新而非重复创建。
=======
1. **站点同步**：先在插件中完成账号识别，确保密钥列表中存在可导出的 API。
2. **目标凭据**：
   - CherryStudio / CC Switch：无需额外配置，但需保持应用运行。
   - 自建托管站点：在「基础设置 → 自建站点管理」中选择目标类型并完成配置。
3. **模型列表**：若需白名单导出，可在「New API 模型同步」中预先筛选模型。

## 操作步骤

1. 打开插件 → **密钥管理**，在任意站点卡片中点击对应导出按钮；如需一次处理多个密钥，可先勾选密钥列表中的项目。
2. 选择目标平台：`CherryStudio` / `CC Switch` / `当前自建站点`。已勾选多个密钥时，可使用 **“批量导入到当前自管理站点”** 进入预览。
3. 根据提示完成授权：
   - CherryStudio：浏览器会提示是否打开桌面客户端，确认后自动完成。
   - CC Switch：生成 JSON 并复制到剪贴板，切换到 CC Switch 粘贴即可。
   - 自建托管站点：后台调用对应管理接口，将当前站点配置导入为 Provider / Channel。批量导入时会先展示每个密钥的目标渠道预览，并默认跳过已精确存在的渠道。
>>>>>>> main
4. 在目标系统中确认渠道/供应商是否出现，并测试调用。

## 导出内容

| 字段 | 说明 |
|------|------|
| 站点名称 | 自动取自站点/账号备注，可在导出前修改 |
| Base URL | 使用账号的 `base_url`，确保包含协议前缀 |
| API Key | 取自密钥列表，若站点支持多密钥会逐个列出 |
| 模型列表 | 来自站点能力探测或 New API 模型同步结果 |
<<<<<<< HEAD
| 充值比例 | 用于 CherryStudio / CC Switch 的折算展示 |
| 分组 / 优先级 | 针对 New API，默认设置为 `default` 组与优先级 0，可在导出面板手动调整 |
| 备注（Token Name） | 导出时会保留 token 备注，方便在多个工具之间迁移与区分 |
=======
| 充值比例 | 用于 CherryStudio/CC Switch 的折算展示 |
| 分组/优先级 | 针对自建托管站点，可在导出面板中按目标后台能力调整 |
>>>>>>> main

## 常见问题

| 问题 | 处理方式 |
|------|----------|
<<<<<<< HEAD
| 自建后台提示 401/403 | 确认管理员 Token 未过期，并已在「自建站点管理」重新保存配置；必要时参考 [Cloudflare 过盾助手](./cloudflare-helper.md)。 |
=======
| 自建托管站点提示 401/403 | 确认后台凭据未过期，并已在插件中重新保存配置；必要时参考 [Cloudflare 过盾助手](./cloudflare-helper.md)。 |
>>>>>>> main
| CherryStudio 无响应 | 检查是否已安装桌面端并允许浏览器唤起 `cherrystudio://` 协议。 |
| CC Switch 导入失败 | 确认 CC Switch 已更新到支持 `ccswitch://v1/import` 的版本；`OpenCode` / `OpenClaw` 若提示 API 格式不支持外部导入，需在 CC Switch 内手动调整。 |
| CLIProxyAPI 连接失败 | 复核管理地址是否已规范化（可参考 [CLIProxyAPI 集成](./cliproxyapi-integration.md)），并重新执行连接检测。 |
| Claude Code Router 提示缺少配置 | 前往「设置 → Claude Code Router 设置」补全 Base URL 与管理 API Key。 |
| Kilo Code / Roo Code 模型列表为空 | 站点尚未返回模型数据，可先在插件内刷新模型列表或执行 New API 模型同步；导出时必须为每个密钥选择上游模型 ID。 |
| 自建后台缺配置提示 | 在「设置 → 自建站点管理」补齐目标后台的基础 URL 与管理员凭据，提示入口可一键跳转。 |

## 相关文档

<<<<<<< HEAD
- [New API 渠道管理](./new-api-channel-management.md)
- [New API 模型列表同步](./new-api-model-sync.md)
- [Octopus 渠道管理](./octopus-channel-management.md)
=======
- [自建站点管理](./self-hosted-site-management.md)
- [自建站点模型同步](./managed-site-model-sync.md)
- [Cloudflare 过盾助手](./cloudflare-helper.md)
>>>>>>> main
- [CLIProxyAPI 集成](./cliproxyapi-integration.md)
- [Cloudflare 过盾助手](./cloudflare-helper.md)
- [API 凭证档案](./api-credential-profiles.md)
- [支持的导出工具列表](./supported-export-tools.md)
