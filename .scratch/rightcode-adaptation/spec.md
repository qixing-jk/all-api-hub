# RightCode 站点适配 spec

Status: ready-for-human（实现已完成，待审查）

关联 issue：#526、#955、#1333（[Site Support] www.right.codes / rightapi.ai）

## 背景

RightCode 是商业中转站，`www.right.codes`、`right.codes`、`rightapi.ai` 三个域名指向同一套服务与账号库。它**不是** One API / New API 衍生：没有 `/api/user/self`，也没有 `/api/token/`，而是自有 REST 后端，鉴权头是 `Authorization: Bearer <userToken>`，token 是 UUID 而非 JWT，前端把它存在 `localStorage.userToken`。

这正是 issue 里 `invalid_response` 的成因：站点落在 New API 家族的探测路径上，永远拿不到预期结构。

## 交付范围

做：站点识别与自动识别、余额/套餐刷新、API Key 全量管理（列/新建/改/启停/过期/重置用量/删除）、模型列表与价格、邀请链接、站点公告。

明确不做：

- **签到**：该站没有签到功能（全站前端代码与路由表都没有相关端点），issue 里勾选它属于误选。
- **激活码兑换**：`POST /activation/redeem` 的请求体与「订阅激活 / 余额入账」分支已从站点前端确认，但没有可用激活码，成功响应的完整形状无法核实，因此不接入（`redeemPath: null`，不实现 `redemption` 能力）。

## 已核实的上游契约

证据：用 Playwright Extension 模式接管已登录浏览器实测（不复制 profile、不走 CDP），原始响应留档在同目录 `probe-*.json`（未入库）。站点侧代码依据来自其前端 bundle（未入库）。

### 认证与账号

- `GET /auth/me` → `{ id, username, email, balance, permissions, user_token, invite_code, is_banned, is_admin, upstream_limits[], token_rotation_enabled, token_rotation_days, created_at, updated_at, ... }`
- 失效响应：HTTP 401，`{ error: "Unauthorized", message: "Invalid userToken" }`；未带 token 时 message 为 `"Missing userToken"`。
- 站点账号设置里有「登录令牌轮换」：开启后登录令牌每 N 天（1–90）到期，**到期需重新登录**。没有 refresh_token，也没有续期端点。

### 统计与套餐

- `GET /use-log/stats?start_date&end_date`（`YYYY-MM-DD`）→ `{ total_requests, total_tokens, total_cost, start_date, end_date }`；**不带参数默认近 7 天**，所以「今日」必须显式传当天日期。
- `GET /use-log/stats/overall` → 全部历史累计。
- `GET /subscriptions/list` → `{ subscriptions: [{ item_id, name, remaining_quota, total_quota, available_today_quota, available_prefixes, reset_today, expired_at }] }`
- `GET /subscriptions/summary/total` → `{ total_quota, used_quota, remaining_quota, active_subscription_count }`

### API Key

- `GET /api-key/list` → `{ keys: [{ id, key, name, bound_upstream_id, quota_limit, used_quota, expired_at, is_active, allowed_prefixes, allowed_models, allow_wallet, allowed_item_ids, created_at, updated_at }] }`
- **`key` 在 list / detail / create 三处都返回明文**（实测 `sk-` + 32 hex），所以清单密钥始终可恢复、可导出。
- `POST /api-key/create` `{ bound_upstream_id, allowed_models, name?, quota_limit, allow_wallet, allowed_item_ids }` → 201 返回完整 Key。
- `PATCH /api-key/{id}` 局部更新；`DELETE /api-key/{id}` → `{ message: "deleted" }`；`POST /api-key/{id}/reset-usage`。
- `PATCH /api-key/{id}/expire` `{ expired_at }`：**只接受 `YYYY-MM-DDTHH:mm:ss`（无时区、无毫秒）**，用站点 UI 的展示格式会 400；并且**一旦设置就无法清除**（`null`、`""`、空 body 都返回 200 但值不变）——编辑器据此把过期字段设为「已有过期时间时不可清空」。
- 用量语义：`quota_limit == null` 为无限，否则已用比例 = `used_quota / quota_limit`；`expired_at == null` 为永不过期。

### 渠道、模型与定价

- `GET /models/effective` → 按渠道给出账号实际价格：每个 model 的 `effective_price_config` 已含站点与账号倍率；`billing_mode` 取 `token` / `tiered` / `request`。
- 每个渠道还有 `copy_with_v1`（站点「复制 base url」按钮的规则，UI 上标为「旧地址 /v1」）。

### 客户端地址（导出端点）

RightCode 的客户端地址**不是账号根域**，而是 `origin + 渠道 prefix (+ /v1)`。三处独立证据一致：站点内置在线对话的 URL 构造、官方 curl 文档（`https://docs.rightapi.ai/docs/rc_extension/curl.html`）、CC Switch 内置 RightCode 模板。实现取站点自身 `copy_with_v1` 优先、协议规则兜底（`messages`/`gemini` 不加 `/v1`，`responses`/`completions` 加），并统一使用带前缀的形式。

这条决定直接影响 Key 管理页的导出（CC Switch / Cherry Studio / Kilo Code 等）：导出的 endpoint 必须是渠道地址，否则客户端会打错路由。

## 认证与长期访问

RightCode 没有 refresh_token 流，所以「长期可访问」靠**浏览器会话 token 再同步**，架构上对标 voapi-v2：

1. 自动识别：`ContentSessionExtractor` 读 `localStorage.userToken` 与 `auth-storage` 拿 token 与身份。
2. 失效自愈：刷新时 `/auth/me` 返回 401 就调用 `resyncRightCodeAuthToken`，从已打开的站点标签页（或临时窗口）取回当前 token；**只有新 token 验证成功才写回账号**，避免用失效的浏览器会话覆盖可用凭据。
3. 被动身份：`browserIdentity` 用同端点校验页面会话，用于「浏览器已登录但保存的 token 已失效」的提示。

现实边界（已写进文档，不假装没有）：轮换到期后站点自身也会把浏览器登出，此时扩展无法自愈，需要用户重新登录一次。

## 实现落点

- 注册：`src/services/accountSiteDefinitions/`（identifier / family / definition / facade re-export）
- 传输：`src/services/apiService/rightcode/`（endpoints、wire types、transport、错误解码、token 再同步、渠道地址规则）
- 适配器：`src/services/apiAdapters/rightcode/`（账号数据、刷新、bootstrap/completion、密钥管理、模型定价、邀请链接、浏览器身份、目录映射）
- 会话：`src/services/accountSiteOnboarding/contentSession/rightcode.ts`
- 呈现：Key 管理原生卡片与字段策略
- 共享契约：`AccountKeyResourceFacts.runtimeKey.baseUrl`（凭证路由型站点需要把渠道地址带到 runtime key 上，导出才正确）

## 验证

- 契约实测证据：同目录 `probe-*.json`（未入库，含账号敏感字段已脱敏）。
- 单元测试：`tests/services/apiAdapters/rightcode/`、`tests/services/accountSiteOnboarding/contentSession/rightcode.test.ts`、`tests/services/detectSiteType.test.ts`、以及站点注册/一致性用例。
- 浏览器 e2e：`e2e/accountOnboardingCommonFlows.spec.ts` 的 RightCode 用例，用打桩站点跑真实扩展的「自动识别 → 确认添加 → 落库」，断言识别为 RightCode、账号以控制台会话里的 token 落库、且不出现一次性密钥弹窗。
- 尚未自动化的部分（需要真实账号手动过一遍）：Key 管理页的增删改与导出端点、模型价格页、token 失效后的浏览器会话自愈、手动添加（粘贴 token）。
