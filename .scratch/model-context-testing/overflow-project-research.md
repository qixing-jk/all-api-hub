# 上下文超限识别与降档探测：开源项目证据

调查日期：2026-11-09。本地基线：`85e518c383`。范围：读取官方协议文档和公开项目的固定提交源码及测试，区分正常对话恢复、容量边界探测和长上下文任务评测。以下结论描述查阅版本，不保证其他版本一致；本次没有修改应用行为。

后续选型与实测见 [AI SDK 整体替换与仅复用错误分类器](sdk-comparison.md)：维护版 `@earendil-works/pi-ai@1.5.0` 已提供公开 `utils/overflow` 子入口。本文关于 Pi 没有独立子入口的观察仅适用于旧 `@mariozechner/pi-ai@0.73.1`。用户随后要求排除体积；新报告按接口适配、分类能力及 26 个定向样本，优先建议 OpenCode 的公开 route 分类器。样本真实性已补充校正：人工状态/code 冲突只说明函数行为，不能证明真实误判或额外否决规则的必要性；字节限制下缩小输入可能是合理恢复。两者都无需替换现有 AI SDK。

## 结论

可以依据明确超限特征继续缩小输入，没有必要把所有不带专用错误类型的响应立即归为未知。LiteLLM 和 Cline 都识别错误代码与提供方错误文本；Cline 还实际执行压缩后重试。不过，**允许尝试更小输入**和**已经证实容量上界**应是两个独立判断。

真实 API 粗扫与二分也有开源实现，但下面的 api-relay-audit 将漏答标记、限流等都用于缩小边界，不能作为严格证明最大上下文容量的方法。RULER 的有效长度则是任务质量指标，不等于接口接受输入的硬上限。

## 官方协议有什么明确约定

协议提供了可用特征，但不存在已经核实、跨所有协议及中转站通用的单一超限字段。应用应读取结构化错误和实际错误消息，不能把 SDK 异常类或 HTTP 400/422 当成唯一入口。

| 接口 | 已核对的官方约定 | 对容量探测的含义 |
| --- | --- | --- |
| OpenAI Responses | [`truncation: disabled`](https://developers.openai.com/api/reference/resources/responses/methods/create) 是默认值，输入超过窗口时返回 400；`auto` 会丢弃会话开头的条目。[SSE error 事件](https://developers.openai.com/api/reference/resources/responses/streaming-events) 定义 `code`、`message`、`param`、`type` 等，`code` 可空，没有必填的 HTTP 状态字段。 | 不能要求每个流内错误都携带 HTTP 状态。容量测试也不能用开启自动截断后的成功证明整段输入已被接受。 |
| Anthropic Messages | [Context windows](https://platform.claude.com/docs/en/build-with-claude/context-windows) 明确：输入本身超限时返回 400 `invalid_request_error`，消息为 `prompt is too long`。部分模型允许输入加输出预算超过窗口，并在生成碰到窗口时返回 [`model_context_window_exceeded`](https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons)。 | 通用的 `invalid_request_error` 本身不够，明确的输入超限消息可以触发降档。生成过程的停止原因应视为输出截断，不能反记为该输入被拒绝。 |
| OpenRouter 兼容流 | [Streaming 文档](https://openrouter.ai/docs/api_reference/streaming) 说明响应头提交之后，HTTP 已为 200，后续失败通过 SSE 传递；错误负载可以包含数值 `code` 和 `message`。 | 用户提供的 `PING` 后 `error.code: 400` 就属于需要读取流内错误的形态；这里的 HTTP 成功不等于模型请求成功。 |
| Gemini 文档范围 | 当前 [API errors](https://ai.google.dev/gemini-api/docs/api-errors) 明确是 Interactions API，其错误结构和 code 表不能直接作为本项目 generateContent 适配的全部约定。[排障说明](https://aistudio.google.com/docs/troubleshooting.md) 对 429/5xx 提供退避重试指导。 | 本次未核实一个覆盖 generateContent 各部署的专用上下文错误码保证。需结合该协议真实错误样本，不能把通用 400、500 或新 Interactions 错误码自动当成容量证明。 |

资料校正：搜索结果曾返回旧版 Google 排障摘要，称输入过长可能导致 500；打开当前排障页并跟进当前错误页后，没有找到同一约定。因此该摘要不作为本方案依据，也不建议因普通 500 自动缩小容量边界。

本项目现有搜索器已经在 `context-limit` 后减半，有接受点后再二分并复测成功点；主要缺口是 `contextErrors.ts` 的入口及证据识别。`contextCapacityRun.ts` 对 `length` 停止采用输入接受证据判断，不应通过泛化“exceeded”文字规则破坏输入拒绝与生成截断的区别。

## 固定修订

| 项目 | 检查的提交 | 提交时间 UTC |
| --- | --- | --- |
| LiteLLM | `2f430873aead937b9112e683703956eb1ab179af` | 2026-11-08 19:13:53 |
| Cline | `94eecbbe1a2f899c66b118d13656651b0a884e1f` | 2026-11-06 18:48:41 |
| api-relay-audit | `3af7126a34d099f65031c6e3af63b302a843fe59` | 2026-10-27 18:08:21 |
| RULER | `db43f92ff634bbce1c33d1fb15858aec4bba509a` | 2026-11-03 17:25:22 |

提交通过 GitHub REST `repos/{owner}/{repo}/commits/HEAD` 获取，正文及测试从该 SHA 的 GitHub raw 内容读取。所有源码链接均固定到该提交。

## 1. LiteLLM：归一化明确特征，并测试假阳性

[`ExceptionCheckers.is_error_str_context_window_exceeded`](https://github.com/BerriAI/litellm/blob/2f430873aead937b9112e683703956eb1ab179af/litellm/litellm_core_utils/exception_mapping_utils.py#L88-L127) 识别多种实际错误形态，例如：

- `this model's maximum context length is`。
- `prompt is too long`。
- `input tokens exceed the configured limit`。
- `inputs tokens + max_new_tokens must be`。
- `exceeds the available context size`。
- `Current length is X while limit is Y`。
- 序列化错误中的 `"code": "context_length_exceeded"`。

这不是只识别某一家 SDK 的异常类。[调用方](https://github.com/BerriAI/litellm/blob/2f430873aead937b9112e683703956eb1ab179af/litellm/litellm_core_utils/exception_mapping_utils.py#L374-L381) 将匹配结果提升为统一的 `ContextWindowExceededError`。

同一函数明确排除 `string_above_max_length` 和 `Invalid 'user': string too long`，因为参数字符数限制不等于模型窗口限制。[原生表驱动测试](https://github.com/BerriAI/litellm/blob/2f430873aead937b9112e683703956eb1ab179af/tests/unit/litellm_core_utils/test_exception_mapping_utils.py#L160-L269) 还包含 metadata 字符数、错误配置字段 `context_length_exceeded_behavior`、普通 API 错误、API key 和限流等反例。

可借鉴的是“规范化错误 + 已知特征 + 明确反例”，不宜无差别复制整个匹配表。例如它也将某些 `string too long` 文本判为超限；容量验证应进一步区分字段长度和模型 token 窗口。这里验证的是识别机制，不能据此宣称 LiteLLM 在自动二分输入来测容量。

## 2. Cline：识别后压缩输入，只自动恢复一次

Cline SDK 的[错误分类器](https://github.com/cline/cline/blob/94eecbbe1a2f899c66b118d13656651b0a884e1f/sdk/packages/llms/src/providers/error-classification.ts#L4-L36) 同时使用 `context_length_exceeded` 和已知消息模式。它会[遍历嵌套错误及 JSON 编码的错误字符串](https://github.com/cline/cline/blob/94eecbbe1a2f899c66b118d13656651b0a884e1f/sdk/packages/llms/src/providers/error-classification.ts#L87-L150)，因此网关包装和只有文本的错误仍可能得到分类。

[恢复流程](https://github.com/cline/cline/blob/94eecbbe1a2f899c66b118d13656651b0a884e1f/sdk/packages/agents/src/agent-runtime.ts#L1378-L1439) 的条件和动作是：

1. 本轮以 `error` 结束，分类为 `context_window_exceeded`，且尚未尝试过自动恢复。
2. 存在 `prepareTurn` 压缩流程；已产生工具调用的失败轮次不走这个重试路径。
3. 发出“context window exceeded — compacting and retrying”通知，以 `overflowRecovery: true` 重新准备并发送请求。
4. 重试仍超限，则返回明确的恢复失败，不继续循环。

相关[测试](https://github.com/cline/cline/blob/94eecbbe1a2f899c66b118d13656651b0a884e1f/sdk/packages/agents/src/agent-runtime.test.ts#L1580-L1687) 验证：首次超限后第二个请求使用压缩消息并成功；仅有 `prompt is too long: 213462 tokens > 200000 maximum` 文本也可恢复；socket 关闭不触发压缩。[另有测试](https://github.com/cline/cline/blob/94eecbbe1a2f899c66b118d13656651b0a884e1f/sdk/packages/agents/src/agent-runtime.test.ts#L1880-L1956) 覆盖无内容可压缩、无准备流程和第二次仍超限。

它也防止把吞吐量限制当容量限制。[类型化 HTTP 错误处理](https://github.com/cline/cline/blob/94eecbbe1a2f899c66b118d13656651b0a884e1f/sdk/packages/llms/src/providers/error-classification.ts#L243-L262) 将实际 HTTP 状态作为权威信号；[测试](https://github.com/cline/cline/blob/94eecbbe1a2f899c66b118d13656651b0a884e1f/sdk/packages/llms/src/providers/error-classification.test.ts#L264-L310) 验证 429、500 即使带 token/context 文本甚至嵌套超限代码，也不触发这类恢复。没有 HTTP 状态的文本路径仍可分类。

边界：这是正常对话的压缩恢复，不是在原样长输入上测最大容量。测试工具应缩短其合成填充文本，保留测试语义；若先摘要待测输入，就已经改变了要测的对象。Cline 的部分正则也很宽，不应把它们直接当成严格容量证明。

## 3. api-relay-audit：真实粗扫和二分，但判据混合了多种原因

这个较新的独立审计工具有直接 API 探测实现。[`single_context_test`](https://github.com/toby-bridges/api-relay-audit/blob/3af7126a34d099f65031c6e3af63b302a843fe59/api_relay_audit/context.py#L9-L50) 在长文本中均匀插入 5 个随机 canary，要求模型逐一返回。注意其 `target_k` 单位是**千字符**，不是千 token；调用后的 `input_tokens` 是另一个结果字段。

[`run_context_scan`](https://github.com/toby-bridges/api-relay-audit/blob/3af7126a34d099f65031c6e3af63b302a843fe59/api_relay_audit/context.py#L80-L116) 默认从 `[50, 100, 200, 400, 600, 800]` 千字符粗扫，遇到首次非 `ok` 就在最后成功与首次失败之间二分，然后按 10 千字符步长细扫。这确实会向接口发出改变长度后的新请求。

但源码把“5 个标记未全部召回”直接命名为 `truncated`，并把**任何** `error` 也放进失败上界。漏答不能单独证明截断；普通错误不能单独证明输入过长。[测试甚至明确用 `rate limited` 触发二分](https://github.com/toby-bridges/api-relay-audit/blob/3af7126a34d099f65031c6e3af63b302a843fe59/tests/test_context.py#L284-L316)。因此它证明“开源工具存在粗扫加二分”，不能证明其输出就是模型硬容量。

本次以该固定源码和本地 fake client 复现：输入超过 80,000 字符时只返回 `rate limited`，较小时回显全部 canary。实际探测序列为 `50 → 100 → 75 → 87 → 85` 千字符；结果包含 `50/75=ok`、`85/87/100=error`。这说明如果直接照搬判据，会把限流变成看似精确的容量边界。

可借鉴粗扫、维护区间、缩小请求以及保存每次观察；需改为分别记录输入接受情况、明确超限、召回质量和无关错误。

## 4. RULER：预设长度下的能力评测，生成器二分不是 API 容量搜索

RULER 的[README](https://github.com/NVIDIA/RULER/blob/db43f92ff634bbce1c33d1fb15858aec4bba509a/README.md#L1-L55) 区分 claimed length 和 effective length；后者来自任务分数是否超过文中阈值。它评测检索之外的多类长上下文任务，而不是以 HTTP 接受或拒绝作为唯一标准。

运行脚本的[长度配置](https://github.com/NVIDIA/RULER/blob/db43f92ff634bbce1c33d1fb15858aec4bba509a/scripts/config_models.sh#L15-L25) 为 4K 到 128K 等预设档位，[主循环](https://github.com/NVIDIA/RULER/blob/db43f92ff634bbce1c33d1fb15858aec4bba509a/scripts/run.sh#L87-L130) 在各长度生成样本、调用模型、计算指标。

当前 [`niah.py`](https://github.com/NVIDIA/RULER/blob/db43f92ff634bbce1c33d1fb15858aec4bba509a/scripts/data/synthetic/niah.py#L233-L273) 虽有 `Binary search for optimal haystack size`，但判据是本地 tokenizer 的 `input tokens + tokens_to_generate <= max_seq_length`，目的是把样本填到已给定预算内。这段二分没有调用模型，也没有发现未知 API 容量。

原始 NeedleInAHaystack 项目的当前版本也[先生成长度、深度、seed 的笛卡尔积](https://github.com/gkamradt/LLMTest_NeedleInAHaystack/blob/021385d68d3202e37893e9d3cd29011c569abe30/needlehaystack/core/sweep.py#L29-L64)。其[请求重试](https://github.com/gkamradt/LLMTest_NeedleInAHaystack/blob/021385d68d3202e37893e9d3cd29011c569abe30/needlehaystack/core/runner.py#L167-L183) 对同一个 `user_prompt` 重试，并不在这里依据超限缩短长度。该修订为 `021385d68d3202e37893e9d3cd29011c569abe30`（2026-06-08 18:01:11 UTC）。

## 其他容易混淆的实现

- **Accelerate 自动降 batch**：[识别 OOM 和减小批量](https://github.com/huggingface/accelerate/blob/f47439c1fb24721ea71ab98f9b512726b5a97828/src/accelerate/utils/memory.py#L100-L193)，该版本默认每次乘 0.9。它寻找当前内存可执行的 batch size，不测接口上下文容量；其他异常继续抛出。修订时间为 2026-11-02 15:20:44 UTC。
- **vLLM 自动估计可装入 KV cache 的长度**：[`estimate_max_model_len`](https://github.com/vllm-project/vllm/blob/fd0c471b3a4c2446c44b2ba8b4699a42e181d7b2/vllm/v1/core/kv_cache_planning.py#L122-L173) 的二分判据是计算得到的内存需求是否不超过可用内存，不是远端 API 的请求接受情况。修订时间为 2026-11-08 20:39:23 UTC。
- **aider 历史摘要**：[`summarize_start`](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/base_coder.py#L1002-L1038) 与请求失败分支分开；[`ContextWindowExceededError` 分支](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/base_coder.py#L1457-L1466) 设置 exhausted 后退出，不宜概括成“aider 遇到上下文超限就自动缩短并重试”。修订时间为 2026-05-22 14:02:20 UTC。

## 对本项目的建议（设计推论，尚未实现）

LiteLLM 的错误归一化确实是可直接复用、持续维护的现成功能，不能将它描述成必须自己重写的功能。是否采用，应先决定运行位置。对于目前直接向所选站点发请求的浏览器扩展，建议先保留 AI SDK 的请求、流处理和 usage 适配，补足本地错误分类；如果已有或明确决定引入后端/本地服务，直接复用 LiteLLM 有减少规则维护的价值。Cline 本身也在 AI SDK 之上完成错误归一化与恢复，提供了另一种已实现的选择。

| 观察 | 能否自动尝试更小输入 | 能否记录为确认的容量上界 |
| --- | --- | --- |
| 明确的窗口超限代码，或已验证的输入 token 超限消息 | 可以，在请求次数和预算内降档；有成功下界后再二分 | 可以作为该次请求配置下的拒绝上界；需保留证据来源 |
| 只有疑似长度相关信息，如未经确认的 payload/字段长度限制 | 可以做少量、明确标记的探索性降档 | 不可以；更小请求成功也不能反推上次一定是模型窗口超限 |
| 401/403、限流/配额、普通 5xx、网络断开、取消 | 不以此更新容量区间；交由对应恢复或暂停规则 | 不可以 |
| 请求成功但 canary/needle 漏答 | 可作为另一类质量评测继续采样 | 不可以仅据此宣布截断或窗口上限 |

容量探测应同时保留：最大成功输入、最小明确拒绝输入、疑似失败、尚未到达边界，以及停止原因。输入与输出预算、协议、模型/路由、token 计量方法也需保持可比；服务端明示的“上限数字”可以指导下一次目标，但需分清它指输入上限还是输入加输出总预算。

这里的“成功”只建立本次观察的下界；如果网关会静默截断，HTTP 成功本身不足以证明完整输入均已处理。对可疑截断的质量检查应单独展示，不能把它与拒绝上界混为一项。

### LiteLLM 是否可以直接替换浏览器中的 AI SDK

已读取的固定版本 [README](https://github.com/BerriAI/litellm/blob/2f430873aead937b9112e683703956eb1ab179af/README.md#L45-L51) 列出两种主要方式：Python SDK 直接集成，或部署 AI Gateway/Proxy Server。官方 [JS/TS 接入示例](https://docs.litellm.ai/docs/tutorials/google_genai_sdk) 使用 JavaScript 客户端连接 LiteLLM Proxy；这不等于提供了一个可把完整 Python 错误归一化实现直接装进浏览器的等价 TS SDK。本次没有发现这样一个官方浏览器包，也未评估非官方同名包。

- [Exception Mapping](https://docs.litellm.ai/docs/exception_mapping) 明确提供 `ContextWindowExceededError`，并列出各 provider 的支持情况；并非所有 provider 的异常类别都全覆盖。
- [Proxy Error Reference](https://docs.litellm.ai/docs/proxy/error_reference) 说明网关返回 OpenAI-compatible 的错误体。采用 Proxy 后可以继续使用 AI SDK 作为 HTTP/流式客户端，二者可以组合，无需强制替换客户端。
- [Context Window Fallbacks](https://docs.litellm.ai/docs/proxy/reliability) 配置的是超限时转向另一模型/路由。它与“固定模型及请求配置、缩短合成输入并测量容量区间”不同。容量探测若采用网关，要明确控制 fallback、自动截断与额外重试，才能解释测得的是哪个请求路径的能力。

结论是有条件的：需要后端网关时，优先评估直接复用；保持纯扩展直连时，维护一个小而有证据覆盖的 TS 分类器更贴近当前部署。用户本轮讨论没有授权 SDK 迁移或部署代理服务。

### 后续实现的回归边界

原始 SSE 数值错误码、无 HTTP 状态但有明确上下文代码、嵌套错误、大小写/连续空白/换行变化，以及 Anthropic 明确输入超限消息，都应在确认错误来源后继续降低输入。相应反例包括字段字符数限制、仅声明窗口大小、每分钟 token 限流、鉴权失败、普通 5xx、请求取消、生成触及输出/总窗口限制和召回漏答。尚未新增或运行这些应用回归，本节是待实现方案。

## 追加：可以直接复用的 TypeScript 形式

用户进一步要求寻找无需 Proxy 的 TS 库或模块。结论需要补充：选择不止 LiteLLM 服务与从零自写；已有公开发布的 TS 分类器。以下核对了 npm 发布元数据和 tarball 的实际导出，不能把存在于 GitHub 的内部函数误称为公开包 API。

| 候选 | 已发布的 API | 接入判断 |
| --- | --- | --- |
| `@mariozechner/pi-ai@0.73.1` | 根入口导出 `isContextOverflow(message, contextWindow?)` 和 `getOverflowPatterns()` | 文档明确支持浏览器；单个 overflow 模块无运行时导入。可以复用分类能力，无需服务，但包本身还有多家 provider SDK，且没有独立 overflow 子路径。 |
| `@opencode/ai@2.2.6` | `@opencode/ai/route` 导出 `classifyProviderFailure({ message, status?, rawBody?, data?, ... })` | 公开、较完整的错误分类接口，无需服务。区分 context-overflow、payload-too-large、限流、鉴权等；适合做最小浏览器接入验证。 |
| `@cline/llms@0.2.0` | 主入口导出 `classifyProviderError(unknown)` | 与现有 AI SDK 7 很接近，但发布主入口含 Node 内建导入；现有 browser 入口没有导出该函数。适合补上游导出或按许可证复用模块。 |
| `litellm@0.12.0`（第三方 JS 实现） | `completion`、`embedding` | 不是 Python LiteLLM 异常映射的官方 TS 移植；本次检查未发现所需的跨提供商超限分类工具。 |

### Pi：发布版直接执行结果

核对 [npm 0.73.1 元数据](https://registry.npmjs.org/@mariozechner%2fpi-ai/0.73.1)、发布包 `dist/index.js`、`dist/utils/overflow.js` 和 README 的 Browser Usage。该发布版本的 gitHead 是 `781152fc24841dc54b22284514604048ebe5e2c9`；[对应源码](https://github.com/badlogic/pi-mono/blob/781152fc24841dc54b22284514604048ebe5e2c9/packages/ai/src/utils/overflow.ts) 与发布实现已对照，使用 [MIT 许可证](https://github.com/badlogic/pi-mono/blob/781152fc24841dc54b22284514604048ebe5e2c9/LICENSE)。README 明确说明 Bedrock 与 OAuth 登录有浏览器限制，不宜据此推断所有 provider 都可在浏览器使用。

从 [npm tarball](https://registry.npmjs.org/@mariozechner/pi-ai/-/pi-ai-0.73.1.tgz) 在内存读取原始 `overflow.js`，校验 SHA-1 `79d6e3b1431845ca4c0b469963c3b9d4f2aabdc3`，通过 Node ESM data URL 执行，没有修改函数或安装依赖。调用仅使用 `stopReason: "error"`、`errorMessage`，不传声明的 contextWindow，避免把元数据猜测混入观测。

| 输入 | 发布原函数返回 |
| --- | --- |
| 用户原始 maximum context length / requested 错误消息 | true |
| 同一消息在 However 前加入换行 | true |
| 序列化错误中明确的 `context_length_exceeded` | true |
| Anthropic `prompt is too long: ...` | true |
| Gemini `input token count ... exceeds the maximum ...` | true |
| `Rate limit exceeded: too many tokens per minute` | false |
| 无关参数错误，仅附带 `The maximum context length is 8192 tokens.` | true |
| 413 `request_too_large`，消息只表明请求大小限制 | true |
| `400 status code (no body)` | true |

9 个预期观察均被实际断言；这不等于 9 个场景都符合本项目的容量证明标准。它适合作为“可能需要缩短输入”的现成判断，其中后三类不能无条件记作确认的 token 容量上界。其对成功 usage 超过声明窗口、length 停止等附加判断也不能未经审查用于测未知模型容量。

打包边界：发布包解包约 4.26 MB，是完整包文件大小，**不是浏览器 bundle 增量**。根入口还导出 providers；包 exports 没有 `./utils/overflow`，不能推荐未经支持的 deep import。若只需要该模块，可以按 MIT 保留版权/许可证与来源后引入源码，并明确承担上游同步；也可以先验证直接依赖的实际 bundle。此次只运行了原始独立模块，没有声称完成整个包的浏览器打包验证。

### OpenCode：公开 route 分类器，不是只能复制内部代码

核对 [npm 2.2.6 元数据](https://registry.npmjs.org/@opencode%2fai/2.2.6)（发布于 2026-11-06），以及 tarball 中 `dist/route.js` → `dist/route/index.js` 的实际导出。参考固定源码 [provider-error.ts](https://github.com/anomalyco/opencode/blob/9e9b551e3a72b12b839ba3fe266a0db89c909602/packages/ai/src/provider-error.ts)、[route/index.ts](https://github.com/anomalyco/opencode/blob/9e9b551e3a72b12b839ba3fe266a0db89c909602/packages/ai/src/route/index.ts)、[package.json](https://github.com/anomalyco/opencode/blob/9e9b551e3a72b12b839ba3fe266a0db89c909602/packages/ai/package.json)。项目为 MIT。

可以使用公开的 `import { classifyProviderFailure } from "@opencode/ai/route"`。返回的 `_tag === "InvalidRequest"` 且 `classification === "context-overflow"` 表示其超限分类；`isContextOverflow` 本身不是可 deep import 的公开子路径。现有 AI SDK 只需做错误字段适配，不必因此更换发送请求的 SDK。

浏览器证据目前是静态分析：沿 route 发布入口扫描了 35 个包内模块，没有发现 `node:*`；外部依赖为 `effect`/子路径和 `@opencode/schema`/子路径。未继续验证完整外部依赖图，也未实际浏览器打包；完整包仍包含 AWS credentials、Google Auth 等依赖，不能称为轻量纯函数包。

语义也需审查：其 `request_too_large` 代码可先被分到 context-overflow；某些裸 400/413 与宽泛文本同样触发 overflow。虽然分类器具有 payload-too-large 类别，也不能假定所有字节限制都一定落入该类别。它服务于代理恢复，严格容量探测仍需保留原始证据及请求大小/窗口大小的区分。本次未执行该包分类器，只核对发布导出与实现。

### Cline 与第三方 LiteLLM JS 的具体限制

[`@cline/llms@0.2.0`](https://registry.npmjs.org/@cline%2fllms/0.2.0) 依赖 `ai ^7.0.136`。发布主入口确实包含 `node:async_hooks`、`node:crypto`、`node:fs`、`node:module`、`node:os`、`node:path`；发布 browser JS 和声明均未导出分类器。[源码主入口](https://github.com/cline/cline/blob/94eecbbe1a2f899c66b118d13656651b0a884e1f/sdk/packages/llms/src/index.ts) 与 [browser 入口](https://github.com/cline/cline/blob/94eecbbe1a2f899c66b118d13656651b0a884e1f/sdk/packages/llms/src/index.browser.ts) 已核对。npm 元数据没有 license 字段，仓库 [LICENSE](https://github.com/cline/cline/blob/94eecbbe1a2f899c66b118d13656651b0a884e1f/LICENSE) 为 Apache-2.0；源码复用需按该许可证处理。

[`litellm@0.12.0`](https://registry.npmjs.org/litellm/0.12.0) 发布于 2024-01-03，来自第三方 [zya/litellmjs](https://github.com/zya/litellmjs/blob/60076613a3389076e926e98314868874006428fd/src/index.ts)。它会直接调用 provider SDK，不能笼统说成 proxy-only wrapper，但并不提供本需求的现成分类工具。npm 标 ISC、仓库 LICENSE 为 MIT，存在许可证元数据不一致。另检查了 `@tanstack/ai@1.2.0`：它导出的 `CONTEXT_OVERFLOW_CODE` 和 `toRunErrorPayload` 是代码约定/载荷格式化，不是跨提供商超限检测器。

### 本项目的选择建议

优先在现有 AI SDK 外复用 TS 分类能力，避免为了这一功能引入代理服务或替换所有 provider 适配。希望通过依赖更新获取上游维护时，先对 OpenCode route 或 Pi 根入口做小范围浏览器打包与场景验证；希望最少依赖时，按许可证引入可追溯的单个分类模块，并显式维护来源版本与同步测试。两条路均可行，源码引入不能宣称免维护。

无论选择哪个库，“建议降低输入”与“确认容量拒绝上界”仍需由本项目分别判断。库输出可用于继续探测，不能用聊天压缩用的宽泛 overflow 规则直接证明模型硬上限。这一追加调查没有新增依赖、部署服务或修改应用行为。

## 本次验证与限制

- 实际执行：从固定 SHA 的 LiteLLM 源码通过 Python AST 提取该分类函数，并执行同修订测试文件的全部 28 个 `context_window_test_cases`，结果 28/28 通过。没有执行其完整项目测试套件。
- 实际执行：上述 api-relay-audit 限流 fake-client 复现；断言请求序列和结果状态均通过。未调用付费模型、未使用真实 API key。
- Cline、RULER 等其他项目读取了固定源码和对应测试内容；没有把“存在测试”写成“本次运行已通过”。
- 这是有界源码调查。没有据此断言“其他项目都不做真正容量搜索”，也没有把检索质量失败、OOM 或所有 400/413/422 当作同一种超限。

留存：本文件包含后续分类器与探测状态设计所需的协议适配先例、已排除的推论和固定源码证据，应随研究任务保存在 Git。实验代码仅在内存中执行，没有生成额外持久文件。
