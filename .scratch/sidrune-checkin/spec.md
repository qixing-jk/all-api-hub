# Sidrune 福利签到：奖励语义与后续调查条件

已合并：[PR #1699](https://github.com/qixing-jk/all-api-hub/pull/1699)，关联 [issue #1688](https://github.com/qixing-jk/all-api-hub/issues/1688)。原生协议调查日期为 2026-10-15，已核验控制台及账号 API 位于 `global.sidrune.ai`。

## 保留既有账号类型的原因

这是 Sub2API 账号上的福利签到方法 `sidrune:daily-checkin`，不另建账号类型。使用账号现有 Bearer 认证和身份约束，发现过程只读，不因检查签到能力而签发或续期凭据。

请求中提到 `sidrune.ai` 不足以证明它与 `global.sidrune.ai` 的账号或 Cookie 等价。未来调查其他区域时，需要单独核实身份与会话边界，不能自动尝试跨域凭据回退。

## 福利钱包不能当作账号余额收入

原生福利页以 `GET /api/v1/welfare/profile` 读取状态，以无 body 的 `POST /api/v1/welfare/checkin` 签到。规则要求至少一次有效 API 调用，日期边界为 UTC+8；`enabled`、`eligible` 和 `checked_in_today` 是不同条件，不能把功能启用等同于今天可执行。

原生展示 `reward_amount` 与 `milestone_bonus`，但奖励进入独立福利钱包，转换为账号余额还需要用户另外兑换。因此保留上游奖励事实，不报告为账户 quota income，不把福利签到成功解释成美元余额已经增加。

原生同页还有抽奖和兑换入口。它们既不属于每日签到，也没有因本集成获得执行授权，不应根据路由或奖励字段相邻就自动串联。

实现与回归：[原生协议](../../src/services/apiService/sub2api/checkin/sidruneCheckIn.ts)、[provider](../../src/services/checkin/autoCheckin/providers/sidrune.ts)、[provider 测试](../../tests/services/autoCheckin/providers/sidrune.test.ts)。

## 后续现场验证需要区分的三种结果

- 原调查时账号已签到。agent 实际验证了方法发现、保存选择、已签到跳过、福利状态及钱包未变；这些不能算作现场新发放证据。
- 维护者后来补充确认成功签到。这是独立补充，不改变 agent 当次运行的已签到前提；成功响应字段另有原生前端及测试依据。
- 原生重复 POST 的返回与幂等保证没有被确认。服务器先写入、客户端后失去响应时，需要状态核对，不能盲目重放或仅凭错误文案认定未写入。

需要验证新发放时，先准备原生状态为 eligible 且今日未签到的账号，分别检查福利钱包和账号余额。需要改变重复执行策略时，还必须单独建立重复 POST 的可靠契约。

复现入口使用现有 [站点 runner](../../scripts/test-sidrune-checkin-e2e-live.mjs)；[方法注册](../../src/services/checkin/autoCheckin/providers/registry.ts) 保留非重复安全限制。原始身份记录、凭据与截图继续留本地。
