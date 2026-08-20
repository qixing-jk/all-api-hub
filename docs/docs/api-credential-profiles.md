# API 凭据库

> 适合“没有站点账号、只有 `Base URL + API Key`”的场景。你可以把常用 API Key 集中保存起来，用于快速复制、验证接口、查看模型与余额/用量，而不必先创建完整站点账号。

## 适合什么场景

- 你手里只有第三方平台给出的 `Base URL` 和 `API Key`，但没有对应站点控制台账号。
- 你想把常用接口配置集中保存，避免在多个客户端、CLI 工具之间来回复制。
- 你有多把 Key，想按“工作、测试、备用”等用途分开保存，之后更容易找到。
- 你需要先验证某个 Key 是否可用、是否兼容 CLI，再决定是否导入到下游工具。
- 你希望把同一套接口配置直接用于模型查看、接口验证或导出流程。

这些凭据保存在扩展本地，是独立的本地档案，不等同于站点账号，也不是服务商那边的 API Key 资源本身。删除本地档案不会自动撤销服务商上的真实 Key；需要停用某把 Key 时，请到服务商控制台处理。

::: warning API Key 属于敏感信息
API Key 会以完整值保存在扩展的本地 Storage。列表里的遮罩只保护界面显示；显示、编辑、复制、验证、备份和部分导出仍会使用完整 Key。请不要把 Key 或导出内容发到公开聊天、Issue 或代码仓库。
:::

## 功能概览

- **凭据库管理**：保存名称、`Base URL`、API Key、标签和备注，不依赖站点账号。
- **搜索与筛选**：支持按名称、`Base URL`、标签、备注以及 API 类型筛选。
- **健康与用量概览**：可查看余额、今日用量、今日请求数、可用模型数量、最近刷新时间和健康状态（具体取决于接口是否提供相应数据）。
- **接口验证**：支持验证 API 是否可用，也支持单独验证 CLI 兼容性。
- **模型联动**：可直接在模型列表中打开当前凭证，查看模型目录和验证结果。
- **快捷导出**：优先提供当前自建托管站点的直达入口；其他目标按聊天客户端、编程 Agents、网关与路由工具分组，支持 Cherry Studio、Kelivo、CC Switch、Kilo Code / Roo Code、Cursor++、CLIProxyAPI 和 Claude Code Router。

![API 凭据库列表](./static/image/api-credential-profile-list.png)

## 进入方式

1. 打开插件设置页。
2. 在左侧菜单进入 **`API 凭据库`**。
3. 点击右上角 **`添加 API 凭据`**。

扩展弹窗里的 **`API Key`** 入口也可以快速查看和操作凭据。如果你已经在 `密钥管理` 中拿到了某个上游站点的 Key，也可以先在那里验证或整理，再把它保存到 `API 凭据库` 中，后续使用会更方便。

::: tip 寻找优质 API 接口？
如果你需要稳定且支持 CLI 的 API 接口来填充你的凭据库，可以尝试我们的合作伙伴：

- [七牛云AI](https://s.qiniu.com/qE3eai)：企业级大模型 MaaS 平台，一站式调用全球 150+ 主流模型，企业用户可免费领 1200 万 Token。
- [FennoAI](https://api.fenno.ai/s/DCGC)：稳定、高效的 Codex 中转服务商，兼容 OpenAI 及 Anthropic 协议，可接入主流编程工具并支撑千亿 Token/日的企业级调用；All API Hub 用户仅需 1.99 美元即可获得价值 50 美元的 Coding Plan 额度，邀请好友购买最高可获得 20% 返佣。[使用教程](./service-guides/fenno.md)
- [PackyCode](https://www.packyapi.com/register?aff=all-api-hub)：注册并充值时填写 `all-api-hub` 优惠码可享 9 折。[使用教程](./sponsor-guides/packycode.md)
- [星辰AI](https://ai.centos.hk)：充值比例 1:1，可开发票；Claude 低至 4 折。[使用教程](./sponsor-guides/xingchen.md)
- [玄枢API](https://www.xuanshuapi.com/register?aff=ALL-API-HUB&promo=ALL-API-HUB)：面向企业、技术团队和个人开发者的新一代 AI 模型路由网关，提供企业级稳定性的全球顶级模型（Claude, GPT, Grok等）一站式 API 接入。模型一折到六折，通过此链接注册，充值额外加赠，首充送更多！企业支持对公转账和开票。[使用教程](./service-guides/xuanshuapi.md)
- [Atlas Cloud](https://www.atlascloud.ai/console/coding-plan?utm_source=github&utm_medium=link&utm_campaign=all-api-hub)：一个 AI API 访问 300+ 精选视频、图像和 LLM 模型，新 Coding Plan 提供更高性价比的 API 访问。[使用教程](./service-guides/atlascloud.md)
- [AICodeMirror](https://www.aicodemirror.ai/register?invitecode=7IQNR8)：提供 Claude Code / Codex / Gemini CLI 官方高稳定中转服务，通过此链接注册可享首充 8 折，企业客户最高可享 7.5 折。
- [随想AI中转站](https://sui-xiang.com/)：提供 Claude、Codex、Gemini 等 API 中继服务，按量付费，支持每日签到测试额度、多线路冗余和自动故障切换。[使用教程](./service-guides/suixiang.md)
- [Infistar.ai](https://infistar.ai/register?aff=ALLAPIHUB&ref_source=link)：在售模型均经真实调用验真，通过超 10000 条官方 API 与官方号池供应链路负载均衡，覆盖文本、视频、图片、嵌入、重排等全模态能力，价格与用量透明，模型低至官方价的 10%。[使用教程](./service-guides/infistar.md)
- [火山引擎方舟 Coding-Plan](https://dis.chatdesks.cn/chatdesk/hsyqallapihub.html)：Lite 套餐 9.9 元/月起，并有邀请返利及首单优惠。
:::

## 如何添加凭证

### 基础字段

| 字段 | 说明 |
|------|------|
| 名称 | 便于区分不同用途，例如“公司中转站只读 Key” |
| Base URL | 接口基础地址，保存时会自动规范化 |
| 密钥 | 对应的 API Key；输入框默认遮罩，可临时显示 |
| 标签 | 可选；和账号、书签共用全局标签体系 |
| 备注 | 可记录来源、用途、模型限制等信息 |
| 到期日期 | 可选；只是你填写的提醒日期，不代表服务商已确认 Key 失效 |

### API 类型

当前支持按 API 类型分类和验证，常见类型包括：

- `OpenAI Compatible`
- `OpenAI`
- `Anthropic`
- `Google`

![添加 API 凭据](./static/image/api-credential-profile-create.png)

如果你不确定选哪种，可以先按服务商文档选择；没有特别说明时，通常先尝试 `OpenAI Compatible`。如果你临时用另一种 API 类型做验证，界面会明确提示这只是本次验证的临时覆盖，不会改写已保存的凭证类型。

## 余额与用量查询

每张凭证卡片都可以显示余额与用量概览，常见指标包括：

- 余额
- 今日用量
- 今日请求数
- 今日 Tokens
- 可用模型数量
- 最近刷新时间
- 健康状态与最近一次错误

这些数据来自服务商提供的查询接口；能不能显示、能显示哪些，取决于服务商是否提供。查不到数据不一定代表 Key 失效，可以试试换一种查询方式。

### 查询方式

你可以为每个凭证选择余额/用量的查询方式：

- **自动探测**：按内置顺序尝试兼容方式。
- **NewAPI Token**：适合兼容 New API 的 token 用量查询。
- **OpenAI Billing**：适合标准 OpenAI Billing 查询。
- **Sub2API**：适合 Sub2API 风格接口。
- **自定义只读查询**：适合站点有自定义只读查询接口。
- `禁用`：不查询余额与用量，只保留凭证本身。

“自动探测”只是按顺序尝试几种查询方式，找到能用的就用。它不是接口请求的故障切换或负载均衡，也不会替你切换 Key 或切换模型请求。

### 自定义只读查询

如果上面几种方式都查不到数据，而你了解站点自己的查询接口，可以选 **`自定义只读查询`**：

1. 选择 **`自定义只读查询`**。
2. 填写查询地址（例如服务商文档里的用量地址）。
3. 按界面提示，指定余额、用量等数据对应的字段位置，插件会帮你解析并展示。

## 常用操作

### 1. 验证接口

点击卡片上的 **`验证接口`**，可以确认：

- 当前 Key 是否还能调用
- 模型列表是否可获取
- 返回是否符合预期 API 类型

适合在更换 Key、切换网络或排查“客户端连不上，但站点似乎还活着”的情况时使用。

验证结果只代表这一次探测的情况，不代表 Key 永久有效或永久失效；换网络、换 Key 或发现异常后，可以随时再验证一次。

### 2. 验证 CLI 兼容性

点击 **`验证 CLI 兼容性`**，可单独测试：

- 当前接口是否适合 CLI 工具
- 模型 ID 是否可用于 CLI 场景
- 是否存在“网页能调，CLI 不能调”的兼容性差异

这项检查不会真正启动 Claude Code、Codex、Gemini CLI 等程序，而是按这些 CLI 常用的协议和工具调用方式做一次模拟检查，帮你提前判断兼容性。

### 3. 在模型管理中打开

点击 **`在模型管理中打开`** 后，模型列表页会直接把当前 API 凭据当作数据源。这样你不需要先创建站点账号，也能查看模型目录、验证模型可用性。

这里只是把当前凭据当作数据源查看模型目录，不等于完整的 Provider 模型管理，也不保证列出的每个模型都支持所有能力。

### 4. 快捷导出

支持从单个凭证直接导出到：

- **自建托管站点**：操作区会直接显示当前托管站点图标，点击后进入预填的创建流程；检查并提交后才会写入目标站点。不同托管站点的字段和失败结果可能不同，写入失败时不会自动回滚。
- **聊天客户端**：Cherry Studio、Kelivo
- **编程 Agents**：CC Switch、Kilo Code / Roo Code、Cursor++
- **网关与路由工具**：CLIProxyAPI、Claude Code Router

除自建托管站点外，其余目标统一收在 **`导出`** 菜单中。不同工具的传递方式不一样：有的用 deeplink，有的用剪贴板或配置内容，CLIProxyAPI 和 Claude Code Router 还会调用远程管理 API，所以它们不是统一的“安全配置文件导出”。

导出的内容可能包含完整 API Key。部分 deeplink 或导入码会用到 Base64，但 Base64 只是编码，不是加密，请注意保护。

每种工具的导入方式和字段略有不同，请在导出弹窗里按提示操作。Kilo Code、Cursor++、Kelivo 等各工具的具体说明见[支持的导出工具与集成目标](./supported-export-tools.md)和[快速导出站点配置](./quick-export.md)。

如果你只是想把手头几把 Key 统一保存、先验证再导出，用 `API 凭据库` 会更直接，不需要先创建完整站点账号。

![导出菜单](./static/image/api-credential-profile-export-menu.png)

## 使用建议

- **命名带用途**：例如“OpenAI 只读测试 Key”“公司中转站 Claude 专用 Key”，后期筛选会更清晰。
- **把标签当分组**：例如 `工作`、`个人`、`生产`、`测试`、`临时`。
- **先验证再导出**：这样能避免把失效 Key 批量导入到多个客户端。
- **备注写限制条件**：例如“仅支持 Anthropic”“余额展示不准”“仅内网可用”。
- **删除时记住**：删除本地档案不会撤销服务商上的真实 Key。

## 备份与安全提示

API 凭据库会参与普通备份、恢复和 WebDAV 选择性同步。完整备份可能包含完整 API Key 和自定义查询使用的 Bearer Token，请像保管密码一样保管备份文件。

WebDAV 加密需要你主动开启并设置、保管加密密码。它不代表扩展本地 Storage、普通 JSON 备份、剪贴板或外部工具导出内容默认加密。

复制 API Key 会把完整密钥放进系统剪贴板；导出到外部工具时，密钥可能进入 deeplink、剪贴板、配置内容或远程管理 API。不要把这些内容发到公开聊天、Issue 或代码仓库。

## 常见问题

| 问题 | 说明 |
|------|------|
| 只保存了凭证，为什么没有余额数据？ | 当前查询方式可能不适配该站点，或站点没有提供对应只读接口；没有余额数据不一定代表 Key 失效，可尝试切换查询方式或使用自定义只读查询。 |
| 模型相关验证为什么要求模型 ID？ | 某些 CLI 兼容性检查和模型调用验证必须指定模型，界面会尽量自动获取建议模型，也可以手动填写。 |
| 可以替代账号管理吗？ | 不能完全替代。`API 凭据库` 更适合保存和使用独立 API Key，并用于接口验证、模型查看和导出；账号管理仍负责站点识别、余额刷新、签到、用量同步等账号级能力。 |
| API 凭据库会参与备份吗？ | 会。它属于共享数据的一部分，可随数据导入导出和 WebDAV 选择性同步一起迁移。导入 Profile 数据时可能会看到 Merge、Replace 或 Skip 选项。 |
| 验证通过后能保证所有工具都能用吗？ | 不能。验证只代表一次 API 探测，目标工具可能使用不同的协议、模型或配置，仍需在目标工具中再测试。 |
| 删除 Profile 会撤销远端 API Key 吗？ | 不会。删除只移除本地记录，请到服务商控制台单独撤销远端 Key。 |

## 相关文档

- [快速导出站点配置](./quick-export.md)
- [支持的导出工具与集成目标](./supported-export-tools.md)
- [CLIProxyAPI 集成](./cliproxyapi-integration.md)
- [数据导入导出](./data-management.md)
- [WebDAV 备份与自动同步](./webdav-sync.md)
