# 02 ai-router.dev 每日签到方法

- Status: resolved
- Parent spec: `../spec.md`
- Blocked by: 01
- 现场证据：`../research.md` §6

## 背景

部署自有签到协议，路由与上游 Sub2API Pro 变体（`/api/v1/redeem/checkin`）不同：

- `GET /api/v1/user/daily-checkin` 读状态
- `POST /api/v1/user/daily-checkin`（无请求体）提交

实测领取一次 +$1.00（余额 $0.30 → $1.30），重复提交返回 `409 DAILY_CHECKIN_CLAIMED` 且余额不变。

## 范围

1. `src/constants/checkIn.ts`：声明 `AUTO_CHECKIN_METHOD_IDS.AiRouterDailyCheckIn = "ai-router:daily-checkin"`。
2. `src/services/apiService/sub2api/aiRouterCheckIn.ts`（新）：
   - 端点常量与错误原因常量（`DAILY_CHECKIN_CLAIMED`、`DAILY_CHECKIN_RESTRICTED`）。
   - `fetchAiRouterDailyCheckInStatus(request)`：只读，严格解析 `{code:0,message,data:{enabled:boolean,checked_today:boolean,eligible?:boolean}}`；404/200 非 JSON 判为 absent；401/403、5xx、网络与结构不符抛出可分类错误。
   - `performAiRouterDailyCheckIn(request, options)`：无请求体、不带指纹头的提交；严格解析成功 DTO（同构 + `reward_amount` 有限非负 + `checked_today === true`）；409/`DAILY_CHECKIN_CLAIMED` → already_checked，403/`DAILY_CHECKIN_RESTRICTED` → 受限；其余非成功按失败抛出。
   - 认证与 401 恢复走 `executeAuthenticatedSub2ApiRequest`，与 `checkIn.ts` 的 Sub2API Pro 变体同形。
3. `src/services/checkin/autoCheckin/providers/aiRouter.ts`（新）：`requiresAuthoritativeStatusBeforeMutation: true`；readiness 复用 `sub2apiShared`；detect 用只读探测；`eligible === false` 时不提交（按未就绪/不可用处理，取站点前端同样的语义）；结果映射复用 `sub2apiShared.mapSub2ApiCheckInMutationError` 并按原因补充 already_checked / 受限分支。
4. `src/services/checkin/autoCheckin/providers/registry.ts`：注册 Sub2API 候选，`origins: AI_ROUTER_HOSTNAMES`，来源 `{kind: third-party, sourceName: "AI-ROUTER"}`，`legacy: false`、`newAccountCompatibility: false`、`supportsStatusReadback: true`。
5. `src/services/checkin/autoCheckin/providers/index.ts`：注册可执行 provider。
6. `src/services/productAnalytics/autoCheckin.ts`：按现有 StrictReadback 分类方式登记本方法。
7. `feedbackRoutes.ts`：**不登记**。扫描器按账户 origin 探测，本方法路径在另一个 origin 上，`FeedbackStatusRoute` 不支持跨 origin。在 spec 的接入位置表里记录该决定。
8. 若新增用户可见文案，补齐 i18n 资源与英文/中文两份，且键不得是动态拼接（`i18n:extract:ci` 会把它判为未使用）。

## 验收

- 只有 host 匹配 `AI_ROUTER_HOSTNAMES` 的 Sub2API 账户成为候选；其他 Sub2API 部署与其他站点类型不产生本方法的探测请求。
- 只读探测只发 GET；404 与 200 非 JSON 判为 absent；401/403、5xx、网络与结构不符判为 unknown。
- `enabled` 假、`checked_today` 真、`eligible` 假三种情况都不提交。
- 正常发奖 → success；`409 DAILY_CHECKIN_CLAIMED` → already_checked；`403 DAILY_CHECKIN_RESTRICTED` → 不可用；提交响应结构不符 → 不判成功。
- 提交不带 `X-AI-Router-Client-Fingerprint`、无请求体、只发一次，不对 401 重放。
- 响应中的奖励金额、用量、邮箱、余额与内部标记不进入账户配置、日志或 analytics。
- 相关定向 Vitest、`pnpm compile`、`pnpm knip`、`pnpm i18n:extract:ci` 通过；扩展 E2E 覆盖正常发奖、已签到不提交与响应丢失回读。

## 待复核

- 提交成功 DTO 目前是按同构推断（站点前端 `D.value = d`，`d.reward_amount`），未直接观测。下一次实际领取（2026-09-28 08:00 +08:00 之后）需复核并按需修订解析器，然后把结论与证据补进 `research.md` §6 与 spec 的「已知成本与边界」。

## Comments

- 2026-09-27：初版。
