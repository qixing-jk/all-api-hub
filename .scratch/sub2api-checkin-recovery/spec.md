# Sub2API 签到认证恢复统一

## 范围与决定

用户确认统一 Sub2API 签到的认证恢复：401 后恢复认证，再读取当天状态；已签到返回已签到，仍未签到且允许签到时才重试。状态读取失败阻止重试。恢复期间重新检查当前账号的选择和自动执行意图。网络响应丢失继续由外层协调，不进入认证重放。

所有直接执行 API 签到的方法共用 `unauthorizedRecovery.ts`：柏 API、FreeAPI、Clawhud、Genius Programmer、DaiGua、Hiyo、Sidrune、ToolCode、AI-ROUTER、小白Code，以及已经有恢复门禁的 Sub2API Pro、Denxio。端点、状态字段、时区、奖励和业务错误仍归各协议适配所有。

NexaVlinks 没有扩展直接提交签到 API 的路径，走原生网页验证码流程，本次不改。DaiGua 的显式 Turnstile 辅助路径同样保留其原有专用恢复政策。Hiyo 的提交可能领取额外奖励，恢复前必须重新确认 `daily_claimed` 和日签到资格，不能凭通用 `can_claim` 重试。

认证恢复迁移不调整柏 API 的盲盒奖励字段优先级。后续于 2026-11-03 经用户授权核对线上前端后修复零金额回退：先选择 draw 的非 null/undefined 金额，再过滤零值或畸形值；详见柏 API 规格的后续验证记录。

## 证据与验收

起点：`de687ba013`。在实施前创建 `recovery/temp16-before-auth-unification-20261103`，普通合并当时的 `origin/main`，得到 `88af2a2ac062823f6738a039e9c11a6f4ddc3817`。用户原有 live 脚本未提交修改保留且不纳入任务提交。

| 行为 | 断言与证据 |
| --- | --- |
| 401 恢复后状态已签到，不再 POST | [`unauthorizedRecovery.test.ts`](../../tests/services/apiService/sub2api/checkin/unauthorizedRecovery.test.ts)，十个直接 API 适配逐项覆盖，检查 POST → GET 与恢复后的凭据 |
| 当天仍未签到，才允许一次重试 | 同一测试覆盖 POST → GET → POST；再次 401 不进行第二轮恢复 |
| 读取失败或返回畸形状态，阻止重试 | 同一测试覆盖网络读失败和畸形 DTO；provider 返回 `failed/status_unavailable` |
| 恢复期间账号意图改变 | 同一测试覆盖执行接口和 provider 的 `beforeRecoveredMutation` 传递与 `account_unavailable` 反馈 |
| 已签到反馈不虚构奖励 | 同一测试通过 provider 检查 `already_checked` 且无 `reward` |
| 网络响应丢失不重放 | 同一测试断言只调用一次，不尝试认证恢复 |
| Pro、Denxio 保持原有执行语义 | [`checkInTransport.test.ts`](../../tests/services/apiService/sub2api/checkInTransport.test.ts)、[`denxioCheckInTransport.test.ts`](../../tests/services/apiService/sub2api/denxioCheckInTransport.test.ts) 保留恢复、持久化、日状态、账户意图及分阶段执行断言 |
| 检测继续只读，协议与奖励解析保持各自语义 | 签到 adapters、providers、discovery 和 methods 回归测试 |

TDD 初始红灯：柏 API 的“恢复后已签到不再提交”测试错误地得到提交成功；FreeAPI 同场景仍抛 401。六个其他单步骤 API 适配及两种独立信封适配迁移前的恢复测试分别失败。provider 已签到反馈及意图检查共 20 项在接入共享结果映射/意图回调前失败，随后全部通过。

当前新增统一恢复测试 100 项通过。Hiyo 原有“401 不尝试任何认证恢复”断言按统一合同更新；仍验证恢复不可用时保持 401、不重放。

最终相关测试 49 个文件、1460 项全部通过，日志留在本地 [`unit.log`](../../test-results/sub2api-checkin-recovery/unit.log)。`pnpm compile`、`pnpm knip` 和 `git diff --check` 通过。

独立只读验收 `/root/recovery_acceptance` 检查源代码、恢复测试、柏 API 保留协议证据及 Hiyo 协议注释/测试，未发现范围内的可操作缺陷。确认恢复凭据、日状态/资格、账号意图、单次重试、无虚构奖励、observer 重置和特殊路径边界；真实 401、跨日和渲染 UI 验证仍为空缺。

本次未重做真实站点的 401 恢复、跨日和验证码 UI 验收，亦未再次领取签到奖励；fixture 单测不能证明所有部署的服务端并发限制。用户此前报告真实检测和签到正常，是用户提供的证据。

## Comments

- 2026-11-03：沿用用户确认的公开签到执行接口作为测试入口，统一恢复门禁及结果反馈。保留这个规格用于界定特殊路径和真实验证缺口；生成日志保留本地供审查。
