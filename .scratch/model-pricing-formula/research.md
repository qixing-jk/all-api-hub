# 多参数模型价格比较与自定义公式：一手资料调研

调研日期：2026-08-14

## 结论摘要

### 已确认事实

1. 成熟项目普遍不会只存一个“输入价”和一个“输出价”。OpenRouter、LiteLLM、Helicone 均把缓存、推理、图像/音频、按请求/按调用、长上下文档位等建模为独立计费维度；Langfuse 更进一步，把 usage type 设计成开放字符串映射。
2. 价格比较通常是“给定一组使用量后比较总成本”，而不是脱离工作负载比较一个天然唯一的价格。Helicone 的公开计算器要求输入、输出 token 数；LiteLLM 的成本估算也以 input/output token 和请求次数为输入。不同维度很多时，必须先固定比较场景。
3. 多数项目允许自定义**费率数据**或有限条件规则，但不执行任意 JavaScript/Python：
   - LiteLLM 允许给模型覆盖逐 token、逐秒等费率，并另设 provider discount / margin。
   - Langfuse 允许任意 usage key 的单价和受限的档位条件 DSL。
   - New API 已有真正的 `tiered_expr` 公式语言，但运行在 `expr-lang/expr` 的白名单环境中，不是通用代码执行。
4. 缺失数据没有统一行业语义。较稳健的路径会返回 `null`、跳过该成本项或不参与比较；部分兼容/遗留路径会把缺失成本降成 `0`。后者会把“未知”伪装成“免费”，不适合价格比较。
5. 批处理、折扣和 provider/group multiplier 最好作为可追溯的价格修饰层，而不是偷偷改写基础费率。OpenRouter 将 batch 暴露为单独模型变体，LiteLLM 分开存 batch 费率并显式应用 provider discount/margin，New API 在公式结果换算后再应用 group ratio。

### 设计推断（不是外部项目事实）

对 All API Hub，建议不要从“任意公式文本框”起步，而应先建立：

1. 规范化 usage/rate 向量；
2. 可保存的比较场景；
3. 明确的 unknown / explicit zero 语义；
4. 受限、可版本化、可预览的表达式 DSL 作为高级能力。

这样既能覆盖多参数比较，也能避免公式语言反过来固化错误的 token 归一化和缺失值约定。

## 项目对比

| 项目 | 价格维度 | 条件/档位 | 用户自定义 | 缺失值与比较行为 |
| --- | --- | --- | --- | --- |
| OpenRouter | prompt、completion、cache read/write（含 1h）、internal reasoning、图像/音频输入输出、按请求、web search、discount | `min_prompt_tokens` 长上下文覆盖；UTC 时间窗覆盖；后出现的覆盖按字段胜出，未写字段继承基础价 | 公开目录/API 返回结构化价格；未发现面向用户的任意公式 | 公开 schema 只要求 prompt/completion，其余可缺失；动态 router 目录中可出现 `-1`，因此不能把任意数值都视为可比较费率 |
| LiteLLM | token、cache read/write、reasoning、audio/image/pixel/second/request/query、batch、service tier、长上下文等 | 以字段名表达阈值和 service tier；provider-specific calculator 处理特殊规则 | 支持 custom model pricing、custom cost map、provider discount/margin；不是任意代码公式 | schema 允许显式 0；计算器部分路径抛错/无结果，部分遗留路径回落 0，需要消费端自行区分 |
| Helicone | text input/output、cache read/write 5m/1h、thinking、image/audio/video/file 子维度、web search、request | `threshold` 数组；阈值依据因 provider/成本项而异；后档缺字段从前档继承 | registry 费率配置；公开比较器只让用户输入 input/output tokens，未发现公式编辑器 | 新 registry 找不到配置返回 `null`，公开计算器跳过未知模型；遗留 wrapper 使用 `?? 0` |
| Langfuse | `usage_details: Record<string, number>` 与相同 key 的 prices，天然支持 input/output/cache/自定义单位 | 条件为安全 regex 匹配 usage keys，聚合匹配值后用 `gt/gte/lt/lte/eq/neq` 比较；条件 AND；优先级首个匹配；默认档兜底 | 可定义 usage key、单价和档位条件；不是通用算术公式 | 空 usage 不匹配档位，避免伪造全零向量；有 usage 但没有对应 price 时该成本项不生成；用户提供的 cost 明确优先 |
| New API | `p/c/len/cr/cc/cc1h/img/img_o/ai/ao`，另有请求字段、Header、时间与 group ratio | 三元条件、`tier()`、request multiplier；表达式可版本化 | 系统管理员可用可视化或 raw `tiered_expr`；受限 DSL，非 JS/Python | TokenParams 未提供的子维度默认为 0；表达式引用某子维度时才从 p/c 自动扣除；保存前编译并用样例向量 smoke test |

## OpenRouter

### 价格与使用量契约

OpenRouter 的官方 OpenAPI `PublicPricing` 定义了：

- `prompt` / `completion`：逐 token 输入与输出价格；
- `input_cache_read`、`input_cache_write`、`input_cache_write_1h`；
- `internal_reasoning`；
- `image`、`image_token`、`image_output`；
- `audio`、`input_audio_cache`、`audio_output`；
- `request`、`web_search`；
- `discount`，语义为最终价格乘以 `1 - discount`；
- `overrides` 条件覆盖。

来源：[OpenRouter 官方 OpenAPI](https://openrouter.ai/openapi.json)、[官方模型目录 API](https://openrouter.ai/api/v1/models)。

对应 usage schema 会分别返回 cached/cache-write、reasoning、audio/video 等明细，以及 provider 已计算的 `cost` / `cost_details`。这说明目录价格只是估算输入；在真实请求完成后，provider/聚合器给出的实际成本应作为更高可信度证据。[OpenRouter 官方 OpenAPI](https://openrouter.ai/openapi.json)

### 条件价格、上下文与批处理

`PricingOverride` 当前支持：

- `min_prompt_tokens`：总 prompt token **严格大于**阈值时生效；
- `utc_start` / `utc_end`：UTC 半开时间窗；
- 所有条件同时满足才生效；
- 多个覆盖都适用时，后面的覆盖按 price key 胜出；
- 覆盖未提供的 price key 继承基础价格。

来源：[OpenRouter 官方 OpenAPI 的 `PricingOverride`](https://openrouter.ai/openapi.json)。

模型 API 还把 batch 暴露为 `:batch` 模型变体，例如同一 canonical model 的普通版与 batch 版具有不同 prompt/completion/cache 费率。**推断：** 对比较器而言，把 batch 当成可选服务档位或报价变体比在总价末尾硬编码“打五折”更可追溯。[OpenRouter 官方模型目录 API](https://openrouter.ai/api/v1/models)

`context_length` / `per_request_limits` 是能力与请求限制，不等于费率；只有 `overrides.min_prompt_tokens` 等条件把上下文长度连接到价格时，context 才直接影响成本。[OpenRouter 官方 OpenAPI](https://openrouter.ai/openapi.json)

### 自定义公式与缺失值

本轮未在 OpenRouter 官方公开 API/spec 中确认用户可提交价格公式。它公开的是结构化价格和结构化条件覆盖。

`prompt` 和 `completion` 是 schema 必填，其余字段可缺失。实际模型目录中也存在动态 router 以 `-1` 表示不能静态给出价格的条目。**推断：** 比较层需要校验非负、有限并理解 sentinel；不能仅凭字段存在就参与最低价排序。[OpenRouter 官方模型目录 API](https://openrouter.ai/api/v1/models)

## LiteLLM

### 多单位费率表

LiteLLM 的官方价格表及其 JSON Schema 覆盖范围最广，包括：

- `input_cost_per_token` / `output_cost_per_token`；
- `cache_read_input_token_cost` / `cache_creation_input_token_cost`，以及 1h cache write；
- `output_cost_per_reasoning_token`；
- audio token、audio second、image、image token、pixel、video second、character、query、request 等单位；
- `input/output_cost_per_token_batches`；
- `*_priority` / `*_flex` service tier；
- `*_above_<N>_tokens` 长上下文阈值（测试已覆盖任意 `<N>`，不只固定几个阈值）。

来源：[官方价格表](https://github.com/BerriAI/litellm/blob/0e9cd9893e9de3221c04c6a96542a589b32b6f19/model_prices_and_context_window.json)、[官方 schema](https://github.com/BerriAI/litellm/blob/0e9cd9893e9de3221c04c6a96542a589b32b6f19/model_prices_and_context_window.schema.json)、[任意阈值回归测试](https://github.com/BerriAI/litellm/blob/0e9cd9893e9de3221c04c6a96542a589b32b6f19/tests/test_litellm/litellm_core_utils/llm_cost_calc/test_llm_cost_calc_utils.py)。

这种设计的优点是 provider facts 可直接落成数据；缺点是随着 provider 规则增长，schema 出现大量组合字段。**推断：** All API Hub 不宜完整复制 LiteLLM 的扁平字段全集，可先归一到“usage dimension + conditional rate rule”。

### 自定义价格、折扣和比较器

LiteLLM 官方文档允许在模型 `model_info` 中覆盖自定义费率，常见模式包括逐 token、逐秒和显式零成本；它还把 provider discounts 与 provider margins 分为独立配置。[LiteLLM Custom LLM Pricing](https://docs.litellm.ai/docs/proxy/custom_pricing)、[Provider Discounts](https://docs.litellm.ai/docs/proxy/provider_discounts)、[Provider Margins](https://docs.litellm.ai/docs/proxy/provider_margins)

`completion_cost(..., custom_cost_per_token=...)` 接收结构化费率映射，并专门处理 cached tokens 等明细；这仍是固定变量计算器，不是用户任意表达式执行。[官方 `cost_calculator.py`](https://github.com/BerriAI/litellm/blob/0e9cd9893e9de3221c04c6a96542a589b32b6f19/litellm/cost_calculator.py)

LiteLLM 的官方 Pricing Calculator 用 input tokens、output tokens、每日/月请求量估算每请求与周期成本，并支持同时加入多个模型后汇总。**推断：** 这是“工作负载场景”而非“单价字段”驱动比较的直接先例。[Pricing Calculator 文档](https://docs.litellm.ai/docs/proxy/pricing_calculator)、[多模型估算 UI](https://github.com/BerriAI/litellm/tree/0e9cd9893e9de3221c04c6a96542a589b32b6f19/ui/litellm-dashboard/src/app/%28dashboard%29/cost-tracking/_components/pricing_calculator)

## Helicone

### Registry 与成本分解

Helicone 的新 registry 定义：

- 基础 input/output；
- cache read multiplier、5m/1h write multiplier、cache storage；
- thinking、per request；
- image/audio/video/file 各自的 input/cached input/output；
- web search；
- `threshold` 价格档位数组。

来源：[官方 pricing types](https://github.com/Helicone/helicone/blob/67df07b8d807a960f2e53d9ec2a9c49513ca2379/packages/cost/models/types.ts)、[官方 usage types](https://github.com/Helicone/helicone/blob/67df07b8d807a960f2e53d9ec2a9c49513ca2379/packages/cost/usage/types.ts)。

计算器返回各维度 breakdown 后求和；若 provider 直接给出 `modelUsage.cost`，则用它作为 total。逐 modality 费率缺失时，会显式回落到 text input/output 与基础 cached multiplier。[官方 `calculate-cost.ts`](https://github.com/Helicone/helicone/blob/67df07b8d807a960f2e53d9ec2a9c49513ca2379/packages/cost/models/calculate-cost.ts)

档位按 threshold 升序处理，选择 usage 达到的最高阈值。一个很重要的细节是：threshold 对比的 usage 并非全 provider 共用——Anthropic、Vertex、Google AI Studio、xAI 对 input/cache/总 prompt 的阈值语义不同。后档缺少的费率字段会从前一档递归继承。[官方 `calculate-cost.ts`](https://github.com/Helicone/helicone/blob/67df07b8d807a960f2e53d9ec2a9c49513ca2379/packages/cost/models/calculate-cost.ts)

### 比较 UI 与缺失值

Helicone 的公开价格比较器让用户输入 input/output token 数，计算每个 provider/model 的 input cost、output cost、total 并排序；它没有暴露缓存、推理或多模态场景输入，因此是易用但不完整的比较视图。[官方 `ModelPriceCalculator.tsx`](https://github.com/Helicone/helicone/blob/67df07b8d807a960f2e53d9ec2a9c49513ca2379/bifrost/app/llm-cost/ModelPriceCalculator.tsx)

新 registry 找不到 model/provider config 时返回 `null`；公开计算器找不到 cost details 时跳过该模型。但旧 `modelCost` wrapper 使用 `?? 0`。**推断：** Helicone 自身展示了兼容层为何会污染 unknown 语义；All API Hub 的比较契约应只允许明确免费进入 `$0` 排序。[官方 `costCalc.ts`](https://github.com/Helicone/helicone/blob/67df07b8d807a960f2e53d9ec2a9c49513ca2379/packages/cost/costCalc.ts)、[新 registry 计算器](https://github.com/Helicone/helicone/blob/67df07b8d807a960f2e53d9ec2a9c49513ca2379/packages/cost/models/calculate-cost.ts)

## Langfuse

### 开放 usage key + 受限档位 DSL

Langfuse 的核心不是枚举所有计费字段，而是让 `usage_details` 成为 `Record<string, number>`，价格则是相同 usage key 到 Decimal price 的映射。成本计算只对“usage 存在且找到同名 price”的项执行 `price * units`。[官方 IngestionService](https://github.com/langfuse/langfuse/blob/574d2605316073175a0d4cd866b59dc39bbe7c0e/worker/src/services/IngestionService/index.ts)

其 pricing tier 条件为：

- `usageDetailPattern`：匹配 usage key 的 regex；
- 把所有匹配 key 的 usage 值求和；
- 用 `gt/gte/lt/lte/eq/neq` 与非负阈值比较；
- 同档条件 AND；非默认档按 priority 升序首个匹配；否则用唯一 default tier；
- 所有档必须拥有同一组 price keys。

来源：[官方 matcher](https://github.com/langfuse/langfuse/blob/574d2605316073175a0d4cd866b59dc39bbe7c0e/packages/shared/src/server/pricing-tiers/matcher.ts)、[官方 validation](https://github.com/langfuse/langfuse/blob/574d2605316073175a0d4cd866b59dc39bbe7c0e/packages/shared/src/features/model-pricing/validation.ts)。

安全边界是值得借鉴的：regex 最长 200 字符、必须可编译，并通过 `safe-regex2` 防止灾难性回溯；条件只支持比较运算而非任意求值。[官方 validation](https://github.com/langfuse/langfuse/blob/574d2605316073175a0d4cd866b59dc39bbe7c0e/packages/shared/src/features/model-pricing/validation.ts)

### 缺失数据

Langfuse 对几个边界有明确处理：

- 空 usage 不参与档位匹配，避免把空对象当作“全维度都是 0”后错误盖章某档；
- usage 有值但无同名 price 时，不生成该成本项；
- 没有任何可计算成本项时 total 保持未定义；
- 用户只要提供任何 cost detail，系统就不混算模型价格；只有提供的 key 全是 input/output 时，才可由二者补出 total。

来源：[官方 IngestionService](https://github.com/langfuse/langfuse/blob/574d2605316073175a0d4cd866b59dc39bbe7c0e/worker/src/services/IngestionService/index.ts)。

这套语义最适合观察真实请求，但对“预估比较”仍需要另行规定：场景中未使用的维度可为 0；场景中非零用量却没有费率的模型必须标记不可完整比较。

## New API：可确认的自定义价格公式实现

### DSL 能力

New API 当前的 `tiered_expr` 由 `expr-lang/expr` 驱动。它公开的计费变量包括：

- `p` / `c`：未被单独定价的 input/output token；
- `len`：完整输入上下文长度，专门用于档位判断；
- `cr` / `cc` / `cc1h`：缓存读、写、1h 写；
- `img` / `img_o`：图片输入/输出 token；
- `ai` / `ao`：音频输入/输出 token；
- `param(path)`、`header(key)` 与 hour/minute/weekday/month/day；
- `tier(name, value)`、`min/max/abs/ceil/floor`。

它支持三元表达式、request-conditional multiplier、版本前缀、编译缓存、可视化编辑与 raw 编辑。[官方设计文档](https://github.com/QuantumNous/new-api/blob/58d4e9bd3bb035df8ea235dd682ccc8a45d0332a/pkg/billingexpr/expr.md)、[编译环境](https://github.com/QuantumNous/new-api/blob/58d4e9bd3bb035df8ea235dd682ccc8a45d0332a/pkg/billingexpr/compile.go)、[运行环境](https://github.com/QuantumNous/new-api/blob/58d4e9bd3bb035df8ea235dd682ccc8a45d0332a/pkg/billingexpr/run.go)

示意公式（来自官方文档所描述的语法，数字仅用于说明）：

```text
len <= 200000
  ? tier("standard", p * INPUT_RATE + c * OUTPUT_RATE + cr * CACHE_READ_RATE)
  : tier("long_context", p * LONG_INPUT_RATE + c * LONG_OUTPUT_RATE + cr * LONG_CACHE_RATE)
```

### 最有价值的归一化设计

`p/c` 是兜底变量：只有公式引用某个子维度时，系统才从 p/c 扣除相应 token，避免缓存/图像/音频重复计费；`len` 永远保留完整上下文，避免大量 cache hit 让请求误入低价档。OpenAI 风格和 Claude 风格 usage 的包含关系不同，系统在表达式执行前按上游语义归一化。[官方设计文档](https://github.com/QuantumNous/new-api/blob/58d4e9bd3bb035df8ea235dd682ccc8a45d0332a/pkg/billingexpr/expr.md)

这证明一个关键点：公式本身不能解决 provider usage 语义差异；必须先有可靠的标准化边界。

### 安全与审计边界

- 编译时只注入白名单变量与函数，并要求最终类型为 float64；内部 tracing identifier 被保留，不能由表达式调用。[官方 `compile.go`](https://github.com/QuantumNous/new-api/blob/58d4e9bd3bb035df8ea235dd682ccc8a45d0332a/pkg/billingexpr/compile.go)
- `expr-lang/expr` 官方自述为 memory-safe、side-effect-free、always terminating；这比 `eval` 或动态 JS Function 安全，但仍应限制输入规模与可见数据。[expr-lang 官方 README](https://github.com/expr-lang/expr/blob/4b31df3a2e0eefec04c017a82a00e0f08541d3e4/README.md)
- 保存前会针对多组 token 和请求样例运行 smoke test，并拒绝运行错误或负数结果。[官方 billing setting](https://github.com/QuantumNous/new-api/blob/58d4e9bd3bb035df8ea235dd682ccc8a45d0332a/setting/billing_setting/tiered_billing.go)
- 预消费时冻结表达式/请求快照，真实 usage 返回后用同一快照结算；日志记录命中档位与 request rule trace，避免“现在看到的规则”和“当时实际收费规则”不一致。[官方设计文档](https://github.com/QuantumNous/new-api/blob/58d4e9bd3bb035df8ea235dd682ccc8a45d0332a/pkg/billingexpr/expr.md)、[类型定义](https://github.com/QuantumNous/new-api/blob/58d4e9bd3bb035df8ea235dd682ccc8a45d0332a/pkg/billingexpr/types.go)

### 不应直接照搬的点

以下为代码审阅后的风险推断：

- 未提供的 TokenParams 默认为 0，适合“该 usage 确认没有发生”，不适合“provider 没报告所以未知”。比较器必须在进入 DSL 前保留 known/unknown 状态。
- 当前 smoke test 只显式拒绝 `result < 0`，未看到对 `NaN` / `Infinity` 的明确拒绝；实现自己的 DSL 时应要求结果与中间费率均为有限非负数。
- `header()` / `param()` 对管理员控制的网关规则很强，但 All API Hub 面向终端用户的本地比较公式没有必要读取认证 Header、任意请求正文或时间；缩小环境更安全、更可复现。
- 表达式与命中规则进入日志。若未来允许请求内容参与公式，必须确保审计数据不携带 secret、URL、prompt 或用户文本。

## 推荐给 All API Hub 的比较模型（设计推断）

### 1. 先定义规范化 usage 场景

建议比较输入采用一个明确、可保存的场景对象，而非单个 input/output 比例：

```text
text_input_tokens
text_output_tokens
cache_read_input_tokens
cache_write_5m_input_tokens
cache_write_1h_input_tokens
reasoning_output_tokens
image_input_tokens | image_input_count
image_output_tokens | image_output_count
audio_input_tokens | audio_input_seconds
audio_output_tokens | audio_output_seconds
request_count
web_search_count
context_length
service_tier (standard | batch | flex | priority | provider-native)
```

同一 modality 可能按 token、张、秒或 pixel 计价，因此不要强行把所有图像/音频价格换算为 token。只有场景提供了匹配单位，报价才可比较。

### 2. 费率、条件与修饰层分开

建议概念模型：

```text
base subtotal = Σ known_usage[dimension] × selected_rate[dimension]
effective total = base subtotal × provider/group multiplier × (1 - discount)
                  + fixed per-request/tool costs
```

顺序应成为版本化契约；如果上游协议定义了别的顺序，则 provider-native adapter 在进入通用比较层前给出已归一化规则或直接给出 authoritative total。

将以下内容分开显示：

- 基础模型费率；
- 档位/批处理/service tier；
- provider 或 group multiplier；
- discount / margin；
- 估算结果与真实 provider cost。

这样用户能解释“为什么这家更便宜”，也能避免把 group ratio 当成模型原价。

### 3. 缺失参数语义

推荐显式使用三态，而非一个可选 number：

| 状态 | 含义 | 比较行为 |
| --- | --- | --- |
| known zero | 明确免费，费率或 usage 是 0 | 可参与比较 |
| known value | 已知有限非负值 | 正常计算 |
| unknown / unsupported | 未提供、无法映射、单位不匹配或动态路由 | 场景该维度 usage 为 0 时不影响；usage 非 0 时总价不完整，不参与“最低价” |

额外规则：

- 不接受负费率 sentinel 进入计算；
- 不接受 `NaN` / `Infinity`；
- 不用基础 input/output 价自动代替 cache/reasoning/modality 价，除非该 provider 的官方 contract 或 adapter 明确声明 fallback；
- 真实 provider 返回的 total cost 可作为 authoritative，但必须带来源/时间，不能悄悄与估算字段混算；
- 不同币种先通过带时间戳的汇率归一；汇率缺失时不比较，不假装同币种。

### 4. 公式能力分级

推荐分两层：

1. 默认层：可视化场景 + 结构化条件规则。覆盖绝大多数用户：输入输出比例、cache hit、长上下文、batch、group multiplier。
2. 高级层：受限表达式 DSL。只允许规范化 usage/rate 变量、算术、比较、三元、`min/max/ceil/floor` 和命名 `tier()`；不允许网络、存储、浏览器 API、动态属性访问、循环、用户文本、URL、Header、token/key。

高级 DSL 最低安全要求：

- parser/AST 白名单，绝不使用 `eval` / `Function`；
- 静态类型检查、变量白名单、表达式长度/节点深度限制；
- 有限非负结果检查和溢出上限；
- 编译缓存有容量上限；
- 保存前用边界向量验证：全零、典型、阈值两侧、极大值、缺失维度；
- DSL 版本号与迁移策略；
- 可视化 breakdown、命中档位、使用的 fallback 与 unknown 原因；
- 公式失败时 fail closed：显示不可比较，不回落 `$0`；
- 公式作用域建议按“比较配置/场景”而非改写 provider 原始价格，保留原始事实。

### 5. 一个务实的首版范围

首版不必覆盖所有 LiteLLM 字段。可先支持：

- text input/output；
- cache read / cache write；
- reasoning output；
- request fixed cost；
- context threshold；
- batch/service-tier quote variant；
- provider/group multiplier 与 discount；
- explicit unknown。

图像/音频建议先保留原生计价单位并显示 breakdown，等具体 provider payload 能可靠映射后再纳入统一最低价排序。

## 未确认事项

1. OpenRouter 是否向普通用户提供自定义价格覆盖或公式编辑器：官方公开 API/spec 中未确认。
2. Helicone 是否在商业版/未公开路径支持组织级自定义价格：官方仓库搜索未确认；本报告只据公开 registry 与 calculator。
3. LiteLLM 所有 provider-specific calculator 在缺少某个费率时的完整一致行为：项目路径很多，本轮确认了 schema、主 calculator 和典型 custom pricing 路径，未逐 provider 穷举。
4. New API `tiered_expr` 在当前部署版本是否普遍开放：已确认主线源码存在，但具体站点可能运行旧版或 fork。
5. 各平台最新费率数值：本报告研究的是数据模型和算法，不把某一时点费率抄入设计契约。

## 一手来源清单

- OpenRouter：[OpenAPI](https://openrouter.ai/openapi.json)、[Models API](https://openrouter.ai/api/v1/models)
- LiteLLM：[Custom LLM Pricing](https://docs.litellm.ai/docs/proxy/custom_pricing)、[Pricing Calculator](https://docs.litellm.ai/docs/proxy/pricing_calculator)、[Provider Discounts](https://docs.litellm.ai/docs/proxy/provider_discounts)、[Provider Margins](https://docs.litellm.ai/docs/proxy/provider_margins)、[价格表](https://github.com/BerriAI/litellm/blob/0e9cd9893e9de3221c04c6a96542a589b32b6f19/model_prices_and_context_window.json)、[Schema](https://github.com/BerriAI/litellm/blob/0e9cd9893e9de3221c04c6a96542a589b32b6f19/model_prices_and_context_window.schema.json)、[成本计算器](https://github.com/BerriAI/litellm/blob/0e9cd9893e9de3221c04c6a96542a589b32b6f19/litellm/cost_calculator.py)
- Helicone：[成本计算说明](https://github.com/Helicone/helicone/blob/67df07b8d807a960f2e53d9ec2a9c49513ca2379/docs/references/how-we-calculate-cost.mdx)、[Pricing types](https://github.com/Helicone/helicone/blob/67df07b8d807a960f2e53d9ec2a9c49513ca2379/packages/cost/models/types.ts)、[Usage types](https://github.com/Helicone/helicone/blob/67df07b8d807a960f2e53d9ec2a9c49513ca2379/packages/cost/usage/types.ts)、[新 registry 计算器](https://github.com/Helicone/helicone/blob/67df07b8d807a960f2e53d9ec2a9c49513ca2379/packages/cost/models/calculate-cost.ts)、[公开比较器](https://github.com/Helicone/helicone/blob/67df07b8d807a960f2e53d9ec2a9c49513ca2379/bifrost/app/llm-cost/ModelPriceCalculator.tsx)
- Langfuse：[Pricing tier matcher](https://github.com/langfuse/langfuse/blob/574d2605316073175a0d4cd866b59dc39bbe7c0e/packages/shared/src/server/pricing-tiers/matcher.ts)、[Validation](https://github.com/langfuse/langfuse/blob/574d2605316073175a0d4cd866b59dc39bbe7c0e/packages/shared/src/features/model-pricing/validation.ts)、[Ingestion cost calculation](https://github.com/langfuse/langfuse/blob/574d2605316073175a0d4cd866b59dc39bbe7c0e/worker/src/services/IngestionService/index.ts)
- New API：[Billing expression design](https://github.com/QuantumNous/new-api/blob/58d4e9bd3bb035df8ea235dd682ccc8a45d0332a/pkg/billingexpr/expr.md)、[Compile](https://github.com/QuantumNous/new-api/blob/58d4e9bd3bb035df8ea235dd682ccc8a45d0332a/pkg/billingexpr/compile.go)、[Run](https://github.com/QuantumNous/new-api/blob/58d4e9bd3bb035df8ea235dd682ccc8a45d0332a/pkg/billingexpr/run.go)、[Types](https://github.com/QuantumNous/new-api/blob/58d4e9bd3bb035df8ea235dd682ccc8a45d0332a/pkg/billingexpr/types.go)、[Save-time smoke test](https://github.com/QuantumNous/new-api/blob/58d4e9bd3bb035df8ea235dd682ccc8a45d0332a/setting/billing_setting/tiered_billing.go)
- expr-lang：[官方 README 的安全声明](https://github.com/expr-lang/expr/blob/4b31df3a2e0eefec04c017a82a00e0f08541d3e4/README.md)
