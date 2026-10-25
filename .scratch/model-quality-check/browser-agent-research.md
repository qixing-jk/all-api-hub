# 浏览器 Agent 执行环境调研

调研日期：2026-10-25。用于决定绘图测试的基础 Agent 环境；本轮只读上游文档和源码，没有运行这些产品，也没有验证它们在本扩展的 CSP、后台生命周期或全部浏览器中的兼容性。

## LangChain Deep Agents：通用代码工具与显式能力桥接

核对版本：[`deepagentsjs` 的 `144abf243d9766d141e01d384217382903b544ba`](https://github.com/langchain-ai/deepagentsjs/tree/144abf243d9766d141e01d384217382903b544ba/libs/providers/quickjs)。对应的是 JavaScript 包 `@langchain/quickjs`，不要与 Python `langchain-quickjs` 的 PyO3/Rust 实现混淆。

- **已核实的执行结构**：middleware 注册通用 JS/TS REPL 工具，模型提交代码，由 QuickJS-NG/WASM 执行；宿主读取值、错误和捕获的 console 输出，再返回模型。源码默认工具名是 `eval`，并非 README 所说的 `js_eval`。TypeScript 先经过 AST 转换。[middleware 源码](https://github.com/langchain-ai/deepagentsjs/blob/144abf243d9766d141e01d384217382903b544ba/libs/providers/quickjs/src/middleware.ts)、[转换源码](https://github.com/langchain-ai/deepagentsjs/blob/144abf243d9766d141e01d384217382903b544ba/libs/providers/quickjs/src/transform.ts)。
- **能力与文件边界**：当前源码的默认 REPL 是纯计算环境；文件及其他 I/O 使用 Agent 正常工具。显式配置 PTC 工具列表后，代码可通过 `await tools.readFile({ path: ... })` 等桥接调用这些工具。不是直接给 JS 浏览器全局对象或真实宿主文件系统。当前 `types.ts` 的 `ptc` 是工具名称/实例数组；不能照 README 的旧版 `ptc: true` 示例直接接入。[middleware](https://github.com/langchain-ai/deepagentsjs/blob/144abf243d9766d141e01d384217382903b544ba/libs/providers/quickjs/src/middleware.ts)、[类型](https://github.com/langchain-ai/deepagentsjs/blob/144abf243d9766d141e01d384217382903b544ba/libs/providers/quickjs/src/types.ts)。
- **状态与并发**：同一运行内复用 REPL 状态，session key 由 `thread_id` 和 middleware ID 组成；`afterAgent` 删除 session，因此不应把它描述为跨所有后续 invoke 永久保留变量。宿主桥接通过 QuickJS Promise 与宿主异步函数互通，代码可使用 `Promise.all`。所有 `evalCodeAsync` 通过共享队列串行，满足 Asyncify 每个 module 同时只允许一次异步执行的约束。[session](https://github.com/langchain-ai/deepagentsjs/blob/144abf243d9766d141e01d384217382903b544ba/libs/providers/quickjs/src/session.ts)、[middleware](https://github.com/langchain-ai/deepagentsjs/blob/144abf243d9766d141e01d384217382903b544ba/libs/providers/quickjs/src/middleware.ts)。
- **限制与反馈**：源码默认内存 64 MiB、栈 320 KiB、每次执行 5 秒、每次最多 256 次 PTC 调用，结果/日志有 4000 字符限制。通过 QuickJS interrupt handler 中断解释器计算，并分别处理结果、异常、Promise 成功/失败和超时。这些限制是运行时事实；README 中 50 MB、30 秒的数字已与该提交源码不同。[session](https://github.com/langchain-ai/deepagentsjs/blob/144abf243d9766d141e01d384217382903b544ba/libs/providers/quickjs/src/session.ts)、[输出格式](https://github.com/langchain-ai/deepagentsjs/blob/144abf243d9766d141e01d384217382903b544ba/libs/providers/quickjs/src/utils.ts)。
- **浏览器支持的证据边界**：引擎是 WASM，代码中也有浏览器构建使用者的明确反馈，但这不等于完整框架已通过本项目浏览器验证。上游 [#553](https://github.com/langchain-ai/deepagentsjs/issues/553) 报告浏览器缺少 `AsyncLocalStorage` 时，未传递 graph config 的 PTC 路径出错；核对时 issue 仍为 open，当前 `session.ts` 的 PTC 桥接仍有 `t.invoke(rawInput)`。不能仅凭 README 宣称即插即用。

**对本项目的推断**：最值得借鉴的是“普通文件工具 + 通用代码执行 + 明确输入输出 + 有界状态与预算”，可以用本项目现有 AI SDK 编排，不必为几个工具引入整套 LangGraph/Deep Agents。若采用 QuickJS，应把宿主异步 I/O 的超时、取消和副作用单独管理；解释器计算超时并不会自动撤销已发起的宿主操作。

## Mozilla.ai Wasm Agents：编排在浏览器，不等于开放任意代码执行

核对版本：[`wasm-agents-blueprint` 的 `07aff36f2b172e4ae415601b231c1bfe536914e7`](https://github.com/mozilla-ai/wasm-agents-blueprint/tree/07aff36f2b172e4ae415601b231c1bfe536914e7)。

- **已核实的执行结构**：网页加载 Pyodide，在浏览器 WASM 中运行 Python 和 OpenAI Agents SDK；推理仍通过外部 OpenAI 兼容 API，包括本机 Ollama/LM Studio。这里“本地 Agent”指编排和工具在浏览器，不保证模型推理也在网页里。[项目 README](https://github.com/mozilla-ai/wasm-agents-blueprint/blob/07aff36f2b172e4ae415601b231c1bfe536914e7/README.md)。
- **工具设计**：`tool_calling.html` 在宿主预先定义 Python `function_tool`，提供字符计数和下载网页并转 Markdown；最后通过 `Runner.run(...)` 执行循环。没有在这一 demo 中找到让模型任意提交 JS/Python 的 REPL 或虚拟工作区工具，因此它不能作为“模型自主运行检查脚本”的现成实现。[demo 源码](https://github.com/mozilla-ai/wasm-agents-blueprint/blob/07aff36f2b172e4ae415601b231c1bfe536914e7/demos/tool_calling.html)。
- **浏览器约束**：首次需要下载 Python 包；demo 因 Pyodide 线程兼容问题关闭 SDK tracing，网页下载也受 CORS 限制。上游 README 的关闭跨源限制建议只说明其 demo 的约束，不作为本扩展的部署方案。[demo 源码](https://github.com/mozilla-ai/wasm-agents-blueprint/blob/07aff36f2b172e4ae415601b231c1bfe536914e7/demos/tool_calling.html)、[故障排查](https://github.com/mozilla-ai/wasm-agents-blueprint/blob/07aff36f2b172e4ae415601b231c1bfe536914e7/README.md#troubleshooting)。

**对本项目的推断**：我们的现有 TypeScript/AI SDK 已能承担模型请求和工具循环，无需为了浏览器 Agent 专门搬入 Pyodide/Python。应把“编排运行在哪里”“模型推理在哪里”“模型生成代码在哪里执行”分别说明，避免以“浏览器 Agent”一个词掩盖不同能力。

## llama.cpp WebUI：原生 JavaScript Worker

核对版本：`b3fa69955ea81c3b60e77e3c1e2224c4a826ffb9`。

- 向模型暴露 `run_javascript(code, timeout_ms)`，代码通过 `AsyncFunction` 在 Worker 内运行，支持顶层 await 和 return。宿主把 console、返回值、异常转为工具结果。[工具定义](https://github.com/ggml-org/llama.cpp/blob/b3fa69955ea81c3b60e77e3c1e2224c4a826ffb9/tools/ui/src/lib/utils/sandbox-tool.ts)、[Worker](https://github.com/ggml-org/llama.cpp/blob/b3fa69955ea81c3b60e77e3c1e2224c4a826ffb9/tools/ui/src/lib/services/sandbox-worker.js)。
- 每次执行创建一次性 `sandbox="allow-scripts"` iframe，在其 opaque origin 下创建 Blob Worker。CSP 为 `default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; worker-src blob:`，通过网络策略限制出站访问；Worker 避免模型代码阻塞页面主线程。宿主在完成、超时或取消时移除 iframe。[harness](https://github.com/ggml-org/llama.cpp/blob/b3fa69955ea81c3b60e77e3c1e2224c4a826ffb9/tools/ui/src/lib/services/sandbox-harness.ts)、[service](https://github.com/ggml-org/llama.cpp/blob/b3fa69955ea81c3b60e77e3c1e2224c4a826ffb9/tools/ui/src/lib/services/sandbox.service.ts)。
- 默认执行 10 秒、最多 30 秒，最终文本输出截到 8192 字符。这里的截断发生在收集日志之后，不能当作日志生成期间的内存上限。所查源码没有独立 VFS 或解释器堆内存预算。[常量](https://github.com/ggml-org/llama.cpp/blob/b3fa69955ea81c3b60e77e3c1e2224c4a826ffb9/tools/ui/src/lib/constants/sandbox.constants.ts)、[service](https://github.com/ggml-org/llama.cpp/blob/b3fa69955ea81c3b60e77e3c1e2224c4a826ffb9/tools/ui/src/lib/services/sandbox.service.ts)。
- 上游测试包含普通执行、网络被阻断和 `while (true) {}` 超时；本轮只读这些测试，没有执行它们。[测试](https://github.com/ggml-org/llama.cpp/blob/b3fa69955ea81c3b60e77e3c1e2224c4a826ffb9/tools/ui/tests/client/sandbox.service.svelte.test.ts)。

**对本项目的推断**：这是轻量原生 JS 路线的直接参考，额外提供本次运行的 VFS 即可形成基础工作区。但扩展环境的 CSP、沙箱页、后台无 DOM 与不同浏览器仍需接入验证，不能照搬普通网页的 srcdoc 方案就宣布可用。

## Cloudflare Code Mode：让代码组合工具

核对版本：`321814b6c13f72cff82161e7eb20312574ac9b7a`。

- 将宿主工具的类型描述交给模型，模型写一段 async 函数组合调用这些工具；运行环境中的 Proxy 把调用送回宿主，宿主按 provider 和工具名派发，再把结果返给代码。工具循环与代码执行器是两个可替换部分。[设计文档](https://github.com/cloudflare/agents/blob/321814b6c13f72cff82161e7eb20312574ac9b7a/docs/agents/codemode.md)、[iframe runtime](https://github.com/cloudflare/agents/blob/321814b6c13f72cff82161e7eb20312574ac9b7a/packages/codemode/src/iframe-runtime.ts)。
- 浏览器执行器使用一次性 sandbox iframe、限制性 CSP、postMessage。宿主检查消息 source、每次执行的 nonce、provider 及工具白名单，返回日志/结果/错误。另一个 DynamicWorkerExecutor 在 Cloudflare Workers 上执行，不能与浏览器 Web Worker 混称。[iframe executor](https://github.com/cloudflare/agents/blob/321814b6c13f72cff82161e7eb20312574ac9b7a/packages/codemode/src/iframe-executor.ts)。
- 浏览器 iframe 默认超时 30 秒，但官方明确说明无法抢占紧密同步循环；定时器并不等于强制终止执行。[设计文档](https://github.com/cloudflare/agents/blob/321814b6c13f72cff82161e7eb20312574ac9b7a/docs/agents/codemode.md)。

**对本项目的推断**：借鉴显式桥接与工具组合即可，不宜为一个基础模型测试引入完整框架。若采用浏览器原生执行，应补 Worker 隔离；若采用 QuickJS，应补解释器预算与宿主取消管理。

## Bolt 开源示例 / WebContainers：完整项目环境

核对开源示例版本：`eda10b121221b30825a4c16eec5da1fd3eb1eb99`；不把该示例当作商业 Bolt 当前完整实现。

- 示例从模型回复中解析 `<boltArtifact>`、`<boltAction>`，把 file 和 shell 动作交给 ActionRunner。文件动作调用 WebContainer 文件系统，shell 动作通过 `spawn('jsh', ['-c', ...])` 执行，并维护 pending/running/complete/aborted/failed 状态。[消息解析器](https://github.com/stackblitz/bolt.new/blob/eda10b121221b30825a4c16eec5da1fd3eb1eb99/app/lib/runtime/message-parser.ts)、[执行器](https://github.com/stackblitz/bolt.new/blob/eda10b121221b30825a4c16eec5da1fd3eb1eb99/app/lib/runtime/action-runner.ts)。这也说明 native function calling 不是 Agent 的唯一实现方式；文本动作协议同样可以实际执行，关键要区分普通最终回复与可执行动作。
- WebContainers 提供浏览器内 Node 兼容运行环境、内存文件系统、进程执行和服务预览；需要 SharedArrayBuffer 及跨源隔离配置。官方浏览器支持页标注 Chromium 完整支持，Firefox/Safari 为 beta。[quickstart](https://webcontainers.io/guides/quickstart)、[浏览器支持](https://webcontainers.io/guides/browser-support)。
- API 在商业营利生产环境的使用有许可要求；原型/POC 不要求商业许可。这是后续选择该路线时需核对的边界，本轮不判断本项目是否落在该范围。[商业使用](https://webcontainers.io/enterprise)。

**对本项目的推断**：适合安装 npm 包、启动开发服务和预览整个项目的场景。对于 SVG 产物和检查脚本，先上该环境会增加接入面；只有明确需要 Node/npm/终端契约时才值得采用。

## 对当前功能的建议与待验证项

建议先采用现有 AI SDK 编排，组合 `list_files`、`read_file`、`write_file`、`edit_file` 与通用 `execute_js`。所有文件状态在单次测试内共享、不同测试之间隔离。执行结果保留 stdout、返回值与异常，让模型自行编写检查逻辑，不提供 `validate_svg` 专用模型工具。应用仍负责最终产物的安全预览；只读代码或断言通过不代表模型已经看过画面。

运行环境的候选是 QuickJS/WASM（计算、内存和栈预算）与受限原生 Worker（原生 JS、独立线程）；两者不是互斥层级，也可把 QuickJS 放入 Worker，但需实测包体积、加载方式和后台取消路径再定。不可仅靠一个 Promise timeout 宣称已终止计算。

本地检查发现 `src/public/sandbox.html` 属于 Browser API Lab，显式提供 `chrome` / `browser` 宿主 API 代理；它不应直接复用为模型代码执行环境。`wxt.config.ts` 的 extension CSP 已允许 `wasm-unsafe-eval`，但这只说明现有策略的一部分，不证明完整 QuickJS 集成已通过。[Chrome 沙箱页官方说明](https://developer.chrome.com/docs/extensions/how-to/security/sandboxing-eval)也区分扩展高权限环境与隔离沙箱环境。

验收应包含多轮工具反馈、文件修改后读回、最终文件产物、失败后恢复、同步死循环、输出/内存上限、用户停止、测试间隔离，以及普通回复模式保持原有语义。未调用工具或未写目标文件时，应报告实际结果，不能自动回退后把它记作 Agent 成功。

## 本轮保留范围

本文件保留上游固定提交、README/源码差异、环境的语义边界及接入限制，是**实现前的调研快照**，不是兼容性验收报告。仍未运行上游样例或第三方 API，也未验证这些产品在本扩展的 CSP、后台生命周期、完整包体积和扩展商店政策下的表现；后续接入需要在本扩展内验证，而不是把上游声称的浏览器支持当作本地验证结果。上一轮浏览器基线截图保留在本地忽略目录 `test-results/agent-baseline/`。

> **后续进展**：本文件建议的“现有 AI SDK 编排 + 文件工具 + QuickJS/WASM 通用执行”已随绘图测试落地，虚拟文件、有界执行预算与多轮工具反馈的验收见 `tests/services/modelQuality/pelican.test.ts`。上文的实现状态描述保留为调研时点的记录，不再代表当前代码状态。
