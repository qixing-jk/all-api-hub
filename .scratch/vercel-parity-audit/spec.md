# Vercel AI Gateway 体验审计

Status: implementation and local acceptance complete; ready for local commit

日期：2026-10-26。被审计源码：`5829cbd3b85be195541950da1fdfe4ace2ed5e83`。
用户验收目标：适配体验至少不弱于原生。本次为检查，未修改产品实现、未创建/编辑/删除上游资源。

## 结论与范围

下方“优先发现”及原始清单是实施前的审计快照。用户随后已授权补齐，最新处置和验证以文末“补齐交付”表为准。

**未达到目标。** 即使只比较已适配的余额、密钥管理、模型目录，核心密钥预算与编辑任务仍缺失。BYOK、Virtual Models、Token Pass 等完整 Vercel 产品功能另列为未适配，不据此要求把扩展变成完整控制台。

证据分层：2026-10-26 实机只读 UI 对比、当前代码、当日官方文档、当前单元测试。旧 `.scratch/vercel-ai-gateway/spec.md` 的写操作结果不计为本次执行。

## 优先发现

1. **P1：创建密钥无法限制消费。** 原生 Advanced Configuration → Spend Budget 提供美元上限、Never/Daily/Weekly/Monthly 刷新及 50%/75%/100% 邮件阈值。扩展表单仅名称、消费归属、到期时间；`keyEditor.ts:43`、`keys.ts:44` 无预算模型，POST 不携带 `aiGatewayQuota`。现有 key facts 也不投影预算、已花费、刷新周期。用户无法在扩展完成“创建有额度上限的密钥”或检查预算耗尽原因。缺省实际限制还可能继承团队 default budget，不能直接把缺字段解释成无限。实机表单缺失已确认，写操作未执行。
2. **P1：已有密钥全部禁止编辑。** `keyResources.ts:140` 的 `canUpdate:false` 和 `:190` 的 `editEditor` 拒绝所有编辑。原生支持改预算、刷新周期、提醒及消费归属。官方说明预算有独立管理 API；“没有 api-keys update 路由”只能说明某一条路由不存在，不能作为整个编辑任务不支持的依据。名称需要删建是原生限制，应与预算/归属编辑分别判断。消费归属变更的具体 console 写协议尚未复核，不能猜测 endpoint。
3. **P1：多团队上下文不能可靠保留。** `contentSession/vercel.ts:55` 取第一个团队；`identity.ts:92` 优先 defaultTeamId，多个团队无默认则抛错；completion 重新解析 scope，未优先采用用户当前页面团队或提供选择器。即使用户从团队 B 页面开始，也可能绑定默认团队 A；无默认时不能继续。原生按团队页工作。源码可确认分支，当前登录账号只有一个团队，跨团队实机未验证。修复应让用户选择并校验 token 有权访问该团队，而非静默选取。
4. **P1 风险，待成员账号复现：消费归属字段未按权限处理。** `keyEditor.ts:67` 默认 user，buildCommand 始终包含该值；`keys.ts:211` 总是提交 `metadata.spendAttribution`。官方说明只有 Owner / AI Gateway Budget Manager 可设置该字段；当前表单无角色条件。当前实机为 Owner，不能证明普通成员也能创建。需验证成员行为后决定默认省略、禁用及提示策略，不自动重放不确定的创建请求。
5. **P2：缺少返回团队控制台的恢复入口。** `definitions.ts:1582` 的 usagePath/adminCredentialsPath 均为 null。既有编辑能力缺失，却没有直达所保存团队密钥/预算页的适配入口。team slug 在身份响应可获得，当前没有贯通导航。应有清晰 fallback，但 fallback 本身不能算核心编辑体验等价。
6. **P2：模型解释与价格覆盖不完整。** `models.ts:156` 保留逐模型 model_eligibility，但忽略响应顶层 request_context_availability；在需要账户验证时不能完整解释下一步。模型投影 `:280` 将非 token 计价标为不可用；图像/音视频的原生计价任务未等价适配。这些是代码覆盖结论，当前未重新执行模型页面/推理对照。
7. **P3：创建表单信息层级。** 已查看扩展截图：Quota Settings 下只有消费归属、缺少实际预算；Expiration Time 同时作为章节名和字段名重复。原生将这些放在 Advanced Configuration 中，主要任务更集中。属于实机视觉观察，无键盘或窄屏验证。

## 工作流对照与适配清单

| 分组 / 任务 | 结论 | 证据、限制与完成条件 |
| --- | --- | --- |
| 类型、域名、作用域 | 已适配；沿用当前边界 | 一个 account-only 类型、独立 adapter family。console/session = vercel.com；identity/keys = api.vercel.com；inference/credits/models = ai-gateway.vercel.sh/v1。此次原生 console 身份接口 200；后两个域仅代码和协议测试，未声称实时全链验证；未发现需新增的区域域名证据。 |
| 鉴权选择 | 当前 PAT 默认合理；实时完整流程未验证 | PAT 用于团队资源管理、可后台使用；网关 key/OIDC 是推理凭据，不能替代已验证的完整管理契约；Cookie 会受当前浏览器会话影响。保留官方 token 获取指引，用户可能需邮箱验证并回填一次性 token；没有自动续期证明，过期需重新获取/替换。此次未申请/轮换凭据。 |
| 自动添加、保存、刷新、401 恢复 | 单测覆盖部分；未验证完整实时路径 | 本次使用已有账号，只打开创建密钥表单。不能据此宣称 fresh-form 自动添加、关闭站点后访问、401、多账号恢复全部通过。 |
| 团队选择 | 更差 | 发现 3；需要非默认团队及多团队无默认场景。 |
| 余额 | 代码和单测部分适配 | USD balance 语义正确、不可读值不补零。total_used 已解析但账户投影未展示；免费/购买额度、到期和重置未区分，不能把余额页称为完整等价。 |
| 用量、请求/Token、日志 | 未适配 / 计划相关 | todayStats 明确 unavailable。旧 Hobby 403 不等于所有套餐不支持；付费方案、日志及跨日窗口本次未验证。 |
| 套餐、额度与重置 | 部分 / 未验证 | 账户级预算及免费额度恢复规则不在现有账户投影中。不得从 balance 推导永久额度。 |
| 密钥清单与详情 | 部分 | 列表、后缀、上次使用、到期、消费归属已有；预算/实际消费缺失。keys.ts:143 没有沿 pagination.next 翻页；单团队少量样本不能证明全量。 |
| 创建密钥 | 更差 | 发现 1、4。名称/到期/归属 UI 可见；本次没有提交。 |
| 编辑密钥 | 缺失 | 发现 2。测试明确要求 unavailable，绿灯不能证明原生对等。 |
| 删除、启停、过期 | 部分 / 未验证 | 删除及 204 有协议测试，当前未删除；过期/泄露状态有单测，单独 revoke/停用语义和批量删除未做实机操作。 |
| 一次性明文、运行时 key、导出 | 已有实现；当前实时未验证 | create-only secret + 已关联凭据库恢复的测试通过；原生也不能重新揭示旧密钥。此次不把单测结果写成导出/CLI 实测。 |
| 模型目录、可用性、价格 | 部分 | token 单价和逐模型资格有测试；发现 6，未执行计费推理。 |
| 邀请、公告、兑换、签到 | 未适配 / 上游合同未逐项复核 | 当前无这些能力声明。缺少代码不等于 Vercel 没有该功能；本次不新增支持承诺。 |
| 导航与不可用动作 | 更差 | 发现 5；没有编辑按钮避免了假按钮，但没有完成任务或提供直接恢复。 |
| BYOK、路由、Virtual Models、Token Pass | 未适配，另属产品范围 | 原生侧导航存在，不算已达到整个 Vercel 控制台体验。 |

## 本次验证与保留证据

- 浏览器 inventory：temp5 专属 profile，CDP 9291。`Extensions.getExtensions` 返回的挂载路径为当前 checkout `.output/chrome-mv3-dev`；只复用该浏览器，没有重启其他浏览器。
- 原生 `/api/user` 为 200 且有身份。分别在新 tab 打开原生/扩展当前路径，1440×1000 下打开创建表单。只展开原生预算，不保存；finally 关闭新建 tabs，保留原有 tabs 和表单。
- 已运行：`pnpm exec vitest run tests/services/apiService/vercelAiGateway/protocol.test.ts tests/services/apiAdapters/vercelAiGateway tests/services/accountSiteOnboarding/contentSession/vercel.test.ts`：4 文件、50 测试通过。
- 未改产品实现，因此未运行 build、完整套件或写操作验收。dev 挂载与当前源码协议测试分别说明，不把 dev 产物等同于一次全新 production build。
- 复现脚本：`node .scratch/vercel-parity-audit/audit-ui.mjs`。要求上述 profile 已运行、原生已登录、现有 extension keys tab 指向 Vercel 账号、英文 UI；脚本固定发现现有页面，不执行 onboarding 或任何创建/保存/删除动作。
- 本地证据（包含账号 UI，不进 Git）：`.scratch/vercel-ai-gateway/evidence/parity-2026-10-26/{result.json,native-create.png,extension-create.png}`。脚本复跑会覆盖这组文件；需保留其他状态时先换输出目录。第一次 native 按钮匹配失败，修正 selector 后原生/扩展均成功；不将失败尝试当作产品故障。另一次开启 screenshot animations=disabled 的复跑在扩展截图等待中超时，已恢复普通截图；此前成功的表单文本与截图仍保留，截图超时不计作产品流程失败。
- 原有 Vercel scratch、凭据、截图及其他未跟踪文件全部保留。只有本审计说明及复现脚本纳入任务变更；本地证据继续供预算/编辑等未解决问题复核，暂无清理建议。

## 官方依据

- [API keys](https://vercel.com/docs/ai-gateway/authentication-and-byok/api-keys)：创建、一次性密钥、角色限制、编辑边界、删除；2026-10-26 检索。
- [Budgets](https://vercel.com/docs/ai-gateway/observability-and-spend/budgets)：预算创建/查看/修改、刷新周期、default budget 继承；2026-10-26 检索。原生创建 UI 提供的具体选项另有当日截图与文本记录。

## 达标条件

先闭合预算创建/展示/编辑、多团队身份、成员权限，再验证失败保留草稿和不确定写入恢复。原生与扩展用同一角色、同一团队、同一资源状态对照，验证新建/编辑后的读回、一次性明文保存、导出、取消和失败恢复。当前只完成审计，不能标记适配体验达标。

## 补齐实施准备（2026-10-26）

用户已要求补齐。基线已 fetch：`HEAD...origin/main` 为 8 ahead / 0 behind，无需 refresh。

沿用账户类型、三个服务域和 PAT 默认；不改变 BYOK / Virtual Models 产品范围。复用原生 ResourceEditor 的 boolean / number / select / multi-select、可见性、校验和 mutation certainty，而非另造编辑器。计划通过现有公开入口验证账户身份、密钥工作区和协议/目录；TDD 技能要求确认测试边界，已向用户提出，确认前仅进行协议调查。

已用当前开发扩展所保存的 PAT 对一次性调查密钥核实：

- `POST /v1/api-keys` 的 `aiGatewayQuota` 接受美元上限、refreshPeriod、alertThresholds。
- **GET 单密钥当前并不返回 quota**；必须从 `GET /ai-gateway/budgets/list?scopeType=api-key` 以 scopeId 关联。创建响应也不包含 quota，不可把缺字段当成“没有预算”。默认预算另从 `/ai-gateway/budgets/defaults/list` 读取。
- `PATCH /v1/api-keys/{id}/quota` 返回顶层 quota；已验证 2 USD / weekly / [50,100] 改为 3 USD / monthly / [75]，随后预算清单读回一致。
- `PATCH /v1/api-keys/{id}` 接受 metadata.spendAttribution；已在一次性密钥上核实 200。原生前端在变更时合并既有 metadata，并排除 tokenPass；实现须核查字段的编辑权限，不能复制只读 metadata。
- 两轮一次性调查密钥均在 finally 删除、全量清单确认不再存在；未执行推理或修改原有密钥。原始记录在本地 `.scratch/vercel-ai-gateway/evidence/parity-contract.json`，调查器 `.scratch/vercel-ai-gateway/probe-parity-contract.mjs`，均不进 Git。
- 旧本地 pat.txt 已失效（读取 teams 得 403）；当前保存于扩展账号的 PAT 读取 teams 和 keys 均为 200。未覆盖凭据文件或铸造新凭据。

后续实现要把“可读但未设置”“不可读”“默认继承”“已移除/archived”分开，不因不完整读回而清除预算。预算和归属可能是两次写入；第一次成功后第二次失败必须报告 possibly-applied，不可当作可安全重试的整体失败。

流程改进评估：现有 native-editor-parity 技能已要求按任务而非单路由判定，现有指南足以覆盖本次教训，不新增全局规则。

## 补齐交付（2026-10-26）

复用已有原生编辑器控件、可见性/校验、表单提交门及 mutation certainty。新增的共享契约仅是本次已验证的具名动态导航可用性和消费预算展示事实，Vercel 协议与权限继续留在专属适配器。没有扩展其他提供商的行为。

| 任务 / 原问题 | 本次结果 | 验证与限制 |
| --- | --- | --- |
| 创建预算、周期及提醒 | 已补齐；最低 $1，支持不刷新/日/周/月与 50/75/100% 提醒 | 红绿协议/编辑器测试；真实 Owner UI 创建 2 USD / weekly，预算清单读回一致。新建后独立补读预算，不再把详情省略 quota 误报为未设置；读失败仍保留一次性密钥交付。 |
| 编辑已有预算、提醒、消费归属 | 已补齐；名字/到期只读，不删建密钥 | 实机改为 3 USD / monthly / team，重开一致；单测验证其他 metadata 保留、tokenPass 不写回、BYOK 设置保留。 |
| 预算展示和移除 | 区分自定义、团队默认继承、未设置、读取失败；原生 archived 操作移除 | 实机移除后读回确认；继承默认值由 fixture 测试，未更改真实团队默认预算。 |
| 错误及并发恢复 | 拒绝把读取失败当空配置；写入后读回不一致/第二步拒绝报告可能已应用，不自动重放 | 行为测试覆盖 503、部分 403、陈旧读回、动态消费增长、移除预算；消费计数变化不构成配置冲突。 |
| 团队选择和保存 | 新表单提供团队选择；一个团队自动选择，多个团队明确选择；保存前再验证当前 PAT 的团队成员关系 | 测试覆盖非默认团队、不允许访问的团队、分页和已有选择保留；当前实机只有一个团队，跨团队实际切换仍需多团队账号。 |
| 当前控制台检测 | 使用 URL 团队 slug，不再取首个团队；completion 尊重明确团队 | 内容会话/协议测试覆盖；找不到 URL 指定团队时不猜测。 |
| 归属权限 | 按当前成员角色提供归属控件；未知/普通成员不提交特权 metadata | 普通成员由 fixture 覆盖，真实账号为 Owner；未假称真实普通成员验证。 |
| 返回原生控制台 | 密钥页提供直接入口；动态解析所保存团队 slug，账户页日志入口同样按团队解析 | 路由与 Header 测试通过；不使用当前浏览器默认团队代替已保存身份。 |
| 密钥/团队分页 | 消费 pagination.next / until，去重并拒绝循环游标 | 协议测试，真实账号没有多页样本。 |
| 创建/编辑界面 | 条件展示预算字段，提醒直接显示可选项；到期不再与章节标题重复 | 已查看真实创建/编辑截图；最终截图和窄屏检查见本地 acceptance 运行。 |
| 模型计价 | 接入已有 PricingPlan：每图、图像尺寸/质量、语音字符、转写秒、按分辨率的视频秒；保留混合图像输入 token 费用 | 上游公开模型目录读取 + fixture/schema 验证。音频开关、mode、voice_control、style、特殊视频 token floor 等未被现有计价选择器表达的复杂规则继续明确不可报价并链接原生来源，不能把条件抹平或报成免费；未发起付费推理。 |
| 模型不可用原因 | 按 HTTP/realtime_websocket 各自请求上下文解释客户验证；保留逐模型资格 | 行为测试覆盖；不会把 HTTP 限制误套到 realtime。 |
| 鉴权、余额及其他范围 | PAT 默认与三个域边界不变；余额仍为团队 USD，不虚构日用量 | PAT 不自动铸造/续期，邮箱验证或失效后更换仍由用户完成。完整用量/套餐、BYOK、Virtual Models、Token Pass 等独立控制台功能没有新增实现承诺。 |
| 文档和翻译 | 中/英/日添加账号文档同步；八种 App 语言补齐相应字段和恢复文案 | 提取后检查未删除原有键或重写 plurals，i18n:extract:ci 已无修改，i18n:status 所有语言 100%。公共支持表的条目/域名/支持边界未变，无需改目录。 |

实际验证：`pnpm exec vitest run` 指定 Vercel 协议/适配器、内容会话、账户表单/路由/注册、共享 bootstrap 和密钥展示/Header 测试，共 **12 文件 / 289 测试通过**（含新建表单异步团队加载回归）；`pnpm exec tsc --noEmit` 最终增量复核通过。受影响源码 ESLint 已通过，提交钩子会运行最后的格式和提取门。

实机重复运行器：`node .scratch/vercel-parity-audit/verify-workflows.mjs --mutate --capture-account`。前提：temp5 专用 Edge profile、CDP 9291、当前 checkout 的 dev 输出已挂载、英文 UI、一个有效 PAT 的保存账号。`--mutate` 只创建唯一名称的一次性密钥，finally 删除并读回确认；不传该参数只打开配置表单。`--capture-account` 额外打开已有账号编辑器；`--account-only --fresh-account` 单独打开全新手动添加表单查看自动团队选择，均不保存账号。源代码不保存凭据，原始截图/载荷在已忽略的 `.scratch/vercel-ai-gateway/evidence/`。

已完成核心实机全链证据：[最终预算与提醒读回](../vercel-ai-gateway/evidence/parity-acceptance-1793015594772/result.json)，含创建、修改、重开、移除、50/100 → 75% 提醒、清理断言；同次后续可选新建账号阶段失败，没有把整次执行记为全通过。已有账号编辑器单独通过：[saved-account](../vercel-ai-gateway/evidence/parity-acceptance-1793015918989/result.json)。新建路径暴露 Radix 异步选项发出的空事件覆盖自动选择，已先用真实 form 回归测试复现，再保持受控值且只接受当前团队选项；修复后 [fresh-account](../vercel-ai-gateway/evidence/parity-acceptance-1793016409637/result.json) 单独通过。已查看最终创建、编辑与 390×844 窄屏图，提交按钮可见。开发者 [BEFORE | AFTER 对照报告](../visual-comparisons/run-yF5d2E/report.md) 和 [并排图](../visual-comparisons/run-yF5d2E/comparison.png) 已保留；后图启用了自定义预算，前图无此功能，状态差异在对比元数据明确记录。

验证中的工具故障保持可见：一次 Playwright 数字值断言写成 number，改成 string 后重跑；一次开发服务持续重编译导致 Options 未挂载，已确认仅 temp5 WXT PID 后重启到 3016，保留 CDP 9291 profile/登录态及其他 worktree。后续 launcher 初始产物就绪竞态、扩展 reload 页面销毁分别失败，待产物生成后 exact-path reload 成功。生成的 options.html 一度引用其他 worktree 的 3000 端口，确认 temp5 的 3016 服务后仅修复本地生成文件指向，未改工具源码或其他 worktree。中断运行的一次性密钥随后按 ID 与唯一名称双重确认删除，清单确认不再存在；这些失败没有计为产品流程通过。

保留/清理：此 spec 和可复用验收脚本进 Git；原始接口调查、失效凭据文件、失败截图和 before/after 图均留本地供复核，未删除或公开。原有未跟踪 scratch 不改动。没有发现超出现有指南、值得新增持久规则的流程改进。

