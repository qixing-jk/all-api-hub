# AI 发财网网关、Site Type 与 UI 来源调查

调查日期：2026-11-17（Asia/Singapore）。目标：[公开首页](https://ai.facai.cloudns.org/)及 [/dashboard](https://ai.facai.cloudns.org/dashboard)。

2026-11-23 实施后记：扩展创建流程已实现，发财网实际 Linux DO 创建、保存与无 Cookie 刷新通过；见 [规格交付记录](spec.md)及 [本地验收报告](artifacts/acceptance.md)。下文保留实施前调查，不代表最终能力。

2026-11-23 续查：独立 CDP 浏览器中的真实自动添加结果见下一节。网关分类成立，但自动添加未完成，不能据此称为完整兼容。

## 自动添加兼容性复现（2026-11-23）

本次继续处理“无法兼容，起码无法自动识别”的反馈。测试源码为 `219d1fdc18`，开发扩展版本 `4.11.0`，加载路径为本工作区 `.output/chrome-mv3-dev`；没有修改产品代码。已 fetch；当时 `origin/main` 为 `c058947641`，领先 4 个提交。核对这些提交后，本文涉及的站点检测、浏览器会话提取和 New API 账户补全文件没有差异。日用 Edge 安装版本也为 `4.11.0`，但本次功能结果来自独立 Chromium 的源码开发构建，不能等同于日用商店包验收。

**结论：当前源码能通过登录会话识别 `new-api` 并读取身份，但账户补全被管理令牌验证要求阻断，且默认令牌引导页在该定制前端不存在。** 本次没有完成保存、刷新或签到验收。

| 检查 | 实际结果 | 证据和边界 |
| --- | --- | --- |
| 复用日用 Edge 认证 | 已迁移到独立 CDP Chromium，网站正常刷新和 `/api/user/self` 均 HTTP 200，目标身份与源账户一致 | `new_api_refresh` 是 HttpOnly Cookie，路径为 `/api/user/auth`；按根 URL 读取只会得到两个非认证标记 Cookie。按实际刷新端点读取后迁移成功。旧 localStorage 中的 `__agwt_rt` 不能单独恢复当前登录。临时认证文件已消费并删除。 |
| 默认 Access Token 模式自动检测 | 先得到 `unknown`，随后 `new-api-auth-bundle` 探测成功，自动填入 `new-api`、站名、用户名和正确用户 ID | 诊断事件 `site_detection_finished: success`，随后进入 `account_completion_started`。本次约 24 秒，不能把等待期间或最终补全失败解释成完全没有识别身份。 |
| 默认模式凭证补全 | `access_token_verification_required`；显示“Enter an Access Token manually”，保留身份，Access Token 字段为空 | 现代 Dashboard Bearer 只供本次补全使用，不能直接当作长期账户管理凭证保存。源码通过 `/api/user/access_tokens` 的只读探测识别 scoped token 契约后要求网站安全验证，未直接创建 scoped token。 |
| 选择 Cookie 后自动检测 | 同样识别为 `new-api`，最终仍为 `access_token_verification_required`，恢复表单切到 Access Token | 本次走 `background_temp_context`，约 48 秒。切换 Cookie 不会绕过现代 New API 的管理凭证要求；没有完成 Cookie 账户保存/刷新。 |
| “Open token page” | 实际打开 `https://ai.facai.cloudns.org/security#security-access`，显示 404 | 当前 New API 通用凭证页解析没有找到该定制前端的可用管理令牌页面，最后采用默认路径。 |
| 网站个人设置 | `/settings` 的“账户”页将“API 令牌”导向 `/tokens`；“安全”页仅显示修改密码 | `/tokens` 是推理 API 密钥管理入口；未找到可核验的账户管理 Access Token 创建/验证 UI。不能把推理密钥填入扩展管理令牌字段作为已验证方案。 |

源码责任点：

- [站点检测](../../src/services/siteDetection/detectSiteType.ts)：域名、标题、公共状态及兼容错误检测；本部署在该阶段仍为 unknown。
- [New API 会话探测](../../src/services/accountSiteOnboarding/contentSession/newApiAuthBundle.ts)与[探测协调](../../src/services/accountSiteOnboarding/contentSession/extraction.ts)：通过真实 AuthBundle 确认协议和身份。
- [账户补全](../../src/services/apiAdapters/newApi/account/accountCompletion.ts)、[凭证契约探测](../../src/services/apiService/newApiFamily/default/accessTokenDialect.ts)和[管理令牌获取](../../src/services/apiService/newApiFamily/default/accountBootstrap.ts)：区分短时 Dashboard Bearer 与管理 Access Token，并保留安全验证要求。
- [凭证页面解析](../../src/services/apiAdapters/newApi/variantOperations/credentialPage.ts)：定制 Next.js 前端尚无已证实的管理令牌入口可供选择。

后续完整适配的缺口是可用的管理凭证获取/验证流程及其网页入口，需要先确认该部署实际提供的契约；仅添加域名或标题规则不能补足它。不能根据本站自报版本推断精确私有 fork，也不能把本次分类成功当作余额、密钥操作、签到等完整兼容的证据。

本地证据保留于 `test-results/facai-detection/`（已忽略）：`detection-summaries.json` 为扩展自身的脱敏诊断摘要，`default-auto-detect.png` 与 `credential-guidance.png` 为实际 UI，`credential-guidance.txt` 为最终引导文本。供本地复查，截图含当前账户展示信息，不纳入 Git。历史 Playwright 页面快照保留在 `test-results/playwright-cli/`。没有删除会话 transcript，也没有提交认证数据。

迁移清理复查：目标使用共享的刷新 Cookie 后发生轮换，日用 Edge 的旧 Cookie 返回 401。已关闭目标站点标签页，使用源站页面范围的临时响应回写最新 HttpOnly 刷新 Cookie（桥接拒绝全局 `Storage.setCookies`，该临时响应没有发到服务器），随后日用 Edge 正常加载 Dashboard，真实 `/api/user/self` HTTP 200 且身份与迁移前一致。目标站点 Cookie 和临时认证文件随后清理。此结果要求未来迁移先考虑轮换与源浏览器恢复，不能将两个复制的刷新 Cookie 当成独立登录会话。

New API 对照源码采样 revision：`669d774976369e986f03b6e24fff1042f6f94832`（调查时 main）。

## 长期认证可行性（2026-11-23）

后续用户已将主题明确为由 All API Hub 自己提供安全验证和管理令牌创建 UI，并要求覆盖后端提供的常规验证方式，而非只覆盖当前账号的 Linux DO。实现范围和待验收矩阵见[任务规格](spec.md)；下文保留为本站实际调查证据。

**建议优先补齐 scoped PAT（账户管理令牌）的安全验证和签发流程；网页会话作为获取或恢复凭证的入口。** 本站已实际暴露管理令牌目录、列表和验证方式接口。当前账户必须通过已绑定的 Linux DO OAuth 重新验证，不能只凭现有登录会话无交互签发。尚未创建 PAT、发起 OAuth 验证或完成 PAT 保存/刷新，因此这是有部署证据的实施方向，不是已交付的长期认证支持。

本次复用日用 Edge 的正常 Dashboard 加载，捕获网站自行刷新的短时 Bearer；仅将该 Bearer、期望身份和 SID 临时传至独立 CDP Chromium 的内存。目标端使用一个本地响应承载的同源空页面，所有探测均为 `GET`、`credentials: "omit"`，不加载站点脚本、不复制或刷新 Cookie。真实 `/api/user/self` 在探测前后均 HTTP 200，身份与源账户一致；目标认证路径 Cookie 列表为空。最后源浏览器正常刷新 Dashboard，真实 `/api/user/self` 再次 HTTP 200 且匹配页面身份，任务标签页已关闭、桥接已 detach。临时凭据文件消费后删除，内存中的凭据引用已清除。

### 部署实测与期限

| 只读观察 | 结果 | 结论边界 |
| --- | --- | --- |
| 正常登录刷新返回的 AuthBundle / JWT | `exp - iat = 900` 秒；`session.expires_at - session.created_at = 2592000` 秒；登录方式 `oauth:linuxdo` | 当前网页 Bearer 为 15 分钟，当前登录会话为 30 天。 |
| `GET /api/user/sessions` | HTTP 200，当前会话的创建/到期时间与 AuthBundle 一致 | 可读到固定会话截止时间；不是只根据 Cookie 的 Max-Age 推测。 |
| `GET /api/user/access_tokens` | HTTP 200，`items: []`、`legacy: null` | 当前无可复用的 scoped PAT，也没有返回 legacy PAT 记录；列表不会提供旧 PAT 的明文。 |
| `GET /api/user/access_tokens/catalog` | HTTP 200，`default_expiry_days: 30`、`max_tokens: 20`，返回个人权限目录 | 30 天是目录默认值，不是已证实的最长有效期；该接口没有返回最大期限或“允许永不过期”字段。 |
| `GET /api/verify/methods?scope=access_token.generate` | HTTP 200；唯一方法为 `oauth` 且 `available: true`；提供方为 `linuxdo` / `Linux DO` | 当前账户的创建令牌验证路线明确。没有 password、2FA、Passkey 或 session 方法可选；未真正发起或完成 OAuth 验证。 |

脱敏响应样本：

```json
{
  "catalog": { "default_expiry_days": 30, "max_tokens": 20 },
  "verification": {
    "scope": "access_token.generate",
    "methods": [{ "method": "oauth", "available": true }],
    "oauth_providers": [{ "slug": "linuxdo", "name": "Linux DO" }],
    "password_encryption_enabled": false
  }
}
```

本轮上游对照固定为官方 tag `v1.0.0-rc.41` 的 commit `2035a82aeb5414253a728bd937d4b8f97aa99b9b`；本站自报版本仍不足以证明运行此 commit。以下期限和行为属于上游契约，须与上表部署实测区分：

- [PAT 创建控制器](https://github.com/QuantumNous/new-api/blob/2035a82aeb5414253a728bd937d4b8f97aa99b9b/controller/access_token.go)接受 `expires_at: 0`，有期限时至少一小时，没有额外最大期限检查。[模型](https://github.com/QuantumNous/new-api/blob/2035a82aeb5414253a728bd937d4b8f97aa99b9b/model/user_access_token.go)仅在 `expires_at > 0` 时检查到期，因此 `0` 表示永不过期。**本站是否接受永不过期或某个长期限，尚未通过签发验证。**
- 同一控制器新建独立 PAT 记录，不覆盖已有 PAT；明文仅在创建响应返回一次。PATCH 可改名/权限，没有修改有效期字段。有限期 PAT 到期后，应经浏览器会话重新验证并签发替代令牌，不能靠该 PAT 自行续期。
- [PAT 使用契约](https://github.com/QuantumNous/new-api/blob/2035a82aeb5414253a728bd937d4b8f97aa99b9b/docs/authentication.md#pat-调用契约)使用 `Authorization: Bearer <pat>`，不依赖网页刷新 Cookie；管理 PAT 和登录会话的接口仍只接受浏览器会话。PAT 可被撤销，到期或账户删除会失效；禁用期间不可用，实际授权仍受当前权限限制。“永不过期”不代表永远有效。
- [会话创建与 Cookie 写入](https://github.com/QuantumNous/new-api/blob/2035a82aeb5414253a728bd937d4b8f97aa99b9b/service/auth_session.go)使用初始会话截止时间；[刷新轮换](https://github.com/QuantumNous/new-api/blob/2035a82aeb5414253a728bd937d4b8f97aa99b9b/model/user_session.go)更新 refresh hash 和活跃时间，不延长 `expires_at`。因此正常刷新可以在会话期限内换取短时 Bearer，不能无限续命。30 天是本次观察的总期限，不是从每次刷新再算 30 天。

### 获取流程与产品落点

建议的用户路径是“自动识别 → 查看授权用途/期限 → Linux DO 安全验证 → 创建专用 PAT → 校验身份与所需能力 → 保存账户”。长期候选为明确选择的长期限或永不过期 PAT；在实际签发确认之前，不承诺本站支持永久授权。当前代码的[账户补全](../../src/services/apiAdapters/newApi/account/accountCompletion.ts)已能验证并复用用户提供的管理令牌；缺少的是通过安全验证取得新 PAT 的流程，而非新的 Site Type。

官方协议提供以下实施依据，但本轮未执行其中的写请求：

1. 从部署目录取得可授予 scope，并用 `GET /api/verify/methods?scope=access_token.generate` 选择实际可用方式。
2. 对当前账户，使用浏览器会话发起 `POST /api/oauth/state`，`provider: "linuxdo"`、`intent: "verify"`、`scope: "access_token.generate"`；`context` 必须绑定最终选择的 `scopes` 和 `expires_at`。这是一次操作验证，不是普通 `intent: "login"`。见[OAuth 控制器](https://github.com/QuantumNous/new-api/blob/2035a82aeb5414253a728bd937d4b8f97aa99b9b/controller/oauth.go)。
3. 由同一账户、同一会话完成 OAuth 回调并取得 proof；该 proof 同时绑定身份、会话、操作、scope 集合和期限。不得用已有的 `channel.key.read` proof 替代，或在验证后改变授权参数。见[安全验证契约](https://github.com/QuantumNous/new-api/blob/2035a82aeb5414253a728bd937d4b8f97aa99b9b/service/security_verification.go)。
4. 带 proof 调用 `POST /api/user/access_tokens`，保存唯一一次返回的明文；只用新 PAT 再读 `/api/user/self` 和所选能力接口，确认身份后才写入账户。签发响应丢失时不得盲目重试创建。
5. 后续账户请求使用 PAT。若被撤销/到期，恢复到同一账户的浏览器验证流程；网页登录过期才要求重新登录。不要把会话 401 自动解释成 PAT 失效，反之亦然。

该站 `/security#security-access` 已实测 404。本轮只读检查公开 `/oauth/linuxdo` 页面及其 [callback chunk](https://ai.facai.cloudns.org/_next/static/chunks/app/oauth/%5Bprovider%5D/page-3e3406982c705574.js)：页面组件只处理 `message === "bind"` 返回设置，或有 `user` 时登录并返回 Dashboard；没有可见的 proof 完成分支。共享 OAuth 辅助 chunk 本轮读取超时，因此不能声称整个前端所有代码都不支持 proof；但不能把当前页面当作已验证的授权回调。实现需要明确拥有并验证这个 continuation，或由站点补齐标准令牌管理/验证页面。另尝试公开 API 域名 `https://api.facai.cloudns.org/security` 未能取得响应，不能把它宣传为可用备用控制台，也未向该域名发送账户凭据。

本站返回的个人 scope 目录与[上游路由要求](https://github.com/QuantumNous/new-api/blob/2035a82aeb5414253a728bd937d4b8f97aa99b9b/middleware/access_token_routes.go)支持如下最小授权设计；仅目录已实测，尚未以真实 PAT 验收这些调用：

| 目标能力 | 所需授权 |
| --- | --- |
| 身份/余额、用量、钱包/签到状态、API 密钥列表 | `profile:read`、`usage:read`、`wallet:read`、`api_key:read`，按实际启用功能选择 |
| 创建/编辑/删除推理 API 密钥 | 增加 `api_key:write` |
| 复制/导出完整推理 API 密钥 | 增加 `api_key:reveal` |
| 执行签到 | 增加 `wallet:write`；同一上游 scope 也覆盖充值、订阅支付和推广余额转移，授权说明需告知其范围 |

普通账户读取和密钥管理无需默认授予 `profile:write` 或 `account_security:write`。新 PAT 的多账户隔离应按已保存的 origin 和身份维持；不能因同源浏览器当前登录了另一个用户而替换凭据。

可更新网页会话是备选方案：[现有 authenticatedSession helper](../../src/services/apiAdapters/newApi/account/authenticatedSession.ts)已经能从拥有的网页上下文取得 AuthBundle、验证身份并建立短时请求，但其当前调用用途不等同于普通账户刷新能力。若选此方案，仍需增加常规账户请求接入、刷新并发协调、轮换后写入/发送验证、同源多账户隔离、截止时间和重新登录引导；本轮没有将其接入产品。相比之下，独立 PAT 更适合后台使用，也避免复制轮换 Cookie 所导致的会话争用。

### 证据保留与完成边界

本地 `test-results/facai-lifetime/`（已忽略）保留 `bundle-metadata.json`、`readonly-responses.local.json`、公开 OAuth HTML/chunk，以及 `upstream/` 中的固定版本对照源码。响应文件含会话元数据，仅供本地复核，不提交 Git。`capture.cjs` 是仅用于本轮的桥接捕获片段，其返回值含短时凭据，运行时必须由外层私下消费，不能直接输出到工具日志。临时 `transient-bearer.private.json` 已删除。

复核方法：日用 Edge 正常加载时捕获 AuthBundle；独立 CDP 同源空页面使用短时 Bearer、`credentials: "omit"` 依次 GET 上表路径；先后用 `/api/user/self` 核对相同身份；仅记录期限、目录和验证方式。不得调用 legacy `GET /api/user/token`（其会旋转凭据），不得把创建 PAT 或发起 OAuth 验证当成只读探测。原始 session transcript 未修改。

尚缺的最终验收是：真实 Linux DO 验证、本站接受选定长期限/`expires_at: 0`、一次性 PAT 签发与必要的撤销恢复、扩展正常保存及后台刷新、实际选用 scope 下的能力验证。本轮没有创建令牌、执行签到或修改产品代码；只读部署证据足以确定下一步应补齐 scoped PAT 获取路径。

## 网关与 Site Type：日用 Edge 登录态核验

**All API Hub 的分类结论为 `SITE_TYPES.NEW_API`，值为 `"new-api"`；适配器族为 `NewApiFamily`。** 网关属于 [QuantumNous/new-api](https://github.com/QuantumNous/new-api) 这一条上游线路，站点使用单独的 Next.js 控制台。现有证据没有识别出需要归为另一种 Site Type 的独有分支协议，也不能证明服务器运行的是未经修改的官方构建。[S9][S13][S17][S18]

2026-11-17 通过 Playwright 扩展桥接连接用户的日用 Edge。先核对 Edge 主进程使用普通用户数据目录，另两个进程使用明确的 `AllApiHub/dev-browser-*` 开发目录；日用根目录 `profile.last_used` 为 `Profile 2`。随后在该实例打开目标 Dashboard，确认用户现有登录态可用。[S17]

以下均来自网站正常加载时的网络响应，只保留字段结构和成功状态；没有导出访问令牌、用户身份值或 Cookie：[S17]

| 实际请求 | 观察结果 | 分类意义 |
| --- | --- | --- |
| `POST /api/user/auth/refresh` | 网站自行刷新登录态，HTTP 200、`success: true`；`data` 含 `access_token`、`token_type: "Bearer"`、`access_expires_at`、`session`、`user`；`session` 有 `sid` 和 `current: true` | 与仓库已支持的现代 New API Dashboard AuthBundle 契约吻合。[S19] |
| `GET /api/user/self` | HTTP 200、`success: true`；包含 `id`、`quota`、`used_quota`、`request_count`、`aff_quota`、`linux_do_id`、`permissions` 等字段 | 身份、余额和账户结构与 New API 对应；此次实际请求使用 Bearer，未带 `New-Api-User` 请求头。 |
| `GET /api/token/?p=1&page_size=100` | HTTP 200、`success: true`；分页形状为 `data.page/page_size/total/items`；该账户列表为空 | 确认普通密钥列表接口契约，未验证新建、编辑、删除或密钥内容读取。 |
| `GET /api/log/self/stat` | HTTP 200、`success: true`；`data` 包含 `quota`、`rpm`、`tpm` | 用量统计契约与 New API 对应。 |
| `GET /api/user/checkin?month=2026-11` | HTTP 200 | 观察到 New API 签到状态接口；没有触发签到。 |

登录后的 DOM 保持在 `/dashboard`，标题为“控制台 | AI 发财网”，主标题为“仪表盘”，侧栏包含 `/tokens`、`/logs`、`/topup`、`/orders`、`/pricing`、`/settings`。因此上一轮“鉴权后的 Dashboard 尚未查看”的证据缺口已补足。[S17]

站点自报 `version: "v1.0.14"`，但读取官方 `git/ref/tags/v1.0.14` 返回 404。该值不足以锁定官方同名版本、私有 fork 名称或后端实际构建 revision。**分类可明确为 `new-api`；精确私有分支来源仍未确认。**[S9][S16]

此处是依据真实协议作出的分类，不是扩展自动识别、自动获取凭证或保存账户的验收结果；本次没有修改站点分类代码或扩展配置。[S18][S19]

## 前端技术结论

| 层次 | 判断 | 证据与限度 |
| --- | --- | --- |
| 页面框架 | **确认 Next.js App Router / React** | HTML 引用 `/_next/static/chunks/app/(console)/dashboard/…`，包含 `self.__next_f` 和 RSC 路由树。[S1] 浏览器另实测 `window.next.version === "14.2.5"`。 |
| CSS | **确认 Tailwind CSS 3.4.10** | 公开 CSS 中保留 `! tailwindcss v3.4.10` 许可证注释，且有 `bg-background`、`text-muted-foreground` 等工具类。[S2] |
| 无样式交互组件 | **确认 Radix UI** | JS 中包含 `Symbol.for("radix-ui")`、`Symbol.for("radix.slottable")`、`data-radix-popper-content-wrapper`、`data-radix-menu-content`、`data-radix-focus-guard`。其 Primitive 实现与 Radix 官方源码一致。[S3][S4][S5][S10] |
| 上层组件样式 | **高概率为 shadcn/ui 衍生或仿照其结构的组件** | Button 使用 CVA 风格 `variants/defaultVariants`、`cn`、`forwardRef`、`asChild` / Slot，以及 `default/secondary/outline/ghost/destructive/link` 变体；Dialog 的 Portal/Overlay/Content/Close 包装和语义颜色变量也符合其惯例。[S2][S6][S11] 没有站点源码仓库或 manifest，不能确认作者实际安装过 shadcn CLI，也不能确定具体 registry/template。 |
| 图标 | **确认 Lucide React 0.452.0** | 公开 JS 许可证标明 `lucide-react v0.452.0`，首页 SVG 也有 `lucide` 类。[S7][S12] |
| 仪表盘图表 | **确认路由依赖包含 Recharts** | dashboard 引用的 chunk 含 `recharts-area`、`recharts-bar`、`recharts-cartesian-axis` 等实现。[S1][S8] 仅确认该路由包含此依赖，未声称登录后每个图表都使用它。 |
| 业务 API | **高度可信地属于 New API 系列/兼容分支** | 两个域名的公开 `/api/status` 返回相同状态内容，具有 `HeaderNavModules`、`SidebarModulesAdmin`、`password_login_encryption_enabled` 等成组字段；同组字段由 New API 上游 `controller/misc.go` 输出。前端还请求 `/api/token/`、`/api/log/self/`、`/api/user/checkin` 等兼容路由。[S6][S9][S13] |
| 整站开源来源 | **本次未定位到同一套整站的公开仓库或可核对模板** | 首页仅有 `Powered by vx:aimiertao`，未链接代码仓库。[S12] 公开 GitHub 搜索域名、站名和该署名，没有找到可与本站路由、样式和组件源码对应的整站项目。[S14] 未找到不能证明未开源。 |

“很多站点都见过”的观感，与 Radix + Tailwind / shadcn 体系广泛复用的按钮、弹窗、语义颜色和布局结构相符。这是基于已确认组件技术的解释；**不能把类似观感当成多个站点共用同一整站模板的证据**。[S2][S3][S4][S5][S6][S11]

## 关键可复核样本

### 页面框架和部署响应

公开 `/dashboard` HTML 的原始证据：[S1]

```text
/_next/static/chunks/app/(console)/dashboard/page-54e4f2e625d682e8.js
/_next/static/chunks/app/(console)/layout-d14c55b2f690707e.js
self.__next_f
initialTree: ... (console) ... dashboard ... __PAGE__
buildId: eFPnNPFRIRCarwv9xeHAg
```

响应头包含 `Server: cloudflare`、`vary: RSC, Next-Router-State-Tree, Next-Router-Prefetch`、`x-vercel-cache: HIT` 和 `x-vercel-id`。可确认 Cloudflare 前置及 Vercel 响应指纹；这些响应头不证明独立业务 API 的实现语言或部署平台。[S1]

### Radix 与 shadcn 风格的区别

Radix 的证据是明确的库实现标志，而不只是外观：[S3][S4][S5][S10]

```text
window[Symbol.for("radix-ui")]=!0
Symbol.for("radix.slottable")
data-radix-popper-content-wrapper
--radix-popper-transform-origin
data-radix-menu-content
data-radix-focus-guard
```

本站 Button 模块 `495` 的部分原始结构：[S6]

```text
variants: { variant: { default, secondary, outline, ghost, destructive, link }, size: ... }
defaultVariants: { variant: "default", size: "default" }
forwardRef(... { className, variant, size, asChild: ... } ...)
className: cn(...)
displayName = "Button"
```

Tailwind CSS 定义 `--background`、`--foreground`、`--card`、`--primary`、`--muted`、`--radius`，浅色主色为 `--primary:24 70% 50%`，具有站点自己的配色。官方 shadcn Button 源码也使用 `cn`、CVA、Slot、相同的语义变体；但当前官方实现的具体代码和样式与本站不完全相同，因此结论保留为“shadcn 衍生高概率”。[S2][S6][S11]

### New API 业务接口与单独前端

只读、未登录的两个公开地址返回相同状态内容：[S9]

```json
{
  "version": "v1.0.14",
  "server_address": "https://api.facai.cloudns.org",
  "quota_per_unit": 500000,
  "HeaderNavModules": "...",
  "SidebarModulesAdmin": "...",
  "password_login_encryption_enabled": false
}
```

New API 上游 `controller/misc.go` 在 `gin.H` 中输出上述同名字段。多个独特配置键与一组兼容 API 路由共同吻合，比仅观察 OpenAI `/v1` 接口更有识别价值。[S6][S13]

本站前端自身的 `/api/status` 与 `api.facai.cloudns.org/api/status` 内容一致，且状态自报 `server_address` 为 API 域名，说明两者暴露同一组业务状态；未取得服务器配置，不能断言具体 rewrite/proxy 实现。[S9]

**不要把 New API API 指纹与 Next.js 前端混为一体。** 调查时读取的 New API 当前公开 `main/web/package.json` 使用 `rsbuild dev/build`、React 19、Tailwind 4 与 Base UI；本站资源则为 Next.js 14、Tailwind 3 与 Radix。这支持本站前端与当前上游前端存在差异，但没有足够证据指认其 fork、作者或全部代码来源。[S1][S2][S3][S4][S15]

本次直接读取 New API 的 `/v1.0.14/web/package.json` 与 `/v1.0.14/controller/misc.go` 原始链接均返回 404。因此，`/api/status` 自报的 `v1.0.14` 只作为本站观察值，不能直接对应官方 tag。[S16] New API 上游有 Go 源码，不等于本次已独立证明本站业务服务实际运行的语言；兼容实现与分支仍有可能。[S13]

## 调查范围与保留状态

- 进行了公开 HTTP、静态资源、GitHub 源码调查及日用 Edge 现有登录态下的 DOM 和被动网络观察。没有创建账户、密钥、充值、签到或修改扩展配置；登录刷新是网站正常加载自行发出的请求。
- 初次使用独立未登录浏览器时 `/dashboard` 转到 `/login`；随后日用 Edge 已验证登录后的 Dashboard DOM 和业务接口。[S1][S17] 没有制作完整截图或逐页功能验收。
- 首页署名 `vx:aimiertao` 已通过原始 HTML 及浏览器核实。署名可作为进一步联系或寻找作者的线索，不能直接解释为已核实的框架、项目名或开源许可证。[S12]
- HTTP/JS 内容与登录后响应字段在内存中分析，本记录没有保存凭证或完整身份响应。CLI 自动生成的页面快照和控制台日志留在已有忽略目录 `test-results/playwright-cli/`，不纳入 Git。
- 此记录保留在 Git，作为网关、Site Type 和 UI 来源的调查依据。具体私有 fork 或整站模板来源仍是证据缺口。

## 来源

- **[S1]** [本站 dashboard HTML / HTTP 响应](https://ai.facai.cloudns.org/dashboard)，2026-11-17 读取。
- **[S2]** [本站 CSS：ed635e52dc563d1a.css](https://ai.facai.cloudns.org/_next/static/css/ed635e52dc563d1a.css)。
- **[S3]** [本站 console layout JS](https://ai.facai.cloudns.org/_next/static/chunks/app/%28console%29/layout-d14c55b2f690707e.js)。
- **[S4]** [本站 chunk 890：Radix Slot](https://ai.facai.cloudns.org/_next/static/chunks/890-0953ccadd3ecd16b.js)。
- **[S5]** [本站 chunk 687：Radix Popper/Menu/FocusGuard](https://ai.facai.cloudns.org/_next/static/chunks/687-056120450f6255a4.js)。
- **[S6]** [本站 chunk 84：Button/Dialog 与业务 API 路由](https://ai.facai.cloudns.org/_next/static/chunks/84-20a9e13145b7ef54.js)。
- **[S7]** [本站 chunk 502：Lucide 许可证](https://ai.facai.cloudns.org/_next/static/chunks/502-b55bedc6ad250811.js)。
- **[S8]** [本站 chunk 154：Recharts 实现](https://ai.facai.cloudns.org/_next/static/chunks/154-f480ef928eaaf066.js)。
- **[S9]** [前端域名公开状态](https://ai.facai.cloudns.org/api/status)和 [API 域名公开状态](https://api.facai.cloudns.org/api/status)，2026-11-17 读取。
- **[S10]** [Radix 官方 Primitive 源码](https://github.com/radix-ui/primitives/blob/main/packages/react/primitive/src/primitive.tsx)，`Symbol.for('radix-ui')` 与 `asChild` / Slot 实现；本次读取其 raw 内容。
- **[S11]** [shadcn 官方 Button 源码](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/button.tsx)，CVA、Slot、`cn` 和变体；本次读取其 raw 内容。
- **[S12]** [本站首页 HTML](https://ai.facai.cloudns.org/)，署名与 SVG 类，2026-11-17 读取。
- **[S13]** [New API 官方公开状态控制器](https://github.com/QuantumNous/new-api/blob/669d774976369e986f03b6e24fff1042f6f94832/controller/misc.go)，`GetStatus` 字段，第 51、74、95、108–109 行（调查时 main）；本次读取其 raw 内容。
- **[S14]** 公开 GitHub code search：[`"ai.facai.cloudns.org"`](https://github.com/search?q=%22ai.facai.cloudns.org%22&type=code)、[`"AI 发财网"`](https://github.com/search?q=%22AI+%E5%8F%91%E8%B4%A2%E7%BD%91%22&type=code)、[`"aimiertao"`](https://github.com/search?q=%22aimiertao%22&type=code)，本次以 `gh api -X GET search/code` 读取；返回域名配置、签到脚本或无关文本，未定位整站。搜索是发现过程，不能据此证明全球不存在源码。
- **[S15]** [New API 当前前端 package.json](https://github.com/QuantumNous/new-api/blob/669d774976369e986f03b6e24fff1042f6f94832/web/package.json)，2026-11-17 读取其 raw 内容；仅用于当前上游前端技术对照。
- **[S16]** 本次读取返回 404 的原始地址：[v1.0.14/web/package.json](https://raw.githubusercontent.com/QuantumNous/new-api/v1.0.14/web/package.json)、[v1.0.14/controller/misc.go](https://raw.githubusercontent.com/QuantumNous/new-api/v1.0.14/controller/misc.go)。
- **[S17]** 日用 Edge 现有登录态：[Dashboard](https://ai.facai.cloudns.org/dashboard)；网站正常加载时上述身份、密钥、用量和登录刷新接口的响应结构，2026-11-17 被动读取。页面和响应可能随账户及版本变化，本文只记录脱敏结构。
- **[S18]** All API Hub [Site Type 标识](../../src/services/accountSiteDefinitions/identifiers.ts)、[New API 站点定义](../../src/services/accountSiteDefinitions/definitions.ts)，`SITE_TYPES.NEW_API` 与 `NewApiFamily` 分类。
- **[S19]** All API Hub [New API Dashboard AuthBundle 解析契约](../../src/services/apiService/newApi/dashboardAuth.ts)；该文件引用 [New API 上游实现提交](https://github.com/QuantumNous/new-api/commit/31d70fca393ff2e09bbae012af2e3ccefdd389a1)。

历史产物保留说明（2026-11-23）：原 `test-results/facai-detection/`、`test-results/facai-lifetime/` 和 upstream 下载被后续 Playwright 清理。固定 revision/链接仍可复查；新证据保留于本 feature 的 `artifacts/`。
