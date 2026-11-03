# NanoGPT 账号站接入

- Status: in-progress
- Requested: 适配 https://nano-gpt.com/（用户 2026-10-25 经 /edge-browser-control 发起）
- Updated: 2026-11-03
- Base: origin/main @ a5493e91fb（2026-11-02 已 fetch，0 commits behind）

## 站点画像（实测证据见 evidence/）

NanoGPT 是托管付费聚合平台（无公开后端仓库，Next.js + Auth.js），历史探测快照为 1223 个模型，按量计费（当前数量以现场目录为准）。非 New API / Sub2API 家族：自有 REST 契约、next-auth 会话、专用 Management API。

### 域名与角色

| 域名 | 角色 | 证据 |
| --- | --- | --- |
| `nano-gpt.com` | 控制台/会话源：账号页、API key 管理 UI、Management API（`/api/management/v1`）、`/api/auth/*` 会话、`/api/invitations/create` | probe-01/05/06/08/09/10 |
| `api.nano-gpt.com` | 直连推理 API 源：`/api/v1/*` 推理端点、公开模型目录 `/api/v1/models?detailed=true`（671 模型带 USD 计价）、`/api/v1/usage`（key 级聚合）。非控制台别名，不发送 Cookie | probe-10/11, docs api-hosts |
| `docs.nano-gpt.com` | 文档（Mintlify，`/llms.txt` 有 .md 全量） | probe-03 |
| `www.nano-gpt.com` | 页面内跨源 fetch 失败，无官方引用；不注册 | probe-11 |

推理导出 base URL 用文档推荐主机：`https://api.nano-gpt.com/api/v1`（同路径亦挂载于 `nano-gpt.com/api/v1`）。

## 类型/家族决策

新增独立账号站型 `nanogpt` + 专属适配族 `NanoGPT`（仅 Account scope）。依据：自有认证（next-auth HttpOnly 会话 + 双 token 体系）、自有余额语义（USD 储值 + Nano 余额双资产）、自有 key 契约（Management API scope 化），与任一现有家族无可复用的控制台契约。先例：OpenRouter（托管平台、token 认证、公开目录、管理 API key 操作）。

## 认证决策

三类凭据（docs authentication.md + management-openapi.json，均已存 evidence）：

| 凭据 | 能力 | 生命周期 |
| --- | --- | --- |
| 控制台 Cookie（`__Secure-next-auth.session-token` HttpOnly） | 全部控制台读：local-session 余额、usage/models、邀请创建 | 浏览器会话，30 天滚动 expires |
| 推理 API key `sk-nano-<uuid>`（旧版裸 UUID） | 推理；`POST /api/check-balance`（文档 OpenAPI apiKeyAuth）；`POST /api/invitations/create`（文档：API key 或会话）；`GET /api/v1/usage`（key 级）；`GET /api/subscription/v1/usage`（订阅配额+路由建议）。**不能**调 Management API（401 invalid_management_token，实测） | 无过期默认（key 可独立 revoke；expires_at 可选） |
| Management token `sk-nano-mgmt-...` | 仅 `/api/management/v1/*`：api_keys CRUD（scope 化）+ usage:read 订阅配额；不能推理、**不返回现金余额** | 默认 90 天过期（最长 365），可撤销 |

**当前选择（2026-11-02）：双凭据、独立能力。** 管理令牌负责原生密钥管理与有权限的订阅快照，推理密钥负责余额、key 级用量与运行时调用。两者均可单独保存，也可一起保存于现有 AccessToken 账号字段的原子编码中；旧版单推理 key（含裸 UUID）无需迁移。Cookie 仍只用于识别期的会话身份，不作为保存凭据。只保存管理令牌时现金余额明确不可用，不显示或汇总为 0。OAuth PKCE 是另一种推理授权流程，本次未纳入。管理端点不提供可用于证明双凭据同属一个账号的身份，界面必须明示此限制。

身份锚点：check-balance 返回的 `nanoDepositAddress` 作为推理 key 可证实的账号身份；仅管理令牌采用本地 SHA-256 credential identity（不是上游账号或配对证明），添加推理 key 后切换到可证实的 deposit identity。Cookie 会话期身份用 `/api/auth/session` 的 user.id（UUID）与 clientSession（数字）。

## 关键契约（实测/文档）

- `GET /api/auth/session`（Cookie）→ `{user:{id UUID, name, email, clientSession}, expires, auth}`；未登录 200 空对象（Auth.js 惯例，需处理）。
- `GET /api/auth/local-session`（Cookie）→ `{data:{id, sessionUUID, usd_balance:"0.00000000"（字符串 USD）, nano_balance, usd_credits, earned, subscription, nanoDepositAddress, ...}}`。
- `POST /api/check-balance`（x-api-key / Bearer 推理 key）→ `{usd_balance:"129.46", nano_balance:"26.71", nanoDepositAddress}`（OpenAPI 实数：字符串）。
- `POST /api/invitations/create`（Cookie 或推理 key）body `{}` 或 `{type:"referralLink"}` → `{redeemCode, url:"https://nano-gpt.com/r/<code>", type, amount, currency}`；实测 `{}` 创建 0 额度邀请（probe-09，测试残留 JMTCjyaG 待清理/记录）。
- `GET api.nano-gpt.com/api/v1/models?detailed=true`（公开）→ `{object:"list", data:[{id, name, description, context_length, capabilities, pricing:{prompt, completion, cacheReadInputPer1kTokens, currency:"USD", unit:"per_million_tokens"}, ...}]}`，671 条（probe-11）。
- `GET api.nano-gpt.com/api/v1/usage`（推理 key）→ 30 天 UTC 默认窗口聚合（byDay/byModel），key 级非账号级（docs usage.md）。
- `GET /api/subscription/v1/usage`（推理 key）→ `{active, state, limits, dailyInputTokens{used,remaining,percentUsed,resetAt}, ..., routing{recommendedMode,...}}`；null=未配置，degraded=true 显示 unknown（docs）。
- Management API：`GET/POST /api/management/v1/api-keys`、`GET/PATCH/DELETE /api/management/v1/api-keys/{id}`；POST 需 `Idempotency-Key`；secret 仅创建返回；401 `invalid_management_token`、403 `insufficient_scope`（实测 401 + openapi.json）。
- 控制台原生创建 key：`POST /api/create-api-key`（Cookie）body `{name, allowed_origins:null, enableLogging, enableSupportAccess, requestResponseLoggingRetentionDays:7}` → **403 `{"error":"STEP_UP_REQUIRED"}`，需邮箱 OTP step-up**（`GET /api/auth/step-up` → `{required:true, methods:{email:"<redacted>"}}`）。自动化不可创建 key；用户手动创建后粘贴。这也佐证 Management token 才是程序化 key CRUD 的正道（其文档路径 Settings → Security → Management API tokens，同样需要控制台会话创建）。
- 错误信封（管理/订阅路径）：`{"error":{"code","message","request_id"}}`；`/api/subscription/v1/usage` 无 key 时 `{"error":{"message","type":"missing_api_key"}}`；`/api/v1/usage` 401 同型带 `code`（实测）。

## 能力处置（随实现更新）

| 范围/组 | 项 | 处置 | 方式与理由 | 缺口 | 验证 |
| --- | --- | --- | --- | --- | --- |
| shared/类型 | 类型/家族/域名 | adapted | 新类型 nanogpt + 族 NanoGPT（Account scope）；hostname 检测 nano-gpt.com；api./docs. 不入控制台别名 | 无 | registry/detection 单测 + 现场 |
| shared/认证 | 认证选择 | adapted | 双输入、任一可独立保存；管理凭据和推理凭据按主机与能力隔离；Cookie 仅识别期读会话 | 两种凭据的账号配对无法由官方接口证明 | credentials/lifecycle/management 回归 + 浏览器保存和重开闭环 |
| onboarding | 自动识别 | adapted | hostname 检测 + content-session 读 /api/auth/session 与 /api/auth/local-session，返回 key 可证实的 deposit address | 无 | 单测（现场会话报文见 probe-01/10） |
| onboarding | 凭据引导 | adapted | 固定站点 URL + nanoGptApiKey 标签与引导文案（控制台创建需邮箱 step-up，引导用户手动创建后粘贴）；8 个语言同步 | 无 | 提取完整性 + AccountDialogForm 测试 |
| onboarding | 身份校验 | adapted | check-balance 的 nanoDepositAddress 作为稳定身份；与浏览器会话当场比对，不一致即 account_identity_mismatch | 无 | 单测（含变异验证） |
| balance | 余额 | adapted | check-balance usd_balance（字符串 USD→quota）；缺失即 invalid_response，不冒充 0 | nano_balance（另一资产）v1 不展示 | 单测 + conformance |
| usage | 用量/今日统计 | partial | key 级 30 天聚合（totals.requests/totalTokens/netCostUsd）入 usage rolling_window；今日统计 unsupported（无 UTC 日边界，key 级非账号级） | 账号级/今日用量无契约 | 单测 + conformance |
| plans | 订阅配额 | partial | /api/subscription/v1/usage 的 dailyInputTokens.remaining/resetAt → remainingTokens + period day；inactive 只给 isActive:false；degraded/null 计数器保持 unknown；读取失败不影响余额 | 套餐名与图片配额未映射（契约未含可靠字段） | 单测 |
| keys | key 清单/CRUD | adapted | 复用 native key resource/editor/one-time secret；numeric ID、全部原生限额、到期和 ZDR 策略；部分 PATCH + 权威回读；POST 一次性明文，未知写入不重放 | 无真实管理令牌，真实站点 CRUD 未验证 | management/nanogptKeys 契约测试 + mocked browser lifecycle |
| models | 模型目录 | adapted | provider-catalog：公开 /api/v1/models?detailed=true（671 条），source.supportsRuntimeModelList:false 如实声明非 key 级可见性 | 无 | 单测 + conformance 路由 |
| pricing | 模型价格 | adapted | pricing.prompt/completion USD per_million_tokens → token_price_usd_per_million + pricingPlan(per 1e6)；cache*Per1kTokens ×1000（对 openai/anthropic/google 三家公布费率验证）；video_request → videoInput selection 规则；varies_by_modality 行给 official-price-missing，不编 0 | 无 | 单测（含变异验证） |
| invite | 邀请链接 | deferred | 控制台无读取契约：/api/invitations/create 仅 POST（GET 405），其余 list 路径 404，表格为服务端渲染；每次调用铸造新码且无删除入口，映射到"复制邀请链接"会累积不可撤销记录 | 站点不提供只读 referral link 端点 | probe-17（只读 GET 实测） |
| notices | 公告 | N/A | 站点无账号公告功能（仅公开 Blog / /api/updates） | — | 导航勘察 |
| redeem | 兑换 | deferred v1 | /invitations 有 Redeem 流；新流程 + 不可逆写，后续任务 | 端点未勘察 | 未实现 |
| checkin | 签到 | N/A | 站点无签到功能 | — | 导航勘察 |
| docs | 目录同步 | adapted | supported-sites.md ×3 + README ×3 增行（unranked 末尾）+ site-integrations.md 关系表加行 | — | publicCatalogOrder 测试 + 评审 |
| shared/UI | Key Management 呈现 | adapted | NanoGPT 原生 editor 与密钥详情，沿用共享表格、确认删除与一次性密钥对话框 | 新面板无旧版可比基线 | mocked browser screenshot + 原生 presentation 回归 |

## 测试残留记录

- probe-09 在真实账号创建了 1 枚 0 额度邀请 `JMTCjyaG`（https://nano-gpt.com/r/JMTCjyaG）。0 资金、可忽略；清理尝试与结果记录于 evidence/cleanup.md。
- probe-15 复测控制台 Create 行为时又产生 1 枚同型邀请 `eBmpmDQ9`。该次点击由探测脚本触发（非无人值守），需求语义本就是"复制邀请链接"，但计划指示只读验证；残留影响同为零资金、未兑换。两枚均无撤销入口，记录于 evidence/cleanup.md。

## 实现清单（完成情况）

1. ✅ `identifiers.ts`：SITE_TYPES.NANOGPT、NANOGPT_HOSTNAMES/WEB_ORIGIN/API_ORIGIN/INFERENCE_BASE_URL/DISPLAY_NAME
2. ✅ `contracts.ts`：ACCOUNT_SITE_ADAPTER_FAMILIES.NanoGPT；accountForm 的 token 文案键扩为有限联合类型
3. ✅ `definitions.ts`：账号定义（AccessToken-only、routes、urls、modelList NOT_APPLICABLE、metrics unsupported、identity userIdRequired:false）
4. ✅ `apiService/nanogpt/`：constants / transport（Bearer + credentials:"omit"）/ responseError（四种错误信封）/ parsing（余额、usage、订阅）/ catalog（detailed 目录）/ index（fetchUserInfo、fetchAccountData）
5. ✅ `apiAdapters/nanogpt/`：index（bootstrap/completion/data/refresh/providerModelCatalog）+ accountCompletion（含跨账号拒绝）+ modelPresentation（pricing → 共享计价 seams）
6. ✅ `accountSiteOnboarding/contentSession/nanogpt.ts` + browserIdentity + registry 双注册
7. ✅ `apiAdapters/registry.ts` 注册；`keyResourcePresentationPolicy` 增 generic 条目
8. ✅ 测试 4 文件 43 例：service 契约/信封/单位、extractor+identity、catalog 映射与 capability、lifecycle（注册/检测/bootstrap/completion 3 条失败路径）
9. ✅ 文档：supported-sites ×3、README ×3、site-integrations 关系表
10. ✅ 验证：`tsc --noEmit` 干净；相关套件 203 文件 / 3789 例全过；`i18n:extract --dry-run --ci` 无改动；`pnpm build` 通过

## 初版验证与剩余风险（历史记录，当前增量见下文）

- **变异验证**（确认测试真的在守行为）：把 `credentials:"omit"` 改回 `include`、把 cache 单位换算去掉、把跨账号比对短路，三处各自击穿对应用例。
- **Live E2E 未做**：计划要求的 live-extension CDP 现场运行未执行。缺口是**没有可用的 NanoGPT 推理 key**（控制台创建被邮箱 step-up 拦截，扩展无权代发）；能提供的现场证据只有真实浏览器会话下的只读探测（probe-01/10/11/16/17）与公开目录实测。因此 balance/usage/订阅的**线上**响应形态按官方 OpenAPI 与文档断言，未用真实 key 回读。
- **可用性说明**：用户首次添加时需要自己在 nano-gpt.com/api 创建 key 并粘贴（引导文案已指向该页）。这是站点侧的安全机制，不是适配缺口。

## 证据索引（仅 spec 入库）

`evidence/` 已被 `.gitignore` 忽略：原始捕获含真实账号邮箱/用户名、Nano 充值地址，以及 Playwright 连接器的 `token=` 查询参数，属于不可入库的私密数据。需要复现时按下列命令重跑，或按 cleanup.md 的说明处理残留。

| 文件 | 内容 | 复现方式 |
| --- | --- | --- |
| probe-01/05/08/10 | 控制台会话与账号路由（session、local-session、pricing/context、invitations 页面请求） | 在已登录 nano-gpt.com 的标签页记录 `/api/*` 响应 |
| probe-02/03/04 | 官方文档 markdown（endpoints、authentication、api-hosts） | `curl https://docs.nano-gpt.com/llms.txt` 后取 `.md` 页面 |
| probe-06/07/12/13/14 | 控制台建 key 流程与 `STEP_UP_REQUIRED` 403 | 打开 /api 页 → Create New API Key → 观察 `/api/create-api-key` |
| probe-09/15 | `POST /api/invitations/create` 真实创建（两枚 0 额度残留，见 cleanup.md） | 不重复执行；结论已记录 |
| probe-11/16 | 公开 detailed 目录（671 条，含 pricing 字段与 cache*Per1kTokens 单位样本） | `curl 'https://api.nano-gpt.com/api/v1/models?detailed=true'` |
| probe-17 | 邀请读取路径全 404 / create 仅 POST（405）——invite 延期的依据 | 已登录标签页内对候选路径发 GET |
| management-openapi.json / management-api-full.txt | Management API 全量契约（key CRUD、scope、Idempotency-Key） | 文档站 `/api-reference/openapi.json` |


## 2026-11-02 新标准复核与改进

### 本次范围与设计

当前基线为 `97275cc684`，`git fetch origin main` 后确认 feature 分支 4 ahead / 0 behind。
复用当前账号适配与公开目录契约；本次不扩展管理令牌体系、原生 key CRUD、邀请铸造、兑换或付费推理。
NanoGPT 为闭源托管平台，选择部署会话 + 站点 CDP + 受控扩展 E2E；不以其他 New API 自托管测试代替本部署验收。

复用/扩展选择：注册既有 `AccessTokenVerificationGuide` 与 `AccessToken` 路由，提供站点文案和原生 `/api` 入口；不另建 NanoGPT 引导组件。
共享表单接受上层已呈现完整引导这一事实，避免重复说明。CDP 复用 exact-worktree connection、local-env、live-suites、UI capture、detection assertions、model-catalog、account sandbox 和 UI-created account cleanup；站点保留自己的身份和协议断言。

### 正常识别的预期结果

| 场景 | 已填字段 / 缺失字段 | 下一步 / 保存资格 | 验收分类 |
| --- | --- | --- | --- |
| 已登录控制台、无已保存 key | type=`nanogpt`；URL=`https://nano-gpt.com`；用户名及 Nano 充值地址来自当前会话；汇率=`7.2`；推理 key 空 | 明确推理 key 而非管理令牌；打开 `/api`；回到原草稿粘贴；key 空时不提供保存 | live detection + 受控 E2E |
| 用户补入该账号推理 key | 保留身份/汇率/名称，验证 Bearer-only 响应身份 | 在原自动识别草稿保存、重开、刷新；禁止账号注入或 Manual Add 替代 | 受控 E2E；live 缺 key |
| key 换成其他账号 | 响应的充值地址不匹配保存身份 | 保存前拒绝错误身份、保留原草稿供修正；刷新拒绝覆盖已验证余额/身份并显示异常健康状态（同步时间记录尝试，不承诺保留） | adapter 回归 + 受控 E2E |
| 公共目录 | 本地临时账号只是数据源选择 fixture；目录走真实无凭据公开接口 | 明示 provider catalog；展示原生价格；无付费验证 | live public catalog fixture |

### 行为变化与检查入口

| 行为 | Before | After / 比较结果 | 自动断言 / 证据 |
| --- | --- | --- | --- |
| 缺 key 后继续填写 | 默认汇率未进入 recovery，粘贴 key 后仍无保存按钮 | 静态 bootstrap facts 在凭据检查前进入草稿；能在同一草稿继续，improved | `nanogptLifecycle.test.ts` usable onboarding defaults；`e2e/nanogptOnboarding.spec.ts` 两个正常入口场景 |
| 获取凭据引导 | 泛化为账号管理 token、没有跳转按钮，且与下方推理 key 提示重复 | 单一 NanoGPT 推理 key 引导、可点击原生 `/api`、保留草稿，improved | `AccountDialogWarnings.test.tsx`、`AccountDialogForm.test.tsx`、`e2e:cdp:nanogpt -- --isolate --suite=detection` |
| 失败凭据的披露 | 通用模式可识别 `sk-`，但 provider 若回显旧版裸 UUID，会进入错误反馈 | 在持有 exact key 的 NanoGPT transport 构造 ApiError 前调用既有脱敏 helper；覆盖 completion/admission/refresh 的同一响应入口 | `nanogptLifecycle.test.ts` legacy UUID provider-echo 红绿回归；API 与 lifecycle 32 项通过 |
| 保存凭据身份 | UI 使用 configuration-first 保存，原先没有 provider admission | 复用 `AccountPersistenceCapability`，新增/换 key 先验证真实身份；key-only 手动添加从 key 得出地址；未改 key 的编辑不重复联网 | `nanogptLifecycle.test.ts` prepareIdentity 回归；受控 E2E 错误 key 保存拒绝后在同一草稿修正 |
| 保存失败后的恢复 | 账号对话框容器在校验异常时直接关闭并丢掉草稿 | 保存工作流负责错误反馈；容器保留 add/edit 草稿和 pending result，用户修正后可保存 | `DialogStateContext.sponsorPrefill.test.tsx` add/edit 红绿回归；受控 E2E 同一草稿 retry |
| 刷新身份保护 | `fetchUserInfo` 校验，但 `fetchAccountData` 可接受另一个账号的 key | 校验归于余额读取共享入口，保存/刷新同受保护，improved | `nanogptLifecycle.test.ts` refresh identity；受控 E2E mismatched refresh |
| 真零余额 / 周配额 | 单元契约已有，最终表单和账号卡尚无本分支 E2E | 保存是配置优先，并由既有后台 post-save refresh 读取数据；受控 E2E 另外显式刷新确认 USD 12.5、周余量 70，再刷新到 USD 0；不把初始乐观 0 当真实余额，不把 used 当 remaining | `e2e/nanogptOnboarding.spec.ts` zero-balance refresh |
| runner 完整性 | 无站点 runner，旧 spec 不能重跑 add/save/refresh | `all` 必含 probe/catalog/detection/onboarding；blocked 必非零；失败/清理错误保留且 CDP/key 值脱敏 | `nanogptRunner.test.ts`、`nanogptProbe.test.ts`；`scripts/test-nanogpt-e2e-live.mjs --help` |

### 金额和能力边界（不得作为完全适配的声明）

| 原生金额 / 来源 | 本分支表示和政策 | 验证 / 剩余缺口 |
| --- | --- | --- |
| USD 服务余额 `check-balance.usd_balance`，账号作用域 | `12.5 USD -> quota 6,250,000`；保持 legacy monetary consumers 可用，不添加会禁用这些消费者的 `nativeBalance` | 文档/契约 + 受控 UI；缺真实推理 key 的现场回读 |
| Nano 原生资产 `nano_balance` | parser 保留，不与 USD 相加、不假定汇率 | 账号卡尚无双资产呈现；属于既有 partial，不能声称完整原生余额 parity |
| 订阅 daily/weekly input-token allowances | 独立 resetting quota，不进入现金总额；日优先、无日则展示周余量 | 周 fallback 和 inactive/null 已有单测；受控卡验证周余量；同时配置日/周时共享单一 summary 未同时展示两种限制，仍 partial |
| usage 30 天默认 UTC key scope | rolling-window usage；today stats 明确 unsupported | 文档/契约；缺真实 key 的现场 scope/readback |
| key CRUD / invite / redeem | 保持原处置：推理 key 不拥有管理通道，邀请创建不是只读复制 | 未新增这些动作，也未创建任何远端资源；不以跳转原生页当作编辑/创建 parity |

### CDP 生命周期补充

共享 `scripts/cdp/reload.mjs` 仍只重载精确目标扩展一次，先等旧 worker 退出，再核验新 worker 身份和后台只读 action。真实 dev/HMR 会在最后的只读 readiness 查询前再次导航 Options 文档；新增仅对此 `Execution context was destroyed` 的一次有界重试，等待 DOM ready 后重发只读查询，绝不重放 reload 或业务写。对应两条红绿回归包含持续销毁时失败；本地 `evidence/cdp-reload-final.txt` 记录真实目标重载成功。

### 复现与证据保留

- 启动：`pnpm dev`，然后 `pnpm browser:cdp:isolate -- --dev`；本次 dev server `127.0.0.1:3001`，CDP `127.0.0.1:9332`，exact build `.output/chrome-mv3-dev`，扩展 `ecbgeameikdkdaabakealmmciecgeadm`。
- `pnpm e2e:cdp:nanogpt -- --isolate --suite=all`：真实登录会话检测与公开目录；缺 key 的 probe/onboarding 保持 blocked，退出非零。
- 只跑可完成的现场层：`--suite=detection` 或 `--suite=catalog`；这不是 all 验收。
- 现场完整链路使用已有 `NANOGPT_API_KEY` 或 `NANOGPT_API_KEY_FILE`；可用 `NANOGPT_USER_ID` 固定控制台 UUID。通过共享 env loader 获取配置，不复制主 worktree 的凭据，不从 CLI 参数传 key。
- 受控 E2E：`pnpm exec playwright test e2e/nanogptOnboarding.spec.ts --project=chromium --workers=1`。所有站点 HTTP 均为已说明的 fixture，无远端写入。
- 相关测试、类型和未使用分析的最终实际结果补录于本地验收记录。远端 PR/CI 不在本次授权范围。
- 本地保留：`evidence/cdp-1793621262491/`（引导修改前 baseline / 首次断言失败）；`evidence/cdp-final/aah-cdp-suites-t0UXGo/report.json`（最终现场：目录/检测 passed，key 两项 blocked，退出 1）；`evidence/visual-comparison/run-v4z1zn/`（before/after）；`evidence/e2e-first-failure/`（发现缺汇率阻断的两次 E2E 失败）。这些不是可发布素材。
- 会话复用：核验日用 Edge Profile 2 的原生身份，使用桥接可用的 origin-scoped cookies 传入本次隔离 profile，回读确认 UUID 一致；未关闭日用浏览器或复制完整 profile。临时会话源/目标备份留在 `evidence/session-*.json`，仅本地排查；不能入库或发到外部。
- Git 保留本 spec、测试与维护 runner；raw 截图、协议响应、会话材料和失败输出全部 local-only，后续在缺 key 验收完成前仍需要保留。不删除其他任务材料。

### 验收记录（本次，不替代前次/CI）

- 初始分支 `97275cc68474e76223fe114a09b40e2a9dea2623`；fetch 后相对 `origin/main` 为 ahead 4 / behind 0；初始 index/tree clean。Task-owned diff、维护 runner 和测试进入本地提交，不 push。
- 最终现场报告明确 all=四个 suite：目录与真实控制台检测/原草稿 `/api` 跳转通过；公开 raw probe 成功但其私有余额/usage/subscription 部分缺 key；完整 onboarding 缺 key，故 all 为 incomplete、退出 1。
- `evidence/e2e-key-mismatch-draft-failure/` 保留错误 key 被拒后原对话框消失的真实 red；对应容器 add/edit 两项 unit red 后修复。之前缺汇率和 configuration-first 断言错误的输出也保留，不当作已通过。
- 最终受控 E2E、related Vitest、compile、ESLint、knip 和独立复核的实际结果索引为 [`evidence/acceptance.md`](evidence/acceptance.md)。现场真实 key 的缺口和既有双资产/双周期 partial 明确保留；本次只能声明所列改进和可执行验证，不声明 NanoGPT 全部原生能力已经对标完成。


## 2026-11-02 双凭据增量验收

### 契约与边界

复核官方 `authentication.md`、`api-reference/management-api.md` 和 `management-openapi.json`（版本 2026-09-09-beta）。管理 API 根路径 `https://nano-gpt.com/api/management/v1`；推理 API 根路径仍为 `https://api.nano-gpt.com/api/v1`。`api_keys:write` 包含 key read，不包含 `usage:read`。usage 被 403 拒绝时可用 key inventory 验证令牌；401 不回退。密钥创建要求 Idempotency-Key，重试不会由扩展自动发起。

| 行为变化 | 代码所有者 | 回归/证据 |
| --- | --- | --- |
| 原子双凭据、输入中间态不串角色、旧单 key 兼容、主机隔离 | nanogpt/credentials + transport | credentials.test.ts；management.test.ts |
| 管理令牌单独保存/订阅快照、可用范围降级、失效与权限拒绝区分 | nanogpt/accountPersistence + accountCompletion + managementIdentity | nanogptLifecycle.test.ts；management.test.ts；nanoGptManagement.spec.ts |
| 逐条用量历史明确不支持，不回落 New API 日志请求 | nanogpt capability + history sync | usageHistory/sync.test.ts；默认 browser post-save refresh |
| 无现金读取能力不是 0，存储/显示/汇总/历史不造数 | accountDataModel + monetaryBalancePolicy | accountStorage.test.ts；BalanceDisplay.test.tsx；capture.test.ts |
| 保存的推理 key 独立运行时可用，原生 inventory 无管理凭据时不阻断它 | nanogpt/serviceCredential + apiServiceRequest | nanogptLifecycle.test.ts；apiServiceRequest.test.ts |
| 原生清单、详情、12 种限额、到期与 ZDR；零/无限额/遗留 unset；局部 PATCH、回读与删除 | nanogpt/keyResources + keyEditor + management | nanogptKeys.test.ts；management.test.ts；nanoGptManagement.spec.ts |
| 创建仅一次性明文，隐藏 inventory 中意外 plaintext；未知创建/回读失败不重放 | native resource mutation + NanoGPT adapter | nanogptKeys.test.ts；management.test.ts；nanoGptManagement.spec.ts |
| 两种输入、精简识别引导、scope/有效期/配对限制；8 语言 | NanoGptCredentialGuide + native presentation | AccountDialogForm.test.tsx；nanoGptManagement.spec.ts；live detection |

### 验证记录与私密证据

2026-11-03 密钥弹窗修正：已保存的推理 API 密钥与管理列表独立读取；缺少管理令牌只显示普通配置说明，不阻断复制和导出，也不将未加载的站点清单判为空。NanoGPT [官方支持页](https://nano-gpt.com/support) 明确已有 API key 可再次显示/复制，可能要求通过该账号原有的邮箱验证码、Google/GitHub、密码或通行密钥登录。因此管理清单和创建结果使用 `website-verification` 可查看策略，提示前往站点验证；管理 API 不提供明文与站点不能再次查看是两种不同事实。扩展不代替用户完成站点验证。复用现有 service credential runtime key、native resource presentation 和 Alert；证据与验证结果见 `evidence/key-dialog-20261103/acceptance.md`。

当前基线从 `recovery/nanogpt-before-dual-20261102` 安全刷新到 origin/main `a13da96b2e`，5 个旧提交 range-diff 一致，增量开始于 `a8e81de447`。没有发布或推送。

最终命令、结果与截图位于忽略的 `evidence/dual-credentials/acceptance.md`（填写实跑结果，不复用失效 build）。TDD 的失败输出与修复后输出分开保留在该目录；Playwright 陈旧构建失败亦保留，重新构建后再验证。现有 `diagnosis-20261102` 是本次修改前的真实识别界面证据。

**真实凭据限制：** 本账号暂没有可用的推理 key 或管理令牌；双凭据保存、原生 CRUD 及一次性秘密的完整浏览器闭环使用隔离 fixture，不代表真实 NanoGPT 管理 API 实测通过。真实可执行的是已登录控制台的自动识别、草稿恢复与凭据引导，不代发新凭据，不触发真实密钥写入。

## 2026-11-03 当前标签页识别与扩展重载回归

- `pnpm e2e:cdp:nanogpt -- --isolate --suite=current-tab` 验证全新添加账号表单的当前站点默认值、原生身份、空凭据引导及 `current_tab` 来源，依次覆盖新网页、扩展重载后的旧网页、网页刷新后重试。默认 `all` 包含该场景；原有 `detection` 仍验证 Options 入口。
- 正式构建的旧标签页会失去内容脚本接收端。原实现尝试临时页面降级；在该降级不可用时才返回刷新提示。开发版 WXT 会重新挂载内容脚本，因此开发版的重载通过不能单独证明正式版旧标签页恢复。
- 明确的 `detect_account` 用户操作现在可以在接收端不存在时重新注入已注册的内容脚本，且仅重读一次。注入前核对实时标签页的目标 origin；恢复读取通过既有内容侧 origin 校验避免换站后的身份读取。权限拒绝、仍无接收端保留降级，恢复后无会话采用身份引导，被动读取保持原行为。
- 错误分类不再因普通错误包含 `content script` 而覆盖 403 / 网络原因；连接失败提示同步八种应用语言，不推断网页是否早于安装或更新打开。
- 受控浏览器回归位于 `e2e/currentTabAutoDetection.spec.ts`，断言旧网页的未保存草稿保留、成功恢复不再打开临时页面、未登录采用身份引导。原生 CDP 仍不创建远端凭据。
- 原有 `e2e/nanogptOnboarding.spec.ts` 仍断言双凭据改动前的旧标题；本次按现有产品契约修正为 `Complete NanoGPT credentials`，严格保留身份、空凭据、单次引导、保存和刷新断言，两条完整闭环通过。
- 原用户的浏览器和出错网址尚未提供，持续刷新提示的同一现场原因未确认。详细验收和保留的失败、截图、报告在忽略目录 `evidence/current-tab-recovery/acceptance.md`；证据保持本地，维护脚本、回归测试和这份范围说明保留在 Git。
