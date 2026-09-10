# 条件计价：上游契约与维护入口

核对日期：2026-09-10。实现状态以本页链接的当前代码和回归测试为准，产品行为见 [当前契约](spec.md)。固定版本的上游链接用于说明适配依据，不表示用户部署已升级到该版本；本文不记录实时模型数量或价格。

## 当前接入范围

| 来源 | 当前实现 | 必须保留的边界 | 回归入口 |
| --- | --- | --- | --- |
| APIyi | [apiyiModelPricing.ts](../../src/services/apiAdapters/newApi/apiyiModelPricing.ts) 归一化站点条件价及币种，接入公共方案 | 站点阈值和缓存口径不能仅凭 New API 的同名字段推断；未确认口径保留限制 | [APIyi Adapter](../../tests/services/apiAdapters/newApi/apiyi.test.ts)、[列表详情](../../tests/features/ModelList/components/ModelItem.apiyi.test.tsx) |
| New API | [billingExpression.ts](../../src/services/apiAdapters/newApi/billingExpression.ts) 解析受约束的 Token 表达式；[mediaPricing.ts](../../src/services/apiAdapters/newApi/mediaPricing.ts) 处理已识别的媒体任务 | 表达式实价不套旧倍率单位；长度条件与计费 Token 扣除分开；未知语法、请求条件及任务语义不能回退成完整平价 | [条件价](../../tests/services/apiAdapters/newApi/modelPricing.test.ts)、[媒体价](../../tests/services/apiAdapters/newApi/mediaPricing.test.ts) |
| OpenRouter | [pricingPlan.ts](../../src/services/apiAdapters/openrouter/pricingPlan.ts) 保留条件、顺序和局部覆盖；[providerModelCatalog.ts](../../src/services/apiAdapters/openrouter/providerModelCatalog.ts) 接入目录及模型限制 | `min_prompt_tokens` 严格超过阈值；UTC 窗口与星期保持原语义；路由占位价和无法拆分的推理输出不能当成确定费率；目录报价不锁定实际服务供应商 | [规则](../../tests/services/apiAdapters/openrouter/pricingPlan.test.ts)、[目录](../../tests/services/apiAdapters/openrouter/providerModelCatalog.test.ts) |
| OneHub / DoneHub | [pricingPlan.ts](../../src/services/apiService/oneHub/pricingPlan.ts) 处理长上下文、缓存及已识别计费维度，接入已有转换流程 | DoneHub 长上下文严格超过原始输入阈值；字段缺失与未知 extra ratios 保留不可核算范围 | [转换回归](../../tests/utils/one-hub-transform.test.ts) |
| Sub2API | [stationPricing.ts](../../src/services/apiAdapters/sub2api/stationPricing.ts) 读取站点区间、时区条件和媒体／按次价格；[sub2apiEstimates.ts](../../src/services/modelList/accountSources/sub2apiEstimates.ts) 协调站点价与估价 | 站点规则优先；组和密钥范围、区间端点、独立图片倍率需保留；站点歧义不能用第三方估价掩盖 | [来源及报价](../../tests/services/modelList/accountSources/sub2apiEstimates.test.ts) |
| AIHubMix | [pricingPlan.ts](../../src/services/apiService/aihubmix/pricingPlan.ts)、[websitePricing.ts](../../src/services/apiService/aihubmix/websitePricing.ts) 和 [meteredPricing.ts](../../src/services/apiService/aihubmix/meteredPricing.ts) 综合结构化、官网及已核实计量规则 | 不再只有四项平价；仍须明确来源冲突、未定价费用和缺失规则，不能把促销描述自动当作额外折扣 | [官网规则](../../tests/services/apiService/aihubmix/websitePricing.test.ts)、[计量](../../tests/services/apiService/aihubmix/meteredPricing.test.ts) |
| LiteLLM | [liteLlmPricingPlan.ts](../../src/services/modelPricing/liteLlmPricingPlan.ts) 归一化已识别的阈值、服务档次及缓存字段；[modelPriceTable.ts](../../src/services/modelPricing/modelPriceTable.ts) 获取价格表 | 始终保留 estimate 来源；不能覆盖账号的自定义结算规则。平价条目与结构化条目都保留可浏览来源 | [价格表](../../tests/services/modelPricing/modelPriceTable.test.ts)、[估价集成](../../tests/services/modelList/accountSources/sub2apiEstimates.test.ts) |

## 用于维护的上游依据

下列固定版本支撑对应适配契约。更新适配时先比较上游变更和当前解析器，再补边界回归；不要将这份索引当作上游最新版本清单。

- OpenRouter：[Models 与 Pricing Overrides](https://github.com/OpenRouterTeam/docs/blob/516401e777830524f1a6ca63cf45997129a7c727/guides/overview/models.mdx)、[OpenAPI](https://github.com/OpenRouterTeam/docs/blob/516401e777830524f1a6ca63cf45997129a7c727/openapi/openapi.yaml)。核对逐键覆盖、严格阈值、UTC 条件及费用单位，不能把不同供应商的分项最低值拼成一份报价。
- New API：[公开价格 DTO](https://github.com/QuantumNous/new-api/blob/bee45b58a3c0b77e8dc81e6b5aeb4474aa9058d1/model/pricing.go)、[表达式语义](https://github.com/QuantumNous/new-api/blob/bee45b58a3c0b77e8dc81e6b5aeb4474aa9058d1/pkg/billingexpr/expr.md)、[组倍率覆盖](https://github.com/QuantumNous/new-api/blob/bee45b58a3c0b77e8dc81e6b5aeb4474aa9058d1/controller/pricing.go)。兼容倍率与表达式同时出现不代表两者都应计入费用。
- Sub2API：[模型广场输出](https://github.com/Wei-Shaw/sub2api/blob/b7dba62678a834080564966c002fd0ca2b328b7a/backend/internal/handler/model_plaza_handler.go)、[上下文价格表](https://github.com/Wei-Shaw/sub2api/blob/b7dba62678a834080564966c002fd0ca2b328b7a/backend/internal/service/billing_context_schedule.go)、[价格解析](https://github.com/Wei-Shaw/sub2api/blob/b7dba62678a834080564966c002fd0ca2b328b7a/backend/internal/service/model_pricing_resolver.go)。核对整单区间、局部覆盖、时间和用户倍率；广场可见性不证明订阅或密钥调用资格。
- DoneHub：[价格结构](https://github.com/deanxv/done-hub/blob/1c09e7d75dc170a53d47af1e88c498816a5b85fb/model/price.go)、[结算入口](https://github.com/deanxv/done-hub/blob/1c09e7d75dc170a53d47af1e88c498816a5b85fb/relay/relay_util/quota.go)。长上下文按整次用量选档，不是仅对超过阈值的部分加价。
- AIHubMix：具体网站规则的可重现依据在 [websiteBillingFixtures.json](../../tests/services/apiService/aihubmix/websiteBillingFixtures.json)、[meteredBillingFixtures.json](../../tests/services/apiService/aihubmix/meteredBillingFixtures.json) 及相邻测试中。新增规则应保存最小脱敏样例，不依赖实时模型数、活动价或自然语言猜测。
- LiteLLM：[价格表结构依据](https://github.com/BerriAI/litellm/blob/eeb7732fc11fd47762ca84cc3fb7cc74235d7097/model_prices_and_context_window.json)。实际请求地址与用户可浏览来源分别由当前价格表模块维护。

## 定价页面与数据接口

定价来源链接用于让用户核对规则，不应把后台价格编辑入口或数据 API 误当作面向用户的模型页面。

- [站点路由定义](../../src/services/accountSiteDefinitions/definitions.ts) 记录已接入的入口和依据；[URL 测试](../../tests/services/accounts/accountSiteProfile.test.ts) 检查子路径、查询编码和凭据去除。
- New API 的 [广场搜索路由](https://github.com/QuantumNous/new-api/blob/bdef117505247769268b209665fb3ad7554c3da7/web/src/routes/pricing/index.tsx) 支持模型搜索。本项目采用 `/pricing?search=...`，不凭站点类型假定所有部署都支持新版独立模型详情路由。
- 其余来源的当前跳转表见 [当前契约](spec.md#来源与跳转)。账号站点链接和公开目录／估价证据独立处理，不能将账号地址覆盖到公共来源上。

## 变更时必须复核

- 阈值前、等于、后的结果，以及输入／输出／缓存的包含关系。
- 时间窗端点、跨午夜及星期、规则顺序和未覆盖区间。
- 0 与缺字段、基础值继承、已应用倍率和独立图片倍率。
- Token 单价指数与请求费用的范围、单位、完整性及最低价资格。
- 来源冲突、路由占位、未知规则和缺失选择项的恢复行为。
- 缓存持久化与失效，及摘要、详情、排序是否继续消费相同报价。
