# Button Loading States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every existing shared text-button `loading` path show a spinner and an action-specific in-progress label, while exposing consistent busy semantics for text and icon buttons.

**Architecture:** Keep action-state copy owned by each workflow so the shared button remains compatible with Radix `asChild` composition. Let `Button` own spinner/disabled/`aria-busy` behavior, keep action vocabulary in i18n resources, and migrate every structural `<Button loading={...}>` call site to render an action-specific pending label while loading.

**Tech Stack:** React, TypeScript, Radix Slot, i18next, Vitest, Testing Library, ast-grep.

**Scope:** This first consistency pass covers all 72 structural `<Button loading={...}>` call sites, their wrapper consumers, and the dormant `IconButton loading` contract. Historical async buttons that only set `disabled`, manually render a spinner, or change copy without using the shared loading prop are recorded for a later state-model pass because several require new active-action discriminators rather than a mechanical UI migration.

---

### Task 1: Expose Shared Busy Semantics

**Files:**

- Modify: `src/components/ui/button.tsx`
- Modify: `src/components/ui/IconButton.tsx`
- Test: `tests/components/Button.test.tsx`
- Test: `tests/components/IconButton.test.tsx`

- [ ] **Step 1: Write failing behavior tests**

Add a `Button` test that renders:

```tsx
const isSaving = true

<Button loading>
  {isSaving ? "Saving changes..." : "Save changes"}
</Button>
```

Assert that the button has accessible name `/Saving changes/`, contains one spinner, has `aria-busy="true"`, remains disabled, and does not expose the idle label. Also verify that loading overrides an explicitly false `aria-busy` value and non-loading preserves an explicit value. Add an `IconButton` loading test that asserts the original accessible name remains available, the icon content is replaced, the button is disabled, and `aria-busy="true"` is present.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
pnpm exec vitest run tests/components/Button.test.tsx tests/components/IconButton.test.tsx
```

Expected: the pending label already renders, while the new `aria-busy` assertions fail because neither component currently owns busy semantics.

- [ ] **Step 3: Implement additive `aria-busy` behavior**

Destructure the caller's `aria-busy` value in each component and resolve it with loading taking precedence:

```tsx
"aria-busy": ariaBusy,
// ...
aria-busy={loading ? true : ariaBusy}
```

Preserve the existing children, Radix `Slot.Slottable`, physical `disabled` behavior, click/analytics guards, and `IconButton` accessible name/title behavior. Hide the visual Spinner inside `Button` from assistive technology so it does not concatenate its generic status name with caller-owned pending text; standalone Spinner semantics remain unchanged. Do not add a competing pending-label prop to the shared component.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command again.

Expected: both component suites pass with caller-owned pending labels, spinner behavior, disabled interaction, analytics suppression, and busy semantics intact.

### Task 2: Complete the Shared Pending-Action Vocabulary

**Files:**

- Modify: `src/locales/en/common.json`
- Modify: `src/locales/zh-CN/common.json`
- Modify: `src/locales/zh-TW/common.json`
- Modify: `src/locales/ja/common.json`
- Modify: `src/locales/es-419/common.json`
- Modify: `src/locales/vi/common.json`

- [ ] **Step 1: Add only missing reusable pending states**

Keep existing `creating`, `exporting`, `importing`, `loading`, `processing`, `refreshing`, `resetting`, `saving`, `testing`, `updating`, and `uploading`. Add the smallest locale-synchronized set needed by migrated buttons, using the same `common:status.*` shape in every locale:

```json
{
  "applying": "Applying...",
  "cancelling": "Cancelling...",
  "checking": "Checking...",
  "deleting": "Deleting...",
  "disabling": "Disabling...",
  "opening": "Opening...",
  "retrying": "Retrying...",
  "starting": "Starting..."
}
```

Use natural sibling-locale translations, preserve identical key shapes, and reuse more specific existing feature keys such as regeneration, rotation, and sync labels instead of duplicating them in `common`. Keep compound download/import work on `common:status.processing`, and keep icon-only action names stable while `aria-busy` communicates progress.

- [ ] **Step 2: Verify locale shape without running removal-sensitive extraction yet**

```powershell
pnpm exec prettier --check src/locales/en/common.json src/locales/es-419/common.json src/locales/ja/common.json src/locales/vi/common.json src/locales/zh-CN/common.json src/locales/zh-TW/common.json
```

Expected: all six JSON files are valid and formatted. Do not run `i18n:extract:ci` until Tasks 3-4 reference the new keys because the extractor intentionally removes unused keys.

### Task 3: Migrate Shared, Account, and Settings Buttons

**Files:**

- Modify: `src/components/dialogs/ChannelDialog/components/ChannelDialog.tsx`
- Modify: `src/components/KiloCodeExportDialog.tsx`
- Modify: `src/components/PopupInterruptionHintBanner.tsx`
- Modify: `src/components/ReleaseUpdateStatusPanel.tsx`
- Modify: `src/components/SettingSection.tsx`
- Modify: `src/components/ui/Dialog/DestructiveConfirmDialog.tsx`
- Modify: `src/components/ui/EmptyState.tsx`
- Test: `tests/components/DestructiveConfirmDialog.test.tsx`
- Test: `tests/components/EmptyState.test.tsx`
- Modify: `src/features/AccountManagement/AccountManagement.tsx`
- Modify: `src/features/AccountManagement/components/AccountDialog/AccountForm.tsx`
- Modify: `src/features/AccountManagement/components/AccountDialog/ActionButtons.tsx`
- Modify: `src/features/AccountManagement/components/AccountDialog/CookieAuthPermissionRecommendation.tsx`
- Modify: `src/features/AccountManagement/components/AccountList/index.tsx`
- Modify: `src/features/AccountManagement/components/CopyKeyDialog/RuntimeKeyList.tsx`
- Modify: `src/features/AccountManagement/components/DedupeAccountsDialog/index.tsx`
- Modify: `src/features/AccountManagement/components/DelAccountDialog/index.tsx`
- Modify: `src/features/AccountManagement/components/TagPicker/TagPicker.tsx`
- Modify: `src/features/ApiCredentialProfiles/components/ApiCredentialProfileDialog.tsx`
- Modify: `src/features/ApiCredentialProfiles/components/ApiCredentialProfilesDialogs.tsx`
- Modify: `src/features/BasicSettings/components/tabs/CliProxy/CliProxySettings.tsx`
- Modify: `src/features/BasicSettings/components/tabs/ManagedSite/managedSiteModelSyncSettings.tsx`
- Modify: `src/features/BasicSettings/components/tabs/ManagedSite/ModelRedirectSettings.tsx`
- Modify: `src/features/BasicSettings/components/tabs/Notifications/TaskNotificationSettings.tsx`
- Modify: `src/features/BasicSettings/components/tabs/Permissions/PermissionSettings.tsx`
- Modify: `src/features/BasicSettings/components/tabs/UsageHistorySync/UsageHistorySyncSettingsSection.tsx`
- Modify: `src/features/BasicSettings/components/dialogs/ClearModelRedirectMappingsDialog.tsx`
- Modify: `src/features/BasicSettings/components/tabs/General/ResetSettingsSection.tsx`
- Modify: `src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog.tsx`
- Modify: `src/features/KeyManagement/components/RepairMissingKeysDialog/RepairInvalidKeysDeleteConfirm.tsx`
- Modify: `src/features/ManagedSiteChannels/ManagedSiteChannels.tsx`
- Modify: `src/features/ManagedSiteChannels/components/ManagedSiteChannelMigrationDialog.tsx`
- Test: affected tests discovered by Vitest related mode

- [ ] **Step 1: Migrate every structural loading button in this group**

Use caller-owned conditional children consistently:

```tsx
<Button
  loading={isSaving}
>
  {isSaving ? t("common:status.saving") : t("common:actions.save")}
</Button>
```

For previously static labels, add the matching pending label (`refreshing`, `checking`, `applying`, `importing`, `deleting`, and so on). Extend `EmptyStateAction` with `loadingLabel` and `DestructiveConfirmDialog` with `workingLabel`; render those only while their existing loading/working flag is true so wrappers never guess the action. Write wrapper tests first, observe them fail, then implement and migrate every active wrapper consumer. Keep idle labels unchanged and do not add generic page-level loading copy.

- [ ] **Step 2: Prove no loading button in this group lacks pending text**

```powershell
pnpm compile
pnpm exec vitest related --run src/components/ui/button.tsx src/components/ui/IconButton.tsx src/components/SettingSection.tsx src/components/ReleaseUpdateStatusPanel.tsx src/features/AccountManagement/AccountManagement.tsx src/features/BasicSettings/components/tabs/Permissions/PermissionSettings.tsx
```

Expected: TypeScript accepts every migrated caller and all discovered component tests pass.

### Task 4: Migrate Workflow and Data-Operation Buttons

**Files:**

- Modify: `src/features/AutoCheckin/components/ActionBar.tsx`
- Modify: `src/features/AutoCheckin/components/ResultsTable.tsx`
- Modify: `src/features/ImportExport/components/ExportSection.tsx`
- Modify: `src/features/ImportExport/components/ImportSection.tsx`
- Modify: `src/features/ImportExport/components/WebDAVAutoSyncSettings.tsx`
- Modify: `src/features/ImportExport/components/WebDAVDecryptPasswordModal.tsx`
- Modify: `src/features/ImportExport/components/WebDAVSettings.tsx`
- Modify: `src/features/KeyManagement/components/Header.tsx`
- Modify: `src/features/KeyManagement/components/RepairMissingKeysDialog/RepairAccountCoverageList.tsx`
- Modify: `src/features/KeyManagement/components/RepairMissingKeysDialog/RepairMissingKeysProgressCard.tsx`
- Modify: `src/features/KeyManagement/components/RepairMissingKeysDialog/RepairMissingKeysSetupCard.tsx`
- Modify: `src/features/KeyManagement/components/ServiceCredentialCard.tsx`
- Modify: `src/features/KeyManagement/components/TokenListItem/TokenHeader.tsx`
- Modify: `src/features/ManagedSiteChannels/components/ChannelFilterDialog.tsx`
- Modify: `src/features/ManagedSiteModelSync/components/ActionBar.tsx`
- Modify: `src/features/ManagedSiteModelSync/components/ResultsTable.tsx`
- Modify: `src/features/ManagedSiteVerification/NewApiManagedVerificationDialog.tsx`
- Modify: `src/features/ModelList/components/ModelKeyDialog/index.tsx`
- Modify: `src/features/ModelList/components/StatusIndicator.tsx`
- Modify: `src/features/ModelList/ModelList.tsx`
- Modify: `src/features/OptionsOverview/components/dialogs/PermissionOnboardingDialog.tsx`
- Modify: `src/features/SiteAnnouncements/SiteAnnouncements.tsx`
- Modify: `src/features/SiteBookmarks/components/BookmarkDialog.tsx`
- Modify: `src/features/TokenProvisioning/components/AddTokenDialog/FormActions.tsx`
- Modify: `src/features/TokenProvisioning/components/OneTimeApiKeyDialog.tsx`
- Test: affected tests discovered by Vitest related mode

- [ ] **Step 1: Apply the same conditional-label contract to every remaining Button**

Use action-specific common states where they describe the operation and retain more informative feature-local labels where they already exist. Examples:

```tsx
<Button loading={isExporting}>
  {isExporting
    ? t("common:status.exporting")
    : t("common:actions.export")}
</Button>

<Button loading={isCancelling}>
  {isCancelling
    ? t("common:status.cancelling")
    : t("keyManagement:repairMissingKeys.actions.cancel")}
</Button>
```

Do not replace dedicated progress panels, result copy, toasts, or long-running status summaries; this task only standardizes the trigger button itself.

- [ ] **Step 2: Run structural and related-test verification**

```powershell
sg run -p '<Button $$$BEFORE loading={$LOADING} $$$AFTER>$$$CHILDREN</Button>' --lang tsx src --json=stream
pnpm compile
pnpm exec vitest related --run src/features/AutoCheckin/components/ResultsTable.tsx src/features/ImportExport/components/WebDAVSettings.tsx src/features/KeyManagement/components/RepairMissingKeysDialog/RepairMissingKeysProgressCard.tsx src/features/ModelList/components/StatusIndicator.tsx
```

Expected: every text-button structural match renders a pending branch while its loading expression is true; the one icon-only match keeps a stable action-specific accessible name plus `aria-busy`; TypeScript passes; and all related tests pass.

### Task 5: Validate and Commit the Integrated Migration

**Files:**

- Verify: all files from Tasks 1-4
- Verify: `docs/superpowers/plans/2026-07-14-button-loading-states.md`

- [ ] **Step 1: Run focused component tests and i18n validation**

```powershell
pnpm exec vitest run tests/components/Button.test.tsx tests/components/IconButton.test.tsx
pnpm run i18n:extract:ci
```

- [ ] **Step 2: Run the staged commit gate**

Stage only task files, then run:

```powershell
pnpm run validate:staged
```

- [ ] **Step 3: Run the shared-contract push gate**

```powershell
pnpm run validate:push
```

- [ ] **Step 4: Inspect and commit the isolated diff**

```powershell
git diff --check
git status --short
git diff --cached --stat
git commit -m "refactor(ui): unify button loading states"
```

Expected: no static-only loading caller, locale drift, unrelated file, temporary artifact, or debug code remains.
