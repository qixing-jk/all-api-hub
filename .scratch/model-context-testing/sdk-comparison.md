# AI SDK 整体替换与仅复用错误分类器

调查日期：2026-11-09。首次本地基线：`f9e7ad96ff34aa94dedf810175e684448b82a23e`；排除体积后的补充比较基线：`974e23886e383888b44619e6bb45b6700580bd7c`。对照固定版本发布源码、现有消费者，并完成 esbuild / Vite 浏览器打包与 Chromium 分类器实验。范围是选型研究，未替换应用 SDK、修改应用依赖或调用真实模型。工作区并行存在的 needle 测试与 UI 修改不属于本次研究。

## 结论

**按用户最新明确的“排除体积”标准，建议保留 AI SDK，优先接入 `@opencode/ai/route` 的 `classifyProviderFailure`。** 它的错误字段接口、结构化分类与本次额外提供方样本覆盖更贴合现有错误处理。下述人工冲突样本不证明上游分类器有实际误判，也不足以要求我们重新实现一套状态优先级去覆盖它。应用保留请求预算、继续/停止及结果含义；提供方例外应建立在真实样本或明确协议上。Pi 的优势是规则容易审查、接口结果简单，以及带 usage 的会话恢复启发式。下文保留打包数据作为事实记录，不参与本轮排序。

### 样本真实性与“误判”的校正

此前将分类结果与本地保守预期不同直接称为“误判”，结论过强。**26 个输入是归一化回放和构造样本，不是 26 个真实接口失败；实验通过只证明这些输入下的程序行为。** 用户原始 SSE 有会话中的真实响应依据；其中 `status: 400` 是由流内数值 code 构造的分类输入，并非本次观察到 HTTP 响应头为 400。换行与嵌套形状是派生 fixture；提供方文本主要来自上游源码示例，不能全部称为已复现真实服务行为。

以下 6 个组合没有核实的真实出现记录：429 + 仅窗口措辞、500 + 仅窗口措辞、`Invalid setting. The maximum context length is 8192 tokens.`、429 + 明确超限 code、401 + 明确超限消息、403 + 明确超限 code。它们只能揭示优先级和匹配范围。即使未来看到同样的状态/code 冲突，也需判断网关包装与原始提供方含义；不能先认定状态必然正确、正文必然错误。无真实记录不是永远不可能发生，但不能用假设发生来证明额外拦截规则必要。

`request_too_large` 指向字节限制时，缩小输入确实可能是正确恢复动作。若测量的是“当前连接可接受多少输入”，这是相关限制；若报告的是“模型 token 窗口”，才需区分限制原因。库为压缩恢复把两者归到 overflow 是用途选择，不是由名称不同就能判为算法错误。空 400 在没有提供方语境时含义不确定，不能标注一个确定的真实标签。

脚本现将旧 `expectedBound` 暴露为 `expectedUnderEarlierPolicy`，并把 `boundDisagreements` 改名为 `policyDifferences`，为人工冲突添加来源说明。历史生成结果保持原样，其中差异清单只能按这一校正解释，不能用于报告准确率或误判数量。后续接入应优先复用上游判断并覆盖用户真实 SSE 样本；有真实反例时再在最小位置补适配，不因这些假设组合一律把明确超限改成未知。

本轮进一步核对了三个一手来源，来源审计细节保留在本地 [provenance-review.md](artifacts/sdk-comparison-20261109/provenance-review.md)：

| 样本类别 | 真实依据 | 能支持什么结论 |
| --- | --- | --- |
| `request_too_large` | [Anthropic 官方 errors](https://platform.claude.com/docs/en/api/errors#request-size-limits) 明确写请求超过允许字节数；[OpenCode 固定单测](https://github.com/anomalyco/opencode/blob/9e9b551e3a72b12b839ba3fe266a0db89c909602/packages/ai/test/provider-error.test.ts#L31-L39) 明确命名为 recoverable overflow | 字节限制真实存在，恢复用途是刻意设计；单测本身仍是 fixture |
| 空 400 后压缩 | [Pi #9482](https://github.com/earendil-works/pi/issues/9482)，2026-09-11，opencode-go/deepseek-v4-flash 的现场会话报告；[后续回归](https://github.com/earendil-works/pi/blob/7d073328e44337d3292a7db9b0f0308f679c5e97/packages/ai/test/overflow.test.ts#L133-L139) 明确关联该 issue，收窄空 400 的 provider 条件 | 真实触发过恢复，上游也调整了规则；低于声明窗口及用户判断不独立证明网关根因 |
| 输出参数上限 | [OpenCode #1000](https://github.com/anomalyco/opencode/issues/1000)，2025-07-15，附 Groq dashboard JSON 与时间、请求日志 | 参数限制有真实记录；原始消息和本地拼接消息必须分开 |

Groq 报告的原文是 `` `max_tokens` must be less than or equal to `16384`, the maximum value for `max_tokens` is less than the `context_window` for this model ``，并没有本实验追加的 `Too many tokens:` 前缀。前缀恰好触发 Pi 的宽模式。本轮把原文作为第 27 个样本加入复现器；原文的本地函数检查结果为 Pi=false、OpenCode=InvalidRequest，均未分类成 context-overflow。**此前构造样本不构成 Pi 对这条真实错误误判的证据。** OpenCode 的 Cohere 相关源码注释本身也不能证明我拼接的整句是 Cohere 的原始响应。

Cerebras 的空 400/413，本次只确认 Pi 发布源码注释和可因缺少 key 而跳过的[集成测试预期](https://github.com/earendil-works/pi/blob/7d073328e44337d3292a7db9b0f0308f679c5e97/packages/ai/test/context-overflow.test.ts#L295-L316)，未获得原始响应或历史执行记录。不要把这项来源提升为本轮真实服务复现。

目前查阅的 Pi 和 OpenCode 都不能无功能损失地直接替换现有 AI SDK。本项目分别验证流式与真正的非流式 HTTP 请求，而两个候选的聊天 `complete` / `generate` 都只是聚合流式结果。它们也没有查到公开的 embedding 调用接口。OpenCode 的通用结构化输出通过强制工具调用实现，不能直接证明原生 JSON-schema 响应模式工作正常。

这不表示整包替换不可行：可以编写自定义 provider、Route、请求执行器及结果映射，补齐上述能力。但此时应评估这些新实现带来的维护量，而不能描述为换一套 import 即可获得完整对等行为。按现有需求，保留请求/usage/多模态适配，使用一个小错误归一化接口接入上游分类器，更容易保持现有验证契约。

| 方案 | 获得什么 | 本项目需承担什么 | 判断 |
| --- | --- | --- | --- |
| 全部换 Pi / OpenCode | 另一套模型调用、事件与工具接口，附带分类能力 | 补真正非流式、embeddings、原生结构化响应、transport 与 usage 适配，并重跑协议验收 | 仅为超限识别不值得迁移 |
| AI SDK + Pi 独立工具 | 随包更新的跨提供方错误模式；无需服务 | 错误到 AssistantMessage 的适配、状态冲突排除、区分降档建议与容量证据 | 需要简单 overflow 谓词或 Pi 会话恢复时合适 |
| AI SDK + OpenCode route | 更完整的 HTTP 状态、错误类别及诊断 | 适配 SDK 异常，区分恢复动作与结果含义；有真实依据再补提供方例外 | 排除体积后的首选接入方案 |
| AI SDK + 复制分类器源码 | 自主裁剪规则与依赖 | 保留 MIT 版权和来源版本，主动跟踪上游变化及回归 | 可选，但当前 Pi 公开工具已足够小 |

它们分属两个位置：AI SDK / Pi / OpenCode 的完整调用接口可以互相替换；Pi / OpenCode 的分类工具也可以作为 AI SDK 之后的普通函数调用。LiteLLM 的 Python SDK 或代理是另一种部署选择，见[前次研究](overflow-project-research.md#litellm-是否可以直接替换浏览器中的-ai-sdk)，本轮未把它当作可直接导入扩展的 TS 包。

## 排除体积：Pi 与 OpenCode 分类器的实质差异

本节比较固定版本 Pi 1.5.0 与 OpenCode 2.2.6 的公开分类器；不比较两个项目的 CLI，也不假定要改用它们的模型调用接口。

| 维度 | Pi `utils/overflow` | OpenCode `route` | 对本项目的影响 |
| --- | --- | --- | --- |
| 主要问题 | 助手消息是否有上下文压力、是否值得压缩恢复 | 提供方失败属于什么错误类别 | 后者更接近现有 HTTP/SSE 异常处理 |
| 输入 | `AssistantMessage`，可选声明窗口；主要检查 errorMessage/provider/stopReason/usage | message/status/rawBody/data/http/cause，另有重试和限流诊断输入 | OpenCode 可直接使用 SDK 提供的错误字段；两者都需先识别可信提供方错误 |
| 输出 | boolean；false 无法进一步区分原因 | 带 `_tag` 的原因：InvalidRequest、Authentication、RateLimit、QuotaExceeded、ContentPolicy、ProviderInternal、UnknownProvider；InvalidRequest 可细分 context-overflow / payload-too-large | OpenCode 少一些本地错误类别判断，但结果应映射到本项目已有契约 |
| 结构化代码 | 本次适配把 code/rawBody 拼入文本，没有独立 code 输入 | 解析若干已知的 error/innererror/details/response/exception 形状与 AWS 代码 | OpenCode 对中转站和流内嵌套错误更方便；不是任意嵌套结构都自动支持 |
| 状态和文本冲突 | 无独立 status 参数，只有少量排除文本 | 普通 429/5xx 的文本有门槛；明确 code 有不同优先级 | 人工组合仅说明处理顺序，未证明真实误判或额外拦截的必要性 |
| TS 接入 | 发布类型要求完整 AssistantMessage，含模型、api、usage、timestamp；正式适配需要处理这些字段 | 同步函数接受错误字段对象，返回带类型的 reason；调用者不必采用 Effect 编程方式 | 原 JS 实验不证明 Pi 最小对象通过 TS 类型检查；OpenCode 的类型契约更贴切 |
| 审查与修改规则 | 单模块、导出 getOverflowPatterns，易检查文本模式；仅取正则会丢失排除规则和其他分支 | 文本、状态、代码、优先级及 schema 类共同决定分类，定位问题需要看更多实现 | Pi 在规则可读性上有优势；OpenCode 在复用完整归一化逻辑上有优势 |
| 成功响应的恢复提示 | 还支持 usage 超声明窗口、length-stop 的启发式 | 此函数只分类失败输入 | Pi 对已采用其消息模型的聊天恢复有价值；探测未知容量不能直接采用这些启发式 |
| 后续维护 | 更新包获得模式更新，状态/类别逻辑仍主要由本项目维护 | 更新包获得分类和模式更新，本项目保留适配及探测政策 | 固定版本并跑本项目反例；未核实长期兼容承诺，不能声称任一方一定更稳定 |

类型和实现证据：[Pi overflow 声明](https://unpkg.com/@earendil-works/pi-ai@1.5.0/dist/utils/overflow.d.ts)、[AssistantMessage](https://unpkg.com/@earendil-works/pi-ai@1.5.0/dist/types.d.ts)、[OpenCode 分类接口](https://unpkg.com/@opencode/ai@2.2.6/dist/provider-error.d.ts)、[分类实现](https://unpkg.com/@opencode/ai@2.2.6/dist/provider-error.js)、[代码提取](https://unpkg.com/@opencode/ai@2.2.6/dist/utils/provider-codes.js)。直接分类调用不会发送请求或执行重试；原始 body/cause/http 的保留也不等于脱敏。不要把分类结果中的原文直接写入遥测或跨上下文消息。

### 新增 12 个样本：优势与反例同时检查

在原来的 14 个样本之外补充以下 12 个，使用同一适配器通过 esbuild 产物在 Chromium 实际执行，8 个入口均成功初始化；总计 26 个场景，未发起外部请求。[完整结果](artifacts/sdk-comparison-20261109/runs/esbuild-AEj1mr/comparison-results.json)。新样本用于区分具体规则，不能当成对所有提供方的准确率估计；本轮没有重跑 Vite，新样本运行证据只来自 esbuild 产物。

| 新样本 | Pi 返回 | OpenCode 返回 | 判断 |
| --- | --- | --- | --- |
| Google 400，details.reason 为 API_KEY_INVALID | false | Authentication | OpenCode 保留具体原因 |
| 429，code 为 insufficient_quota | false | QuotaExceeded | OpenCode 区分账户额度与普通限流 |
| 无状态，code 为 overloaded_error | false | ProviderInternal | OpenCode 识别无状态提供方错误 |
| 413，正文 Payload too large | false | payload-too-large | 此 Pi 适配未把 status 拼入文本；OpenCode 直接接收状态 |
| Z.ai：Prompt 超长 | false | context-overflow | 当前 OpenCode 规则覆盖该样本 |
| Bedrock Nova：number of input tokens exceeds maximum length | false | context-overflow | 同上 |
| Cloudflare 413：exceeded this model context window limit | false | context-overflow | 明确上下文证据应与普通字节大小 413 区分 |
| DeepInfra：requested input length 120000 exceeds maximum input length | false | context-overflow | 当前 OpenCode 规则覆盖该样本 |
| 429 + context_length_exceeded | true | context-overflow | 人工组合，无真实来源；只证明 code 在该分支优先 |
| 401 + 明确 prompt is too long 文本 | true | context-overflow | 人工组合，无真实来源；只证明不是一律状态优先 |
| 403 + context_length_exceeded | true | context-overflow | 人工组合，无真实来源；不能据此判定实际错误原因 |
| 仅文本 github-copilot API error (413)，正文 failed to parse request | true | UnknownProvider | Pi 能识别带前缀的字节限制恢复线索；这仍不是 token 容量证据 |

原 14 个场景中，Pi 对未知 provider 的空 400 比 OpenCode 更谨慎，而 OpenCode 对 `max_tokens must be less than` 更谨慎。因此本次选择依据是输入/输出契约与具体覆盖收益，不能把 OpenCode 说成 Pi 的严格超集或全面更准确。尤其要修正“OpenCode 自动处理所有状态优先级”的理解：它先检查 overflow，代码可覆盖 429，401/403 的超限文字也可能先命中。

建议只在现有错误 owner 引入 OpenCode：SDK 异常提取 → OpenCode 原因分类 → 本项目按预算及结果含义决定后续动作。实际有不适配的提供方样本时再补局部规则；本次人工冲突不足以支持在前面加一套状态否决逻辑。无需同时引入 Pi。替换整个 SDK 的限制仍见下文。

## 检查版本与证据

| 对象 | 固定版本 | 证据 |
| --- | --- | --- |
| 现有 Vercel AI SDK | `ai@7.0.148`；本地 `@ai-sdk/openai@4.0.99`、`anthropic@4.0.85`、`google@4.0.102`、`openai-compatible@3.0.75` | [ai 发布元数据](https://registry.npmjs.org/ai/7.0.148)、本地 package.json 与已安装 provider 源码 |
| 历史 Pi 包 | `@mariozechner/pi-ai@0.73.1`，gitHead `781152fc24841dc54b22284514604048ebe5e2c9` | [发布元数据](https://registry.npmjs.org/@mariozechner%2fpi-ai/0.73.1)、[固定源码](https://github.com/badlogic/pi-mono/tree/781152fc24841dc54b22284514604048ebe5e2c9/packages/ai) |
| **当前维护的 Pi 包** | `@earendil-works/pi-ai@1.5.0`，2026-11-02 发布；当次 registry latest | [发布元数据](https://registry.npmjs.org/@earendil-works%2fpi-ai/1.5.0)、[发布包](https://registry.npmjs.org/@earendil-works/pi-ai/-/pi-ai-1.5.0.tgz)、[README](https://unpkg.com/@earendil-works/pi-ai@1.5.0/README.md) |
| OpenCode AI | `@opencode/ai@2.2.6` | [发布元数据](https://registry.npmjs.org/@opencode%2fai/2.2.6)、[发布包](https://registry.npmjs.org/@opencode/ai/-/ai-2.2.6.tgz)、[固定仓库修订](https://github.com/anomalyco/opencode/tree/9e9b551e3a72b12b839ba3fe266a0db89c909602/packages/ai) |

原 Pi 包已标记 deprecated，指向 `@earendil-works/pi-ai`。下面主表使用维护中的 **1.5.0**，旧版仅保留历史差异。Pi 1.5.0 和 OpenCode 2.2.6 的版本元数据没有 gitHead；因此具体能力直接引用固定版本的发布文件，不把仓库最新状态冒充发布状态。三个项目发布包均为 MIT；如复制模块，仍应保留相关版权与许可证。

## 能力对照

表中的“有”表示查到可用导出和对应实现，仍受具体模型、供应商、网关支持约束；“需补实现”表示存在扩展点，但不是现成对等功能。“未核实”不等同于绝对不支持。

| 能力 | Vercel AI SDK 7 / 本项目 provider | Pi 1.5.0 | OpenCode AI 2.2.6 |
| --- | --- | --- | --- |
| OpenAI Chat、Responses 流式 | 有，分别选择模型接口 | 有，独立协议适配 | 有，独立协议 Route |
| Anthropic Messages、Google generateContent 流式 | 有 | 有 | 有 |
| **上述四类真正非流式请求** | **有**：`doGenerate` 与 `doStream` 分开；Google 分别调用 `:generateContent` 与 `:streamGenerateContent` | **无现成聊天模式**：`models.complete()` / compat `complete()` 聚合 stream；协议仍请求 SSE | **无现成聊天模式**：`generateWith(stream)` 聚合 stream；OpenAI/Anthropic body schema 要求 `stream: true`，Google 固定 stream endpoint |
| 工具调用、参数 schema | 有，工具定义/工具选择/调用与结果 | 有，工具 schema、调用与结果、严格工具参数选项 | 有，工具 schema、调用与结果；Promise 与 Effect 用法 |
| 原生结构化响应输出 | 有，`Output.object` 与 provider 原生 response-format 映射 | 未找到通用原生响应 schema 接口；严格 **tool** schema 有；可通过 `onPayload` 发原生字段但需自行解析验证 | `schema` 公开接口有，但实际强制 `generate_object` 工具；原生字段仅部分 provider 另有选项，不能视为四协议原生响应格式覆盖 |
| 普通 input/output/total usage | 有 | 有，字段及输入统计口径需映射 | 有，统一 Usage 并保留提供方信息 |
| cache read/write、reasoning usage | 有，保留可选值 | **1.5.0 有 `reasoning?`**；cache 字段有；缺失/零值与当前应用契约需核对 | 有 `cacheReadInputTokens`、`cacheWriteInputTokens`、`reasoningTokens`，有明确 inclusive input 定义 |
| 搜索工具与 citations / sources | provider 工具有，应用可读 `sources` | 未核实通用内置搜索及统一引用输出；手动工具/`onPayload`/原始事件 observer 是扩展手段 | 部分 provider 的 hosted search tool 有；未核实相当于现有 `sources` 的统一引用输出，也未核实 Google 原生搜索的对等路径 |
| Embeddings | 有，`embed` / `embedMany`；OpenAI、兼容、Google provider | 发布导出、运行时与类型中未找到 embedding 接口；需保留另一客户端或补实现 | 发布导出、运行时与类型中未找到 embedding 接口；需保留另一客户端或补实现 |
| 图像输入理解 | 有 | 有 | 有 |
| 图像生成 | 有，`generateImage`；本项目兼容 imageModel | **1.5.0 有** `models.generateImages`、image API/provider 实现 | 有 `ai.image.generate`，以及启动/恢复 generation 接口；OpenAI compatible images 路径存在 |
| 语音生成 / 转录 | 核心有 `experimental_generateSpeech` / `experimental_transcribe`，具体 provider 限定 | 未找到对应公开生成/转录接口；需补实现 | 有 `ai.experimental.speech` / `transcription` 的 generate/stream/start/resume 等接口，标注实验性 |
| 视频生成 | 核心有 `experimental_generateVideo` 等导出，需相应 provider | 未找到对应公开接口；需补实现 | 有 `ai.experimental.video` 的 generate/start/resume/stream，标注实验性；并非所有 provider 支持 |
| 自定义 base URL、headers | 有，项目已使用 | 有，model/provider baseUrl；headers 可覆盖/抑制默认值 | 有，provider/Route endpoint baseURL；headers 及 auth 分层 |
| 自定义 fetch | 有，项目在其中实现鉴权、header override、request profile | 接口有；OpenAI/Anthropic 可接入；**Google Generative AI 明确拒绝非 globalThis.fetch 的实现** | request `fetch` 经 `RequestExecutor.withFetch` 接入；还提供 executor middleware/layer |
| 取消 | `abortSignal` | `signal` | Promise `RunOptions.signal`；Effect interruption |
| 关闭自动重试 | `maxRetries: 0` | `maxRetries`，Google 1.5.0 也有共享 retry wrapper | 未找到同名公共 `maxRetries`；普通 LLM executor 未见自动 retry，媒体轮询另有 retry。不能把 retryable 分类当作已执行重试 |
| 浏览器 | 当前项目已集成；具体新能力仍需单独验证 | 独立 overflow 入口实测可用；README 支持 core/provider factories，Bedrock 与 OAuth login 有限制；未实测完整 provider 迁移 | Route 分类器实测可用；完整 provider 路径须分开测，Anthropic 协议静态导入 `node:buffer`，入口文件工具动态导入 fs，Google ADC/AWS chain 另有 Node 依赖 |

主表证据分别见下列实现核对；没有供应商 live API 结果时，不声称这些公开能力已在本项目配置上通过。

## 本项目实际依赖的能力

扫描 `src/services/verification` 的 9 个运行时导入文件，使用 15 个不同 SDK 导出：4 个 provider factory，加上 `generateText`、`streamText`、`tool`、`jsonSchema`、`Output`、`embed`、`generateImage`、`experimental_startVideo`、`experimental_getVideoStatus`、`APICallError`、`StreamProviderError`。这不是只替换一个聊天调用。

| 当前契约 | 现有消费者及迁移风险 |
| --- | --- |
| 四种协议、任意模型名、base URL 与版本路径 | [`providers.ts`](../../src/services/verification/aiApiVerification/providers.ts)；Chat Completions、Responses、Anthropic、Google 都需保持实际请求语义 |
| 真流式 / 真非流式、取消、错误与结果 | [`probeGeneration.ts`](../../src/services/verification/aiApiVerification/probes/probeGeneration.ts)；取消拒绝部分结果，保留 SSE 提供方错误，不得用聚合流冒充非流式 |
| 工具执行及原生结构化输出 | [`toolCallingProbe.ts`](../../src/services/verification/aiApiVerification/probes/toolCallingProbe.ts)、[`structuredOutputProbe.ts`](../../src/services/verification/aiApiVerification/probes/structuredOutputProbe.ts)；强制工具、参数校验和原生响应 schema 是不同测试 |
| 多轮工具环境 | [`pelican.ts`](../../src/services/verification/modelQuality/pelican.ts)、[`agentTest/environment.ts`](../../src/services/verification/agentTest/environment.ts)；保留工具执行、步数、取消和继续语义 |
| 原生搜索和来源 | [`webSearchProbe.ts`](../../src/services/verification/aiApiVerification/probes/webSearchProbe.ts)；OpenAI search 与 Google grounding，不能只证明普通工具可调用 |
| Embeddings、图片、视频 | [`embeddingProbe.ts`](../../src/services/verification/aiApiVerification/probes/embeddingProbe.ts)、[`imageGenerationProbe.ts`](../../src/services/verification/aiApiVerification/probes/imageGenerationProbe.ts)、[`videoGenerationProbe.ts`](../../src/services/verification/aiApiVerification/probes/videoGenerationProbe.ts)；使用 SDK 的向量、图片与 Google video start/status，兼容视频已有自定义 HTTP；当前未消费 SDK 的语音/转录能力 |
| 浏览器中的请求 transport | [`headerOverrides.ts`](../../src/services/apiTransport/headerOverrides.ts)、[`requestProfiles.ts`](../../src/services/verification/aiApiVerification/requestProfiles.ts)；DNR / Web Locks 处理受限头，fetch 包装处理明确 401 后鉴权回退和 CLI 请求 profile，保留原生 SSE |

质量、图片与视频测试显式禁用重试；部分基础探测沿用 SDK 默认值。若迁移，需核对发送次数，不能只检查最终返回文本。未来迁移可复用已有的 `aiApiVerification.modes.http`、`responses.http`、`clientProfiles*.http`、`headers.http`、`media.http`、`googleVideo.http` 与 `pelican` 测试；本次未修改应用，因此未重跑这些应用测试。

## 实测：浏览器代价与分类行为

可复现的研究脚本：[sdk-comparison-probe.mjs](sdk-comparison-probe.mjs)。使用固定候选版本、Node 24.14.1、esbuild 0.27.7，以及仓库已安装的 Vite 8.3.6 / Oxc。目标与 WXT 一致：Chrome/Edge 107、Firefox 104、Safari 16；产物为 browser 条件、production、minified IIFE。每个产物再在 Playwright Chromium 156.0.8078.4 中初始化并运行样本；外部请求全部拦截，实际没有发起请求。

### 打包结果

单位为字节；gzip 是产物压缩体积对比，不等于扩展下载包大小。代表性 AI SDK 入口暴露 4 个 provider factory 和 text/stream/tool/schema/Output，未覆盖所有媒体 API；用于观察增量，不是整套 SDK 的最小体积或完整扩展构建。

| 入口 | esbuild minified | esbuild gzip | Vite minified | Vite gzip |
| --- | ---: | ---: | ---: | ---: |
| 当前分类器及所需 SDK 错误类 | 156,005 | 41,306 | 未测 | 未测 |
| 旧 Pi 0.73.1 根入口取分类器 | 2,249,661 | 409,089 | 未测 | 未测 |
| 新 Pi 1.5.0 根入口取分类器 | 1,807 | 808 | 未测 | 未测 |
| **新 Pi 独立 overflow 入口** | **1,807** | **808** | **1,811** | **805** |
| OpenCode route 分类器 | 680,196 | 213,654 | 269,513 | 83,248 |
| AI SDK 代表性入口 | 1,162,768 | 268,217 | 880,238 | 214,449 |
| AI SDK + Pi overflow | 1,164,571 | 268,907 | 882,041 | 215,138 |
| AI SDK + OpenCode route | 1,850,452 | 483,643 | 1,152,432 | 298,290 |

相对各自基线，Pi 增量为 esbuild +1,803 / +690 gzip，Vite +1,803 / +689 gzip；OpenCode 增量为 esbuild +687,684 / +215,426 gzip，Vite +272,194 / +83,841 gzip。**Vite 对 OpenCode 的裁剪明显更好，不能只用 esbuild 数字代表项目打包效果。** 这里仍未加载 WXT 配置或构建整个扩展；真正接入后才可报告完整扩展增量。

新版 Pi 根入口也能裁剪到同等大小，但 esbuild 访问 77 个输入模块，独立子入口只访问 2 个，优先使用明确的 utils 导出。当前分类器单独打包包含 AI SDK 的错误类导入；这些代码在现有应用可能已共享，不能把 41 KB gzip 当作可直接节省的增量。

### 14 个错误样本

下表“是”仅表示库返回 overflow；“旧保守预期”记录先前研究者设置的容量政策，**不是提供方失败原因的真实标签**。Pi 输入由现有错误的 message/code/rawBody 合成 `errorMessage`，`provider` 设为未知的 `test`；其接口不接收独立 HTTP status，不能要求它自动使用没传入的状态。OpenCode 接口则直接接收 status/data/rawBody。样本来源与推论限制见开头校正，未含真实凭据。

| 样本 | 旧保守预期 | 当前分类器 | Pi 1.5.0 | OpenCode 2.2.6 |
| --- | --- | --- | --- | --- |
| 用户原始 SSE 的状态/数值 code/明确超限文本 | 是 | 是 | 是 | 是 |
| 同一超限信息在两句话之间换行 | 是 | 否 | 是 | 是 |
| 无状态但有 `context_length_exceeded` | 是 | 否 | 是 | 是 |
| 无状态但有 `prompt is too long: X > Y` | 是 | 否 | 是 | 是 |
| Gemini 明确 input token count 超限 | 是 | 是 | 是 | 是 |
| 无状态，rawBody 嵌套明确上下文代码 | 是 | 否 | 是 | 是 |
| 普通每分钟 token 限流 | 否 | 否 | 否 | 否 |
| HTTP 429，仅正文提到 maximum context length | 否 | 否 | 是 | 否 |
| HTTP 500，仅正文提到 maximum context length | 否 | 否 | 是 | 否 |
| Invalid setting，附带声明 maximum context length | 否 | 否 | 是 | 是 |
| HTTP 413 + `request_too_large` 字节上限 | 否 | 否 | 是 | 是 |
| 未知 provider，`400 status code (no body)` | 否 | 否 | 否 | 是 |
| user 字段 string too long | 否 | 否 | 否 | 否 |
| Too many tokens: max_tokens must be less than 4096 | 否 | 否 | 是 | 否 |

两种打包器的分类观察一致。这个定向样本集用来揭示语义差异，不能当成准确率排行榜；没有覆盖所有 provider。Pi 旧版还把未知提供方的空 400 判断为 overflow，新版只对 `cerebras` 启用该启发式，适用范围更窄；没有真实错误原因时不能据此判定谁更准确。Pi 源码明确将请求字节限制包含在 overflow 中，这对聊天压缩恢复有用途；恢复信号与模型 token 窗口测量的结果含义不同，不应称作已证实的库误判。

### 接入时应保留的判断

建议归一化现有 SDK HTTP/SSE 错误后调用所选分类器。对用户原始响应这种明确超限证据，应在预算内继续降低输入；普通鉴权、限流、服务端或输出参数错误按分类处理。人工状态/code 冲突不构成预先否决明确超限的依据。长度恢复提示可以指导较小输入尝试；展示模型 token 窗口时才需要更窄的证据，字节限制则记录为当前连接的请求大小限制。空响应在缺少提供方语境时不具备确定的真实标签。

更小请求成功只能证明这个长度可接收，不能反向证明先前失败一定是 token 上限。错误来源、原始状态/代码、分类依据及已尝试目标需保留在已有紧凑记录里；不重放结果未知的在途请求。无状态本身不否决可信提供方错误中的明确容量证据，也不能把任意运行时异常文本当提供方拒绝。

Pi 还提供基于声明窗口和 usage 的 silent-overflow / length-stop 启发式；本次只测错误分支，没有给它传声明窗口，不建议在测未知容量时顺带启用这些逻辑。它们不能替代真实输入接收、计数身份与输出预算的现有判据。

## 决定迁移成本的实现细节

### 1. 完整结果不等于非流式请求

本地 [`probeGeneration.ts`](../../src/services/verification/aiApiVerification/probes/probeGeneration.ts) 明确根据模式调用 `generateText` 或 `streamText`，失败不能偷偷切换另一模式。四类 provider 的 Vercel 实现分别定义 `doGenerate` 与 `doStream`：

- [OpenAI Chat](https://unpkg.com/@ai-sdk/openai@4.0.99/src/chat/openai-chat-language-model.ts) 与 [Responses](https://unpkg.com/@ai-sdk/openai@4.0.99/src/responses/openai-responses-language-model.ts) 的流式方法额外加入 `stream: true`。
- [Anthropic](https://unpkg.com/@ai-sdk/anthropic@4.0.85/src/anthropic-language-model.ts) 同样分开请求及响应解析。
- [Google](https://unpkg.com/@ai-sdk/google@4.0.102/src/google-language-model.ts) 分别发送 `generateContent` JSON 与 `streamGenerateContent?alt=sse`。

Pi 1.5.0 的 [`models.js`](https://unpkg.com/@earendil-works/pi-ai@1.5.0/dist/models.js) 中 `complete()` 返回 stream 的 `result()`；[`compat.js`](https://unpkg.com/@earendil-works/pi-ai@1.5.0/dist/compat.js) 的旧式 `complete/completeSimple` 同样如此。[Chat](https://unpkg.com/@earendil-works/pi-ai@1.5.0/dist/api/openai-completions.js)、[Responses](https://unpkg.com/@earendil-works/pi-ai@1.5.0/dist/api/openai-responses.js)、[Anthropic](https://unpkg.com/@earendil-works/pi-ai@1.5.0/dist/api/anthropic-messages.js) 请求有 `stream: true`，[Google](https://unpkg.com/@earendil-works/pi-ai@1.5.0/dist/api/google-generative-ai.js) 使用 SDK 的 `generateContentStream()`。`onPayload` 并不能自动提供 JSON 响应解析器；Anthropic 还会把回调替换的 payload 再设为 `stream: true`。

OpenCode 的 [`route/client.js`](https://unpkg.com/@opencode/ai@2.2.6/dist/route/client.js) 中，默认 service 的 `generate` 是 `generateWith(stream)`，通过 `Stream.runForEach` 聚合事件。[Chat](https://unpkg.com/@opencode/ai@2.2.6/dist/protocols/openai-chat.js)、[Responses](https://unpkg.com/@opencode/ai@2.2.6/dist/protocols/openai-responses.js)、[Anthropic](https://unpkg.com/@opencode/ai@2.2.6/dist/protocols/anthropic-messages.js) 的 body schema 明确要求 `Schema.Literal(true)`；[Gemini](https://unpkg.com/@opencode/ai@2.2.6/dist/protocols/gemini.js) 的 Route endpoint 固定 `:streamGenerateContent?alt=sse`。自定义整个 LLMClient/Route 可以补能力，但不属于内置模式选择。

### 2. 结构化工具参数不能替代原生结构化响应验证

OpenCode [`llm.js`](https://unpkg.com/@opencode/ai@2.2.6/dist/llm.js) 的 `prepare` 把 `schema` 转成隐藏的 `generate_object` 工具；无其他工具时强制该工具，有其他工具时要求任意工具，最后从该工具调用参数解析 `object`。这是现成的结构化结果功能，但验证了工具协议。Anthropic 等个别 native provider options 包含原生格式字段，仍需专门配置和验证，不能从通用 `schema` API 推导原生 JSON 模式已覆盖。

Pi [`types.d.ts`](https://unpkg.com/@earendil-works/pi-ai@1.5.0/dist/types.d.ts) 与 README 中的严格 `json_schema`/grammar 主要约束工具调用参数；没有查到可直接取代本项目 `Output.object` 的统一 native output 接口。通过 `onPayload` 指定 provider 原生字段是可行的扩展方向，但还要自行验证响应形态、schema 失败与工具调用的语义区别。

### 3. Usage、搜索、模态必须逐项适配

Pi 1.5.0 的 [`Usage`](https://unpkg.com/@earendil-works/pi-ai@1.5.0/dist/types.d.ts) 含 `reasoning?: number`，其注释说明为 output 的子集。Google mapper 用 `promptTokenCount - cachedContentTokenCount` 作为 `input`，把 thoughts 加入 output。若迁移，应重建本项目 inclusive input 与 missing/unknown 语义，不要照搬字段名。

OpenCode [`schema/events.js`](https://unpkg.com/@opencode/ai@2.2.6/dist/schema/events.js) 明确定义 input 包含缓存、reasoning 是 output 子集；提供 `nonCachedInputTokens` 等派生值。它的 [Open Responses](https://unpkg.com/@opencode/ai@2.2.6/dist/protocols/open-responses.js) 能识别 `web_search_call`，Anthropic 有 server tools，部分 provider 导出 hosted search。与此同时，已查阅的 Gemini request builder 将 tools 构造为 functionDeclarations，未找到与本项目 Google search + sources 同等的路径；该项需补独立请求/响应 fixture 验证。

现有 AI SDK 的 [核心导出](https://unpkg.com/ai@7.0.148/dist/index.d.ts) 包含 embeddings、image、speech、transcription、video。OpenCode 的 [Promise 接口](https://unpkg.com/@opencode/ai@2.2.6/dist/index.d.ts) 有 image/speech/transcription/video，但未见 embeddings。Pi 新版的 [models](https://unpkg.com/@earendil-works/pi-ai@1.5.0/dist/models.js) 与 [images](https://unpkg.com/@earendil-works/pi-ai@1.5.0/dist/images.js) 已有图像生成；不可再用旧包“只有聊天”的结论描述维护版。

### 4. 浏览器与 transport 扩展

本地 [`providers.ts`](../../src/services/verification/aiApiVerification/providers.ts) 为 OpenAI/Anthropic/Google 注入 fetch，实现鉴权、请求 profile 与 header 覆盖；图片下载还区分 API origin 和 CDN origin。因此仅支持 baseURL/headers 不足以等价迁移。

Pi 1.5.0 [通用选项](https://unpkg.com/@earendil-works/pi-ai@1.5.0/dist/types.d.ts) 新增自定义 fetch，但 [Google adapter](https://unpkg.com/@earendil-works/pi-ai@1.5.0/dist/api/google-generative-ai.js) 会显式抛出 `Custom fetch is not supported by the Google Generative AI adapter`。其他 provider 必须按实际实现而不是类型字段判断。Google 的重试通过 [共享 retry wrapper](https://unpkg.com/@earendil-works/pi-ai@1.5.0/dist/api/google-shared.js) 执行，可传 `maxRetries`。

OpenCode [RequestExecutor](https://unpkg.com/@opencode/ai@2.2.6/dist/route/executor.js) 允许 per-call fetch/middleware。[主入口](https://unpkg.com/@opencode/ai@2.2.6/dist/index.js) 是 Promise-first wrapper，内部使用 Effect ManagedRuntime；不要求所有应用调用者改成 Effect。不过自定义 service/layer/Route 时需要理解 Effect 的错误、资源与取消契约。

不能由分类器可打包推导所有 provider 可打包。OpenCode [Anthropic 协议第一行](https://unpkg.com/@opencode/ai@2.2.6/dist/protocols/anthropic-messages.js) 静态导入 `node:buffer`；主入口 file/write 动态使用 `node:fs/promises`；Google Vertex auth 和 AWS credentials 也有 Node 路径。完整迁移是否需要 polyfill/alias，以及生产 bundle 是否保留这些路径，本次没有测试。Pi README 对浏览器支持、Bedrock/OAuth 限制也应与实际打包范围一起看。

## 仅复用分类器的公开接入点

| 选择 | 公开入口 | 调用契约与注意点 |
| --- | --- | --- |
| 维护中的 Pi | `@earendil-works/pi-ai/utils/overflow` | [`package.json`](https://unpkg.com/@earendil-works/pi-ai@1.5.0/package.json) 的 `./utils/*` 正式允许该子路径；[`overflow.js`](https://unpkg.com/@earendil-works/pi-ai@1.5.0/dist/utils/overflow.js) 导出分类函数。无需通过完整 provider 根入口接入。 |
| OpenCode | `@opencode/ai/route` | [`route/index.js`](https://unpkg.com/@opencode/ai@2.2.6/dist/route/index.js) 导出 `classifyProviderFailure`；[`provider-error.js`](https://unpkg.com/@opencode/ai@2.2.6/dist/provider-error.js) 产生包含分类和 HTTP 诊断的 typed failure。需要把现有 AI SDK HTTP/SSE 异常归一化为其输入。 |
| 历史 Pi 0.73.1 | `@mariozechner/pi-ai` 根入口 | 无独立 overflow exports 子路径；原研究结论仅对此旧版有效。 |

建议在当前错误分类模块放一个窄适配，输入保留 message/status/rawBody/data 等真实证据，区分后续恢复动作与测量结果的含义。回归以真实样本、明确协议和有来源的上游案例为主；人工健壮性样本应单独标记，不能用它们证明库存在真实假阳性。无需因为重用分类器就引入它的 model registry、聊天 event 类型或媒体 API。

## 历史版本与当前版本不可混用的结论

Pi 0.73.1 的 [`types`](https://unpkg.com/@mariozechner/pi-ai@0.73.1/dist/types.d.ts) 没有 fetch、独立 reasoning usage 或图像生成接口；[`stream.js`](https://unpkg.com/@mariozechner/pi-ai@0.73.1/dist/stream.js) 的 complete 也聚合流。1.5.0 已补 fetch（有 provider 限制）、reasoning、图像生成、独立 utils exports，并转为可选择 provider 的新组织方式。**流式聚合与无 embedding 接口的核心限制仍然存在。** 原研究若用于新决策，应显式附上本次维护版校正。

## 验证记录、复现与素材保留

仓库开发依赖及 Playwright Chromium 就绪后，从仓库根运行以下命令。候选包只安装到忽略的实验目录，`--ignore-scripts` 禁止安装脚本；不更改应用 package.json 或 pnpm 锁文件。

```powershell
npm install --prefix .scratch/model-context-testing/artifacts/sdk-comparison-20261109 --ignore-scripts --no-audit --no-fund --save-exact @mariozechner/pi-ai@0.73.1 @earendil-works/pi-ai@1.5.0 @opencode/ai@2.2.6
node .scratch/model-context-testing/sdk-comparison-probe.mjs
node .scratch/model-context-testing/sdk-comparison-probe.mjs --vite
```

脚本验证构建、浏览器初始化、样本返回形态、无页面错误及无外部请求；失败时退出非零。与早期本地政策不同的结果现保存在 `policyDifferences`，历史结果名为 `boundDisagreements`；两者都不是已证实的分类错误。每次生成新的 `runs/` 目录，保留前次证据。候选直接依赖固定；未来完整重放依赖树需使用本地实验 package-lock，复现时也需核对安装树，以及脚本记录的 Node 和构建器版本。

| 研究目标 | 实际执行结果 / 证据 |
| --- | --- |
| 当前消费者与替换缺口 | 当前代码与固定发布源码逐项核对；真正非流式、embeddings、结构化输出及自定义 fetch 差异见上文 |
| esbuild 浏览器可打包性 | 8 个入口构建与 Chromium 初始化通过；[原始结果](artifacts/sdk-comparison-20261109/comparison-results.json)与[加入失败退出检查后的重放结果](artifacts/sdk-comparison-20261109/runs/esbuild-f7rncj/comparison-results.json)一致 |
| 项目采用的 Vite 构建器确认 | 5 个维护版相关入口构建与 Chromium 初始化通过；[Vite 结果](artifacts/sdk-comparison-20261109/runs/vite-3Xac4M/comparison-results.json) |
| 分类语义及边界反例 | 14 个样本，所有分类器入口实际执行；行为差异见矩阵，浏览器没有外部请求 |
| 排除体积后的接口、覆盖和优先级比较 | 增补 12 个场景，esbuild 的 8 个入口重放全部 26 个样本；[补充结果](artifacts/sdk-comparison-20261109/runs/esbuild-AEj1mr/comparison-results.json)；Vite 仍为前轮 14 个样本证据 |
| 样本来源与错误结论校正 | 添加来源标签及真实报告原文对照；esbuild 8 个入口运行 27 个场景，[结果](artifacts/sdk-comparison-20261109/runs/esbuild-0I2qQG/comparison-results.json)。Pi / OpenCode 对 Groq 原文均未报上下文超限；差异清单改为政策比较，未据此声明分类正确率 |
| 完整应用替换与真实模型 | 未做：本轮是研究，没有改应用；没有真实收费请求 |

保存在 Git：本文、研究脚本，以及旧研究 / spec 的版本校正与入口链接。保留本地供复核：`artifacts/sdk-comparison-20261109/` 下的隔离依赖、lock、生成入口、bundle、metafile、结果与日志。无凭据发布源文件另留在 `C:/Users/THINK/AppData/Local/Temp/sdk-comparison-source-20261109/{pi,pi-current,opencode,vercel}/package/`；本次未删除。

尚未验证的迁移问题：完整扩展体积、最低版本浏览器、MV3 worker 执行、候选实际网络载荷、取消与重试次数、搜索/citations、schema 模式、usage 缺失值。静态发现的非流式等缺口已足以支持当前不整包迁移的建议；未来若决定迁移，需补实现并通过现有协议行为测试，不能把这次分类器实验当作迁移验收。
