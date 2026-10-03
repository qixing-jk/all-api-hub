# 01 — 结果类型与搬运：把 provider 已有的权威奖励接到 CheckinAccountResult

- Status: resolved
- Parent: `../spec.md`
- Blocked by: none

## 背景

签到响应里的奖励字段已经被解析，却到不了结果记录：

- `CheckinAccountResult`（`src/types/autoCheckin.ts:195`）没有金额字段。
- scheduler 的 `buildResult`（`src/services/checkin/autoCheckin/scheduler.ts:1196`）只搬运 `message` / `messageKey` / `messageParams` / `rawMessage` / `reasonCode` / `retryable` / `methodId` / `reconciliation` / `accountStateDurability`，不搬运 `providerResult.data`。
- `src/services/checkin/autoCheckin/methods.ts:362` 是唯一读 `data` 的地方，只往下传、无人消费。

## 范围

本切片承接"字段与单位已确认"的方法：

| 方法 | 来源字段 | 处理 |
| --- | --- | --- |
| `new-api:daily-checkin` | `data.quota_awarded`（`src/services/apiService/newApiFamily/checkInDto.ts:6`） | 已是 quota，直接使用 |
| `wong-gongyi:daily-checkin` | `data.quota`（`src/services/apiService/newApiFamily/variants/wong.ts:33`） | 已是 quota（站点前端 `恭喜获得额度：{data.quota}`，min/max 为额度区间） |
| `veloera:daily-checkin` | `data.quota`（上游 `Veloera/Veloera@6525dfce` `controller/user.go` → `model/user.go` 计入 `user.Quota`） | 已是 quota；需要新增一处有限非负数的读取（当前 `providers/veloera.ts:114` 把 `data` 读成 `unknown`） |
| `sub2api-pro:daily-checkin` | `reward_amount`（`src/services/apiService/sub2api/checkIn.ts:180`） | USD → `convertUsdBalanceToQuota` |
| `genius-programmer:daily-checkin` | `reward_amount`（实测 `0.05`） | USD → 同上 |
| `xiaobai-code:daily-checkin` | `data.record.reward_amount`（实测 `"0.25"`） | USD → 同上 |
| `ai-router:daily-checkin` | `data.reward_amount`（实测 `reward_amount: 1`、`balance: 2.3`） | USD → 同上 |

`denxio`（单位未确认）、`voapi-v2`（`amount`/`bonusAmount` 语义未确认）、RixAPI 6.x（同一 new-api 方法下的 USD 形态未确认）不在本切片，等 `03` 的结论；确认后各自是"加一处换算 + 一处 provider 传值"的小改动。

## 实施步骤（TDD）

1. 先加失败测试，再实现。
2. 类型：`src/types/autoCheckin.ts` 增加 `CheckInReward`（`{ quota: number }`），并在 `CheckinAccountResult` 的 **SUCCESS / ALREADY_CHECKED 分支**加可选 `reward?: CheckInReward`。FAILED / SKIPPED / UNCERTAIN 分支不允许带（用 `reward?: never` 约束，与既有 `retryable` 的写法一致）。
3. provider 产出：`AutoCheckinProviderOutcome`（`src/services/checkin/autoCheckin/providers/types.ts`）增加可选 `reward?: CheckInReward`。上述 provider 在 SUCCESS 分支按上表换算后填入；换算函数取自对应 apiService 的既有 helper（sub2api 家族的 `convertUsdBalanceToQuota`，`src/services/apiService/sub2api/parsing.ts:130`）。
4. 搬运：`buildResult` 接受并透传 `reward`；`src/services/checkin/autoCheckin/methods.ts` 的成功分支一路带到结果。
5. 非有限、负值、字段缺失 → 不设置 `reward`（按"无奖励"处理），绝不让整行结果因此变成失败。

## 测试

- `tests/services/autoCheckin/providers/newApi.test.ts`：成功分支携带 `reward.quota === data.quota_awarded`。
- `tests/services/autoCheckin/providers/wong.test.ts`、`veloera.test.ts`：成功分支携带 `reward.quota === data.quota`；字段缺失或非法（非有限、负数）时不带 `reward`。
- `tests/services/autoCheckin/providers/sub2apiPro.test.ts`、`geniusProgrammer.test.ts`、`xiaobaiCode.test.ts`、`aiRouter.test.ts`：USD → quota 换算正确（含十进制字符串形态），字段缺失时不带 `reward`。
- `tests/services/autoCheckin/scheduler.test.ts`：SUCCESS 结果携带 `reward`；FAILED / SKIPPED / UNCERTAIN 结果没有该字段。
- 用中性 fixture，不写真实域名。

## 验收

- 新增字段不改变任何既有 status / reasonCode / retryable / 执行与回查路径；现有相关测试保持通过。
- 没有 `reward` 时结果对象与改动前等价（不出现 `reward: undefined` 之外的形态差异，序列化保持干净）。

## 注意

- 单位换算只在 provider 层做，不要引入"按 `data` 形状猜测站点"的通用归一化器。
- 不要顺手把 `data` 整体塞进 `CheckinAccountResult`：那会把站点原始响应带进存储与 analytics。
