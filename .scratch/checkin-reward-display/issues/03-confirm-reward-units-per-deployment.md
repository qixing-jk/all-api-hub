# 03 — 逐个确认各站点的奖励字段与单位

- Status: needs-info（需要真实账号/报文；能从上游源码或站点前端确认的部分已完成）
- Parent: `../spec.md`
- 关联：01 已按本 ticket 的结论纳入 new-api / wong / veloera / sub2api-pro / genius-programmer / xiaobai-code / ai-router

## 为什么必须逐个确认

同一签到方法下，奖励单位并不统一：

- new-api family 的 `quota_awarded` 是 quota 整数（`src/services/apiService/newApiFamily/checkInDto.ts:6`）。
- Sub2API family 的余额是 **USD 十进制**（`convertUsdBalanceToQuota`，`src/services/apiService/sub2api/parsing.ts:130`）；实测：AI-ROUTER `reward_amount: 1`（`.scratch/ai-router-adaptation/spec.md:185`）、小白Code `"0.25"`（余额 1.5→1.75，`.scratch/xiaobai-code-checkin/research.md:50`）、天才程序员 `0.05`。
- RixAPI 6.x 用 USD `balance` 字符串替代整数 `quota`（见 `docs/agents/site-integrations.md` 的 Rix API 段落），所以**同一方法 `new-api:daily-checkin` 在不同部署下单位可能不同**。

按部署确认，不要按方法名假设。

## 已确认（离线证据，不需要账号）

| 站点 | 结论 | 证据 |
| --- | --- | --- |
| veloera | 成功响应 `data.quota` 即本次奖励，**quota** 单位 | 上游 `Veloera/Veloera@6525dfce816beaa270e78f0d8b762e19e54d13b8`：`controller/user.go` 的 `CheckIn` 返回 `{success, message: "签到成功", data: {quota: reward}}`；`model/user.go` 的 `User.CheckIn` 把 `reward` 计入 `user.Quota`；`CheckInStatus` 只返回 `can_check_in`，无金额 |
| wong | 成功响应 `data.quota` 即本次奖励，**quota** 单位（`min_quota`/`max_quota` 是奖励区间） | 部署前端 bundle `https://wzw.pp.ua/assets/index-JGp5IMg4.js`：`POST /api/user/checkin` 后 `ut.success({title:"签到成功！", content:"恭喜获得额度：" + Rr(data.quota)})`，并把 `quota` 并入与状态同构的本地对象；状态渲染只用 `min_quota ~ max_quota`（注释文案"内部额度单位，500000 Token = 1 USD"）。反向读法（`quota` 是领取后余额）与该 toast、与"未签到时也显示区间"的用法不符，故按奖励取值 |
| anyrouter / agentrouter | 当前无可用金额 | `providers/anyrouter.ts:28`（`code`/`ret`/`success`/`message`/`msg`）、`providers/agentrouter.ts:119`（页面登录式签到，无 DTO）。两站的奖励是固定值，但会被运营调整，所以不硬编码；是否有可读的只读来源见下方第 5、6 条 |

## 待确认清单

| # | 目标 | 待回答问题 | 需要的证据 |
| --- | --- | --- | --- |
| 1 | denxio（`/api/v1/tbe-sponsor-checkin/normal/claim`） | `record.amount` 是 USD 还是 quota 单位？（代码里是数字，非同族的十进制字符串） | 领取响应体 + 领取前后账户余额 |
| 2 | voapi-v2（check-in submit） | `{amount, bonusAmount}` 各自含义（是否叠加、是否有连签加成）？`stats.todayRecord` 结构？ | 成功响应体 + `CheckInStats` 返回；两者一起决定显示哪个数 |
| 3 | RixAPI 6.x（走 `new-api:daily-checkin`） | **已结案（2026-10-03）**：`platform.ephone.ai`（RixAPI 6.5.17）登录态实测 `/api/user/checkin`、`/api/user/check_in`、`/api/user/sign_in` 全部 **404 `Invalid URL`**，`/api/user/self` 只返回 USD `balance`。该部署没有签到功能，没有奖励可显示，无需再确认单位 | 无（结论=无签到） |
| 4 | `ALREADY_CHECKED` 是否显示当天奖励 | **已结案（2026-10-03）**：已实现。状态读回的 `stats.records` 本来就随请求返回，按本地当天取 `quota_awarded`，不额外发请求；时区不一致时匹配不到即不显示 | 无（结论=已实现） |
| 5 | anyrouter | **已结案（2026-10-03，登录态）**：三种签到路由都只回 200 + `权限不足`，无结构化金额；站点公告散文里写"用户每日签到获赠额度提升至 $25"（公开可读）。取自持续变动的公告文本不值得解析，不接入 | 无（结论=不接入） |
| 6 | agentrouter | **已结案（2026-10-03）**：签到随 OAuth 登录发放（`agentRouterOAuth.ts` 读回调里的 `checked_in`），回调/登录响应与 `localStorage.user` 都**不带奖励数额**，站点前端只弹"签到成功，新增额度已到账"。因此"读状态拿 max/min_quota"这条不成立（该部署的 check_in 路由对普通角色返回权限不足），也不解析文案数字 | 无（结论=无来源、不显示）。如需显示只能解析 `/console` 的签到条，属另一条工作线 |
| 7 | denxio | **待复测**：2026-10-03 探测时 `api.denxio.top` 全站 502（Cloudflare 回源失败），无法取报文；恢复后重试"领取响应 + 领取前后余额" | 站点恢复 + 领取响应体 |

## 交付

- 每条新结论写回 `../spec.md` 的站点覆盖表（字段名、单位、证据、状态），并把有结论的方法排进 01 或后续切片。
- 只保留脱敏报文与站点公开源码/前端 bundle 线索，不提交账号、token 或 Cookie。
- 结论互相冲突时（例如同一方法在不同部署下单位不同），以"按部署判定"为准，必要时在 provider 内做部署分支判断，而不是取其中一个当作通用规则。
