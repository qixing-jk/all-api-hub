# 签到奖励展示（checkin-reward-display）

- Status: ready-for-agent
- Created: 2026-09-28
- Related: `.scratch/ai-router-adaptation/`、`.scratch/xiaobai-code-checkin/`、`.scratch/genius-programmer-checkin/`

## 目标

签到结果显示站点给出的**权威奖励金额**（"本次奖励 +$0.25"），并让"拿不到权威值"成为显式的默认，而不是猜一个数。

## 非目标（已拍板，不要在本功能里做）

1. **不做签到前后余额差值**，也不为差值新增请求（不给每个账号每天多一次签到前刷新）。
2. **不用估算（`estimatedTodayIncome`）填奖励空缺**。`balanceHistory.estimatedTodayIncome.enabled` 保持默认 `false`，估算继续只作为"发现未入日志收入"的信号，不作为展示数字。
3. **不动余额历史数据结构**：不改 `DailyBalanceSnapshot`、不改 `todayIncomeEstimate` 公式、不新增"签到事件"存储。
4. **不改通知文案**，奖励只在签到结果界面出现。
5. **不解析发到订阅次数/积分/赠送包里的奖励**，这类站点显示为"无金额"。
6. 不做余额历史趋势图的签到 marker（独立议题，另开）。

## 为什么优先接"权威奖励"而不是"估算"

- 估算公式 `quota_today − quota_昨日基准 + 今日消费`（`src/services/history/dailyBalanceHistory/todayIncomeEstimate.ts:93`）是余额守恒启发式，无法区分签到奖励、兑换码、客服补发、管理员调整，也无法表达订阅/额度重置；默认开启会把这类站点的异常值直接摆在用户面前。
- 而多数站点在签到响应里**已经返回了本次奖励**，只是被丢弃了：`CheckinAccountResult`（`src/types/autoCheckin.ts:195`）没有金额字段，scheduler 的 `buildResult`（`src/services/checkin/autoCheckin/scheduler.ts:1196`）只搬运 message 类字段，不搬运 `providerResult.data`。全仓唯一读 `data` 的地方是 `src/services/checkin/autoCheckin/methods.ts:362`，只往下传、无人消费。

## 数据模型决策

- `CheckinAccountResult` 的 **SUCCESS / ALREADY_CHECKED 分支**增加可选 `reward?: CheckInReward`，`CheckInReward = { quota: number }`，单位是扩展内部 quota（与 `account_info.quota`、余额历史快照同一单位）。展示时按账户 `exchange_rate` 与用户 `currencyType` 换算，复用现有货币格式化。
- **归一化放在 provider / apiService 层**，不放 scheduler：quota 与 USD 的差别是站点知识，只有对应 provider 知道。scheduler 只负责把 `reward` 搬到结果里。
- provider 通过新增的显式字段表达奖励，**不要让 scheduler 去猜 `data` 的形状**；没有权威值的 provider 就不带这个字段。
- New API 的 `ALREADY_CHECKED` 可使用已获取的 `stats.records` 或响应记录中的当天奖励；按本地日期匹配，匹配不到就不展示，且不增加请求。

## 站点覆盖表（长期清单，新增签到方法时必须更新）

| 方法 ID | 站点类型 | 奖励字段 | 已知单位 | 证据 | 状态 |
| --- | --- | --- | --- | --- | --- |
| `new-api:daily-checkin` | new-api / modelflare（含 RixAPI 等 fork） | mutation `data.quota_awarded`；状态 `stats.records[].quota_awarded`、`stats.total_quota` | quota | `src/services/apiService/newApiFamily/checkInDto.ts:6`；`providers/newApi.ts:281` | 已接入。**已签到行同样显示当天奖励**：状态读回本来就带 `stats.records`，取其中 `checkin_date` == 本地当天的记录，零额外请求；RixAPI 6.x（`platform.ephone.ai`）2026-10-03 登录态实测：`/api/user/checkin`、`/api/user/check_in`、`/api/user/sign_in` **全部 404**，该部署没有签到，因而没有奖励来源 |
| `wong-gongyi:daily-checkin` | wong-gongyi | mutation `data.quota`；`min_quota` / `max_quota` 为奖励区间 | quota | 站点前端 bundle `https://wzw.pp.ua/assets/index-JGp5IMg4.js`：POST 后 toast `恭喜获得额度：{data.quota}`、设置页写明 min/max 为"内部额度单位，500000 Token = 1 USD" | 已接入：`data.quota` = 本次奖励、单位 quota |
| `veloera:daily-checkin` | veloera | mutation `data.quota`；状态接口无金额 | quota | 上游 `Veloera/Veloera@6525dfce` `controller/user.go` 的 `CheckIn` 返回 `data.quota: reward`，`model/user.go` 的 `User.CheckIn` 把 reward 计入 `user.Quota` | 已接入：provider 读取 `data.quota`，单位 quota。上游 head 复核：`quota_awarded` 在该文件中不存在，旧测试夹具里的同名键是虚构载荷 |
| `voapi-v2:daily-checkin` | voapi-v2 | submit `{amount, bonusAmount}`；stats `todayRecord`（`unknown`，未解析） | 站点金额，`amountToQuota` 可换算 | `src/services/apiService/voapiV2/type.ts:113`；`providers/voapiV2.ts:85` | 已解析但被 provider 丢弃（成功分支只带 `stats`）；`amount` 与 `bonusAmount` 的叠加语义待确认（03） |
| `sub2api-pro:daily-checkin` | sub2api | `reward_amount`（+ `new_balance`、`checked_in_at`） | USD 十进制（同族换算） | `src/services/apiService/sub2api/checkIn.ts:180`；家族单位见 `parsing.ts:130` | 已接入：单位按 Sub2API 家族 USD 处理，未实测复核 |
| `genius-programmer:daily-checkin` | sub2api | `reward_amount`（`new_reward` 区分新发奖） | USD 十进制 | `.scratch/genius-programmer-checkin/research.md:19`（实测 `0.05`） | 已接入 |
| `denxio:daily-checkin` | sub2api | claim `data.record.amount` | 未确认（数字；疑为 USD） | `src/services/apiService/sub2api/denxioCheckIn.ts:177` | 已解析、被丢弃；单位待确认（03） |
| `xiaobai-code:daily-checkin` | sub2api | `data.record.reward_amount`（同响应 `status.user.balance` 为领取后余额） | USD 十进制 | `.scratch/xiaobai-code-checkin/research.md:50`（实测 `"0.25"`，余额 1.5→1.75） | 已接入 |
| `ai-router:daily-checkin` | sub2api（按 origin 注册） | `data.reward_amount`（+ `balance`、`claimed_at`） | USD 十进制 | `.scratch/ai-router-adaptation/spec.md:185`（实测 `reward_amount: 1`、`balance: 2.3`） | 已接入 |
| `toolcode:daily-checkin` | sub2api | `data.points_reward`；`data.reward_amount` + `expires_at` | 积分；独立的有时效赠金（USD） | 2026-10-04 `https://toolcode.top/engagement` 登录态实测，POST 返回 10 积分、赠金 0，积分 10→20，余额仍为 0；重复 POST 为 409 `CHECKIN_ALREADY_COMPLETED` | 不显示余额奖励金额：积分及有时效赠金独立于账号余额，遵循本 spec 非目标 5；无估算或硬编码 |
| `anyrouter:daily-checkin` | anyrouter | 无金额字段（`code`/`ret`/`success`/`message`/`msg`） | — | `providers/anyrouter.ts:28` | 当前无来源：签到响应无金额，且该方法不支持状态读回。2026-10-03 登录态实测：`/api/user/checkin`、`/api/user/check_in`、`/api/user/sign_in` 均 200 + `权限不足`，拿不到结构化金额；站点的**公告文本**里写明"用户每日签到获赠额度提升至 $25"（公开、免登录可读）——是散文字段且明确被调整过，不解析、不硬编码 |
| `agentrouter:login-checkin` | new-api / one-api 镜像域 | **无金额字段**：登录/OAuth 回调响应里只有 `checked_in: true`，没有奖励数额 | — | `src/entrypoints/content/messageHandlers/handlers/agentRouterOAuth.ts:212`（读 `localStorage.user.checked_in`）；2026-10-03 实测 `localStorage.user` 的键里没有任何奖励字段；站点前端 `assets/index-Cs_52wE9.js` 拿到 `checked_in` 后只弹"签到成功，新增额度已到账" | **无来源、不显示**：奖励随 OAuth 登录发放且金额不返回给客户端。不把 `checked_in` 当金额、不硬编码、不解析文案里的数字。要显示需等扩展解析 `/console` 的签到条（另一条工作线） |

"已解析、被丢弃"指字段已经过解析却到不了结果记录，接入成本仅为搬运与换算。

## 展示规则

- 有有效 `reward` 时在消息后同行显示 `· +{symbol}{金额}`；状态列保留结果徽标，消息搜索仍只匹配原消息。
- 没有 `reward` 时不显示任何金额，**不显示 0、不显示占位、不回落到估算值**。
- 金额换算失败或不是有限非负数时按"无奖励"处理，不报错、不让整行结果失败。

## 验收

- SUCCESS 结果在有权威奖励时携带 `reward`，且换算后的值与该站点实际入账一致（以实测报文为准）。
- 没有权威奖励的方法、以及 FAILED / SKIPPED / UNCERTAIN 的结果，`reward` 字段不存在。
- 结果行：有奖励显示、无奖励不显示；`getAutoCheckinResultMessage` 的输出不变（它是结果搜索的匹配输入）。
- 现有签到行为与重试策略不变：新增字段不得改变 status、reasonCode、retryable 或任何执行/回查路径。

## 已实现

- provider 归一化权威奖励，scheduler 搬运到结果；FAILED / SKIPPED / UNCERTAIN 禁止携带奖励。
- 结果行在消息后显示奖励，使用用户选择的货币与账户汇率；余额展示复用同一 quota 换算函数。缺失或无效汇率、非有限金额与非正奖励均不显示。
- New API 已签到行可从已有记录读取本地当天奖励；不匹配相邻日期，不新增请求。
- 待确认的来源只有 denxio 与 voapi-v2；已有部署证据及后续条件见覆盖表与 issue 03。

## 待确认与维护

- 单位/语义确认：`issues/03-confirm-reward-units-per-deployment.md`。
- 新方法登记要求：`issues/04-record-reward-requirement-for-new-methods.md`。
