# 天才程序员中转站签到：仓库接入说明

日期：2026-09-14。本文描述已实现的适配；现场协议与验证边界见 [调查记录](research.md)。

## 命名与适用范围

适配器按站点品牌“天才程序员中转站”命名，代码使用 `geniusProgrammer`，方法 ID 为 `genius-programmer:daily-checkin`。相关配置仍处于开发阶段，不保留旧 ID 的兼容别名或迁移。

与登仙适配一致，所有 Sub2API 账户均可参与只读协议检测，不限制域名。实际支持由接口与响应结构确认，不能仅凭站点类型或候选注册直接执行签到。无需新增账户站点类型。

## 协议边界

| 方法 | 状态接口 | 提交接口与判定 |
| --- | --- | --- |
| Sub2API Pro | `/api/v1/redeem/checkin/status` | `/api/v1/redeem/checkin`；状态使用 `checked_in_today` 等字段。 |
| 登仙公益站 | `/api/v1/tbe-sponsor-checkin/status` | `normal/begin` → 等待 → `normal/claim`；状态使用 `normal_done` 和 `config.normal_checkin_enabled`。 |
| 天才程序员中转站 | `/api/v1/user/checkin/status` | `/api/v1/user/checkin`；状态使用 `enabled`、`today_checked_in`，提交结果使用 `new_reward`、`reward_amount`。 |

协议来源分别见 [Sub2API Pro 解析器](../../src/services/apiService/sub2api/checkIn.ts)、[登仙传输](../../src/services/apiService/sub2api/denxioCheckIn.ts)、[天才程序员中转站传输](../../src/services/apiService/sub2api/geniusProgrammerCheckIn.ts)。这三个方法分别检测各自的协议。

## 接入位置

| 位置 | 作用 |
| --- | --- |
| [constants/checkIn.ts](../../src/constants/checkIn.ts) | 声明 `GeniusProgrammerDailyCheckIn` 及其方法 ID。 |
| [providers/registry.ts](../../src/services/checkin/autoCheckin/providers/registry.ts) | 注册 Sub2API 候选、站点来源名称；`legacy: false`、`newAccountCompatibility: false`，无 origin 限制。 |
| [providers/index.ts](../../src/services/checkin/autoCheckin/providers/index.ts) | 将方法 ID 映射到 `geniusProgrammerProvider`。 |
| [geniusProgrammerCheckIn.ts](../../src/services/apiService/sub2api/geniusProgrammerCheckIn.ts) | 端点、严格响应解析、状态查询时区、认证生命周期及单次提交。 |
| [geniusProgrammer.ts](../../src/services/checkin/autoCheckin/providers/geniusProgrammer.ts) | readiness、detect、getStatus、checkIn 及统一结果映射。 |
| [feedbackRoutes.ts](../../src/services/checkin/autoCheckin/providers/feedbackRoutes.ts) | 适配报告的只读状态路由。 |
| [productAnalytics/autoCheckin.ts](../../src/services/productAnalytics/autoCheckin.ts) | 使用 StrictReadback 方法分类。 |

新方法不进入冻结的历史迁移清单；已有开发版账户可重新检测签到方法。

## 认证与执行

- 复用 [executeAuthenticatedSub2ApiRequest](../../src/services/apiService/sub2api/authLifecycle.ts)，集中处理凭据、JWT、身份验证和会话绑定；适配器不自行读取浏览器存储。
- 使用 [provider context](../../src/services/checkin/autoCheckin/providers/contracts.ts) 传递请求上下文与 mutation observer。
- [detectWithStatusReadback](../../src/services/checkin/autoCheckin/providers/detection.ts) 将 404/405 映射为 unsupported；登录、网络和响应结构错误保留 unknown。
- `requiresAuthoritativeStatusBeforeMutation: true` 要求同次执行中的权威状态确认 enabled 且未签到，才允许提交。
- 未启用 `retryAfterUncertainNotChecked` 或 POST 的 401 自动重放。结果丢失时交由 [统一状态协调](../../src/services/checkin/autoCheckin/methods.ts) 回读；无法确认时保留 UNCERTAIN。

## 验证入口

- [协议与传输测试](../../tests/services/apiService/sub2api/geniusProgrammerCheckIn.test.ts)：响应校验、HTTP 错误、认证请求、时区和不重放提交。
- [provider 测试](../../tests/services/autoCheckin/providers/geniusProgrammer.test.ts)：跨域名候选、只读发现、状态门禁、结果映射与不确定结果协调。
- [扩展 E2E](../../e2e/geniusProgrammerCheckin.spec.ts)：正常发奖、已签到不提交、发奖后响应丢失。所有站点请求均被模拟拦截，不代表真实账号首次领取验证。
