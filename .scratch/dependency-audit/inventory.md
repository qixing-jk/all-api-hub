# 直接依赖版本与用途快照

此表保留初次审查的历史版本；随后已同步包含 TS7/ESLint/国际化升级的主线。当前决策以 [收益优先复核](benefit-review.md) 为准，不把此表中的所有版本差距当作仍待实施。

审查基线：`adbd21980a0941128ea9b9985515698cd2f6b7e6`；查询日期：2026-11-10。根包 59 个 dependencies、53 个 devDependencies；官方 npm 查询发现 82 个有更新，其中 32 个跨首位版本号。首位版本变化不是统一的兼容性判据，尤其是 0.x 包。

版本来自官方源 `pnpm outdated` 与本地 `pnpm list --depth 0`；“未报告更新”不是维护活跃证明。用途列为静态引用示例（含类型、配置、测试），不代表最终包内可达性。请结合 [研判与实施顺序](spec.md)。

## dependencies

| 依赖 | 声明 | 锁定/安装 | 官方更新快照 | 引用示例或角色 |
| --- | --- | --- | --- | --- |
| @ai-sdk/anthropic | 4.0.85 | 4.0.85 | 4.0.99 | [src/services/verification/aiApiVerification/providers.ts](../../src/services/verification/aiApiVerification/providers.ts) |
| @ai-sdk/google | 4.0.102 | 4.0.102 | 4.0.114 | [src/services/verification/aiApiVerification/providers.ts](../../src/services/verification/aiApiVerification/providers.ts) |
| @ai-sdk/openai | 4.0.99 | 4.0.99 | 4.0.111 | [src/services/verification/aiApiVerification/providers.ts](../../src/services/verification/aiApiVerification/providers.ts) |
| @ai-sdk/openai-compatible | 3.0.75 | 3.0.75 | 3.0.87 | [src/services/verification/aiApiVerification/providers.ts](../../src/services/verification/aiApiVerification/providers.ts) |
| @base-ui/react | ^1.1.0 | 1.1.0 | 1.9.0 | [src/components/ui/combobox.tsx](../../src/components/ui/combobox.tsx) |
| @dnd-kit/core | ^6.3.1 | 6.3.1 | 未报告更新 | [src/components/ui/RepeatableInput.tsx](../../src/components/ui/RepeatableInput.tsx) |
| @dnd-kit/modifiers | ^9.0.0 | 9.0.0 | 未报告更新 | [src/components/ui/RepeatableInput.tsx](../../src/components/ui/RepeatableInput.tsx) |
| @dnd-kit/sortable | ^10.0.0 | 10.0.0 | 未报告更新 | [src/components/ui/RepeatableInput.tsx](../../src/components/ui/RepeatableInput.tsx) |
| @dnd-kit/utilities | ^3.2.2 | 3.2.2 | 未报告更新 | [src/components/ui/RepeatableInput.tsx](../../src/components/ui/RepeatableInput.tsx) |
| @jitl/quickjs-singlefile-browser-release-sync | 0.32.0 | 0.32.0 | 未报告更新 | [src/services/verification/agentTest/environment.ts](../../src/services/verification/agentTest/environment.ts) |
| @lobehub/fluent-emoji | ^4.1.0 | 4.1.0 | 5.0.1 | @lobehub/ui 的 peer |
| @lobehub/icons | ^5.13.0 | 5.13.0 | 6.15.0 | [src/components/icons/ManagedSiteIcon.tsx](../../src/components/icons/ManagedSiteIcon.tsx) |
| @lobehub/ui | ^5.20.3 | 5.20.3 | 6.15.2 | @lobehub/icons 的 peer；无应用直接 UI 使用 |
| @plasmohq/storage | ^1.15.0 | 1.15.0 | 未报告更新 | [src/contexts/UserPreferencesContext.tsx](../../src/contexts/UserPreferencesContext.tsx) |
| @tanstack/react-query | ^5.90.12 | 5.90.12 | 5.107.1 | [src/entrypoints/options/main.tsx](../../src/entrypoints/options/main.tsx) |
| @tanstack/react-table | ^8.21.3 | 8.21.3 | 9.3.1 | [src/features/AutoCheckin/readiness/AccountSnapshotTable.tsx](../../src/features/AutoCheckin/readiness/AccountSnapshotTable.tsx) |
| @webext-core/messaging | ^3.0.1 | 3.0.1 | 4.0.1 | [src/services/runtimeMessaging/extensionMessaging.ts](../../src/services/runtimeMessaging/extensionMessaging.ts) |
| ai | 7.0.148 | 7.0.148 | 7.0.165 | [src/services/verification/agentTest/environment.ts](../../src/services/verification/agentTest/environment.ts) |
| antd | ^6.5.1 | 6.5.1 | 6.7.0 | @lobehub/icons 与 @lobehub/ui 的 peer |
| autoprefixer | ^10.4.21 | 10.4.21 | 10.6.2 | postcss.config.js；Tailwind4 已自动加前缀 |
| chrono-node | ^2.9.1 | 2.9.1 | 2.10.3 | [src/components/ui/datePickerNaturalInput.ts](../../src/components/ui/datePickerNaturalInput.ts) |
| class-variance-authority | ^0.7.1 | 0.7.1 | 未报告更新 | [src/components/ui/Alert.tsx](../../src/components/ui/Alert.tsx) |
| clsx | ^2.1.1 | 2.1.1 | 未报告更新 | [src/lib/utils.ts](../../src/lib/utils.ts) |
| cmdk | ^1.1.1 | 1.1.1 | 未报告更新 | [src/components/ui/SearchableSelect.tsx](../../src/components/ui/SearchableSelect.tsx) |
| date-fns | ^4.4.0 | 4.4.0 | 未报告更新 | [src/components/ui/DatePicker.tsx](../../src/components/ui/DatePicker.tsx) |
| dayjs | ^1.11.13 | 1.11.13 | 1.11.23 | [src/components/ui/DatePicker.tsx](../../src/components/ui/DatePicker.tsx) |
| dompurify | 3.2.6 | 3.2.6 | 3.4.17 | [src/components/MarkdownContent.tsx](../../src/components/MarkdownContent.tsx) |
| echarts | ^6.0.0 | 6.0.0 | 6.1.0 | [src/components/charts/echarts.ts](../../src/components/charts/echarts.ts) |
| fast-uri | 4.1.4 | 4.1.4 | 4.2.3 | [src/utils/core/proxyUrl.ts](../../src/utils/core/proxyUrl.ts) |
| framer-motion | ^12.23.24 | 12.23.24 | 14.10.1 | [src/features/AccountManagement/components/DedupeAccountsDialog/DedupeAccountCard.tsx](../../src/features/AccountManagement/components/DedupeAccountsDialog/DedupeAccountCard.tsx) |
| gpt-tokenizer | ^4.1.0 | 4.1.0 | 未报告更新 | [src/services/verification/modelQuality/contextCounter.ts](../../src/services/verification/modelQuality/contextCounter.ts) |
| i18next | ^25.6.0 | 25.6.0 | 27.0.1 | [src/components/FeedbackDropdownMenu.tsx](../../src/components/FeedbackDropdownMenu.tsx) |
| i18next-browser-languagedetector | ^8.2.0 | 8.2.0 | 8.3.0 | [src/utils/i18n/index.ts](../../src/utils/i18n/index.ts) |
| input-otp | ^1.4.2 | 1.4.2 | 1.5.0 | [src/components/ui/input-otp.tsx](../../src/components/ui/input-otp.tsx) |
| lodash-es | ^4.17.21 | 4.17.21 | 4.18.1 | [src/features/AccountManagement/components/AccountActionButtons/useAccountQuickCheckin.ts](../../src/features/AccountManagement/components/AccountActionButtons/useAccountQuickCheckin.ts) |
| lucide-react | ^0.564.0 | 0.564.0 | 1.70.0 | [src/components/FeedbackDropdownMenu.tsx](../../src/components/FeedbackDropdownMenu.tsx) |
| marked | 16.4.0 | 16.4.0 | 18.1.3 | [src/components/MarkdownContent.tsx](../../src/components/MarkdownContent.tsx) |
| otpauth | ^9.5.0 | 9.5.0 | 9.6.0 | [src/services/managedSites/providers/newApi/newApiTotp.ts](../../src/services/managedSites/providers/newApi/newApiTotp.ts) |
| p-queue | 9.3.1 | 9.3.1 | 10.0.0 | [src/services/apiAdapters/nativeResources/concurrency.ts](../../src/services/apiAdapters/nativeResources/concurrency.ts) |
| postcss | ^8.5.6 | 8.5.6 | 8.5.32 | [plugins/content-rem-isolation.d.mts](../../plugins/content-rem-isolation.d.mts) |
| posthog-js | ^1.428.3 | 1.428.3 | 1.447.3 | [src/services/productAnalytics/runtime/client.ts](../../src/services/productAnalytics/runtime/client.ts) |
| qrcode.react | 4.2.0 | 4.2.0 | 未报告更新 | [src/features/CredentialExport/KelivoExportDialog.tsx](../../src/features/CredentialExport/KelivoExportDialog.tsx) |
| quickjs-emscripten-core | 0.32.0 | 0.32.0 | 未报告更新 | [src/services/verification/agentTest/environment.ts](../../src/services/verification/agentTest/environment.ts) |
| radix-ui | ^1.5.0 | 1.5.0 | 1.8.1 | [src/components/ui/Dialog/Modal.tsx](../../src/components/ui/Dialog/Modal.tsx) |
| react | ^19.1.1 | 19.2.0 | 19.3.1 | [src/components/AccountLinkButton.tsx](../../src/components/AccountLinkButton.tsx) |
| react-arborist | ^3.10.5 | 3.10.5 | 4.0.1 | [src/features/AccountManagement/components/BookmarkAccountImportDialog/BookmarkTreeSelector.tsx](../../src/features/AccountManagement/components/BookmarkAccountImportDialog/BookmarkTreeSelector.tsx) |
| react-countup | ^6.5.3 | 6.5.3 | 未报告更新 | [src/lib/countup.ts](../../src/lib/countup.ts) |
| react-day-picker | ^10.0.1 | 10.0.1 | 10.0.2 | [src/components/ui/calendar.tsx](../../src/components/ui/calendar.tsx) |
| react-dom | ^19.1.1 | 19.2.0 | 19.3.1 | [src/components/ThemeAwareToaster.tsx](../../src/components/ThemeAwareToaster.tsx) |
| react-hot-toast | ^2.5.2 | 2.5.2 | 2.6.1 | [src/components/ThemeAwareToaster.tsx](../../src/components/ThemeAwareToaster.tsx) |
| react-i18next | ^16.0.1 | 16.0.1 | 18.0.1 | [src/components/FeedbackDropdownMenu.tsx](../../src/components/FeedbackDropdownMenu.tsx) |
| react-joyride | 3.2.0 | 3.2.0 | 未报告更新 | [src/features/ProductTour/ProductTourContext.tsx](../../src/features/ProductTour/ProductTourContext.tsx) |
| react-tooltip | ^5.30.0 | 5.30.0 | 6.0.10 | [src/components/Tooltip.tsx](../../src/components/Tooltip.tsx) |
| react-virtuoso | ^4.18.20 | 4.18.20 | 未报告更新 | [src/features/AccountManagement/components/AccountList/VirtualizedAccountList.tsx](../../src/features/AccountManagement/components/AccountList/VirtualizedAccountList.tsx) |
| safe-regex2 | ^5.1.1 | 5.1.1 | 5.1.2 | [src/utils/core/regex.ts](../../src/utils/core/regex.ts) |
| tailwind-merge | ^3.3.1 | 3.3.1 | 3.7.0 | [src/lib/utils.ts](../../src/lib/utils.ts) |
| tldts | 7.0.17 | 7.0.17 | 7.4.19 | [src/utils/core/domain.ts](../../src/utils/core/domain.ts) |
| tw-animate-css | ^1.4.0 | 1.4.0 | 未报告更新 | package.json 命令/工具配置；由 Knip 检查 |
| zod | ^4.3.5 | 4.3.5 | 4.6.7 | [src/features/OptionsMenu/communityResources.ts](../../src/features/OptionsMenu/communityResources.ts) |

## devDependencies

| 依赖 | 声明 | 锁定/安装 | 官方更新快照 | 引用示例或角色 |
| --- | --- | --- | --- | --- |
| @commitlint/cli | ^21.2.3 | 21.2.3 | 21.2.4 | package.json 命令/工具配置；由 Knip 检查 |
| @commitlint/config-conventional | ^21.2.3 | 21.2.3 | 21.2.4 | package.json 命令/工具配置；由 Knip 检查 |
| @eslint/js | ^9.38.0 | 9.38.0 | 10.0.1 | [eslint.config.js](../../eslint.config.js) |
| @ianvs/prettier-plugin-sort-imports | 4.1.1 | 4.1.1 | 4.7.1 | package.json 命令/工具配置；由 Knip 检查 |
| @playwright/test | 1.64.1 | 1.64.1 | 1.65.0 | [e2e/accountActionShortcuts.spec.ts](../../e2e/accountActionShortcuts.spec.ts) |
| @tailwindcss/forms | ^0.5.10 | 0.5.10 | 0.5.11 | 仅旧 tailwind.config.js 引用；当前 CSS 未加载 |
| @tailwindcss/postcss | ^4.1.17 | 4.1.17 | 4.3.5 | [postcss.config.js](../../postcss.config.js) |
| @tailwindcss/typography | ^0.5.16 | 0.5.16 | 0.5.20 | [tailwind.config.js](../../tailwind.config.js) |
| @testing-library/jest-dom | ^6.9.1 | 6.9.1 | 7.0.1 | [tests/setup.ts](../../tests/setup.ts) |
| @testing-library/react | ^16.3.0 | 16.3.0 | 16.3.3 | [tests/components/AccountLinkButton.test.tsx](../../tests/components/AccountLinkButton.test.tsx) |
| @testing-library/user-event | ^14.6.1 | 14.6.1 | 14.6.8 | [tests/components/ActionMenu.test.tsx](../../tests/components/ActionMenu.test.tsx) |
| @types/chrome | 0.0.258 | 0.0.258 | 0.3.7 | 环境类型；knip.ts 显式保留 |
| @types/firefox-webext-browser | ^120.0.4 | 120.0.4 | 143.0.1 | 环境类型；knip.ts 显式保留 |
| @types/lodash-es | ^4.17.12 | 4.17.12 | 未报告更新 | package.json 命令/工具配置；由 Knip 检查 |
| @types/node | ^24.12.0 | 24.12.0 | 26.6.6 | package.json 命令/工具配置；由 Knip 检查 |
| @types/pngjs | ^6.0.5 | 6.0.5 | 未报告更新 | package.json 命令/工具配置；由 Knip 检查 |
| @types/react | ^19.1.12 | 19.1.12 | 19.3.0 | package.json 命令/工具配置；由 Knip 检查 |
| @types/react-dom | ^19.1.9 | 19.2.2 | 19.3.0 | package.json 命令/工具配置；由 Knip 检查 |
| @types/selenium-webdriver | ^4.35.7 | 4.35.7 | 未报告更新 | package.json 命令/工具配置；由 Knip 检查 |
| @types/webextension-polyfill | ^0.12.4 | 0.12.4 | 0.12.6 | 环境类型；knip.ts 显式保留 |
| @vitejs/plugin-react | ^6.2.1 | 6.2.1 | 未报告更新 | package.json 命令/工具配置；由 Knip 检查 |
| @vitest/coverage-v8 | 4.0.17 | 4.0.17 | 5.1.0 | Vitest provider 配置隐式加载 |
| @wxt-dev/auto-icons | ^1.1.2 | 1.1.2 | 未报告更新 | package.json 命令/工具配置；由 Knip 检查 |
| @wxt-dev/module-react | ^1.2.2 | 1.2.2 | 未报告更新 | package.json 命令/工具配置；由 Knip 检查 |
| eslint | ^9.38.0 | 9.39.2 | 10.14.0 | [eslint.config.js](../../eslint.config.js) |
| eslint-config-prettier | ^10.1.8 | 10.1.8 | 未报告更新 | [eslint.config.js](../../eslint.config.js) |
| eslint-plugin-jsdoc | ^61.4.1 | 61.4.1 | 65.4.5 | [eslint.config.js](../../eslint.config.js) |
| eslint-plugin-react-hooks | ^5.2.0 | 5.2.0 | 7.1.1 | [eslint.config.js](../../eslint.config.js) |
| flatted | ^3.4.2 | 3.4.2 | 3.4.4 | [scripts/utils/vitestBlob.mjs](../../scripts/utils/vitestBlob.mjs) |
| globals | ^16.4.0 | 16.4.0 | 17.14.0 | [eslint.config.js](../../eslint.config.js) |
| husky | ^9.1.7 | 9.1.7 | 未报告更新 | package.json 命令/工具配置；由 Knip 检查 |
| i18next-cli | ^1.50.3 | 1.50.3 | 1.87.0 | [i18next.config.ts](../../i18next.config.ts) |
| jsdom | ^27.0.1 | 27.0.1 | 31.0.0 | package.json 命令/工具配置；由 Knip 检查 |
| knip | ^6.0.4 | 6.0.4 | 6.44.2 | [knip.ts](../../knip.ts) |
| lint-staged | ^16.2.6 | 16.2.6 | 17.6.0 | package.json 命令/工具配置；由 Knip 检查 |
| msw | ^2.11.6 | 2.11.6 | 3.0.4 | [tests/entrypoints/options/KeyManagementRepairMissingKeys.test.tsx](../../tests/entrypoints/options/KeyManagementRepairMissingKeys.test.tsx) |
| pngjs | ^7.0.0 | 7.0.0 | 未报告更新 | [scripts/visual-compare.mjs](../../scripts/visual-compare.mjs) |
| postcss-value-parser | 4.2.0 | 4.2.0 | 未报告更新 | [plugins/content-rem-isolation.mjs](../../plugins/content-rem-isolation.mjs) |
| prettier | 3.2.4 | 3.2.4 | 3.9.10 | [.prettierrc.mjs](../../.prettierrc.mjs) |
| prettier-plugin-tailwindcss | ^0.7.1 | 0.7.1 | 0.8.1 | [.prettierrc.mjs](../../.prettierrc.mjs) |
| publish-browser-extension | ^4.0.5 | 4.0.5 | 6.2.0 | package.json 命令/工具配置；由 Knip 检查 |
| react-devtools | ^7.0.1 | 7.0.1 | 8.0.0 | package.json 命令/工具配置；由 Knip 检查 |
| selenium-webdriver | ^4.51.0 | 4.51.0 | 4.52.0 | [e2e/firefox/extensionTest.ts](../../e2e/firefox/extensionTest.ts) |
| shadcn | ^3.6.3 | 3.6.3 | 4.23.0 | components.json；手动组件生成命令 |
| tailwindcss | ^4.1.17 | 4.1.17 | 4.3.5 | [src/styles/style.css](../../src/styles/style.css) |
| typescript | ^5.9.3 | 5.9.3 | 7.0.2 | [scripts/utils/color-tokens.mjs](../../scripts/utils/color-tokens.mjs) |
| typescript-eslint | ^8.45.0 | 8.45.0 | 8.72.1 | [eslint.config.js](../../eslint.config.js) |
| undici | 7.29.0 | 7.29.0 | 8.12.4 | [scripts/suites/requesty/probe.mjs](../../scripts/suites/requesty/probe.mjs) |
| vite | ^8.3.6 | 8.3.6 | 未报告更新 | [e2e/cookieRequestIsolation.spec.ts](../../e2e/cookieRequestIsolation.spec.ts) |
| vitest | 4.0.17 | 4.0.17 | 5.1.0 | [tests/components/AccountLinkButton.test.tsx](../../tests/components/AccountLinkButton.test.tsx) |
| web-ext | ^9.4.0 | 9.4.0 | 10.8.0 | package.json 命令/工具配置；由 Knip 检查 |
| whatwg-fetch | ^3.6.20 | 3.6.20 | 未报告更新 | [tests/setup.shared.ts](../../tests/setup.shared.ts) |
| wxt | ^0.21.5 | 0.21.5 | 未报告更新 | [src/entrypoints/appearance-bootstrap.ts](../../src/entrypoints/appearance-bootstrap.ts) |
