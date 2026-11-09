# 收益优先的依赖复核

日期：2026-11-10。用户明确要求：**评估现有依赖升级本身的好处，并核对升级后是否遵从新版最佳实践；安全和包体缩减不优先。** 收益包括新功能、API 与开发体验、兼容性、生态支持、维护便利和性能改进，同时计入迁移成本。性能只是一个评估维度，不是任务目标，也不是每项升级必须通过的门槛；没有现存性能痛点不妨碍某个升级值得做。

此前把该要求扩展成了构建、页面渲染和 React Compiler 专项性能优化，属于范围误解，现撤回这些待办。保持现有依赖审查范围：逐项说明版本变化的价值、是否值得升级，以及 API、配置和代码用法需要怎样跟进。新增优化工具、重构渲染和性能专项不在本次范围。

## 当前基线与已落地收益

原审查基于 `adbd21980a`，其中 TS7 尚未接入。继续工作前 fetch 发现分支落后主线 10 个提交，已将本地审查提交 rebase 到 `d1bb127181`，得到 `654eb9728f`。恢复引用：`recovery/temp18-before-performance-refresh-20261110`。range-diff 确认原审查提交内容不变，frozen-lock 安装通过。

主线 `3e5f40dc8f` 已完成以下变更，本轮同步后实际核对：

- `compile` 使用稳定 TS7.0.2 原生编译器，通过 `@typescript/native` alias 调用，保留增量检查及一个 checker 的内存策略。
- `typescript` alias 指向 TS6.0.2 的 JavaScript compiler API；颜色、字体检查和 ESLint 的 API 消费者仍能使用它。符合 [TS 官方并存方案](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-60)。
- ESLint10 与 typescript-eslint8.72.1 已同步；当前规则仅需语法信息，已移除不必要的 `projectService` 全项目语义分析。
- Hooks ESLint 已升至 7.1.1；但当前仍显式开启两条规则，新版推荐诊断的全面采用并不自动发生。
- i18next/react-i18next 已更新同线版本，react-tooltip 已移除。旧清单仅是历史快照，不能按旧清单再做一次这些迁移。

因此，上一轮“先迁移 TS7、升级 ESLint/Hooks”的待办已失效。它们仍是合理的收益方向，但已经由主线交付。Vite8/WXT 的迁移也已落地。

## 已完成的类型检查对照（保留证据，不作为后续任务目标）

在同一源码、Node24.14.1、同一机器上顺序运行两个真实编译器。原生侧保留生产命令的 `--types "*" --checkers 1`；JS侧使用兼容包的 `tsc6`。最终有效对照中，两者均显式 `--types "*" --noEmit --incremental`，每个编译器/轮次使用新的独立 `tsBuildInfoFile`，随后用相同文件做增量复跑。这里的冷启动指没有增量记录，不代表清空了操作系统文件缓存。

默认 Node 堆限制的首轮：

| 编译器 | 无增量记录 | 已有增量记录 | 结论 |
| --- | --- | --- | --- |
| TS7 native | 25.396 秒，退出 0 | 1.436 秒，退出 0 | 当前原生检查可完成 |
| TS6 JavaScript | 70.955 秒后约 4GB 堆 OOM，退出 134 | 未运行 | 失败样本，不能用来计算加速比例 |

首次对照因 OOM 自动停止，保留失败证据。第二组仅对基准进程统一使用 `node --max-old-space-size=8192`，JS侧64.547秒后因环境类型缺失退出2；确认JS侧也需 `--types "*"`，因此这组不计入有效性能比较。前两组JS参数与生产原生检查不等价，不能作为项目故障或严格跨版本性能结论。

对齐环境类型发现后，两轮交换编译器执行顺序，不同时运行其他测试或构建；统一给基准进程8GB的Node堆上限，不修改项目默认设置。**8次有效检查全部退出0，无编译诊断。**

| 场景         | TS6 JavaScript 第一轮 / 第二轮 | TS7 native 第一轮 / 第二轮 |
| ------------ | ------------------------------ | -------------------------- |
| 无增量记录   | 57.870 / 50.308 秒             | 13.699 / 13.802 秒         |
| 已有增量记录 | 8.235 / 9.670 秒               | 1.071 / 1.186 秒           |

两轮中点对比：无增量记录约3.9倍，增量复跑约7.9倍。样本只有两轮，且为本机、当前配置；报告原始区间比把倍数当普遍承诺更合适。**这证明主线已经落地的原生检查有明显收益，不是本任务又实现了一次提速。** 默认堆的原生成功记录另行保留，不混入这组数值。

复核命令如下；每次比较先选一个全新的增量文件路径，重复同一命令才是热增量检查：

```powershell
node --max-old-space-size=8192 node_modules/@typescript/native/bin/tsc --types "*" --checkers 1 --noEmit --incremental --tsBuildInfoFile .scratch/dependency-audit/artifacts/native-new.tsbuildinfo --pretty false
node --max-old-space-size=8192 node_modules/typescript/bin/tsc6 --types "*" --noEmit --incremental --tsBuildInfoFile .scratch/dependency-audit/artifacts/javascript-new.tsbuildinfo --pretty false
```

复查首轮两个增量文件记录，排除编译器内置库和 node_modules 后，实际存在的 **5,592 个仓库输入文件集合完全相同**。这比较的是当前原生检查与现有 TS6 API 兼容编译器，不是重建原 TS5.9 分支；不同主版本的诊断语义仍有差异。通过与耗时也不等于所有错误诊断集合已证明相同。

## 后续审查范围与判断方式

每项现有依赖回答三个问题：**新版带来什么好处？结合项目与迁移成本是否值得升？升级后有哪些新版 API、配置和推荐用法需要落实？** 区分必需迁移、推荐实践和可选新能力，避免把可选优化当成迁移未完成。

| 对象 | 后续应核对的内容 |
| --- | --- |
| 已升级的 TS7/API 兼容包、ESLint/Hooks、Vite/WXT、i18next | 确认当前真实版本、迁移完整性与推荐配置；已经落地的升级不重复列为待办。 |
| AI SDK、React Query/表格/虚拟列表、UI 组件等现有运行依赖 | 对比所跨版本的功能、API、兼容与维护收益，再结合现有消费者作升级判断；不要求先有性能痛点或显著加速证明。 |
| Tailwind、Prettier 及插件 | 核对版本配套、CSS 入口、旧配置是否仍生效及官方推荐用法。配置收尾本身就在用户要求内，不因它没有提速就降为不重要；不由此另起构建架构优化项目。 |
| Vitest 及 coverage 插件 | 同时评价新测试能力、API/配置变化、开发体验和迁移成本；性能旧实验只是其中一项证据，不能据此直接否决升级。报告布局和覆盖率语义需完整迁移。 |
| 以安全修复或包体缩减为主要理由的项目 | 保留调查结论，按用户要求降低优先级；不把这两个指标当成首要筛选标准。 |

## Vitest 既有性能证据（不单独决定升级取舍）

复查发现仓库已有 [CI 性能调查](../ci-runner-performance/spec.md#2026-11-04-vitest-510-大版本升级筛选)，上一轮审查没有纳入这份证据，现予纠正。

- 旧实验使用 Vite7.3.2、同源码、两个 threads worker、隔离、四个文件/191 用例和覆盖率。Vitest4.0.17 两轮为 94.92/94.23 秒，5.1.0 为 100.63/95.80 秒，未观察到加速。
- 新旧覆盖率有语句命中的源码数相差两个文件；真实失败分片报告合并回归也因 blob 布局变化失败。测试通过不代表迁移完整。
- 同一记录另试过4.1.12，未证明时间收益，同样涉及 blob 布局迁移。它是安全修复候选，不应包装成确定的性能升级。
- 旧实验没有覆盖当前 Vite8、新版热缓存、coverage cache 或全量 Ubuntu，因此不能断言当前5.x一定慢；但足以说明“直接升级就会明显更快”缺少证据。后续若实验这些新条件，复用已有对照驱动并保持相同测试集合和覆盖率含义。

新版 [官方迁移指南](https://vitest.dev/guide/migration.html) 确实说明 inline projects 可共享 Vite server，减少重复转换；这只是机制层面的收益机会，不能代替本仓测量。

## 前一轮调查与保留

本轮已完成主线同步、已落地工具链核对和类型检查基准；用户后续澄清后，撤回专项性能优化待办，将后续工作恢复为依赖升级价值与新版最佳实践审查。没有另外修改 package、lockfile、应用或构建配置；没有声称已完成新的 Tailwind/React/Vitest 迁移。先前清单的功能/API收益仍需按上述范围补齐评估，不能把性能调查冒充完整的升级研判。本文件是后续决策入口；原清单和官方资料保留为历史调查，并添加了当前结论链接。

原始默认堆对照位于 `artifacts/typescript-profit-eOyUmR/`；参数未对齐的较大堆对照在 `artifacts/typescript-profit-8gb-3OzZ7F/`；**最终有效对照**在 `artifacts/typescript-profit-aligned-VPdt6E/result.json`。日志、增量文件和结果 JSON 留在本地供复核，受 feature 局部 ignore 保护，不删除失败证据。正式结论保留在 Git；不把本地单机数值当作 CI 或所有机器的速度承诺。

## 已实施的依赖升级（含 shadcn）

后续补充：用户追问后，已将 shadcn 审查从六类抽样扩大到 25 个对应原语及相关封装，列出更多值得采用的能力；补跑 Tooltip / IconButton 39 项发现 2 项受旧 jsdom Shadow DOM 样式缓存影响的失败，尚未修复。见 [完整组件建议与验证边界](shadcn-review.md#补充审查其他组件有哪些值得跟进的更新)。以下保留上一批实际已完成的升级与验证，不能解读为覆盖了全部组件。

实施基线：`ae931e9955`；本轮再次 fetch 后为相对 `origin/main` ahead 3 / behind 0，无需再次刷新。Node 24.14.1、pnpm 12.6.0，Windows。以下是已经落地的选择，不表示所有依赖都必须追到最新版本。

| 对象 | 锁定版本变化 | 与项目有关的收益和适配 |
| --- | --- | --- |
| shadcn CLI | 3.6.3 → 4.23.0 | 使用新版项目检测和组件预览/差异工具；实际运行 `info`、input-group / combobox 的 `--diff` 和 `--dry-run` 成功。修正 CSS 文件路径；对六类本地组件核对模板，合入 InputGroup 暗色背景修正。详见 [shadcn 审查](shadcn-review.md)。 |
| Base UI | 1.1.0 → 1.9.0 | 本仓的 Combobox 使用 `autoHighlight`，可受益于异步结果高亮、焦点与关闭后 typeahead 状态修复；保留现有封装。没有为可选 `createItems` 等 API 改写业务。[1.9 发布记录](https://base-ui.com/react/overview/releases/v1-9-0#combobox)。 |
| AI SDK | 7.0.148 → 7.0.165 | 跟进现有验证路径的 provider 兼容修复；处理新 `interrupted` 完成原因，避免把截断响应误报为成功。没有添加 realtime / steering 等新功能。[核心变更记录](https://github.com/vercel/ai/blob/ai%407.0.165/packages/ai/CHANGELOG.md)。 |
| AI providers | Anthropic 4.0.85 → 4.0.99；Google 4.0.102 → 4.0.114；OpenAI 4.0.99 → 4.0.111；Compatible 3.0.75 → 3.0.87 | Google 的流式文本/工具顺序、临时错误重试分类，以及 Compatible 拒绝内容和 content-filter 等行为修复。当前 SDK 调用提供内部构造的 prompt；没有依赖被删除的 ModelMessage 运行时 schema 校验。onChunk 仅选择 raw 错误块，没有需要补 ping 分支的穷尽映射。[Google](https://github.com/vercel/ai/blob/ai%407.0.165/packages/google/CHANGELOG.md)、[Compatible](https://github.com/vercel/ai/blob/ai%407.0.165/packages/openai-compatible/CHANGELOG.md)。 |
| Tailwind / PostCSS 插件 | 4.1.17 → 4.3.5 | 跟进生成 CSS、空 var fallback、Safari @property fallback 等修正。保留扩展变量隔离和 content rem 隔离的 PostCSS 次序；这不等于旧浏览器支持范围已经完全验证。[精确版本记录](https://github.com/tailwindlabs/tailwindcss/blob/v4.3.5/CHANGELOG.md)。 |
| tailwind-merge | 3.3.1 → 3.7.0 | 与新版工具类解析配套；保留本仓 density spacing 冲突扩展和覆盖测试。没有换成 registry 新 cn 包。 |
| Prettier / 插件 | Prettier 3.2.4 → 3.9.10；sort-imports 4.1.1 → 4.7.1；Tailwind 插件 0.7.1 → 0.8.1 | 跟进 JS/TS、Markdown、YAML 格式化兼容修复；显式提供 Tailwind CSS 入口后，自定义密度和字号工具类按项目主题排序。保留原导入分组，仅格式化任务文件。[Prettier 3.9](https://prettier.io/blog/2026/06/27/3.9.0)、[插件配置](https://github.com/tailwindlabs/prettier-plugin-tailwindcss#specifying-your-tailwind-stylesheet-path-tailwind-css-v4)。 |

### shadcn 风格选择

**本次保留 `new-york`。** 当前 CLI 新项目默认是 `base-nova`；保留 Radix 时对应的现代风格为 `radix-nova`。`new-york-v4` 被上游称为 legacy source registry，但仍参与受支持的 registry 构建，没有查到要求现有项目迁出的弃用说明。Nova 会改变组件间距、主题、字体等；本仓已经有密度、浮层、关闭文案、按钮状态与统计等适配，换风格需要单独做设计系统迁移。跟进新版组件修复不以换风格为前提。[精确 CLI 默认值](https://github.com/shadcn-ui/ui/blob/shadcn%404.23.0/packages/shadcn/src/commands/init.ts)、[registry 说明](https://github.com/shadcn-ui/ui/blob/shadcn%404.23.0/apps/v4/registry/README.md)。

### 配套配置与行为验收

| 变化 | 断言与实际结果 | 证据 |
| --- | --- | --- |
| shadcn CSS 路径从 `~/styles/style.css` 改为实际文件路径 | 原配置解析到不存在的 `~/` 目录；修正后 CLI info 正确解析 `src/styles/style.css`。保留 import aliases、new-york、Radix 配置。 | [CLI 记录与模板审查](shadcn-review.md#actual-cli-4-validation) |
| Prettier 读取 CSS 主题 | 旧配置将自定义类排在 flex 前；新配置将 `text-2xs gap-density-3 flex items-center` 排为 `flex items-center gap-density-3 text-2xs`。真实格式化探针红→绿。 | [.prettierrc.mjs](../../.prettierrc.mjs) |
| Tailwind 4 配置收尾 | 删除未加载的 JS 配置与 forms；移除 v4 内建前缀处理后重复的 autoprefixer。Knip 直接跟踪 CSS 入口，识别 typography / tailwind / 动画包，移除不再需要的 ignore。最终 Knip 无诊断。 | [配置](../../postcss.config.js)、[Knip 日志](artifacts/upgrade-knip-final.log) |
| InputGroup 暗色背景 | 增加 `dark:bg-transparent`，避免内层 Input 与外层 group 背景重复叠加。新增浏览器断言：旧版 dark 失败、light 通过；修复后两者通过，保留对照图。 | [测试](../../e2e/themeCoverage.spec.ts)、[失败日志](artifacts/input-group-red.log)、[最终复验](artifacts/browser-final-account.log) |
| 截断流不得误报探测成功 | 使用真实 AI SDK 与 MSW HTTP 响应，发送 OpenAI 部分文本 OK 后省略 response.completed。旧适配返回 pass，新增测试失败；新适配把 interrupted 视为失败，无重试到另一模式。现有错误和调用者取消优先级保留。 | [HTTP 回归](../../tests/services/aiApiVerification.modes.http.test.ts)、[红](artifacts/interrupted-red.log)、[绿](artifacts/interrupted-green.log) |
| 现有 UI / SDK 行为 | 升级前 43 文件 / 776 测试通过；升级后扩大到 46 文件 / 786 测试通过。新增中断适配后重跑 SDK / 模型质量 30 文件 / 573 测试通过；格式化后 InputGroup / cn 的 9 测试通过。 | [基线](artifacts/upgrade-baseline-tests.log)、[升级后](artifacts/upgrade-tests.log)、[适配后](artifacts/interrupted-green.log)、[格式化后](artifacts/final-format-tests.log) |
| 浏览器外观和注入隔离 | Chromium 升级前 10 项通过；升级后 12 项通过（均含构建）。覆盖主题、字体、320/390/1280 宽度、跨窗口/重载/重置、注入 UI 字体隔离。最终 locator 调整后两项 InputGroup + build 再次通过。 | [前](artifacts/browser-before.log)、[后](artifacts/browser-after.log)、[最终输入框](artifacts/browser-final-account.log) |
| 类型检查 | 升级后 `pnpm compile` 通过；中断适配后的最终检查另留日志。 | [升级检查](artifacts/upgrade-compile.log)、[最终检查](artifacts/final-compile.log) |

复现核心命令：

```powershell
pnpm compile
pnpm knip
pnpm exec shadcn info
pnpm exec shadcn add input-group --diff
pnpm exec shadcn add combobox --dry-run
pnpm exec vitest run tests/components/MultiSelect.test.tsx tests/components/CompactMultiSelect.test.tsx tests/components/SearchableSelect.test.tsx tests/components/InputGroup.test.tsx tests/components/ui tests/services/aiApiVerification tests/services/modelQuality tests/services/verification/agentTestEnvironment.test.ts tests/utils/densitySpacingSource.test.ts tests/utils/cn.test.ts --maxWorkers=4
pnpm exec playwright test e2e/themeCoverage.spec.ts e2e/appearanceSettings.spec.ts e2e/fontSettings.spec.ts --workers=1 --output=.scratch/dependency-audit/artifacts/browser-recheck
```

### 视觉证据与验证边界

[完整前后对照画廊](artifacts/visual-review.md) 内嵌 18 个检查点的 BEFORE / AFTER 图，包含明暗主题、窄屏、字体与输入框。手工检查了暗色账号弹窗对照、320px 暗色外观抽屉、默认浅色引导页；其余图片保留供开发者复核。输入框内外背景接缝已消除，所查面板未见新增排版问题。引导页截图在动画过程中略淡，基线同样如此，因此不把它当作完整静态颜色验收；相关自动颜色断言结果单独保留。像素差异是描述性证据，没有用来声称自动视觉通过。

本地运行了模拟 HTTP 和 Chromium 扩展检查；未调用真实付费 provider，未完成 Firefox / Safari 或声称支持的最旧浏览器全套验证，也未运行全量 CI。Hooks 7 的额外推荐诊断仍未启用：本轮推荐规则探针连已知 purity 违规样本也未报错，不能把零诊断当作有效采用。这是保留的工具链调查项，不影响本次依赖安装和现有 lint 规则，也不引入 React Compiler。Vitest 跨版本报告迁移和整体 UI 风格迁移仍不属于本批变更。
