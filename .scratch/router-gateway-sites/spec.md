# OmniRoute 管理站点集成（9router 留档，本次不实现）

- Status: implemented（切片 01–04 全部落地，见 issues/01–04 的 Answer；上游契约已对真实部署实测）
- 本次范围：**只做 OmniRoute**。9router 的调研已完成并留在本文与 [research.md](research.md)，但不在计划内——见文末「9router 留档」。
- 现场证据：[research.md](research.md)（源码复核 + 2026-09-29 实测）
- 上游来源：all-api-hub#1259「希望可以增加导入到 OmniRoute 和 9router 的功能」（本次先答 OmniRoute 那一半）
- 更新：2026-09-29

## 目标

让扩展把 `OmniRoute`（`github.com/diegosouzapw/OmniRoute`）当作**管理站点**：在设置里配置连接、读到它的上游渠道清单、把扩展里的账户/凭据导入成网关的 provider 连接，并在扩展内管理这些渠道。

#1259 的诉求是「导入」。本方案把导入放进完整的渠道能力序列，不单独做一个一次性导入器——导入的落点就是原生渠道编辑器，退化实现会在后续 CRUD 切片被整段替换。

## 上游事实摘要

完整证据与文件引用见 [research.md](research.md)。影响方案的有五条：

1. **OmniRoute 是 9router 的 TypeScript fork**，但已实质分化：作用域令牌、CSRF 门槛、密钥掩码/reveal、批量与导入路由都只存在于 OmniRoute。默认端口 20128。
2. **它是「网关自身」，不是账户站点。** 没有上游账户语义（余额、套餐、签到、用户信息），所以只有管理站点这一个作用域成立。
3. **渠道 = provider connection，身份分两类**：内置 provider id，或 provider node（承载 prefix/baseUrl/apiType，连接创建时快照进 `providerSpecificData`）。**连接级 `providerSpecificData.baseUrl` 优先于静态 provider 配置**（`open-sse/executors/base.ts` 的 `resolveBaseUrl`，注释写着 Operator's manual override always wins #6147），所以自定义端点**单步就能建**，不需要先建 node；node 只在需要独立模型前缀时才用。
4. **鉴权**：四类凭据（`docs/guides/MANAGEMENT-AUTH.md`），其中 `oma_` 作用域令牌走 `Authorization: Bearer`，可远端使用；公开路由 `POST /api/cli/connect` 能用面板密码现换一个（默认 `admin` 作用域，明文只返回一次）。**渠道写入需要 `admin` 作用域**（`/api/providers` 在 `ADMIN_MUTATION_PREFIXES` 里），读只需要 `read`。
5. **渠道密钥可见性**（已实测）：`GET /api/providers` 打码（`前8****后4`）；`GET /api/providers/{id}` 同样；而 `GET /api/providers/client` **刻意不脱敏**（`{...c}` 原样返回，实测拿到 29 字符明文）。所以**可以按密钥做匹配**——这是本方案比同族其它站点多出来的能力，也是唯一需要在实现里特别小心的地方。

## 设计决定

1. **只注册一个站点类型 `omniroute`，不为「未来可能的第二个网关」预留共享抽象层。** 既然 9router 不在计划内，现在就抽 `apiService/routerGateway/` 属于为未承诺的第二方做设计。改为直接实现 `src/services/apiService/omniroute/`，但**按可提取的接缝分文件**（请求构造、响应解析、字段脱敏/裁剪各一个模块），将来真要加 9router 时抽公共部分不需要重写。站点类型本身按既有 managed-only 形态注册，之后新增同族站点也不冲突。

2. **作用域：仅管理站点。** definitions 里进 `MANAGED_ONLY_SITE_DEFINITIONS`，`scopes: MANAGED_SCOPE`、`adapterFamily: Unsupported`、`managedResource.primaryKind: Channel`。理由见事实摘要第 2 条。把实例当 OpenAI 兼容账户加进账户侧（模型目录取自 `/api/models`）是另一个独立诉求，不进本方案。

3. **鉴权全程走 bearer，不引入 cookie / 临时窗口。** 设置项接受两种输入，按 `oma_` 前缀判定：
   - 粘贴已铸令牌（Settings → Access Tokens，**必须选 `admin` 作用域**，因为 `/api/providers` 的写操作在 `ADMIN_MUTATION_PREFIXES` 里；只给 `write` 会 403）为默认路径。
   - 也允许填面板密码，由配置校验调公开的 `POST /api/cli/connect` 现换令牌，**只保存换回的令牌、不保存密码**。这条路径同样是 bearer，不需要 cookie，因此**没有 CSRF、没有同源要求、也不需要新增临时上下文任务种类**。
   - 换令牌会在用户网关上**留下一条持久访问令牌**，表单要说明这一点（并给出建议名字，便于用户日后在 Settings → Access Tokens 里撤销）。
   - 拒绝语义要单独识别：密码仍是众所周知的默认值时，`/api/cli/connect` 对非 loopback 来源返回 403（#14486，源码注释指向 #13679），要提示「先在网关本机改掉默认密码」，不要报成通用凭据错误。作用域不足是 403 且消息形如 `Access token scope '<have>' is insufficient; '<need>' required.`，要能提示用户重新铸一个 `admin` 令牌。

4. **渠道创建走单步 `POST /api/providers`，草稿契约不加字段。** `ManagedSiteChannelDraft` 保持 `name/type/key/base_url/models/groups/enabled` 不变（参照 `cliProxyApi.ts` 的 `prepareFormData`）。提交时把源 `baseUrl` 写进 `providerSpecificData.baseUrl`——已实测 201 且回读一致。node 作为**进阶选项**（需要独立模型前缀时）保留在编辑器里，默认不出现。
   - 预填规则：源 `baseUrl` 命中内置 provider 的已知 baseUrl → 预选该内置 provider；否则仍用内置 provider + baseUrl 覆盖（这与 9router 必须建 node 的形态不同，别把两边的规则混在一起）。
   - **创建不用 `bulk`/`import`**：它们会逐条 `validateProviderApiKey`，把「网关能不能连到源站」变成导入成败的一部分；单条创建不校验，凭据有效性由扩展自己验（`aiApiVerification`）。

5. **`matching.fetchSecretKey` 做，但按可失败设计。** 走 `GET /api/providers/client`（实测明文）。用途是判定「这条同地址的渠道是不是同一把凭据」，从而去重。
   - **列表一律用打码的 `GET /api/providers`**，只在显式读密钥的动作里打 client 路由，别把它当列表数据源，否则明文凭据会顺手流进表面数据。
   - 该路由源码注释自称「only accessible from same origin」，**实测并没有这个限制**（`admin` 令牌跨源即可拿明文）。所以按「上游随时可能收紧」写：读到 401/403/404 或形状不符就回落成无密钥匹配并明确提示降级，不要让它成为导入的硬依赖。

6. **不做 `models` 能力（管理站点模型同步）。** 上游的「渠道模型」不是渠道属性：模型来自 provider 目录 + alias + 网关级 disabled 列表，连接上只有 `defaultModel` 一个字段。AAH 的模型同步是「按渠道写回模型列表」，没有落点。这不是降级，是没有对应概念——不要用只读 `list`/`fetchModels` 半实现，共享同步运行器会在写回时失败。理由按 site-integrations 指引用注释记在适配器旁。

7. **不做网关密钥（API key）工作区。** `MANAGED_RESOURCE_KINDS` 目前只有 `Channel`，密钥在既有站点里只是 `consoleRoutes.tokens` 的导航入口；新增一个 kind 是所有管理站点共有的产品级改动，与本方案的范围不成比例。（若将来做：OmniRoute 的密钥列表恒打码，明文只能从 `/api/keys/{id}/reveal` 取，且需要网关侧 `ALLOW_API_KEY_REVEAL=1`——实测该部署为 `false`。）

8. **不登记站点识别 hostname。** 它是自托管，用户填的是自己的 IP/域名/localhost:20128，没有可枚举的官方域。做「手动配置 + 探测校验」：`checkValid` 用只读端点验证连接（`GET /api/providers`，或更轻的 `GET /api/cli/whoami` 顺带确认令牌作用域）。`/api/auth/status` 是公开精确路由且字段可辨，可作为「这看起来是一个 OmniRoute 部署」的可选提示，但不是必需能力。

9. **版本锚定与契约注释。** OmniRoute 迭代快（默认分支是 `release/v3.8.51` 这种形态），按 site-integrations 指引在适配器/传输层注释里记录被验证的版本与所依赖的具体契约。**`docs/openapi.yaml` 不可作为契约来源**：它把 `/api/keys` POST 写成必填 `label`（实现要 `name`）、把 `ProviderConnectionCreate` 写成必填 `url`（实现要 `apiKey`），已有实测漂移，以路由处理函数为准。

## 能力映射

| AAH 能力 | OmniRoute |
| --- | --- |
| `config.checkValid` | `GET /api/providers`（或 `GET /api/cli/whoami`），凭 `oma_` 令牌 |
| `config.get` | `{ baseUrl, token }`（密码输入只在校验时用来换令牌，不落库） |
| `matching.search` | `GET /api/providers`（分页 `limit/offset`），`base_url` 取自 `providerSpecificData.baseUrl` |
| `matching.fetchSecretKey` | 做：`GET /api/providers/client`（实测明文；失败回落为无密钥匹配） |
| `queries.siteUserGroups` | 不做（连接无分组；`/api/keys/groups` 是密钥分组，语义不符） |
| `queries.accountAvailableModels` | `GET /api/models`（`{models:[...]}`，实测 72 条） |
| `channelDrafts.prepareFormData` | 做 |
| `models` | 不做（上游无对应概念，见设计决定 6） |
| 原生渠道工作区 | list / get / create / update / delete；**创建走单条 `POST /api/providers`** |
| 原生密钥工作区 | 不在范围 |

## 能力边界（做不到 / 明确不做）

**上游结构决定、绕不过去的：**

1. **管理站点模型同步做不到**（见设计决定 6）。不要半实现。
2. **没有 provider id 目录的接口。** 上游不暴露目录（面板是客户端 import 常量），而 OmniRoute 声称 359 个 provider 且持续增加——编辑器自带的 provider→基础地址表**会漂移**。缓解：表只覆盖内置 provider 的地址用于匹配与预填，不预置用不到的 id；或从 `/api/models` 里出现的 `provider` 值反推部署实际在用的集合。

**能用但要按可失败设计的：**

3. **明文渠道读出口**（`/api/providers/client`）是 `fetchSecretKey` 的唯一来源，且它的自述与实际不符。按「可能被上游收紧」处理（设计决定 5）。

**部署相关、不能按本机假设写文案的：**

4. **OmniRoute 的 SSRF 守卫可能拦内网中转**。`open-sse/executors/base.ts` 里紧接着 baseUrl 覆盖逻辑就写着守卫（GHSA-4f49-hj64-448x）：落库的、调用方提供的 `providerSpecificData.baseUrl` 会进入 fetch，因此对非本地 provider 默认按 `block-metadata`（可配 `public-only`）拦私网与云元数据地址，本地/自建 provider 豁免，另有 `OMNIROUTE_ALLOW_PRIVATE_PROVIDER_URLS` 开关。导入内网中转时渠道能建成，但运行时会被网关自己拦下——导入结果要把网关返回的失败透出来，不要报成导入成功。
5. **默认密码的网关换不出令牌**（#14486 的 403）。`checkValid` 要能分开报「凭据不对」「令牌作用域不足」「部署还没改默认密码」三种情况。
6. **provider 名称冲突**：`POST /api/providers` 与 9router 同构，重名会以冲突拒绝（除非显式允许覆盖）。AAH 的草稿名带 `(auto)` 后缀，重复导入同一账户很可能撞名，冲突要显式处理而不是静默失败。

## 切片

- **切片 01 — 注册与配置**：站点类型（identifiers / definitions / contracts 的 labelKey+messagesKey）、配置类型与持久化（`runtimeConfig`、`userPreferences`、必要时 preferences 迁移）、设置页表单（`OmniRouteSettings`）、`checkValid`（令牌路径 + 密码换令牌路径 + 三种错误语义）、i18n 文案。产出：用户能配置 OmniRoute 并被判定连接有效。
- **切片 02 — 渠道读投影与导入创建**：`GET /api/providers` 投影成渠道行、`matching.search`、原生创建编辑器（内置 provider + 连接级 baseUrl 覆盖，node 作为进阶选项）、`channelDrafts.prepareFormData`。产出：**#1259 的 OmniRoute 半边闭环**。
- **切片 03 — 渠道更新/删除与匹配细化**：`PATCH`/`DELETE`、`matching.fetchSecretKey`（含失败回落）、`exactMatchBasis` 与去重语义定稿、跨站点渠道迁移的类型路由。
- **切片 04 — 文档与收尾**：`docs/docs/` 中文源文档 + 本地化导航、`supported-sites.md` / `self-hosted-site-management.md` 更新、`docs/agents/site-integrations.md` 的 Relationships 与默认上游引用条目、翻译同步。

切片 02 是工作量主体（原生渠道工作区 + 编辑器）。

**相比「两个站点一起做」省掉了什么**：整个 cookie/临时窗口体系（`TEMP_CONTEXT_TASK_KINDS` 新增、`tempWindowPool` 分派、上下文页选型、DNR 会话 cookie 注入）、9router 的 node 两段式创建与失败补偿、以及跨两个站点的配置表单/i18n/文档复制。

## 逐文件工作量

一次完整的管理站点集成在现有架构下约 4000–8000 行、60–90 个文件（参照：Claude Code Hub 初次支持 67 文件 / +4551 行；Octopus 迁移到原生资源 26 文件 / +2624 行）。本次是单站点，且不含临时窗口那部分。

注册与配置：

- `src/services/accountSiteDefinitions/identifiers.ts` — `SITE_TYPES.OMNIROUTE` 与端口/路径常量（**该文件必须保持无 `~/` 导入**）
- `src/services/accountSiteDefinitions/definitions.ts` — `MANAGED_ONLY_SITE_DEFINITIONS` 条目：`consoleRoutes.channels = "/dashboard/providers"`、`consoleRoutes.tokens = "/dashboard/api-manager"`、`labelKey` / `messagesKey` / `getStartedUrl`、表格与详情字段常量
- `src/services/accountSiteDefinitions/contracts.ts` — `ManagedSiteLabelKey`、`ManagedSiteMessagesKey` 联合类型
- `src/services/managedSites/runtimeConfig.ts` — 配置联合项、`getManagedSiteRuntimePrincipal`、`hasManagedSiteRuntimeConfigInputForType`
- `src/services/preferences/userPreferences.ts`（+ 必要时 `preferences/migrations/preferencesMigration.ts`）
- `src/services/managedSites/channelMigrationCapabilityRegistry.ts`、`src/services/apiAdapters/registry.ts`、`src/services/apiAdapters/managedResources/registry.ts`、`src/services/apiAdapters/managedResources/migrationTypeRoutes.ts`
- `src/services/productAnalytics/{contracts,settings}.ts`、`src/components/icons/ManagedSiteIcon.tsx`、`src/constants/omniroute.ts`、`src/types/omnirouteConfig.ts`

协议与传输（按可提取的接缝分文件，不预抽共享层）：

- `src/services/apiService/omniroute/{index,auth,providers,keys,models,parsing,redaction}.ts`
  - `auth.ts`：令牌校验、`POST /api/cli/connect` 换令牌、错误语义到可行动文案的映射
  - `redaction.ts`：列表读用打码投影、显式读密钥走 client 路由；两侧严格分开，避免明文渗进列表

适配器：

- `src/services/apiAdapters/managedSites/omniroute.ts`
- `src/services/apiAdapters/managedResources/omniroute.ts` + 编辑器 / 操作 / 迁移
- `src/services/managedSites/providers/omniroute.ts` — `checkValid`、`prepareChannelFormData`、provider→baseUrl 表

界面：

- `src/features/BasicSettings/components/tabs/ManagedSite/OmniRouteSettings.tsx` + 对应 `.search.ts` + `ManagedSiteTab.tsx` 分支
- `src/features/ManagedSiteChannels/presentation/{managedResourceFieldPolicy,managedResourceTablePolicy,managedResourceMigrationPresentation}.ts`
- `src/features/OptionsSearch/registry.ts`

文档与 i18n：

- `docs/docs/omniroute-integration.md`（中文为源）、`docs/docs/.vuepress/config.js` 本地化导航、`supported-sites.md`、`self-hosted-site-management.md`
- `docs/agents/site-integrations.md`、根 `AGENTS.md`
- `src/locales/zh-CN/**` 及各语言（按 i18n 指引，源改完再同步）

测试：

- `tests/services/apiService/omniroute/*`（请求构造与响应解析；夹具只用中性域名，不写真实业务域名与真实部署地址）
- `tests/services/apiAdapters/managedSites/*`、`tests/services/apiAdapters/managedResources/*`
- 配置校验的单测覆盖三条路径与三种错误语义（令牌有效、密码换令牌、作用域不足 403、默认密码 403）
- i18n 抽取检查（动态 key 会被判未使用而删文案）

`.env.example` 已有 `AAH_E2E_OMNIROUTE_BASE_URL` / `_ADMIN_TOKEN` / `_PASSWORD` 三项，real-site E2E 接入时按既有 `e2e/utils/realSite/managedSiteConfig.ts` 的形态加 `resolveOmniRouteManagedSiteConfig()`（那里只接受 `adminToken` 一项的话，把换令牌路径留给设置页，测试用现成令牌）。

## 验证计划

**上游契约已实测**（2026-09-29，`.scratch/router-gateway-sites/probe-upstream.mjs`，只读 + 写入两轮，写入后计数复原：`connections 8 → 8`）。探针默认读所在 worktree 的 `.env.local`，取集中存放的值时用 `--env-file=<path>`；写入探测必须显式加 `--write`。完整证据见 [research.md](research.md) 的「实测结果」。落到结论上：

1. **`admin` 作用域 `oma_` 令牌可用**（`/api/cli/whoami` 回 `viaAccessToken: true, scope: admin`）——切片 01 的鉴权路径不是纸面推断。
2. **单步 baseUrl 覆盖成立**：`POST /api/providers` 传内置 `openai` + `providerSpecificData.baseUrl` → 201，`GET /api/providers/{id}` 回读一字不差。设计决定 4 的形态已实证。
3. **密钥可见性矩阵**：列表/详情打码、`/api/providers/client` 明文。设计决定 5 与风险 1 据此。
4. **没有 provider 目录接口**，编辑器必须自带 provider→baseUrl 表。

**因为本次不含 9router，原先那条「临时窗口加载成本」的运行时未知也一并消失**——OmniRoute 全程 bearer，不涉及同源窗口。剩下唯一要核对的是**目标部署的版本**：实测覆盖的是当前版本，适配器注释锚定的契约仍要按用户部署核对。

**其余按常规**：单元/集成用定向 vitest（受影响行为，不靠提交钩子替代）；浏览器 E2E 只在底层测试无法覆盖风险时用（例如凭据实际写入网关后的端到端导入），参考 `live-extension-ui-automation` 技能。

## 风险

1. **依赖明文渠道读出口**：`GET /api/providers/client` 的自述是「同源同步用」，实测却没有同源地限制（`admin` 令牌跨源即可拿明文）。用它实现 `fetchSecretKey` 等于把上游一个可能被收紧的行为当成能力依赖——必须按可失败设计（回落为无密钥匹配 + 明确降级提示），列表始终用打码的 `GET /api/providers`。这条同时意味着：**任何持有 `admin` 令牌（或 manage 作用域 API key）的人都能读到该实例全部上游凭据**——那是上游自己的暴露面，不是 AAH 引入的，但设置页文案要提示「这把令牌等于网关全部上游密钥」。实测部署就在公网域名上。
2. **凭据写入网关后无法回收**：`POST /api/providers` 不校验、也不做任何「这条渠道是否真的可用」的确认，`testStatus` 默认 `"unknown"`。导入成功 ≠ 渠道可用，结果文案不能暗示已连通；应引导用户用编辑器里的测试动作（`POST /api/providers/{id}/test`）或 AAH 自己的验证去确认。
3. **SSRF 守卫与内网中转**（能力边界第 4 条）：渠道建成但运行时不工作，导入结果必须透出上游的失败。
4. **provider 目录表会漂移**（能力边界第 2 条），且目录规模可观（宣传 359 个）。可搜索控件是现成的——`ManagedResourceAdvancedField` 用的是带 `onInputValueChange` 的 `Combobox`，不是普通下拉——所以这是个决策点：选项一次性全量下发，还是走 `ResourceEditor.loadOptions` + `RESOURCE_FIELD_OPTION_LOAD_TRIGGERS` 懒加载。倾向后者。
5. **版本漂移**：默认分支是 `release/v3.8.51` 这类形态，说明发布节奏很快，`/api/providers` 与 `/api/providers/client` 都可能继续变。适配器里必须记录被验证的版本。
6. **`docs/openapi.yaml` 与实现漂移**（keys 的 `label` vs `name`、providers 的 `url` vs `apiKey`）。任何按文档实现的路径都会错，只认路由处理函数。
7. **设置表单的密码分支**：填密码换令牌这条路径会让扩展拿到面板密码（虽然不落库）。表单要说清「只用于换令牌、不会被保存」，并把生成的令牌名字告知用户以便撤销。

## 开放问题

1. **是否要把实例做成账户站点**（账户侧加一个 OpenAI 兼容账户，模型目录取 `/api/models`）——本方案判为独立诉求，未纳入。
2. **是否需要网关密钥工作区**——需要先决定是否为所有管理站点新增一个 `ManagedResourceKind`；OmniRoute 侧还依赖 `ALLOW_API_KEY_REVEAL` 才读得到明文。
3. **是否需要站点识别**：`/api/auth/status` 是公开精确路由且字段可辨，可以做「手动填 URL → 探测确认是 OmniRoute」的辅助提示，也可完全不做。默认不做。
4. **密码换令牌要不要进第一版**：令牌路径已实测可用、也不需要用户理解作用域，是最小实现；密码分支体验更好但多一条写入网关的路径。默认两条都做（成本很低，都在 `auth.ts`）。

## 9router 留档（本次不实现）

**决定**：9router 的调研已完成、证据齐全，但不在本次计划内。先做 OmniRoute 拿到可验证的一套架构；9router 何时捡起来由后续需求决定。

**它现在唯一还缺的**是一段「值不值得」的讨论——见下「已知代价」。所有事实性调研都已经做完，捡起来时不需要重新查上游。

**已经查清、捡起来直接可用的结论**（细节见 [research.md](research.md)）：

- 血统：9router 是 OmniRoute 的上游项目，两者默认端口都是 20128。
- 鉴权只有面板密码 → `auth_token` httpOnly JWT cookie（24h）；同机派生的 `x-9r-cli-token` 远端不可用。
- 自定义端点**必须两步**（先 `POST /api/provider-nodes`，再建引用该 node 的连接；连接会快照 node 的 baseUrl）。与 OmniRoute 的规则不同，别混用。
- 渠道密钥：`GET /api/providers`、`/api/providers/{id}`、`/api/providers/client` 三条实测都不返回；唯一出口是 `GET /api/settings/database` 的**全库导出**（返回整台机器的凭据、每次要重发面板密码、同路由族的写操作是清库重建、形状非对外契约）——结论是不值得，去重退回 URL + 名称。
- 接不了 Gemini 原生中转（compatible node 没有 gemini 形态，内置 `gemini` 改不了 baseUrl）。
- 网关密钥明文可读，但 `PUT /api/keys/{id}` 只能改 `isActive`，密钥值绑部署机器的 machineId。
- 同名渠道返回 409 `PROVIDER_NAME_CONFLICT`。
- 站点状态：`requireLogin=true`、`hasPassword=false`（靠 `INITIAL_PASSWORD` 认证，因此源码里「未设密码 + 非 loopback → 403」这条**没有**触发）。

**捡起来时要补的工作**（约一个完整站点的十分之一量级）：

1. 新增临时上下文任务种类（`protectionBypass/contracts.ts` 的参数类型 + 校验 + 端点白名单、`types/tempWindowFetch.ts`、`entrypoints/background/tempWindowPool.ts` 的上下文页与分派、`managedSites/providers/nineRouterProtectionBypassResource.ts`），或先做那个一次性探针验证「后台 + `credentials: "include"`」能否省掉整块。
2. cookie 会话管理：登录、缓存、401 重登、限流感知（登录按 IP 锁定，重登写坏会刷出用户自己的面板锁定）。
3. 编辑器的 node 两段式创建 + 连接失败时补偿删除 node。
4. 复用本方案的注册/配置/编辑器骨架，站点类型独立注册（同族但契约差异足够大，不合并成一个类型）。
