# 模型条件计价：当前实现契约

Status: implemented with explicit unsupported and incomplete-price states

核对日期：2026-09-10。本文描述当前代码的行为和边界；上游依据及维护入口见 [研究依据](research.md)。不保存开发过程、临时价格快照或尚未实现的界面方案。

## 目的与模块边界

模型列表在相同用量占比和计价条件下比较报价。摘要、计算详情、最优分组和排序使用同一报价结果，避免按首档排序却展示另一档价格。

- [pricingPlan.ts](../../src/services/modelPricing/pricingPlan.ts) 定义并校验 `PricingPlan`、费率、条件、场景及报价结果；[pricingConstants.ts](../../src/services/modelPricing/pricingConstants.ts) 统一运行时取值和单位。
- Adapter 将上游事实转为公共契约，保留规则次序、缺失信息和倍率归属；不在 UI 中执行上游任意表达式。
- [quoteModelPrice.ts](../../src/services/modelPricing/quoteModelPrice.ts) 求值；[quoteCanonicalModelPrice.ts](../../src/services/modelPricing/quoteCanonicalModelPrice.ts) 衔接旧平价数据与结构化方案。
- [useFilteredModels.ts](../../src/features/ModelList/hooks/useFilteredModels.ts) 在来源及分组上下文中生成报价，并用于显示和比较；React 状态仍由功能层持有。

## 报价不变量

1. 明确区分金额、币种、计量单位和费率分母。Token、图片、秒、字符、搜索单位、页和百万像素不能仅按金额混排；缓存读取、普通写入和 1 小时写入也是不同费用项。
2. 条件保留输入、输出、总长度及扣除类别的口径，支持选择项、数值范围、日期、时区时间窗和日历条件。阈值是否包含端点由 Adapter 明确转换。
3. 规则按契约执行局部费率覆盖，不能把未提供的费用项视为免费。明确的 `0` 价有效；未知、不支持、冲突和缺失有独立问题码。
4. 分组倍率、站点转换和展示货币换算不得重复应用。方案声明倍率是否已包含，报价保存计算依据。
5. `complete`、`partial`、`unavailable` 描述当前比较范围内的完整性。只有单位及比较上下文兼容的完整报价参与最低价判断；已知小计不能冒充完整总额。
6. `account`、`catalog`、`estimate` 是来源说明，不能单独作为排序准入门槛。目录可见、模型可调用和实际路由扣费仍是不同事实。
7. 公共引擎支持 `request` 与 `token-index`；Token 指数不声称包含整次请求的全部附加费。模型能力限制与价格条件也不混为一谈。

## 当前列表交互

[pricingScenario.ts](../../src/features/ModelList/pricingScenario.ts) 的列表设置固定为 `token-index`，以使用场景预设和可调整权重进行日常比价。参考输入长度为 32,000、输出为 2,000，默认标准服务档次，参考时间在创建设置时取当前时间。这些是比较条件，不是个人实际用量预测；列表没有单次请求估价模式切换器。

- 普通浏览保留紧凑的单项价格；比价显示当前条件下的结果。媒体及任务方案按自己的计量单位和任务数量报价。
- 条件控件依据方案能力显示，按阶梯、图片、视频和其他条件分块。折叠摘要保留实际用量占比、相关任务数量、已设置的面积、参考时间及选择项。
- “配置条件”展开相关区域并定位缺失字段。依赖协议的 Token 扣除规则会提供协议选择；不支持的规则不能伪造一个可修复输入。
- 清空数量表示未提供；无效草稿失焦后清除。筛选到无显式 comparison 元数据的固定图片方案后，图片数量仍可编辑。
- 缓存选档口径不明确时，可定位缓存权重。提示明确说明将读写权重设为 0 是改为不含缓存的比较；不会自动改写用量。
- 摘要与详情都标明阶梯输入／输出／总长度口径。来源、倍率、分项、规则边界和限制放在计算详情中。
- 账号摘要保留稳定顺序，并将不可用账号折叠展示。报价组与账号可用分组不能混用为同一个计数。
- [PricingDiagnostics.tsx](../../src/features/ModelList/components/PricingDiagnostics.tsx) 仅在开发模式提供诊断，使用已加载报价；报告复制由用户主动触发。

## 来源与跳转

[站点路由定义](../../src/services/accountSiteDefinitions/definitions.ts) 和 [URL 解析](../../src/services/accounts/accountSiteProfile/urls.ts) 共同维护账号定价入口。账号链接保留部署子路径，去除 URL 中的凭据、原查询和片段；不会修改共享价格对象。

| 来源 | 当前跳转目标 |
| --- | --- |
| New API | 账号站点 `/pricing?search=模型名`；采用广场搜索以兼容未知部署版本，不假设新版单模型路由存在 |
| APIyi | `/account/pricing` |
| OneHub / DoneHub | `/panel/model_price` |
| Sub2API | `/model-plaza` |
| OpenRouter | `https://openrouter.ai/<模型 ID>`，分别编码路径段 |
| AIHubMix | `https://aihubmix.com/model/<编码后的模型 ID>#pricing` |
| LiteLLM 估价 | GitHub 上可浏览的价格表文件；数据获取仍使用 raw JSON |

没有已核实路由的站点不生成猜测链接。站点可以禁用广场或要求登录，链接存在不是当前访问权限或调用资格的保证。

## 支持边界与维护

已接入的 Adapter 及回归入口见 [研究依据](research.md)。公共契约能表达某种计量，不意味着每个站点和模型都提供足够规则，也不意味着列表提供所有请求参数编辑器。

任意公式执行、自动挑选或锁定路由供应商、历史工作负载导入、无证据的促销叠乘以及所有多模态请求的通用编辑器不在当前范围。未核准口径、未知费用、条件缺口和来源冲突保持明确的不可比较状态。

价格缓存当前使用 [modelPricing_cache_v28](../../src/services/models/modelPricingCache.ts)。影响缓存契约、来源或计价语义时，应同时检查失效策略及缓存测试。

## 回归入口

- [公共报价](../../tests/services/modelPricing/quoteModelPrice.test.ts)、[任务计量](../../tests/services/modelPricing/meteredQuote.test.ts)、[条件要求](../../tests/services/modelPricing/requirements.test.ts)：覆盖边界、单位、缺项、覆盖规则和倍率。
- [列表报价及排序](../../tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts)：比较结果、来源及分组隔离、模型过滤。
- [条件控件](../../tests/features/ModelList/components/PricingScenarioControls.test.tsx) 与 [报价 UI](../../tests/features/ModelList/components/ModelPriceQuote.test.tsx)：输入恢复、定位、折叠摘要和详情口径。
- [浏览器流程](../../e2e/modelListCommonFlows.spec.ts)：账号和目录流程、窄屏布局、条件定位及来源链接。

修改相关行为时运行对应测试；文档不以曾经通过的次数代替当前代码验证。
