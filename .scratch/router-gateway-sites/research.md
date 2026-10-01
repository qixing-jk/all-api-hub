# OmniRoute / 9router 上游契约现场记录

采集时间：2026-09-28（源码），2026-09-29 补实测（见文末「实测结果」）。源码部分是浅克隆（`--depth 1`）后本地阅读；契约结论凡有实测的都以后者为准。

## 采样对象

| 项目 | 仓库 | 默认分支 | 语言 | 版本线索 | 最近推送 |
| --- | --- | --- | --- | --- | --- |
| 9router | `github.com/decolua/9router` | `master` | JS | npm `9router` | 2026-09-26 |
| OmniRoute | `github.com/diegosouzapw/OmniRoute` | `release/v3.8.51` | TS | `docs/guides/MANAGEMENT-AUTH.md` 标 v3.8.50 (2026-09-22) | 2026-09-27 |

两者都是 Next.js App Router、自托管、MIT、默认端口 **20128**（9router README「Dashboard opens at `http://localhost:20128`」；OmniRoute `docker-compose.yml` `DASHBOARD_PORT=${DASHBOARD_PORT:-20128}`）。两者都提供 npm 与 Docker 发行，OmniRoute 另有 Electron 桌面版与 PWA。

**血统**：OmniRoute 是 9router 的 TypeScript fork。9router README「🔀 Forks」段写明「**[OmniRoute](https://github.com/diegosouzapw/OmniRoute)** — A full-featured TypeScript fork of 9Router」；OmniRoute README 致谢段写「It started as a fork of **[9router](https://github.com/decolua/9router)** and a TypeScript port of the Go project **[CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)**」。两者共享 `open-sse/`、`src/sse/`、`src/mitm/`、`/api/cli-tools/*`、`/api/oauth/*` 等目录与路由名。

注意 AAH 已支持 CLIProxyAPI（`src/services/apiAdapters/managedSites/cliProxyApi.ts`），但那套契约是 `/v0/management` + `X-Management-Key` + YAML kind 资源，与这两个项目的 Next.js REST + cookie/bearer 契约**不通用**，不能当别名处理。

## 9router

### 鉴权

- 面板密码存 `settings.password`（bcrypt）；未设置时回落到 `INITIAL_PASSWORD` 或硬编码 `"123456"`（`src/app/api/auth/login/route.js`）。
- `POST /api/auth/login {password}` 成功时 `Set-Cookie: auth_token=<HS256 JWT>`，`httpOnly`、`sameSite=lax`、24h、`secure` 视 `x-forwarded-proto` 或 `AUTH_COOKIE_SECURE`（`src/lib/auth/dashboardSession.js`）。
- 全新安装 + 默认密码 + 非 loopback 请求：**拒绝签发 cookie**，返回 403 `mustChangePassword`。原因写在源码注释里（CVE-2026-56679 类：默认密码签发的 JWT 可被用来 PATCH `/api/settings` 关掉鉴权）。判定用 `isLocalRequest(request)`（loopback peer + loopback Origin）。
- 登录有按 IP 的失败限流与锁定（`src/lib/auth/loginLimiter.js`），失败响应带 `remainingBeforeLock` / `retryAfter`。
- `src/dashboardGuard.js` 的 `proxy()` 对 `/api/*` **默认拒绝**，白名单放行：
  - `PUBLIC_API_PATHS`（精确或前缀）：`/api/health`、`/api/init`、`/api/locale`、`/api/auth/{login,logout,status,oidc,saml}`、`/api/version`、`/api/settings/require-login`。
  - `PUBLIC_PREFIXES`（LLM 面）：`/v1`、`/v1beta`、`/api/v1`、`/api/v1beta`、`/codex`、`/responses`。
  - `PROTECTED_API_PATHS`（在 `settings.requireLogin === false` 时免鉴权）：含 `/api/providers`、`/api/keys`、`/api/provider-nodes`、`/api/models`、`/api/usage`、`/api/combos`、`/api/tags` 等。
  - `ALWAYS_PROTECTED` 不受 `requireLogin` 影响：`/api/shutdown`、`/api/settings/database`、`/api/version/{shutdown,update}`、若干 `auto-import`。
  - `LOCAL_ONLY_PATHS` 另需 loopback：`/api/mcp/*`、`/api/tunnel/*`、`/api/headroom/{start,stop,proxy}` 等。
- 另有一条 CLI 通道：请求头 `x-9r-cli-token`，值 = `SHA256(machineId文件内容 + 随机 salt)` 取前 16 位，salt 是 `DATA_DIR/auth/cli-secret`（`src/shared/utils/machineId.js`、`src/dashboardGuard.js`）。**同机专用**，远端扩展无法推导，不可用作集成凭据。

### 渠道（= provider connection）

- `GET /api/providers` → `{ connections: [...] }`；响应里 `apiKey` / `accessToken` / `refreshToken` / `idToken` 被显式置为 `undefined`，`providerSpecificData` 保留（`src/app/api/providers/route.js`）。
- `POST /api/providers` 建连接（`provider`、`name`/`displayName`、`apiKey`、`priority`、`globalPriority`、`defaultModel`、`proxyPoolId`、`connectionProxy*`）；名称冲突返回 409 `PROVIDER_NAME_CONFLICT`（除非传 `id` 或 `allowOverwrite`，见 #4311 注释）。
- `GET/PUT/DELETE /api/providers/[id]`：PUT 只接受 `name/priority/globalPriority/defaultModel/isActive/apiKey/testStatus/lastError/providerSpecificData`，且 `apiKey` 仅在 `existing.authType === "apikey"` 时生效；`providerSpecificData` 与已有值合并而非替换。
- **渠道身份有两类**：
  1. 内置 provider id —— 来自 `src/shared/constants/providers.js` 的 `AI_PROVIDERS`（约 40+ 个聚合自 `APIKEY_PROVIDERS`/`FREE_PROVIDERS`/`FREE_TIER_PROVIDERS`/`OAUTH_PROVIDERS`/`WEB_COOKIE_PROVIDERS`），baseUrl 由 open-sse 常量决定，连接只存密钥。
  2. **provider node** —— `POST /api/provider-nodes { name, prefix, apiType: "chat"|"responses", baseUrl, type }` 生成 id `${OPENAI_COMPATIBLE_PREFIX}${apiType}-${generateId()}`（`OPENAI_COMPATIBLE_PREFIX = "openai-compatible-"`），另有 anthropic-compatible、custom-embedding 前缀。连接建的时候把节点的 `prefix/apiType/baseUrl/nodeName` **快照**进 `providerSpecificData`。
  - 也就是说：把任意中转 URL 接进 9router 是「先建 node、再建 connection」两步。
- `GET /api/providers/[id]/models` 取单个连接的模型（会按 provider 分支向 Gemini CLI / Codex 等上游拉取）。
- `GET /api/providers/client` 是另一份**白名单化**的读投影（`SAFE_FIELDS` + `SAFE_PSD_FIELDS`，含 `baseUrl`、`azureEndpoint`、`region` 等，分页 `limit/offset` 上限 500），并对长名字打码。

### 网关密钥（客户端用的 API key）

- `GET /api/keys` → `{ keys: [{ id, key, name, machineId, isActive, createdAt }] }`，**明文，无掩码、无 reveal 端点**（`src/lib/db/repos/apiKeysRepo.js` 的 `rowToKey`）。
- `POST /api/keys {name}` → 201 `{ key, name, id, machineId }`；密钥由 `generateApiKeyWithMachine(machineId)` 生成，**绑本机 machineId**。
- `PUT /api/keys/[id]` 只接受 `isActive`；`DELETE /api/keys/[id]`。
- 面板位置：`/dashboard/endpoint`。

### 其它

- 模型目录：`GET /api/models` → 每项 `{ provider, model, fullModel, routedModel, alias, caps{vision,search,reasoning,contextWindow,maxOutput} }`，按 disabled 列表过滤并附加 custom models。
- 用量：`/api/usage/{stats,logs,chart,history,providers,request-logs,request-details,stream}`。
- 面板渠道位置：`/dashboard/providers`。

## OmniRoute

### 鉴权（`docs/guides/MANAGEMENT-AUTH.md` v3.8.50，权威实现 `src/lib/api/requireManagementAuth.ts`）

四类凭据，不可互换：

| 凭据 | 形态 | 来源 | 管理能力 |
| --- | --- | --- | --- |
| 面板 JWT | `auth_token` cookie | `/api/auth/login` | 全量，但受 CSRF / 本机性 / always-protected 规则约束 |
| CLI machine-id token | 内部 | 同机 `omniroute` CLI | 仅本机 |
| 作用域访问令牌 | `oma_live_…`（代码里的前缀常量是 `oma_`，`src/server/authz/accessTokenAuth.ts`） | **Settings → Access Tokens** 或 `omniroute connect` | 需满足路由要求的 `read`/`write`/`admin` |
| 推理 API key | `sk-…` | API Keys 页 | 默认无；元数据带 `manage`/`admin` 才有 |

- 作用域判定 `src/server/authz/accessScopes.ts`：按方法推断（GET/HEAD/OPTIONS → `read`，其余 → `write`），两处 admin 覆盖：`ADMIN_SCOPE_PREFIXES = ["/api/cli/tokens","/api/oauth","/api/auth","/api/policy","/api/services","/api/mcp"]`（任意方法都要 admin）、`ADMIN_MUTATION_PREFIXES = ["/api/providers","/api/cli-tools/apply"]`（仅写操作要 admin）。
  → **渠道写入要 `admin`；密钥写入只要 `write`；读只要 `read`。**
- 作用域不足返回 403，消息 `Access token scope '<have>' is insufficient; '<need>' required.`；令牌无效/过期 401；鉴权后端异常 503。
- **`POST /api/cli/connect` 是公开路由**，用面板密码换一个 `oma_` 令牌（`{password, name?, scope?, expiresInDays?}`，默认 `scope: "admin"`），明文令牌只返回一次，成功响应体是 `{ success, token, id, name, scope, expiresAt }`；自带密码校验 + 暴力破解锁定；密码仍是众所周知的默认值且来源非 loopback 时 403 拒绝（注释指向 #14486 / #13679）。
- 公开路由白名单在 `src/shared/constants/publicApiRoutes.ts`，精确匹配：`/api/auth/login`、`/api/auth/logout`、`/api/auth/status`、`/api/init`、`/api/sync/bundle`、`/api/cli/connect`、`/api/usage/om-usage`、`/api/skills/collect/chaos`；只读公开 `/api/health`、`/api/health/ping`、`/api/settings/require-login`。其余 `/api/*` 全部 `MANAGEMENT`。

### CSRF 与 CORS（`src/server/authz/pipeline.ts`）

- 非安全方法 + `./api/` 前缀 + 鉴权主体是 **`dashboard_session`** 时，要求同源（`validateBrowserMutationOrigin`）或合法面板 CSRF 令牌，否则拒绝（文案「Invalid request origin. Same-origin dashboard writes must include a valid dashboard CSRF token.」）。
- **用 `oma_` 令牌或 manage 作用域 API key 鉴权的写操作不走这条检查**（条件里写死了 `outcome.subject.kind === "dashboard_session"`）。
- CORS 只在 `CLIENT_API`（`/v1`、`/v1beta`、codex/responses 别名）与只读公开路由上放宽；`MANAGEMENT` 响应不回显外部 Origin。

### 渠道

- `GET /api/providers`（分页 `limit/offset`，带 `provider` 过滤）→ `apiKey` 在 `isApiKeyRevealEnabled()` 为假时用 `maskStoredApiKey` 打码（`前8****后4`）；`providerSpecificData` 经 `sanitizeProviderSpecificDataForResponse` 处理，但**该函数是凭据黑名单而非字段白名单**（`src/lib/providers/requestDefaults.ts`：逐项 `delete accessToken/refreshToken/idToken/apiKey/secretAccessKey/*Cookie/codexFingerprintSeed` 等后返回其余全部），所以 `baseUrl`、`prefix`、`apiType`、`nodeName` 在列表响应里**保留**。默认不返回渠道密钥明文。
- `POST /api/providers`（Zod `createProviderSchema`）、`PATCH/DELETE /api/providers/{id}`。
- 另有两条批量入口：`POST /api/providers/bulk`（同一 provider、多把 key，逐条独立成败，恒 200）、`POST /api/providers/import`（行式导入，**每行可带自己的 `baseUrl` 覆盖**；compatible provider 仍要先有 node）。
- provider node 与 9router 同构：`/api/provider-nodes` GET/POST，`/api/provider-nodes/{id}` PATCH/DELETE，`/api/provider-nodes/validate`。
- `/api/providers/{id}/test`、`/api/providers/{id}/models`、`/api/providers/test-batch`、`/api/providers/validate`。
- 面板渠道位置：`/dashboard/providers`。

### 网关密钥

- `GET /api/keys` → `{ keys: [打码后的 key...], total, allowKeyReveal }`，分页；`isApiKeyRevealEnabled()` 读 `ALLOW_API_KEY_REVEAL` 环境变量或特性开关。
- `POST /api/keys` 走 Zod `createKeySchema`，**必填字段是 `name`**（不是 OpenAPI 里写的 `label`），可选 `modelAccessMode`、`allowedModels`、`allowedCombos`、`allowedConnections`、`scopes`、`noLog`、`allowUsageCommand`、`usageLimitEnabled`、`dailyUsageLimitUsd`、`weeklyUsageLimitUsd`、`chaosModeEnabled`、`expiresAt`。
- `/api/keys/{id}` GET/PATCH/DELETE；`/api/keys/{id}/reveal` 是唯一取明文的地方，`ALLOW_API_KEY_REVEAL` 关闭时 403；另有 `/regenerate`、`/groups`、`/devices`、`/usage-limits`。
- 面板位置：`/dashboard/api-manager`（另有 `/dashboard/tokens`）。

### 其它

- 模型：`/api/models`、`/api/models/alias`、`/api/models/custom`、`/api/models/catalog`、`/api/models/disabled`、`/api/provider-models`。
- `docs/openapi.yaml` 有 703 个 path，但**与实现存在漂移**：`/api/keys` POST 的 requestBody 写 `required: [label]`，而实现要 `name`；`ProviderConnectionCreate` 写 `required: [provider, url]` 并含 `url` 字段，而实现要 `apiKey` 且用 `providerSpecificData` 承载 baseUrl。**以路由处理函数为准**。
- 桌面/内嵌服务面（`/api/headroom`、`/api/mcp`、`/api/tunnel`、`/api/cloud/*`）对集成无意义，不涉及。

## 两个项目对 AAH 的共同约束

1. **都拿不到渠道密钥明文**。9router 在列表与详情里把 `apiKey` 直接 `undefined`；OmniRoute 只在 `ALLOW_API_KEY_REVEAL` 打开时返回明文，否则打码。所以 AAH 的 `matching.fetchSecretKey` 无法实现，「渠道里的密钥是否等于源凭据」不可验证。
2. **渠道的「模型列表」不是渠道自己的属性**。模型来自 provider 目录 + alias + 网关级 disabled 列表，连接上只有 `defaultModel` 一个字段。AAH 的管理站点模型同步（按渠道写回 model 列表）没有落点。
3. **baseUrl 覆盖能力不一致**（见下节），9router 的自定义端点必须两步创建（node → connection），OmniRoute 可以一步覆盖内置 provider 的 baseUrl。
4. 面板密码是唯一的通用入口：9router 只有它；OmniRoute 可以由它换出 `oma_` 令牌。

## baseUrl 解析：决定「要不要建 node」的分叉点

**OmniRoute —— 连接级覆盖优先，单步即可。**

`open-sse/executors/base.ts` 的 `resolveBaseUrl`：`providerSpecificData.baseUrl` 存在就直接返回，注释写「Operator's manual override always wins (#6147)」；返回前才轮到 `resolveAlternate` 与 `config.baseUrl`。`src/app/api/providers/route.ts` 的 POST 把调用方的 `providerSpecificData` 透传给 `normalizeProviderSpecificData`，只有 compatible provider 分支（`resolveProviderNodeForConnection`）会用 node 的 baseUrl 覆盖。→ 「内置 provider id + `providerSpecificData.baseUrl`」一次 POST 成立，`/api/providers/import` 的行式入口还专门为非 compatible provider 留了 per-row `baseUrl`。

同一处紧跟着 **SSRF 守卫（GHSA-4f49-hj64-448x）**：落库的、调用方提供的 `providerSpecificData.baseUrl` 会进入 fetch，所以非本地 provider 默认按 `block-metadata`（可配 `public-only`）拦私网与云元数据，本地/自建 provider 豁免，另有 `OMNIROUTE_ALLOW_PRIVATE_PROVIDER_URLS` 开关。

**9router —— 只有 compatible 分支读连接级 baseUrl。**

`open-sse/executors/default.js` 的 `buildUrl`：只有 `openai-compatible-*`、`anthropic-compatible-*` 两个分支读 `credentials.providerSpecificData.baseUrl`（各自回落到 `OPENAI_COMPAT_BASE` / `ANTHROPIC_COMPAT_BASE`），其余一律走 `this.config.baseUrl`（provider registry 静态值），`runtimeTransport.baseUrl` 只服务多端点 provider。`src/lib/providerNormalization.js` 的 `normalizeProviderSpecificData` 虽然对任意 provider 都原样保留传入字段（只特判 `ollama-local`），但运行时不用它。→ 自定义端点必须建 node。

**node 另有一层语义**：compatible node 的 `prefix` 决定网关侧模型寻址（`prefix/model`），内置 provider 沿用自带前缀。所以即使在 OmniRoute 上，「要不要 node」等于「要不要一个独立的模型前缀」，不只是「能不能改 baseUrl」。

**compatible 形态只有三类**（`src/shared/constants/providers.js`：`OPENAI_COMPATIBLE_PREFIX`、`ANTHROPIC_COMPATIBLE_PREFIX`，加 provider-nodes 路由里的 custom-embedding；OmniRoute 另加 claude-code-compatible），**都没有 gemini 原生兼容形态**。9router 因此无法把 Gemini 原生中转接进来（内置 `gemini` 的 baseUrl 改不了，又没有 gemini node），OmniRoute 无此问题。

## 实测结果（2026-09-29）

对两个真实部署跑 `.scratch/router-gateway-sites/probe-upstream.mjs`，只读一轮 + 写入一轮。写入轮的两个一次性渠道（以及 9router 的 provider node）都已删除，前后计数一致：OmniRoute `connections 8 → 8`，9router `connections 0 → 0 · nodes 0 → 0`。探测用的落库对象名带 `aah-contract-probe-<时间戳>` / `aah-probe-<时间戳>` 前缀，若日后在面板里看到残留可按此外号排查。

### 部署形态

| | OmniRoute | 9router |
| --- | --- | --- |
| baseUrl | `<omniroute host>`（公网 HTTPS） | `<9router host>`（公网 HTTPS） |
| `/api/auth/status` | — | `requireLogin=true`、`authMode=password`、**`hasPassword=false`** |
| 渠道数 | 8（全部 `authType=no-auth` 的免费 provider） | 0 |
| provider node | 0 | 0 |
| `/api/keys` | 0 把，`allowKeyReveal=false` | 1 把（`Default Key`） |
| `/api/models` | 72 | 1103 |

### 鉴权（两条都实测可用）

- **OmniRoute `oma_` admin 令牌**：`Authorization: Bearer` 直接可用，`GET /api/cli/whoami` 回 `{"authenticated":true,"viaAccessToken":true,"scope":"admin",...}`。配置里给的令牌就是 `admin` 作用域，渠道写入所需的 `ADMIN_MUTATION_PREFIXES` 门槛满足。（本轮因为已有令牌，**没有**调用 `/api/cli/connect`，也没有新增访问令牌。）
- **9router 面板密码 → cookie**：`POST /api/auth/login {password}` 返回 200 并 `Set-Cookie: auth_token=…`（140 字符）。注意该部署 `hasPassword=false`，说明它靠环境里的 `INITIAL_PASSWORD` 认证而不是 `settings.password`；因为 `INITIAL_PASSWORD` 非空，源码里那条「非 loopback 且未设密码 → 403 `mustChangePassword`」**没有触发**。这条风险在本部署上不成立，但换一个只留默认 `123456` 的部署就会触发。

### baseUrl 覆盖：两侧差异已实测确认

- **OmniRoute 单步成立**。`POST /api/providers` 传 `provider=openai` + `providerSpecificData.baseUrl=https://probe.invalid/v1` → 201，回读 `GET /api/providers/{id}` 得到 `providerSpecificData.baseUrl = https://probe.invalid/v1`。schema 侧的 `validateProviderSpecificData` 只要求它是合法 http(s) URL，不限制 provider 种类。
- **9router 必须两步**。`POST /api/provider-nodes {name, prefix, apiType:"chat", baseUrl, type:"openai-compatible"}` → 201，id 形如 `openai-compatible-chat-<uuid>`；再用 `provider=<该 node id>` 建连接 → 201，连接的 `providerSpecificData.baseUrl` 就是 node 的 baseUrl（**快照语义确认**）。

### 渠道密钥可见性：两侧**不一致**，且 OmniRoute 有明文出口

用同一把测试密钥（`sk-aah-contract-probe-invalid`）建连接后对比：

| 读取路径 | OmniRoute | 9router |
| --- | --- | --- |
| `GET /api/providers` | `apiKey` **打码**（`前8****后4`，实测 `sk-aah-c****alid`） | `apiKey` **字段被整个摘掉** |
| `GET /api/providers/{id}` | 打码 | 字段被摘掉 |
| `GET /api/providers/client` | **明文**（29 字符原样返回） | 字段不在白名单，**不返回** |

OmniRoute 的 `src/app/api/providers/client/route.ts` 是刻意不脱敏的，注释写「includes sensitive fields for sync to cloud (only accessible from same origin)」，实现就是 `connections.map((c) => ({ ...c }))`。**但「same origin」没有在代码里落实**：该路由没有 in-handler 鉴权，只靠管道把它分类成 `MANAGEMENT` 要求管理凭据；本轮用 `admin` 令牌从公网跨源请求就拿到了明文。9router 的同名路由（`src/app/api/providers/client/route.js`）反而走 `SAFE_FIELDS` / `SAFE_PSD_FIELDS` 白名单，不含 `apiKey`（`baseUrl` 在白名单里，所以 `baseUrl` 仍可读）。

对集成的直接后果：**OmniRoute 可以实现 `matching.fetchSecretKey`**（走 `/api/providers/client`），9router 不行。去重因此也是不对称的——OmniRoute 能按密钥判定同一凭据，9router 只能按 `base_url` + 名称。

### 其它实测到的形状

- `/api/models` 两侧都是 `{ models: [...] }`；条目含 `provider`、`model`、`name`、`fullModel`（9router 还有 `routedModel`、`alias`）。9router 1103 条说明模型目录规模可观，但**它不是渠道的模型列表**（渠道侧仍只有 `defaultModel`），本方案的「不做 models 能力」结论不变。
- 两侧 `/api/provider-nodes` 初始为空，形状与上文源码结论一致（OmniRoute 的 `/api/providers/client` 也返回 `{connections}` 信封，不是 provider 目录）。
- 没有任何 API 路由暴露 provider id 目录（9router 的面板是客户端直接 import `AI_PROVIDERS` 常量）。**编辑器要自己带一份 provider→基础地址表**；可行的替代是从 `/api/models` 里出现的 `provider` 值反推部署实际在用的 id 集合。

### 创建渠道时的校验不对称（源码复核，影响导入路径选择）

OmniRoute 三条建渠道入口的校验强度不同，`grep -c validateProviderApiKey` 的结果是：

| 入口 | 校验 | 后果 |
| --- | --- | --- |
| `POST /api/providers` | **不校验**（该文件里 `validateProviderApiKey` 出现 0 次） | 网关连不到源站也能建 |
| `POST /api/providers/bulk` | 逐条 `validateProviderApiKey` | 连不到源站的那条失败 |
| `POST /api/providers/import` | 逐条 `validateProviderApiKey` | 同上 |

9router 的 `POST /api/providers` 同样不校验（只把 `testStatus` 默认成 `"unknown"`）。

所以 AAH 的导入应默认走**单条创建**：凭据有效性由扩展自己验证（`aiApiVerification`），不应该被网关的出网可达性决定成败；批量/导入入口只适合「把一个账户下的多把密钥一次铺开」这类上游明确要自己校验的场景。

### 9router 的隐藏读出口：全库导出（2026-09-29 实测，修正上表结论）

上表「9router 读不到渠道密钥」**只对渠道相关路由成立**。把候选面全查一遍后发现另有出口：

| 读取路径 | 9router 实测 |
| --- | --- |
| `GET /api/providers` | no（568 B，字段被摘） |
| `GET /api/providers/{id}` | no（565 B） |
| `GET /api/providers/client` | no（169 B，白名单） |
| `GET /api/settings/database`（带 `x-9r-password`） | **YES**（含渠道密钥） |

机制：`src/app/api/settings/database/route.js` 的 `GET` 返回 `exportDb()`，而 `src/lib/db/index.js` 的 `exportDb()` 把 `providerConnections` 每行写成 `{...parseJson(r.data, {}), id, provider, authType, name, ...}`——**连接的全部字段（含 `apiKey`）就存在 `data` 这个 JSON blob 里**（`connToRow` 把 id/provider/authType/name/email/priority/isActive/createdAt/updatedAt 之外的一切都塞进 `data`），所以铺开后密钥原样返回。同一份导出还含 `providerNodes`、`proxyPools`（含其凭据）、`apiKeys`（网关自身密钥）、`combos`、`settings`、别名与定价。

门槛：路由在 `ALWAYS_PROTECTED` 里（需有效会话或同机 CLI 令牌），且 in-handler 还要求 `x-9r-password` 等于面板密码或 `INITIAL_PASSWORD`（`verifyDashboardPassword` 在 `settings.password` 为空时回落到 `process.env.INITIAL_PASSWORD || "123456"`）。**它不在 `LOCAL_ONLY_PATHS`**，所以远端可调——本轮就是从公网域名带 cookie + `x-9r-password` 拿到的。同机的 `x-9r-cli-token` 也可单独通过两层。

为什么不该拿它当 `fetchSecretKey` 的正式实现（结论仍是「默认不做」，但性质从「做不到」变成「不值得」）：

1. **它是全库导出，不是按渠道读**。读一个渠道的密钥要拉回整台机器的所有凭据（上游密钥 + 网关自身 API key + 代理池凭据），过度采集、且扩大泄漏面。
2. **每次调用都要重发原始密码**（`x-9r-password` 重认证），比会话 cookie 暴露更多份凭据。
3. **同一个路由族的 `POST` 是「清库重建」**（`importDb` 会先 `DELETE FROM settings` / `providerConnections` 等）。读功能挂在一条误用即毁灭数据的路由旁边，是明确的脚枪。
4. **`exportDb()` 的形状是内部转储格式**，不是对外契约，上游可随时改（对比之下列表接口是稳定契约）。

OmniRoute 有同类面（`GET /api/db-backups/export` 直接流式返回整个 SQLite 文件，`exportAll` 打 ZIP，均要求已认证），但因为 `/api/providers/client` 已经明文可用，不需要走这条路。

补充一点性质判断：这条导出**不是私有后门**，而是 9router 自己前端在用的正式路径——`src/app/(dashboard)/dashboard/profile/page.js` 的导出按钮就是带 `x-9r-password` 调 `/api/settings/database`。所以它的稳定性比「某个内部路由」好；但代价仍然是上面那四条（全库、重发密码、邻近清库写操作、形状非契约）。
