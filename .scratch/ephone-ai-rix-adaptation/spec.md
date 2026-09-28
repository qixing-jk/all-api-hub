# platform.ephone.ai (RixAPI 6.5.17) 账号适配

Status: implemented（分支 `feat/rix-api-6x-adaptation`）；剩余"真机验收"需人工在浏览器完成，记为 ready-for-human
Related: GitHub issue #1379 `[Site Support]: platform.ephone.ai` (label `site-support`, failure type `invalid_response`, extension 3.59.0)

## 实现结果（2026-09-26）

九项全部落地，逐项对应提交（按分支上的顺序）：

| 票 | 提交 | 内容 |
| --- | --- | --- |
| T1 | `c3c83e46c` | `/api/status` 的 Rix 许可证字段作为结构性识别信号，优先于品牌文本 |
| T2 | `b345311f0` | 身份放宽到 `username`；`Rix-Api-User` 仅在身份是纯数字时发送 |
| T3 | `decbde973` | `balance`(USD) × `QUOTA_PER_USD` 作为额度，整数 `quota` 保持优先 |
| T6 | `6289cdf1b` | 读取 `enable_checkin`（`checkin_enabled` 优先） |
| T7 | `931cf5e76` | 用 `rix_version_message` 主版本 ≥ 6 选择 6.x 控制台路径，缺版本回落旧路径 |
| T4 | `d945836ec` | 字符串配额归一、分组回落 `/api/token/group`、`use_group` 读取、密钥固定走揭示端点 |
| 修正 | `bed7be45d` | `tsc` 抓到的两处（版本解析的可空匹配、路由缓存钩子改名漏改一个测试导入） |
| T5 | `3383873e9` | Rix 定价信封归一化（token/call/time 三类、USD+CNY、未映射计费报 unsupported-rule、New API 形状委托回共享解析） |
| 实测补修 | `ab9ad5876` | 真机添加账号报 "Account access token could not be obtained" 后定位到两处：`fetchUserInfo` 硬要求 `id`（按账号定义声明的字段解析）、新版构建无 PAT 端点（404 ⇒ 记为 Cookie 鉴权） |
| 实测补修 | `8437a915e` | 状态探测带 bypass 失败时去掉 bypass 重试一次，识别阶段不再因探测失败丢掉 Rix 指纹 |
| 实测补修 | `9d2fc3adb` | 去掉 PAT 那一步：`getOrCreateAccessToken` 改签管理密钥（`/api/user/admin-keys`，一次性明文） |
| 实测补修 | `1ab3cbbd8` | 管理密钥被拒（404/403）时给出"到部署方凭据页签发/改用会话"的引导，不再静默回落 Cookie |
| 实测补修 | `178f7b9f0` | 账号模型列表优先用会话读（`/api/user/models` 拒绝管理密钥），`/api/pricing` 被拒时匿名重读 |
| T9 | `c0ed91f10` | 部署级方言记忆：分组端点 / 模型列表鉴权 / 定价鉴权各探测一次并按 `baseUrl` 记住 |
| T10 | `9e731680d` | 密钥编辑器为 RIX_API 增加部署自带字段：不限调用次数 / 剩余次数、排除 IP、存储地域（全球节点 / 不转存 / 未配置）、仅使用选定分组；其它站点类型字段集不变 |
| 实测补修 | `3edbdfb3b` | 真机模型列表报 "Failed to load model data" 后定位到：共用传输层会先拆掉 `{success,message,data}` 信封，归一化器收到的是内层对象，而 T5 写成了收整封；改为按实际交付形状解析，测试夹具也改为经 `extractDataFromApiResponseBody` 派生，避免 mock 再与传输层漂移 |
| 实测补修 | `288b87b2d` | 密钥保存报 `Invalid URL (GET /api/user/self/groups)`：`/api/token/group` 是控制台端点（站点自己也用 `credentials:"include"` 读），token 账号不带会话 → 改为"会话优先 + 凭据/旧端点回落"并记住哪一对应答 |
| 实测补修 | `e488673df` | 真机 PUT 会把请求没带的部署列清零（9 个字段被抹）→ 写体带上原始行的部署字段（排除密钥与记账列），写回校验也按同一写体比对 |

验证：`tsc --noEmit` 与 `eslint` 干净；受影响范围 `tests/services` + `tests/utils` + `features/{ModelList,KeyManagement,TokenProvisioning,AccountManagement}` 共 855 个文件 / 14467 个用例全绿。T5 曾"用抓到的真实 688 行报文跑过一遍"，但那次喂的是**原始报文**给纯归一化器，跳过了传输层的拆封，所以没暴露 `3edbdfb3b` 那个缺陷——现在改为跑真实链路（`createNewApiModelPricing(RIX_API).fetchPricing` 打线上）：687 个模型、其中 659 个带价格。

仍未验证（与 spec 上文一致，不阻塞）：ePhone 上的 PAT 生成（不可撤销，未执行）、兑换码（无样本）、签到（部署侧关闭）、新建密钥在中转 `/v1/models` 被拒（疑账号状态/中转缓存，与扩展无关）。


## 结论速览

`platform.ephone.ai`（品牌 ePhone AI，运营方 PULSE AI SINGAPORE PTE. LTD.）是一个**白牌 RixAPI 6.5.17 部署**，属于既有的 `RIX_API`（`Rix-Api`）兼容桶。现场探测确认：它保留了 One/New API 的绝大多数路由和会话鉴权，但把**用户额度从 `quota`（整数配额单位）改成了 `balance`（USD 字符串）**，并且 `/api/user/self` **不再返回 `id`**。扩展当前的 New API 家族默认实现同时要求 `id` 和 `quota`，因此：

- 自动识别在 `fetchUserInfo` 处因 `id` 缺失抛 `invalidResponseFormat` → 报 `invalid_response`（与 issue 报错文案一致）；
- 手动添加后 `fetchAccountQuota` 读到 `undefined` → 余额显示为 0 / 取不到；
- `/api/pricing` 换成了自定义信封，`normalizeNewApiModelPricingResponse` 直接抛错 → 模型价格缺失；
- `/api/user/self/groups` 不存在（分组改在 `/api/token/group`）→ 密钥供给/归位排查失败。

签到在本部署**被运营方关闭**（`/api/status.enable_checkin === false`），需要先让扩展正确读到该字段（扩展目前只认 `checkin_enabled` / `check_in_enabled`），否则会误判为"可用"并尝试签到。

## 上游来源（2026-09-26 补充，实施时按 `docs/agents/site-integrations.md` 写入代码注释）

- **上游仓库：`https://github.com/RixAPI/Rix-API`**（New API 二次开发，重构核心代码；README 明确写"示例站点请查看 https://api.ephone.ai"）→ **issue #1379 的站点就是 RixAPI 官方示例部署**，运营方 PULSE AI SINGAPORE。在本站做的适配等同对上游官方部署做适配，可直接推广到其他 Rix 6.x 部署。
- **授权/部署站：`https://rixapi.com`**（`/update` 版本历史、`/deploy` 部署说明、`/purchase`、`/verify`；镜像 `rixapi/rixapi`（基础版）与 `rixapi/rixapi-pro`（高级版，本站 `rixapi_license_type: "premium"`）。公告：高级版已停售、基础版佛系维护、官方建议改用 New API。
- **版本历史**：公开更新日志覆盖 0.x → 1.x/2.x → 3.x → 4.x → 5.10.x；本站与官方演示站都已是 **6.x**。仓库内 `docs/update/index.md` 停留在 2025-02 的 3.0.6，不要当成最新清单。
- **代次判别字段应为 `rix_version_message`，不是 `version`**：官方演示站 `platform.rixapi.com` 返回 `version:"6.1.25"` 但 `rix_version_message:"6.5.17"`；本站两者都是 `6.5.17`。即 `rix_version_message` 是 Rix 核心版本，`version` 是部署侧构建号。T7 的分代判断必须用 `rix_version_message`（或其中的主版本号）。
- **官方演示站（未登录即可访问 `/api/status`）已复核**：`system_name:"RixAPI"`、`enable_checkin:false`、`slide_captcha:false`、无 `checkin_enabled`；控制台路由同样是 `/dashboard`、`/logs`、`/token/`、`/billing/`、`/profile`、`/sign-in`、`/sign-up`、`/register`、`/level_group`（**没有** `/log`、`/panel`、`/topup`）→ T6/T7 的结论不是 ePhone 个案，而是 6.x 全线行为。
- **未登录探测**：`GET /api/user/self`、`GET /api/token/` 均 401 `{"message":"无权进行此操作，未登录且未提供 access token","success":false}`，**不提 `Rix-Api-User`** → 现有的"从兼容头错误文案反推站点类型"的检测回退在 6.x 上永远不触发，白牌部署只能靠结构性指纹识别（T1 的依据）。
- **独立第三方佐证**：`NiceAIGC/NiceApiManager`（管理 NewAPI/RixAPI/ShellAPI 的项目）同样用 `rix_license_enabled` / `rix_version_message` / `rixapi_license_type` 三字段判定 `rixapi`，并对 `/api/pricing` 做同样的形状分流（`data` 为 dict 且含 `model_info` → Rix 分支，收集 `vendor_info` / `group_info`）。**但它的 Rix 定价行方言与本部署不同**：它读 `row.price_info{quota_type, model_ratio, model_price, model_completion_ratio}`（New API 比率风格），本站是 `row.price_config.original_price.conditions[].price{quota_type, currency, input_token_price...}`（显式 USD/百万 token）→ 定价归一化必须同时容纳这两种行方言（见 T5）。

- **官方演示站未登录复核（2026-09-26，纯只读、无登录、无写操作）**。Rix 的未登录响应能区分"路由不存在"（404 `{"error":{"message":"Invalid URL (...)"}}`）与"存在但需鉴权"（401 `{"message":"无权进行此操作，未登录且未提供 access token","success":false}`），据此判定：
  - `/api/user/token` → 401 ⇒ 该构建仍有 PAT 路由。**但两个部署并不一致**（2026-09-26 补测）：官方演示站（app 6.1.25）返回 401（存在），**ePhone（app 6.5.17）返回 404 Invalid URL（不存在）**；对照实验确认判定方法可靠——两台站上不存在的路径都返回 404，所以 401 才代表路由存在。⇒ 新版构建移除了 PAT 端点，AccessToken 添加会失败，必须回落到 Cookie（见实现结果）。
  - `/api/user/self/groups` → 404 ⇒ **分组端点在全线不存在**（T4 的回落是必需的，不是 ePhone 个案）；`/api/token/group` → 401 ⇒ 存在，可作为回落目标；`/api/group` → 301 到 `/api/group/`（扩展现调的 `/api/group` 会吃一次重定向）。
  - `/api/user/checkin`(GET) → 404 ⇒ **6.x 全线没有签到 GET 读回**（T6 的字段名修复是读回的唯一依据）。
  - `/api/user/payment` → 401 ⇒ 存在（与当年 RIX 独有端点一致）；`/api/user/aff`、`/api/log/self/stat` → 401 ⇒ 存在。
  - `/api/pricing`、`/api/level` → 200 **公开**（无需登录），但 `/api/pricing` 的 `data.user_info` 未登录时为 `null` ⇒ **user_info 不能作为可靠身份来源**，T2 用 `/api/user/self` 的 `username` 是对的。
  - **行方言与本站一致**：`price_config.original_price.conditions[].price{quota_type, currency, input_token_price, output_token_price, cache_read_token_price}`，`price` 的 `conditions[].rule` 是 DSL 表达式（实测 `usage.prompt_tokens > 200000`）；**没有 `price_info`** ⇒ T5 主路径只有一种方言，`price_info`（NiceApiManager 接触的那类）属更旧/别家方言，按可选兼容处理即可。
  - 该演示站 4 行 `model_info` **都没有 `model_kind` / `billing_kind`** ⇒ T5 不得依赖这两个字段判定计费模式，必须从 `price.quota_type`（token / time / call）推导。

## 写操作验证与新字段语义（2026-09-26，写操作已全部还原）

在 ePhone 站点账号上做了密钥往返，在官方演示站只做了一次登录（会话 cookie，会自然过期；演示站为演示模式，写操作被拒，未产生任何变更）。**本站写操作：0 → 建 1 枚 → 删 → 0，已还原；账号 PAT 未触碰。**

- **密钥往返全部打通**：用扩展当前 payload（`{name, unlimited_quota, expired_time, remain_quota, allow_ips, model_limits_enabled, model_limits, group}`，**不含** `unlimited_count` / `fixed_key_index`）`POST /api/token/` → `success:true`；列表出现 1 条；`GET /api/token/{id}` 200；`POST /api/token/{id}/key` 200；`DELETE /api/token/{id}` 200 → 列表回到 0。⇒ **站点自身那两个额外字段不是必需的**（未知 #2 关闭）。
- 列表项字段（实测）：`id,key,key_format:"sk-ep-",key_mask,status,name,created_time,accessed_time,expired_time,remain_quota,unlimited_quota,remain_count,unlimited_count,group,group_only,group_sort,group_primary_sort,group_ignore,max_channel_cost,storage_location,mj_mode,mj_cdn,mj_cdn_addr,model_limits_enabled,model_limits,allow_ips,exclude_ips,used_quota,fixed_channel_ids,fixed_key_index,DeletedAt,rate_limits`。**`remain_quota` / `used_quota` 是字符串（`"0"`），不是数字** → 现有 `NewApiToken` 的数字假设、以及 `toNewApiTokenWrite` 的往返相等比较都要在 Rix 下兼容（否则编辑/校验会误判）。
- **两种 key 形态要分清**：列表 `key` = 18 位无前缀 = 真实密钥主体；`POST /api/token/{id}/key` = `sk-ep-` + 18 = 24 位（`key_format` 给出前缀、`key_mask` 给展示掩码）。密钥管理应**始终走揭示端点**取可交付密钥并带上前缀（与 WONG 变体的 `resolveApiTokenKey` 同构），不要直接把列表 `key` 当最终凭据。
- **控制台访问令牌 ≠ 模型 API Key**（服务端明确区分，实测报文：`access token is invalid` / `This is an API key (sk-...) for model calls, not a console access token`）。`/api/user/token` 产出的是**控制台令牌**（实测 28 位），token 对象的 `key` 是**模型调用密钥**；两者不可互换。扩展内部访问账号接口用前者，交付给用户的是后者。
- **`Rix-Api-User` 会被服务端校验**（6.x 实测）：`= 正确数字 id` → 200；`= 错误数字` → 401「Rix-Api-User 与登录用户不匹配」；`= 用户名等非数字` → 401「Rix-Api-User 格式错误」；其余兼容头名（`New-API-User` / `User-id` …）被忽略。⇒ **扩展的兼容头扇出目前会把 `Rix-Api-User` 一并发出**，因此一旦账号身份不是纯数字（例如按 T2 存 `username`），在 token 鉴权下每个请求都会 401。规则：RIX_API 下**仅在身份为纯数字时才发送 user-id 头**（老站 id 是数字 → 行为不变；新版无 id → 不发，Cookie 与令牌鉴权都不需要它）。若需要数字 id，可在已登录时从 `/api/pricing` 的 `data.user_info.id` 取（官方演示站实测为 `2`；未登录时该字段为 `null`）。
- 控制台令牌的鉴权形态：`Authorization: <token>` 与 `Authorization: Bearer <token>` **都接受**（官方演示站现成 PAT、无 Cookie 实测；无任何头 → 401；乱码 token → HTTP 200 + `success:false`「access token is invalid」）。
- **业务失败可能是 HTTP 200**：`/api/group`、演示模式拦截（`演示模式下禁止此操作`）都是 200 + `success:false`；而新鲜密钥打 `/v1/models` 是 401 `Invalid Token`。⇒ 成败一律以信封 `success` 判断（现有 `decodeNewApiResponseError` 已是此口径，不要新增按状态码判定）。
- **`demo_site_enabled`**：官方演示站为 `true`（本站 `false`）；为 true 时写操作被拒（实测 `POST /api/token/` → `演示模式下禁止此操作`）。可作为"该部署不可写"的提示依据。
- **未解决（不阻塞适配）**：新建密钥以任意形态（列表 18 位 / 揭示 24 位 / 带与不带 `Bearer`）请求 `https://api.ephone.ai/v1/models` 与本站 `/v1/models`，均 401 `Invalid Token`，等待 20 秒后依旧。可疑原因是账号状态（本站账号 `balance:"0"`、`email_verified:false`、`verify_info` 空）或中转侧令牌缓存/分片。扩展本身不调用中转，故不影响本次适配；只会在"密钥可用性校验"类功能上表现为失败，不要据此判定扩展密钥解析有 bug。

## 存量 RIX_API 支持的真实来源与线索断层

- 支撑现有 `RIX_API` 的是 `0f67e7768`（2025-11-01，"feat(api): add basic RIX_API support"，随 2.4.0 发布），它只带来四样东西：标题正则 `Rix-Api`、`Rix-Api-User` 兼容头、路由 `/log` `/panel` `/topup`、以及 Rix 独有的 `/api/user/payment` 支付信息（当时注释："此为 RIX_API 独有"）。因此其目标站点特征为：**Rix 品牌标题 + 旧控制台 + 需要 user-id 头的一代**（`makeTitleRegex("Rix-Api")` → `\bRix[-_ ]?Api\b`，能匹配 "RixAPI"，但匹配不了 "ePhone AI" 这类白牌品牌）。
- 当年那个第三方 Rix 站的域名**没有留在任何可查记录里**，已排除的来源：本机 codex 会话归档（2025-10-22 → 11-10 断档）、codex 提示历史（10-21 → 11-10 断档）、Claude 会话历史（始于 2026-01-29）、cc-switch 备份（仅 2026-01/07）、Edge/Chrome 书签、仓库与 GitHub issue/PR（#268 是 2025-12 的另一个 Rix 部署 `qfgapi.com`，报的正是"账户模型列表取不到"，与本站同类；无更早的 Rix 站点申请）。需要确认原始目标站只能靠人工回忆，或另行授权翻查浏览器历史数据库。
- `fetchPaymentInfo` 已在 `fc96bcab4`（#1084 拆分 common surface）中随重构消失，当前 `src/` 无任何 payment 能力；本站 `/api/user/payment` 仍在（返回 `{payments, background, banner}`），若将来要恢复支付信息能力需重新接线。

## 现场证据（2026-09-25，Edge 已登录会话 `qixing-jk`，`https://platform.ephone.ai`）

探测方式：在已登录的 edge tab 内同源 `fetch(..., {credentials:'include'})`，未做任何写操作（无签到、无兑换、无建 key、无创建 PAT）。

### 站点身份与状态

- `GET /api/status` → 200，`success:true`。关键字段：`system_name:"ePhone AI"`、`version:"6.5.17"`、`api_address:"https://api.ephone.ai"`、`enable_checkin:false`、`checkin_min_quota:"0"`、`checkin_max_quota:"0.071429"`、`slide_captcha:true`、`turnstile_check:false`、`exchange_rate:7`、`theme_color:"#c15a06"`（**无 `theme` 字段**）、`enable_aff:true`。
- Rix 专属指纹：`rix_license_enabled:true`、`rix_version_message:"6.5.17"`、`rixapi_license_type:"premium"`；前台 bundle 中还有 `/api/admin/check_rix_auth`、`login/index` 里 `document.title` 兜底为 `"RixAPI"`。
- 前台是 Vite SPA，路由表（用户侧）为 `/dashboard`、`/usage`、`/token`、`/logs`、`/billing`、`/orders`、`/invoices`、`/affiliate`、`/profile`、`/limits`、`/updates`、`/models`、`/rankings`、`/sign-in`、`/sign-up`、`/register`、`/login`；**不存在** `/log`、`/panel`、`/topup`。

### 账号与额度

- `GET /api/user/self` → 200。DTO 键：`username, password, original_password, display_name, role, status, email, email_verified, phone, github_id, discord_id, oidc_id, google_id, linuxdo_id, wechat_id, verification_code, balance, topup_amount, topup_count, aff_code, chat_scope_id, aff_count, aff_earned, aff_balance, inviter_id, stripe_customer, invoice_*, created_at, DeletedAt, last_login_at, level, group_ratio, group_cost_limit, model_ratio, rate_limits, agent_user_id, supplier_id, use_group, extra_allowed_groups, extra_denied_groups, disabled_channels, model_limits_enabled, topup_enabled, model_limits, refusal_billing_exempt, avatar, permissions, push_settings, verify_info, session_version, forced_logout_version, allow_multi_login, step_up_every_time, language, credit_*`。
  - **无 `id`**、**无 `quota`**、**无 `used_quota`**、**无 `request_count`**、**无 `group`**、**无 `access_token`**。
  - `balance:"0"`（USD 字符串）、`level:"Tier 1"`、`use_group:""`、`agent_user_id:1`。
- 页面 `/dashboard` 渲染 `Available Balance $0` → `balance` 单位确为 USD。
- 数值账号 id **只能**从 `GET /api/pricing` 的 `data.user_info.id` 拿到（本账号 `25983`）。
- 兼容 user-id 头在本站被忽略：`/api/user/self` 与 `/api/token/?p=1` 分别在"无头 / 带正确 id / 带错误 id"（`Rix-Api-User`+`New-API-User`）下响应逐字节相同 → 纯会话 Cookie 鉴权，存 username 作身份是安全的。

### 密钥（当前账号无任何 key，列表恒为空）

- `GET /api/token/?p=1&size=5` 与 `?p=0&size=5` → 200 `{data:{items:[],page:1,page_size:10,total:0},success:true}`：**服务端忽略 `size`**（回落到默认 10），但返回 `page/page_size/total` 元数据；`p=0` 被归一化成 `page:1` → 与现有 `RIX_API` 的 `compatibleTokenInventoryOverrides`（startPage 0 + detectsNormalizedFirstPage）一致。
- `GET /api/token/999999` → 200 `{"message":"record not found","success":false}`（路由存在，用于 `fetchTokenById`）。
- `POST /api/token/{id}/key` → 200 同上（隐藏 key 的揭示端点存在）；`GET` 同路径 404。
- 站点自身调用：列表 `GET /api/token/?...`、创建 `POST /api/token/`（body 含 `name/expired_time/unlimited_quota/unlimited_count/fixed_key_index`）、更新 `PUT /api/token/`、删除 `DELETE /api/token/{id}/`（**带尾斜杠**）。
  - 实测 `DELETE /api/token/999999`（不带尾斜杠，扩展当前写法）→ 200 + JSON 业务信封；带尾斜杠 → 301 `opaqueredirect`。即扩展的无尾斜杠写法是正确的，不要照抄站点源码的尾斜杠。
- 列表项仍用 New API 字段名：`remain_quota`、`unlimited_quota`、`used_quota`、`created_time`、`accessed_time`、`expired_time`、`key`（站点"快速开始"直接从列表第 1 项读 `key` 复制）。
- `GET /api/user/self/groups` → **404**；`GET /api/group` → 200 `{"message":"No permission","success":false}`。
- 分组实际来自 `GET /api/token/group` → 200，**数组**：`[{description, descriptionEn, displayNameEn, key, official, value}, ...]`（`key` 是展示名如 `OpenAI-官方优惠`，`value` 是分组 id 如 `openai-official-cheap`）。另有 `GET /api/token/providers-by-vendor`、`GET /api/user/models_groups`。

#### 密钥写契约与控制台字段（2026-09-27 复核，写操作只剩读回）

- 控制台"创建令牌"是 5 个分区：**基础配置**（`name`、`token_count` 批量、`expired_time`、`storage_location`：`global` 全球节点 / 不转存原始链接）、**提供商路由**（`groups: string[]` 至少 1 个、`group_only` 默认 `true`、`group_sort` 默认 `latency`、`group_primary_sort`、`group_ignore`、`fixed_channel_ids`、`fixed_key_index`、`max_channel_cost`）、**安全设置**（`unlimited_quota`/`remain_quota`、`unlimited_count`/`remain_count`、`allow_ips`、`exclude_ips`）、**限制配置**（`model_limits_enabled`/`model_limits`、`rate_limits`）、**Midjourney**（`mj_mode`/`mj_cdn`/`mj_cdn_addr`）。字段清单取自站点自身打包的 zod schema（`index-DE4PFK1x.js`），非猜测。
- **控制台按 `groups[]` + `group_only` 组织路由，但服务端同时接受 New API 的 `group` 字符串**：探针实测发 `group: "openai"` 读回就是 `"openai"`，发 `"user"`、甚至发一个不存在的分组名也原样存储（服务端**不校验**分组合法性）→ `group`/`group_only`/`group_sort`/`group_ignore`/`storage_location`/`exclude_ips`/`rate_limits`/`max_channel_cost` 等都能通过同一个 POST/PUT 写进去。**先前"Rix 上分组不生效"的结论是错的**：那枚 `group: ""` 的 key 名为 `user group (auto)`，正是产品在**空分组**时的兜底名（`DEFAULT_AUTO_PROVISION_KEY_NAME`），所以它的空分组是预期行为。
- **PUT 是"请求带哪些列就写哪些列，其余归零"（已实测，决定性）**：用扩展当时的投影 PUT 一次，`unlimited_count`(true→false)、`group_only`(true→false)、`group_sort`("price"→"")、`group_ignore`("xai"→"")、`storage_location`("global"→"")、`exclude_ips`("10.9.9.9"→null)、`rate_limits`("5,60"→"")、`max_channel_cost`(3→0)、`mj_mode`("默认"→"") 全部被抹；`status`、`group`（我们带上了）、`model_limits`/`allow_ips`/`unlimited_quota` 保住。把**原始行原样带回**再 PUT，19 个字段逐一不变，且 `key`/`key_mask`/`key_format` 不变（PUT 不带 `key` 不会换密钥）。→ 修复：`src/services/apiAdapters/newApi/tokenPreservedFields.ts` + 站点感知写入体（`e488673df`）。
- 写路径的 `model_limits`、`group_ignore` 在服务端是**字符串**：发数组直接 400 `json: cannot unmarshal array into Go struct field Token.model_limits of type string`（站点控制台在前端把数组转成逗号串）→ 扩展现有的逗号串写法正确，不要改成数组。
- 建 key 的服务端默认并不危险：扩展只发 New API 子集，读回仍是 `unlimited_quota: true`、**`unlimited_count: true`**、`status: 1`、`expired_time: -1`、`remain_count: 0`（unlimited 下无意义）→ 之前"我们建的 key 次数为 0 不可用"的猜测**不成立**，不要按那个改 payload。
- 令牌行完整字段（`GET /api/token/?p=0` 读回）：`id/name/status/key/key_format/key_mask/group/group_only/group_sort/group_primary_sort/group_ignore/remain_quota/unlimited_quota/used_quota/remain_count/unlimited_count/model_limits(_enabled)/allow_ips/exclude_ips/rate_limits/storage_location/fixed_channel_ids/fixed_key_index/max_channel_cost/mj_mode/mj_cdn/mj_cdn_addr/expired_time/created_time/accessed_time/DeletedAt`。扩展的 `NewApiTokenWrite` 是字段投影，写回时**丢掉其中约 15 个字段**（PUT 语义是否整条覆盖**尚未实测**）。
- 管理密钥作用域只有 5 个：`account:read`、`keys:read`、`keys:write`、`logs:read`、`usage:read`（`default_scopes` 为前三者之外的 `account:read`+`logs:read`+`usage:read`）。**没有** models/groups 相关作用域 → `/api/user/models`、`/api/token/group` 这类控制台端点靠加作用域解不开，服务端原话是 "This endpoint is not available to admin keys, sign in to the console instead"。
- 控制台额度列按部署的显示货币渲染（本部署显示 `¥`），而 `/api/user/self.balance` 与 `/dashboard` 是 USD（`$0`）；扩展编辑器把令牌额度标为"美元"，两处货币口径**未核对**。


### 用量与流水

- `GET /api/log/self/stat?type=...&start_timestamp=...&end_timestamp=...` → 200 `{data:{quota:0,rpm:0,tpm:0,mpm:0,unfinished_count:0,unfinished_by_vendor:{}}}`（`quota` 为配额单位，快路径可用）。
- `GET /api/log/self?type=1|2&p=1&page_size=5` → 200 `{data:{items:[],page:1,page_size:5,total:0}}`（`type` 过滤被接受）。
- `GET /api/user/checkin-history` → 200 `{"data":[]}`（站点把 `quota` 字符串转 number 后渲染）。

### 模型列表与定价

- `GET /api/user/models` → 200，**字符串数组**（账号可用模型，扩展默认端点即此，可直接用）。
- `GET /api/models` → 200 `{data:{"1":[...]}}`（渠道维度，与扩展无关）。
- `GET /api/pricing` → 200 `{success, message, data}`，`data` 是**对象**而非数组：`{global_rate_limit, group_info, level_info, model_info[688], user_info, vendor_info[37]}`。
  - `model_info[i]`：`{id, model_name, display_name, alias, description(_en), vendor_id, attachment, reasoning, tool_call, modalities{input,output}, limit{context,output}, model_kind, billing_kind, status, enable_groups:[...], metrics{avg_latency,token_speed}, effective_group_ratios{...}, price_config.original_price.{conditions[], prompt_tiers[]}}`。
  - 价格形状：`{quota_type, currency:"USD", input_token_price, output_token_price, cache_read_token_price, cache_create_token_price}`，**单位是 USD / 百万 token**（实锚：`gpt-4o` → 2.5 / 10 / 1.25；`gemini-2.5-flash` → 0.3 / 2.5 / 0.03；`gpt-image-1` → 5 / 40 + `image_token_price` 等）。`sora-2` 是 `quota_type:"time"` + `per_second_price`；`billing_kind` 取值分布（688 行）：`chat/token 253`、`chat/call 100`、`image_generation/call 75`、`video_generation/call 92`、`video_generation/time 43`、`music_generation/call 28`、`transcription/token 32` 等 → 同时覆盖 token / per-call / per-second 三类计费。
  - `prompt_tiers[]`（长上下文阶梯价）与 `conditions[]` 并存；`model_info[0]` 的 `prompt_tiers` 就是 `<272k` / `>272k` 两档。
  - `group_info[groupId] = {GroupRatio, DisplayName, Description, Official, Sort, ...}`；`vendor_info[i] = {id, name, icon, priority, site_visibility}`。
  - 扩展侧 `parseNativePricingResponse` 要求 `Array.isArray(data)` + `group_ratio` + `usable_group` → 本站直接抛 `Invalid New API model pricing response`。

### 签到与兑换

- 站点实现：`POST /api/user/checkin`，query 带 `timezone`（IANA，来自 `Intl.DateTimeFormat().resolvedOptions().timeZone`），站点启用了滑块验证时附带 `slide_captcha`；`GET /api/user/checkin` **404**（该 fork 没有 GET 读回）。
- 站点前台用 `status.enable_checkin === true` 决定是否显示签到入口，`status.slide_captcha === true` 时要求先过滑块；本部署 `enable_checkin:false` → 入口隐藏、签到实际不可用。
- 兑换：`POST /api/user/topup`，body 原样透传，成功响应 `{success, data}`，`data` 经站点"配额→金额"格式化后提示（与 New API 的 `{key}` + quota 返回大体一致，但未用真实兑换码验证）。

### 邀请

- `GET /api/user/aff` → 200 `data:"1RIfmo"`（扩展默认端点可用）。
- 站点在应用启动时读取 `new URLSearchParams(window.location.search).get("aff")` 并 `localStorage.setItem("aff", code)`，注册接口 `POST /api/user/register?...` body 带 `aff_code`；注册页路由 `/sign-up`（`/register` 也在路由表内）。→ 扩展现有 `"/register?aff=<code>"` 拼接可用。
- 另有 `PUT /api/user/aff/code`、`GET /api/user/aff/stats`、`/api/user/aff/logs`、`/api/user/aff/withdraw`。

## 根因

1. **检测**：`getAccountSiteType` 对本站只看域名规则、`/api/status.system_name`、HTML `<title>` 和 `/api/user/self` 的兼容头错误文案。白牌部署的 `system_name`/`title` 都是 `ePhone AI`，登录态下 `/api/user/self` 也不报错 → 返回 `UNKNOWN`，随后 New API 家族默认流程在 `fetchUserInfo` 因缺 `id` 抛 `invalidResponseFormat`。
2. **额度**：`fetchAccountQuota` 只读 `userData.quota`；本 fork 改为 USD `balance` → 恒为 0。
3. **定价**：`parseNativePricingResponse` 的数组信封假设不成立 → 整个模型价格能力不可用。
4. **分组**：`fetchUserGroups` 打 `/api/user/self/groups`（404），`fetchCurrentUserGroup` 读 `.group`（不存在）；`loadRequirements` 不吞异常 → 密钥供给/归位排查失败，`fetchCurrentUserGroup` 失败只会退化为 Unknown placement（fail-closed，不致命）。
5. **签到可用性**：可用性只看 `checkin_enabled`/`check_in_enabled`，本 fork 用 `enable_checkin` → `fetchSupportCheckIn` 返回 `undefined`（非 `false`），`isCheckInDisabled` 判否 → 扩展会认为可签到并去 POST，而站点关闭了该功能。
6. **站内跳转**：`RIX_API` 现有路径 `/log`、`/panel`、`/topup`、`/login` 属于旧版 Rix 控制台；6.x 控制台已改为 `/usage`、`/token`、`/billing`、`/sign-in`，且 `/api/status` 没有 `theme` 字段，现有 theme 驱动的路径改写不会触发。

## 适配方案

原则：**全部改成"新字段优先、旧字段兜底"的增量分支**，让已有 Rix 旧部署继续走原路径（这也是仓库既有变体的一贯做法，如 Veloera/V-API 的字段兼容）。

### T1 站点识别（结构性指纹，而非品牌名）

- 在 `src/services/siteDetection/detectSiteType.ts` 增加 `detectRixApiFromStatusSignature`：复用既有 owner `fetchSiteStatus` 读 `/api/status`，当响应含 `rix_version_message` / `rixapi_license_type` / `rix_license_enabled` 任一字段时返回 `SITE_TYPES.RIX_API`。
- 位置：与 VoAPI v2、Sub2API 的结构性探测同级，排在标题匹配之前（品牌名不可靠，结构性信号优先）。
- 与现有 `fetchPublicSiteStatusName` 共用同一次 `/api/status` 请求，避免重复拉取（把 Rix 判定并入该函数返回值或同一次响应处理）。
- 代码注释需按 `docs/agents/site-integrations.md` 记录来源与契约：上游为 `https://github.com/RixAPI/Rix-API`（New API 二开），本仓库无 Rix 协议文档；注释写明"现场观测 + 日期 + 字段样例"，并指向 `rixapi.com/update` 作为版本历史。
- 注意：现有标题正则 `makeTitleRegex("Rix-Api")`（=`\bRix[-_ ]?Api\b`）**已经能匹配 Rix 品牌部署**（如官方演示站 `platform.rixapi.com` 的 title "RixAPI"），缺的只是白牌部署的结构性识别；新增探测不得破坏前者。
- 测试：`tests/services/detectSiteType*.test.ts` 新增用例（含 status 探测失败、字段缺失回退到标题匹配、非 Rix 站点不误判）。

### T2 账号身份

- `src/services/accountSiteDefinitions/definitions.ts` 的 `SITE_TYPES.RIX_API` 增加 `productProfile.identity`：`{ usernameRequired: true, userIdRequired: false, storedUserIdentityFields: ["id", "username"] }`。
- 好处：新版 Rix（无 `id`）用 `username` 通过 `readCompatibleStoredUser` → `resolveStoredAccountUserIdentity` 解析出身份；旧版 Rix 仍优先用 `id`。
- **必须同时修兼容头**：Cookie 鉴权下 user-id 头被忽略，但 **token 鉴权下 `Rix-Api-User` 会被校验**（非数字 → 401「格式错误」、数字不匹配 → 401「与登录用户不匹配」）。因此身份一旦是 `username`，现有一并扇出 `Rix-Api-User` 的行为会让该账号在 AccessToken 模式下**每个请求都 401**。做法：RIX_API 下仅当身份为纯数字时发送 user-id 头；否则整体不发（新旧两代都不需要它）。该规则要落在 `src/services/apiTransport/request.ts` / `compatHeaders.ts` 的站点感知层，而不是改动全局扇出列表。
- 可选增强：需要数字 id 时，在已登录状态下从 `/api/pricing` 的 `data.user_info.id` 取（官方演示站实测 `2`，未登录为 `null`）；要不要为此多发一次请求建议先不做，除非要保留 AccessToken 鉴权。
- 测试：`tests/services/accounts/autoDetect*`、定义注册表用例，以及新增"非数字身份不得发送 `Rix-Api-User`"的请求头用例。

### T3 余额/额度

- 新增变体模块（建议 `src/services/apiService/newApiFamily/variants/rixApi.ts`）导出 `fetchAccountQuota`：读 `/api/user/self`，`typeof quota === "number"` 时沿用旧值；否则若 `balance` 是可解析数字串则返回 `Math.round(Number(balance) * QUOTA_PER_USD)`；否则 0（保持现有 default 的 0 语义，由 upper layer 判定健康度）。
- 换算依据：扩展全仓以 `QUOTA_PER_USD = 500_000` 为 USD↔配额基准（`src/constants/money.ts`、`accountPresentation`、`accountStorage/accountRefresh` 的手动余额输入），本站自身沿用同一基准（bundle 内 New API 上游余额探测预设为 `path:"data.quota", rate:1/5e5`）。
- 接线：`src/services/apiAdapters/newApi/accountData.ts`（`accountDataOverrides`）与 `accountRefresh.ts` 增加 `RIX_API` 条目；变体内按 `wong`/`doneHub` 既有模式组合默认的 `fetchTodayUsage` / `fetchTodayIncome` / `refreshSelectedStatus`（或先把 default 的 `fetchAccountQuota` 抽成可注入点，两者择一，倾向前者以贴合现状）。
- 测试：`tests/services/apiService/newApiFamily/accountDataVariants.test.ts`（`balance` 分支、`quota` 旧分支、非法/缺失值）。

### T4 分组（密钥能力依赖）

- Rix 变体覆盖 `fetchUserGroups`：先试 `/api/user/self/groups`（旧版），**该端点在 6.x 全线 404（已实测）**，失败即回落 `GET /api/token/group`（401/存在，已实测），把 `[{value, key, description, official}]` 映射为 `Record<groupId, {desc, ratio}>`；`ratio` 从 `/api/pricing` 的 `data.group_info[groupId].GroupRatio` 补齐，取不到时 1。
- 覆盖 `fetchCurrentUserGroup`：读 `use_group`（旧版 `group` 优先），两者都空时抛错 → `loadInheritedAccountGroup` 已吞异常并回落 Unknown placement（fail-closed）。
- `fetchSiteUserGroups`（`/api/group`；在 Rix 上是 301 到 `/api/group/`，且返回 `No permission`）在 Rix 下改用 `/api/token/group`，或明确降级。
- **密钥字段的字符串配额**：Rix 列表项把 `remain_quota` / `used_quota` 返回为字符串（实测 `"0"`），要在归一化层转成数字，否则编辑器/校验的相等比较会误判（写操作已实测可用，见上文）。
- **取密钥一律走揭示端点**：列表 `key` 只有 18 位无前缀，`POST /api/token/{id}/key` 返回带 `sk-ep-` 前缀的 24 位完整形态（`key_format` / `key_mask` 提供元信息）。为避免把半截密钥交付给用户，Rix 变体应像 WONG 一样固定走揭示端点。
- 测试：`tests/services/apiService/newApiFamily/keyManagement.test.ts`、`tests/services/apiAdapters/...` 相关 key resource 用例（含 provisioning 不再因 groups 404 整体失败、字符串配额归一、揭示路径固定）。

### T5 模型定价（独立票据，工作量最大）

- 新增 `normalizeRixApiModelPricingResponse`（建议 `src/services/apiAdapters/newApi/rixApiModelPricing.ts`），在 `modelPricing.ts` 里按信封形状分流：`Array.isArray(data)` → 现有 `normalizeNewApiModelPricingResponse`；`Array.isArray(data.model_info)` → Rix 归一化。
- 映射要点：
  - 行方言不止一种：本站与官方演示站都是 `price_config.original_price.conditions[]/prompt_tiers[]` 的显式 USD 价格；另一类旧 Rix 部署（见 `NiceAIGC/NiceApiManager`）在行上给 `price_info{quota_type, model_ratio, model_price, model_completion_ratio}` 的 New API 比率风格。主路径只做前者，后者按可选兼容处理，且以显式价格为优先通道。
  - **计费模式从 `price.quota_type` 推导**（`token` → tokens、`time` → 按秒、`call` → 按次 request），不要依赖 `model_kind` / `billing_kind`——官方演示站的 4 行两者都缺，只有本站是齐的。
  - `conditions[].rule` 是 DSL 字符串（实测 `usage.prompt_tokens > 200000`），优先复用仓库既有的 `parseNewApiBillingExpression`；解析不动的规则退化为 `PRICING_ISSUE_CODES.UNSUPPORTED_RULE` 交给诊断 UI，不要静默丢价。`prompt_tiers[]` 是同一信息的机器友好形式，优先用它建阶梯。
  - 行的**显式价格**（USD / 1M token、per-call、per-second）应走仓库既有的"显式价格"canonical 路径（AIHubMix 侧已有同类表达），而不是硬凑成 New API 的 `model_ratio`；`model_ratio = input_token_price / 2` 仅作为无显式价格通道时的退路。
  - `conditions[]` / `prompt_tiers[]` → 既有阶梯价/条件渲染（`PricingConditionDetails`、`ModelList/pricingScenario*`）。
  - `enable_groups` 已是数组（可直接 `normalizeGroupNames`）；`effective_group_ratios` / `group_info[].GroupRatio` → 分组倍率事实；`vendor_info` → 供应商注册表（`buildVendorRegistry` 同形）。
  - `modalities` / `model_kind` / `billing_kind` → 端点类型与 token/per-call/per-second 场景选择。
  - 一次 `/api/pricing` 同时提供模型、分组、供应商、`user_info`，避免多请求。
- 测试：`tests/services/apiService/newApiFamily/modelPricing.test.ts` 增加形状分流与字段映射用例；UI 侧复用现有定价诊断（`features/ModelList/pricingDiagnostics*`）核对。

### T6 签到可用性（只做"正确判定 + 不误发"）

- 在 Rix 变体里扩展状态字段读取：`checkin_enabled ?? check_in_enabled ?? enable_checkin`（`src/services/apiService/newApiFamily/default/accountBootstrap.ts` 的 `extractCheckInSupport` 与 `src/services/checkin/autoCheckin/providers/newApi.ts` 的 `isCheckInDisabled` 都要覆盖）。本部署 `enable_checkin:false` → 扩展应判为不支持并跳过，而不是 POST。
- 完整 Rix 签到（`POST /api/user/checkin?timezone=`、滑块验证、`/api/user/checkin-history` 读回）**推迟**：本站签到被关闭，且 `slide_captcha:true` 意味着开启签到的 Rix 部署需要滑块 token，无法在无可用部署时验证。留作后续票据，先在代码注释里记录已观测契约。

### T7 站内跳转路径（版本分代）

- `loadBootstrapFacts` 增加控制台分代事实（**用 `status.rix_version_message` 的主版本号 ≥ 6**，不要用 `version`：官方演示站 `version` 为 6.1.25 而 `rix_version_message` 为 6.5.17，`version` 只是部署构建号），在 `resolveNewApiAccountRoutePath`（`src/services/apiAdapters/newApi/accountRoutes.ts`）里对 `RIX_API` 选用 6.x 路径表：`login /sign-in`、`usage /logs`、`checkIn /profile`、`adminCredentials /profile`、`redeem /billing`；缺字段或解析失败时保留旧路径表（`/login`、`/log`、`/panel`、`/topup`）。6.x 路径已在官方演示站独立复核。
- 邀请链接无需改动：站点在任何路由启动时都读 `?aff=` 并落 localStorage，扩展现有 `"/register?aff=<code>"` 已可用（`/register` 在路由表内）。

### T8 站点公告（可选，不阻塞）

- 本站 `/api/status` 没有 `announcements`，但有 `banner.items[]`（含 `content`/`content_en`/`link_url`）与 `homepage_slideshow`、`/api/messages`、`/api/updates`。若需要公告能力，另开票据把 `banner.items[]` 映射为结构化公告；issue #1379 未要求，列为可选。

### T9 部署级方言记忆（探测一次，本会话记住）

- 同为 `rix_version_message: 6.5.17` 的两个部署在端点集合上并不一致（ePhone 已移除 `GET /api/user/token`，官方演示站仍在），所以"哪条路能应答"只能问一次才知道；但也不该每次刷新都重问。新增 `src/services/apiService/newApiFamily/variants/rixApiDialects.ts`：按 `baseUrl` 记住每条方言上一次是谁应答（分组端点 `/api/token/group` vs `/api/user/self/groups`；账号模型列表用会话 vs 凭据；`/api/pricing` 用凭据 vs 匿名），下次从那一条开始，若它不再应答则回退到其他候选并更新记忆。
- 记忆只在内存里（会话级、最多 100 个部署），不落存储；记错会自愈（记住的选择失败时会重试其他候选），因此不需要清理入口。
- 分工：版本号只用于控制台路由分代（T7，`rix_version_message` 主版本 ≥ 6 换路径表）；端点半径与鉴权策略用探测 + 记忆（T9）。策略类行为（`/api/user/models` 拒绝管理密钥、逐动作 step-up 验证、`enable_checkin`）无法按版本号判定，也不记忆，每次都按服务端当前回应处理。
- 已不需要记忆"这台部署有没有 PAT 端点"：Rix 的 `getOrCreateAccessToken` 现在直接签管理密钥（`src/services/apiService/newApiFamily/variants/rixApi.ts`），不再发那次注定 404 的请求。

### T10 部署自带字段的编辑（用户选定范围：常用 4 项）

- 编辑器（`src/services/apiAdapters/newApi/keyResourceEditor.ts` + `features/KeyManagement/presentation/nativeKeyResourceFieldPolicy.ts`）对 `RIX_API` 额外呈现 4 组字段：`unlimited_count`/`remain_count`（次数额度，与美元额度并列）、`exclude_ips`、`storage_location`（`global` 全球节点 / `none` 不转存 / 未配置）、`group_only`（仅使用选定分组，校验要求同时选定分组）。
- 新建 key 默认 `unlimited_count: true`（与服务端默认一致，避免"次数用尽"）；`group_only` 默认沿用行的值（新建为 false，即保持现状不改变行为）。
- 未呈现但**保真回写**的字段（控制台里改、扩展里编辑不丢）：`rate_limits`、`group_sort`/`group_primary_sort`/`group_ignore`、`fixed_channel_ids`/`fixed_key_index`/`max_channel_cost`、`mj_mode`/`mj_cdn`/`mj_cdn_addr`、`storage_location` 之外的其它列。
- 写入形状已用探针在真机验证（设置与回写保真均成立）；UI 呈现与新建默认值尚未在真机点过。
- **按世代呈现**（`1f37648d2`）：这 5 个列只在**已探测为 6.x**（或尚未探测/未上报核心版本）时呈现；探测为 6.x 之前时编辑器回落到 New API 字段集，且写体里也不会出现这些列。判定复用 T7 那份按 `baseUrl` 缓存的 `rixApiMajorVersion`（新增同步读取口 `reportsRixApiV6TokenColumns`），字段策略则跟随编辑器实际声明的字段列表，避免"策略与字段集不一致"抛错。
- 遥测（PostHog，2026-09-28 直查）：近 90 天带 Rix 账号的设备 273 台（占有站点类型设备的 ~2.2%），近一年 396 台 / 4,524 事件（19 个站点类型里排第 8）；月度 272→287→210→194→199 持平略降；**遥测里没有站点核心版本字段，无法区分世代**。

### 非目标

- 托管站点（channel/option/admin）能力：本站有 `/api/admin/**` 一整套，但属于独立轴，issue #1379 只要账号侧能力。
- 兑换（`POST /api/user/topup`）：端点在、路径在、信封像 New API，但没有真实兑换码可验证 payload/返回值，保持现有默认实现，若要验证请提供一枚可用兑换码（或明确授权用账号自购/自助兑换码）。
- 站点侧 `credit_*`（授信）、`agent_*`（代理/供应商）、发票、订单、实时支付：不在 issue 范围内。

## 能力矩阵（对照 issue #1379 的勾选项）

| 能力 | 现场结论 | 适配动作 |
| --- | --- | --- |
| 刷新余额/额度 | `quota` 不存在，改 `balance`(USD) | T3 |
| 管理 API Key | 列表/详情/创建/更新/删除/揭示端点齐备；分组端点不同；列表项仍用 New API 字段 | T4（分组），T2 解阻塞；建 key 字段需一枚真实 key 复核 |
| 模型列表 | `/api/user/models` 直接可用 | 无需改动 |
| 模型价格 | `/api/pricing` 自定义信封，当前直接抛错 | T5 |
| 签到流程 | 部署侧关闭（`enable_checkin:false`），且 `slide_captcha:true` | T6（正确判定 + 不误发） |
| 兑换流程 | 端点/信封疑似兼容，未用真实码验证 | 保持默认，待验证 |

## 未验证项（实施时需先确认，或需用户授权/输入）

1. PAT：**已查明并已修**——ePhone（app 6.5.17）上 `GET /api/user/token` **不存在（404）**，官方演示站（app 6.1.25）仍存在（401），即新版构建移除了该端点；且 `fetchUserInfo` 硬要求 `id`，两处都会让添加账号失败（用户实测报错 "Account access token could not be obtained"）。实现改为：身份按账号定义声明的字段解析（`id` → `username`），访问令牌端点缺失时把账号记为 Cookie 鉴权并继续完成添加；其他站点类型行为不变。仍未做的是"在 ePhone 上生成一枚 PAT"——该端点在本站不存在，已无必要。
2. 密钥创建/更新/[已关闭] ~~字段契约~~：实测用扩展现有 payload（不带 `unlimited_count` / `fixed_key_index`）即可创建成功，**这两个字段不是必需的**；列表/详情/揭示/删除全部可用。剩余注意点是字符串配额与"始终走揭示端点"，已并入 T4。
3. 签到读回：`GET /api/user/checkin` 在本 fork 404，只有 `/api/user/checkin-history`（当前为空数组，无法确认是否含"今日已签"字段）。若将来做 Rix 签到，需要一条历史记录样本或一个开启签到的 Rix 部署。
4. 兑换：需要一个真实兑换码样本才能确认请求体字段与返回单位。
5. `size` 被忽略：服务端按默认 10 条分页。扩展 `fetchAllItems` 依赖元数据 `page/page_size/total` 推断 hasMore，理论上正确；实施时用 >10 个 key 的账号复核翻页（当前账号无 key 无法验证）。

## 验证策略

- 检测：`tests/services/detectSiteType*.test.ts` 加 Rix 指纹用例与"非 Rix 不误判"反例，全部用中性 fixture，不写真实域名（沿用既有约定）。
- 账号数据/额度：`accountDataVariants.test.ts`；密钥：`keyManagement.test.ts` + `accountKeyResource` 相关；定价：`modelPricing.test.ts`。
- 端到端：本站需要线上真实登录态，无法进 CI；用 DevPanel fixture（`features/DevPanel/fixtureAccounts.ts`）构造 `balance`-only 的账号快照，保证 UI（余额、明细、定价诊断）在无网络下可回归。
- 手工验收：用本 spec 的登录会话复跑本文件"现场证据"里的每条 GET，比对字段；变更后确认自动识别能在 `/dashboard` 直接识别为 `Rix-Api`、余额显示 `$0`、模型价格页有价、签到显示不支持。

## 实施顺序建议

T1 → T2 → T3（这三步即可让 issue 的"识别不到 / 取不到余额"闭环）→ T4 → T6 → T7 → T5（定价单独排期）。每一步按 TDD：先写失败测试，再改动，最后重构并保持测试绿。
