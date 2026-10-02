# Kimi 开放平台账号适配

- Status: ready-for-human
- 证据日期：2026-09-29（已登录 Edge，国际站与中国站各打开一次控制台）
- 范围：`platform.kimi.ai` 与 `platform.kimi.com`。Kimi Code（`kimi.ai/code`、`kimi.com/code`、`api.kimi.com/coding`）不是本规格的对象。

## 目标

把 Kimi 开放平台做成账号站点：识别已登录控制台、续期会话、读组织余额和限额、管理 API Key，并把推理地址导出到 `api.moonshot.*`，而不是导出控制台域名。

第一期即使只做国际站，传输层也要按「部署配置」取 origin、货币、认证端点和文案限额，不要把 `platform.kimi.ai` 写死在适配器里。站点类型用一个还是两个，本规格不决定。

## 已核实的共同契约

两个控制台都是同一套 BFF。响应信封是 `{ code, data, message }`，成功时 `code` 为 0，普通接口的 `message` 为 `"Ok"`。

会话在 `localStorage`，`document.cookie` 为空：

- `token`：access JWT。请求头 `Authorization: Bearer <token>`。两边观测到的寿命都是 900 秒。
- `rtoken`：refresh JWT。寿命 7776000 秒（90 天）。
- `currentOrganizationId`：JSON 字符串，内容是组织 id。

刷新：

`GET /api?endpoint=refreshToken`

请求头是 `Msh-Authorization: <rtoken>`，不是 Bearer。成功时 `data.access_token` 与 `data.refresh_token` 写回上面两个键。中国站这次打开页面时，原 access token 已经 401，页面自己完成了一次刷新；响应 `message` 是 `"success"`，不是 `"Ok"`。国际站没有主动调用刷新，避免无谓轮换。

无 token 或坏 token 时，`GET /api?endpoint=userInfo` 返回 HTTP 401，体为 `{"code":401,"message":"Unauthorized"}`。退出登录会删掉 `token`、`rtoken`、`currentOrganizationId`。

JWT 声明两边相同：`iss=user-center`，`typ` 为 `access` 或 `refresh`，另有 `sub`、`space_id`、`abstract_user_id`。区分部署的是 `app_id` 和 `region`，见下表。

账号与密钥：

| 用途 | 方法与路径 |
| --- | --- |
| 用户、组织、项目、限额 | `GET /api?endpoint=userInfo` |
| 项目 | `GET /api?endpoint=listProjects&oid=` |
| Key 列表 | `GET /api?endpoint=organizationKeys&oid=` |
| 新建 | `POST /api?endpoint=createApiKey&pid=&oid=`，体 `{name}` |
| 改名 | `PUT /api?endpoint=updateApiKey&pid=&oid=&id=`，体 `{name}`，`data` 为 `null` |
| 删除 | `DELETE /api?endpoint=deleteApiKey&id=&pid=&oid=`，`data` 为 `null` |
| 控制台金额 | `GET /api?endpoint=organizationAccountInfo&oid=` |
| 月账单 | `GET /api?endpoint=organizationMonthlyBills&oid=` |
| 用量 | `GET /api?endpoint=consumes&start=&end=&date_type=monthly&oid=` |

`organizationAccountInfo.data` 字段：`cur`、`voucher_cur`、`acc`、`voucher_acc`、`voucher_expired`、`recharge_bonus_percent`、`use`、`today_consume`。两个站的页面都把金额显示成 5 位小数，只是货币符号不同。整数的换算比例这次都是 0，没有验证。

Key id 以 `ak-` 开头。明文密钥以 `sk-` 开头。国际站创建响应里的 `data.auth` 长度为 51，只出现这一次；列表里的 `auth` 是打码值（国际站 `sk-a0...Hmtbu` 这种前后缀，中国站已有 Key 为 `sk-ty...oz0oa`）。打码值不能当密钥，也不能回落到 New API 的揭示接口。

国际站写操作只碰了一把名为 `aah-probe` 的 Key：创建、改名为 `aah-probe-renamed`、删除。删后 `organizationKeys` 为空。中国站已有一把名为 `test` 的 Key，没有改动。

用国际站这把 Key 调推理站：

- `GET https://api.moonshot.ai/v1/users/me/balance` 返回 `available_balance`、`voucher_balance`、`cash_balance`，与仓库里现有的开放平台余额解析一致。
- `GET https://api.moonshot.ai/v1/models` 只返回 `kimi-k2.7-code` 和 `kimi-k2.6`。这是该零余额 Key 的可见模型，不是平台全量目录，不能写死，也不能据此认为 K3 已下线。

中国站余额文档的对应地址是 `GET https://api.moonshot.cn/v1/users/me/balance`，字段相同，单位是人民币元。官方说明两边的 Key 混用会 401。中国站已有 Key 在列表里是打码的，这次没有拿它的明文去打推理接口。

`userInfo` 里免费组织的限额两边相同：并发 1、RPM 3、TPM 500000、TPD 1500000，`group_id` 为 `free`。页面把这叫 Tier0。两个免费组织的 `is_suspended` 都是 `true`，但控制台没有封禁提示，国际站的建删 Key 也成功。先只存储这个字段，不要把它当成停用。

没有签到。

## 部署差异

|  | 国际站 | 中国站 |
| --- | --- | --- |
| 控制台 | `https://platform.kimi.ai` | `https://platform.kimi.com` |
| 推理 origin | `https://api.moonshot.ai` | `https://api.moonshot.cn` |
| OpenAI 导出 | `https://api.moonshot.ai/v1` | `https://api.moonshot.cn/v1` |
| Anthropic 导出 | `https://api.moonshot.ai/anthropic` | `https://api.moonshot.cn/anthropic` |
| 货币 | USD，页面用 `$` | CNY，页面用 `￥` |
| JWT `app_id` | `dev-workbench-intl` | `dev-workbench` |
| JWT `region` | `overseas` | `cn` |
| 组织认证读接口 | `GET /api/v1/organizations/{oid}/auth-intl` | `GET /api?endpoint=organizationAuth&oid=` |
| 登录身份（本次账号） | Google，`auth_type=personal` | 手机号，`auth_type=none`，面包屑为「未认证组织」 |
| Key 上限文案 | 50 | 10 |
| 侧栏差异 | 有 General（`/console/general`）；账户页会请求 `autoRecharge` | 组织认证在 `/console/auth`；有发票 `/console/invoice`；账户页没有请求 `autoRecharge`，可见文案是认证奖励而不是自动充值 |
| 充值 | Stripe，可见档位从 $20 起 | 这次没有打开充值页 |

共同侧栏：项目 `/console/projects`、API Key `/console/api-keys`、用量限制 `/console/limits`、文件 `/console/file`、账户总览 `/console/account`、Caching `/console/cache`、充值 `/console/pay`、充值明细 `/console/pay-detail`、计费明细 `/console/fee-detail`、代金券 `/console/voucher-detail`、导出记录 `/console/bill-export-records`。用量限制页没有自己的接口，数字来自 `userInfo` 的组织字段。

`organizationAuth` 比国际站的 `auth-intl` 多三个字段：`found_next_transfer_time`、`found_transfer_quota`、`found_verify_quota`。认证流程本身不接入。

## 站点类型

决定：一个适配器家族 `kimiOpenPlatform`，两个站点类型。

- `kimi`：`platform.kimi.com`，推理站 `api.moonshot.cn`，人民币。
- `kimi-global`：`platform.kimi.ai`，推理站 `api.moonshot.ai`，美元。

协议相同，所以不复制适配器。账号库不同，所以不是一个站点类型。打开中国站不会被识别成国际站。

## 已实现的行为

- 自动识别读三个 localStorage 键。access token 失效后走刷新接口，只有新的一对 token 都验证成功才写回。刷新失败则从仍打开的控制台页面再读，不用失效值覆盖。
- 身份用 `userInfo` 的 uid 和当前组织 id。多项目时 Key 自带 `project_id`。
- 有控制台会话时，余额用 `organizationAccountInfo`。只有粘贴的 `sk-` Key 时，余额用对应推理站的 `/v1/users/me/balance`。
- 模型页优先读取控制台默认项目的 `/api/v1/organizations/{oid}/projects/{pid}/open-gateway/models`，用控制台 JWT，无需 API Key。按精确模型 id 关联对应部署的 `/docs/pricing.md` 标价；账号目录失败或为空时，框架回退到公开价表目录，并显示回退原因。公开目录不代表该账号能调用其中所有模型。
- 价格按列标题、计费单位和币种校验；不认识的结构不产出猜测价格。美元与人民币原价保存在 `pricingPlan`，分别保留缓存命中、5 分钟和 1 小时缓存写入价。普通浏览选择人民币时显示原价，选择美元时使用账号汇率并标注估算。公开目录按区域分别缓存。
- 密钥做列表、新建、改名、删除。明文只保存创建时的 `auth`。
- 导出用该部署的 OpenAI 与 Anthropic 基址。
- `checkInPath` 与 `redeemPath` 都是 `null`。
- 不接 Kimi Code 的设备码登录，也不把 New API 的 Moonshot 渠道类型当成这个站点。

## 还不做

- 认证、发票、充值下单、自动充值的修改。
- 把 `is_suspended` 解释成封禁。
- 用一把 Key 去探测另一个区域的 origin。手动添加必须由用户选定部署；选错会 401，这是预期，不是再试另一个站的信号。
