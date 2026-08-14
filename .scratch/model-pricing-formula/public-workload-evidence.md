# 公开 AI 工作负载能否支持价格比较权重

更新时间：2026-08-14

## 结论先行

公开网络中确实有比单个用户日志更有代表性的真实工作负载，但**没有一个跨人群、跨任务、同时稳定报告 `input / output / cache read / cache write` 四项的公共基准**。目前最可靠的做法不是从全网抄一个“通用四权重”，而是提供按任务区分的预设，并明确各预设的证据等级。

- **可直接生成 input/output 权重**：Azure 2023/2024 生产推理 traces，且至少区分 `code` 与 `conversation`。
- **接近可直接生成 input/cache-read/output 权重**：TraceLab 的真实 Claude Code/Codex traces；它报告 provider usage 中的 prefix/cache read，但样本是研究者自己的日常编码，仍有人群偏差。
- **只能间接推断 cache 倾向**：Mooncake/Kimi traces。其 hash block 描述服务端 KV prefix 可复用性，不等同于 API 账单中的 `cache_read_input_tokens` / `cache_creation_input_tokens`。
- **只能校准任务/人群混合，不能生成权重**：Anthropic Economic Index；它告诉我们哪些职业任务占比高，但没有 token 或缓存分项。
- RAG、客服、文档摘要和离线批处理目前没有找到同时具备“真实生产样本 + 公开逐请求 token + billed cache read/write + 明确任务标签”的一手公共数据。因此不应为这些任务伪造精确四权重。

## 证据矩阵

| 来源 | 日期与样本范围 | 人群/任务覆盖 | 可观察字段 | 对四权重的用途 |
|---|---|---|---|---|
| [Azure LLM inference trace 2023](https://github.com/Azure/AzurePublicDataset/blob/master/AzureLLMInferenceDataset2023.md) | 2023-11-11 的 Azure 多个生产 LLM 服务样本；公开样本含 code 8,819 请求、conversation 19,366 请求；配套论文 ISCA 2024 | 任务分为代码与对话；用户身份及具体 prompt 因隐私不公开 | `ContextTokens`, `GeneratedTokens`, timestamp | **直接用于 input/output；不能用于 cache read/write** |
| [Azure LLM inference trace 2024](https://github.com/Azure/AzurePublicDataset/blob/master/AzureLLMInferenceDataset2024.md) | 2024-05-10 至 05-19 的一周生产 traces；配套论文 HPCA 2025 | 同样分 code 与 conversation，规模大于 2023 | input/output tokens、时间戳 | **直接用于 input/output；不能用于缓存**。适合作为 2023 结论的规模验证，文件约 1.8 GB，本次未全量重算 |
| [Mooncake FAST'25 trace release](https://github.com/kvcache-ai/Mooncake/tree/main/FAST25-release) / [论文](https://www.usenix.org/conference/fast25/presentation/qin) | FAST 2025；两个各取自 1 小时线上请求的真实 trace：conversation 12,031 请求，tool-and-agent 23,608 请求；另有 synthetic 3,993 | 明确区分 conversation 与 tool/agent；来自 Kimi，长上下文产品偏差很强 | input/output length、512-token prefix block hashes、到达时间 | **input/output 可直接；cache 只能间接**。hash 可模拟 KV reuse，但不能当 provider billed cache read/write |
| [TraceLab v2](https://arxiv.org/abs/2606.30560v2) / [项目](https://tracelab.cs.washington.edu/) | 2025-09/10 至 2026-06；约 4,300 sessions、357,161 LLM steps、432,510 tool calls；2026-06-29 首发 | Claude Code 与 Codex 的日常 coding-agent 使用；跨 provider，但主要来自研究团队自身 | 总 input 54.90B、append 2.34B、prefix 52.56B、output 186.9M；provider usage/timing | **最接近 coding-agent 的 input/cache-read/output 权重**；cache write 的协议和计价映射需单独处理，不能简单把所有 append 都叫 cache write |
| [Anthropic Economic Index 初版](https://www.anthropic.com/news/the-anthropic-economic-index) | 2025-02-10；约 100 万条 Claude.ai Free/Pro 对话 | 用 Clio 映射到约 20,000 个 O*NET 任务；computer & mathematical 占 37.2%，写作/编辑相关类别也较高 | 任务/职业类别、augmentation/automation | **不可用于 token/cache 权重**；可用于证明用户与任务混合不能由单个编码用户代表 |

## 可复算的数值

### Azure 2023：任务类型本身就造成巨大差异

直接聚合官方 CSV（总 input / 总 output，而非“请求比例的平均值”）：

| 任务 | 请求数 | Input tokens | Output tokens | input:output | 归一化 input/output |
|---|---:|---:|---:|---:|---:|
| Code | 8,819 | 18,059,974 | 245,896 | 73.45 : 1 | 98.66% / 1.34% |
| Conversation | 19,366 | 22,361,870 | 4,088,665 | 5.47 : 1 | 84.54% / 15.46% |

这足以推翻单一通用 input/output 默认值：即使同一云平台、同一采样日，代码 workload 的 output 占比也远低于普通对话。数据文件：[code CSV](https://github.com/Azure/AzurePublicDataset/blob/master/data/AzureLLMInferenceTrace_code.csv)、[conversation CSV](https://github.com/Azure/AzurePublicDataset/blob/master/data/AzureLLMInferenceTrace_conv.csv)。

### Mooncake：可支持任务级 input/output 预设，但缓存不是账单语义

官方 FAST'25 release 给出的均值：

| Workload | Requests | 平均 input | 平均 output | 约 input:output |
|---|---:|---:|---:|---:|
| Conversation | 12,031 | 12,035 | 343 | 35.1 : 1 |
| Tool and Agent | 23,608 | 8,596 | 182 | 47.2 : 1 |
| Synthetic | 3,993 | 15,325 | 149 | 102.9 : 1 |

按公开均值归一化后，Conversation 为 input 97.23% / output 2.77%，Tool and Agent 为 input 97.93% / output 2.07%。这两组比例不含 billed cache read/write；不能再用未记录的缓存率拆分 input。

论文的早期合并样本为 23,608 请求、平均 input 7,590、output 182；作者明确提醒这反映 Kimi 的长上下文特点，不代表全部 workload。论文在无容量限制的理论情形下得到约 51% 可复用 KV block，不同应用可达到约 90%。这些数字描述的是服务系统在给定 cache policy/capacity 下的 **prefix KV reuse**，不是用户账单 API 返回的 cache read/write token。因此只能证明“长对话/agent 的缓存潜力强且场景相关”，不能直接写成四权重中的 `cacheRead=51`。

### TraceLab：coding-agent 的强缓存证据，也验证了当前个人样本并非孤例

TraceLab 总量可归一化为：

- append / fresh-side input：2.34B（约 4.25%）
- prefix/cache-side input：52.56B（约 95.41%）
- output：186.9M（约 0.34%）

归一化分母是 `2.34B + 52.56B + 186.9M = 55.0869B`。其 token-weighted prefix cache hit rate 为 95.7%；典型 step 中位数约 119K prefix、875 append、214 output。这个公开样本与“编码代理高度缓存、短输出”的个人观察方向一致。不过它来自约 4,300 个研究团队日常 sessions，不是人口抽样；而且 `append` 包含当前新输入、工具结果和 prefix miss，Claude 的 5 分钟 cache-write 计价又是 provider 特定映射。所以它能支撑 coding-agent 预设，不能直接给全产品一个四权重。

## 用户类型偏差与任务类型偏差

### 用户类型偏差

- Azure、Mooncake 是生产服务聚合，但没有公开用户人口属性；它们减少“单个人”偏差，却不能证明代表所有用户群。
- TraceLab 跨 Claude Code/Codex 和多个模型，但采样来自研究人员自己的开发活动；作者也将其定位为 coding-agent workload，而非全体 AI 用户。
- Anthropic Economic Index 覆盖约 100 万 Claude.ai 对话，能展示职业任务混合；其作者明确警告 Claude 的产品定位会使 coding 被过度代表，不能声称代表所有 AI 使用。

### 任务类型偏差

- 已有强证据：code、conversation、tool/agent 的 input/output 分布明显不同。
- coding agent 的 prefix reuse 很高，不能外推给一次性问答、摘要或批处理。
- RAG 的检索上下文可能造成长 input，但跨请求 prefix 是否相同取决于模板、检索文档和路由；仅有 RAG benchmark 的文本长度不足以推 cache-read/write 权重。
- 客服的多轮结构可能有可复用 system prompt，但公开客服语料通常没有真实 provider usage/cache 账单字段。
- 文档摘要可能是超长 input、短 output，但往往是一次性请求，不能从长 context 推出高 cache hit。
- batch 改变的是到达模式、折扣/服务层及吞吐，未必改变四类 token 的用量构成；价格表或 batch discount 不是使用分布。

## 对产品默认值的建议

1. 不发布一个冒充“行业平均”的四权重。
2. 第一版可提供有证据来源的任务预设：
   - `Azure 对话`：Azure conversation 的 input/output 比例为 84.54% / 15.46%；cache read/write 未建模。
   - `Mooncake Tool & Agent`：Mooncake 的 input/output 比例为 97.93% / 2.07%；cache read/write 未建模。
   - `Azure 代码`：Azure code 的 input/output 比例为 98.66% / 1.34%；cache read/write 未建模。
   - `TraceLab 编码 Agent`：append/output/prefix 比例为 4.25% / 0.34% / 95.41%；cache write 未建模，且 append 对 Claude 混有 cache creation，属于近似映射。
   - `自定义`：允许用户按自己的网关日志填写四项，这是唯一能完整适配具体 provider cache 账单的方法。
3. RAG、客服、长文摘要、批处理若要作为预设，应先标成“示例场景”而不是“行业统计”；获得带 provider usage 的公开 trace 后再升级证据标签。
4. 元数据应记录 `source`, `sampleWindow`, `taskType`, `coverage`, `unsupportedMeters`，避免后续把缺失 cache 数据误当成 cache 权重为 0。

## 证据缺口

- 没有公开、跨 provider、跨任务且逐请求提供 billed `input/output/cache_read/cache_write` 的生产数据集。
- 公开网关（OpenRouter、LiteLLM、Helicone、Langfuse）文档和代码能证明支持哪些价格维度，但本次未找到它们发布按任务分层的全网 token/cache 用量分布；价格目录不能替代 workload trace。
- OpenAI、Anthropic、Google 的 prompt caching 官方材料主要说明计费/使用方式与节省案例，不构成跨用户使用分布。
- cache write 的定义在 provider 间不同；服务端自动 prefix KV cache 甚至可能根本不作为单独写入费用暴露。
- 因此，当前可有依据地设计“任务预设 + 自定义”，不可有依据地宣称某组四权重是全行业默认。

## 证据等级说明

- **直接**：公开数据本身含需要的 token 维度，能按说明复算。
- **间接**：含 prefix hashes/cache-policy 结果或任务分类，但与 provider 账单 meter 不同，需要额外假设。
- **不可用于权重**：只说明价格、支持字段、职业/任务占比或性能收益，没有相应用量分布。
