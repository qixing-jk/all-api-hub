# 小白Code 签到：仓库接入说明

日期：2026-09-26。本文描述已实现的适配；现场协议与判定依据见 [调查记录](research.md)。

## 命名与适用范围

代码使用 `xiaobaiCode`，方法 ID 为 `xiaobai-code:daily-checkin`，来源名称「小白Code」。`legacy: false`、`newAccountCompatibility: false`，不进入冻结的 V6 迁移清单，也不保留兼容别名或迁移。

名字取自部署品牌，因为应用本身**没有可用的自身标识**：状态响应只有 `config.{enabled,title,subtitle,…}`、`user`、`today`、`signedToday`、`records`，没有 id、名称或版本；静态资源的版本串（`?v=20260515-baijing`，白晶=本站货币）是站点打上的。

**不做 origin 限定。** 其他 Sub2API 站点对 `/checkin/api/status` 会返回前端 SPA 的 200 HTML，按下面的判定是 absent（不是 unknown），因此不会把那些站点的发现决策拖成 unknown，也就不需要维护一份域名清单。

## 协议边界

| 方法 | 状态接口 | 提交接口与判定 |
| --- | --- | --- |
| 小白Code | `/checkin/api/status` | `/checkin/api/checkin`（请求体 `{}`）；状态使用 `config.enabled` 与 `signedToday`，提交结果使用 `alreadyChecked` 与 `record.reward_amount`。 |

响应信封是 `{ ok, data }`，与 Sub2API 自身的 `{ code, message, data }` 不同，因此解析器独立实现。数值字段类型不稳定（`reward_amount` 与 `balance` 可能同时以数字或十进制字符串出现），奖励解析同时接受两者，并拒绝空串、负数与非十进制文本。

**唯一一处把内容形态当作否定证据**：`/checkin/api/status` 返回 200 但正文不是 JSON 时判为 absent。依据是该平台在 `/api/v1` 之外对未知路径一律返回前端 SPA 的 200 HTML（已在现场实测，见调查记录），所以这表示「这个 origin 没有这个应用」，而不是「应用坏了」。JSON 但结构不符、401/403、5xx、网络与超时仍保留 unknown。这条判定只作用于本方法。

## 为什么用固定路径

路径是这一个部署的属性，所以固定；而宿主声明的自定义页面（`GET /api/v1/settings/public` 的 `custom_menu_items`）曾是候选来源，现已撤销：那是**部署配置**，运营者完全可以不把签到页登记到侧栏却仍然提供 API，用它当门禁会漏掉可用的情况。判定依据应该是应用自己的回答。

固定路径不带来 origin 问题，理由见上一节：未部署的站点返回 SPA 的 200 HTML → absent。代价是该部署将来若把应用挪到别的路径，需要改一个常量。

## 接入位置

| 位置 | 作用 |
| --- | --- |
| [constants/checkIn.ts](../../src/constants/checkIn.ts) | 声明 `XiaobaiCodeDailyCheckIn` 及其方法 ID。 |
| [xiaobaiCodeCheckIn.ts](../../src/services/apiService/sub2api/xiaobaiCodeCheckIn.ts) | 端点、只读判定、严格提交解析。 |
| [xiaobaiCode.ts](../../src/services/checkin/autoCheckin/providers/xiaobaiCode.ts) | readiness、detect、getStatus、checkIn 与统一结果映射。 |
| [providers/registry.ts](../../src/services/checkin/autoCheckin/providers/registry.ts) | 注册 Sub2API 候选与来源名称。 |
| [providers/index.ts](../../src/services/checkin/autoCheckin/providers/index.ts) | 将方法 ID 映射到 `xiaobaiCodeProvider`。 |
| [productAnalytics/autoCheckin.ts](../../src/services/productAnalytics/autoCheckin.ts) | 使用 StrictReadback 方法分类。 |

适配报告的只读路由不登记本方法：路径固定在站点自有 origin 上，不属于该扫描器收录的 provider 路由。

## 认证与执行

- 复用 [executeAuthenticatedSub2ApiRequest](../../src/services/apiService/sub2api/authLifecycle.ts)，集中处理凭据、JWT 与身份验证；适配器不自行读取浏览器存储。
- 状态查询使用只读请求（`proactiveRefresh: false, recoverUnauthorized: false`）；提交使用 mutation 请求，只发一次、不做 401 重放。
- `requiresAuthoritativeStatusBeforeMutation: true` 要求同次执行中的权威状态确认 enabled 且未签到。
- 服务端按「用户 + 日期」幂等（实测重复提交返回同一记录、余额不变），因此重试仍从只读状态开始即可，不需要额外写入守卫。
- `data.user`、`data.records`、`data.copy` 等个人信息与历史记录不进入账户配置、日志或 analytics；解析器只保留 `enabled` 与 `signedToday`。

## 验证入口

- [协议与传输测试](../../tests/services/apiService/sub2api/xiaobaiCodeCheckIn.test.ts)：固定端点、只读判定（matched/absent/unknown 全部分支）、提交解析与不重放。
- [provider 测试](../../tests/services/autoCheckin/providers/xiaobaiCode.test.ts)：跨 origin 与跨站点类型的候选范围、状态门禁、结果映射与不确定结果协调。
- [扩展 E2E](../../e2e/xiaobaiCodeCheckin.spec.ts)：非应用路径返回 SPA 兜底时仍能正确判定，并覆盖正常发奖、已签到不提交、发奖后响应丢失的状态回读。所有站点请求均被模拟拦截，不代表真实账号首次领取验证。
- [registry.test.ts](../../tests/services/autoCheckin/providers/registry.test.ts) 与 [sub2apiPro.test.ts](../../tests/services/autoCheckin/providers/sub2apiPro.test.ts)、[denxio.test.ts](../../tests/services/autoCheckin/providers/denxio.test.ts) 覆盖注册契约与多方法共存时的发现决策。

## 已知边界

- 真实领取是在本适配的调查阶段用账号完成的（见调查记录），不是扩展内执行的；扩展内路径由模拟接口的 E2E 覆盖。
- 未验证 `config.enabled: false` 的禁用响应与运行中的会话过期恢复链路，两者按既有 Sub2API 认证生命周期处理。
- 该部署若更换应用的路径，需要同步改常量；本方法不会自动跟随。
- 跨源托管的签到应用不覆盖；部署在子路径下的站点未验证（端点按账户 origin 拼接）。
- 若签到应用换了字段形状，解析会判 unknown，而不是误判成功。
