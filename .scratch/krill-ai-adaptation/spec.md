# Krill AI：调查修正与后续验证边界

已合并：[PR #1700](https://github.com/qixing-jk/all-api-hub/pull/1700)。结论来自 2026-10-14 至 2026-10-15 的原生控制台调查及后续修正；目标入口 `www.krill-ai.net` 跳转到控制台 `www.krill-code.com`。推理地址不作为控制台别名。

本规格保留原始 SPEC/DISCOVERY 被后续调查修正的部分。测试次数、本机环境、账号数据与验收截图不进入规格。

## 身份检查成功不代表所有账号 API 已鉴权

原生身份接口接受 Cookie，但其他账号接口还需要把同一捕获会话中的 `krill_jwt` 用作 Bearer。最初只验证身份接口的做法不足以证明邀请、目录、兑换等操作可用。

所有账号操作应保持同一会话的身份、请求和读回。推理 Key 不是控制台凭据；没有核实 PAT 或可自动使用的续期契约。后续增加账号接口时，应验证真实接口的认证要求，不能只复用身份接口的成功结果。

实现与回归：[传输](../../src/services/apiService/krill/transport.ts)、[账号测试](../../tests/services/apiService/krill/account.test.ts)、[其他账号接口测试](../../tests/services/apiService/krill/surfaces.test.ts)。

## 原生资源之间容易混淆的边界

- **创建与恢复明文**：原生创建按 name-only 表单提交，立即交付一次性 secret。已存在的脱敏 Key 不能恢复明文，不能因为新建响应有明文而为旧 Key 宣告 reveal 能力，也不能在 secret 交付前插入可能失败的后续配置写入。
- **撤销与永久删除**：原生 `DELETE /api/tokens/{id}` 撤销并保留记录，`DELETE /api/tokens/{id}/destroy` 才永久删除。撤销后验证 `revoked_at`，不能把行消失当作两者共同的成功条件。
- **渠道与账号分组**：密钥选择的是计费路由渠道，空选择沿用站点 `default_routed` 渠道。不能显示成“跟随账号分组”，也不能据此制造运行时模型访问分组。
- **完整展示与新鲜写入基线**：清单足以展示详情，不代表几分钟后的修改可使用同一份旧数据。详情完整性和提交时并发保留是两个不同契约。

实现与回归：[资源适配](../../src/services/apiAdapters/krill/keyResources.ts)、[原生密钥协议](../../src/services/apiService/krill/keys.ts)、[密钥测试](../../tests/services/apiService/krill/keys.test.ts)。

## 为什么价格不能简单乘一个分组倍率

原生默认价格视图采用初始海外路由和适用渠道中的最高倍率，组合倍率按四位小数处理。专属价格已经包含倍率，不能重复相乘。长上下文门槛、按请求与按时长计费各自保留，不能统一转成 token 单价。

原生页面还展示时段价格，但没有公布时区。因此保留时段说明，并明确报价条件不完整，不自动应用折扣。以后补上时段定价，需要先确认时区及跨日规则；不能用本机时区补齐这个缺口。

实现与回归：[定价适配](../../src/services/apiAdapters/krill/modelCatalog.ts)、[定价测试](../../tests/services/apiAdapters/krillPricing.test.ts)。

## 后续验证需要的条件

- 有付费套餐的账号：原调查账号没有付费计划，套餐映射的依据是原生前端和测试样本。
- 有效一次性兑换码：成功响应契约有测试，但没有现场成功兑换的证明。
- `ip_whitelist_grey` 生效的账号：条件编辑器当时通过测试样本验证，未覆盖真实灰名单状态。
- 专属定价规则：当时实测了默认价格视图，专属规则主要由测试覆盖。
- 原生 Firefox、真实客户端消费导入码及付费推理：不能从 Chromium 页面与导出码内容检查推导为这些路径已经验证。

这些是原调查的证据边界，不表示功能必须现在扩展。后续需要复现时先使用现有 [站点 runner](../../scripts/test-krill-e2e-live.mjs)，并重新确认上述条件。
