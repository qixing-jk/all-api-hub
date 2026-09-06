# 模型验证：流式模式兼容性调查

核查日期：2026-09-07。以下为当日读取的公开源码快照；链接固定到具体提交。未运行这些外部项目，也未审计其全部自定义供应商插件。

调查结论：初版 HTTP 400/422 加报错文案的匹配能覆盖已复现故障，但作为通用流式需求判断过于脆弱。本地 SDK 实验已确认，相同文案放进 `detail` 字段就会漏判。LiteLLM 与 CLIProxyAPI 对已知上游按 provider 和具体端点约束主动选择模式，再把流式结果聚合给非流式调用方。未知兼容网关仍需有证据支持的错误分类或显式配置；本次未找到可以普遍套用的模式需求探测机制。

## 已确认并实现的方案

用户已确认采用显式测试方式选择。以下是本次实现；后文的错误驱动回退仅保留为调查过程记录。

- 单模型验证、API 凭据验证、批量模型测试、网页 API 测试和 CLI 兼容性验证均提供 **流式 / 非流式** 两个选项，默认流式。
- OpenAI 兼容 Chat Completions、OpenAI Responses、Anthropic 和 Google 的生成类探测均执行所选方式。模型列表获取不受影响。
- 删除基于 HTTP 状态码和报错文案的自动模式切换。请求被拒绝后保留失败，由用户选择另一种方式重测；不增加“同时测试两种方式”。
- 生成类结果及新保存的历史记录携带所用方式。旧记录没有方式字段时不推断或补标默认值。
- 网页的接口类型和测试方式复用项目下拉控件，选项保留在页面浮层的弹出层容器内。网页到后台的请求传递所选方式；保存验证记录时保留结果中记录的方式。
- CLI 兼容性验证沿用每个 CLI 对应的接口类型进行工具调用探测，所选方式决定请求模式；Gemini 的结果详情相应标明 generateContent 或 streamGenerateContent。此功能仍是协议模拟，不会启动外部 CLI。
- 流式响应完整聚合后核验，保留原始供应商错误和取消语义；选择非流式时调用非流式 SDK 路径。
- 使用实际 AI SDK 与合成 HTTP/SSE 响应验证四类 API 的请求方式和拒绝后不切换模式，不将其描述为用户站点实测。

## 客户端调用方式调查

| 项目与源码快照 | 已核实的调用方式 | 与模式回退有关的边界 |
| --- | --- | --- |
| OpenCode，`337fd144d2ba144743368f78d9579a99cce175bd` | 会话默认执行 [`streamText`](https://github.com/anomalyco/opencode/blob/337fd144d2ba144743368f78d9579a99cce175bd/packages/opencode/src/session/llm.ts#L276-L293)。 | 所查入口的 [fallback](https://github.com/anomalyco/opencode/blob/337fd144d2ba144743368f78d9579a99cce175bd/packages/opencode/src/session/llm.ts#L224-L280) 是可选 native runtime 不支持时改用 AI SDK；两侧仍是流式。 |
| Cline，`dac3b35ba485dbab3b5a73aca239b0d07ce071cf` | 通用 AI SDK provider 执行 [`streamText`](https://github.com/cline/cline/blob/dac3b35ba485dbab3b5a73aca239b0d07ce071cf/sdk/packages/llms/src/providers/ai-sdk.ts#L2208-L2222)；OpenAI provider 选择 [`provider.responses(modelId)`](https://github.com/cline/cline/blob/dac3b35ba485dbab3b5a73aca239b0d07ce071cf/sdk/packages/llms/src/providers/vendors/openai.ts#L84-L95)。 | 空输出或尚无输出的瞬时网络中断会重新执行同一 `doStream()`；见下文。 |
| Cherry Studio，`67418b8730d14006d8c83f6d100c4392823509f7` | 文本模型健康检查调用 [`this.generateText({ system: 'test', prompt: 'hi', reasoningEffort: 'none' })`](https://github.com/CherryHQ/cherry-studio/blob/67418b8730d14006d8c83f6d100c4392823509f7/src/main/ai/AiService.ts#L1248-L1259)，最终进入 [`aiAgent.generate`](https://github.com/CherryHQ/cherry-studio/blob/67418b8730d14006d8c83f6d100c4392823509f7/src/main/ai/runtime/aiSdk/Agent.ts#L155-L177)；聊天入口使用 [`agent.stream`](https://github.com/CherryHQ/cherry-studio/blob/67418b8730d14006d8c83f6d100c4392823509f7/src/main/ai/AiService.ts#L657-L668)。 | 流式开关来自 [`assistant.settings?.streamOutput !== false`](https://github.com/CherryHQ/cherry-studio/blob/67418b8730d14006d8c83f6d100c4392823509f7/src/main/ai/runtime/aiSdk/params/capabilities.ts#L88-L90)；用户关闭流式后，通过 [`simulateStreamingMiddleware`](https://github.com/CherryHQ/cherry-studio/blob/67418b8730d14006d8c83f6d100c4392823509f7/src/main/ai/runtime/aiSdk/params/features/simulateStreaming.ts#L4-L26) 将非流式结果适配为流。这是显式用户设置，不是自动探测模型能力。 |

已查到的重试机制与请求模式协商需要分别理解：

- OpenCode 的 [重试条件](https://github.com/anomalyco/opencode/blob/337fd144d2ba144743368f78d9579a99cce175bd/packages/opencode/src/session/retry.ts#L85-L98) 判断可重试错误、5xx 和临时错误消息，随后执行退避策略。这段代码未改变 `stream` 模式。
- Cline 的 [流式中间件](https://github.com/cline/cline/blob/dac3b35ba485dbab3b5a73aca239b0d07ce071cf/sdk/packages/llms/src/providers/middleware/retry-empty-response.ts#L290-L307) 首次调用 `doStream()`；[网络重试](https://github.com/cline/cline/blob/dac3b35ba485dbab3b5a73aca239b0d07ce071cf/sdk/packages/llms/src/providers/middleware/retry-empty-response.ts#L357-L403) 与[空响应重试](https://github.com/cline/cline/blob/dac3b35ba485dbab3b5a73aca239b0d07ce071cf/sdk/packages/llms/src/providers/middleware/retry-empty-response.ts#L418-L456) 仍调用 `doStream()`。网络重试要求尚未输出内容、未取消；这不是改用 `doGenerate()`。
- Cherry Studio 的 [retry/fallback 策略](https://github.com/CherryHQ/cherry-studio/blob/67418b8730d14006d8c83f6d100c4392823509f7/src/main/ai/runtime/aiSdk/retry/createRetryableWrap.ts#L111-L140) 先按 `isRetryable(true)` 在同模型重试，再尝试用户配置的其他模型。模型健康验证不应照搬跨模型回退，否则成功结果可能属于另一个模型。

在上述入口和中间件中，没有找到针对 `Stream must be set to true` 自动执行“非流式 → 流式”的分支。这是有边界的源码观察，不代表这些项目全部调用路径都没有模式兼容逻辑，也不能据此认定应用层不应实现它。

Cline 有直接可复用的原始错误处理原则：先在 [`onError` 保存供应商错误](https://github.com/cline/cline/blob/dac3b35ba485dbab3b5a73aca239b0d07ce071cf/sdk/packages/llms/src/providers/ai-sdk.ts#L2249-L2252)，再在 [`catch` 优先使用该错误](https://github.com/cline/cline/blob/dac3b35ba485dbab3b5a73aca239b0d07ce071cf/sdk/packages/llms/src/providers/ai-sdk.ts#L2296-L2301)。源码说明如下：

```ts
// ai-sdk.ts:2298-2300
// Prefer the real provider error captured in onError over the generic
// NoOutputGeneratedError that the AI SDK throws when 0 steps are recorded.
const captured = capturedError.current ?? captureStreamError(error);
```

早期 All API Hub 修复的覆盖范围（已由文首显式模式方案替代），属于当时的工程判断，并非声称三个项目都采用同样策略：

1. 维持已有非流式验证入口和现有 Anthropic 流式入口。仅在 SDK `APICallError` 的 HTTP 400/422 明确指出必须启用流式时，同一端点、模型、凭据和语义参数改用 `streamText` 一次。
2. 错误识别要指向 `stream=true` 的具体要求，例如 `Stream must be set to true`；单纯出现 `stream`、一般 400、`stream_options` 不支持等信息不足以触发。
3. 鉴权失败、限流、一般网络故障、取消和流中途失败继续按各自原语义处理。两次请求共用取消信号和总体时间预算；成功必须消费并核验流的实际结果。
4. 保留 `onError` 中的真实 API 错误，防止最终聚合时的 `NoOutputGeneratedError` 遮住 403 等有效诊断。第一次的模式拒绝可作为尝试记录，最终失败应准确反映流式尝试的失败原因。
5. 暂不增加持久模式缓存、跨端点或跨模型回退。单向补偿已经覆盖本次明确拒绝；未来反向补偿应由真实错误样本和独立回归用例驱动。

该早期方案的代价是仅支持流式的接口每次验证多一次被拒请求的延迟；收益是已支持非流式的接口保持现有行为，同时兼容明确要求流式的接口。它仍无法自动覆盖所有错误文案、错误状态码或 HTTP 200 空结果的非标准服务。

## 已知上游的主动传输适配

以下两个上游适配器根据已知 provider 的接口约束主动启用流式，并支持向非流式调用方返回聚合结果。

| 项目与固定提交 | 如何决定上游模式 | 如何满足非流式调用方 |
| --- | --- | --- |
| LiteLLM，`eeb7732fc11fd47762ca84cc3fb7cc74235d7097` | [`ChatGPTResponsesAPIConfig`](https://github.com/BerriAI/litellm/blob/eeb7732fc11fd47762ca84cc3fb7cc74235d7097/litellm/llms/chatgpt/responses/transformation.py#L35-L42) 明确属于 `CHATGPT` provider；[请求转换直接设置 `request["stream"] = True`](https://github.com/BerriAI/litellm/blob/eeb7732fc11fd47762ca84cc3fb7cc74235d7097/litellm/llms/chatgpt/responses/transformation.py#L64-L91)，没有先发送非流式探测。 | [响应转换器](https://github.com/BerriAI/litellm/blob/eeb7732fc11fd47762ca84cc3fb7cc74235d7097/litellm/llms/chatgpt/responses/transformation.py#L109-L148) 根据 `Content-Type: text/event-stream` 或 `event:`/`data:` 正文特征识别 SSE；[收集 output item/text done 与 response.completed](https://github.com/BerriAI/litellm/blob/eeb7732fc11fd47762ca84cc3fb7cc74235d7097/litellm/llms/chatgpt/responses/transformation.py#L150-L197)，构造完整 Responses 返回值；非 SSE 则走父类 JSON 解析。 |
| CLIProxyAPI，`c76dfd4e0edabab9000628b1560ab8ab379eadb8` | [`CodexExecutor.Identifier()`](https://github.com/router-for-me/CLIProxyAPI/blob/c76dfd4e0edabab9000628b1560ab8ab379eadb8/internal/runtime/executor/codex_executor.go#L5-L13) 标识为 `codex`；[非流式 Execute 入口也直接设置 `stream=true`](https://github.com/router-for-me/CLIProxyAPI/blob/c76dfd4e0edabab9000628b1560ab8ab379eadb8/internal/runtime/executor/codex_executor_execute.go#L21-L57)，并以 [流式 Accept 发送 /responses](https://github.com/router-for-me/CLIProxyAPI/blob/c76dfd4e0edabab9000628b1560ab8ab379eadb8/internal/runtime/executor/codex_executor_execute.go#L76-L84)。 | [读取 SSE、收集 output_item.done](https://github.com/router-for-me/CLIProxyAPI/blob/c76dfd4e0edabab9000628b1560ab8ab379eadb8/internal/runtime/executor/codex_executor_execute.go#L126-L166)，在 completed/incomplete 事件后 [补全输出并 TranslateNonStream](https://github.com/router-for-me/CLIProxyAPI/blob/c76dfd4e0edabab9000628b1560ab8ab379eadb8/internal/runtime/executor/codex_executor_execute.go#L168-L185)。此路径按 `data:` 解析，不靠 Content-Type 来决定是否重试。 |

关键源码摘录：

```python
# LiteLLM transformation.py:86-87
request["store"] = False
request["stream"] = True
```

```go
// CLIProxyAPI codex_executor_execute.go:57
body = helps.SetBoolIfDifferent(body, "stream", true)
// 同文件:180，返回非流式格式
out := sdktranslator.TranslateNonStream(ctx, to, responseFormat, req.Model, originalPayload, body, clientCompletedData, &param)
```

这些机制的含义需要区分：

- **provider/endpoint 约束**负责请求前选择传输模式。CLIProxyAPI 对 [`/responses/compact` 反而删除 stream](https://github.com/router-for-me/CLIProxyAPI/blob/c76dfd4e0edabab9000628b1560ab8ab379eadb8/internal/runtime/executor/codex_executor_execute.go#L225-L236)，因此不宜把规则扩大到同一 provider 的所有端点。
- **Content-Type 与 SSE 正文识别**负责选择已收到响应的解析器；LiteLLM 在这里没有再次请求，也没有通过 MIME 判断服务器是否拒绝非流式。
- **error.code、error.param、HTTP status、message**没有参与这两个已展示路径的 `stream=true` 决策。CLIProxyAPI 的 [非 2xx 分支](https://github.com/router-for-me/CLIProxyAPI/blob/c76dfd4e0edabab9000628b1560ab8ab379eadb8/internal/runtime/executor/codex_executor_execute.go#L114-L125) 返回错误；LiteLLM 的 [流式失败事件解析](https://github.com/BerriAI/litellm/blob/eeb7732fc11fd47762ca84cc3fb7cc74235d7097/litellm/llms/chatgpt/responses/transformation.py#L189-L221) 提取失败信息。这些是错误传播，不是错误驱动的模式协商。
- **SSE 聚合**使“调用方需要一个完整结果”与“上游必须使用流式传输”可以同时成立。LiteLLM 的 [测试源码](https://github.com/BerriAI/litellm/blob/eeb7732fc11fd47762ca84cc3fb7cc74235d7097/tests/test_litellm/llms/chatgpt/responses/test_chatgpt_responses_transformation.py#L165-L201) 和 CLIProxyAPI 的 [Stream:false 测试源码](https://github.com/router-for-me/CLIProxyAPI/blob/c76dfd4e0edabab9000628b1560ab8ab379eadb8/internal/runtime/executor/codex_executor_stream_output_test.go#L21-L55) 都明确覆盖这种形式；本次只读取，未运行。

本地 SDK 实验（已运行合成 HTTP 400 响应，非用户站点实测）：在 `ai@6.0.16` + `@ai-sdk/openai@3.0.7` 中，`{error:{message:'Stream must be set to true'}}` 产生保留原文的 `APICallError.message`，且有 `data`；同一句话包在 `{detail:'Stream must be set to true'}` 中时，`message` 变为 `Bad Request`，`data` 缺失；两者 `responseBody` 都保留。这说明即使文案相同，只检查 SDK `error.message` 也会漏掉错误信封变体。当前本地 `node_modules/@ai-sdk/openai/dist/index.mjs:26-40` 定义 OpenAI 的 `error.message` 信封；`node_modules/@ai-sdk/provider-utils/dist/index.js:2405-2457` 在解析失败时使用 `statusText`，但保留响应体。

调查阶段对 All API Hub 提出的候选建议（最终采用文首的显式模式选择，不继续实现错误驱动回退）：

1. 若调用上下文确实知道上游 provider 与端点约束，把传输要求放在该适配器或配置的直接所有者中，在首次请求时选择正确模式。不要仅凭模型名包含 Codex、顶层站点类型或使用 Responses API 就推定实际后端。
2. 对上游隐藏在兼容网关之后的验证，保留有边界的错误驱动回退作为补偿，但将“识别明确模式要求”与“执行另一个模式一次”分开。可使用已验证的结构化错误语义，并以有真实样本覆盖的 message 规则补充；只出现 `param: stream` 或一般 400，仍无法区分“必须 true”“必须 false”“值类型错误”。本次两个样本没有给出可直接照搬的统一 stream-required 错误码。
3. 如果服务器已经返回成功的 SSE，优先考虑消费、聚合该响应；把它误判为普通 JSON 解析失败后再发请求，会增加一次请求。是否纳入当前修改取决于 SDK/transport 的现有边界，应与“明确拒绝后重试”分开验证。
4. 延续前文的同模型、同端点、一次补偿、共同取消/时间预算及真实错误保留原则。400/422 加单句报错的现有实现应标明为首版覆盖范围，不宜描述为最大兼容性方案。

这两个实现证明已知上游适配可以不依赖报错文案；它们没有证明未知兼容网关都能被请求前识别，也没有展示可直接复用的通用错误驱动模式回退。本次结论限于所检查的路径，不据此断言全部客户端或协议都没有其他机制。

## HTTP 400/422 的依据与边界

已读取 HTTP 语义规范：

- [RFC 9110 §15.5.1：400 Bad Request](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.5.1) 表示服务器因其认为的客户端错误而不能或不愿处理请求，示例包括请求语法、消息格式和路由问题。
- [RFC 9110 §15.5.21：422 Unprocessable Content](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.5.21) 表示内容类型和语法均可理解，但无法处理其中的指令。

选择 400/422 是把常见请求校验错误纳入候选范围的工程取舍，HTTP 规范没有赋予它们流式模式不匹配的含义。排除 401/403、429 和 5xx，也不能反过来证明剩下的 400/422 应切换模式；客户端尚未收到生成内容同样不能证明上游尚未执行或计费。

对话中进一步提出的“流式优先，400/422 且尚无输出时尝试非流式一次”是已放弃的候选试探策略，尚无所查项目采用这套完整规则的源码证据，也未在本项目实现验证。它不应被描述为已有项目的通用做法或已验证的更佳兼容方案。早期提交采用的“状态码加明确要求流式的文案”条件也已删除，两者均不属于最终方案。

可以从已有项目直接借鉴的是已知 provider/endpoint 的主动适配和显式模式配置。未知网关若要分别测试两种模式，应把它作为明确的诊断行为，并保留每种模式的结果；仅凭 HTTP 状态码自动推断模式要求缺乏依据。
