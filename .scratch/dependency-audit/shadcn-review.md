# shadcn 4 upgrade review

Outcome: CLI upgrade and selective migration verified; retained decisions below.

Investigated 2026-11-10 against local baseline commit `ae931e9955b7d849597b57a3774d4b726f9dd24d` and target `shadcn@4.23.0` (upstream commit `96da9cc7f1aa10580a3741664e2a77c721206c00`). The main task subsequently installed CLI `4.23.0`; its actual read-only results are recorded below. Application/dependency changes are owned by the main dependency-upgrade task. Retain this note with that task until the migration decisions and remaining acceptance evidence are incorporated.

## Required configuration correction

The main task corrected `components.json` → `tailwind.css` from `~/styles/style.css` to `src/styles/style.css`, now verified by CLI 4. The CLI resolves this field with `path.resolve(cwd, config.tailwind.css)`, unlike the import aliases. The previous value resolved to nonexistent `temp18/~/styles/style.css`. This is an existing configuration defect exposed by the audit, not a newly imposed v4 syntax change. [Tagged path resolver](https://github.com/shadcn-ui/ui/blob/shadcn%404.23.0/packages/registry/src/get-config.ts).

Keep `style: "new-york"`, `rsc: false`, `tsx: true`, blank `tailwind.config`, CSS variables, Lucide and all `~/` import aliases. The documented Tailwind 4 configuration leaves the config field blank. CLI 4 retains legacy styles, maps Tailwind 4 to `new-york-v4`, and resolves an existing unprefixed style to Radix. [Configuration docs](https://ui.shadcn.com/docs/components-json), [tagged style resolver](https://github.com/shadcn-ui/ui/blob/shadcn%404.23.0/packages/registry/src/get-config.ts).

## What the CLI upgrade does and does not require

- Upgrade the development CLI to `4.23.0`; use `pnpm exec shadcn info` and `pnpm exec shadcn add <component> --diff` for configuration and selective source review. `--diff` and `--view` imply dry-run; they do not overwrite local components. New presets, `init --base`, and style changes are separate product choices. [CLI v4 release](https://ui.shadcn.com/docs/changelog/2026-03-cli-v4), [preview implementation](https://github.com/shadcn-ui/ui/blob/shadcn%404.23.0/packages/shadcn/src/commands/add.ts).
- Base UI became the default for new projects in July; official guidance explicitly keeps Radix supported and says existing applications do not need migration. The `new-york-v4` combobox itself uses Base UI while button/dialog/select use Radix, matching this repository's mixed setup. [Base UI default announcement](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default), [combobox source](https://github.com/shadcn-ui/ui/blob/shadcn%404.23.0/apps/v4/registry/new-york-v4/ui/combobox.tsx).
- CLI `4.22` changes exported schemas to Zod 4 and `4.23` changes the programmatic MCP server export. The audit found no `shadcn/*` imports in application code, scripts, tests or E2E; these API migrations do not apply here. [Release notes](https://github.com/shadcn-ui/ui/blob/shadcn%404.23.0/packages/shadcn/CHANGELOG.md).

## Selective primitive recommendations

| Surface | Recommendation and evidence |
| --- | --- |
| `input-group.tsx` | Merge `dark:bg-transparent` into `InputGroupInput` after a focused dark-mode check. Upstream explicitly resets the inner background; the local `Input` supplies `dark:bg-input/30`, while `InputGroup` also supplies that background. Plain `bg-transparent` does not cancel the dark variant. Retain local density sizing, `containerClassName`, and focus overrides. `InputGroupTextarea` currently has no inherited dark background, so the same addition is not required there. [Upstream input group](https://github.com/shadcn-ui/ui/blob/shadcn%404.23.0/apps/v4/registry/new-york-v4/ui/input-group.tsx). |
| `combobox.tsx` | Keep local explicit `disabled` forwarding to both primitive and rendered input, exported `ComboboxClear`, available-height flex sizing, density classes and floating-layer policy. The current baseline would remove these adaptations; no mandatory API change was identified. [Upstream combobox](https://github.com/shadcn-ui/ui/blob/shadcn%404.23.0/apps/v4/registry/new-york-v4/ui/combobox.tsx). |
| `dialog.tsx` / `select.tsx` | Keep local toast host, modal-contained floating layer, translated close label, `ActionGroup`, resize-stable selection and popper positioning. Upstream's optional footer Close button and `item-aligned` select default are behavior changes, not upgrade requirements. [Dialog source](https://github.com/shadcn-ui/ui/blob/shadcn%404.23.0/apps/v4/registry/new-york-v4/ui/dialog.tsx), [select source](https://github.com/shadcn-ui/ui/blob/shadcn%404.23.0/apps/v4/registry/new-york-v4/ui/select.tsx). |
| `button.tsx` / `calendar.tsx` | Preserve analytics/loading/slotted-disabled behavior and density/text scaling. Sampled current registry implementations do not establish any required new API migration. DayPicker dependency acceptance remains part of the main upgrade checks. [Button source](https://github.com/shadcn-ui/ui/blob/shadcn%404.23.0/apps/v4/registry/new-york-v4/ui/button.tsx), [calendar source](https://github.com/shadcn-ui/ui/blob/shadcn%404.23.0/apps/v4/registry/new-york-v4/ui/calendar.tsx). |

Existing `forwardRef` wrappers can be modernized separately while preserving their public ref contracts; wholesale replacement is unnecessary. Several local primitives already use React 19 props and `data-slot`. The Tailwind/React guidance describes these template updates as non-breaking. [Tailwind 4 / React 19 guide](https://ui.shadcn.com/docs/tailwind-v4).

## Preserve the local class-merging contract

September registry templates now import `cn` from a package, and `add` may propose installing it. Existing helpers continue to work; migration is optional. Here `src/lib/utils.ts` extends Tailwind Merge's spacing groups with `density-*`, so it is not the stock five-line helper. Keep generated components on `~/lib/utils` and retain this configuration. Do not run `migrate cn` or replace the helper without proving the custom conflict rules survive. [Official cn announcement](https://ui.shadcn.com/docs/changelog/2026-09-cn), local `src/lib/utils.ts`.

## Current default style versus this existing project

The current default visual preset is **Nova**: CLI 4.23's `init --defaults` explicitly selects `base-nova`. Keeping Radix while choosing that visual style corresponds to `radix-nova`. This is separate from Base UI being the default primitive library. The preset picker offers eight styles; it does not label Nova as a universally required migration for existing applications. [Tagged init source](https://github.com/shadcn-ui/ui/blob/shadcn%404.23.0/packages/shadcn/src/commands/init.ts), [preset definitions](https://github.com/shadcn-ui/ui/blob/shadcn%404.23.0/packages/shadcn/src/preset/defaults.ts).

Upstream calls `new-york-v4` a **legacy source registry**: its source is authored directly, whereas `radix-nova` and `base-nova` are generated from shared primitive bases and style tokens. Registry builds still include `new-york-v4`; the checked official material does not mark it deprecated. The components-json docs deprecate the old `default` style, which is a different name. [Registry architecture](https://github.com/shadcn-ui/ui/blob/shadcn%404.23.0/apps/v4/registry/README.md), [configuration docs](https://ui.shadcn.com/docs/components-json).

The concrete Nova design difference is reduced padding and margins; the other new styles offer different geometry, spacing and typography. Moving to a generated style aligns future component additions with that newer shared base/style system. It does not automatically improve the existing copied primitives. This repository already owns custom density, corners, text scaling, token colors and interaction contracts, so those must be reconciled against any new baseline. No functional improvement or migration necessity was established for replacing them wholesale. [Style descriptions](https://github.com/shadcn-ui/ui/blob/shadcn%404.23.0/apps/v4/registry/styles.tsx), [new-style scope](https://ui.shadcn.com/docs/changelog/2026-03-luma).

Recommendation: finish the dependency/configuration update and selective fix while retaining `new-york`. If adopting Nova is desired, scope it as a deliberate design-system migration with representative comparisons, then merge the new baseline into customized primitives. Do not merely rename `components.json.style`: it changes future registry selection while leaving copied components on the previous baseline. `shadcn apply` is also broader than that setting; it reinstalls components and updates theme, CSS variables, fonts and icons while retaining the primitive base. [Apply announcement](https://ui.shadcn.com/docs/changelog/2026-04-shadcn-apply).

## Actual CLI 4 validation

All commands below exited successfully using the installed `4.23.0` executable on 2026-11-10. They were run without component installation or overwrite operations:

- `pnpm exec shadcn --version`: `4.23.0`.
- `pnpm exec shadcn info`: framework `Manual`, TypeScript enabled, React server components disabled, Tailwind `v4`, style `new-york`, base `radix`, icon library `lucide`, import alias `~`; CSS resolved to `G:\Development_Data\WorkSpaces\orca\all-api-hub\temp18\src\styles\style.css`. All five configured source aliases resolved into `src`.
- `pnpm exec shadcn add input-group --diff input-group.tsx` and `pnpm exec shadcn add combobox --diff combobox.tsx`: both reported dry-run and showed transformed source using the project's component alias. The input-group preview confirms upstream `dark:bg-transparent`; the main task's selective local edit now includes it. Remaining differences remove local density classes, the input wrapper sizing/focus overrides, `~/lib/utils`, and the capitalized `~/components/ui/Textarea` import. Keep those local adaptations.
- `pnpm exec shadcn add input-group --dry-run`: proposes overwriting four files (`button`, `input`, `textarea`, `input-group`) and lists `cn` and `radix-ui` dependencies. It proposes no CSS change.
- `pnpm exec shadcn add combobox --dry-run`: proposes overwriting the same files plus `combobox`, and lists `cn`, `radix-ui` and `@base-ui/react`. Its source preview still uses Base UI for combobox and would remove explicit disabled forwarding, the exported clear primitive, modal-aware floating layers and available-height/density adaptations. It proposes no CSS change.

These dependency lists are proposals, including packages already installed; they are not evidence that installs occurred. No preview was applied. The live CLI results support the selective-merge recommendations above.

## Acceptance

Research, path checks and actual CLI 4 configuration/diff previews are complete. The registry sample is button, input group, combobox, dialog, select and calendar; it is not an exhaustive audit of every customized UI component.

The main task ran the existing InputGroup, SearchableSelect, MultiSelect, UI and density-spacing tests, and completed a dark/light browser regression and before/after comparison for the input-group change. See the [implementation and acceptance record](benefit-review.md#已实施的依赖升级含-shadcn) and [visual gallery](artifacts/visual-review.md). The broad Base UI migration, preset replacement and `cn` replacement remain outside this dependency update.

## 补充审查：其他组件有哪些值得跟进的更新

日期：2026-11-10；应用基线：`e06955ca51`。用户追问后，将审查从六类抽样扩大到 **25 个有直接 registry 对应的本地原语**，同时检查 DatePicker、Tooltip 和相关自有封装。对照同一 `shadcn@4.23.0` 标签中的 `new-york-v4` 与现代 `bases/radix`，Base UI 组件另对照 `bases/base`。这是当前能力差异审查，没有声称复原每个历史版本的引入日期，也没有把 ui 目录所有自有业务封装都算成 shadcn 原语。

**上一轮的不足是筛选过窄。** 只合入 InputGroup，是因为当时将组件改动集中在必需迁移或已复现的问题；这不能推出“其他组件没有值得采用的更新”。用户关心升级与新版实践带来的收益，新能力、交互细节、组合 API 和减少重复代码同样应纳入。保留 `new-york` 只保留当前视觉基线，不意味着冻结本地组件实现。

### 为什么上一批改了那些依赖和配置

| 改动 | 实际理由 |
| --- | --- |
| Base UI | Combobox 的异步高亮、焦点等底层修复与当前用法有关；Tooltip 也是实际消费者。运行包更新后其内部实现直接生效，不要求每个封装文件都产生 diff。 |
| AI SDK 和 providers | 验证流程直接使用这些包；有协议、流式结果、拒绝响应等兼容收益。`interrupted` 是需要补代码适配的真实语义变化，已用 HTTP 回归覆盖。 |
| Tailwind、tailwind-merge、Prettier 及插件 | 配套更新解析/样式生成/类名合并/格式化能力；Prettier 显式读取本项目 CSS 主题后，自定义类排序才使用真实主题。 |
| shadcn CLI 与 CSS 路径 | 新 CLI 改进组件获取、预览、差异检查；路径修复让它正确找到主题。CLI 升级不会自动重写已经复制进仓库的组件源码。 |
| 旧 Tailwind 配置、forms、autoprefixer、Knip | 前两项没有实际加载，autoprefixer 重复 v4 的内建处理；Knip 转而追踪实际 CSS 入口。动机是让配置准确反映当前工具链，而不是追求少几个包。 |

具体版本、官方变更记录、行为适配与验证见 [升级记录](benefit-review.md#已实施的依赖升级含-shadcn)。这是第一批选择，并未证明其他依赖没有升级价值。

### 值得优先采用的改进

以下优先级按具体收益和现有消费者判断。除 InputGroup 外，这些应用改动尚未实施；源码差异不等于每项都已复现成浏览器故障。

| 优先级 | 组件与上游改进 | 本项目受益处与采用方式 |
| --- | --- | --- |
| 高 | **Textarea：aria-invalid 错误边框/焦点样式。** [上游](https://github.com/shadcn-ui/ui/blob/shadcn%404.23.0/apps/v4/registry/new-york-v4/ui/textarea.tsx) | 本地仅从自有 error/success/variant 选择样式；ResourceJsonField、NativeResourceField、ResourceTextEntriesField 已直接传 aria-invalid。应让语义上的错误状态也驱动一致视觉反馈，保留清空、字数和自适应高度。 |
| 高 | **Combobox：列表 overscroll-contain。** [现代基础组件](https://github.com/shadcn-ui/ui/blob/shadcn%404.23.0/apps/v4/registry/bases/radix/ui/combobox.tsx) | CompactMultiSelect、BrowserTabSitePicker、托管资源字段使用可滚动列表。吸收滚动边界隔离，减少滚轮/触摸到边界后带动外部页面；保留可用高度、密度与浮层策略，并验证长列表弹窗。 |
| 高 | **TableRow：内部菜单展开时保留行高亮。** [上游](https://github.com/shadcn-ui/ui/blob/shadcn%404.23.0/apps/v4/registry/new-york-v4/ui/table.tsx) | 用量历史同步等表格每行都有菜单，指针离开行进入 portal 菜单后仍应容易辨认来源行。采用展开状态样式时，同时检查固定操作单元格的独立背景。 |
| 高 | **Button：xs 文字按钮；Tabs：共享 default/line/方向样式。** [Button](https://github.com/shadcn-ui/ui/blob/shadcn%404.23.0/apps/v4/registry/new-york-v4/ui/button.tsx)、[Tabs](https://github.com/shadcn-ui/ui/blob/shadcn%404.23.0/apps/v4/registry/new-york-v4/ui/tabs.tsx) | BrowserApiLab 有重复的 h-6/text-xs 按钮覆写；自动签到和弹窗 Tabs 重复长样式。增加适配密度的公共能力，迁移已有重复调用，同时保留文本缩放、统计、计数和响应式布局。新样式无需默认套到所有界面。 |
| 中 | **Checkbox / Switch：扩大实际点击区。** [Checkbox](https://github.com/shadcn-ui/ui/blob/shadcn%404.23.0/apps/v4/registry/bases/radix/ui/checkbox.tsx)、[Switch](https://github.com/shadcn-ui/ui/blob/shadcn%404.23.0/apps/v4/registry/bases/radix/ui/switch.tsx) | 现代模板用伪元素扩大目标，不放大视觉图形，对紧凑表格和移动端操作有收益。本地 Switch 有 overflow-hidden，不能直接粘贴；需检查裁切、相邻按钮重叠、禁用与 indeterminate。 |
| 中 | **CardAction、Popover 标题/说明组合、AlertAction。** [Card](https://github.com/shadcn-ui/ui/blob/shadcn%404.23.0/apps/v4/registry/new-york-v4/ui/card.tsx)、[Popover](https://github.com/shadcn-ui/ui/blob/shadcn%404.23.0/apps/v4/registry/new-york-v4/ui/popover.tsx)、[Alert](https://github.com/shadcn-ui/ui/blob/shadcn%404.23.0/apps/v4/registry/bases/radix/ui/alert.tsx) | 密钥修复、WebDAV 同步、支持/公告弹层和权限引导已手工组织标题/状态/操作。共享组合 API 可减少重复排版；保留窄屏堆叠和长译文支持。PopoverTitle 本身不会自动建立 aria-labelledby，需要由语义拥有者处理。 |
| 中 | **Field 的错误与说明结构、响应式方向。** [组件与用法](https://github.com/shadcn-ui/ui/blob/shadcn%404.23.0/apps/v4/content/docs/components/radix/field.mdx) | 自有 FormField 目前显示普通错误段落，label 的 htmlFor 可选，描述/错误不会自动关联输入。账号汇率字段就是实际使用点。参考 FieldError 的 alert、多错误去重、布局与显式 aria-invalid/描述关联做增量完善；直接换 Field 同样不会自动补齐所有关联。 |
| 中/低 | **Command 共享选中标记、Calendar 月份按应用 locale 格式化。** [Command](https://github.com/shadcn-ui/ui/blob/shadcn%404.23.0/apps/v4/registry/bases/radix/ui/command.tsx)、[Calendar](https://github.com/shadcn-ui/ui/blob/shadcn%404.23.0/apps/v4/registry/bases/radix/ui/calendar.tsx) | SearchableSelect、CompactMultiSelect 重复勾选图标；可在迁移调用处时统一，避免双图标。Calendar 的 locale 应继续来自应用语言，但当前调用未开启月份下拉，因此不能宣称现有用户已遇到下拉语言故障。 |

### 25 个原语的核对结果

| 原语 | 处理判断 |
| --- | --- |
| button | 建议加入适配本项目的 xs；icon-xs/sm/lg、React 19 ref 已有。保留 loading、统计和 asChild 禁用语义。 |
| input | 核心 invalid/file/mobile-text 等已跟进；可补默认 data-slot，保留 InputGroup 显式覆盖能力及密码/清空功能。 |
| textarea | 优先吸收 aria-invalid 视觉反馈；data-slot 可随同补齐。 |
| checkbox | 建议研究扩大点击区；mixed/disabled 语义保留。 |
| switch | 建议研究扩大点击区；保留自有大小/onChange 和密度。 |
| select | 小尺寸、箭头、滚动控制等主要能力已有。上游 item-aligned 默认属于布局选择；保留当前 popper 和浮层内 resize 稳定行为。 |
| combobox | 优先列表滚动隔离；保留 disabled 双转发、Clear 导出、可用高度和浮层能力。 |
| command | 建议共享选中指示，需迁移现有调用。CommandDialog 的组合/关闭行为不能机械换成现代基础模板。 |
| input-otp | slot 防御、active/invalid、caret 等已覆盖；spellCheck=false 是低成本补充，当前数字 OTP 收益较小。 |
| calendar | 建议完善 locale；焦点、range 标记、外部日期、formatter/component 接口和 RTL 箭头已有。尚无 range-mode 产品消费者，不为模板新增范围选择。 |
| progress | 保留本地实现：已规范 max/value 并把 value 传给 Radix Root；抽查上游模板省略该转发，照抄会损失确定进度的语义。 |
| spinner | 状态语义、翻译和尺寸已有；data-slot 可补，保留装饰性场景的隐藏逻辑。 |
| input-group | 已合入暗色内层透明背景；现代基础模板没有证据要求移除现有密度/输入容器适配。 |
| dialog | 内容区可选关闭能力已有；Footer 可选关闭按钮可简化信息弹窗。保留翻译、toast、嵌套浮层和忙碌时的关闭约束。 |
| sheet | sides/可选关闭 API 已基本同步；data-side、共享关闭按钮可低优先级跟进。 |
| popover | 建议加入 Header/Title/Description 组合；保留 ShadowRoot container 与浮层策略。 |
| dropdown-menu | 主要能力已同步；现代 checkbox/radio inset、关闭时溢出裁切可参考。不把 trigger-width 全局套到省略号菜单。 |
| collapsible | 与上游功能基本一致；自有 CollapsibleSection 继续提供标题/控制状态/面板能力。 |
| tabs | 建议公共样式变体和方向布局；现有 Radix 方向参数已经透传，不能将缺少统一样式说成缺少键盘语义。 |
| card | 建议 CardAction 与子槽位；自有 padding/variant 已覆盖一部分现代小卡片需求。 |
| badge | 可增加 ghost/link、区分静态标签与可点击标签的 hover；保留业务状态色和 adornment，检查长译文。 |
| alert | 建议操作槽；保留自有图标、状态色和紧凑布局。 |
| separator | decorative/role/orientation 已有；可补槽位/ref 或统一到已安装 Radix，优先级较低。 |
| label | 可参考 grouped-disabled 样式，但当前 FormField 没有这套状态协议，须有真实消费者后一起接入。 |
| table | 除展开行高亮外，可补统一槽位；nowrap/固定紧凑间距不能覆盖现有长字段换行设计。 |

逐组件原始对照、上游链接及实际调用行号保留在 [控件明细](artifacts/controls-review.md) 和 [浮层/布局明细](artifacts/overlays-review.md)。现代基础组件中的 cn-* / IconPlaceholder 等是生成器输入，不是可以原样复制的项目样式。还发现现代 Radix Tabs 源码没有将解构的 orientation 继续传给 Root，而 new-york-v4 有：采用新能力仍需核对行为，不能仅依据“更新”替换。

### 其他自有封装与新组合方式

- **DatePicker** 是组合组件，不存在一份同名 registry 原语可直接更新。本地已支持预设、locale、自然语言输入、无过期等；月份/年份快捷导航是可评估的新能力。
- **EmptyState** 已有 live-region、错误状态、loading/统计操作。现代 Empty 的组合式媒体/内容槽可在需要插图、输入框等内容时参考；直接替换会丢失已有状态语义。[Empty](https://github.com/shadcn-ui/ui/blob/shadcn%404.23.0/apps/v4/registry/new-york-v4/ui/empty.tsx)。
- **ActionGroup / CardItem / CardList** 可参考 ButtonGroup 的连体按钮焦点层级、Item 的组合与列表语义，但它们分别服务响应式动作排列、设置行等不同场景。已有 CardItem 在可点击时使用 button，不能只为统一模板换成普通 div。[ButtonGroup](https://github.com/shadcn-ui/ui/blob/shadcn%404.23.0/apps/v4/registry/bases/radix/ui/button-group.tsx)、[Item](https://github.com/shadcn-ui/ui/blob/shadcn%404.23.0/apps/v4/registry/bases/radix/ui/item.tsx)。
- **Tooltip** 是 ui 目录外的 Base UI 消费者，有 portal、持续可访问描述、触摸点击、嵌套焦点/关闭策略；新版的分拆 primitives/shared provider 是可参考的 API，不应删除这些实际能力。

### 补充验证发现：Tooltip 与旧 jsdom

上一轮没有运行 `tests/components/Tooltip.test.tsx` / `IconButton.test.tsx`。本次补跑 **39 项中 37 项通过、2 项失败**，均为 scoped ShadowRoot 的可见性断言。这修正了上一轮验收覆盖的边界，不能把它们计为通过。[原始日志](artifacts/tooltip-upgrade-followup.log)。

诊断得到可重复证据：Base UI 在定位前暂设 opacity:0，定位后已移除。失败点记录为 `{inlineOpacity:"", computedOpacity:"0", connected:true}`；jsdom 27.0.1 的独立 ShadowRoot 复现同样保留过期计算值，而 Chromium 同样操作恢复为 opacity:1。官方 [v1.1 源码](https://github.com/mui/base-ui/blob/v1.1.0/packages/react/src/utils/useAnchorPositioning.ts) 没有该暂隐步骤，[v1.8](https://github.com/mui/base-ui/blob/v1.8.0/packages/react/src/internals/useAnchorPositioning.ts) 已有，因此属于本次跨越版本暴露的测试环境缺陷，不能称作 v1.9 独有问题。[失败点证据](artifacts/tooltip-style-cache-diagnostic.log)、[Chromium 对照](artifacts/shadow-style-browser.json)。

单纯等待可见性和显式传 anchor 的诊断均未解决缓存问题；所有诊断性应用/测试改动已撤回，没有弱化断言或给产品加测试环境补丁。普通 Tooltip 外观 E2E **2 项通过（含构建）**，但这不等于已完成 scoped ShadowRoot 浏览器验收。[E2E 日志](artifacts/tooltip-followup-browser.log)。

这使 **jsdom 成为新增的、有具体收益证据的升级候选**。当前 latest 31.0.0 明确重做样式计算与 Shadow DOM 支持，但也有 canvas 后端、解析/加载时序等重大变化，需要单独做测试环境迁移；本次没有安装或验证该新版，不能承诺它已解决本仓两个失败。[官方发布记录](https://github.com/jsdom/jsdom/releases/tag/v31.0.0)。

本轮交付为补充审查与证据；未将表格中的建议擅自实施为新界面行为。建议下一批先处理 Textarea、Combobox、TableRow、Button xs 和 Tabs，再推进点击区及 Card/Popover/Alert/FormField 的组合能力。
