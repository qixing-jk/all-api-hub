# 星芽签到与账号登录会话

## 范围

支持 `https://xingya.site` 与 `https://xingya.space` 的专属每日签到，并复用账号登录会话完成 New API 原生网页签到回退。相关申请：qixing-jk/all-api-hub#1748。

保留 `new-api` 站点类型，不扩展账号识别、密钥管理或 managed-site 能力。签到登录配置与 API 认证、自动凭据恢复、自动签到意图分别管理。

## 已验证的协议与决定

以下来自 2026-10-25 至 2026-11-15 的部署响应及原生前端观察；最新验证部署为 `xingya-rc50`。它们描述该部署的契约，不推定所有 New API fork 都相同。

| 契约 | 决定与依据 |
| --- | --- |
| 控制台范围 | `https://xingya.site` 与 `https://xingya.space` 均提供控制台；2026-11-15 两站 `/dashboard/overview`、前端 bundle 和公开协议标记一致。保存的当前 origin 仍拥有全部请求与凭据。 |
| 方法 | `xingya:daily-checkin`，注册在既有 `new-api` 类型下。通过专属只读状态或公开 `xingya_checkin_available` 布尔标记识别；已知域名仅是元数据排序提示，不限制其他镜像。 |
| 自动选择 | 通用 New API 方法优先级较低；确认的专用协议优先，包括已停用状态。专用协议明确不支持时允许通用方法；专用协议不确定时阻止自动通用回退。手动选择保留，同级专用协议仍可能多匹配。 |
| 元数据兜底 | 仅对同级已确认匹配的平局，以当前站 hostname 与公开 `api_info[].url` 的去重 hostname 集合，与各方法已知域名求交集。唯一最高且正的重合数才解开平局；同分、零分、未知候选、无效响应、超时或取消不自动决定。仅持久化有界重合数，不存原始域名或凭据。公开请求保留浏览器分区与禁止回退策略，不携带账号凭据。 |
| 只读状态 | `GET /api/user/xingya-checkin[?month=YYYY-MM]`；要求明确的 `claim_enabled`、`group_accessible` 和 `today_record.checked_in`。未知状态不得允许领取。 |
| 领取 | `POST /api/user/xingya-daily-claim`，无 body；成功数据包含 `already_claimed`、`quota_awarded`。不创建签到专用密钥，不调用管理员写接口。 |
| 认证 | 面板短期 Bearer 来自密码登录 AuthBundle 或 Cookie 会话的 `/api/user/auth/refresh`；身份通过 `/api/user/self` 核验。`nap_` scoped token 可读状态，但领取被 `403 AUTH_SESSION_REQUIRED` 拒绝。 |
| 会话所有权 | 登录后操作完成前保留上下文及同源排队；身份不匹配、取消或登录失败不执行领取。现代 Bearer 仅在操作中使用，不写入账号存储。 |
| 旧版兼容 | refresh 返回 401/404/405 时允许按旧 Cookie 会话继续，仍须核验目标身份；其他无效认证响应不得推定可用。 |
| 奖励 | 使用权威 `quota_awarded`，通过既有 `readQuotaReward` 归一。福利分组额度与普通余额不同，不能用余额差推导奖励。 |
| 重复安全 | 已签、领取停用、分组不可用或执行意图撤销时不发领取 POST；响应丢失后只读确认，未确认则保留不确定结果。未证明重复 claim 幂等，不加入可重复写方法清单。 |
| Turnstile | 原生前端启用时使用领取路由的 `?turnstile=`；当前星芽部署关闭验证。专属 provider 不驱动该验证对话框，不能据关闭状态声称覆盖开启部署。 |
| New API 网页回退 | 接口优先；认证或 PoW/验证要求触发回退时，使用配置的目标账号登录，核验页面身份及状态后只点击一次原生按钮，再读回确认。保留未配置登录时的既有网页路径。 |
| 点击前许可 | 页面验证与按钮目标等待结束后，再核验当前页面会话、目标身份、签到状态和执行意图；最终点击不再等待按钮。账号重读改变状态核验方式时中止本次执行；会话内核验不受过期的已停用/已签缓存阻挡。 |
| 异常回读 | 明确的站点 HTTP 401 拒绝可进入配置登录回退；失联不重放。点击后内容脚本或状态查询异常只能通过只读确认完成签到，否则保留不确定结果。 |
| 登录引导 | 区分登录即签到、会话内领取、网页回退登录。缺登录方式、缺凭据和认证失败可进入目标账号的登录设置；无结果 methodId 时使用当前已确认选择。保存不立即登录，验证码仍可能需要人工完成。8 种应用语言同步。 |

## 验收与未覆盖条件

| 场景 | 证据 / 边界 |
| --- | --- |
| 登录队列、上下文生命周期、身份冲突、取消 | browserOAuth、passwordUi/OAuth 回归，以及 `e2e/accountSessionNativeCheckin.spec.ts` 的同源两账号与共享身份冲突场景。 |
| 星芽已签/停用/未知、首次领取、失联读回、撤销意图 | `tests/services/autoCheckin/providers/xingya.test.ts`；协议与发现由 registry、checkInMethods、feedbackRoutes 和 `e2e/xingyaCheckin.spec.ts` 覆盖。 |
| 双匹配、域名交集兜底与保存读回 | `tests/services/autoCheckin/discoverySelection.test.ts`；`.site` 与 `.space` 的真实扩展编辑器发现、保存与重开由 `e2e/xingyaCheckin.spec.ts` 的受控响应场景覆盖。 发现改进验收（仅本地保留：`evidence/discovery-priority-20261115/acceptance.md`，不随 Git 分发）。 |
| New API 原生 PoW/签到页验证码及窗口清理 | newApi provider 回归与 `e2e/accountSessionNativeCheckin.spec.ts`；验证码为受控夹具，不代表真实 Turnstile 服务验收。 |
| 分支迭代审查修复 | 审查与验收（仅本地保留：`evidence/review-20261115/acceptance.md`，不随 Git 分发）：页面验证/按钮等待期间撤销或换号、HTTP 401 登录回退、旧版 refresh 401/404/405、点击后异常回读、缓存状态恢复与执行中删除登录配置。 |
| 后续独立审查 | 迭代验收（仅本地保留：`evidence/review-iteration-20261115/acceptance.md`，不随 Git 分发）：星芽领取响应缺失或包含非布尔 `success` 时，只读确认或保留不确定结果；配置登录后 New API 普通接口失联仍只读确认；身份缺失与不匹配保留各自提示；星芽真实 HTTP 403 会话要求保留登录配置入口；公开中英日签到指南同步会话配置说明，移除未接入生产的 Turnstile URL helper。 |
| 星芽实站冷登录首次领取与重复执行 | 2026-11-15 记录（仅本地保留：`evidence/session-1794673159524/result.json`，不随 Git 分发）：单次领取、结果持久化、重复执行零新增领取。 |
| New API 实站 PoW 首次领取与重复执行 | 2026-11-15 记录（仅本地保留：`evidence/runanytime-session-1794673020421/result.json`，不随 Git 分发）：扩展完成登录、PoW、单次领取及服务端确认。 |
| 受阻后设置、保存、重试 | 引导断言（仅本地保留：`evidence/session-1794674344074/guidance-result.json`，不随 Git 分发）与重试记录（仅本地保留：`evidence/session-1794674344074/result.json`，不随 Git 分发）；临时已保存账号，不证明正常新增账号全流程。 |
| 中文/英文保存、重开及手机焦点 | 中文记录（仅本地保留：`evidence/guidance-1794643400480/result.json`，不随 Git 分发）、英文记录（仅本地保留：`evidence/guidance-1794643644591/result.json`，不随 Git 分发）；合成账号配置夹具。 |
| 视觉比较 | New API 文案比较（仅本地保留：`../visual-comparisons/run-9Vwvjq/comparison.png`，不随 Git 分发）、星芽文案比较（仅本地保留：`../visual-comparisons/run-uniVUv/comparison.png`，不随 Git 分发）。受阻结果行缺同夹具变更前截图，保留最终截图及红回归。 |

仍待补充：真实开启 Turnstile 的部署；正常新增账号至签到的完整浏览器流程。不得将现有临时账号或受控验证码证据称为这些路径的完整验收。

### 2026-11-15 严格 UI 自动流程复测

按用户要求，以 `c6f5d3c6f8` 的当前工作树 dev 扩展和空账号列表，通过 CDP 正常 UI 自动识别、添加、重开及执行；没有指定站点类型、签到方式、身份或登录方式，没有注入账号、写 storage 或直接调用 API。用户指出可参考现有 New API E2E 后，星芽令牌引导由脚本操作原生 UI、通过环境密码安全验证、读取一次性显示字段并填回扩展完成。完整记录与本地证据（仅本地保留：`evidence/cdp-auto-20261115/acceptance.md`，不随 Git 分发）。

- Runanytime 使用浏览器已有 Linux DO 登录态，自动取得账号信息和令牌，自动选择每日签到并正常保存、重开。点击立即执行后显示“今日已签到，未执行”；因此本轮没有新的 PoW 领取证据。登录方式仍未配置。实测发现已签状态使执行页误报“需要设置 / 不可用”；修复就绪读取后，同一账号 CDP 重跑显示“就绪 / 可用”，仍跳过已签领取。新增有效/缺失令牌红绿回归，152 项相关测试、类型检查、Knip 和修复后的新 agent 独立审查通过。
- 星芽自动取得身份和 `new-api` 类型；正常“检测签到方式”自动确认星芽每日签到。参考 `e2e/utils/realSite/newApiAccountRecovery.ts` 的网页令牌恢复流程后，CDP 自动完成创建令牌、安全验证、回填、保存、刷新和重开；没有使用该 helper 内直接调用 API 的旧令牌清理。站点类型、身份和签到方式均保持自动识别值，没有用环境令牌或 Cookie 认证替换。
- 最终两站执行页均显示“就绪 / 可用”，执行结果均为“今日已签到，未执行”。因此自动 UI 新增至已签跳过的流程通过；真实未签当天的首次领取、PoW 和冷登录恢复仍未覆盖。此前临时账号脚本证据仍只证明其特定路径，不替代这次正常新增路径的首次领取验收。

## 复现与证据保留

PR #1881 的反馈处理日志与原始覆盖率材料仅本地保留在 `../pr-1881/`；浏览器回归与覆盖率报告位于 `evidence/pr-1881-*`。本轮补测使用受控夹具，不补充真实验证码或当天首次领取证据。

2026-11-15 runner 与 skill 已改为优先正常扩展 UI。新的独立身份核对、探测/刷新完成反馈、账号登录配置保存重开和本次资源清理均已实测；最新两站共 16 个阶段通过，首次领取与 PoW 共 3 项因当天已签受阻。脚本迭代与验收记录（仅本地保留：`evidence/ui-runner-20261115/acceptance.md`，不随 Git 分发）保留各轮审查、红绿回归、原入口 CLI 测试误入旧夹具的排除记录及最新截图。原站令牌创建本轮未重新触发，不能据自动令牌获取声称覆盖该分支。

- 两站正常 UI 验收：`pnpm e2e:cdp:checkin-ui -- --isolate --check-in --site=all`；可用 `--site=xingya` / `--site=runanytime` 缩小范围，旧 `--runanytime` 保留为别名；不再支持清 Cookie 的 `--cold-login`。
- 星芽需要共享本地环境中的 `XINGYA_USERNAME`、`XINGYA_PASSWORD`，用于正常登录设置与原站安全验证；Runanytime 使用开发浏览器已有的 Linux DO 会话。可选预期用户名 / 用户 ID 只用于身份断言，缺项以正常 `/api/user/self` 的被动响应核对，无法独立核对则记录受阻。
- 配置引导：`node scripts/test-checkin-login-guidance-cdp.mjs --isolate --zh`；默认英语。
- 实站 runner 从添加账号开始，自动识别类型、身份、凭据与签到方式，正常保存、刷新、重开；通过 UI 设置签到所需的账号登录，并再次保存重开，然后执行和重复执行。显示名称用于标记本次资源，签到方式和身份不由脚本指定。新增账号及 scoped token 均通过 UI 清理；`--keep-account` 明确保留。合成配置 runner 仍为夹具检查，不能代替正常新增验收。
- 每轮实站报告使用独立 `extension-ui-*` 目录；必需场景通过为 0、断言或清理失败为 1、首次领取/PoW 等场景受阻为 2。认证配置从共享 ignored 环境加载，原始认证材料不得提交。已签跳过不证明首次领取；令牌自动获取不证明原站令牌引导分支。

保留在 Git：本规格、协议实现、维护中的 runner 与回归测试。实站原始材料、截图、失败尝试和执行日志保留在 ignored `evidence/`，供验收及后续补缺口使用。整理前的详细执行历史留在 `evidence/finish-20261115/spec-before-finish.md`；本地交付验收（仅本地保留：`evidence/finish-20261115/acceptance.md`，不随 Git 分发）记录最终版本、检查结果和完整视觉索引。未删除这些证据。
