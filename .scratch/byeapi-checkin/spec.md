# 柏API（byeapi.top）每日签到适配

- 关联 issue：[#1746 [签到适配] 站点签到支持申请](https://github.com/qixing-jk/all-api-hub/issues/1746)
- 现场证据：[调查记录](research.md)
- 状态：已实现（未发布、未提交 PR）

## 问题归因

issue 的现象是「网页可以签到，但拓展不能收到」。调查确认根因不是扩展故障，而是该站点的签到是运营方自加的 **daily-rewards** 模块（`/api/v1/daily-rewards/*`），既有任何 Sub2API 方法都不认识它，因此 4.6.0 的检测把全部方法判为 `unsupported`、选区为空。issue 里 `GET /checkin/api/status → 200` 是小白Code 方法命中了该站的 SPA 兜底页，属于误导线索。

## 设计决定

1. **新增方法 `bai-api:daily-checkin`（来源名「柏API」），不新增站点类型。** 账号仍是 `sub2api`：认证（`Authorization: Bearer` + access token）、`{code,message,data}` 信封和 USD 语义都与既有 Sub2API 适配复用，差异只在签到协议。按品牌命名，因为该模块在响应里没有任何自带标识。
2. **不写死 origin，可用性由状态 DTO 结构判定。** 该路径是运营方自加，样本内的其他 Sub2API 部署（freeapi.site、toolcode.top、api.clawhud.com、asia.nexavlinks.com、free.hiyo.top）都返回 Go 默认 `404 page not found`；上游 `Wei-Shaw/sub2api` 也没有该路由。因此候选对所有 Sub2API 账号开放，未部署该模块的站点落到 unsupported，不会污染唯一匹配。
3. **状态 `enabled` 恒为 true。** 该模块没有独立的开关字段，`/daily-rewards/config` 只发布排行榜与盲盒档位；前端也没有「签到关闭」分支。停用是未验证状态，不臆造。
4. **日界跟随读取方时区。** 站点的 axios 拦截器给所有 GET 追加 `?timezone=<IANA>`，扩展用同一规则；路径构造与执行共用 [`baiApiCheckInProtocol.ts`](../../src/services/apiService/sub2api/checkin/baiApiCheckInProtocol.ts)，反馈扫描器也用它，不各自拼字符串。
5. **只执行每日签到。** 盲盒开启、排行榜领奖、全勤奖励、补签卡都是独立动作，不代领。
6. **奖励取 `draw.cash_amount_usd ?? cash_amount_usd`。** 与前端领奖卡优先级一致；缺失或为 0 时不报奖励（不是报 0），也不据此判失败——当天已发就是成功，只是没有权威金额。
7. **重复提交语义未验证，按非重放处理。** 前端在出错后重读状态判断是否已发，这证明 UI 能自愈，不证明服务端对第二次 POST 不双发。因此：只发一次；状态证明不足时不提交；响应丢失交给统一状态回读协调为 UNCERTAIN，不自动重放。站点自己在响应里报"已签到"时识别为 `already_checked`。
8. **复用既有层。** readiness、执行错误映射复用 [`sub2apiShared.ts`](../../src/services/checkin/autoCheckin/providers/sub2apiShared.ts)；信封解析复用 `createCheckInCodeEnvelopeParser`；检测复用 `detectWithStatusReadback`（404 → unsupported）；提交走 `executeAuthenticatedSub2ApiRequest`，沿用家族默认的 401 恢复。

## 协议边界

```http
GET  /api/v1/daily-rewards/checkin/status?timezone=<IANA>
POST /api/v1/daily-rewards/checkin        （无请求体）
Authorization: Bearer <Sub2API access token>
```

状态成功 DTO：`code === 0` 且 `data.checked_today` 为布尔、`data.checkin_date` 为非空字符串；`data.streak_days` 为合法非负整数时附带。历史、用户资料、补签与盲盒数据不进入账户配置、日志或 analytics。

提交成功 DTO：`data.checkin_date` 为非空字符串；金额字段按第 6 条读取。

## 接入位置

| 位置 | 作用 |
| --- | --- |
| `src/constants/checkIn.ts` | 声明 `BaiApiDailyCheckIn` / `bai-api:daily-checkin`。 |
| `src/services/apiService/sub2api/checkin/baiApiCheckInProtocol.ts` | 端点、时区与状态路径构造（纯函数，供注册表与反馈扫描复用）。 |
| `src/services/apiService/sub2api/checkin/baiApiCheckIn.ts` | 只读探测、严格状态/提交解析、USD 奖励读取。 |
| `src/services/checkin/autoCheckin/providers/baiApi.ts` | readiness、detect、getStatus、checkIn 与结果映射。 |
| `src/services/checkin/autoCheckin/providers/registry.ts`、`index.ts` | 注册候选与来源名。 |
| `src/services/productAnalytics/facts/autoCheckin.ts` | 归类为 StrictReadback。 |
| `e2e/baiApiCheckin.spec.ts` | 扩展内正常发奖、已签到不提交、响应丢失回读。 |

## 已完成 / 未完成

| 组 | 项 | 结论 | 依据 | 缺口 / 验证 |
| --- | --- | --- | --- | --- |
| 发现与状态 | 只读发现 | adapted | 固定路径探测；非部署站 404 → unsupported | 单测 + 真实站点只读探测（无令牌 401 / 带令牌 200） |
| 发现与状态 | 状态与日界 | partial | `checked_today` + 读取方 IANA 时区 | 未验证跨时区日界与停用状态 |
| 执行与奖励 | 执行与协调 | adapted | 状态门禁 + 单次提交 + UNCERTAIN 回读 | 单测、扩展 E2E（含响应丢失）；**未做真实首次领取** |
| 执行与奖励 | 奖励 | partial | `draw.cash_amount_usd ?? cash_amount_usd` → quota | 提交响应结构来自前端消费逻辑，未现场观测 |
| 用户路径 | 检测/选择/执行/反馈 | partial | 既有自动签到流程 | 模拟扩展 E2E 三场景通过；**真实站点 UI 端到端未跑**：隔离开发浏览器没有该站登录态，站点对脚本化会话（丢失 localStorage + `cf_clearance`）持续拒绝保存，不再重试 |

## Comments

- 2026-11-03：初版。认证沿用 Sub2API access token；未做真实领取，因此奖励字段与重复提交语义标记为 partial / 未验证。
- 2026-11-03：真实站点只读链路已完成（`/api/v1/auth/me` 200、`checked_today:false`、`checkin_date` 为当天）。为跑 UI 验收曾按 origin 把该站会话少量转移到隔离开发 profile，但该 profile 每次新页面都只剩 `__agwt_rt`，说明站点主动重建会话存储；按「不反复重试」停在此处，未提交任何领取。临时脚本与凭据副本已删除，未在 `.scratch` 留下任何截图或凭据副本。

- 2026-11-03 后续验证及修复：重新获取线上 `AppLayout.vue_vue_type_script_setup_true_lang-nq5UPdzv.js`，领奖卡、历史合并均使用 `Number(draw?.cash_amount_usd ?? cash_amount_usd ?? 0)`，零值不回退。扩展改为先选原始字段，再调用正金额解析；draw 为数字/字符串零或畸形值时不报告普通记录金额，null/undefined 才回退。TDD 的四项失败断言复现旧代码误报 0.1 后修复通过。日用 Edge 中身份端点及状态端点均返回 200，今天已签到，today_result 的普通金额和 draw 金额均为 0.01503575、monthly_card_awarded 为 false；只读观察未取得真实零金额 draw，也未再次提交签到。公开资源与本地验收记录保留于 `test-results/bai-api-reward/`，零值边界由协议 fixture 回归覆盖。
