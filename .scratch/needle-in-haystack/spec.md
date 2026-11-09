# API 测试：大海捞针（NIAH）调研与首版建议

Status: implemented
Date: 2026-11-09
Scope: 大海捞针及共享上下文基础能力已实现；网页历史提示框的 ShadowRoot 兼容性已在后续修复中通过本地自动化验收，详见独立工单。
Retention: Preserve in Git，作为后续功能取舍的决策记录。

## 已确认的实现约定

- 默认自动生成长度档位，优先同一请求身份下有效的容量观测，其次模型声明，均未知时采用小范围默认；用户无需填写长度，仍可调整上限和样本种子。
- 默认仅执行最长档位的 10%/50%/90% 三个位置；矩阵仍展示其他长度，可显式运行或重测单格、行、列。累计保留的其他格子成绩不代表本轮重新执行过这些请求。
- 两种依据都未知时提供“先探测上下文”引导，同时允许直接捞针。容量探测完成后自动更新范围，由用户开始下一轮捞针请求。
- 新容量观测记录分词器依据。包含正数已接收长度却缺少有效分词器依据的摘要会被读取校验舍弃；不猜测或迁移其计数依据，捞针规划继续使用模型资料或未知时的默认值。
- 复用计数、长度限制、请求预算、请求身份、取消与后台恢复机制；容量探测与检索判分分别保留结果。
- 下述调研中的“待决策”是历史建议，以上确认内容优先。验收日志与截图保留于本目录 artifacts/，不提交生成物。

## 已核实的上游实现

本次通过 GitHub REST raw 文件读取核对源码，没有下载大型语料、安装上游或调用付费模型。固定调查修订：Greg Kamradt `021385d68d3202e37893e9d3cd29011c569abe30`，NVIDIA RULER `db43f92ff634bbce1c33d1fb15858aec4bba509a`。论文页面确认 RULER 的 COLM 2024 和 arXiv v3 元信息；本文实现结论来自对应源码，未宣称复现论文实验。

| 方面 | Greg Kamradt NeedleInAHaystack 当前 v2 | NVIDIA RULER |
| --- | --- | --- |
| 测试对象 | 单事实、多事实、随机 UUID、UUID 链；按长度 × 深度 × seed 扫描 | 长上下文检索及更复杂任务；NIAH 可设置多个 key、每个 key 多个 value、多个查询 |
| 干扰文本 | 内置 Paul Graham essays，也支持文本/文件来源 | essays、重复噪声、同格式的随机 key/value 干扰针 |
| 位置 | 单针按 token 索引的百分比插入，可回退到句号；记录实际位置；多针从起始深度均匀展开 | essay 按句子位置从 40 个深度档位采样；噪声/干扰针按条目随机插入；不是固定二维深度网格 |
| 长度 | 各 provider 共用 cl100k_base，明确是近似；插针会增加最终长度，记录最终 token 数 | 可选 tokenizer；构造时检查完整输入 + 预留输出 ≤ max sequence length，并保留模板开销 |
| 评分 | 名称叫 exact_match，实际是 trim/lower 后的子串包含；多事实按命中比例 | NIAH 同样以忽略大小写的子串包含算答案召回比例；未惩罚额外错误答案 |
| 结果 | JSONL 含构造 recipe、seed、目标/实际深度、响应、usage、成本、耗时和状态；保留历史热力图 | 聚合各任务和长度的得分；复杂度可配，适合作为后续多针/干扰项参考 |

证据：[Greg v2 README](https://github.com/gkamradt/LLMTest_NeedleInAHaystack/blob/021385d68d3202e37893e9d3cd29011c569abe30/README.md)、[评分源码](https://github.com/gkamradt/LLMTest_NeedleInAHaystack/blob/021385d68d3202e37893e9d3cd29011c569abe30/needlehaystack/scorers/exact_match.py)、[单针插入](https://github.com/gkamradt/LLMTest_NeedleInAHaystack/blob/021385d68d3202e37893e9d3cd29011c569abe30/needlehaystack/inserters/single_depth.py)、[token 计数](https://github.com/gkamradt/LLMTest_NeedleInAHaystack/blob/021385d68d3202e37893e9d3cd29011c569abe30/needlehaystack/core/tokens.py)、[RULER README](https://github.com/NVIDIA/RULER/blob/db43f92ff634bbce1c33d1fb15858aec4bba509a/README.md)、[生成源码](https://github.com/NVIDIA/RULER/blob/db43f92ff634bbce1c33d1fb15858aec4bba509a/scripts/data/synthetic/niah.py)、[评分源码](https://github.com/NVIDIA/RULER/blob/db43f92ff634bbce1c33d1fb15858aec4bba509a/scripts/eval/synthetic/constants.py)、[论文 v3](https://arxiv.org/abs/2404.06654v3)。

需要避免照搬历史教程：Greg 当前 v2 的普通检索任务采用本地字符串评分，不能把早期依赖 LLM judge 的做法描述为当前默认。上游的 substring scorer 也不能描述成完整响应严格相等。

## 初期建议存档（已由上方实现约定取代，非上游结论）

优先借鉴 Greg 的长度/位置扫描与可重建结果，借鉴 RULER 的随机 key/value 和同格式干扰项。首版做单针检索，问“指定 key 对应的值是什么，只输出值”，随机生成查询 key 与 128 位随机值；问题包含 key、不包含正确值。背景采用随扩展提供、来源和许可明确的固定普通文本，版本化并支持按 seed 重建。重复纯噪声可做快速诊断选项，但易被压缩，不能与自然文本结果混为一组。

推荐快速模式：选择一个输入长度，默认 16 Ki tokens，在 10%/50%/90% 各测一次；单模型 3 次请求，按完整本地提示词目标估算累计约 `3 × 16384 = 49152` 输入 tokens，另有输出与协议包装开销。模型声明的输入上限较低时下调默认长度并预留输出空间。提供可选长度 × 深度矩阵，如 4K/8K/16K × 10%/50%/90%，9 次请求、约 86016 本地输入 tokens。启动前展示请求数与用量估算。价格未知时只展示 token/请求估算，不套用上游示例美元价格。默认串行、禁止隐式重试，可取消且保留已完成单元；不加入常规“运行全部”。

计数必须涵盖背景 + 针 + 问题/指令，另留输出余量；记录 tokenizer 标识、精确/估计状态、目标正文长度、实际正文/总输入长度、目标/实际深度、API usage。深度定义为插入点相对插入前背景的 token 百分比，句子边界调整后显示实际值。跨 provider tokenizer 不一致时不要暗示这些是服务端精确 token 或完全可比的窗口边界。

本地评分即可，首版不额外调用 LLM judge。建议主分数对 trim 后的完整答案严格匹配；独立记录“包含正确值”作宽松诊断，避免输出一串猜测也拿满分。保留原始输出和评分规则版本。多针后续再增加集合准确率/召回率与额外答案惩罚；不用一个命中率掩盖错误补充答案。

结果至少区分检索命中、检索未命中、请求错误、超限、输出不完整、取消和中断后结果未知；未运行的单元不能涂成检索失败。主结果显示“已完成 2/3，其中命中 1/2”，同时保留计划样本数与各错误数量，避免跳过失败请求后展示误导性满分。小网格展示长度 × 深度热力图，单个长度展示三处检索结果。一次采样只代表该样本；正式比较需相同语料版本/seed/协议/参数与多次采样，展示成功数/样本数。原始输出仅在当前详情中展示，持久化有界摘要和构造 recipe，不保存整篇长提示词或凭证。

通过大海捞针只能说明此次输入中的指定信息可被检索，不能证明真实最大上下文窗口、复杂推理质量、模型身份或供应商是否截断。RULER 自身也明确其合成任务不能代替现实任务。建议在 UI 称为“大海捞针”，说明为“测试模型能否找回长文本中的指定信息”，与现有“模型上下文测试”各自保留结论。之后可加入多 key/value 和多跳链；首版不复制整个学术评测框架。

## 实施前代码接入依据存档

### 测试长度如何选择（2026-11-08 补充调研）

- Greg v2 的[单针示例配置](https://github.com/gkamradt/LLMTest_NeedleInAHaystack/blob/021385d68d3202e37893e9d3cd29011c569abe30/configs/runs/single_needle.example.yaml)设为 1000–32000 tokens，线性取 15 个长度，再与 11 个位置组合；这是可修改的示例，不是全局默认。其 [schema](https://github.com/gkamradt/LLMTest_NeedleInAHaystack/blob/021385d68d3202e37893e9d3cd29011c569abe30/needlehaystack/config/schema.py) 也支持显式长度列表。[runner](https://github.com/gkamradt/LLMTest_NeedleInAHaystack/blob/021385d68d3202e37893e9d3cd29011c569abe30/needlehaystack/core/runner.py)执行预设网格，不先探测模型的最大上下文。
- RULER 经典主分支的 [config_models.sh](https://github.com/NVIDIA/RULER/blob/db43f92ff634bbce1c33d1fb15858aec4bba509a/scripts/config_models.sh)配置 4K、8K、16K、32K、64K、128K 六档（脚本实际按降序运行）。这些是显式测试档位，不是根据模型声明自动生成。该实现的 `max_seq_length` 包括输入和预留输出，不能把 128K 配置描述为恰好 128K 的背景文本。
- 当前主 README 已把旧执行流程标为 deprecated，并指向 NeMo-Skills 分支。核对 [rulerv2-ns README](https://github.com/NVIDIA/RULER/blob/4809570a2a40e803bfe341773e561524224c2e7c/README.md) 后，其示例仍由用户设置 `LENGTH=8192`，模型服务端的 `--max-model-len 131072` 是另一项独立配置；不能把示例 8K 当作整个新版评测的固定上限。

产品建议仍待用户决策：16K 仅作为快速检查；标准模式让用户选择测试上限，按 8K/16K/32K/64K 等倍增档位生成可勾选矩阵，并加入接近所选上限的一档。模型元数据或当前请求身份下已验证的输入接收记录可辅助推荐上限，均须显示来源；容量记录只证明已接收长度，不能证明最大值。对声明的总上下文扣除输出/包装余量，未知 tokenizer 继续标注估算。元数据未知时保留小规模默认和手动输入，不自动发起 1M 请求或先运行容量探测。执行前显示总请求数和累计输入预算。比较不同模型时采用共同长度档位；探索单模型边界时可扩大上限。检索未命中不能作为容量错误用于二分搜索，也不应自动推断更长档位都失败。

已核对当前分支基线 `f9295263e1c73fa5b2c544c8c5dc5e54c63ef15e`。以下为源码观察及对应建议，尚未修改运行时代码：

- [contextCapacityRun.ts](../../src/services/verification/modelQuality/contextCapacityRun.ts) 通过完成原因、正文或输入 usage 判定输入是否接收，不验证是否找回针；新测试应独立计算检索结果，不改变现有容量边界的语义。
- [contextCounter.ts](../../src/services/verification/modelQuality/contextCounter.ts) 已有按模型元数据选择、懒加载 tokenizer 和标注估算状态的逻辑，但 `preparePrompt` 专用于重复句子与“回复 OK”。实现时提取最小共享计数能力，保留各自提示词构造；不能直接用容量提示词充当 NIAH 语料。
- 复用 [providers.ts](../../src/services/verification/aiApiVerification/providers.ts) 的 `createModel` 和 [probeGeneration.ts](../../src/services/verification/aiApiVerification/probes/probeGeneration.ts) 的 `runProbeGeneration`，沿用选中的模型、协议、请求头、客户端模拟和流式模式。上游 tokenizer 不匹配仍标注估算，不静默更换端点或请求模式。
- UI 接入 [useVerificationTools.ts](../../src/features/Verification/api/useVerificationTools.ts) 与 [VerificationToolsPanel.tsx](../../src/features/Verification/api/VerificationToolsPanel.tsx) 的共享工具区，单独启动、停止和查看详情。该工具区被账号、API 凭证档案与网页 API 检查复用；实施时分别确认入口行为，并对修改/关闭凭证上下文后的旧结果做失效处理。
- 参考 [contextCapacityHistory.ts](../../src/services/verification/verificationResultHistory/contextCapacityHistory.ts) 的请求身份范围及 [contextCapacityCheckpoint.ts](../../src/services/verification/webAiApiCheck/contextCapacityCheckpoint.ts) 的后台中断恢复。网页后台长请求需要在发送前记录当前单元、完成后保存结果；worker 重启时把在途单元标为未知，不自动重放。共享身份函数应从最小合适 owner 提取，新检索结果保留自己的类型与评分版本。

建议验收边界为公开 runner 的检索/预算/取消结果，以及共享工具区用户操作与后台恢复流程；实施阶段按仓库 TDD 约定确定具体测试接口后逐项完成。

## 调研阶段验证记录（实施前）

实现时需要 TDD 覆盖 seed 重现、针只出现一次、查询不泄漏答案、头/中/尾位置及实际深度、完整输入预算、严格/宽松评分、请求错误与未命中区分、取消和小网格进度。真实 API 付费验证范围应在实现阶段结合已授权环境确定；当前没有模型行为或计费实测证据。

待决策：是否接受上述快速模式与可选矩阵、默认文本语言与固定语料来源。用户导入文本、多针/多跳暂列后续范围。这些不影响当前调研结论。当前验证仅为上游及本地源码核对、文档链接与差异检查；没有执行模型评测、应用行为测试或真实付费请求。


## 首版实现与验收

矩阵按 8K 倍增至自动上限，并补上最终上限一档，各档包含 10%/50%/90% 位置；均未知时展示 8K/16K，默认仅运行 16K 的三个位置。可填写上限、固定种子、关闭“仅测最长”运行完整计划，或从矩阵显式运行及重测指定范围。模型声明的总窗口预留 1024 输出 tokens，单条输入最高 1M，累计输入预算 8M，请求预算 32 次。启动前展示计划；新的容量观测只更新计划，不隐式发起下一轮请求。

采用随代码版本化的原创合成档案记录和同格式干扰项；种子控制可重建的 32 位伪随机序列，目标值为 32 个十六进制字符，不是密码学随机值。主结果要求去除首尾空白后的完整答案相等；未实现初期建议中的宽松子串诊断。持久化种子、分词器、计划及有界测量摘要，原始回答和预期值仅保留在当前会话详情。

三个入口共用规划、评分、历史身份和后台执行；容量探测保留独立提示词与判定结果。后台统一拥有运行状态，其他页面不能恢复或清理活动请求。停止和 worker 中断保留未知结果，恢复不重放请求。界面资源覆盖现有八种语言。

验收包含公开 runner、存储、React 交互和 Chromium 浏览器流程。具体命令、结果、失败原因及复测记录保存在 [本地验收报告](artifacts/acceptance.md)。全部 API 响应来自可控夹具或本地 HTTP 服务；未调用真实付费模型，不把这些检查描述为模型能力实测。

## 长度精度与选择依据的展示调研（2026-11-08）

用户反馈：完整的 `8,192 / 16,384 / 32,768 / 65,536 / 130,048` 和累计 `758,784` 不易扫读；“参考模型标注的上下文长度，已预留回复空间”未说明选择规则和具体依据。本节为对当前 `a202f93f08` 的后续建议，尚未修改运行时展示。

### 当前上游证据

本次通过 GitHub REST raw 重新核对固定修订，不以旧版截图或二手教程推断当前交互界面。

| 项目与范围 | 已核实的展示或配置 | 可借鉴之处与边界 |
| --- | --- | --- |
| NVIDIA RULER README 报告及经典 CLI | [报告表头](https://github.com/NVIDIA/RULER/blob/db43f92ff634bbce1c33d1fb15858aec4bba509a/README.md#L5)使用 `4K / 8K / 16K / 32K / 64K / 128K`；[配置](https://github.com/NVIDIA/RULER/blob/db43f92ff634bbce1c33d1fb15858aec4bba509a/scripts/config_models.sh#L17-L24)对应 4096 至 131072。 | 报告可用短档位，配置保留准确整数；这些档位的 K 对应 1024，不能据此推断所有厂商宣称的 K。它是静态报告和 CLI，并非已核实的交互式设置 UI。经典流程已被主 README 标为 deprecated。 |
| Greg Kamradt NIAH v2 | [示例配置](https://github.com/gkamradt/LLMTest_NeedleInAHaystack/blob/021385d68d3202e37893e9d3cd29011c569abe30/configs/runs/single_needle.example.yaml)用 min/max/数量/linear 或 sigmoid 控制长度和位置；[CLI](https://github.com/gkamradt/LLMTest_NeedleInAHaystack/blob/021385d68d3202e37893e9d3cd29011c569abe30/needlehaystack/cli/main.py)输出完整的 `ctx=<context_length>`，dry-run 报告 sweep_cells；[README](https://github.com/gkamradt/LLMTest_NeedleInAHaystack/blob/021385d68d3202e37893e9d3cd29011c569abe30/README.md)直接解释“2 lengths × 3 depths = 6 cells”。 | 可借鉴长度数 × 位置数解释请求次数。示例不是默认值；未证实其具备我们这种自动按模型资料选择上限的表单。 |
| promptfoo 通用评测结果表 | [ResultsTable.tsx](https://github.com/promptfoo/promptfoo/blob/2a6fdf9b2e1600ffa2a204e70e9fea7cb0c14cff/src/app/src/pages/eval/components/ResultsTable.tsx)用 `formatMetricValue(totalTokens)` 显示 Total Tokens，默认 `Intl.NumberFormat` 仅设 `maximumFractionDigits: 0`，无 compact notation；分别显示总计、目标/提供方、评分、平均用量等。 | 说明精确用量仍适合统计详情；不能宣称“其他项目都用 K”，也不能把通用用量统计当成 NIAH 配置界面。 |

RULER 的 [NIAH 参数与长度校验](https://github.com/NVIDIA/RULER/blob/db43f92ff634bbce1c33d1fb15858aec4bba509a/scripts/data/synthetic/niah.py)明确 `max_seq_length` 包含输入与生成 tokens，并单独处理模板/输出预留。因此其 `128K` 报告档位不等同于我们的“输入目标 128K”；不能仅为档位好看将实际 127K 输入标成 128K。

### 建议与约束

- 主计划和结果矩阵采用相同的紧凑长度格式，准确整数在可聚焦提示或可展开详情中保留；手机上也应可查看。整数 K 不补 `.0`，非整数 K 至多一位小数，缩写不得改变实际请求长度或预算。
- 当前长上下文面板按 `1K = 1024`、`1M = 1048576` 缩写，而通用 `formatTokenCount` 按 1000/1000000 缩写。实现前应选择并标明统一的本测试单位，不能将两种函数混用于同一计划。推荐沿用长上下文测试的二进制档位；若坚持严格单位名则使用 Ki，但需要评估可读性。
- 在 `1K = 1024 tokens` 下，本例恰好为 `8K / 16K / 32K / 64K / 127K`；每种长度测 10%/50%/90% 三个位置，共 15 次请求，累计 `741K = 758,784` 输入 tokens。“约”描述本地输入估算，并非该除法存在舍入；输出用量仍需另计。
- 主要说明建议用“每个长度测试前、中、后 3 个位置，共 15 次请求”。将来源解释放在“长度如何确定”中：从 8K 逐步翻倍，末项补至本次输入上限；显示实际模型资料/已接收长度/手动上限的具体值。
- 若实际依据是 128K 总上下文，可解释为“模型资料中的上下文为 128K，预留 1K 回复空间，本次最长输入为 127K”。但 `getDeclaredInputLimit` 同时支持独立输入上限，并取其与总上下文减预留的较小值；不能只根据最终 127K 倒推来源，也不能在仅存在输入上限时声称扣除了回复空间。应由实际选中的约束生成说明。
- 模型资料当前来自 models.dev 及本地元数据服务，不是对当前接口的容量实测。此前接收过的长度也仅证明已接收，不是最大容量。来源文案需保留这两者的区别。

验证仅为源码/文档核对、整数换算及引用检查，没有重新执行模型评测。RULER 分项工作稿保留在本地 `.output/needle-settings/upstream-display-research.md`，可在本轮建议审阅后清理；以上已将后续决策所需结论归入本 spec。

### 交互评审与采用结果（决策演进记录）

2026-11-08 的交互评审采用中性只读长度标签、长度数 × 位置数解释、费用常驻、统一“长度如何确定”内联展开、按实际约束生成来源说明，以及结果矩阵同步紧凑格式。标签不增加按钮或键盘停靠点；完整数字通过标准可键盘/触控操作的折叠区查看，原生 title 仅作鼠标补充。来源说明使用共享 `getDeclaredInputLimit` 的实际结果区分独立输入上限与总上下文预留。

后续评审指出已知与未知容量区分不足、未知时缺少快捷上限，以及必要设置被折叠，因此加入快捷选择，直接显示最长文本、仅测最长和样本编号。来源独立于手动设置：更改测试上限不改变模型资料、此前已接收或未知状态；未知时保留显式上下文检测按钮。所有预设只修改设置，不发起请求。

按用户后续要求，快捷档位由共享倍增规则自动生成，起点为 16K，末项补到模型资料对应的可用输入上限；资料未知时生成至工具的 1M 单次上限。独立输入限制与总上下文减回复预留仍取较小值；只有此前接收记录时，不将该记录当作最大容量来缩短预设。换模型会重新生成档位；上限恰好在倍增档位时不重复，低于 16K 时只保留实际可用上限。例如 128K 总上下文生成至 127K 输入，1M 总上下文生成至 1023K 输入；准确整数仍可查看。用户可手动填写工具允许范围内的其他值，未知模型不会因新增较大预设而自动改用较大默认请求。

当前界面只在上限输入框旁保留一行上下文来源，并作为该输入的无障碍说明；不在默认视图重复说明自动上限或手动上限。“测试设置”使用普通表单卡，“本次测试预览”使用独立浅色区域、标题和留白，明确区分可修改的配置与自动生成的长度档位、请求数及预算。快捷上限复用共享分段选择控件，检测上下文是未知状态旁带图标的独立操作，不能混在预设值中。仅推导过程、准确整数和单位定义折叠，核心设置始终可见。

未采用将完整用量整数同时塞回主视图的建议：准确值留在详情，避免抵消用户要求的紧凑化。未将默认范围描述为“安全”，未扩大为全站 token 单位迁移；共享二进制格式仅用于上下文测试、捞针计划及结果表。对于被 1M 单次上限截断的计划，来源说明保留未截断的资料值并另示测试上限，不冒称该值就是实测容量。

上述展示现已实现。规划、整数输入、请求预算、执行与历史存储契约不变。128K 夹具的前后图及本地验收记录保留在 `.output/needle-compact/`，供 UI 审阅；既有 `.output/needle-settings/` 证据不改动。相关检查包括公开 UI 的不同限制来源、仅最长模式、无效输入恢复、准确数字披露、键盘展开与无隐式请求，以及账号、凭证档案和网页入口的既有浏览器流程。

### 2026-11-09 局部停止与详情交互

用户确认单格、行、列停止应覆盖等待、准备和请求执行阶段，区别仅在取消范围，范围外的任务继续。用户随后明确撤回悬停展示详情的方案：保留点击状态后在表格下方展示详情，以及独立的停止按钮。移除单独的“正在准备测试请求”提示；停止失败通过对应按钮的提示与重试反馈，不使用 Alert。

已取消的格子应保持“已取消”，即使流式汇总与取消同时结束，也不能再写回正常成绩。已发出请求但没有完整结果仍存为未知测量；未发出的取消不伪造测量。取消重测前已有的测量可保留，但详情必须标为上次结果，不能混同本次响应。取消后客户端关闭请求连接，与服务商内部是否继续计算是两个不同事实，后者不能由本地 UI 或连接关闭推断。

本轮本地验收及边界记录保留于 `artifacts/matrix-controls-acceptance.md`。基线 `.scratch/visual-captures/run-njA6qn/` 与最终 `.scratch/visual-captures/run-qHInpj/`、局部取消及真实流式连接断开的浏览器夹具日志、竞争条件的失败回归均保留本地供审阅，不作为产品资产提交。较早的 v1/v2/v3 图片与日志是中间证据，不能替代最终结果；未删除或改写。未连接用户当前安装的扩展，也未调用真实付费模型。

针对用户随后提出“单行最后全执行”的现象，新增独立凭据页服务端请求验证：先测 8K，再测 16K，再重测 8K，每次仅发出目标行的 3 个请求；比较实际请求内容长度，最后一组与第一组相同，未重发 16K。矩阵会累计保留其他行的旧测量，因此“显示全部结果”和“重新执行全部请求”需要区分。当前本地夹具未复现越界发送；用户安装环境是否出现其他行进入执行中的情况尚未核验，不据此认定其报告不存在。

### 2026-11-09 组件重构与保留的验收缺口

不同 API 测试复用运行／停止操作、设置开关和通用响应详情，容量、捞针及绘图保留各自的结果语义。

网页历史徽标的可访问说明和历史读回通过验收，但 ShadowRoot 内的提示框无法打开；该问题在重构前的共享 Tooltip 锚点机制中已存在。其后续修复条件记录在 [01-shadow-root-history-hints.md](issues/01-shadow-root-history-hints.md)，本次纯重构不修改该兼容性行为。局部回归、入口检查、原有失败及断言修正的证据保留于本地 [重构验收记录](artifacts/scout-refactor-20261109/acceptance.md)，供审阅和后续兼容性修复使用；未验证真实付费模型或用户安装环境。

后续组件拆分继续沿用上述语义边界：提示词设置与原始响应展示跨测试复用；绘图状态、针测试成绩、运行范围和上限编辑分别由小组件或纯选择器负责。容量的续跑与针测试的局部取消仍由各自控制器管理。第二轮完整分支清单和当前验收证据保留于 [组件复用验收记录](artifacts/scout-components-20261109/acceptance.md)；ShadowRoot 提示框问题仍按上述独立工单跟进。

后续兼容性修复已完成：网页历史提示支持悬停、聚焦和触摸打开，并可通过 Escape 或外部点击关闭。上述提示框缺口是重构验收时的历史状态；修复范围、原生页面回归和环境限制见 [工单结果](issues/01-shadow-root-history-hints.md#follow-up-resolution)。
