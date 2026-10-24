# 增强 CLI 请求模拟：可复现特征清单

调查日期：2026-10-24。范围：现有用户 API Key / 自定义 URL 测试；`requestProfileEnhanced?: boolean` 默认关闭。这里只补充请求特征研究，不修改产品代码，不操作站点。

版本证据沿用 [research.md](./research.md)：Codex `rust-v0.164.0` / `6aaac694803004a63c6f393d153c96d22521a6b9`，Gemini CLI `v0.65.0` / `6006c14a4decfe4b891c6263ad6ad5992e404b5b`，CLIProxyAPI `8289ec4c71ad914d0612c2776352b76ba3d355a6`，Sub2API `37067e8e340e9440d173a92b4faa05e8ce58368f`。实际捕获为 `artifacts/client-capture/claude.json`、`codex.json`，仅用于本地开发证据，不提交完整原始 prompt。

## 结论与共同约束

增强模式可增加明确、相互一致的 SDK 头、短身份前缀、独立环境块、会话与缓存 metadata；现有探针的用户提示词、`verify_tool` 名称/schema、`tool_choice`、流式选择和判定逻辑继续拥有测试语义。不得为“像客户端”而附加没有执行能力的 shell / filesystem / search 工具。`tool_choice:required` 允许模型调用任一工具，添加其他工具会改变原测试成功条件；Claude 本次真实抓包 `tools:[]` 本身证明空工具集合可以是合法客户端请求。

可观察结果需要分开记录：基础模拟、增强模拟、具体协议与探针结果。增强关闭时字节行为应保持当前基础实现；增强开启也不能声称完整 agent、OAuth 登录、签名、TLS 指纹或真实文件系统执行被复现。不做自动降级后继续报告原模式成功。

## Claude：可实现的增强配置

### 已证实的 wire 特征

本地 Claude Code 2.1.306 使用 `--bare --print --tools ''` 抓包，实际是 **sdk-cli** 入口，而非交互 cli：

- UA 后缀是 `(external, sdk-cli)`，`x-app:cli`、`anthropic-version:2023-06-01`、`x-claude-code-session-id`。
- SDK 头为 `x-stainless-lang:js`、`x-stainless-package-version:0.128.0`、`x-stainless-os:Windows`、`x-stainless-arch:x64`、`x-stainless-runtime:node`、`x-stainless-runtime-version:v26.3.0`、`x-stainless-retry-count:0`、`x-stainless-timeout:600`。这是固定捕获 profile 的运行环境，不是用户当前浏览器的 Node 环境。
- system 顺序为：unsigned billing attribution 文本块；Agent SDK 短身份块；CWD/Date 文本块。后两块各有 `cache_control:{type:"ephemeral"}`，没有 `ttl`。原探针 system 内容应保留在后面，不覆盖。
- 请求路径 `/v1/messages?beta=true`。捕获的 beta 集合为现有 `claude-code-20250219`、`interleaved-thinking-2025-05-14`，再加 `thinking-token-count-2026-05-13`、`context-management-2025-06-27`、`prompt-caching-scope-2026-01-05`、`effort-2025-11-24`。
- JSON 字符串形式的 `metadata.user_id` 内含 64 hex device ID、空 `account_uuid`、会话 UUID；session 必须与 header 相同。API-key 抓包账号 UUID 为空，不应填入虚构 OAuth 账号。

对交互 cli 的额外证据来自 CLIProxyAPI：它把 CLI 常量 beta、SDK 身份、billing 与 identity 作为同一 profile 管理，而不是随机拼凑。其当前 profile 比本地版本旧，不应直接混用版本号和 SDK package：见 [设备 profile](https://github.com/router-for-me/CLIProxyAPI/blob/8289ec4c71ad914d0612c2776352b76ba3d355a6/internal/runtime/executor/helps/claude_device_profile.go#L23)、[SDK 头](https://github.com/router-for-me/CLIProxyAPI/blob/8289ec4c71ad914d0612c2776352b76ba3d355a6/internal/runtime/executor/claude_executor_request.go#L1508)、[CLI beta 集合](https://github.com/router-for-me/CLIProxyAPI/blob/8289ec4c71ad914d0612c2776352b76ba3d355a6/internal/runtime/executor/claude_executor_request.go#L63)。`cli` 路径的 `redact-thinking` 与 `sdk-cli` 有差异，不能把此次 sdk-cli 捕获说成完整 cli 默认集合。

最严格的一致方案是把增强实现标记为“Claude Code 2.1.306 非交互 API-key 请求”，UA、billing entrypoint、短身份都采用 sdk-cli；若保留现有 `(external, cli)` UA 与 CLI 短身份，则 billing 必须使用 `cc_entrypoint=cli`，并明确这是根据公开代理实现组合的最小 cli profile，不是本次 sdk-cli 抓包的逐字复现。

### unsigned billing attribution：可复算，但不伪造签名

CLIProxyAPI 的公开生成格式是 `x-anthropic-billing-header: cc_version=<version>.<fingerprint>; cc_entrypoint=<entrypoint>;`。这是一段 system attribution 文本，不是 HTTP authentication header，也没有用户余额、账单账户或授权凭据。见 [生成器 L129–177](https://github.com/router-for-me/CLIProxyAPI/blob/8289ec4c71ad914d0612c2776352b76ba3d355a6/internal/runtime/executor/claude_executor_cloaking.go#L129)。

其三位公开 fingerprint 算法：SHA-256 输入为固定公开 salt `59cf53e54c78`、首用户消息文本 UTF-16 索引 4 / 7 / 20 的字符（越界使用字符 `0`）、CLI 版本字符串；取小写十六进制前三位。**本轮在 Node 中对实际本地捕获复算为 `8af`，与 2.1.306 抓包完全相符。** 这只验证该捕获的公开 fingerprint，不建立服务端通用验签结论。WebCrypto/TextEncoder 可避免引入哈希依赖；对孤立 UTF-16 surrogate 的编码行为必须与 Node 一致。

生成时取原始首用户纯文本，在注入环境/context 前确定；若用户内容为结构化多 part，要明确文本拼接顺序，并用捕获 fixture 覆盖。无需抄写完整专有 prompt。不要硬编码 `8af` 到其他 prompt。不要生成 `cch`、`cc_prev_req`、`cc_prompt_id`、OAuth scope 或账户字段；公开实现将这些作为另一个 signed 路径处理，本方案没有验证它们。

### 环境、缓存和工具影响

增强可添加单独 CWD/Date 块，使用明确的固定“verification workspace”路径与当前日期；不可读取并上传用户真实工作路径、目录、规则、文件或已安装 MCP 信息。这个环境是模拟测试上下文，不能宣称真实 CLI 工作目录。身份/环境 cache 块用 plain `ephemeral`，不要加 1h `ttl` 或 OAuth extended-cache beta；CLIProxyAPI 明确 API-key 使用无 TTL 的默认形式，1h 与 OAuth 路径配对。见 [缓存策略 L1984–2005](https://github.com/router-for-me/CLIProxyAPI/blob/8289ec4c71ad914d0612c2776352b76ba3d355a6/internal/runtime/executor/claude_executor_cloaking.go#L1984)。

缓存不应改变提示内容，但会改变实际缓存计费/命中，因此默认关闭增强。不要自动给全部历史消息、媒体 part 或工具块加断点；最终实现给新增身份、环境及末个原始用户文本块添加缓存断点（抓包的用户文本也有 ephemeral）；先计数并保留用户/SDK已有 cache_control，新增后总断点不超过四处。

抓包还含 adaptive thinking、context_management edit、output_config effort=high。这些是模型/设置相关行为，可能改变模型输出、成本或兼容性，**不作为无条件增强默认**。已有 SDK 需要的 beta 与用户 override 应继续保留；新增 beta 按去重集合合并，不删除 SDK 功能位。

Sub2API 的现有严格门确实检测 UA、身份/billing识别、x-app、beta/version、metadata 格式；它不检查上述 SDK 全套值、CWD、cache 或工具箱。见 [validator](https://github.com/Wei-Shaw/sub2api/blob/37067e8e340e9440d173a92b4faa05e8ce58368f/backend/internal/service/claude_code_validator.go#L84)。这些后者是可复现客户端特征，不是已经证实的通用放行条件。

## Codex：developer 前缀与一致 metadata

0.164.0 将基础指令置于 `input` 开头的 `type:message` / `role:developer` / `content:[{type:input_text,text:...}]`，并保留后续用户消息；没有本次 profile 的 top-level `instructions`。见 [BaseInstructionsFragment L43–63](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/context/base_instructions.rs#L43)、[插入前缀 L1032–1041](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/client.rs#L1032)。可使用官方公开 base prompt 第一短句加自有验证限定语，避免完整 agent 指令让模型把普通测试变成编程任务；[公开 base prompt](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/protocol/src/prompts/base_instructions/default.md)。保留原已有 developer/system 内容及顺序，不重写探针用户文本。

`client_metadata` **无条件**含 `x-codex-installation-id`、`session_id`、`thread_id`、`x-codex-window-id`，不是仅 ChatGPT/internal 发送。`include_internal` 只影响后面的 MCP attribution 分支。见 [metadata L330–379](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/responses_metadata.rs#L330)。这证明 native 默认存在，不证明所有服务端将其作为必填。Sub2API 默认门只强制某个 `x-codex-*` header，installation body path 是可配置要求。

增强建议生成一份 probe/run 内稳定的身份源，供 HTTP 与 body 共用：

| 字段 | 一致性要求 |
| --- | --- |
| UA / originator | UA首段与originator一致，保留当前版本0.164.0，不复制本机 Orca / codex_exec 标识 |
| session-id / thread-id | 独立 probe 可令二者等于同一生成 UUID；分别映射 body `session_id` / `thread_id` |
| x-client-request-id | 官方 Responses transport 使用 thread ID；增强可以与 thread-id 对齐 |
| x-codex-window-id | `<thread-id>:0`；与 body 同名 key 及 turn metadata `window_id`相同 |
| installation ID | 新生成 UUID，当前验证会话内稳定；放 `client_metadata["x-codex-installation-id"]`，不复制已登录客户端或持久遥测ID |
| turn ID / root turn ID | 单探针单根turn可用同一生成 UUID；平铺 metadata 和 JSON blob一致 |
| prompt_cache_key | 当前独立probe使用同一 session ID；原生也支持自定义/省略，不是普遍必填 |
| x-codex-turn-metadata | Header和 `client_metadata` 的同名JSON字符串复用同一对象序列化，至少含一致的安装/session/thread/turn/root/window字段，可加 window_number=0、request_kind=turn、history_initialization=new、model、起始时间戳 |

`x-codex-turn-metadata` 的 JSON 内使用 `installation_id`、`window_id`（不带 x-codex 前缀）；平铺 `client_metadata` 则使用 `x-codex-installation-id`、`x-codex-window-id`。这是常见错配点。时间与 ID 在一次生成请求/SDK重试中保持一致，不要重新随机。见 [payload L412–463](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/responses_metadata.rs#L412)、[compatibility headers L382–402](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/responses_metadata.rs#L382)、[prompt cache policy L658–678](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/client.rs#L658)。

不填不存在的 agent_name、workspaces、父子agent、sandbox承诺、MCP namespace、analytics-enabled 状态、attestation；本地抓包这些来自实际客户端运行环境，不能因此复制进通用探针。`remote_compaction_v2` header 是宣告客户端能力，不应加给不能执行该流程的验证器。保持现有 `store:false` 和 reasoning include；`reasoning.summary`、verbosity、parallel_tool_calls 是模型/调用能力相关，不强制覆盖用户与 SDK。

本地 native function schemas 有 `strict:false` 和 `additionalProperties:false`，但 schema 指纹不是此网关已证实的检测条件。不要机械修改现有验证 schema 或从捕获复制 shell 工具；工具支持探针仍以原工具名和可观察调用结果判断。

## Gemini：systemInstruction 与环境分层

API-key/custom URL 使用 `@google/genai` 原生路径，Google-login/ADC 是另一个 Code Assist 流程，增强不能通过增添其 headers 模拟 OAuth。见 [API-key headers与client选择](https://github.com/google-gemini/gemini-cli/blob/6006c14a4decfe4b891c6263ad6ad5992e404b5b/packages/core/src/core/contentGenerator.ts#L269)。

Gemini CLI 用生成的 core system 字符串、registry 的 function declarations 初始化 chat，最终 `generateContentStream` 的 config 带 `systemInstruction` 和 `tools:[{functionDeclarations:[...]}]`。见 [client L417–439](https://github.com/google-gemini/gemini-cli/blob/6006c14a4decfe4b891c6263ad6ad5992e404b5b/packages/core/src/core/client.ts#L417)、[chat L1042–1049](https://github.com/google-gemini/gemini-cli/blob/6006c14a4decfe4b891c6263ad6ad5992e404b5b/packages/core/src/core/geminiChat.ts#L1042)、[最终调用 L1176–1188](https://github.com/google-gemini/gemini-cli/blob/6006c14a4decfe4b891c6263ad6ad5992e404b5b/packages/core/src/core/geminiChat.ts#L1176)。HTTP body 的 `systemInstruction.parts` 是现有 SDK 的协议 owner，增强应向其文本 parts 前面加短身份，而不是把 config层字段另塞到 `generationConfig` 中。

官方 prompt identity 随 interactive/noninteractive 模式变化；可引用 [公开 snippets L191–195](https://github.com/google-gemini/gemini-cli/blob/6006c14a4decfe4b891c6263ad6ad5992e404b5b/packages/core/src/prompts/snippets.ts#L191) 的短身份句，加自有“执行当前验证任务”限定语，保留已有 systemInstruction parts。完整 prompt 按工具集合/模式生成，不能从单版本抽取一大段固定内容。

环境不是 systemInstruction 的强制组成部分：官方把 `<session_context>` 作为初始 **user** history message，内含日期、OS、临时目录与可选目录/记忆；tier1 system 与tier2 environment分开。见 [environmentContext L51–105](https://github.com/google-gemini/gemini-cli/blob/6006c14a4decfe4b891c6263ad6ad5992e404b5b/packages/core/src/utils/environmentContext.ts#L51)。因此若加入最小环境，应放独立 `contents` user前缀，原探针仍位于最后一个user请求，不复制真实目录/记忆。当前最小实现仅增加 `systemInstruction.parts` 身份即可；目录和临时文件并无运行语义时可不模拟。

保留现有 `tools.functionDeclarations`、`toolConfig.functionCallingConfig` 与验证工具名；native hooks也能动态替换工具与toolConfig，说明工具清单不是固定不可变身份。不要强制 `AUTO` 覆盖探针的 `ANY/allowedFunctionNames`，不要伪造 `thoughtSignature`、cachedContent句柄、项目ID或Code Assist会话。Gemini 本轮只有源码证据，没有安装的CLI抓包或受限目标站点证据。

## 建议验证清单

- 同一输入增强关闭保持现有请求；默认profile即使误传增强true也保持普通请求。
- Claude billing版本/entrypoint/UA一致、fingerprint独立fixture值、无cch、cache不带ttl、metadata.session与header一致，已有system/tools/tool_choice和override保留。
- Codex developer前缀、安装/turn/window/blob/cache字段一致；原用户输入、工具与tool_choice保留；无OAuth/attestation/虚假能力字段。
- Gemini systemInstruction parts合并，原contents与tools/toolConfig保留；普通文本仍不因添加工具而改变测试语义。
- 结果/history记录 enhanced布尔值；旧结果缺省视为false；运行中的输入切换、取消/重开和缓存键应避免结果串线。
- 实际浏览器接收端检查SDK头与body，而不是只检查Headers对象；远端成功与本地契约结果分别报告。新增环境prompt使token数增加，可能改变严格文本回答或工具行为，必须以现有探针成功/失败判据观察，不将“请求发出”当通过。

## 实现与证据保留

增强已接入 CLI 对话框、凭据档案/账号普通测试以及网页 Shadow DOM 测试；默认关闭，实际结果与持久化摘要保留增强标记。仅保留每个探针原有工具集合和测试语义。实测通过自有 Sub2API 客户端准入门，不证明其他站点或真实推理成功。

源码、版本研究和可重现的 fixture 保留在 Git。`.scratch/cli-request-simulation/artifacts/enhanced-acceptance.md` 汇总当前本地验证、截图对照和明确缺口；原始抓包、fixture 私有状态和截图仅本地保留供审查，未加入 Git。临时资源清理后 journal 清空凭据并记录每项 404 与原始分组恢复。历史捕获原件继续按先前约定保留，无删除操作。

增强实测复现：配置共享本地环境中的 `AAH_E2E_SUB2API_BASE_URL`、`AAH_E2E_SUB2API_ADMIN_TOKEN`，选择新的 `AAH_CLI_PROFILE_EXPERIMENT`（小写字母/数字/连字符，独立输出目录），运行 fixture 的 `setup`，再设置 `AAH_CLI_PROFILE_LIVE=1` 运行 `e2e/verificationRequestProfiles.spec.ts`，最后无论成功与否执行同名实验的 `cleanup`。fixture 会创建临时账号/分组/密钥并临时扩展源账号 1 的组映射，要求自有可管理站点；不需要配置可推理的上游渠道。仅完成 `setup` 不能算验收，必须保留普通失败对照、增强准入和清理读回。
