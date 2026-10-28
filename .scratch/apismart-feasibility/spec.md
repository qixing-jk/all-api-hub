# APISmart 账号适配可行性调查

Status: needs-info

调查日期：2026-10-10。范围：只读调查和原生表单检查，不实施适配，不创建密钥、不兑换、不充值、不发送推理请求。结论适用于本次 www.apismart.ai 普通用户账号。

## 结论与建议

可行，预计属于中等工作量的独立账号适配。余额、累计消费、按日统计、分页用量和密钥列表均有可用的 JSON 接口。不能作为 New API 别名接入：认证、路由、响应封装和密钥写入协议均独立。

建议暂定一个 `apismart` Account-Only Site Type，使用独立 adapter family。复用项目的账号能力、Cookie 传输、密钥资源编辑和导出机制，不复制其他提供商协议。当前工作树未注册 APISmart；本次未交付任何支持代码。

首期建议包括检测/登录引导、Cookie 账号读取、余额/累计消费、每日金额与请求数、用量分页、密钥管理、正确的推理地址和官网导航。正式承诺前须补齐 Cookie 续期、身份绑定、非空日志和密钥写入验证。

## 域名与身份边界

| 域名 | 已确认角色 | 本次证据及限制 |
| --- | --- | --- |
| `www.apismart.ai` | 官网、控制台、账号 JSON 接口 | Edge 已登录访问与只读接口实测 |
| `gw.apismart.ai/v1` | 推理网关、Bearer API Key、模型列表 | 原生密钥页面及官方 API 文档一致；没有现成密钥，未发推理或认证模型请求 |
| `docs.apismart.ai` | 官方文档 | 从官网链接发现，抓取目录及相关 Markdown |
| `www.apismart.net` | 隐藏邀请模板中的固定示例链接 | 模板包含固定推荐码和示例用户；没有账户等价证据，不作为别名或凭据目标 |

页面配置声明 `siteType: overseas`、`currency: USD`。源码中的 China/global 提示已被注释且链接为空；未发现可验证的中国站控制台地址。不能据此注册区域别名，也不能声称不存在其他区域。当前域名之间的账号或 Cookie 等价性没有额外验证。

## 认证与持续访问

默认候选是浏览器 Cookie：同源请求携带现有 Cookie 时账号、钱包、密钥列表均成功；省略 Cookie 时返回业务认证错误。Cookie 值未导出。

实际观察到三个 HttpOnly/Secure Cookie：`user_token`、`user_refresh_token`、`server_session_124cacd5`，均限定 www.apismart.ai，SameSite=Lax。采样时前两项过期时间分别为 2026-10-10 11:31:28 UTC、2026-10-17 09:31:28 UTC。它们说明凭据有期限，不能据此声称令牌永久有效或已验证后台续期。未删除/修改 Cookie、未强制过期，也未重放刷新流程。

官方文档与个人设置只确认浏览器登录和推理 API Key，未发现可直接用于控制台的 PAT 或公开 refresh endpoint。推理 Key 能否读取账户接口未经验证，不能将它当作控制台长期凭据。登录页存在 Turnstile 流程，应提供回站重新登录的恢复路径，不自动化密码登录。

`/user/account/info` 当前只给出 username/email/mobile，没有稳定数值 ID。username 在原生设置中用于只读展示，email 有独立修改入口；正式实施前应确认 username 的不变性，或找到可靠的 account ID。不能把余额、同域 Cookie 或缓存用户资料当作身份匹配证据。

缺失验证：关闭站点页后的扩展后台访问、Cookie 自动更新与持久化、访问令牌过期后的刷新、刷新令牌失效、不同账号隔离、恢复时身份匹配。此类验证需在独立开发扩展上下文完成，不应破坏用户当前会话。

## 实测接口与协议

公共请求头需要显式接受 JSON。本次成功探针使用 `Accept: application/json` 和 `Content-Type: application/json`。缺少这些头的普通 fetch 对账户/钱包等接口会收到 HTTP 200 的 HTML “System Notice / ok”；密钥列表表现不同，不应从单一路由推广。

成功封装为 `{code:1, message:'ok', data:...}`。失去认证时 HTTP 仍为 200，响应 `{code:40100, message:'请先登录', data:null}`；不能只检查 HTTP 状态。失败或未知金额不能默认为零。

| 操作 | 路由 | 实测结果/映射 |
| --- | --- | --- |
| 账号 | GET `/user/account/info` | username/email/mobile；缺稳定数值 ID |
| 钱包 | GET `/user/wallet/info` | `stats.balance`、`total_recharged`、`total_consumed` 为十进制金额字符串；另有 cards/custom/currency_symbol |
| 密钥列表 | GET `/user/api_keys/get_api_keys?page=1&limit=20&keyword=` | `{total:0,list:[]}`；有分页/检索参数，只验证空列表 |
| 用量模型选项 | GET `/user/usage_logs/models` | models/types/billing_modes，本次 24 条；用于日志筛选，不等于每个 Key 的实际权限 |
| 每日用量/统计 | POST `/user/usage_logs/list` | 只读查询。date/page/limit/token_name/model_uuid/model_type/billing_mode/status/with_stats；返回 list/total/date/table_exists/stats |

每日统计已确认 `total_cost_billed`、`total_tasks`、`avg_latency`、`success_rate` 字段，样本是零用量。日期由网页浏览器本地日期生成；另有 user_time_zone Cookie，但服务器如何解释它尚未确认。首页的 Past 24 Hours 不能直接当作自然日统计。非空日志中的 Consumption 可涉及文本 token、图像和视频，不能统一解释为 token 数量。

## 完整能力清单

以下“可行”是调查结论，全部仍未适配；仅对实际执行过的读取标为实测。

| 分组 | 项目 | 调查结果 / 适配方向 | 缺口与下一步 |
| --- | --- | --- | --- |
| 接入 | 检测/自动添加 | 域名和控制台可识别；可复用 bootstrap 和登录引导 | 新鲜表单→检测→身份校验→保存→刷新未实现/未跑 |
| 接入 | 持续访问/恢复 | Cookie 为唯一实测可用方式 | 续期、后台独立性、多账号隔离未验证 |
| 金额 | 余额 | JSON 实测；USD 可用服务额度 | 官网说明包含充值/赠送额度，不应描述为可提现现金；当前统计未拆分两类余额 |
| 金额 | 累计消费 | `stats.total_consumed` 实测 | 非零样本及金额精度需覆盖 |
| 用量 | 每日金额/请求数 | 只读 POST 实测 | 时区、跨日及非零样本待验证 |
| 用量 | token 计数/分页日志 | 原生有分页和多维筛选 | 非空 DTO、不同计费种类、日志保留窗口未验证；不能用 total_tasks 代替 token 数 |
| 套餐 | 订阅/周期额度/重置 | 当前为 pay-as-you-go 钱包和充值卡 | My Packages 已并入钱包；没有已验证的周期订阅合同，不能用充值卡伪造订阅 |
| 密钥 | 列表/作用域 | 空列表实测，有 page/limit/keyword | 非空字段、分组/项目权限未确认 |
| 密钥 | 创建 | 原生对话框和源码确认：name，默认不限额，可选 set_limit/limit | POST `/user/api_keys/create_key` 未执行；开启限额后显示 `$`，需验证单位和边界 |
| 密钥 | 编辑 | 源码有 id/name/set_limit/limit；使用 token_limits 和 token_limits_display 回填 | POST `/user/api_keys/edit_api_keys` 未执行；源码旧注释写“单位 m”，以实测写入和原生金额显示核对，不能沿用旧注释 |
| 密钥 | 启用/禁用 | 源码 POST `/user/api_keys/update_api_keys`，id/status | 没有现成密钥，未验证状态枚举和读回 |
| 密钥 | 删除 | 源码 POST `/user/api_keys/delete_api_key`，id | 未执行；实施时使用一次性资源并验证清理 |
| 密钥 | 明文/一次性秘密 | 前端对行 key 做遮罩并提供复制与 curl 模板，提示列表可能持有明文 | 空样本无法证明返回真密钥、掩码或一次性规则，不承诺 reveal |
| 密钥 | 默认创建/编辑一致性 | name-only 原生创建可行；可选美元限额 | 创建成功结果、默认命名、秘密保存和 reopen 未验证 |
| 导出 | Runtime Key/CLI/配置 | 文档与页面确认 `https://gw.apismart.ai/v1`、Bearer | 使用统一 key source 和 endpoint role；实际密钥与客户端请求未验证 |
| 模型 | 公共目录/Key 可见模型 | `/models` HTML 注入 `window.PAGE_MODEL_LIST`，24 条；API 文档另有 `/v1/models` | 展示目录与 Key 权限分开；实际 API model ID 以网关为准，不擅用展示名称 |
| 价格 | 文本/图片/视频 | 公共数据有 priceBands、callPrice、videoPrices、priceGroups，模式 per_token/per_call/per_video | 文本 USD/M、缓存、图片和视频单位分别映射；tier 选项存在，但该样本没有 tier 模型；复杂价格不得强塞 input/output |
| 邀请 | 推荐链接 | 隐藏页面是固定示例码、示例统计、示例用户，无账户读取 | 排除该模板作为证据；真实账户接口未确认，先不提供复制动作 |
| 公告 | 站点/账户公告 | 首页 No Data，源码还含注释掉的示例 | 没有真实非空来源/标识合同，不承诺自动同步 |
| 兑换 | 优惠券/兑换码 | 钱包原生入口和 POST `/user/wallet/redeem` 确认 | 不执行不可逆兑换；可导航回钱包，自动兑换暂缓 |
| 签到 | 可用性/状态/执行 | 检查可见导航、页面源码、官方文档目录均未发现真实签到契约 | 当前不建议注册签到方法；这不是对全平台永远不支持的断言 |
| 导航 | 站点功能入口 | index/api_keys/usage_logs/wallet/account_settings 路由已确认 | 仅暴露已实现动作，隐藏不支持操作 |
| 其他 | 支出提醒/反馈/创作/支付 | 个人设置和导航存在相关流程 | 新产品流程，不属于本次账号聚合可行性实现范围，不发送反馈或订单 |
| 管理 | 网关/渠道管理 | 无管理员访问或管理协议证据 | 本次是账号适配，不注册 Managed Site Type |

## 代码落点与验证安排

- `src/services/accountSiteDefinitions/{identifiers,definitions}.ts`：类型、检测、Cookie 默认、功能策略、控制台与推理地址。
- `src/services/apiAdapters/registry.ts` 与新 `apismart/`：账号/bootstrap/refresh/keyResource/modelPricing 等实际能力。FreeModel/SharedChat 可作为 Cookie 账号模式参考；Grsai/RightCode 可参考独立密钥能力分层，但不复用它们的线协议。
- `src/services/apiService/apismart/`：业务错误码、JSON 请求头、金额/日期/密钥 DTO、HTML 注入目录的安全解析。不得 eval 上游脚本。
- 先写失败行为测试：HTTP 200 认证失败、非 JSON 响应、账号错配、USD 字符串与未知值、自然日统计、空/分页列表、控制台/推理 origin 分离。
- 再验证 Cookie 过期/并发恢复以及允许范围内的临时密钥创建→读取→编辑→启停→删除。原生表单字段逐项覆盖，检查秘密保留和最后库存一致。
- 最后在当前工作树开发扩展中验证自动添加、关闭站点页后的刷新、模型/价格、密钥操作和导出；本次没有产品代码，未运行 Vitest、扩展构建或 E2E。

## 证据与交付边界

调查结论保存在本文件；原始文档、来源、一次性探针和脱敏响应仅保留本地，路径为 `.scratch/apismart-feasibility/evidence/` 和该目录下的 `*.js`，不随 Git 提交。需要复核时先检查本地 `evidence/index.md`；其他检出环境不保证存在这些证据。工作树起点 `601f50d27485b3a22a6f638af5584fa49911e404`。

没有账户资源写入。唯一主动 POST 是源码确认的只读日志查询。打开过创建密钥对话框并切换限额展示，随后取消，没有提交。没有调用签到、优惠券兑换、充值、登录、刷新令牌或推理接口。
