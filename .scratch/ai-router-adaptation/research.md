# ai-router.dev 现场调查

- 调查时间：2026-09-27
- 调查账号：站点账号 id `3725`（邮箱与邀请码已隐去，role `user`，start balance $0.30）
- 调查方式：Edge（用户已登录会话）内同源 `fetch` + 站点自身打包产物 + 站点自身 UI 操作
- 结论：`ai-router.dev` 是 Sub2API 的**分域（split-origin）**魔改部署。前端在 `https://ai-router.dev`，API 在 `https://api.ai-router.dev/api/v1`，两者不互相代理。

## 1. 站点与后端判定

站点品牌为 `AI-ROUTER`，`/api/v1/settings/public` 返回 `site_name: "AI-ROUTER"`、`site_subtitle: "Subscription to API Conversion Platform"`、`version: "0.1.119"`。

判定为 Sub2API 的依据（全部为实测）：

| 证据 | 实测值 |
| --- | --- |
| 响应信封 | `{"code":0,"message":"success","data":{...}}`，业务错误为 `{"code":409,"message":"...","reason":"..."}` |
| 未认证保护的 `/api/v1/auth/me` | `401 {"code":"UNAUTHORIZED","message":"Authorization header is required"}` |
| localStorage 会话键 | `auth_token`、`refresh_token`、`token_expires_at`、`auth_user`，与 `src/services/accountSiteOnboarding/contentSession/sub2api.ts` 所读完全一致 |
| 刷新契约 | 前端调用 `POST /auth/refresh`，body `{refresh_token}`，`Content-Type: application/json`；成功数据含 `access_token`/`refresh_token`/`expires_in`（客户端 `const {expires_in:z}=g.data`） |
| 用户域路由 | `/api/v1/keys`、`/api/v1/groups/available`、`/api/v1/groups/rates`、`/api/v1/usage/stats`、`/api/v1/user/aff`、`/api/v1/announcements`、`/api/v1/channels/available` 均存在 |
| 管理域路由 | 前端产物含 `/admin/accounts`、`/admin/accounts/data`、`/admin/dashboard/*` 等 Sub2API 管理路由 |

## 2. 分域事实（本部署与上游最大的差异）

| 请求 | 结果 |
| --- | --- |
| `GET https://ai-router.dev/api/v1/settings/public` | **404** `text/html`（前端 SPA 兜底页），即 Web origin 没有 API |
| `GET https://api.ai-router.dev/api/v1/settings/public` | 200 `application/json` |
| `GET https://api.ai-router.dev/`、`/dashboard`、`/keys` | **404** `text/plain` `404 page not found`，即 API origin 没有前端 |
| `GET https://api.ai-router.dev/health` | 200 `{"status":"ok"}` |
| `GET https://api.ai-router.dev/v1/models`（无 key） | 401 `{"code":"API_KEY_REQUIRED",...}` |

前端产物中 API 基址是硬编码常量：

```
https://api.ai-router.dev/api/v1
```

`/api/v1/settings/public` 自身也声明了 `api_base_url: "https://api.ai-router.dev"`，前端将其注入 `window.__APP_CONFIG__`。该值不能用于发现——它由前端拿到 settings 之后才写入，而前端调用 settings 又需要已经知道 API origin。HTML shell 里没有该值（`raw HTML` 无配置脚本、无 `api.` 链接）。

站点自身的 Key 页把调用地址显示为 `https://api.ai-router.dev`。

同源 `https://ai-router.dev/api/...` 不存在，因此**不能**假定「账户地址即 API 地址」。

## 3. 站点识别

- 打包后的静态 shell `<title>` 为 `AI-ROUTER - AI API Gateway`（`fetchSiteOriginalTitle` 读到的就是它）；SPA 运行后标题才变成 `ChatGPT API proxy for OpenAI-compatible API - AI-ROUTER` / `Dashboard: en-US, ...`。
- 现有识别链路对 `https://ai-router.dev` 全部落空：
  - `detectAccountSiteTypeFromDomain`：Sub2API 没有登记 hostname 规则 → unknown
  - `detectVoApiV2FromProtectedEndpoint`：`/api/user/info` → 404 `text/html` → unknown
  - `detectSub2ApiFromAuthEndpoint`：`/api/v1/auth/me` → 404 `text/html`，非 JSON → unknown
  - `fetchPublicSiteStatusName` 与 title 规则：标题不含 `sub2api` → unknown
- 反过来，对 `https://api.ai-router.dev` 而言 `detectSub2ApiFromAuthEndpoint` 会命中（JSON + 字符串 `code`），但该地址不能作为账户地址（没有前端，读不到 localStorage 会话，也无法作为 UI 跳转目标）。

## 4. 已验收的只读契约（本部署实测）

统一请求头 `Authorization: Bearer <auth_token>`。

### `GET /api/v1/auth/me`

```json
{"code":0,"message":"success","data":{"id":3725,"email":"<redacted>","username":"","role":"user","balance":0.3,"active_balance":0.3,"frozen_balance":0,"concurrency":30,"status":"active", ...}}
```

`username` 为空串，`email` 非空——与 `parseSub2ApiUserIdentity` 的回退（取 email 本地部分）一致。

### `GET /api/v1/groups/available`

数组，元素含 `id`/`name`/`description`/`platform`/`rate_multiplier`/`subscription_rate_multiplier`/`balance_rate_multiplier`/`billing_policy`/`is_exclusive` 等。实测三条：`14`（openai，1x）、`26`（anthropic，8x）、`28`（openai，1.8x）。

### `GET /api/v1/groups/rates`

`{"code":0,"message":"success","data":{}}` —— **空对象**。`parseSub2ApiGroupRates({})` 得到空表，`buildSub2ApiGroupDescriptors` 回退到 `group.rate_multiplier`，因此本部署的倍率来自 `groups/available` 而不是 `groups/rates`。

### `GET /api/v1/usage/stats`

```json
{"code":0,"message":"success","data":{"total_requests":0,"total_input_tokens":0,"total_output_tokens":0,"total_cache_tokens":0,"total_tokens":0,"total_cost":0,"total_actual_cost":0,"average_duration_ms":0}}
```

### `GET /api/v1/keys?page=1&page_size=3&sort_by=created_at&sort_order=desc`

```json
{"code":0,"message":"success","data":{"items":[],"total":0,"page":1,"page_size":3,"pages":1}}
```

分页信封 `{items,total,page,page_size,pages}` 与 `Sub2ApiPaginatedData` 一致。

### `GET /api/v1/announcements`

数组，元素含 `id`/`title`/`content`/`notify_mode`/`read_at`/`created_at`/`updated_at`。

### `GET /api/v1/user/aff`

```json
{"code":0,"message":"success","data":{"user_id":3725,"aff_code":"<redacted>","aff_count":0,"aff_quota":0,...,"effective_rebate_rate_percent":15,"commission_totals":{"min_withdraw_usd":5,"freeze_days":7,...},"invitees":[]}}
```

## 5. 本部署缺失/不同的上游路由

| 上游（`Wei-Shaw/sub2api`）路由 | 本部署 |
| --- | --- |
| `GET /api/v1/model-plaza` | **404 `text/plain`**（route 不存在） |
| `GET/POST /api/v1/redeem/checkin/status`、`/api/v1/redeem/checkin`（Sub2API Pro 变体） | **404 `text/plain`** |
| `GET /api/v1/channels/available` | 存在（401 需要认证）；但 `settings.public.available_channels_enabled = false` |

`fetchSub2ApiPricingCatalogs` 对每条路由单独 try/catch，缺失只降级为 `undefined`，不会抛错。

本部署额外提供（上游没有）的用户域路由，来自前端产物与实测流量：
`/api/v1/subscriptions`、`/subscriptions/active`、`/subscriptions/summary`、`/subscriptions/progress`、`/api/v1/payment/*`、`/api/v1/user/notifications`、`/api/v1/user/daily-checkin`、`/api/v1/user/profile`、`/api/v1/user/totp/status`、`/api/v1/user/aff/external-provider-options`、`/api/v1/marketing/attribution/*`、`/api/v1/support/tawk/identity`、`/api/v1/user/preferred-locale`。

对照路由见前端产物 `user-*.js`、`DashboardView-*.js` 与交付时抓到的网络清单。子代理/中转了营销与客服接入点，与签到无关。

## 6. 每日签到（本部署自有协议）

### 状态：`GET /api/v1/user/daily-checkin`

实测（未签到态）：

```json
{"code":0,"message":"success","data":{
  "enabled":true,"reward_amount":1,"base_reward_amount":1,
  "yesterday_actual_cost":0,"yesterday_usage_reward_percent":2,"yesterday_usage_reward_amount":0,
  "max_reward_amount":10,"checked_today":false,
  "next_reset_at":"2026-09-28T00:00:00Z","checkin_date":"2026-09-27","eligible":true}}
```

实测（已签到态）：同一结构，仅 `checked_today: true`。

### 提交：`POST /api/v1/user/daily-checkin`

前端实现（`index-*.js`）：

```js
async function Od(){const e=await Md(),{data:a}=await n.post("/user/daily-checkin",void 0,
  {headers:e?{"X-AI-Router-Client-Fingerprint":e}:void 0});return a}
```

- 无请求体。
- `X-AI-Router-Client-Fingerprint` 为 FingerprintJS `visitorId`（32 字符）。**没有指纹时前端仍然发请求**：`Md()` 与 `Ld()` 之间存在 1200ms 兜底（`Td=1200`，`Promise.race` 超时 resolve `undefined`），此时 `headers` 为 `undefined`。
- 前端将响应 `data` 直接赋给与 GET 相同的 `daily-checkin` 状态（`D.value=d`），并用 `d.reward_amount` 渲染成功提示，因此**提交响应与状态响应同构**。
- 客户端门禁（`DashboardView-*.js`）：`enabled` 为假、`checked_today` 为真、或 `eligible === false` 时不提交；`eligible === false` 时提示 `dashboard.dailyCheckinRequiresAccountAge`。
- 受限期错误判定：`String(error?.reason || error?.error?.code || error?.code) === "DAILY_CHECKIN_RESTRICTED"`，提示 `dashboard.dailyCheckinRestricted`。

### 一次真实领取（站点自身 UI，用户授权）

点击 Dashboard 的 `Check in +$1.00` 按钮，站点自身发出 `POST https://api.ai-router.dev/api/v1/user/daily-checkin`（带 `X-AI-Router-Client-Fingerprint`，32 字符），结果：

- 余额 `$0.30 → $1.30`（+$1.00）
- `GET /api/v1/user/daily-checkin` 变为 `checked_today: true`

成功响应体未被捕获（同页监听未及时落盘），**成功 DTO 按 §「同构」推断**，见 spec 的「已知成本与边界」。

### 重复提交（幂等性验证）

同一天再次 `POST`（不带指纹头）：

```http
HTTP/1.1 409
{"code":409,"message":"daily check-in reward already claimed today","reason":"DAILY_CHECKIN_CLAIMED"}
```

余额 `$1.3 → $1.3`，未二次发奖。结论：服务端按「用户 + 日期」幂等，重复提交是明确的 409 业务错误而非再次发奖。该次请求未带指纹头仍走到了日期门禁，说明指纹不是提交前的硬门禁。

## 7. 与现有仓库能力的关系

- `settings.public.api_base_url` 说明部署自曝 API origin，但发现时机（前端启动后）晚于「需要 API origin」的时机，不能作为识别/接入依据。
- 现有 Sub2API 变体（Pro / 天才程序员 / 登仙 / 小白Code）全部是**同源**部署，探测与请求都钉在账户 origin 上；`xiaobai-code-checkin` 的 spec 明确把「跨源托管的签到应用」列为不覆盖。本部署属于该未覆盖情形。
- `executeAuthenticatedSub2ApiRequest`、`fetchSub2ApiPublicSettings`、`fetchSub2ApiRuntimeModels`、`fetchSub2ApiPricingCatalogs`、`managedSites/providers/sub2api.ts` 是 Sub2API 侧的全部请求出口；`ApiServiceRequest.baseUrl` 同时承担「API 基址」与「浏览器 origin」两种语义（`recoverSub2ApiBrowserAuth({baseUrl})` 要拿它去开页面读 localStorage），因此不能在账户层直接把 `baseUrl` 改成 API origin。

## 8. 密钥管理写入契约（实测）

用扩展自己的载荷形状走了一遍 创建 → 改名 → 删除，落在真实部署上（探测键名为 `aah-adaptation-probe`，删除后列表回到 `total: 0`，账号上无残留）。密钥值只记录长度，不记录内容。

| 步骤 | 请求 | 结果 |
| --- | --- | --- |
| 列表（前） | `GET /api/v1/keys?page=1&page_size=100` | 200，`data.items: []`，`total: 0` |
| 创建 | `POST /api/v1/keys`，body `{name, group_id, quota: 0, ip_whitelist: []}` | 200，`data` 为单键 DTO：`id`/`user_id`/`key`（67 字符明文）/`name`/`group_id`/`status`/`quota`/`quota_used`/`expires_at: null`/`ip_whitelist: []`/`rate_multiplier_cap` 等；**无嵌套 `group`** |
| 改名 | `PUT /api/v1/keys/{id}`，body `{name, group_id, quota, status: "active", ip_whitelist: []}` | 200，`name` 已更新；`data` 额外嵌套 `user` 与 `group` |
| 列表（改名后） | 同上 | `items[0]` 含 `key` 明文、`group` 嵌套对象，`ip_whitelist: null` |
| 删除 | `DELETE /api/v1/keys/{id}` | 200，`data: {message: "API key deleted successfully"}` |
| 列表（删除后） | 同上 | `total: 0` |

与既有解析器的对应关系：

- `parseSub2ApiNativeKey` 要求的 `id`（正整数）、`key`、`name` 均存在；`group_id` 直接给出。
- `group_name` 取自嵌套 `group.name`：**创建响应没有该字段**，所以创建返回的 `group_name` 是空串。既有自动开键流程只校验 `group_id` 与创建前后的 id 差集，不依赖创建响应的 `group_name`。
- 列表的 `ip_whitelist` 可能是 `null`，`Sub2ApiKeyData` 已声明 `string[] | string | null`。
- 列表与创建都返回明文密钥，与既有 `Sub2ApiKeyData.key` 语义一致。

结论：密钥管理（列表 / 创建 / 改名 / 删除）在本部署与既有 Sub2API 适配器兼容，不需要额外分支。
