# DaiGua 普通签到：协议依据与实测边界

已合并：[PR #1693](https://github.com/qixing-jk/all-api-hub/pull/1693)，关联 [issue #1622](https://github.com/qixing-jk/all-api-hub/issues/1622)。以下记录来自 2026-10-13 至 2026-10-14 对 `https://api.daigua.icu` 的调查；原生版本标签从 `v0.2.15` 变为 `v0.2.16`，标签不是固定的服务端源码版本。

## 为什么只增加签到方法

原生账号沿用 Sub2API Bearer token 与刷新生命周期，控制台和账号 API 同源。差异在签到 DTO，因此保留 `sub2api`，按状态结构发现 `daigua:daily-checkin`，不增加站点类型或主机名限制。

原生 `GET /api/v1/checkin/status?timezone=<浏览器时区>` 提供状态，普通领取是 `POST /api/v1/checkin`。`/api/v1/checkin/luck` 会押注账号余额，不在适配范围。普通与幸运签到共用每日资格；`luck_enabled` 不能用来开启普通领取。奖励 `reward_amount` 是十进制 USD，盲盒奖品不能加进余额奖励。

维护入口：[协议](../../src/services/apiService/sub2api/checkin/daiguaCheckInProtocol.ts)、[解析与请求](../../src/services/apiService/sub2api/checkin/daiguaCheckIn.ts)、[provider](../../src/services/checkin/autoCheckin/providers/daigua.ts)。

## 取得验证 token 不等于已经领取

2026-10-13，原生普通签到按钮打开验证对话框，约六秒后页面取得 token；继续观察后仍没有领取 POST，状态仍可签到，对话框等待用户确认。这是当时部署的显式确认流程，不能推断所有站点都不会自动提交。

随后在既有页面中只发了一次与适配器一致的请求：Bearer 认证、`credentials: omit`，JSON body 携带 `turnstile_token`。服务端返回成功，`reward_amount: 0.19`、`checkin_type: normal`；状态读回确认已签到且奖励一致，余额增加 0.19 USD。之后未点击原生确认按钮。

这证明了真实站点的辅助请求协议，尚不能证明扩展临时窗口能独立完成领奖。若以后站点改为验证后自动提交，需要在共享浏览器执行流程中处理页面完成与重复提交风险，不能仅依赖请求结束后的最终读回。

## 扩展独立领奖仍有验证缺口

2026-10-14，在确认新一天可领取后，扩展运行到原生验证对话框；验证组件要求人工勾选，超时前没有产生 token。扩展提示需要人工验证，最终读回仍可签到，余额未变。不能将已有的发现、保存和状态读回成功写成“扩展自动领奖已验证”。

后续需要在真实可领取日验证扩展独立完成验证、领取及读回。重复 POST 的服务端保证、跨日行为、其他账号的挑战行为和长期凭据续期也未由上述实测建立。显式验证失败可以按既有策略进入辅助流程，未知写入结果不能直接重发；[注册与重试约束](../../src/services/checkin/autoCheckin/providers/registry.ts) 保持非重复安全策略。

回归入口：[协议测试](../../tests/services/apiService/sub2api/checkin/daiguaCheckIn.test.ts)、[provider 测试](../../tests/services/autoCheckin/providers/daigua.test.ts)。已有 [live runner](../../scripts/test-daigua-checkin-e2e-live.mjs) 验证发现、保存与状态读回，不提交领取；它通过不代表独立领奖缺口已关闭。
