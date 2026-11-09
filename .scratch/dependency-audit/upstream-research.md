# 依赖升级的官方迁移核对

后续已按用户“收益优先”要求同步主线；下文 TS7/ESLint 的本地状态为原基线调查，当前实施情况见 [收益优先复核](benefit-review.md)。官方迁移约束仍可作为参考。

核对日期：2026-11-10。代码基线：`adbd21980a`；重点核对 `b2a1d0cd1a`（Vite 8 / WXT）、`3bbdb4f229`（React 19 列表兼容）、`037c8b7870`（测试缓存）。本文件记录官方资料与本地静态核对；未运行应用、旧版本浏览器或迁移实验，不把历史测试文件的存在视为本轮执行成功。完整版本及安全清单由同目录主审计负责，查询时点之后 registry 与文档可能变化。

## 判断

近期升级已经处理了实质迁移问题，并非只改版本号。Vite / WXT 和 Vitest 配置整体符合对应版本的官方要求；更值得补齐的是 Tailwind 4 的配置收尾、浏览器兼容证据，以及 React 的新版静态规则。TypeScript 7 是值得单独验证的性能迁移，直接替换当前 `typescript` 包会影响现有 API 消费者。

## Vite 8 / WXT 0.21.5：核心迁移已有落实

- Vite 8 改用 Rolldown / Oxc，默认浏览器目标提高到 Chrome / Edge 111、Firefox 114、Safari 16.4。本地 [wxt.config.ts](../../wxt.config.ts) 的 `build.target` 显式保持原先的 Chrome / Edge 107、Firefox 104、Safari 16，避免构建器默认值悄悄抬高 JS 目标。代码还保持 `minify` 的标准布尔配置，没有强退回旧 esbuild 管线。[Vite 8 迁移指南](https://vite.dev/guide/migration)
- Vite 8 改变 ESM 文件导入 CommonJS 默认导出的语义；本地 [src/lib/countup.ts](../../src/lib/countup.ts) 统一处理该差异，[tests/config/wxtBuildOutput.test.ts](../../tests/config/wxtBuildOutput.test.ts) 包含压缩产物实际导入与渲染测试。这比仅依赖 jsdom 单测更贴合该升级的风险。[官方 CommonJS 迁移说明](https://vite.dev/guide/migration#consistent-commonjs-interop)
- WXT 0.21 将 Vite 变为必需 peer、web-ext 变为开启开发浏览器所需的可选 peer；项目在 [package.json](../../package.json) 中直接声明两者合理，不能因主源码没有 import 就删除。Node >=24、TS 5.9.3 满足其 Node >=22、TS >=5.4 要求；Vite 8 在 WXT 支持范围内。[WXT 升级指南](https://wxt.dev/guide/resources/upgrading)，[0.21.5 package 源码](https://github.com/wxt-dev/wxt/blob/wxt-v0.21.5/packages/wxt/package.json)
- [wxt.config.ts](../../wxt.config.ts) 使用 `@wxt-dev/module-react` 注册 React 插件；[tests/config/wxtReactPlugin.test.ts](../../tests/config/wxtReactPlugin.test.ts) 从该模块的实际解析路径核对弃用选项。应继续以模块实际使用的插件版本为准。WXT 0.21.5 本身是该分支的小版本修复更新，官方发布说明没有要求额外应用迁移。[WXT 0.21.5 发布记录](https://github.com/wxt-dev/wxt/releases/tag/wxt-v0.21.5)

## Tailwind 4：存在配置收尾和兼容证据缺口

1. **优先核实浏览器承诺。** Tailwind 4 官方下限是 Safari 16.4 / Chrome 111 / Firefox 128，依赖 `@property` 和 `color-mix()`；这高于本地构建目标及 Firefox manifest 的 `104.0`。[官方浏览器要求](https://tailwindcss.com/docs/upgrade-guide#browser-requirements) [postcss.config.js](../../postcss.config.js) 已有旧 Chromium ring fallback，说明项目做过局部兼容处理，但这不能证明完整 Tailwind 4 样式覆盖旧浏览器。[.github/workflows/e2e-smoke.yml](../../.github/workflows/e2e-smoke.yml) 的 Firefox smoke 使用 `latest`。目前结论是最低版本支持缺少充分证据，不能据此断言所有旧浏览器已坏，也不是 Vite 8 此次新引入的 Tailwind 要求。下一步应在声称支持的最低版本验证实际页面和注入 UI，或调整产品支持范围。
2. **Prettier 没有接入当前 CSS 主题。** [.prettierrc.mjs](../../.prettierrc.mjs) 加载 `prettier-plugin-tailwindcss`，却没有 `tailwindStylesheet`。官方 v4 用法要求提供 CSS 入口，才能读取 CSS 主题与自定义工具类；本项目对应 [src/styles/style.css](../../src/styles/style.css)。这是格式化配置缺口，不是页面运行故障。[插件官方配置说明](https://github.com/tailwindlabs/prettier-plugin-tailwindcss#specifying-your-tailwind-stylesheet-path-tailwind-css-v4)
3. **旧 JS 配置与 forms 应按实际消费者清理。** [tailwind.config.js](../../tailwind.config.js) 仍定义 v3 式 content / darkMode / forms；当前 CSS 采用 `@import`、`@theme`、`@custom-variant` 和 typography `@plugin`，没有 `@config` 引入旧文件。Tailwind 4 不自动加载 JS 配置，因此不能将旧文件视为构建生效的配置。先补 Prettier CSS 入口，再确认旧配置及 `@tailwindcss/forms` 是否仍有工具消费者；若仅是遗留即可删除。不要为了“激活现有配置”直接补 `@config`，这可能改变表单全局样式。[官方 JS 配置兼容说明](https://tailwindcss.com/docs/upgrade-guide#using-a-javascript-config-file)
4. **Autoprefixer 是删除候选；PostCSS 仍有职责。** Tailwind 4 已内建导入和 vendor prefixing，官方允许移除 autoprefixer。本地仍在 [postcss.config.js](../../postcss.config.js) 最后运行它，可比较生成 CSS 后清理。但项目还有 Tailwind 变量隔离、content rem 隔离及脚本 AST 消费，不能连同 PostCSS 整体删除。官方推荐 Vite 插件提升性能属于可选优化，迁移前要保证这些自定义转换次序仍成立。[官方 PostCSS / Vite 迁移说明](https://tailwindcss.com/docs/upgrade-guide#using-postcss)

## React 19：新规则有价值，Compiler 不应强行开启

[eslint.config.js](../../eslint.config.js) 当前仅启用 `rules-of-hooks` 和 `exhaustive-deps`，[package.json](../../package.json) 保留 hooks 插件 5.x。新版推荐规则还涵盖 render 期间 refs、状态写入、不可变性、组件静态定义等；官方明确这些诊断可在尚未采用 Compiler 时使用。因此建议先升级插件并运行新增规则审计，再按真实问题处理，不能把“lint 目前通过”等同于已满足所有新版 React 规则。[React 官方 ESLint 说明](https://react.dev/reference/eslint-plugin-react-hooks)

React 19 不会自动开启 Compiler；本地没有 Compiler 插件配置。Compiler 可以按目录、显式注解或开关逐步采用，是测量后再决定的可选优化，不是 React 19 迁移必须项。本项目使用 `@vitejs/plugin-react` 6.x；若试验 Compiler，应按新版 `@rolldown/plugin-babel` / `reactCompilerPreset` 方式集成，而不是复制旧版 `react({ babel: ... })` 配置。需注意 WXT 已注册 React 插件，避免重复注册。[官方安装说明](https://react.dev/learn/react-compiler/installation)，[渐进采用](https://react.dev/learn/react-compiler/incremental-adoption)

## Vitest 4：迁移模式正确，安全补丁优先于升级 5

[vitest.config.ts](../../vitest.config.ts) 使用 `test.projects` 分离 node / jsdom、每个项目 `extends: true`、限定 `test.dir`，并显式声明 `coverage.include: src/**/*.{ts,tsx}`；没有继续使用已删除的 `environmentMatchGlobs`、`poolOptions` 或 `coverage.all`。这些恰好对应官方 v4 的关键迁移点，尤其显式 coverage.include 避免只统计本次加载的源码。Vitest 与 coverage-v8 也均固定在 4.0.17。[Vitest 4 官方迁移指南](https://v4.vitest.dev/guide/migration.html)

新增 `experimental.fsModuleCache` 在本地安装的 4.0.17 API / 实现中存在，且由环境变量控制。没有证据要求把全部测试迁往 Browser Mode。配置符合 v4 迁移模式不代表当前补丁版本安全；主审计已另行核对安全通告，优先跟随其 4.1.12 修复建议。后续若升 5，需要单独验证自定义 shard sequencer、blob / coverage 合并和 CI 缓存；主站现已展示 v5 迁移，不能把其中的默认继承等行为倒推成 v4 已有行为。[Vitest 当前迁移指南](https://vitest.dev/guide/migration.html)

## TypeScript 7：有性能收益空间，但不是直接替换

TypeScript 7 官方发布声明其原生编译器在上游完整构建样本通常有 8–12 倍加速，这是上游基准，尚未测量本仓收益。7.0 不提供旧 JavaScript compiler API；官方为依赖 API 的工具提供 `typescript` → `npm:@typescript/typescript6` 兼容别名，同时可另装原生版本提供 `tsc`。[TypeScript 7 官方发布说明](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)

本项目 [scripts/utils/typography.mjs](../../scripts/utils/typography.mjs) 与 [scripts/utils/color-tokens.mjs](../../scripts/utils/color-tokens.mjs) 直接 `import ts from "typescript"`，调用 `createSourceFile` / `forEachChild` 等 API；当前 typescript-eslint 8.45.0 的本地 peer 范围为 `<6.0.0`。所以单纯升级到 TS7 会破坏工具集成。建议单开迁移：先协调 typescript-eslint 与 TS6 API 支持，再并行验证原生编译器诊断、冷/热类型检查耗时及内存，最后切换 `compile`。当前 typescript-eslint 官网仍只声明 API 包支持 `<6.1.0`，不能把原生编译器版本当成相同 API 依赖。[typescript-eslint 兼容范围](https://typescript-eslint.io/users/dependency-versions/)

## 保留与验证边界

保留本文件作为可复用的迁移决策依据，交由主审计纳入任务提交；没有生成额外下载、页面 dump 或截图。上述“候选清理”尚未改变配置或依赖。真正迁移时分别需要 CSS 产物比较与相关 UI 验证、规则审计、工具链行为测试；本轮静态调查不替代它们。
