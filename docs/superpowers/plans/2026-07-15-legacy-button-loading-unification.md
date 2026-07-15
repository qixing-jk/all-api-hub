# Legacy Button Loading-State Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every confirmed async control outside the first 72-button pass consistent busy semantics and action-specific pending copy without turning ordinary disabled states into loading indicators.

**Architecture:** Keep `Button.loading` and `IconButton.loading` as the contract for a control's own non-interruptible action. Direct actions migrate mechanically, menu and toast wrappers expose narrow caller-owned loading props, and workflows with shared booleans gain feature-local action or entity discriminators at the layer that owns the real Promise lifecycle. Interruptible controls remain interactive busy exceptions.

**Tech Stack:** React, TypeScript, i18next, Radix UI, Vitest, Testing Library, ast-grep.

**Design:** `docs/superpowers/specs/2026-07-15-legacy-button-loading-unification-design.md`

**Audit boundary:** 92 unique shared-`Button` paths (91 async-name candidates plus 6 manual-spinners with 5 overlaps), plus the explicit `IconButton`, native-button, menu, and toast surfaces in the manifest at the end of this plan.

**Release-readiness decisions:** No telemetry changes; these remain the same user actions and outcomes. No new Playwright scenario by default; focused component tests cover the changed state and accessibility contracts. Extend E2E only if implementation reveals a browser-runtime-only regression in popup refresh, content-script controls, or cancellation.

---

### Task 1: Migrate Direct Dialog and Content Actions

**Files:**

- Modify: `src/components/ClaudeCodeRouterImportDialog.tsx`
- Modify: `src/components/CliProxyExportDialog.tsx`
- Modify: `src/components/dialogs/ChannelDialog/components/ChannelDialog.tsx`
- Modify: `src/components/dialogs/UpdateLogDialog/components/UpdateLogDialog.tsx`
- Modify: `src/entrypoints/content/redemptionAssist/components/RedemptionBatchResultToast.tsx`
- Modify: `src/entrypoints/content/webAiApiCheck/components/ApiCheckModal.tsx`
- Modify: `src/features/AccountManagement/components/AccountDialog/AccountForm.tsx`
- Modify: `src/features/AccountManagement/components/AccountDialog/AihubmixDefaultKeyPromptDialog.tsx`
- Modify: `src/features/SiteBookmarks/components/BookmarkDialog.tsx`
- Modify: `src/locales/{en,es-419,ja,vi,zh-CN,zh-TW}/common.json`
- Test: `tests/components/ClaudeCodeRouterImportDialog.test.tsx`
- Test: `tests/components/CliProxyExportDialog.test.tsx`
- Test: `tests/components/dialogs/ChannelDialog/ChannelDialog.behavior.test.tsx`
- Test: `tests/components/UpdateLogDialog.test.tsx`
- Test: `tests/entrypoints/content/redemptionAssist/RedemptionBatchResultToast.test.tsx`
- Test: `tests/components/ApiCheckModalHost.test.tsx`
- Test: `tests/features/AccountManagement/components/AccountDialogForm.test.tsx`
- Create: `tests/features/AccountManagement/components/AihubmixDefaultKeyPromptDialog.test.tsx`
- Test: `tests/features/SiteBookmarks/components/BookmarkDialog.test.tsx`

- [ ] **Step 1: Add failing pending-state assertions**

Use deferred Promises in the existing success tests so the request remains unsettled while assertions run. For each initiating control, assert the exact pending accessible name, `aria-busy="true"`, disabled state, and duplicate-click suppression. All adjacent controls must remain free of `aria-busy`; assert disabled only where the existing workflow already locks that control.

```tsx
function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

const deferred = createDeferred<{ success: true; message: string }>()
mockImportToClaudeCodeRouter.mockReturnValueOnce(deferred.promise)

await user.click(screen.getByRole("button", { name: "common:actions.import" }))

const importingButton = screen.getByRole("button", {
  name: "common:status.importing",
})
expect(importingButton).toBeDisabled()
expect(importingButton).toHaveAttribute("aria-busy", "true")
await user.click(importingButton)
expect(mockImportToClaudeCodeRouter).toHaveBeenCalledTimes(1)

deferred.resolve({ success: true, message: "ok" })
```

Add equivalent assertions for Channel resource retry and real-key loading, update-log enable/disable, the current redemption code only, API-profile save, cookie import, AIHubMix default-key creation, and bookmark add/edit. For the update-log toggle, assert `common:status.enabling` when currently disabled and `common:status.disabling` when currently enabled.

- [ ] **Step 2: Run the focused tests and verify RED**

```powershell
pnpm exec vitest run tests/components/ClaudeCodeRouterImportDialog.test.tsx tests/components/CliProxyExportDialog.test.tsx tests/components/dialogs/ChannelDialog/ChannelDialog.behavior.test.tsx tests/components/UpdateLogDialog.test.tsx tests/entrypoints/content/redemptionAssist/RedemptionBatchResultToast.test.tsx tests/components/ApiCheckModalHost.test.tsx tests/features/AccountManagement/components/AccountDialogForm.test.tsx tests/features/AccountManagement/components/AihubmixDefaultKeyPromptDialog.test.tsx tests/features/SiteBookmarks/components/BookmarkDialog.test.tsx
```

Expected: new accessible-name and `aria-busy` assertions fail because these controls still use `disabled` without the shared loading contract.

- [ ] **Step 3: Add the direct loading props and exact pending branches**

Apply this mapping; preserve independent prerequisites in `disabled` and remove only the async flag duplicated by `loading`:

| Control | `loading` | Pending child |
| --- | --- | --- |
| Both import dialogs | `isSubmitting` | `t("common:status.importing")` |
| Channel resource retry | `isResourceEditLoading` | `t("common:status.retrying")` |
| Channel real-key load | `isLoadingRealKey` | existing `t("channelDialog:actions.loadingRealKey")` |
| Update-log toggle | `isSavingAutoOpen` | enabling/disabling based on the pre-click `autoOpenEnabled` value |
| Redemption row retry | `retryingCode === item.code` | `t("common:status.retrying")` |
| API-check profile save | `view.isSavingProfile` | existing `t("webAiApiCheck:modal.actions.saving")` |
| Cookie import | `isImportingCookies` | existing `t("messages.importCookiesLoading")` |
| AIHubMix confirm | `isCreating` | existing creating label |
| Bookmark submit | `isWorking` | `creating` in add mode, `saving` in edit mode |

```tsx
<Button
  type="submit"
  form={formId}
  loading={isSubmitting}
>
  {isSubmitting
    ? t("common:status.importing")
    : t("common:actions.import")}
</Button>
```

For entity-scoped retry, keep sibling locking separate from the current row's loading state:

```tsx
const isCurrentRetry = retryingCode === item.code

<Button
  loading={isCurrentRetry}
  disabled={retryingCode !== null}
  onClick={() => void handleRetry(item.code)}
>
  {isCurrentRetry
    ? t("common:status.retrying")
    : t("common:actions.retry")}
</Button>
```

Add `common.status.enabling` to all six `common.json` files using: `Enabling...`, `Habilitando...`, `有効化中...`, `Đang bật...`, `启用中...`, and `啟用中...`.

- [ ] **Step 4: Run focused tests and i18n extraction**

Run the Step 2 command again, then:

```powershell
pnpm run i18n:extract:ci
```

Expected: all focused tests pass and extraction reports no locale updates.

- [ ] **Step 5: Commit the isolated direct-dialog migration**

```powershell
git add -- src/components/ClaudeCodeRouterImportDialog.tsx src/components/CliProxyExportDialog.tsx src/components/dialogs/ChannelDialog/components/ChannelDialog.tsx src/components/dialogs/UpdateLogDialog/components/UpdateLogDialog.tsx src/entrypoints/content/redemptionAssist/components/RedemptionBatchResultToast.tsx src/entrypoints/content/webAiApiCheck/components/ApiCheckModal.tsx src/features/AccountManagement/components/AccountDialog/AccountForm.tsx src/features/AccountManagement/components/AccountDialog/AihubmixDefaultKeyPromptDialog.tsx src/features/SiteBookmarks/components/BookmarkDialog.tsx src/locales/en/common.json src/locales/es-419/common.json src/locales/ja/common.json src/locales/vi/common.json src/locales/zh-CN/common.json src/locales/zh-TW/common.json tests/components/ClaudeCodeRouterImportDialog.test.tsx tests/components/CliProxyExportDialog.test.tsx tests/components/dialogs/ChannelDialog/ChannelDialog.behavior.test.tsx tests/components/UpdateLogDialog.test.tsx tests/entrypoints/content/redemptionAssist/RedemptionBatchResultToast.test.tsx tests/components/ApiCheckModalHost.test.tsx tests/features/AccountManagement/components/AccountDialogForm.test.tsx tests/features/AccountManagement/components/AihubmixDefaultKeyPromptDialog.test.tsx tests/features/SiteBookmarks/components/BookmarkDialog.test.tsx
git commit -m "refactor(ui): migrate direct dialog loading states"
```

### Task 2: Migrate Direct Settings and Verification Actions

**Files:**

- Modify: `src/features/BasicSettings/components/tabs/ManagedSite/AxonHubSettings.tsx`
- Modify: `src/features/BasicSettings/components/tabs/ManagedSite/ClaudeCodeHubSettings.tsx`
- Modify: `src/features/BasicSettings/components/tabs/ManagedSite/OctopusSettings.tsx`
- Modify: `src/features/BasicSettings/components/tabs/UsageHistorySync/UsageHistorySyncSettingsSection.tsx`
- Modify: `src/features/ApiCredentialProfiles/components/VerifyApiCredentialProfileDialog.tsx`
- Modify: `src/features/KeyManagement/components/Header.tsx`
- Test: `tests/entrypoints/options/AxonHubSettings.test.tsx`
- Test: `tests/entrypoints/options/ClaudeCodeHubSettings.test.tsx`
- Test: `tests/entrypoints/options/OctopusSettings.test.tsx`
- Test: `tests/features/BasicSettings/UsageHistorySyncSettingsSection.test.tsx`
- Test: `tests/entrypoints/options/pages/ApiCredentialProfiles/VerifyApiCredentialProfileDialog.test.tsx`
- Create: `tests/features/KeyManagement/components/Header.test.tsx`

- [ ] **Step 1: Write failing direct-action tests**

For each validator, hold `handleValidateConfig` in flight and assert the existing `*.validation.validating` label plus `aria-busy`. For usage-history Sync Now, the API-profile verification suite, and token-list refresh, assert that only the initiating control is busy.

```tsx
expect(
  screen.getByRole("button", { name: "settings:axonHub.validation.validating" }),
).toHaveAttribute("aria-busy", "true")

expect(
  screen.getByRole("button", { name: "common:status.refreshing" }),
).toBeDisabled()
```

- [ ] **Step 2: Run tests and verify RED**

```powershell
pnpm exec vitest run tests/entrypoints/options/AxonHubSettings.test.tsx tests/entrypoints/options/ClaudeCodeHubSettings.test.tsx tests/entrypoints/options/OctopusSettings.test.tsx tests/features/BasicSettings/UsageHistorySyncSettingsSection.test.tsx tests/entrypoints/options/pages/ApiCredentialProfiles/VerifyApiCredentialProfileDialog.test.tsx tests/features/KeyManagement/components/Header.test.tsx
```

- [ ] **Step 3: Implement direct loading without changing lifecycle ownership**

Use the existing dedicated flags:

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={handleValidateConfig}
  loading={isValidating}
>
  {isValidating
    ? t("axonHub.validation.validating")
    : t("axonHub.validation.validate")}
</Button>
```

Apply the same shape to the other two validators. Use `loading={isSyncingAll}` for Sync Now, `loading={isRunning}` for the API-profile full suite, and `loading={isLoading}` for the Key Management refresh. Preserve all non-async prerequisites and sibling locks. The model-sync channel list uses one flag for automatic and manual loading, so Task 6 adds a manual-origin discriminator before showing button busy state.

- [ ] **Step 4: Run tests and commit**

Run the Step 2 command again, then:

```powershell
git add -- src/features/BasicSettings/components/tabs/ManagedSite/AxonHubSettings.tsx src/features/BasicSettings/components/tabs/ManagedSite/ClaudeCodeHubSettings.tsx src/features/BasicSettings/components/tabs/ManagedSite/OctopusSettings.tsx src/features/BasicSettings/components/tabs/UsageHistorySync/UsageHistorySyncSettingsSection.tsx src/features/ApiCredentialProfiles/components/VerifyApiCredentialProfileDialog.tsx src/features/KeyManagement/components/Header.tsx tests/entrypoints/options/AxonHubSettings.test.tsx tests/entrypoints/options/ClaudeCodeHubSettings.test.tsx tests/entrypoints/options/OctopusSettings.test.tsx tests/features/BasicSettings/UsageHistorySyncSettingsSection.test.tsx tests/entrypoints/options/pages/ApiCredentialProfiles/VerifyApiCredentialProfileDialog.test.tsx tests/features/KeyManagement/components/Header.test.tsx
git commit -m "refactor(settings): expose direct action loading states"
```

### Task 3: Replace Direct Manual Spinners and Icon Busy Wiring

**Files:**

- Modify: `src/entrypoints/popup/components/HeaderSection.tsx`
- Modify: `src/features/AccountManagement/components/AccountActionButtons/index.tsx`
- Modify: `src/features/AccountManagement/components/AccountList/BalanceDisplay.tsx`
- Modify: `src/features/AccountManagement/components/AccountList/SiteInfo.tsx`
- Modify: `src/features/ApiCredentialProfiles/components/ApiCredentialProfileListItem.tsx`
- Modify: `src/features/KeyManagement/components/BatchCliProxyExportDialog.tsx`
- Modify: `src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog/ManagedSiteTokenBatchExportPreviewRow.tsx`
- Modify: `src/features/KeyManagement/components/TokenList.tsx`
- Modify: `src/features/KeyManagement/components/TokenListItem/KeyDisplay.tsx`
- Test: `tests/entrypoints/popup/HeaderSection.test.tsx`
- Test: `tests/features/AccountManagement/components/AccountActionButtons.test.tsx`
- Test: `tests/features/AccountManagement/components/BalanceDisplay.test.tsx`
- Test: `tests/features/AccountManagement/components/SiteInfo.test.tsx`
- Test: `tests/features/ApiCredentialProfiles/components/ApiCredentialProfileListItem.test.tsx`
- Test: `tests/features/KeyManagement/components/BatchCliProxyExportDialog.test.tsx`
- Test: `tests/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog.test.tsx`
- Test: `tests/entrypoints/options/pages/KeyManagement/TokenList.batchExport.test.tsx`
- Test: `tests/entrypoints/options/pages/KeyManagement/KeyDisplay.identity.test.tsx`

- [ ] **Step 1: Add failing shared-contract assertions**

Assert that icon-only actions retain their idle accessible name while exposing `aria-busy`, and text actions expose their existing running/verifying label. Confirm the batch Cancel buttons are merely disabled and do not become busy. For account metrics, stale-check-in refresh, and health refresh, assert only the locally clicked surface is busy; sibling data controls and refresh controls locked by an externally started account refresh must not expose `aria-busy`. Reject the account-refresh Promise and verify the initiating control returns to idle, loses `aria-busy`, and re-enables its siblings.

```tsx
const refresh = screen.getByRole("button", { name: "common:actions.refresh" })
expect(refresh).toHaveAttribute("aria-busy", "true")
expect(refresh).toBeDisabled()

const start = screen.getByRole("button", {
  name: "keyManagement:batchCliProxyExport.actions.running",
})
expect(start).toHaveAttribute("aria-busy", "true")
expect(screen.getByRole("button", { name: "common:actions.cancel" })).not.toHaveAttribute("aria-busy")
```

- [ ] **Step 2: Run tests and verify RED**

```powershell
pnpm exec vitest run tests/entrypoints/popup/HeaderSection.test.tsx tests/features/AccountManagement/components/AccountActionButtons.test.tsx tests/features/AccountManagement/components/BalanceDisplay.test.tsx tests/features/AccountManagement/components/SiteInfo.test.tsx tests/features/ApiCredentialProfiles/components/ApiCredentialProfileListItem.test.tsx tests/features/KeyManagement/components/BatchCliProxyExportDialog.test.tsx tests/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog.test.tsx tests/entrypoints/options/pages/KeyManagement/TokenList.batchExport.test.tsx tests/entrypoints/options/pages/KeyManagement/KeyDisplay.identity.test.tsx
```

- [ ] **Step 3: Replace duplicated spinner/disabled/aria wiring**

Use these exact contracts:

```tsx
<IconButton loading={isRefreshing} aria-label={t("common:actions.refresh")}>
  <ArrowPathIcon className="h-4 w-4" />
</IconButton>

<IconButton
  loading={isKeyVisibilityLoading}
  aria-label={visible ? t("actions.hideKey") : t("actions.showKey")}
>
  {visible ? <EyeSlashIcon /> : <EyeIcon />}
</IconButton>
```

- Popup refresh: remove conditional `animate-spin` and `disabled={isRefreshing}`.
- Smart-copy key: use `IconButton loading={isCheckingTokens}` while preserving the account-disabled guard.
- Telemetry refresh: replace the native `<button>` with a compact shared `Button loading={isTelemetryRefreshing}` and keep the existing refreshing copy and visual class overrides.
- Batch CLI start: `loading={isRunning}`; remove `Loader2`; keep only the empty-preview prerequisite in `disabled`.
- Batch-export row verify: `loading={isCurrentItemVerifying}`; remove `Loader2`; keep global/sibling locks.
- TokenList API-profile save: `loading={isBatchApiProfilesSaving}`; use `common:status.saving` while pending and restore the existing count-bearing idle label after settlement.

For account-list data controls, introduce feature-local runtime constants and
local Promise ownership rather than treating `refreshingAccountId` as the
initiating action:

```ts
const BALANCE_REFRESH_TARGETS = {
  BALANCE: "balance",
  CASHFLOW: "cashflow",
  INCOME: "income",
  ESTIMATED_INCOME: "estimated_income",
} as const

type BalanceRefreshTarget =
  (typeof BALANCE_REFRESH_TARGETS)[keyof typeof BALANCE_REFRESH_TARGETS]
```

`BalanceDisplay` records the clicked metric until `await
handleRefreshAccount(site, true)` settles. Convert `AnimatedValue`'s clickable
native button to a compact shared `Button variant="ghost" size="sm"` with
`h-auto p-0` overrides, `loading` only for the active metric, and `disabled`
for the aggregate account refresh. Preserve pulse styling as a data-freshness
animation, but only the initiating metric receives a spinner and `aria-busy`.

Set and clear the discriminator with an explicit failure-safe lifecycle:

```ts
const runRefresh = async (target: BalanceRefreshTarget) => {
  if (isAccountDisabled || isRefreshing) return
  setActiveRefreshTarget(target)
  try {
    await handleRefreshAccount(site, true)
  } finally {
    setActiveRefreshTarget(null)
  }
}
```

`SiteInfo` uses an equivalent local discriminator for stale-check-in refresh
and health refresh. Use `IconButton loading` on the initiating control and
`disabled={isRefreshing}` on both controls, so refreshes initiated elsewhere
lock them without showing a false spinner. Its async wrapper must also clear the
local discriminator in `finally` after both success and rejection.

- [ ] **Step 4: Run tests, extraction, and commit**

Run Step 2, then:

```powershell
pnpm run i18n:extract:ci
git add -- src/entrypoints/popup/components/HeaderSection.tsx src/features/AccountManagement/components/AccountActionButtons/index.tsx src/features/AccountManagement/components/AccountList/BalanceDisplay.tsx src/features/AccountManagement/components/AccountList/SiteInfo.tsx src/features/ApiCredentialProfiles/components/ApiCredentialProfileListItem.tsx src/features/KeyManagement/components/BatchCliProxyExportDialog.tsx src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog/ManagedSiteTokenBatchExportPreviewRow.tsx src/features/KeyManagement/components/TokenList.tsx src/features/KeyManagement/components/TokenListItem/KeyDisplay.tsx tests/entrypoints/popup/HeaderSection.test.tsx tests/features/AccountManagement/components/AccountActionButtons.test.tsx tests/features/AccountManagement/components/BalanceDisplay.test.tsx tests/features/AccountManagement/components/SiteInfo.test.tsx tests/features/ApiCredentialProfiles/components/ApiCredentialProfileListItem.test.tsx tests/features/KeyManagement/components/BatchCliProxyExportDialog.test.tsx tests/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog.test.tsx tests/entrypoints/options/pages/KeyManagement/TokenList.batchExport.test.tsx tests/entrypoints/options/pages/KeyManagement/KeyDisplay.identity.test.tsx
git commit -m "refactor(ui): replace manual button loading indicators"
```

### Task 4: Expose Loading Through Menu and Toast Wrappers

**Files:**

- Modify: `src/features/AccountManagement/components/AccountActionButtons/AccountActionMenuItem.tsx`
- Modify: `src/features/AccountManagement/components/AccountActionButtons/index.tsx`
- Modify: `src/features/BasicSettings/components/tabs/UsageHistorySync/UsageHistorySyncRowActions.tsx`
- Modify: `src/features/ManagedSiteChannels/components/RowActions.tsx`
- Modify: `src/features/ManagedSiteChannels/ManagedSiteChannels.tsx`
- Modify: `src/components/toast/types.ts`
- Modify: `src/components/toast/WarningToast.tsx`
- Modify: `src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts`
- Modify: `src/features/ManagedSiteModelSync/ManagedSiteModelSync.tsx`
- Modify: `src/features/ShareSnapshots/components/ShareSnapshotCaptionToast.tsx`
- Modify: `src/features/ShareSnapshots/utils/exportShareSnapshotWithToast.tsx`
- Modify: `src/locales/{en,es-419,ja,vi,zh-CN,zh-TW}/common.json`
- Test: `tests/features/AccountManagement/components/AccountActionMenuItem.test.tsx`
- Test: `tests/features/AccountManagement/components/AccountActionButtons.test.tsx`
- Create: `tests/features/BasicSettings/UsageHistorySyncRowActions.test.tsx`
- Test: `tests/features/ManagedSiteChannels/components/RowActions.test.tsx`
- Test: `tests/entrypoints/options/pages/ManagedSiteChannels/ManagedSiteChannels.test.tsx`
- Test: `tests/components/toast/WarningToast.test.tsx`
- Test: `tests/components/ShareSnapshotCaptionToast.test.tsx`
- Test: `tests/utils/toastHelpers.test.ts`

- [ ] **Step 1: Write failing wrapper contract tests**

Instantiate each wrapper directly. Assert pending label fallback, caller-provided pending label, stable icon-only names, forced disabled/`aria-busy` on the actual Radix child, and duplicate-click suppression. For account refresh and both row-sync wrappers, cover local menu initiation separately from externally supplied aggregate busy state: local initiation is busy; external aggregate state is disabled without `aria-busy`.

```tsx
render(
  <AccountActionMenuItem
    icon={ArrowPathIcon}
    label="Refresh account"
    loadingLabel="Refreshing account..."
    loading
    onClick={onClick}
  />,
)

expect(screen.getByRole("menuitem", { name: "Refreshing account..." })).toHaveAttribute(
  "aria-busy",
  "true",
)
```

- [ ] **Step 2: Run tests and verify RED**

```powershell
pnpm exec vitest run tests/features/AccountManagement/components/AccountActionMenuItem.test.tsx tests/features/AccountManagement/components/AccountActionButtons.test.tsx tests/features/BasicSettings/UsageHistorySyncRowActions.test.tsx tests/features/ManagedSiteChannels/components/RowActions.test.tsx tests/entrypoints/options/pages/ManagedSiteChannels/ManagedSiteChannels.test.tsx tests/components/toast/WarningToast.test.tsx tests/components/ShareSnapshotCaptionToast.test.tsx tests/utils/toastHelpers.test.ts
```

- [ ] **Step 3: Implement narrow wrapper contracts**

Add `loading?: boolean` and `loadingLabel?: string` to `AccountActionMenuItem`; derive `isMenuItemDisabled = disabled || loading`, force `aria-busy` on the real child, and render the shared `Spinner aria-hidden="true"` instead of the icon. In `AccountActionButtons`, add local `isRefreshMenuPending` around `await handleRefreshAccount(site)`. Pass that local state as `loading`, pass aggregate `refreshingAccountId === site.id` only as `disabled`, and use `common:status.refreshing`. A refresh started from a balance, health, or bulk surface must lock this menu item without making it appear to have initiated the action.

For usage-history and managed-channel rows, replace the icon-sized shared
`Button` trigger with `IconButton` so loading replaces Ellipsis instead of
rendering both icons. Keep aggregate `isSyncing` as a
locked-only input. Add local `isActionPending` state around the row menu's own
`await onSync(...)` call, and render the visible overflow trigger with
`loading={isActionPending}` plus `disabled={isSyncing}`. Narrow the managed-row
`onSync` callback to `Promise<void>` and return the existing parent Promise.
This lets the closed menu hand off feedback to its stable trigger without
making bulk-selected rows appear to have initiated the operation. The hidden
menu item may retain its existing syncing text.

Preserve the interruptible managed-channel Refresh ↔ Cancel Refresh behavior,
but add its missing busy semantics without using the disabling loading prop:

```tsx
<Button aria-busy={isLoading} onClick={isLoading ? cancelRefresh : refresh}>
  {isLoading ? t("toolbar.cancelRefresh") : t("toolbar.refresh")}
</Button>
```

Extend the existing cancellation tests to assert that the button remains
enabled, has the Cancel Refresh name, exposes `aria-busy="true"`, and still
calls the abort path.

Extend the toast action type and renderer:

```ts
export interface WarningToastAction {
  label: string
  pendingLabel?: string
  onClick: () => void | Promise<void>
}
```

```tsx
<Button
  variant="link"
  size="sm"
  loading={isActionPending}
  onClick={handleActionClick}
  className="h-auto w-fit p-0"
>
  {isActionPending ? action.pendingLabel ?? action.label : action.label}
</Button>
```

Pass `common:status.refreshing` from the account warning flow and `common:status.retrying` from model sync. Convert the snapshot-caption copy control to shared `Button loading={isCopying}` with a required `copyingLabel` prop; keep Close enabled. Add `common.status.copying` to all six locales: `Copying...`, `Copiando...`, `コピー中...`, `Đang sao chép...`, `复制中...`, `複製中...`.

- [ ] **Step 4: Run tests, extraction, and commit**

Run Step 2, then:

```powershell
pnpm run i18n:extract:ci
git add -- src/features/AccountManagement/components/AccountActionButtons/AccountActionMenuItem.tsx src/features/AccountManagement/components/AccountActionButtons/index.tsx src/features/BasicSettings/components/tabs/UsageHistorySync/UsageHistorySyncRowActions.tsx src/features/ManagedSiteChannels/components/RowActions.tsx src/features/ManagedSiteChannels/ManagedSiteChannels.tsx src/components/toast/types.ts src/components/toast/WarningToast.tsx src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts src/features/ManagedSiteModelSync/ManagedSiteModelSync.tsx src/features/ShareSnapshots/components/ShareSnapshotCaptionToast.tsx src/features/ShareSnapshots/utils/exportShareSnapshotWithToast.tsx src/locales/en/common.json src/locales/es-419/common.json src/locales/ja/common.json src/locales/vi/common.json src/locales/zh-CN/common.json src/locales/zh-TW/common.json tests/features/AccountManagement/components/AccountActionMenuItem.test.tsx tests/features/AccountManagement/components/AccountActionButtons.test.tsx tests/features/BasicSettings/UsageHistorySyncRowActions.test.tsx tests/features/ManagedSiteChannels/components/RowActions.test.tsx tests/entrypoints/options/pages/ManagedSiteChannels/ManagedSiteChannels.test.tsx tests/components/toast/WarningToast.test.tsx tests/components/ShareSnapshotCaptionToast.test.tsx tests/utils/toastHelpers.test.ts
git commit -m "refactor(ui): expose loading through action wrappers"
```

### Task 5: Distinguish Settings, Selection, and Probe Actions

**Files:**

- Modify: `src/features/BasicSettings/components/tabs/WebAiApiCheck/WebAiApiCheckSettings.tsx`
- Modify: `src/features/BasicSettings/components/tabs/CheckinRedeem/RedemptionAssistSettings.tsx`
- Modify: `src/features/BasicSettings/components/tabs/UsageHistorySync/UsageHistorySyncStateTable.tsx`
- Modify: `src/features/BasicSettings/components/tabs/UsageHistorySync/UsageHistorySyncTab.tsx`
- Modify: `src/features/ApiCredentialProfiles/components/VerifyApiCredentialProfileDialog.tsx`
- Test: `tests/entrypoints/options/WebAiApiCheckSettings.test.tsx`
- Create: `tests/entrypoints/options/RedemptionAssistSettings.test.tsx`
- Test: `tests/entrypoints/options/UsageHistorySyncTab.test.tsx`
- Test: `tests/entrypoints/options/pages/ApiCredentialProfiles/VerifyApiCredentialProfileDialog.test.tsx`

- [ ] **Step 1: Add failing action-discrimination tests**

For each workflow, keep one Promise pending and assert exactly one initiating control has `aria-busy`. Siblings must be disabled without `aria-busy`; rejection must restore all idle labels.

```tsx
expect(screen.getByRole("button", { name: "common:status.saving" })).toHaveAttribute(
  "aria-busy",
  "true",
)
expect(screen.getByRole("button", { name: "webAiApiCheck:settings.keyCleanup.save" })).not.toHaveAttribute(
  "aria-busy",
)
```

- [ ] **Step 2: Run tests and verify RED**

```powershell
pnpm exec vitest run tests/entrypoints/options/WebAiApiCheckSettings.test.tsx tests/entrypoints/options/RedemptionAssistSettings.test.tsx tests/entrypoints/options/UsageHistorySyncTab.test.tsx tests/entrypoints/options/pages/ApiCredentialProfiles/VerifyApiCredentialProfileDialog.test.tsx
```

- [ ] **Step 3: Add state at the real Promise owner**

Use feature-local discriminators rather than replacing the existing aggregate lock:

```ts
const SETTINGS_SAVE_ACTIONS = {
  URL_PATTERNS: "url_patterns",
  KEY_CLEANUP_PATTERNS: "key_cleanup_patterns",
} as const
type SettingsSaveAction =
  (typeof SETTINGS_SAVE_ACTIONS)[keyof typeof SETTINGS_SAVE_ACTIONS]

const [activeSaveAction, setActiveSaveAction] =
  useState<SettingsSaveAction | null>(null)
```

Set and clear this state in each explicit save handler's existing `try/finally`; switches remain locked by aggregate `isSaving`. Redemption Assist uses a single `"url_patterns"` action discriminator because other settings writes share its aggregate flag.

Narrow `UsageHistorySyncStateTable.onSyncAccounts` to return `Promise<void>`, wrap the selected-sync call with local `isSyncingSelection` state, and clear it in `finally`. Pass row calls through unchanged so a row sync cannot make the selected-sync button appear busy.

In API-profile verification, add `activeProbeId` at the dialog lifecycle owner before running a single probe and clear it only after persistence settles. Use `loading={activeProbeId === probe.id}`; the suite button continues using its dedicated `isRunning` state from Task 2.

- [ ] **Step 4: Run tests and commit**

Run Step 2, then:

```powershell
git add -- src/features/BasicSettings/components/tabs/WebAiApiCheck/WebAiApiCheckSettings.tsx src/features/BasicSettings/components/tabs/CheckinRedeem/RedemptionAssistSettings.tsx src/features/BasicSettings/components/tabs/UsageHistorySync/UsageHistorySyncStateTable.tsx src/features/BasicSettings/components/tabs/UsageHistorySync/UsageHistorySyncTab.tsx src/features/ApiCredentialProfiles/components/VerifyApiCredentialProfileDialog.tsx tests/entrypoints/options/WebAiApiCheckSettings.test.tsx tests/entrypoints/options/RedemptionAssistSettings.test.tsx tests/entrypoints/options/UsageHistorySyncTab.test.tsx tests/entrypoints/options/pages/ApiCredentialProfiles/VerifyApiCredentialProfileDialog.test.tsx
git commit -m "refactor(settings): distinguish active loading actions"
```

### Task 6: Distinguish Multi-Action Feature Workflows

**Files:**

- Create: `src/features/AutoCheckin/actionState.ts`
- Modify: `src/features/AutoCheckin/AutoCheckin.tsx`
- Modify: `src/features/AutoCheckin/components/ActionBar.tsx`
- Create: `src/features/ManagedSiteModelSync/actionState.ts`
- Modify: `src/features/ManagedSiteModelSync/ManagedSiteModelSync.tsx`
- Modify: `src/features/ManagedSiteModelSync/components/ActionBar.tsx`
- Modify: `src/features/AccountManagement/components/TagPicker/TagPicker.tsx`
- Modify: `src/locales/{en,es-419,ja,vi,zh-CN,zh-TW}/managedSiteModelSync.json`
- Test: `tests/features/AutoCheckin/components/ActionBar.test.tsx`
- Test: `tests/entrypoints/options/AutoCheckinQuickRun.test.tsx`
- Test: `tests/features/ManagedSiteModelSync/components.test.tsx`
- Test: `tests/features/ManagedSiteModelSync/ManagedSiteModelSync.test.tsx`
- Test: `tests/features/AccountManagement/components/TagPicker.test.tsx`

- [ ] **Step 1: Write failing multi-action tests**

Cover Run Now and one debug action in Auto Check-in; Run All, Run Selected,
Retry Failed, manual Run Selected, and manual channel refresh in model sync; and
create, rename, and delete in TagPicker. Assert initiating control busy, siblings
locked-only, exact pending accessible names, entity-scoped rename loading, and
rejection cleanup. For model-sync channels, assert automatic loading only
disables Refresh, while a user-triggered refresh exposes busy semantics and
returns to idle after failure.

```tsx
expect(screen.getByRole("button", { name: /running all/i })).toHaveAttribute(
  "aria-busy",
  "true",
)
expect(screen.getByRole("button", { name: /run selected/i })).not.toHaveAttribute(
  "aria-busy",
)
```

- [ ] **Step 2: Run tests and verify RED**

```powershell
pnpm exec vitest run tests/features/AutoCheckin/components/ActionBar.test.tsx tests/entrypoints/options/AutoCheckinQuickRun.test.tsx tests/features/ManagedSiteModelSync/components.test.tsx tests/features/ManagedSiteModelSync/ManagedSiteModelSync.test.tsx tests/features/AccountManagement/components/TagPicker.test.tsx
```

- [ ] **Step 3: Add canonical action constants and lifecycle-owned state**

Create canonical runtime values instead of duplicating branch strings:

```ts
export const MANAGED_SITE_MODEL_SYNC_ACTIONS = {
  RUN_ALL: "run_all",
  RUN_SELECTED_HISTORY: "run_selected_history",
  RUN_SELECTED_MANUAL: "run_selected_manual",
  RETRY_FAILED: "retry_failed",
} as const

export type ManagedSiteModelSyncAction =
  (typeof MANAGED_SITE_MODEL_SYNC_ACTIONS)[keyof typeof MANAGED_SITE_MODEL_SYNC_ACTIONS]
```

Create the equivalent `AUTO_CHECKIN_DEBUG_ACTIONS` map for all six debug handlers. Replace `isDebugTriggering` with `activeDebugAction !== null`; each handler sets its own constant before the existing async body and clears it in `finally`. Use `loading={isRunning}` for Run Now and `loading={activeDebugAction === ...}` for each debug button. Render the existing exact pending keys while active: `execution.loading.running`, `triggeringDailyAlarm`, `triggeringRetryAlarm`, `schedulingDailyAlarmForToday`, `evaluatingUiOpenPretrigger`, `triggeringUiOpenPretrigger`, and `resettingLastDailyRunDay`.

Model sync owns `activeAction` in `ManagedSiteModelSync.tsx`. Set it before each existing message Promise and clear it in `finally`; pass it to `ActionBar` and use the manual variant for the manual-tab button. Keep `progress.isRunning` as the aggregate sibling lock. Add separate `isManualChannelRefresh` state around the manual button's `await loadChannels()` call. Automatic route/tab loading continues to set only `isChannelsLoading`, so it disables Refresh without adding `aria-busy`; manual refresh uses both flags and renders `common:status.refreshing`.

For TagPicker, replace `isWorking` with:

```ts
type ActiveTagAction =
  | { kind: "create" }
  | { kind: "rename"; tagId: string }
  | { kind: "delete"; tagId: string }
  | null
```

Derive `isWorking = activeTagAction !== null`. The Create text button uses `common:status.creating`; only the current rename Save `IconButton` receives loading; the delete confirmation receives `isWorking` only when `kind === "delete"`. Other tag controls remain disabled without busy semantics.

- [ ] **Step 4: Add model-sync pending labels in every locale**

Add these three sibling keys under `execution.actions`:

| Locale | `runningAll` | `runningSelected` | `retryingFailed` |
| --- | --- | --- | --- |
| en | Running all... | Running selected... | Retrying failed... |
| es-419 | Ejecutando todo... | Ejecutando seleccionados... | Reintentando fallidos... |
| ja | すべて実行中... | 選択項目を実行中... | 失敗項目を再試行中... |
| vi | Đang chạy tất cả... | Đang chạy mục đã chọn... | Đang thử lại mục thất bại... |
| zh-CN | 全部执行中... | 所选项执行中... | 失败项重试中... |
| zh-TW | 全部執行中... | 所選項執行中... | 失敗項重試中... |

- [ ] **Step 5: Run tests, extraction, and commit**

Run Step 2, then:

```powershell
pnpm run i18n:extract:ci
git add -- src/features/AutoCheckin/actionState.ts src/features/AutoCheckin/AutoCheckin.tsx src/features/AutoCheckin/components/ActionBar.tsx src/features/ManagedSiteModelSync/actionState.ts src/features/ManagedSiteModelSync/ManagedSiteModelSync.tsx src/features/ManagedSiteModelSync/components/ActionBar.tsx src/features/AccountManagement/components/TagPicker/TagPicker.tsx src/locales/en/managedSiteModelSync.json src/locales/es-419/managedSiteModelSync.json src/locales/ja/managedSiteModelSync.json src/locales/vi/managedSiteModelSync.json src/locales/zh-CN/managedSiteModelSync.json src/locales/zh-TW/managedSiteModelSync.json tests/features/AutoCheckin/components/ActionBar.test.tsx tests/entrypoints/options/AutoCheckinQuickRun.test.tsx tests/features/ManagedSiteModelSync/components.test.tsx tests/features/ManagedSiteModelSync/ManagedSiteModelSync.test.tsx tests/features/AccountManagement/components/TagPicker.test.tsx
git commit -m "refactor(ui): distinguish multi-action loading states"
```

### Task 7: Separate Preview Loading From Execution Loading

**Files:**

- Modify: `src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog/useManagedSiteTokenBatchExportDialog.ts`
- Modify: `src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog.tsx`
- Modify: `src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog/ManagedSiteTokenBatchExportFooter.tsx`
- Modify: `src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog/ManagedSiteTokenBatchExportPreviewList.tsx`
- Modify: `src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog/ManagedSiteTokenBatchExportStatusPanels.tsx`
- Modify: `src/features/ManagedSiteChannels/components/ManagedSiteChannelMigrationDialog.tsx`
- Test: `tests/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog.test.tsx`
- Test: `tests/features/ManagedSiteChannels/components/ManagedSiteChannelMigrationDialog.test.tsx`

- [ ] **Step 1: Add failing phase-specific tests**

Assert that automatic preview loading disables Start without making it busy,
manual Refresh Preview owns the preview-loading indicator, and the confirmation
dialog preserves its existing immediate-close behavior. After that handoff, the
stable visible Start control shows execution loading while Cancel remains
locked-only. Extend each existing preview-error retry test so a rejected manual
refresh restores the idle name, removes `aria-busy`, and permits a second
retry.

```tsx
expect(screen.getByRole("button", { name: /start/i })).toBeDisabled()
expect(screen.getByRole("button", { name: /start/i })).not.toHaveAttribute(
  "aria-busy",
)

expect(screen.getByRole("button", { name: /preview.*loading/i })).toHaveAttribute(
  "aria-busy",
  "true",
)
```

- [ ] **Step 2: Run tests and verify RED**

```powershell
pnpm exec vitest run tests/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog.test.tsx tests/features/ManagedSiteChannels/components/ManagedSiteChannelMigrationDialog.test.tsx
```

- [ ] **Step 3: Track preview origin and assign loading to the visible owner**

At each workflow owner, add:

```ts
type PreviewLoadOrigin = "automatic" | "manual" | null
const [previewLoadOrigin, setPreviewLoadOrigin] =
  useState<PreviewLoadOrigin>(null)
const isManualPreviewRefresh = previewLoadOrigin === "manual"
```

Opening, target changes, and implicit refreshes set `"automatic"`; the explicit Refresh Preview handler sets `"manual"` before incrementing its refresh key. The existing preview effect clears the origin in `finally` and on dialog reset.

Use `loading={isManualPreviewRefresh}` only on the visible manual refresh control. Error-panel retry may hand off immediately to the existing preview status panel; document it as a status-region transition rather than rendering a second spinner.

For both visible Start controls, remove the combined manual `Loader2`. Keep the
existing immediate `setIsConfirmOpen(false)` behavior. After confirmation
hands off to execution, use `loading={isRunning}` and the existing running
label on the stable Start control; while preview is loading, Start is only
disabled and keeps its idle label/icon. This explicitly treats Start as the
workflow-status continuation after the transient confirmation closes without
changing dialog behavior.

- [ ] **Step 4: Run tests and commit**

Run Step 2, then:

```powershell
git add -- src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog/useManagedSiteTokenBatchExportDialog.ts src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog.tsx src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog/ManagedSiteTokenBatchExportFooter.tsx src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog/ManagedSiteTokenBatchExportPreviewList.tsx src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog/ManagedSiteTokenBatchExportStatusPanels.tsx src/features/ManagedSiteChannels/components/ManagedSiteChannelMigrationDialog.tsx tests/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog.test.tsx tests/features/ManagedSiteChannels/components/ManagedSiteChannelMigrationDialog.test.tsx
git commit -m "refactor(ui): separate preview and execution loading"
```

### Task 8: Reconcile the Manifest and Run Final Gates

**Files:**

- Verify: all source, locale, and test files from Tasks 1-7
- Update checkboxes: `docs/superpowers/plans/2026-07-15-legacy-button-loading-unification.md`

- [ ] **Step 1: Run focused related coverage by implementation batch**

```powershell
pnpm exec vitest related --run src/components/ClaudeCodeRouterImportDialog.tsx src/components/CliProxyExportDialog.tsx src/components/dialogs/UpdateLogDialog/components/UpdateLogDialog.tsx src/entrypoints/content/redemptionAssist/components/RedemptionBatchResultToast.tsx src/features/SiteBookmarks/components/BookmarkDialog.tsx
pnpm exec vitest related --run src/entrypoints/popup/components/HeaderSection.tsx src/features/KeyManagement/components/TokenList.tsx src/features/KeyManagement/components/BatchCliProxyExportDialog.tsx src/components/toast/WarningToast.tsx src/features/ShareSnapshots/components/ShareSnapshotCaptionToast.tsx
pnpm exec vitest related --run src/features/ManagedSiteChannels/ManagedSiteChannels.tsx src/features/ManagedSiteChannels/components/RowActions.tsx
pnpm exec vitest related --run src/features/AutoCheckin/AutoCheckin.tsx src/features/ManagedSiteModelSync/ManagedSiteModelSync.tsx src/features/AccountManagement/components/TagPicker/TagPicker.tsx src/features/BasicSettings/components/tabs/UsageHistorySync
```

Expected: all related suites pass.

- [ ] **Step 2: Run i18n, compile, and structural audits**

```powershell
pnpm run i18n:extract:ci
pnpm compile
sg run -p '<Button $$$BEFORE loading={$LOADING} $$$AFTER>$$$CHILDREN</Button>' --lang tsx src --json=stream
sg run -p '<IconButton $$$BEFORE loading={$LOADING} $$$AFTER>$$$CHILDREN</IconButton>' --lang tsx src --json=stream
rg -n "animate-spin|animate-pulse|<Spinner|<Loader2|aria-busy" src -g "*.tsx"
```

Expected: every new loading match has the correct pending branch or stable icon-only accessible name; remaining manual spinners are page/status indicators or the registered interruptible managed-channel refresh exception. Remaining account-value `animate-pulse` usage is a data-freshness animation paired with a separate initiating-control busy state, not the only async feedback.

- [ ] **Step 3: Recheck every intentional non-change**

Use the manifest below to confirm that locked, static, and interruptible controls did not gain `loading` or `aria-busy`. Verify in particular Verify API/CLI Stop controls and the managed-channel Cancel Refresh control remain clickable while running.

- [ ] **Step 4: Run repository gates**

Stage only the final task-scoped files, then:

```powershell
pnpm run validate:staged
pnpm run validate:push
git diff --check
git status --short
```

Expected: staged validation, compile, knip, formatting, lint, i18n, and diff checks pass; no unrelated files are staged.

- [ ] **Step 5: Commit any final audit-only corrections**

If Task 8 changed only plan checkboxes or audit-driven corrections, commit exactly those files:

```powershell
git add docs/superpowers/plans/2026-07-15-legacy-button-loading-unification.md
git commit -m "docs(ui): record legacy loading migration verification"
```

## Classification Manifest

Line numbers are from commit `7e77ae80e` and may drift. File, component, and action names are the stable locators.

### Shared `Button`: Direct Loading (20)

| Path | Action | Pending copy |
| --- | --- | --- |
| `src/components/ClaudeCodeRouterImportDialog.tsx:249` | Import | `common:status.importing` |
| `src/components/CliProxyExportDialog.tsx:441` | Import | `common:status.importing` |
| `src/components/dialogs/ChannelDialog/components/ChannelDialog.tsx:549` | Retry resource load | `common:status.retrying` |
| `src/components/dialogs/ChannelDialog/components/ChannelDialog.tsx:660` | Load real key | existing feature key |
| `src/components/dialogs/UpdateLogDialog/components/UpdateLogDialog.tsx:110` | Toggle auto-open | `enabling` / `disabling` |
| `src/entrypoints/content/redemptionAssist/components/RedemptionBatchResultToast.tsx:179` | Retry code | `common:status.retrying` |
| `src/entrypoints/content/webAiApiCheck/components/ApiCheckModal.tsx:409` | Save profile | existing feature key |
| `src/features/AccountManagement/components/AccountDialog/AccountForm.tsx:405` | Import cookies | existing feature key |
| `src/features/AccountManagement/components/AccountDialog/AihubmixDefaultKeyPromptDialog.tsx:57` | Create key | existing feature key |
| `src/features/ApiCredentialProfiles/components/VerifyApiCredentialProfileDialog.tsx:705` | Run suite | existing running key |
| `src/features/AutoCheckin/components/ActionBar.tsx:102` | Run now | existing feature key |
| `src/features/BasicSettings/components/tabs/ManagedSite/AxonHubSettings.tsx:216` | Validate | existing validating key |
| `src/features/BasicSettings/components/tabs/ManagedSite/ClaudeCodeHubSettings.tsx:180` | Validate | existing validating key |
| `src/features/BasicSettings/components/tabs/ManagedSite/OctopusSettings.tsx:220` | Validate | existing validating key |
| `src/features/BasicSettings/components/tabs/UsageHistorySync/UsageHistorySyncSettingsSection.tsx:170` | Sync all | existing syncing key |
| `src/features/KeyManagement/components/BatchCliProxyExportDialog.tsx:360` | Start batch | existing running key |
| `src/features/KeyManagement/components/Header.tsx:133` | Refresh tokens | `common:status.refreshing` |
| `src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog/ManagedSiteTokenBatchExportPreviewRow.tsx:99` | Verify row | existing verifying key |
| `src/features/KeyManagement/components/TokenList.tsx:803` | Save profiles | `common:status.saving` |
| `src/features/SiteBookmarks/components/BookmarkDialog.tsx:288` | Add/edit bookmark | `creating` / `saving` |

### Shared `Button`: Active Action, Entity, or Wrapper Continuation Required (18)

- `src/features/AccountManagement/components/TagPicker/TagPicker.tsx:380` — create tag.
- `src/features/ApiCredentialProfiles/components/VerifyApiCredentialProfileDialog.tsx:909` — single probe through persistence.
- `src/features/AutoCheckin/components/ActionBar.tsx:153,161,169,177,185,193` — six debug actions.
- `src/features/BasicSettings/components/tabs/CheckinRedeem/RedemptionAssistSettings.tsx:243` — URL-pattern save.
- `src/features/BasicSettings/components/tabs/UsageHistorySync/UsageHistorySyncStateTable.tsx:245` — sync selected.
- `src/features/BasicSettings/components/tabs/UsageHistorySync/UsageHistorySyncRowActions.tsx:31` — local row-menu sync continuation; aggregate sync remains locked-only.
- `src/features/BasicSettings/components/tabs/WebAiApiCheck/WebAiApiCheckSettings.tsx:274,330` — two explicit saves.
- `src/features/ManagedSiteModelSync/components/ActionBar.tsx:58,66,73` — run all, selected, retry failed.
- `src/features/ManagedSiteModelSync/ManagedSiteModelSync.tsx:1215` — manual selected run.
- `src/features/ManagedSiteModelSync/ManagedSiteModelSync.tsx:1224` — distinguish automatic channel loading from manual refresh.

### Shared `Button`: Composite Phase or Workflow Handoff (5)

- `src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog/ManagedSiteTokenBatchExportFooter.tsx:90` — preview lock vs confirmed execution handoff.
- `src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog/ManagedSiteTokenBatchExportPreviewList.tsx:97` — automatic vs manual preview.
- `src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog/ManagedSiteTokenBatchExportStatusPanels.tsx:35` — error retry handoff.
- `src/features/ManagedSiteChannels/components/ManagedSiteChannelMigrationDialog.tsx:503` — preview lock vs confirmed execution handoff.
- `src/features/ManagedSiteChannels/components/ManagedSiteChannelMigrationDialog.tsx:592` — automatic vs manual preview.

### Shared `Button`: Interruptible Busy Exception (7)

- `src/components/dialogs/VerifyApiDialog/index.tsx:606,827`.
- `src/components/dialogs/VerifyCliSupportDialog/index.tsx:674,855`.
- `src/entrypoints/content/webAiApiCheck/components/ApiCheckModal.tsx:394`.
- `src/entrypoints/content/webAiApiCheck/components/ApiCheckProbeList.tsx:70`.
- `src/features/ManagedSiteChannels/ManagedSiteChannels.tsx:1601`.

These retain Run/Retry ↔ Stop or Refresh ↔ Cancel behavior and do not use the disabling shared loading prop.

### Shared `Button`: Locked by Another Action (42)

- ChannelDialog: `:472,523,705,718,731`.
- `SettingSection.tsx:116`; `DestructiveConfirmDialog.tsx:105`.
- Clear mappings: `ClearModelRedirectMappingsDialog.tsx:307,315,336,347`.
- Account default-key Cancel: `AihubmixDefaultKeyPromptDialog.tsx:48`.
- Account bulk toolbar: `AccountList/index.tsx:1115,1124,1133,1156,1165,1242`.
- Account dedupe: `DedupeAccountCard.tsx:115`; `DedupeAccountsDialog/index.tsx:260,268`.
- API profile edit Cancel: `ApiCredentialProfileDialog.tsx:436`.
- Managed model-sync settings entry/Cancel: `managedSiteModelSyncSettings.tsx:782,837`.
- New API verification entry: `NewApiSettings.tsx:352`.
- Usage-history Clear Selection: `UsageHistorySyncStateTable.tsx:254`.
- WebDAV Cancel controls: `WebDAVSettings.tsx:1112`; `WebDAVDecryptPasswordModal.tsx:77`.
- Batch export Cancel controls: `BatchCliProxyExportDialog.tsx:352`; `ManagedSiteTokenBatchExportFooter.tsx:79`.
- Managed-channel filter/migration Cancel: `ChannelFilterDialog.tsx:399`; `ManagedSiteChannelMigrationDialog.tsx:495`.
- Managed verification footer: `NewApiManagedVerificationDialog.tsx:245,252,258,268`.
- Model batch selection: `BatchVerifyModelsDialog.tsx:1212`.
- Bookmark Cancel: `BookmarkDialog.tsx:279`.
- Add-token Cancel: `AddTokenDialog/FormActions.tsx:34`.
- Permission onboarding siblings: `PermissionOnboardingDialog.tsx:139,147`.
- Reset-settings entry: `ResetSettingsSection.tsx:64`.

### Non-Button and Wrapper Dispositions

**Direct/wrapper loading:** popup `HeaderSection.tsx:220`; `KeyDisplay.tsx:62`; account smart-copy `AccountActionButtons/index.tsx:822`; account metric buttons `BalanceDisplay.tsx:82`; stale-check-in and health refresh controls in `SiteInfo.tsx`; telemetry refresh `ApiCredentialProfileListItem.tsx:402`; snapshot copy `ShareSnapshotCaptionToast.tsx:79`; account refresh `AccountActionMenuItem.tsx` consumer at `index.tsx:992`; usage-sync and channel-row overflow status continuations; WarningToast async refresh/retry consumers.

**Active entity:** TagPicker rename Save `IconButton` at `TagPicker.tsx:437`; deletion remains owned by `DestructiveConfirmDialog`.

**Static/locked:** share-snapshot prerequisite, API-check Close, base-URL history, repeatable-input controls, drag handles, account copy-url/edit, account bulk-mode sort, MultiSelect, SiteInfoInput, bookmark-tree leaf, TagPicker synchronous select/remove, and toast Close controls remain unchanged.

**Interruptible:** managed-site channel Refresh ↔ Cancel Refresh remains enabled with manual `aria-busy`, hidden visual spinner, and the current cancel-action label.
