# AI/ML API 结构化价格与剩余合同

Status: ready-for-human

截至 2026-11-02；实现核对版本 `9a4a1acd73`。本文保留当前来源、关键取舍和未决语义；历史逐轮统计、全量清单及 HTML 实验不再作为交付文档。

## 来源与处理边界

- 唯一运行时来源是公开 `GET https://api.aimlapi.com/v1/models?include=pricing`，不带账号凭据。默认目录及 OpenAPI 不列价格，不证明没有机器价格源。[官方目录文档](https://docs.aimlapi.com/api-references/service-endpoints/complete-model-list)。
- 缺失、无效或冲突价格保留模型与原因；不回退 HTML、模型页、sitemap 或 slug 猜测，不恢复逐模型网页阶梯白名单。
- 同 ID 合并端点能力，但不能覆盖不同价格合同。只在固定 Token、完整主记录一致、重复部分为同价子集且无额外未知条件时复用完整记录，不拼出上游未声明的费率合集。
- 单条声明由 `catalogPrice.ts` 映射，跨记录由 `apiPricing.ts` 协调；金额使用共享 canonical quote engine，不另建计算器。
- 保留币种、单位、分母、缓存、条件、独立收费及估算声明。同价 inference/reasoning 只有 phase 明确且不同才去重，缺失/空 phase 不能据此合并。
- 已公布费率与具体用量报价分开。缺条件、variable、未计入独立费用时保留参考/部分结果，不升级为完整确定报价。
- 缓存版本 `structured-pricing-v13` 避免复用旧 HTML/白名单/本地说明；复用版本机制，不清空其他站点数据。

## 共享取舍

| 决策 | 理由与边界 |
| --- | --- |
| 条件规则 | AIMLAPI、AiHubMix、Vercel 共用互斥规则编译；金额相同但选择轴不同不能折叠 |
| 阈值 | 公共层已有范围/缓存/边界能力；只有 from/units 时仍不能猜选档轴及边界 |
| 本地解释 | AIMLAPI、RelayFor、Krill 用结构化 source.notes，经 UI 翻译；AiHubMix 真正的上游原文独立保留 |
| 解释和问题 | notes 不替代 issues，不因补解释改变完整性或 attention；脱敏导出省略任意上游文本 |
| 展示与报价 | canonical plan 分别投影 published pricing 和 scenario quote，不把默认场景当完整合同 |
| 复杂公式 | 无明确消费者不建任意公式引擎；先核实面积基数、取整、逐图/逐任务最低量及累进顺序 |

RelayFor/Krill 的本地说明缓存版本为 `pricing-source-notes-v1`，不加旧文案转换桥。规则属性插入顺序不构成费率差异，金额、币种、分母、额度及未知原因仍参与比较。

## 未决合同及关闭条件

1. **阈值选档**：调查中 71 个 ID 只有 from/units，缺统一选档轴、边界、缓存定义；OpenAPI/include=all 未补齐。需完整可引用合同及边界回归，不能恢复六模型白名单。数量只属于当次快照。
2. **同 ID 多合同**：Gemini 聊天/绘图、Grok 生成/编辑、估算与部分固定记录、路由判定与推理不能无条件合并。需明确多合同选择、精度、浏览/比较/缓存/诊断约定，不能删除冲突检测。
3. **非线性用量**：“两张 1MP”与“一张 2MP”总量相同也可能不同价。先核实基数、取整、每图/任务范围及输入/输出，再贯穿计算与 UI 验证。
4. **现场差异**：用户曾报告 158 项需检查，尚无足够证据复现；后续不同快照不能替代解释。保留本地响应及缓存调查，待取得同目录、筛选、比较条件后重放。

## Grok 有界探针

[probe-grok-contracts.mjs](probe-grok-contracts.mjs)是设计探针，不是生产适配器。2026-11-02 样本：生成 fixed 0.02 USD/张；编辑输出 0.02 USD/张、输入 0.002 USD/张均 variable。两张生成图应可报 0.04 USD；编辑不能给确定总价或输出小计，未选操作不能默认报价。

| 直接映射 | 拒绝理由 |
| --- | --- |
| 保留整体 rulesUnavailable | 固定生成也被阻断 |
| 清除整体 rulesUnavailable | 动态编辑被当作完整报价 |
| issues 限制两个图片 meter | 固定生成仍被阻断 |
| 仅限制 referenceImage | 编辑输出仍被当作确定小计 |

四方案均通过 schema，但没有同时满足要求。规则只有 id/conditions/rates，限制/精度在整个方案；meter 也不能区分两个操作中同一个输出的确定性。结论仅覆盖这些候选，不宣称穷举全部实现；按原范围停止生产扩展，保留冲突保护。没有付费生成/编辑或账单证据。

复现：当前 WXT dev 输出、精确安装构建及对应 CDP 就绪后，设置 `CDP_URL`，运行 `node .scratch/aimlapi-pricing/probe-grok-contracts.mjs`。使用实时公开目录及真正的 schema/published/quote API，只清理自己拥有的临时页面，输出在本地 `artifacts/`。费率或 variable 声明变化须重新核查。

## 维护验证与本地证据

- AIMLAPI `modelCatalog.test.ts`、`structuredOnly.test.ts`：匿名请求、单来源、合并/冲突、缺价、取消及未来字段。
- `tests/services/modelPricing/`、AiHubMix/Vercel 价格测试：规则、用量、币种、条件及边界。
- `tests/features/ModelList/`、`e2e/modelListPartialPricing.spec.ts`、`e2e/modelListPricingDiagnostics.spec.ts`：参考/部分价格、说明、诊断、实际页面；受控 fixture 不代表扣费核实。
- `pnpm e2e:cdp:aimlapi:pricing` 是维护中的页面验收；`node .scratch/aimlapi-pricing/audit-catalog.mjs` 是独立只读审计，需要当前 WXT dev 构建及 `CDP_URL`。可用 `--responses=<capture>` 重放，未记录请求应失败。

原始响应、逐模型历史清单、重放、截图和失败记录继续保留本地 `.scratch/visual-captures/aimlapi-audit/`、本目录及账号集成 `artifacts/`。移出交付的文档/生成器库外副本位置见账号集成本地 `artifacts/pr-split-state.json`。当次 778 个 ID、762 个数值方案、88 项需检查仅是历史结果，不承诺当前数量或全部精确报价。本次整理不重新宣称执行全部现场验收。
