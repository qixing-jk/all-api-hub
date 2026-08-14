# CC Switch 模型价格计算核对

核对对象：官方仓库 [`farion1231/cc-switch`](https://github.com/farion1231/cc-switch)，固定提交 [`eb69e4922ee187a261fd29c216a738e838f85bc4`](https://github.com/farion1231/cc-switch/tree/eb69e4922ee187a261fd29c216a738e838f85bc4)。本机未找到该仓库的独立源码克隆，因此使用 GitHub 官方仓库原始文件核对。

## 结论

CC Switch 的核心计费模型确实只有四个价格参数，全部以 USD / 百万 token 表示：

1. 输入价格 `input_cost_per_million`
2. 输出价格 `output_cost_per_million`
3. 缓存读取价格 `cache_read_cost_per_million`
4. 缓存创建（写入）价格 `cache_creation_cost_per_million`

源码契约见 [`ModelPricing`](https://github.com/farion1231/cc-switch/blob/eb69e4922ee187a261fd29c216a738e838f85bc4/src-tauri/src/proxy/usage/calculator.rs#L20-L26) 和持久化模型 [`ModelPricingInfo`](https://github.com/farion1231/cc-switch/blob/eb69e4922ee187a261fd29c216a738e838f85bc4/src-tauri/src/services/model_pricing.rs#L27-L36)。

它没有让用户填写“权重”或“预计用量”。用户编辑的是这四项实际单价；真实 token 用量由网关响应解析。编辑器的四项价格输入都是必填、非负数，见 [`PricingEditModal`](https://github.com/farion1231/cc-switch/blob/eb69e4922ee187a261fd29c216a738e838f85bc4/src/components/usage/PricingEditModal.tsx#L172-L243)。因此 CC Switch 实现的是**已发生请求的成本核算**，不是模型价格比较器。

计算公式为：

```text
baseCost =
    billableInputTokens × inputPrice / 1_000_000
  + outputTokens × outputPrice / 1_000_000
  + cacheReadTokens × cacheReadPrice / 1_000_000
  + cacheCreationTokens × cacheCreationPrice / 1_000_000

totalCost = baseCost × providerCostMultiplier
```

实际实现见 [`CostCalculator::calculate_with_cache_semantics`](https://github.com/farion1231/cc-switch/blob/eb69e4922ee187a261fd29c216a738e838f85bc4/src-tauri/src/proxy/usage/calculator.rs#L70-L110)。金额使用 Rust `Decimal`，不是浮点数。

## 缓存读写与输入去重

缓存读取和缓存写入是分开的两个桶，但缓存写入只有一个笼统的 `cache_creation`，没有区分 5 分钟、1 小时等 TTL。

CC Switch 会按上游 usage 语义避免重复计费：

- Claude/Anthropic：`input_tokens` 被视为 fresh input，不扣缓存读写。
- Codex/OpenAI Responses、Gemini 等 cache-inclusive app：普通输入量为 `input - cacheRead - cacheCreation`，并使用 `saturating_sub` 防止出现负数。

应用类型分流入口见 [`calculate_for_app`](https://github.com/farion1231/cc-switch/blob/eb69e4922ee187a261fd29c216a738e838f85bc4/src-tauri/src/proxy/usage/calculator.rs#L46-L67)，扣减逻辑见[同文件](https://github.com/farion1231/cc-switch/blob/eb69e4922ee187a261fd29c216a738e838f85bc4/src-tauri/src/proxy/usage/calculator.rs#L75-L90)。

## 缺失价格的处理

- 用户维护的单条价格不能缺少某一个字段：四项都是必填，后端也会把四项解析成非负 `Decimal`。
- 从 models.dev 同步时，缺失的缓存读写价格会转为 `0`；输入或输出只要至少一项存在，缺失的另一项也会转为 `0`。见 [`flattenModels`](https://github.com/farion1231/cc-switch/blob/eb69e4922ee187a261fd29c216a738e838f85bc4/src/lib/modelsDevPricing.ts#L78-L112) 和 [`toModelPricing`](https://github.com/farion1231/cc-switch/blob/eb69e4922ee187a261fd29c216a738e838f85bc4/src/lib/modelsDevPricing.ts#L183-L198)。也就是说，这条导入路径把“未知”降级成了零价。
- 如果整个模型定价不存在，计算结果为 `None`，日志会告警“成本将记录为 0”，最后把四项成本和总成本都写成 `0`。见 [`log_with_calculation`](https://github.com/farion1231/cc-switch/blob/eb69e4922ee187a261fd29c216a738e838f85bc4/src-tauri/src/proxy/usage/logger.rs#L444-L479) 和 [`log_request`](https://github.com/farion1231/cc-switch/blob/eb69e4922ee187a261fd29c216a738e838f85bc4/src-tauri/src/proxy/usage/logger.rs#L100-L121)。

因此若借鉴到价格比较功能，值得抄的是“四桶用量乘四桶单价再求和”以及按协议处理 input/cache 去重；不应照抄其“缺失价格按零记录”，因为比较器会把未知价格误判成免费和最低价。

## 未确认项

没有发现 CC Switch 用这四项费率做模型之间的排序或“加权比较”；当前公开源码确认的是请求成本统计。也没有发现缓存写入 TTL 细分。若未来仓库在该固定提交之后新增比较器或更多价格维度，不在本次结论范围内。
