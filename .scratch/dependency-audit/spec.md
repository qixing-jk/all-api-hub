# 依赖存在价值、升级优先级与迁移完整性审查

审查日期：2026-11-10。原始代码基线：`adbd21980a0941128ea9b9985515698cd2f6b7e6`，分支 `temp18`。原始版本清单及以下安全调查是该基线快照。

**用户调整：优先考虑实际收益，安全和包体缩减不优先。** TS7/ESLint 等主线变化使部分旧建议过时；依赖选择与实测见 [收益优先复核](benefit-review.md#已实施的依赖升级含-shadcn)，最终组件和 jsdom/Node 实施结果见 [组件跟进结论](shadcn-review.md#全量建议跟进2026-11-10)。下面保留原始调查，不能当作当前安装版本清单。

## 结论

后续评估现有依赖升级带来的新功能、API 与开发体验、兼容性、生态支持、维护便利及性能改进，并核对新版最佳实践与迁移成本。性能只是升级收益的一个维度，本任务不扩展为专项性能优化或新增 React Compiler 等工具。安全修补、依赖数量和包体缩减不作为当前首要驱动。不要依据本文件原安全调查顺序直接实施。

根项目共 **112 个直接依赖（59 个运行依赖声明、53 个开发依赖）**；官方 npm 查询有 **82 个可更新，32 个跨首位版本号**。这只是版本差距，不代表 82 个都必须升级。实际安装 React 是 **19.2.0**，不是 package.json 下限 19.1.1；判断使用锁定版本。[完整版本/引用清单](inventory.md)。

原基线中，Vite 8/WXT 迁移有明确的产物兼容处理和回归保护；Tailwind 4 则有配置遗留。原 TS7/API 阻碍已由后续主线通过原生编译器与 TS6 API 双包解决，不能继续把它列成待实施升级。

## 1. 原安全维度调查（不代表当前实施优先级）

| 优先级 | 当前 → 建议候选 | 原因与实际暴露判断 | 升级验收重点 |
| --- | --- | --- | --- |
| 高 | DOMPurify 3.2.6 → 3.4.17 | `src/components/MarkdownContent.tsx` 实际清洗 Markdown 转出的 HTML，属于真实安全边界。官方记录包含旧版清洗绕过；部分其他公告要求 IN_PLACE、hook 或 SAFE_FOR_TEMPLATES，本地并未启用，不能把全部命中都说成可利用。传递依赖中另有 3.4.15，也需一起核对。 | 恶意 HTML/SVG/URI、details 状态、链接属性、流式内容更新；真实浏览器验证清洗后的 DOM。 |
| 高 | fast-uri 4.1.4 → 4.2.3 | `src/utils/core/proxyUrl.ts` 的代理地址校验依赖它。以现有解析参数和判定表达式复查，`%68ttp://example.com:8080` 和 `%u0068ttp://example.com:8080` 被接受为 http；普通 javascript 被拒绝。确认存在非法 scheme 接受问题，尚未证明后续消费者可利用。 | SOCKS/IDN/IPv6/认证地址及编码 scheme 回归，保留旧 Chromium 的非特殊协议兼容。 |
| 高 | Zod 4.3.5 → 4.6.7 | 官方审计命中大集合校验资源耗尽公告，修复下限 4.6.6。实际是否有不受控的大数组输入仍需沿各 schema 核验，不能只靠升级替代输入上限。 | 配置导入、规则 schema、AI 工具参数的成功/错误结构与过大输入。 |
| 高（开发环境） | Vitest + coverage-v8 4.0.17 → **4.1.12** | 当前版本命中 UI/API server 公告，Windows UI/Browser Mode 或网络暴露场景相关。当前配置主要为 node/jsdom，默认 `vitest run` 不等于受影响 UI server。官方 V4 维护线仍有 4.1.12，peer 支持 Vite 8；无需为此立即跨到 5.1。 | 运行、覆盖率、blob 合并、JUnit、失败报告保留、分片 CI；两个包版本必须一致。 |
| 中 | lodash-es 4.17.21 → 4.18.1 | 审计命中 template 注入及原型污染相关函数。应用直接引用是 mergeWith、escapeRegExp、union、isPlainObject，未发现直接使用公告中的 template/unset/omit/pullAt；适合维护升级，不能报告成已验证应用代码执行漏洞。 | 合并语义、站点规则、URL 白名单、模型去重。 |

依据：[DOMPurify 官方发布记录](https://github.com/cure53/DOMPurify/releases)、[3.2.6 清洗公告](https://github.com/advisories/GHSA-v8jm-5vwx-cfxm)、[fast-uri 官方公告](https://github.com/fastify/fast-uri/security/advisories/GHSA-w74x-v6f9-j3xg)、[Zod 公告](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)、[Vitest 官方公告](https://github.com/vitest-dev/vitest/security/advisories/GHSA-5xrq-8626-4rwp)、[Lodash 公告](https://github.com/advisories/GHSA-r5fr-rjxr-66jc)。候选版本取当日官方 registry；实施时重新查询。

官方源完整审计返回 **299 条记录：4 critical、107 high、150 moderate、38 low**，按公告 URL 去重为 269；其中 74 条记录涉及声明上的 production 路径。这不是扩展中的 299 个可利用漏洞：包含传递依赖、多版本、开发工具，以及未确认进入最终产物的 Lobe UI 子图。尤其 `postcss` 目前被列在 dependencies，分类为 production 不表示它会在用户浏览器中执行。

开发链优先检查 `react-devtools → electron/cross-spawn`、`web-ext/WXT → addons-linter/fx-runner`、`shadcn → MCP/Hono`、ESLint/TypeScript ESLint 的传递依赖。**react-devtools 8.0.0 仍声明 electron ^23.1.2、cross-spawn ^5.0.1**，所以升级到最新不能解决全部旧链问题；要评估现有 standalone 调试需求、上游支持和可隔离程度。保留开发能力，不直接删除或强制跨版本 override。

## 2. 哪些依赖有理由存在，哪些适合清理

`node node_modules/knip/bin/knip.js --include 'dependencies,unlisted,unresolved'` 通过。但 Knip 能识别“被配置引用”，不能证明配置实际被加载；也不能证明整个包进入发行产物。

| 依赖/组合 | 观察 | 判断 |
| --- | --- | --- |
| autoprefixer | `postcss.config.js` 在 Tailwind 4 后再次执行；官方说明 v4 已自动处理前缀。 | 优先做移除对照实验；比较最终 CSS 和旧浏览器行为，保留两个自定义 PostCSS 处理步骤。收益待测，不能声称显著提速。 |
| @tailwindcss/forms + tailwind.config.js | forms 只在旧 JS 配置里；当前 CSS 没有 `@config` 或 forms `@plugin`，也没有其他显式配置加载。v4 不自动加载 JS 配置。 | 强清理候选。先确认是否原本需要 forms 样式；如果需要，应显式接入并审查 UI 变化；否则移除失效配置及依赖。 |
| postcss | 实际用于 PostCSS 链，以及 `scripts/utils/color-tokens.mjs`、`typography.mjs`。 | 保留；移到 devDependencies 更符合用途，分类调整本身不会降低发行包大小。 |
| @lobehub/icons + @lobehub/ui + antd + fluent-emoji | 应用使用品牌图标；icons5 的 peer 要求 ui5/antd6，ui5 再要求 fluent-emoji4。 | 不能因没有直接 antd/UI import 就删包。它们主要满足图标 peer 链；可独立评估替代资源或 icons6，但要保留品牌覆盖、许可证与实际渲染。 |
| Lobe 6 迁移 | icons6 peer 改为 ui6/react/lucide；ui6 又要求 motion13/14、fluent-emoji5、splinetool runtime。 | 不保证升级后更轻；先比较完整依赖图、安装量及实测产物，不能单独升 icons 后强行压制 peers。 |
| radix-ui + @base-ui/react + cmdk + react-tooltip | 分别支撑现有基础组件、Combobox、命令式检索与全局 Tooltip。 | 多个库不自动等于重复能力。整体收敛属于 UI 迁移，涉及键盘、焦点、浮层和无障碍，当前没有足够收益证据支持重写。 |
| dayjs + date-fns + chrono-node | dayjs 做业务格式化/日期计算；date-fns 的 locale 服务 react-day-picker；chrono 做自然语言输入。 | 职责不同，保留；不能仅凭“都是日期库”要求统一。 |
| @plasmohq/storage | 多处持久化和跨上下文监听；WXT 已存在不使它自动冗余。 | 保留，替换须单独审计存储编码、watch、迁移与写锁。 |
| @tanstack/react-query | ModelList 目录有实际查询、重试、缓存失效和 signal 取消使用。 | 保留；5.x 同线更新优于另建缓存层。当前已有 v5 对象参数等用法。 |
| QuickJS + tokenizer | 可选 JS 测试沙箱和模型上下文计数；有明确的按需 import。 | 保留；重依赖是否值得继续优化以启动/内存/包体测量为准。 |
| whatwg-fetch | `tests/setup.shared.ts` 明确导入，服务测试环境。 | 暂不删；Node24 自带 fetch 不证明 jsdom/MSW 的 Request/Response/abort 合约完全等价。 |

依据：[Tailwind 4 迁移指南](https://tailwindcss.com/docs/upgrade-guide)，以及本地消费者和 package peer 元数据。更详细的迁移证据见 [官方资料审查](upstream-research.md)。

## 3. 升级后是否采用了新实践

### Vite 8 / WXT：主要迁移有落实

`b2a1d0cd1a` 同时调整 Vite、React plugin、WXT，并添加 `src/lib/countup.ts` 处理 Rolldown 的 CommonJS 默认导出差异；`tests/config/wxtBuildOutput.test.ts` 验证真实压缩产物。当前 `wxt.config.ts` 显式限定 HTML 扫描入口，避免诊断目录中的第二份 React；保留浏览器构建 target。本轮确认这些代码仍存在，并跑过 scan/CountUp 单测；没有重跑完整压缩产物或浏览器矩阵。

但是 **JS build target 不等于 CSS 兼容性证明**。本地 target Chrome107/Firefox104/Safari16 低于 Tailwind4 官方基线 Chrome111/Firefox128/Safari16.4。仓库有特定 CSS fallback，但不能据此宣称所有样式均兼容。后续样式升级必须选择：以最旧支持浏览器补证，或单独调整公开兼容承诺；不能顺手静默提高要求。

### Tailwind / Prettier：存在明确的迁移遗漏

除了 autoprefixer 和失效 JS 配置，`.prettierrc.mjs` **没有 `tailwindStylesheet`**。官方 Tailwind4 格式化插件要求指向 CSS 入口，才能理解 `src/styles/style.css` 中的主题和自定义 utilities。当前 Prettier 插件顺序正确（Tailwind 插件最后），应保留；补入口时同时评估 `cn`/CVA 的格式化需求，先观察格式 diff，再决定批量格式化范围。

Prettier 3.2.4 → 3.9.10、sort-imports 4.1.1 → 4.7.1、Tailwind 插件 0.7.1 → 0.8.1 适合成组维护，但与业务变更分开，避免大面积格式噪声。[插件官方说明](https://github.com/tailwindlabs/prettier-plugin-tailwindcss)。

### React：现代版本已用，lint 与类型没有完全跟上

React/DOM 实际 19.2.0；React types 19.1.12、DOM types 19.2.2，适合跟随运行时同步。Hooks ESLint 仍 5.2.0，配置只启用 rules-of-hooks/exhaustive-deps；升级到 7.x 并评估新版推荐规则，可发现更多并发/编译器友好性问题。React Compiler 是可选优化，不是 React19 合规前提，不能以没开 Compiler 判定升级失败。[React 官方 lint 说明](https://react.dev/reference/eslint-plugin-react-hooks)。

### TypeScript 7：性能价值高，但直接升级会破坏现有工具

根项目 5.9.3，官方 latest 7.0.2；视频工具独立项目已经使用 7.0.2，不能据此推断根项目也可直接迁移。根项目 `scripts/utils/typography.mjs` 和 `color-tokens.mjs` 使用 TypeScript 的 JavaScript compiler API；TS7 原生包不提供旧 API。另外当日新版 typescript-eslint 的 TypeScript peer 仍为 `>=4.8.4 <6.1.0`。

可行候选是分离原生 `tsc` 与 JS API 消费者，按官方 alias 方案保留 TypeScript6 API，并升级相容的 lint 工具，再测根项目 compile/lint/hooks。官方性能数据属于上游测试，**本仓没有 TS7 前后耗时对比**。[TS7 官方发布及 API 迁移说明](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)。

## 4. 其余版本差距如何处理

| 分组 | 候选与建议 |
| --- | --- |
| AI SDK | ai7 与四个 provider 均有同线 patch 更新，作为一组维护；验证流式取消、tool/schema、OpenAI compatible、模型探测。不把 SDK 上游功能自动等同于第三方网关兼容。 |
| UI 小版本 | React/DOM/types、Base UI、Radix、React Query、ECharts、Tailwind/merge 可按组件域推进；选择日期、Combobox、表格、虚拟列表、动画等真实交互验收。 |
| 大版本运行库 | TanStack Table9、Motion14、i18next27/react-i18next18、messaging4、react-arborist4、tooltip6、marked18、p-queue10 逐组阅读迁移说明；当前没有证明必须立即跨代。队列/消息涉及后台协议，优先语义稳定。 |
| 工程工具 | ESLint10、Vitest5、jsdom31、MSW3、lint-staged17、web-ext10、publish-browser-extension6 都独立于用户端速度。先完成安全维护，再根据具体能力收益决定迁移；Node 类型继续与项目 Node24 基线匹配，不跟 latest26。 |
| docs | 使用 VuePress2 RC 通道。实际 core/bundler rc24 → `next` rc31，theme/sitemap rc112 → rc137；Vue3.5.18 →3.5.45、sass1.89.2 →1.108.1。必须协调 core/bundler 与插件 peers，跑 docs:check。**不能使用 latest 指向的 VuePress1，也不能只信 outdated 的两项结果。** |
| tools/product-video | 独立 npm package-lock：Remotion 四包4.0.529 →4.0.542，React/DOM19.3.0 →19.3.1；TS7.0.2 已跟上。按该项目自己的 check/render 验证，不污染根锁文件。 |

## 5. 原建议拆分与验收（顺序由收益复核替代）

1. **安全维护批次**：DOMPurify、fast-uri、Zod、Lodash，以及 Vitest/coverage 同线升级；按消费者写红测试或使用能证实修复的上游回归案例，升级后重新审计所有实际解析版本。开发链告警按调用场景分别处置。
2. **Tailwind 配置清理批次**：明确 forms 是否需要；补 Prettier 样式入口；移除重复前缀步骤前保留 CSS 对比；保留扩展 CSS 隔离与 ring fallback。旧浏览器兼容缺口必须单列。
3. **React 工程检查批次**：对齐 runtime/types，引入新版 Hooks lint，先分析新规则命中再逐项修复，避免整库自动改写。
4. **TypeScript 性能实验批次**：原生编译器与 JS API 分离。相同机器/提交分别测冷编译、增量编译、lint/commit hooks；至少多次采样，检查错误集合一致。收益足够后才正式切换。
5. **剩余功能域维护**：AI SDK、UI、国际化、消息/队列、docs/video 各自成组。没有证据的性能承诺不进入结论。

任何性能实验应固定 Node/pnpm/源码、缓存状态、浏览器和数据量；对比 cold build、连续共享文件 rebuild、peak RSS、compile/lint、弹窗/设置页首次显示、发行包体。沿用仓库 diagnostics 和 E2E 工具。单纯依赖数量、锁文件大小或上游 benchmark 不能替代这些指标。

## 6. 本轮证据与边界

- 已执行：根项目和 docs 的官方 registry outdated；根项目 list；根锁文件官方 security audit；重点包 latest/peer/dist-tags 核验；Knip dependencies/unlisted/unresolved 检查；近期升级 diff 和实际消费者检查。
- 已执行：`node node_modules/vitest/vitest.mjs run tests/config/wxtDependencyScan.test.ts tests/lib/countup.test.ts tests/components/MarkdownContent.test.tsx --reporter=dot`，**3 文件、5 测试通过**。这只确认当前基线，不验证未来升级版本或安全公告复现。
- fast-uri 用已安装解析器和本地相同校验表达式验证了编码 scheme 被接受；直接 Node 导入 TS 模块曾因该包 CJS named export 失败，随后改用包 default 导出复查。没有把 Node 加载限制误报为 Vite 应用故障。
- 默认 npmmirror audit endpoint 不存在，切换官方 registry 后完成。最初 `pnpm knip` 触发 pnpm 按现有锁文件自动同步 node_modules 和 `wxt prepare`，随后因 PowerShell 逗号参数转换失败；改用直接 Node CLI 正确传参后通过。没有主动升级依赖，Git 中的 manifest/lockfile 未变。
- video 使用 npm lock，`pnpm outdated` 无法读取；改查 package-lock 与官方元数据。docs 的 RC 通道另查 dist-tags，避免漏报或降级。
- 未做：依赖升级、新版本兼容测试、完整构建、浏览器实测、包体可达性分析、性能 A/B、逐一验证所有审计公告；未将这些项目写成通过。

保留在 Git：本文件、[inventory.md](inventory.md)、[upstream-research.md](upstream-research.md)，用于后续升级决策。`artifacts/` 中原始 registry/installed/audit JSON 留在本地且被局部忽略，作为当前审查证据，不应外发包含本地绝对路径的安装清单。没有删除其他材料。
