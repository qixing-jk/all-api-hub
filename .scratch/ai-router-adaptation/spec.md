# ai-router.dev（AI-ROUTER）适配

- Status: resolved（三块切片均已实现；未提交 PR）
- 现场证据：[调查记录](research.md)
- 更新：2026-09-28

## 目标

让扩展能在 `https://ai-router.dev`（品牌 AI-ROUTER）上正常工作：识别这个部署、把账户 API 调用打到正确的 origin、并支持该部署自有的每日签到。

现场结论见[调查记录](research.md)：这是 Sub2API 的**分域**魔改部署——浏览器应用在 `https://ai-router.dev`，API 在 `https://api.ai-router.dev/api/v1`，两者互不代理。账户侧 API 契约（信封、鉴权、会话存储键、刷新契约、用户域路由）与上游 Sub2API 一致，另有上游没有的 `/api/v1/user/daily-checkin`。

## 设计决定

1. **站点类型仍是 `sub2api`，不新建站点类型。** 会话存储键、刷新契约、信封与用户域路由都与 Sub2API 一致，差异集中在「API 在另一个 origin」和「签到换了路由」。新建站点类型要重做账户、密钥资源、签到、公告等整套能力，与差异量不成比例。
2. **按部署登记浏览器 origin，并在请求层解析 API origin。** 站点识别与 API 路由各需要一份「本部署的 host → 它的 API origin」事实。识别侧走已有的 `detection.hostnames`，请求侧新增一个叶子常量表 + 纯函数 `resolveDeploymentApiOrigin(baseUrl)`，只在**构造 HTTP 请求 URL 的位置**生效。
3. **不改账户的 `site_url`，也不在账户层改写 `baseUrl`。** `ApiServiceRequest.baseUrl` 同时承担两种语义：HTTP 请求基址，以及浏览器上下文要打开的 origin（`recoverSub2ApiBrowserAuth({ baseUrl })` 用它开页面读 `auth_token` 做凭证再同步；临时窗口兜底同理）。把 `baseUrl` 换成 API origin 会让这两种用途一起坏掉——API origin 上没有前端（实测 `/`、`/dashboard`、`/keys` 都是 `404 page not found`），读不到 localStorage。因此在 URL 构造处做转换，`baseUrl` 保持浏览器 origin。
4. **不依赖站点自曝的 `api_base_url`。** `/api/v1/settings/public` 确实返回 `api_base_url: "https://api.ai-router.dev"`，前端也把它注入 `window.__APP_CONFIG__`，但拿到它的前提是已经知道 API origin（前端调用 settings 本身就指向该 origin），HTML shell 里没有这个值。它是结果不是线索，不能用于发现。
5. **签到方法 ID `ai-router:daily-checkin`，来源名称「AI-ROUTER」。** `legacy: false`、`newAccountCompatibility: false`，不进冻结的 V6 迁移清单，不保留兼容别名。名字取自部署品牌（响应里没有 id/名称/版本字段）。
6. **签到候选按 origin 限定。** 与「小白Code」的固定路径探测不同，本方法的路径挂在**另一个 origin** 上，只有该部署才有意义；而 host 本来就必须登记（决定 API 路由），所以复用它做候选门禁，不向其他 Sub2API 部署发探测。
7. **`requiresAuthoritativeStatusBeforeMutation: true`，不重放提交。** 同一执行周期内先读到权威 `enabled` 且 `checked_today` 为假才提交，提交只发一次。服务端已实测按「用户 + 日期」幂等（见下），但门禁按只读状态而不是按重试容忍度设计。
8. **复用既有 Sub2API 设施。** readiness、结果映射复用 `providers/sub2apiShared.ts`；认证走 `executeAuthenticatedSub2ApiRequest`；适配器不自行读浏览器存储。
9. **对外导出也要拿到 API origin。** 扩展会把账户/密钥交给外部消费方（管理的渠道、凭据资料、CC Switch / AI Toolbox / Cherry Studio / Kelivo / Cursor++ / Kilo Code 等桌面集成、深链导出）。`normalizeAccountSiteProfileUrlForManagedChannel` 本来就是「导出给外部调用方用的 API origin」，只是对多部署的 Sub2API 恒等于原样返回；把分域表接进它的兜底，并让此前直接取 `account.baseUrl` 的凭据导出出口改走同一个访问器。见[切片 03](issues/03-external-export-endpoints.md)。

## 协议边界

### 站点识别

`ai-router.dev` 与 `www.ai-router.dev` 登记为 Sub2API 的识别 hostname。实测现有识别链路对该地址全部落空（hostname 未登记、`/api/user/info` 与 `/api/v1/auth/me` 在 Web origin 都是 404 HTML、静态 shell 标题 `AI-ROUTER - AI API Gateway` 不含 `sub2api`），因此必须显式登记。

### 分域部署的注册位置（元数据）

一个分域部署**只声明一次**，声明是数据而不是散落的常量：`src/constants/deploymentApiOrigins.ts` 里按部署名登记一条描述符。

```ts
SPLIT_ORIGIN_DEPLOYMENTS = {
  aiRouter: {
    browserHostnames: ["ai-router.dev", "www.ai-router.dev"],
    apiOrigin: "https://api.ai-router.dev",
    // inferenceApiOrigin?: string  // 仅当调用网关真的换 origin
  },
}
```

该模块是依赖叶子（禁止内部 import）——传输层要能在不引入站点定义图的前提下读它，否则会给热路径的模块图加负担并可能成环（设计决定 2/3）。**其余一切都是派生**，没有第二份声明：

| 派生点 | 内容 |
| --- | --- |
| `createDeploymentOriginLookup(deployments, role)` | 按角色建 hostname → origin 查表 |
| `resolveDeploymentApiOrigin(url, role = Account)` | 查表；未登记原样返回，可无条件调用 |
| `AI_ROUTER_HOSTNAMES` / `AI_ROUTER_API_ORIGIN` | 供站点定义与测试按名字取单个部署 |
| `identifiers.ts` | **不参与**：该模块必须保持零依赖（理由见下），部署地址由消费者直接从叶子模块 import |
| `definitions.ts` | 在 Sub2API 的 `detection.hostnames` 与 `urls.recognizedHostnames` 引用同一列表 |

新增一个分域部署 = 加一条描述符 + 在对应站点定义里引用它（新站点类型才需要新建定义）。

**叶子模块必须保持零依赖，`identifiers.ts` 也必须**：`wxt.config.ts` 用**相对路径** import `identifiers.ts`，由 jiti 在 bundler 解析别名之前求值——一旦该模块 import `~/...`，`pnpm dev` 与 `pnpm build` 直接失败，而单测、`tsc`、`knip`、`i18n:extract:ci` **全部照过**（2026-09-28 就是这么挂的）。这条约束由 `tests/services/accountSiteDefinitions/configLoadedModules.test.ts` 守着；验证任何触及这些模块的改动都要跑一次 `pnpm build`，因为上面那套门不覆盖 jiti 这条路径。

#### 两个 API 角色

`DEPLOYMENT_API_ROLES.Account`（默认）是账户类调用——传输层与所有 `/api/...` 请求；`Inference` 是用 API key 调的网关端点。**当前没有任何部署把两者分开**：实测 sub2api 的账户 API 与 `/v1` 网关同在一个 host 上，AIHubMix、OpenRouter 也是同源（真正的分叉到处都是「网页 vs API」这一轴）。所以两个角色今天解析到同一个 origin，`inferenceApiOrigin` 是预留的数据字段而不是生效分支。

今天唯一显式传 `Inference` 的调用点是 sub2api 的运行时模型列表（`/v1/models`，它自己拼 URL 绕开传输层）。**导出给外部工具的 key base 与 managed 渠道草稿仍走默认账户角色**：通用传输层无法区分「网关调用」与「账户调用」，要让角色真正生效需要在请求上带角色（`ApiTransportRequest` 加字段并逐点标注），这一步等出现**真实分叉的部署**再做，避免照单个样本猜形状。

**注意副作用**：把一个 host 登记进这张表会改变该 host 请求的当前标签页取源资格——请求 origin 变成 API origin 后与标签页 origin 不一致，`isCurrentTabContentFetchEligible` 会判否并回落到扩展上下文 fetch。对 Bearer 类账户是正确的（也要这样），但对 Cookie 类站点需要重新评估后再登记。

### API origin 解析

```
resolveDeploymentApiOrigin("https://ai-router.dev")      → "https://api.ai-router.dev"
resolveDeploymentApiOrigin("https://www.ai-router.dev")  → "https://api.ai-router.dev"
resolveDeploymentApiOrigin("https://api.ai-router.dev")  → "https://api.ai-router.dev"
resolveDeploymentApiOrigin(<其他任何地址>)                → 原样返回
```

只按精确 hostname 匹配可解析的 HTTP(S) URL；不解析、非 HTTP(S) 或未登记时原样返回。用 URL 的 origin 拼接，保留端口与协议。

生效范围（Sub2API 账户侧的全部请求出口）：

- `fetchApi` / `fetchApiResponse` / `fetchApiData` 的请求 URL 构造点（覆盖 `executeAuthenticatedSub2ApiRequest` 的所有调用方、`checkIn.ts`、`denxioCheckIn.ts`、`geniusProgrammerCheckIn.ts`、`xiaobaiCodeCheckIn.ts`）。
- `/v1/models` 运行时模型列表（自行拼 URL，不经 `joinUrl`）。
- 浏览器身份校验（`sub2ApiBrowserIdentity.observe` 的 `verify` 读取）——它用账户 origin 拼 `/api/v1/auth/me`，在 Web origin 上会 404。

不生效于：浏览器上下文打开的 origin（会话读取、临时窗口兜底、当前标签页取源）、UI 跳转地址、重复账号判定、存储层与备份——它们都应当继续用 `site_url`。

对外导出走另一条路径（`normalizeAccountSiteProfileUrlForManagedChannel` → `resolveAccountExternalApiBaseUrl`），见[切片 03](issues/03-external-export-endpoints.md)。

### 每日签到

方法 ID `ai-router:daily-checkin`，只有 origin 匹配的 Sub2API 账户参与候选。

#### 状态

```http
GET /api/v1/user/daily-checkin
Authorization: Bearer <Sub2API access token>
```

严格成功 DTO：`code === 0`，`message` 为字符串，`data` 为对象且 `enabled` 与 `checked_today` 均为布尔。映射：

- `enabled` → availability enabled / disabled。
- `checked_today` → today checked / not_checked。
- `eligible === false` → 不提交（站点自己的前端也在此时拒绝提交并提示账号时长门槛），按未就绪处理。
- HTTP 404（含 `404 page not found` 纯文本）→ absent。
- HTTP 200 但正文不是 JSON → absent（用于「这个 origin 没有这个应用」，与本仓库既有判定一致）。
- 401/403、5xx、网络、超时、JSON 但结构不符 → unknown。

`reward_amount`、`base_reward_amount`、`max_reward_amount`、`yesterday_*`、`next_reset_at`、`checkin_date` 属于展示与风控细节，不进入账户配置、日志或 analytics。

#### 提交

```http
POST /api/v1/user/daily-checkin
Authorization: Bearer <Sub2API access token>
```

- 无请求体。
- 可选请求头 `X-AI-Router-Client-Fingerprint`（FingerprintJS `visitorId`）。**不发送该头。** 依据：站点自身前端的 `Md()` 有 1200ms 兜底（`Promise.race` 超时 resolve `undefined`），此时 `headers` 为 `undefined`，即站点自身就会发出无指纹头的提交；实测无指纹头的重复提交也走到了日期门禁（返回 409 而不是拒绝）。扩展无法产出该指纹，且协议不要求它。
- 严格成功 DTO：与状态响应同构，要求 `code === 0`、`data` 为对象、`reward_amount` 为有限非负数、`checked_today === true`。依据：站点前端把提交响应的 `data` 直接赋给与 GET 相同的状态（`D.value = d`），并用 `d.reward_amount` 渲染成功提示。
- `409` + `reason: "DAILY_CHECKIN_CLAIMED"` → already_checked，不视为失败。
- `403` + `reason: "DAILY_CHECKIN_RESTRICTED"` → 受限期，映射为不可用。
- 2xx 但结构不符、奖励非法 → 不判成功；已派发时保留 UNCERTAIN，交由统一状态回读协调。
- 不对提交的 401 做自动重放；不启用不确定结果后的写入重试。

#### 幂等性

服务端按「用户 + 日期」幂等。实测同一天第二次提交返回 `409 {"code":409,"message":"daily check-in reward already claimed today","reason":"DAILY_CHECKIN_CLAIMED"}`，余额 `$1.3 → $1.3` 未二次发奖。

## 接入位置

| 位置 | 作用 |
| --- | --- |
| `src/constants/deploymentApiOrigins.ts` | 分域部署表与 `resolveDeploymentApiOrigin`（叶子模块，无内部依赖）。 |
| `src/services/accountSiteDefinitions/identifiers.ts` | `AI_ROUTER_HOSTNAMES`、`AI_ROUTER_API_ORIGIN`。 |
| `src/services/accountSiteDefinitions/definitions.ts` | Sub2API 登记识别 hostname 与 `recognizedHostnames`。 |
| `src/services/apiTransport/request.ts` | 请求 URL 构造改用解析后的 API origin。 |
| `src/services/apiService/sub2api/index.ts` | `/v1/models` 的 URL 构造改用解析后的 API origin。 |
| `src/services/apiAdapters/sub2api/browserIdentity.ts` | 身份校验读取改用解析后的 API origin。 |
| `src/constants/checkIn.ts` | 声明 `AiRouterDailyCheckIn` 及方法 ID。 |
| `src/services/apiService/sub2api/aiRouterCheckIn.ts` | 端点、只读判定、严格提交解析与错误原因映射。 |
| `src/services/checkin/autoCheckin/providers/aiRouter.ts` | readiness、detect、getStatus、checkIn 与统一结果映射。 |
| `src/services/checkin/autoCheckin/providers/registry.ts` | 注册 Sub2API 候选、origin 门禁与来源名称。 |
| `src/services/productAnalytics/autoCheckin.ts` | StrictReadback 方法分类。 |
| `src/services/accounts/accountSiteProfile/urls.ts` | 对外导出的 API origin 兜底接入分域表。 |
| `src/services/accounts/utils/credentialExport.ts` | `resolveAccountExternalApiBaseUrl`：账户 → 外部消费方基址的唯一访问器。 |
| `src/features/KeyManagement/.../useRuntimeKeyIntegrationActions.ts` | Cherry Studio / Kelivo 导出改用该访问器。 |

反馈报告的只读路由不登记本方法：扫描器按账户 origin 探测，而本方法的路径在另一个 origin 上（[feedbackRoutes.ts](../../src/services/checkin/autoCheckin/providers/feedbackRoutes.ts) 的 `FeedbackStatusRoute` 不支持跨 origin）。

## 验收

### 识别与路由

- `ai-router.dev` 与 `www.ai-router.dev` 在账户探测中直接判定为 Sub2API，不依赖标题或探测端点。
- 该地址的账户在自动探测/手动添加后，账户 API 调用（余额、密钥列表、分组、用量、公告、邀请）打到 `https://api.ai-router.dev/api/v1/...`，而不是 `https://ai-router.dev/api/v1/...`。
- `site_url` 会话读取、UI 跳转、重复账号判定、临时窗口兜底仍使用 `https://ai-router.dev`。
- 未登记 hostname（含其他 Sub2API 部署）的请求基址逐字节不变。
- 解析对无 scheme、非法 URL、非 HTTP(S)、带端口与非默认路径的输入不抛错、不误改。

### 每日签到

- 只有 origin 匹配的 Sub2API 账户成为候选；其他站点类型与其他 Sub2API 部署不产生探测请求。
- 只读探测不发送 POST；404 与 200 非 JSON 判为 absent；401/403、5xx、网络与结构不符判为 unknown。
- `enabled` 为假、`checked_today` 为真、或 `eligible` 为假时都不提交。
- 正常发奖映射为 success；`409 DAILY_CHECKIN_CLAIMED` 映射为 already_checked；`403 DAILY_CHECKIN_RESTRICTED` 映射为不可用。
- 提交不含 `X-AI-Router-Client-Fingerprint` 头，无请求体。
- 已派发但响应丢失时保留 UNCERTAIN，不重放提交；状态回读可把结果协调为已签到。
- 响应中的奖励金额、用量、邮箱、余额、邀请码与内部标记不进入账户配置、日志或 analytics。

### 对外导出

- 分域部署的账户在管理的渠道草稿、凭据资料捕获、验证资料、Cherry Studio 与 Kelivo 导出、以及运行时密钥的凭据导出出口都得到 `https://api.ai-router.dev`。
- 账户自身的 `site_url` 不变；会话读取、UI 跳转与重复账号判定仍用网页域名。
- 未登记部署与其他站点类型的导出基址逐字节不变；运行时密钥自带端点时不被改写。

### 验证证据

- 受影响的定向 Vitest 用例、`pnpm compile`、`pnpm knip`、`pnpm i18n:extract:ci`。
- 扩展内 E2E：识别与 API origin 路由、签到正常发奖、已签到不提交、响应丢失回读。

## 已知成本与边界

- **每次 HTTP 请求多一次 hostname 查表**（O(1) 对象查找 + 一次 `new URL`），只对已登记 host 生效，未登记 host 走同一条纯函数提前返回。
- **API origin 表是硬编码的部署事实。** 部署换域名或换 API 主机需要改一处常量。表在叶子模块里，不随账户数据变化。
- **签到成功 DTO 已于 2026-09-28 实测复核闭环。** 实际响应体含 `code: 0`、`checked_today: true`、`reward_amount: 1`、`balance: 2.3`、`claimed_at`，与解析器要求完全吻合，成功发奖并更新余额，无需修改解析实现。
- **不发送指纹头**，理由是站点自身在指纹不可用时也会省略它（1200ms 兜底）、实测无指纹头仍进入日期门禁。若运营方后续把它变成硬门禁，签到会以失败暴露，不会静默错判。
- **管理域（`/admin/*`）未验证。** 调查账号是普通 `user`，没有管理端凭证；本适配不改变管理渠道的 origin 解析之外的任何行为。
- **密钥管理已实测兼容。** 用真实部署走通 列表 → 创建 → 改名 → 删除（探测键删除后列表回到 `total: 0`），契约见[调查记录](research.md) §8：创建响应无嵌套 `group`（`group_name` 为空串），列表的 `ip_whitelist` 可能为 `null`；既有适配器对这两点都已容忍，不需要额外分支。
- **服务凭据导出路径未纳入。** `RuntimeKeyActionControls.buildServiceCredentialExportProfile` 也直接取 `runtimeKey.baseUrl`，但今天只有 SharedChat 实现服务凭据能力且它不是分域部署，改动的新行为无法演示，故保持原样；若将来出现分域的服务凭据站点，需要同样接上 `resolveAccountExternalApiBaseUrl`。
- **用户手写凭据资料的 baseUrl 不改写。** 从账户捕获的资料会规范化，用户手动新建/编辑的资料保留其输入（可能指向代理或自定义端点，静默改写会改变语义）。
- **本部署缺失 `/api/v1/model-plaza`**（404），模型广场价目目录将为空；`fetchSub2ApiPricingCatalogs` 已按路由单独降级，不需要额外处理。
- **`/api/v1/groups/rates` 返回空对象**，分组倍率来自 `groups/available` 的 `rate_multiplier`（既有回退逻辑已覆盖）。
- **企业域（`vip.ai-router.dev`、`vip.ai-router.site`）未验证**，未登记。

## Comments

- 2026-09-27：初版。现场证据、一次真实领取（+$1.00，余额 $0.30 → $1.30）与重复提交幂等性验证见[调查记录](research.md)。
- 2026-09-27：切片 01 交付（`6fef8df72`）。识别 hostname、API origin 解析、传输层 URL 构造、`/v1/models` 与浏览器身份校验改用解析结果；配套用例覆盖已登记/未登记/非法输入、请求 URL 与 `baseUrl` 保留、识别不触发探测。
- 2026-09-27：切片 02 交付。`ai-router:daily-checkin` 方法 + provider，按 origin 限定候选，只读探测只发 GET，提交无请求体且不带指纹头，`409 DAILY_CHECKIN_CLAIMED` 判为已签到。单测覆盖协议各分支，E2E 覆盖发奖 / 已签到不提交 / 响应丢失回读，并断言 API 未落到 dashboard origin。
- 2026-09-27：实测确认无指纹头的重复提交仍走到日期门禁（返回 409 而非拒绝），因此扩展不发送 `X-AI-Router-Client-Fingerprint`。提交成功 DTO 仍为推断，待下次实际领取复核。
- 2026-09-28：密钥管理走通真实部署的 列表 → 创建 → 改名 → 删除 往返（含删除后列表回到 `total: 0`），与既有解析器兼容，见[调查记录](research.md) §8；原先的「未验证」边界改为已实测。
- 2026-09-28：签到日界是 UTC 零点（本地 08:00）。00:06 复查仍为 `checked_today: true`、`checkin_date: 2026-09-27`，因此成功 DTO 的复核要等当天 08:00 之后；已登录会话仍在 Edge 上，可直接复现站点自身的领取并抓响应。
- 2026-09-28：补切片 03（对外导出）。审计发现凭据导出出口与 Cherry Studio / Kelivo 直连导出此前直接取账户 URL，分域部署下会把网页域名交给外部工具；已接上分域表兜底并补齐用例。顺带修正 AIHubMix 从 console origin 导出时漏用 `managedChannelOrigin` 的问题。
- 2026-09-28：收敛注册位置。原先同一部署事实在叶子表与 `identifiers.ts` 各写一份（hostname 两种写法 + API origin），靠一致性用例兜着；改为叶子模块单一声明，识别 hostname、签到 origin 门禁全部由它派生。新增「分域部署的注册位置」一节记录注册点与当前标签页取源资格的副作用。
- 2026-09-28：修回归。收敛注册位置时让 `identifiers.ts` import 了 `~/constants/deploymentApiOrigins`，而该模块是被 jiti 加载的 wxt config 依赖——`pnpm dev`/`pnpm build` 直接挂，单测与 tsc 全绿没抓到。改为部署地址只声明在叶子模块、消费者直接 import；`AI_ROUTER_ORIGINS` 移到叶子模块；`identifiers.ts` 恢复零依赖并写明原因；新增 `configLoadedModules.test.ts` 守这条约束。
- 2026-09-28：把声明提升为**元数据描述符**（`browserHostnames` / `apiOrigin` / 可选 `inferenceApiOrigin`）+ 角色化查表（Account / Inference），并让 `identifiers`、识别 hostname、签到门禁全部派生。角色机制用夹具用例验证过分叉时的行为；生产只在一个网关调用点（`/v1/models`）显式传 `Inference`，其余保持账户角色——没有真实分叉部署之前不把它铺开（理由见「两个 API 角色」）。
- 2026-09-28 16:01：次日 08:00 UTC+8 门禁后全流程实测（通过 CDP 连接真实 Edge 浏览器），成功执行一次真实发奖（`POST /api/v1/user/daily-checkin`）。捕获到实际成功 DTO：含 `code: 0`、`checked_today: true`、`reward_amount: 1`、`balance: 2.3`、`claimed_at`。实测响应结构与推断完全一致，现有解析器成功解析；重复提交返回 `409 DAILY_CHECKIN_CLAIMED`。至此「推断 DTO」这一已知成本完全闭环。
