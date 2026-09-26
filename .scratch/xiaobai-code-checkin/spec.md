# 小白Code 每日签到适配

- Status: resolved（已实现，未提交 PR）
- 现场证据与判定依据：[调查记录](research.md)
- 更新：2026-09-26

## 目标

为小白Code（`https://token.dialoguedui.com`）提供每日签到：账户加入后自动识别该部署的签到协议，按需只读查询今日状态，并在满足门禁时提交一次签到。

现场协议见 [调查记录](research.md)：`GET /checkin/api/status` 读取状态，`POST /checkin/api/checkin`（请求体 `{}`）提交，两者都用账户的 Sub2API 会话令牌做 `Authorization: Bearer`。

## 设计决定

1. **固定路径探测，不读宿主声明的自定义页面。** 方法归属这一个部署，应用路径是它的属性；而站点自述的菜单项是部署配置，运营者可以不登记却仍然提供 API，用它当门禁会漏掉可用的情况。判定依据是应用自己的回答，不是它是否出现在侧栏。
2. **不做 origin 限定。** 其他 Sub2API 站点对 `/checkin/api/status` 会返回前端 SPA 的 200 HTML，按下面的判定是 absent，不会把发现决策拖成 unknown；因此无需维护域名清单。（现场实测见调查记录。）
3. **方法 ID `xiaobai-code:daily-checkin`，来源名称「小白Code」。** `legacy: false`、`newAccountCompatibility: false`，不进入冻结的 V6 迁移清单，也不保留兼容别名或迁移。名字取自部署品牌——应用自身没有任何标识（响应里只有 `config.enabled`、`signedToday` 这类字段，没有 id/名称/版本）。
4. **`requiresAuthoritativeStatusBeforeMutation: true`。** 同一执行周期内必须先读到权威 enabled + 未签到，才允许提交；提交只发一次，不重放。
5. **复用它而非自建。** readiness 与提交后的错误映射复用 [sub2apiShared](../../src/services/checkin/autoCheckin/providers/sub2apiShared.ts)，认证走 `executeAuthenticatedSub2ApiRequest`，适配器不自行读取浏览器存储。状态查询不触发令牌刷新与 401 恢复，提交也不对其做自动重放。

## 协议边界

### 状态

```http
GET /checkin/api/status
Authorization: Bearer <Sub2API access token>
```

严格成功 DTO：`ok === true`，`data.config.enabled` 为布尔，`data.signedToday` 为布尔。映射：

- `config.enabled` → availability enabled / disabled。
- `signedToday` → today checked / not_checked。
- HTTP 404/405 → absent。
- **HTTP 200 但正文不是 JSON → absent。** 依据是该平台在 `/api/v1` 之外对未知路径一律返回前端 SPA 的 200 HTML（现场实测，见调查记录），所以这表示「这个 origin 没有这个应用」，而不是「应用坏了」。
- HTTP 401/403、5xx、网络、超时、JSON 但结构不符 → unknown。
- `data.user`、`data.records`、`data.copy` 等个人信息与历史记录不进入账户配置、日志或 analytics。

### 提交

```http
POST /checkin/api/checkin
Content-Type: application/json
Body: {}
```

严格成功 DTO：`ok === true`，`data.alreadyChecked` 为布尔。

- `alreadyChecked: false` → 本轮新发奖，要求 `data.record.reward_amount` 为有限非负数（数字或十进制字符串）。
- `alreadyChecked: true` → 已签到，不重复发奖。
- 2xx 但 `ok !== true`、结构不符、奖励非法 → 不判成功；已派发时保留 UNCERTAIN，交由统一状态回读协调。
- 不启用不确定结果后的写入重试，也不对提交的 401 做自动重放。

### 幂等性

服务端按「用户 + 日期」幂等：实测重复提交返回同一 `record` 且余额不变。因此重试仍从只读状态开始即可，由 `requiresAuthoritativeStatusBeforeMutation` 门禁保证当天不会发第二次。

## 接入位置

| 位置 | 作用 |
| --- | --- |
| `src/constants/checkIn.ts` | 声明 `XiaobaiCodeDailyCheckIn` 及方法 ID。 |
| `src/services/apiService/sub2api/xiaobaiCodeCheckIn.ts` | 端点、只读判定、严格提交解析。 |
| `src/services/checkin/autoCheckin/providers/xiaobaiCode.ts` | readiness、detect、getStatus、checkIn 与统一结果映射。 |
| `src/services/checkin/autoCheckin/providers/registry.ts` | 注册 Sub2API 候选与来源名称。 |
| `src/services/productAnalytics/autoCheckin.ts` | StrictReadback 方法分类。 |
| `e2e/xiaobaiCodeCheckin.spec.ts` | 扩展内正常发奖、已签到不提交、响应丢失回读。 |

反馈报告的只读路由不登记本方法：路径固定在站点自有 origin 上，不属于该扫描器收录的 provider 路由（[feedbackRoutes.ts](../../src/services/checkin/autoCheckin/providers/feedbackRoutes.ts)）。

## 验收

- 只对 Sub2API 账户成为候选；其他站点类型不注册。
- 未部署该应用的站点判为 unsupported 而不是 unknown，不影响其自动选择。
- 只读探测不发送 POST；404/405 与 200 非 JSON 判为 absent；401/403、5xx、网络与结构不符判为 unknown。
- 未取得权威状态、状态为 disabled 或已签到时都不提交。
- 正常发奖与已签到分别映射为 success 与 already_checked；奖励字段非法不判成功。
- 已派发但响应丢失时保留 UNCERTAIN，不重放提交；状态回读可把结果协调为已签到。
- 响应中的用户资料、邮箱、余额、记录与站点 IP 不进入账户配置、日志或 analytics。
- 相关单元/组件测试、`pnpm compile`、`pnpm knip`、`pnpm i18n:extract:ci` 与扩展 E2E 通过。

## 已知成本与边界

- 每次发现/状态读取发 1 次只读探测；提交 1 次 POST。均为同源、固定路径。
- 该部署若把应用挪到别的路径，需要改一个常量；本方法不会自动跟随。
- 跨源托管的签到应用不覆盖（探测固定在账户 origin 上）。
- 部署在子路径下的站点未验证：端点按账户 origin 拼接，若 `site_url` 含路径前缀需另行处理。

## Comments

- 2026-09-26：初版实现按域名命名并锁定单一 origin。
- 2026-09-26：改为「读宿主声明的自定义页面」的通用发现，并按载体命名。真实账号已完成一次实际领取用于取得首次发奖响应；重复提交验证了服务端幂等，余额未二次增加。
- 2026-09-26：按用户要求把方法 ID 定为品牌名 `xiaobai-code:daily-checkin`；随后撤销菜单驱动——菜单项是部署配置，用它当门禁会漏掉「API 在但未登记到侧栏」的情况，而当初要绕开的 SPA 兜底问题已由「200 非 JSON ⇒ absent」解决。旧 ID 均未发布，不保留兼容别名或迁移。
