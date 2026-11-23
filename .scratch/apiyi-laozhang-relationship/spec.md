# Shell API 兼容账号接入与协议依据

以下公开研究记录来自 2026-11-17；实现与受控验收完成于 2026-11-23，行为保持的重构验收完成于 2026-11-24。研究来源未在分支整理时重新抓取；历史研究结论与当前产品合同分别说明。

## 当前实现与验收入口

通用 `shell-api` 与既有 `apiyi`、`laozhang` 归入独立 `ShellApiFamily`。已知站点身份优先；其他站点通过成功状态响应中自有的布尔 `ShellApiLogOptimizerEnabled` 字段识别，值为 false 也有效，与其他明确协议冲突时保持 unknown。下面的四字段脚本保留为研究候选方案，生产识别以代码和回归测试为准。

采用类似 NewApiFamily 的积极兼容默认：尝试管理令牌、模型/分组/定价、原生密钥、消费/收入、兑换、邀请与站点通知。金额按已观察到的 500,000 quota/USD 合同解释；该默认不证明每个 Shell 版本都兼容，部署拒绝或响应不兼容时显示错误或不可用。LaoZhang 的原生密钥字段、公告、日志等差异继续独立覆盖，不新增托管站点或通用自动签到协议。

通用类型默认使用 System Token。自动读取已有 token 后，另发不带 Cookie、不跟随重定向的请求验证同一账号；缺少 token 时保留识别资料，引导用户在站点 Profile → System token 完成验证后粘贴，也可明确选择 Cookie。不自动签发或旋转 System Token。普通 Cookie 资料读取丢弃未经验证的 token，余额读取必须匹配保存的账号 ID；共享协议不使不同站点类型的凭证互通。

通用 Shell 今日日志按已知零起始页协议读取，数组短页继续，直到空页才能确认完成；日志失败不阻断余额。历史同步仍要求带有 `items` 和有效 `total` 的分页响应；数组、缺失或无效总数明确失败并保留原聚合、游标与上次成功时间。数组形式的历史同步需要额外设计分页和游标合同，不在本次支持范围内。

统一审阅入口为本地[实现验收报告](artifacts/implementation-acceptance.md)，包含行为对照、可复现命令、最终 UI 截图，以及最新[重构验收](artifacts/scout-refactor-20261124/acceptance.md)的复用范围。受控 Chromium 流程覆盖 Cookie、自动 token、手动 token 的添加、保存、关站点标签后刷新和重新编辑；不能计作真实部署登录证明。真实写操作、通用部署的无 Cookie System Token、完整历史同步以及 Firefox/Safari 仍需相应部署/会话与执行证据。官方演示状态重读返回 521，不能补齐当前登录合同。

协议研究、较保守候选的离线指纹脚本和正式测试保留在 Git；原始公开响应、TDD 失败、已修复问题复现、检查日志和截图保留在忽略的 `artifacts/`，用于审阅及关闭上述证据缺口。具体测试计数、工作树信息和审查过程只保留在本地报告。

### 真实站点验收与复现

`pnpm e2e:cdp:shell` 复用共享 env、准确工作树扩展连接和现有 UI 流程；[运行说明](../../e2e/README.md#shell-hosted-site-cdp-checks)列出变量、范围及命令。凭据留在主检出目录的未跟踪 `.env.local`，不进入报告或提交。

2026-11-23 的[真实 CDP 验收](artifacts/live-cdp-acceptance.md)记录 APIYI 与 LaoZhang 在 Edge 中通过原生登录、身份识别、缺失 System Token 引导、显式 Cookie 导入、保存/余额刷新/编辑回读、模型价格显示、令牌列表与邀请复制反馈；运行创建的本地账号已清理。该结果仅证明记录的 Cookie 路径；令牌创建/编辑/删除、兑换、消费调用、公告内容、完整历史同步及价格数值对齐仍未实测。保留失败与成功证据，并在重跑时使用新的输出目录。

## 技术关系：共同软件来源的证据很强

本次直接读取两站公开控制台及资源，确认了以下事实。这些证据足以支持“同源控制台程序的不同版本”的强推断，但尚不能判定是谁开发、如何授权或是否共同运营。

| 对比项 | 本次结果 | 第一方来源 |
| --- | --- | --- |
| 公开状态接口 | 两站 `data` 均为 149 个字段，字段集合完全相同；其中包括 `ShellApiLogOptimizerEnabled`、`TaskPluginRuntimeEnabled`、`XYHelperDBEnabled`、`SalesReconciliationBetaEnabled` 等较有辨识度的扩展字段。配置值不完全相同。 | [APIYI 状态](https://api.apiyi.com/api/status)、[LaoZhang 状态](https://api2.laozhang.ai/api/status) |
| 当前版本 | APIYI `v33.5.5`；LaoZhang `v33.1.7`。这是本次状态接口自报版本，不代表已核实发布源或版本历史。 | 同上 |
| 自定义加载组件 | 两个 `animated-loader.js` 均为 16,586 字节，SHA-256 完全相同：`f8d13ed3e7654cc1d83adf96b33525ae44bda3f4ab48ebdce6c22376116c4db8`。脚本实现自定义 `AnimatedLoader` 元素，不只是通用 React / Ant Design 依赖。 | [APIYI 脚本](https://api.apiyi.com/animated-loader.js?v=v33.5.5)、[LaoZhang 脚本](https://api2.laozhang.ai/animated-loader.js?v=v33.1.7) |
| 控制台主样式 | 两文件文本相似度为 99.9815%；全部 8 处差异仅是生成的 CSS 模块类名中 `-` 与转义 `+` 的差别。把 LaoZhang 的 `\+` 替换为 `-` 后，整个文件与 APIYI 文件完全相同，样式声明没有差异。 | [APIYI CSS](https://api.apiyi.com/static/css/main.3f5b11f6.css)、[LaoZhang CSS](https://api2.laozhang.ai/static/css/main.966bc8a9.css) |
| 业务脚本 | 主脚本都包含 `USER_STATE`、`X-S-Token`、`groupPro`；两站主脚本 SHA-256 不同，不能说整个前端构建完全一致。 | [APIYI 主脚本](https://api.apiyi.com/static/js/main.37dc27dd.js)、[LaoZhang 主脚本](https://api2.laozhang.ai/static/js/main.c0d5f9ab.js) |

通用依赖或相同服务器软件本身辨识度很低。本判断主要依据自定义加载组件、主样式声明和整组扩展配置字段的共同性。可能的解释包括共同维护或授权使用同一程序、从共同代码源分叉、同一技术供应商；这些解释目前无法相互排除。没有证据证明共同股东、共享账户库、凭证互通、相同上游供应商或未经授权使用代码。

本地证据保留在 `artifacts/`：各控制台 HTML、状态 JSON、JS/CSS 原文（`.body`），请求 URL / SHA-256 元数据（`.meta.json`），`comparison.json` 和 `official-extracts.json`。这些输出仅用于本次调查及后续复核，按该目录的 `.gitignore` 保留在本地；本 Markdown 是保留在 Git 的调查入口。静态资源 URL 带有本次构建哈希，后续部署可能使其失效；重新调查应先读取控制台 HTML 获得当前地址。

## 运营主体与关系声明

公开材料尚不足以确认两家属于同一公司、同一团队，或存在合伙、授权贴牌、共同股东关系。官方披露的运营名称不同；APIYI 自己的不同页面还存在主体名称不一致。名称不同也不能据此证明双方毫无关联。

| 品牌与页面 | 已核实的第一方表述 | 能说明什么 |
| --- | --- | --- |
| [API易官方文档首页](https://docs.apiyi.com/) | “主体运营公司：APIYI, LLC（美国）” | 官方文档自述美国运营主体；不含足以核实股权的资料。 |
| [APIYI 品牌子域名条款](https://cf-index.apiyi.com/terms) | “Welcome to APIYI, an AI API gateway service operated by MrrBase, LLC”；页面标注 “Last updated: August 2, 2026”。第 18 节列 “Legal Entity: MrrBase, LLC” 和 “Jurisdiction: State of Delaware, United States”。 | 此品牌子域名披露 Delaware 公司 MrrBase, LLC，和文档的 APIYI, LLC 不一致。不能擅自认定为更名、母子公司或同一法人。 |
| [同子域名隐私政策](https://cf-index.apiyi.com/privacy) | “The data controller responsible for your personal information is MrrBase, LLC, a Delaware limited liability company”；更新时间同为 2026-08-02。 | 该子域名法律页面的主体自述内部一致。 |
| [老张官方平台信息](https://docs.laozhang.ai/about) | “老张API（laozhang.ai）是新加坡公司 YingTu Technology Pte. Ltd. 自 2025 年起运营的 AI API 网关”；该页面最后核对日期为 2026-10-14。 | 披露新加坡运营主体及运营起点。 |
| [老张官网服务条款](https://www.laozhang.ai/terms) | 第 1 节：“The service is provided by YingTu Technology Pte. Ltd., a company organized in Singapore, under the brand laozhang.ai.”；页面标注 “Last updated: October 31, 2026.” | 官网法律条款与老张文档的运营主体名称一致。 |
| [老张官网隐私政策](https://www.laozhang.ai/privacy) | 第 1 节：“This policy applies to the websites, dashboards, APIs, documentation, billing pages and support channels operated under laozhang.ai by YingTu Technology Pte. Ltd.” | 同样明确运营者为 YingTu；未提及 APIYI。 |

`cf-index.apiyi.com` 是 APIYI 品牌域名下的公开子域名，其条款和联系方式确实可以公开读取；但本次未证明这些是当前 `api.apiyi.com` 控制台实际引用、适用的法律页面，因此不能直接把 MrrBase, LLC 当成已完全核实的唯一现行运营主体。本次也未查询公司注册机关来核实 APIYI, LLC、MrrBase, LLC 或 YingTu 的注册编号、股东、董事及实际控制人。

## 公开联系方式

| 页面 | 公开联系方式 |
| --- | --- |
| [APIYI 品牌子域名 Contact Us](https://cf-index.apiyi.com/contact) | 客服 `support@apiyi.com`，Telegram `@apiyi001`；商务与法律 `mrrbase.com@gmail.com`。页面明示 “MrrBase, LLC operates the APIYI service.” |
| [API易企业服务文档](https://docs.apiyi.com/faq/enterprise-trust) | 企业微信客服及邮箱 `hi@apiyi.com`。 |
| [老张平台信息](https://docs.laozhang.ai/about)及[服务条款](https://www.laozhang.ai/terms) | 邮箱 `hi@laozhang.ai`，Telegram `@laozhang_cn`。 |

邮箱若被 Cloudflare 混淆，以公开页面提供的 `data-cfemail` / `email-protection` 字段解码核对；没有发送邮件或消息。联系方式不同不能证明人员或公司独立。

## 两个品牌被共同提及的材料

APIYI 官方博客的[服务商对比文章](https://help.apiyi.com/nano-banana-api-reliable-providers-google-cloud-pt-explained.html)在“服务商”表中分别列出 “API易 (apiyi.com)” 和 “laozhang.ai”。这只能证明 APIYI 的博客曾将双方列为不同品牌的选项；文章没有在已读取的相关段落中声明共同所有权、合作关系或授权贴牌。文章中的价格、可用性和上游合作宣传没有作为本调查已验证事实。

本次定向搜索包含 `APIYI 老张 laozhang 关系 团队 公司`、`"APIYI" "LaoZhang" relationship`、`"APIYI" "laozhang" "合作"`、`"APIYI" "YingTu"`，再读取官方来源确认。未找到明确的双方关系公告；这是本次检索结果，不是不存在关系的证明。

## 证据边界

- 法律名称、国家和联系方式是第一方页面的自述，本次经 Tavily 提取及公开 HTTP 核对；未独立核查注册登记或实际控制权。
- 相同界面、相同资源或相似接口可以支持共同软件来源的推断，不能单独建立同一运营主体、股东或团队的事实。
- 未获得双方合同、授权声明、代码仓库归属或明确的共享团队公告。是否使用同一商业程序、共同上游，或存在技术外包关系，仍需更直接的证据。
- 留存用途：为后续判断两家的产品及技术关系保留来源和不确定点；抓取输出按本功能目录的本地 `artifacts/` 管理。

## 网关发行来源调查

结合两站前端中带作者名称的标识、官方演示站及上面的自定义资源和接口指纹，**Shell API / `akl7777777` 是高度可信的软件家族来源**；尚未取得能把两站当前 `v33.5.5` / `v33.1.7` 构建直接对应到厂商发行包、提交或授权合同的公开记录。不能把“同一软件家族”进一步写成“同一公司运营”或“模型请求来自同一上游”。

| 第一方出处 | 已核实内容 | 判断及限制 |
| --- | --- | --- |
| [APIYI 当前主脚本](https://api.apiyi.com/static/js/main.37dc27dd.js)、[LaoZhang 当前主脚本](https://api2.laozhang.ai/static/js/main.c0d5f9ab.js) | 两站均含判断 `iss === 'shell_api_admin_akl7777777'` 或 `aud` 包含 `SHELL_API` 后返回 `shell-api` 的代码；并使用 `DASHBOARD_AUTH_MODE` 区分 `shell-api` 与 `new-api`。 | 明确的项目及作者标识，比外观相似更有辨识度。但它位于兼容分支，本次没有读取任何实际用户 JWT，不能单靠该分支断定当前后端使用哪种身份协议。 |
| [官方仓库首页所列演示站](https://demo.shellapi.ltd/)、[演示站公开状态](https://demo.shellapi.ltd/api/status) | 标题及 `system_name` 为 `Shell API`，版本自报 `v6.7.2`；83 个状态字段全部包含在两站现有 149 个字段中，含 `ShellApiLogOptimizerEnabled`、`CustomThemeConfig`、`CustomDarkThemeConfig`、`CustomAvailablePayMethods2`、`DataExportEnabled`。 | 第一方演示站直接提供共享特征的对照，支持软件家族关系；配置集的扩展不证明 v33 是该发行方正式发布的版本。 |
| [演示站加载组件](https://demo.shellapi.ltd/animated-loader.js)、[演示站主脚本](https://demo.shellapi.ltd/static/js/main.367401e8.js) | 演示站同样实现 `AnimatedLoader extends HTMLElement`；加载组件文本相似度约 87.3%，文件为 13,566 字节，和两站的 16,586 字节版本并非逐字节相同。演示主脚本含 `USER_STATE`、`X-S-Token`、`ShellApiLogOptimizerEnabled`、`CustomThemeConfig`，不含两站新增的完整 issuer 标识。 | 这是较旧版本的实现对应关系，不能声称演示站与两站使用完全相同的构建。 |
| [Shell API 官方仓库 README（本次核实的固定提交）](https://github.com/akl7777777/shell-api/blob/9987a0d4d4a44f177872df08b281d90658dc01d3/README.md) | 明示“基于 One API 二次开发，提供全新 UI 与更多高级选项”；部署示例镜像为 `akl7777777/one-api-private:v0.x.y`，包括 `docker login` 步骤；演示链接为 `demo.oneapi.plus`。 | 建立 Shell API 的 One API 衍生来源及该作者的发行渠道。不能据此改写为基于 New API，也没有证明两站取得了何种授权。 |
| [同一 README 的通知及停止出售公告](https://github.com/akl7777777/shell-api/blob/9987a0d4d4a44f177872df08b281d90658dc01d3/README.md#通知) | 专业版暂停出售授权；公告称不再对外出售或增加授权实例，已有客户继续获得功能开发、上游变更合并及文档等维护。另列青春版 `lite.shellapi.ltd`，说明其仅允许 root 用户和一个令牌，其余功能与专业版同步更新。 | 官方历史材料确实存在面向多个客户的实例授权/维护模式，可解释多个站点共享发行版这一可能性；公告未点名 APIYI 或 LaoZhang。停止出售何时生效、2026 年是否仍执行均未找到现行证明。 |
| [官方 GitHub 仓库元数据](https://api.github.com/repos/akl7777777/shell-api)、[最新公开提交](https://github.com/akl7777777/shell-api/commit/9987a0d4d4a44f177872df08b281d90658dc01d3)、[公开 release v1.6.0](https://github.com/akl7777777/shell-api/releases/tag/v1.6.0) | 仓库首页链接 `https://demo.shellapi.ltd/`；本次 `main` 提交日期及 `pushed_at` 均为 2024-11-05；release API 只返回一条 v1.6.0，发布时间 2024-03-02。 | 公开资料陈旧，不能声称当前 v33 系列已在该仓库公开发布。仓库内容有 Go/前端源码，但没有获得与 v33 构建的完整对应关系。 |
| [仓库 LICENSE（固定提交）](https://github.com/akl7777777/shell-api/blob/9987a0d4d4a44f177872df08b281d90658dc01d3/LICENSE) | `MIT License`；版权声明为 `Copyright (c) 2023 JustSong`。 | 这是公开仓库内容的许可文本。不能单凭它判断私有镜像、当前 v33 商业改动的许可或两站是否合法获授权。 |
| [XYHELPER 官方开发者中心](https://www.xyhelper.cn/developer) | 列出 `xyhelper-web`、`chatgpt-api-server`、`chatgpt-mirror-server` 和 `chatgpt-go` 等项目，没有在已读取正文中把两站或 Shell API 声明为自家网关发行。 | 两站共有的 `XYHelperDBEnabled` 仅说明代码里存在这个配置标识，不能证明 XYHELPER 开发整个控制台，也不能证明实际启用了相应模块。 |

补充检索：GitHub 全局代码搜索 `ShellApiLogOptimizerEnabled` 返回的公开结果来自第三方 [NiceApiManager 的识别逻辑](https://github.com/NiceAIGC/NiceApiManager/blob/94832fe528aaf94e49d2be1c1182d53be1c5ff94/app/clients/newapi.py)，将该字段和若干扩展字段识别为 `shellapi`；这是独立项目的兼容判断，不能取代厂商确认。对 `shell_api_admin_akl7777777`、`XYHelperDBEnabled` 的 GitHub 代码搜索本次均未命中，对扩展字段及 Shell API v33 的定向网页检索也未获得能核实当前版本线的第一方发布记录。搜索未命中不能证明源码或发布记录不存在。

官方 README 指向的 `lite.shellapi.ltd` 本次直接 HTTP 返回 521，腾讯特性文档 `https://docs.qq.com/aio/DSWZ3eUhBSVlIa2l6` 的 Tavily 提取失败，未绕过访问限制或登录；因此当前产品说明、实例授权细则及最新版本发行渠道仍存在证据缺口。较旧的 `demo.oneapi.plus` 本次也未成功读取；官方仓库元数据列出的 `demo.shellapi.ltd` 则已直接读取并完成上述对照。官方原文留在 `artifacts/shellapi-official-readme.md`，公开元数据、搜索和提取结果留在 `artifacts/gateway-origin-public-evidence.json`；演示站 HTML、状态 JSON、主脚本、加载组件原文及 `shellapi-live-comparison.json` 同样保留在本地，用于后续复核。


## Shell 特征排他性检查

本节于 2026-11-17 独立复核。结论：四字段组合足以作为**已观察到的 Shell 兼容协议的保守正向信号**；公开证据不足以证明它对所有第三方分支排他，不能据此证明厂商发行、授权状态、运营主体或精确代码来源。本节脚本保留最初的四字段实验；后续讨论提出的单主特征方案另列在下方，当时尚未接入生产识别；最终选择见文件顶部的实现范围。

| 已读取的公开实现 | 固定提交与状态实现 | 四个候选字段是否由该状态实现输出 |
| --- | --- | --- |
| One API | [`8df4a267` / GetStatus](https://github.com/songquanpeng/one-api/blob/8df4a2670b98266bd287c698243fff327d9748cf/controller/misc.go) | 完整固定字段表均不含。 |
| New API | [`669d7749` / GetStatus](https://github.com/QuantumNous/new-api/blob/669d774976369e986f03b6e24fff1042f6f94832/controller/misc.go) | 完整固定字段表及后续可选字段注入均不含。 |
| OneHub | [`387f8bf1` / GetStatus](https://github.com/MartialBE/one-hub/blob/387f8bf16ed0d601fdede7ade378adb10aa1a35a/controller/misc.go) | 完整固定字段表均不含。 |
| DoneHub | [`8e2878aa` / GetStatus](https://github.com/deanxv/done-hub/blob/8e2878aa26dc5781b7679dff00c1893069b315db/controller/misc.go) | 完整固定字段表均不含。 |
| Veloera 可读镜像 | [`6525dfce` / GetStatus](https://github.com/stevessr/Veloera/blob/6525dfce816beaa270e78f0d8b762e19e54d13b8/controller/misc.go) | 完整固定字段表均不含；原官方仓库 `Veloera/Veloera` 本次返回 404，镜像不代表已核实的当前官方发行。 |
| Shell API 公开旧源码 | [`9987a0d4` / GetStatus](https://github.com/akl7777777/shell-api/blob/9987a0d4d4a44f177872df08b281d90658dc01d3/controller/misc.go) | 同样均不含。官方演示商业协议与这份公开旧源码不能等同；规则会漏掉此旧源码部署。 |

这里的“不含”来自直接读取完整 `GetStatus` 构造逻辑，不是代码搜索未命中；结论仅覆盖对应提交中的状态实现，不能扩大到所有历史版本、二次修改部署或代理层注入。原文保存在本地忽略目录 `artifacts/source_*_misc.go`。

[RixAPI `68f6d6d2`](https://github.com/RixAPI/Rix-API/tree/68f6d6d2e71ab31322a68f1265a8b4928fa477e2) 的递归树为 112 项，公开内容没有可检查的后端状态实现；[Super-API `38613ef8`](https://github.com/SuperAI-Api/Super-API/tree/38613ef8b97f774f1bafea9978a20765a38a4963) 仅 3 项，README 明示闭源。无法通过这些仓库排除字段重叠。旧 Rix 演示 `platform.rixapi.com/api/status` 本次为 404，Super README 演示站的状态读取失败，均不能作阴性样本。

最初的四字段保守实验：仅接受成功 JSON 对象（`success === true`、`data` 为非数组对象），精确字段名 `ShellApiLogOptimizerEnabled` 的值必须为布尔值（`false` 也有效）；同时要求 `CustomThemeConfig`、`CustomDarkThemeConfig` 为字符串，且为空或能解析为非数组 JSON 对象；`CustomAppList` 为能解析为 JSON 数组的字符串。三份正样本中的主题字段都是空字符串，应用字段为 `"[]"` 或应用列表字符串；非空主题配置的对象约束属于保守接受策略，本次没有非空主题实测样本。不要用品牌名、自报版本、字段真值或原文子串代替结构校验。若另有 `rix_version_message`、`rixapi_license_type` 或 `rix_license_enabled` 等冲突家族信号，报告冲突并保留未知，不应直接落为 Shell。

`CustomAvailablePayMethods2` 的整数类型可作附加一致性信号，`DataExportEnabled` 等扩展组合及第一方演示静态资源可加强人工比对；它们都不能解决继承分支、兼容实现或伪造字段的问题。负向结果只表示“不满足这组已验证特征”，不能排除 Shell 家族。该判定也不证明登录、用户凭证、充值或模型请求接口具有兼容性。

### 可重复的特征验证

研究脚本 [`probe-shell-signature.py`](./probe-shell-signature.py) 只读取已保存的公开响应，不访问网络、不读取登录凭证，也未接入扩展识别流程。其 `shell-compatible` 输出仅指本节的状态特征组合；非匹配输出 `unknown`，不作“不是 Shell”的断言。

```powershell
python .scratch/apiyi-laozhang-relationship/probe-shell-signature.py --self-test
python .scratch/apiyi-laozhang-relationship/probe-shell-signature.py .scratch/apiyi-laozhang-relationship/artifacts/demo.shellapi.ltd_api_status.body .scratch/apiyi-laozhang-relationship/artifacts/api.apiyi.com_api_status.body .scratch/apiyi-laozhang-relationship/artifacts/api2.laozhang.ai_api_status.body .scratch/apiyi-laozhang-relationship/artifacts/aihubmix.com_api_status.body
```

实际执行结果：19 项检查通过，包括关闭标记仍匹配、移除任一必要字段不匹配、类型错误、格式错误、失败信封、仅品牌/版本及冲突 Rix 信号。3 份真实正样本均匹配；新增公开 AIHubMix 状态响应不匹配，仅为代表性排除样本，不证明全部非 Shell 部署均可排除。AnyRouter 本次取得 gzip 压缩的非状态 JSON 页面，脚本解压后保留为 `non-status-json` / `unknown`；不能把这次受阻读取计算为阴性协议样本。正样本来自同次调查保留的真实响应，非空主题配置检查使用合成数据，因此不属于已验证的实站分支。

2026-11-17 的调查没有修改生产类型、家族注册或识别行为。接入自动识别时，应保留已知站点身份优先级，冲突或抓取失败时维持未知，并单独验证匹配后的账号认证及功能能力。

### 后续讨论的主特征方案

用户提出 `ShellApiLogOptimizerEnabled` 是否足够后，建议以它作为主要正向辨识字段：成功状态信封中的 `data` 须为非数组对象，并拥有这个精确名称的自身字段，值为布尔值，`false` 也有效；主题和应用字段改为辅助一致性证据。出现其他家族的明确冲突信号时保留未知；缺少标记不排除旧 Shell。它识别的是 Shell 兼容协议特征，不能鉴别官方发行、授权或所有功能的兼容性。该方案尚未实现或独立测试，上面的 19 项实验结果仍只属于四字段脚本。

## 官方部署与适配基准

本节于 2026-11-17 核对第一方发布链。**公开旧源码具有自行构建的配方；当前商业版能否新购授权并自行部署，尚未核实。** 自建旧源码不能据此作为 APIYI / LaoZhang 当前 v33 协议的等价基准。本次只读取公开文件及元数据，没有构建、运行、拉取镜像或二进制，也没有登录或联系发布者。

| 问题 | 可核实结论与第一方来源 |
| --- | --- |
| 官方入口从哪里建立 | 从作者仓库 [`akl7777777/shell-api`](https://github.com/akl7777777/shell-api) 的 README、仓库元数据及其主动链接建立：README 将项目指向该作者旧路径 `akl7777777/one-api`，列出演示 `demo.oneapi.plus`、青春版 `lite.shellapi.ltd`、[腾讯特性文档](https://docs.qq.com/aio/DSWZ3eUhBSVlIa2l6)；[仓库元数据](https://api.github.com/repos/akl7777777/shell-api) 的 homepage 指向当前可读取的 `demo.shellapi.ltd`。这是发布账号主动关联的来源链；单独叫 Shell API 的域名、标题或镜像名称不能建立官方归属，更不能证明两站当前 v33 构建出自这个发布方。 |
| 公开源码能否自建 | 固定提交 [`9987a0d4` 的 Dockerfile](https://github.com/akl7777777/shell-api/blob/9987a0d4d4a44f177872df08b281d90658dc01d3/Dockerfile) 包含多阶段构建配方：Node 16 / npm 构建前端，Go 编译并嵌入 `web/build`，最终 Alpine 镜像启动 `/one-api` 并暴露 3000 端口。[LICENSE](https://github.com/akl7777777/shell-api/blob/9987a0d4d4a44f177872df08b281d90658dc01d3/LICENSE) 为 MIT。可把这份公开内容作为自建旧版候选，但本次未实际构建，不承诺旧依赖、构建配方或运行行为今天仍可用。 |
| 是否存在公开发行包 | [release v1.6.0](https://github.com/akl7777777/shell-api/releases/tag/v1.6.0) 发布于 2024-03-02，API 列出 `one-api`、`one-api-arm64`、`one-api-macos`、`one-api.exe` 四份资产，未给出 digest；[tag 引用](https://api.github.com/repos/akl7777777/shell-api/git/ref/tags/v1.6.0) 指向 `dbdadb7ba739b9e2f612169d261d63c2110f8320`。[该 tag 的状态实现](https://github.com/akl7777777/shell-api/blob/dbdadb7ba739b9e2f612169d261d63c2110f8320/controller/misc.go) 不含四个 Shell 特征字段，[前端包](https://github.com/akl7777777/shell-api/blob/dbdadb7ba739b9e2f612169d261d63c2110f8320/web/package.json) 使用 React 18 与 Semantic UI。[公开 Linux release 工作流](https://github.com/akl7777777/shell-api/blob/9987a0d4d4a44f177872df08b281d90658dc01d3/.github/workflows/linux-release.yml) 从 checkout 源码构建前后端并上传二进制。本次仅读取元数据与文本，没有下载、检查或执行这些资产，不能证明二进制与源码逐字对应，亦不能当作当前商业演示或 v33 版本。 |
| 官方部署示例对应什么包 | [README 部署节](https://github.com/akl7777777/shell-api/blob/9987a0d4d4a44f177872df08b281d90658dc01d3/README.md#部署) 要求 `docker login`，镜像为 `akl7777777/one-api-private:v0.x.y`；[仓库 Compose](https://github.com/akl7777777/shell-api/blob/9987a0d4d4a44f177872df08b281d90658dc01d3/docker-compose.yml) 实际固定 `akl7777777/one-api-private:v0.4.1`。它不是从该公开源码现场构建的 Compose。README 链接的[阿里云 Compose](https://one-api.oss-rg-china-mainland.aliyuncs.com/docker-compose.yml) 本次 HTTP 403，无法核实其当前 tag。私有包的访问权限、当前功能与许可不能从公开源码 MIT 文本推定。 |
| 镜像渠道能否公开确认 | Docker Hub 匿名读取[仓库元数据](https://hub.docker.com/v2/repositories/akl7777777/one-api-private/)及 [tags](https://hub.docker.com/v2/repositories/akl7777777/one-api-private/tags?page_size=5) 均返回 404；[作者公开仓库列表](https://hub.docker.com/v2/repositories/akl7777777/?page_size=50) 返回 200，仅列 `minio`。这只表示本次匿名未取得该镜像元数据，不证明仓库不存在、私有状态或授权后不可取得。[公开 Docker 工作流](https://github.com/akl7777777/shell-api/blob/9987a0d4d4a44f177872df08b281d90658dc01d3/.github/workflows/docker-image-amd64.yml) 仍声明 `justsong/one-api` 与 `ghcr.io/${{ github.repository }}`，和 README 的私有镜像渠道不一致；工作流声明不证明镜像已发布，不能将继承的 One API 镜像当成现代 Shell 商业发行。 |
| 现在还能取得专业版吗 | [README 通知与购买方式](https://github.com/akl7777777/shell-api/blob/9987a0d4d4a44f177872df08b281d90658dc01d3/README.md#通知) 仍写“已暂停出售专业版授权”“停售”，并称不再对外出售或增加授权实例、维护已有客户；另称青春版仅 root 用户及一个令牌。此次未取得更近的第一方销售/授权说明，因此不能认定 2026 年能新购专业版，也不能认定该历史停售规则今天仍完全生效。青春版即使可取得，其用户/令牌限制也使它不能直接验证完整多用户账号管理流程。 |
| 官方联系方式与当前说明缺口 | [同一 README 末尾](https://github.com/akl7777777/shell-api/blob/9987a0d4d4a44f177872df08b281d90658dc01d3/README.md#购买方式) 明示咨询交流群 `696967655`，未联系。[作者 GitHub 公开资料](https://api.github.com/users/akl7777777) 未披露真实姓名、公司、站点或邮箱。青春版入口本次 521；腾讯特性文档直接 HTTP 200 仅取得应用外壳及公开文档元数据，未取得正文，Tavily advanced 提取也失败。文档元数据有 `Shell API` 标题及 owner 昵称 `Kadxy`，不足以核实个人/公司身份或当前授权条款。 |

对于“像 NewApiFamily 那样，以官方通用适配为基线，再加 APIYI / LaoZhang 覆盖”的方向，当前证据支持**先建立经过验证的 Shell 兼容协议基线**，不能把公开旧仓库自动当成当前商业发行的完整合同：旧源码的 `GetStatus` 不含上述 Shell 特征，而官方演示 v6.7.2 与两站 v33 的特征有重叠。现阶段可用[仓库关联演示站](https://demo.shellapi.ltd/api/status)验证无需登录的状态协议，用两站真实公开响应验证站点差异；这些样本尚未覆盖身份认证、用户资料、密钥管理和管理端接口。只有实际共同的接口、认证与响应语义得到验证后，才适合共享实现并为差异添加站点覆盖；软件名称或软件家族识别本身不建立这些兼容性。

建议的内部组织是独立的 `ShellApiFamily`：通用 `shell-api` 类型承接已验证的默认能力，保留 `apiyi`、`laozhang` 站点类型及各自经过验证的协议/策略差异。家族共享实际共通的请求、规范化模型与流程，复用最小现有公共层；不整份复制 `NewApiFamily`，也不默认三个类型具有相同认证、货币或管理能力。这是 2026-11-17 记录的研究建议；后续实现采用该家族边界。

### 闭源交付与家族默认能力

Go 程序可以通过编译后的二进制或镜像交付，不需要随程序公开源码；是否允许这种交付取决于实际代码和依赖许可。没有用户可改的后端源码可以作为“多数部署直接使用厂商发行包”的调查假设，但本次没有证据确认两站均属这种情况。闭源交付也不能排除厂商定制版本、插件、配置、替换前端或代理层对外部行为的影响。

后续家族实现优先按可观察的共同行为归纳：对 APIYI、LaoZhang 的代表性版本逐项验证相同的请求与认证方式、响应和错误语义、单位与分页等相关合同；确认共通的行为默认放入 `ShellApiFamily`，具体站点只覆盖已经证实的差异。无须先证明两站没有改动源码，也无须取得最新官方部署才能开始建立这个兼容家族。官方样本能帮助交叉验证和解释来源，但可获取性不是已观察共同行为的共享前提。

家族默认实现的适用范围与部署功能可用性分别记录：关闭、可选或受版本影响的能力，通过具体配置、只读探测或版本/能力策略判断；未验证的能力保留未知。两站的一致结果不自动建立所有历史或未来 Shell 部署的兼容性，状态指纹匹配也不自动启用所有家族能力。本节记录 2026-11-17 的研究准则；后续采用的兼容默认见文件顶部。

若要获得可控的“当前官方自建基准”，仍缺发布方认可的可取得版本/授权、该版本与镜像或二进制 digest / 源码提交的对应、以及能进行所需账号管理验证的部署。应从上述第一方入口追溯具体包及版本，避免用未经发布方关联的第三方镜像补足这个缺口。即便拿到当前官方包，也要独立比较 APIYI / LaoZhang 的协议，不能默认它们只有外观或配置差异。

本地新增证据保留在忽略目录 `artifacts/official-dockerfile.body`、`official-compose.body`、`official-repo-contact.body`、`official-qq-doc.body`、`official-qq-doc-initial-state.json` 及对应 `.meta.json`；失败入口的状态与错误同样记录于 `.meta.json`，定向搜索及提取结果在 `vendor-channel-search.json`。公开旧源码可构建配方与当前商业包可取得性分别保留，便于后续补证。

发行补证保留在同一忽略目录的 `official-release-v1.6.0.json`、`official-tag-v1.6.0.json`、`official-tag-v1.6.0-misc.go`、`official-tag-v1.6.0-package.json`、`official-workflow-index.json`、`official-linux-release-workflow.yml`、`official-docker-workflow.yml`；Docker Hub 匿名观察记录为 `dockerhub-public-observations.json`，成功公开列表原文为 `dockerhub-2.json`。
