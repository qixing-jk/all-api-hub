# FreeAPI 每日签到：发现策略与待验证条件

已合并：[PR #1713](https://github.com/qixing-jk/all-api-hub/pull/1713)，关联 [issue #1703](https://github.com/qixing-jk/all-api-hub/issues/1703)。协议调查日期为 2026-10-16，目标 `https://freeapi.site`，当时原生站点名为“露娜”。

## 为什么增加方法而不增加站点类型

调查核实了既有 Sub2API 账号认证、`/api/v1` 信封及 USD 语义；差异是每日签到协议。因此保留 `sub2api`，增加 `freeapi:daily-checkin`，不复制账号适配器。

方法注册没有将 origin 写死为 `freeapi.site`。当时调查的其他部署和上游没有这个签到路径，但它们只是日期快照，不能证明今后没有相同协议的部署。可用性由状态契约发现，不能把方法名称当作主机名识别规则。

## 当时为什么其他方法识别不到

- 本站状态读取是 `GET /api/v1/user/checkin?timezone=<IANA>`，执行为同路径 POST，POST 无 body、无 timezone query。GET 的时区与原生浏览器时区一致；公开配置中的服务器时区不能直接替代前端请求行为。
- 兄弟方法使用的 `/api/v1/user/checkin/status` 等路径当时返回 404；`/checkin/api/status` 返回的是 HTTP 200 的 SPA HTML。状态码成功不能证明它提供了 JSON 签到协议。
- 原生 USD 格式化函数、状态金额与成功响应的 `amount` 共同建立奖励单位，不能凭字段名为其他部署推断相同单位。

实现与回归：[路径与时区](../../src/services/apiService/sub2api/checkin/freeApiCheckInProtocol.ts)、[协议解析](../../src/services/apiService/sub2api/checkin/freeApiCheckIn.ts)、[协议测试](../../tests/services/apiService/sub2api/checkin/freeApiCheckIn.test.ts)。

## 为什么需要集中识别兄弟 DTO

原来的逐方法互认容易漏掉一对兄弟协议，导致合法的别家响应被当作未知错误，影响“唯一可用方法”的发现。此次将 FreeAPI、Clawhud、Genius Programmer 的状态结构区分集中到 [判别表](../../src/services/apiService/sub2api/checkin/siblingStatusContracts.ts)。

新增共享路径协议时，维护其必要区分字段和不能认领的兄弟样本，并运行 [双向判别测试](../../tests/services/apiService/sub2api/checkin/siblingStatusContracts.test.ts)。只有识别为已知兄弟协议时才能报告 foreign；一个仅含 `enabled` 和 `checked_in_today` 的稀疏对象不够，仍应保持 unknown，不能为得到唯一结果而猜测 unsupported。

## 已签到跳过不证明重复 POST 安全

初期笔记中的浏览器连接阻塞后来已解决：当次真实扩展流程完成了发现、保存选择、一次签到、奖励读回及已签到后的再次运行，临时账号已清理。

再次运行在状态层跳过，没有证明服务器重复处理 POST 的契约。因此仍归入非重复安全方法；写入结果不确定时不能自动进入重放队列。以后要调整这条规则，需要服务器幂等证明或受控重复提交证据，不能仅依据 UI 的已签到跳过。

维护入口：[方法注册与重试约束](../../src/services/checkin/autoCheckin/providers/registry.ts)、[provider 测试](../../tests/services/autoCheckin/providers/freeApi.test.ts)、[已有 live runner](../../scripts/test-freeapi-checkin-e2e-live.mjs)。本规格不保存具体奖励样本、凭据或本机连接步骤。
