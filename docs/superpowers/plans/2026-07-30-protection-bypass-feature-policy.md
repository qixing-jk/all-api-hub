# Protection Bypass Feature Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy protection-bypass usage-scope settings with eight
automatic product-feature controls while keeping every explicit user command
eligible, enforcing exact feature-to-task ownership, and migrating stored and
synchronized preferences without resetting user choices.

**Architecture:** Workflow roots create one immutable version-2 execution value
using a closed product-feature catalog; the background Coordinator validates
command ownership and exact task kind before pool submission, then re-evaluates
current automatic policy, capability, and resource state at acquire time. One
canonical preference normalizer owns local migration, manual import, and WebDAV
import; settings, telemetry, search, and runtime policy consume only its rebuilt
feature map.

**Tech Stack:** TypeScript, React, WXT, Manifest V3 runtime messaging, WXT
storage, Vitest, Testing Library, Playwright, i18next, pnpm.

**Design authority:**
`docs/superpowers/specs/2026-07-22-protection-bypass-intent-policy-design.md`

**Branch:** Continue in `feat/protection-bypass-feature-policy` in the current
workspace. Do not create a worktree. Preserve the pre-existing untracked files.

**Amended 2026-07-31:** Ordinary preference reads migrate and normalize into a
canonical v27 snapshot without writing storage. Raw legacy storage may remain
until a normal save or import persists the canonical shape.

---

## Delivery Boundaries

This is one product change across two atomic cutovers, not independent
sub-projects:

1. The version-2 catalog, exact task matrix, automatic roots, and explicit
   commands change together. Removing the three old feature values before their
   callers move would leave the tree uncompilable.
2. The stored preference shape, runtime policy, settings UI/search, reminder
   behavior, and settings telemetry change together. Migrating storage before
   those consumers move would let old code read or recreate deleted fields.

The plan references the design for product semantics and records only execution
order, code seams, tests, and validation. Do not copy policy prose out of the
design into another authority.

## File and Ownership Map

| Responsibility | Final owner |
| --- | --- |
| Product and automatic feature catalogs, commands, execution v2, task catalog/matrix, runtime validation | `src/services/protectionBypass/contracts.ts` |
| Pure command construction | `src/services/protectionBypass/client.ts` |
| Stored preference type/default, read-only snapshot, and write/import orchestration | `src/services/preferences/userPreferences.ts` |
| Canonical fallback preference rebuild and legacy precedence | `src/services/preferences/tempWindowFallbackPreferences.ts` |
| Version 26 to 27 registration and migration sequencing | `src/services/preferences/migrations/preferencesMigration.ts` |
| Current automatic policy adapter | `src/services/protectionBypass/preferencePolicy.ts` |
| Exact task and acquire-time policy evaluation | `src/services/protectionBypass/policy.ts` |
| Preflight, current-state reads, pool submission, controlled outcomes | `src/entrypoints/background/protectionBypassCoordinator.ts` |
| Stable settings/deep-link target IDs | `src/features/BasicSettings/components/tabs/Refresh/searchTargets.ts` |
| Settings rendering | `src/features/BasicSettings/components/tabs/Refresh/ShieldSettings.tsx` |
| Fixed settings telemetry fields | `src/services/productAnalytics/settingsSnapshot.ts`, `settings.ts`, `contracts.ts`, `privacy.ts` |
| Daily decision aggregation | `src/services/productAnalytics/shieldBypassSummary.ts`, `state.ts` |

## Task 1: Cut Over Execution v2 and Product Workflow Ownership

This task is intentionally one compile-safe integration slice. It removes the
old feature and command values only when all production construction roots and
typed validators have moved.

**Files:**

- Modify: `src/services/protectionBypass/contracts.ts`
- Modify: `src/services/protectionBypass/client.ts`
- Modify: `src/services/protectionBypass/policy.ts`
- Modify: `src/services/protectionBypass/decisionErrorCode.ts`
- Modify: `src/entrypoints/background/protectionBypassCoordinator.ts`
- Modify: `src/entrypoints/background/runtimeMessages.ts`
- Modify: `src/services/accounts/autoRefreshService.ts`
- Modify: `src/features/AccountManagement/hooks/AccountDataContext.tsx`
- Modify: `src/services/history/dailyBalanceHistory/scheduler.ts`
- Modify: `src/services/checkin/autoCheckin/scheduler.ts`
- Modify: `src/features/AutoCheckin/AutoCheckin.tsx`
- Modify: `src/hooks/useAutoCheckinUiOpenPretrigger.ts`
- Modify: `src/services/redemption/redemptionAssist.ts`
- Modify: `src/services/integrations/ldohSiteLookup/background.ts`
- Modify: `src/features/LdohSiteLookup/hooks/LdohSiteLookupContext.tsx`
- Modify: `src/features/KeyManagement/KeyManagement.tsx`
- Modify: `src/features/KeyManagement/hooks/useKeyManagement.ts`
- Modify: `src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog/useManagedSiteTokenBatchExportDialog.ts`
- Modify: `src/components/dialogs/ChannelDialog/components/ChannelDialog.tsx`
- Modify: `src/components/dialogs/ChannelDialog/hooks/useChannelDialog.ts`
- Modify: `src/features/ManagedSiteChannels/ManagedSiteChannels.tsx`
- Modify: `src/features/ManagedSiteModelSync/ManagedSiteModelSync.tsx`
- Modify: `src/features/ManagedSiteVerification/loadNewApiChannelKeyWithVerification.ts`
- Modify: `src/services/models/modelSync/scheduler.ts`
- Modify: `src/services/models/modelRedirect/ModelRedirectService.ts`
- Modify: `src/services/productAnalytics/contracts.ts`
- Modify: `src/services/productAnalytics/shieldBypassSummary.ts`
- Modify: `src/services/productAnalytics/privacy.ts`
- Modify: `src/services/productAnalytics/state.ts`
- Modify: `tests/services/protectionBypass/fixtures.ts`
- Modify: `tests/services/protectionBypass/contracts.test.ts`
- Modify: `tests/services/protectionBypass/client.test.ts`
- Modify: `tests/services/protectionBypass/policy.test.ts`
- Create: `tests/services/protectionBypass/decisionErrorCode.test.ts`
- Modify: `tests/entrypoints/background/protectionBypassCoordinator.test.ts`
- Modify: `tests/entrypoints/background/protectionBypassCoordinator.defaultValidator.test.ts`
- Modify: `tests/entrypoints/background/runtimeMessages.test.ts`
- Modify: `tests/entrypoints/background/runtimeMessages.more.test.ts`
- Modify: `tests/services/autoRefreshService.test.ts`
- Modify: `tests/features/AccountManagement/hooks/AccountDataContext.test.tsx`
- Modify: `tests/services/dailyBalanceHistory/scheduler.test.ts`
- Modify: `tests/services/autoCheckin/scheduler.test.ts`
- Modify: `tests/components/AutoCheckinUiOpenPretrigger.test.tsx`
- Modify: `tests/entrypoints/options/AutoCheckinQuickRun.test.tsx`
- Modify: `tests/services/redemptionAssist.test.ts`
- Modify: `tests/services/ldohSiteLookup.background.test.ts`
- Modify: `tests/services/ldohSiteLookup.runtime.test.ts`
- Modify: `tests/features/LdohSiteLookupContext.test.tsx`
- Modify: `tests/entrypoints/options/pages/KeyManagement/useKeyManagement.test.tsx`
- Modify: `tests/entrypoints/options/pages/KeyManagement/KeyManagement.managedSiteStatusSupport.test.tsx`
- Modify: `tests/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog.test.tsx`
- Modify: `tests/components/dialogs/ChannelDialog/ChannelDialog.advisoryWarning.test.tsx`
- Modify: `tests/features/AccountManagement/components/AccountActionButtons.test.tsx`
- Modify: `tests/entrypoints/options/pages/ManagedSiteChannels/ManagedSiteChannels.test.tsx`
- Modify: `tests/features/ManagedSiteModelSync/ManagedSiteModelSync.test.tsx`
- Modify: `tests/features/ManagedSiteVerification/loadNewApiChannelKeyWithVerification.test.ts`
- Modify: `tests/services/modelSync/messageHandler.test.ts`
- Modify: `tests/services/modelRedirect/ModelRedirectService.test.ts`
- Modify: `tests/services/modelRedirect/ModelRedirectService.apply.test.ts`
- Modify: `tests/services/modelRedirect/ModelRedirectService.bulkClear.test.ts`
- Modify: `tests/services/modelSync/scheduler.more.test.ts`
- Modify: `tests/services/modelSync/scheduler.modelRedirectPrune.test.ts`
- Modify: `tests/services/productAnalytics/shieldBypassSummary.test.ts`
- Modify: `tests/services/productAnalytics/privacy.test.ts`
- Modify: `tests/services/productAnalytics/state.test.ts`

- [ ] **Step 1: Write failing catalog, parser, matrix, and ownership tests**

In `contracts.test.ts`, assert the serialized contract rather than a duplicate
implementation array:

```ts
expect(PROTECTION_BYPASS_EXECUTION_VERSION).toBe(2)
expect(Object.values(PROTECTION_BYPASS_FEATURES)).toEqual([
  "account_refresh",
  "balance_history",
  "checkin",
  "redemption_assist",
  "ldoh_site_lookup",
  "key_management",
  "managed_site_channels",
  "managed_site_model_sync",
  "account_onboarding",
])
expect(Object.values(PROTECTION_BYPASS_AUTOMATIC_FEATURES)).toEqual(
  Object.values(PROTECTION_BYPASS_FEATURES).filter(
    (feature) => feature !== PROTECTION_BYPASS_FEATURES.AccountOnboarding,
  ),
)
```

Add parser cases proving:

```ts
expect(
  isProtectionBypassExecution({
    version: 2,
    kind: "automatic",
    feature: "account_onboarding",
    trigger: "scheduled",
    surface: "background",
  }),
).toBe(false)
expect(
  isProtectionBypassExecution({
    version: 1,
    kind: "automatic",
    feature: "session_resync",
    trigger: "scheduled",
    surface: "background",
  }),
).toBe(false)
```

In `policy.test.ts`, generate the full cross-product of product features and
task kinds, then compare each decision with the approved matrix. Include these
same-operation regressions:

```ts
expectDecision("account_refresh", "api_fallback_fetch", "allowed")
expectDecision("account_refresh", "profile_isolated_fetch", "task_not_permitted")
expectDecision("key_management", "new_api_session_read", "allowed")
expectDecision("account_refresh", "new_api_session_read", "task_not_permitted")
```

For every product feature, assert `rendered_title` and `open_context` return
`task_not_permitted`.

In Coordinator tests, send missing, malformed, version-1, and feature/task
mismatched requests. Missing returns `missing_execution`; every malformed or
old-version value returns `invalid_execution`. None may call
`executeAuthorizedTask`. A feature/task mismatch must also avoid `readPolicy`,
`resolveCapability`, and resource validation, but it records exactly one
canonical `task_not_permitted` daily decision before returning. Missing and
invalid executions have no trustworthy canonical feature, so they return their
controlled error without fabricating a feature-summary entry. A valid request
still submits one task and receives its acquire-time callback.

In the workflow tests listed above, replace broad `AccountRefresh`,
`SiteDetection`, `SessionResync`, and `Verification` expectations with each
owning product feature. Add a regression that check-in success passes the same
check-in execution object into its follow-up `refreshAccount` call.

- [ ] **Step 2: Run the focused tests and verify RED**

```powershell
pnpm exec vitest --run tests/services/protectionBypass/contracts.test.ts tests/services/protectionBypass/client.test.ts tests/services/protectionBypass/policy.test.ts tests/services/protectionBypass/decisionErrorCode.test.ts tests/entrypoints/background/protectionBypassCoordinator.test.ts tests/entrypoints/background/protectionBypassCoordinator.defaultValidator.test.ts tests/entrypoints/background/runtimeMessages.test.ts tests/entrypoints/background/runtimeMessages.more.test.ts tests/services/autoRefreshService.test.ts tests/features/AccountManagement/hooks/AccountDataContext.test.tsx tests/services/dailyBalanceHistory/scheduler.test.ts tests/services/autoCheckin/scheduler.test.ts tests/components/AutoCheckinUiOpenPretrigger.test.tsx tests/entrypoints/options/AutoCheckinQuickRun.test.tsx tests/services/redemptionAssist.test.ts tests/services/ldohSiteLookup.background.test.ts tests/services/ldohSiteLookup.runtime.test.ts tests/features/LdohSiteLookupContext.test.tsx tests/services/modelSync/messageHandler.test.ts tests/services/modelSync/scheduler.more.test.ts tests/services/modelSync/scheduler.modelRedirectPrune.test.ts tests/services/modelRedirect/ModelRedirectService.apply.test.ts tests/services/modelRedirect/ModelRedirectService.bulkClear.test.ts
```

Expected: FAIL on version 1, the old feature/command catalog, the coarse
operation matrix, and incorrect workflow ownership.

- [ ] **Step 3: Implement the closed version-2 catalog and exact task matrix**

Use one product catalog and derive the automatic subset from its values:

```ts
export const PROTECTION_BYPASS_EXECUTION_VERSION = 2 as const

export const PROTECTION_BYPASS_FEATURES = {
  AccountRefresh: "account_refresh",
  BalanceHistory: "balance_history",
  Checkin: "checkin",
  RedemptionAssist: "redemption_assist",
  LdohSiteLookup: "ldoh_site_lookup",
  KeyManagement: "key_management",
  ManagedSiteChannels: "managed_site_channels",
  ManagedSiteModelSync: "managed_site_model_sync",
  AccountOnboarding: "account_onboarding",
} as const

export const PROTECTION_BYPASS_AUTOMATIC_FEATURES = {
  AccountRefresh: PROTECTION_BYPASS_FEATURES.AccountRefresh,
  BalanceHistory: PROTECTION_BYPASS_FEATURES.BalanceHistory,
  Checkin: PROTECTION_BYPASS_FEATURES.Checkin,
  RedemptionAssist: PROTECTION_BYPASS_FEATURES.RedemptionAssist,
  LdohSiteLookup: PROTECTION_BYPASS_FEATURES.LdohSiteLookup,
  KeyManagement: PROTECTION_BYPASS_FEATURES.KeyManagement,
  ManagedSiteChannels: PROTECTION_BYPASS_FEATURES.ManagedSiteChannels,
  ManagedSiteModelSync: PROTECTION_BYPASS_FEATURES.ManagedSiteModelSync,
} as const

export type ProtectionBypassAutomaticFeature =
  (typeof PROTECTION_BYPASS_AUTOMATIC_FEATURES)[keyof typeof PROTECTION_BYPASS_AUTOMATIC_FEATURES]
```

The automatic branch and constructor accept only
`ProtectionBypassAutomaticFeature`. Export `TempContextTaskKind` and replace
`PROTECTION_BYPASS_FEATURE_OPERATIONS` with:

```ts
export const PROTECTION_BYPASS_FEATURE_TASK_KINDS = {
  [PROTECTION_BYPASS_FEATURES.AccountRefresh]: [
    TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch,
    TEMP_CONTEXT_TASK_KINDS.SessionRead,
  ],
  [PROTECTION_BYPASS_FEATURES.BalanceHistory]: [
    TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch,
    TEMP_CONTEXT_TASK_KINDS.SessionRead,
  ],
  [PROTECTION_BYPASS_FEATURES.Checkin]: [
    TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch,
    TEMP_CONTEXT_TASK_KINDS.TurnstileFetch,
    TEMP_CONTEXT_TASK_KINDS.NativePageAction,
    TEMP_CONTEXT_TASK_KINDS.SessionRead,
  ],
  [PROTECTION_BYPASS_FEATURES.RedemptionAssist]: [
    TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch,
    TEMP_CONTEXT_TASK_KINDS.SessionRead,
  ],
  [PROTECTION_BYPASS_FEATURES.LdohSiteLookup]: [
    TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch,
  ],
  [PROTECTION_BYPASS_FEATURES.KeyManagement]: [
    TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch,
    TEMP_CONTEXT_TASK_KINDS.SessionRead,
    TEMP_CONTEXT_TASK_KINDS.NewApiSessionRead,
  ],
  [PROTECTION_BYPASS_FEATURES.ManagedSiteChannels]: [
    TEMP_CONTEXT_TASK_KINDS.NewApiSessionRead,
  ],
  [PROTECTION_BYPASS_FEATURES.ManagedSiteModelSync]: [
    TEMP_CONTEXT_TASK_KINDS.NewApiSessionRead,
  ],
  [PROTECTION_BYPASS_FEATURES.AccountOnboarding]: [
    TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch,
    TEMP_CONTEXT_TASK_KINDS.ProfileIsolatedFetch,
    TEMP_CONTEXT_TASK_KINDS.SessionRead,
    TEMP_CONTEXT_TASK_KINDS.OpenRouterManagementKeyAction,
  ],
} as const satisfies Record<
  ProtectionBypassFeature,
  readonly TempContextTaskKind[]
>
```

Delete the old operation allow-list. Keep task-to-operation and task-to-cause
metadata for telemetry and capability only. Export a pure
`isProtectionBypassTaskPermitted(feature, task.kind)` helper. The Coordinator
uses it after execution resolution and before pool submission; `policy.ts`
retains the same check defensively but does not own workflow classification.

Rename the contextless denials to `missing_execution` and
`invalid_execution`, and the contract mismatch to `task_not_permitted`.
`decisionErrorCode.ts` maps all three to
`TEMP_WINDOW_POLICY_CONTEXT_INVALID`. Version 1 is simply invalid; do not add a
special error, compatibility adapter, or cross-RPC upgrade path.

Because preflight mismatch returns before the pool callback, have the
Coordinator record that resolved feature plus `task_not_permitted` exactly
once at the preflight boundary. Do not record a feature decision for missing or
invalid execution values, whose feature identity is not trustworthy.

- [ ] **Step 4: Replace the generic verification command**

Use this final command map:

```ts
export const PROTECTION_BYPASS_USER_COMMANDS = {
  RefreshAccount: "refresh_account",
  RefreshAllAccounts: "refresh_all_accounts",
  RefreshDisabledAccounts: "refresh_disabled_accounts",
  ManualCheckin: "manual_checkin",
  RetryCheckinAccount: "retry_checkin_account",
  AddAccount: "add_account",
  DetectAccount: "detect_account",
  ReauthenticateAccount: "reauthenticate_account",
  ManageApiKeys: "manage_api_keys",
  ManageSiteChannels: "manage_site_channels",
  SyncManagedSiteModels: "sync_managed_site_models",
} as const
```

Map the last three to their namesake product features. Every explicit action in
`KeyManagement.tsx` and `useKeyManagement.ts` uses `ManageApiKeys`, including
load-all/load-one, retry failed, status refresh, delete follow-up reload, and
batch-export preview; do not leave refresh commands in key-management code.

Add a required command parameter to the shared hidden-key loader:

```ts
type ManagedSiteVerificationCommand =
  | typeof PROTECTION_BYPASS_USER_COMMANDS.ManageApiKeys
  | typeof PROTECTION_BYPASS_USER_COMMANDS.ManageSiteChannels

interface LoadNewApiChannelKeyWithVerificationParams {
  command: ManagedSiteVerificationCommand
  // existing fields remain
}
```

Key-management callers pass `ManageApiKeys`; channel dialog, channel matching,
and duplicate-check callers pass `ManageSiteChannels`. Do not infer ownership
from `requestKind` or the current page. Model-sync calls, including selected
sync launched from the channel page, pass `SyncManagedSiteModels`.

- [ ] **Step 5: Reclassify every automatic construction root**

Apply this audited mapping; do not add a ninth model-redirect feature:

| Production root | Feature |
| --- | --- |
| `autoRefreshService` and `AccountDataContext` open refresh | `AccountRefresh` |
| daily balance-history scheduler | `BalanceHistory` |
| check-in scheduler, UI-open pretrigger, automatic check-in UI roots | `Checkin` |
| redemption follow-up refresh | `RedemptionAssist` |
| LDOH background and UI lifecycle lookup | `LdohSiteLookup` |
| all automatic key loading/status/batch/delete-reload roots | `KeyManagement` |
| channel dialog duplicate checks and channel matching | `ManagedSiteChannels` |
| model-sync scheduler/recovery | `ManagedSiteModelSync` |

The check-in success refresh inherits the same check-in execution. The
model-sync redirect post-processing inherits the same model-sync service and
execution.

Delete the unused construction in `ModelRedirectService`:

```ts
const modelSyncService = new ModelSyncService(runtimeConfig)
```

Do not add bypass execution to redirect list/write methods; they currently do
not submit a protected task. Cover the factory behavior in the apply and
bulk-clear suites, while the architecture source audit separately prevents a
future execution constructor from returning.

Keep the balance-history `RefreshNow` message validator explicit-only: it
accepts `RefreshAllAccounts` and rejects automatic executions. Scheduled
capture constructs `BalanceHistory` at its existing scheduler root and does not
flow through `RefreshNow`. `autoRefreshService` continues to accept only
account-refresh automatic execution or the explicit refresh-all command.

- [ ] **Step 6: Update daily telemetry catalogs with the new canonical values**

Update fixed feature and denial count properties in `contracts.ts`, privacy
allow-lists, summary tests, and persisted-state normalization. Delete counters
for `site_detection`, `session_resync`, `verification`, and
`operation_not_permitted`; add all new product features and
`task_not_permitted`. Old persisted keys normalize into `other`; never emit an
old raw key.

Do not add per-attempt or per-toggle events. Preserve the existing daily
aggregation and rollover behavior.

- [ ] **Step 7: Run the complete ownership slice and verify GREEN**

```powershell
pnpm exec vitest --run tests/services/protectionBypass/contracts.test.ts tests/services/protectionBypass/client.test.ts tests/services/protectionBypass/policy.test.ts tests/services/protectionBypass/decisionErrorCode.test.ts tests/entrypoints/background/protectionBypassCoordinator.test.ts tests/entrypoints/background/protectionBypassCoordinator.defaultValidator.test.ts tests/entrypoints/background/runtimeMessages.test.ts tests/entrypoints/background/runtimeMessages.more.test.ts tests/services/autoRefreshService.test.ts tests/features/AccountManagement/hooks/AccountDataContext.test.tsx tests/services/dailyBalanceHistory/scheduler.test.ts tests/services/autoCheckin/scheduler.test.ts tests/components/AutoCheckinUiOpenPretrigger.test.tsx tests/entrypoints/options/AutoCheckinQuickRun.test.tsx tests/services/redemptionAssist.test.ts tests/services/ldohSiteLookup.background.test.ts tests/services/ldohSiteLookup.runtime.test.ts tests/features/LdohSiteLookupContext.test.tsx tests/entrypoints/options/pages/KeyManagement/useKeyManagement.test.tsx tests/entrypoints/options/pages/KeyManagement/KeyManagement.managedSiteStatusSupport.test.tsx tests/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog.test.tsx tests/components/dialogs/ChannelDialog/ChannelDialog.advisoryWarning.test.tsx tests/features/AccountManagement/components/AccountActionButtons.test.tsx tests/entrypoints/options/pages/ManagedSiteChannels/ManagedSiteChannels.test.tsx tests/features/ManagedSiteModelSync/ManagedSiteModelSync.test.tsx tests/features/ManagedSiteVerification/loadNewApiChannelKeyWithVerification.test.ts tests/services/modelSync/messageHandler.test.ts tests/services/modelSync/scheduler.more.test.ts tests/services/modelSync/scheduler.modelRedirectPrune.test.ts tests/services/modelRedirect/ModelRedirectService.apply.test.ts tests/services/modelRedirect/ModelRedirectService.bulkClear.test.ts tests/services/productAnalytics/shieldBypassSummary.test.ts tests/services/productAnalytics/privacy.test.ts tests/services/productAnalytics/state.test.ts
```

Expected: all tests PASS; no production source refers to the removed feature or
command values.

- [ ] **Step 8: Run staged validation and commit the ownership cutover**

Stage only the files listed in this task, then run:

```powershell
pnpm run validate:staged
git commit -m "refactor(protection-bypass): classify product workflows"
```

Expected: staged validation and the commit hook PASS.

## Task 2: Atomically Replace Preferences, Policy, Settings, and Snapshots

This task must land as one commit. The five legacy keys disappear together from
types, policy, UI, search, canonical returned and exported snapshots, normal
save and import writes, WebDAV uploads, and analytics. Ordinary reads do not
mutate raw extension storage, so a legacy stored object may keep those keys
until the next normal save or import persists the canonical v27 shape.

**Files:**

- Create: `src/services/preferences/tempWindowFallbackPreferences.ts`
- Create: `src/features/BasicSettings/components/tabs/Refresh/searchTargets.ts`
- Modify: `src/services/preferences/userPreferences.ts`
- Modify: `src/services/preferences/migrations/preferencesMigration.ts`
- Verify: `src/services/preferences/webdavSharedPreferences.ts`
- Modify: `src/contexts/UserPreferencesContext.tsx`
- Modify: `src/services/protectionBypass/preferencePolicy.ts`
- Modify: `src/services/protectionBypass/policy.ts`
- Modify: `src/utils/browser/tempWindowFetch.ts`
- Modify: `src/features/AccountManagement/components/TempWindowFallbackReminderGate.tsx`
- Modify: `src/constants/settingsAnchors.ts`
- Modify: `src/constants/basicSettingsTabs.ts`
- Modify: `src/features/BasicSettings/components/tabs/Refresh/AutoRefreshTab.tsx`
- Modify: `src/features/BasicSettings/components/tabs/Refresh/ShieldSettings.tsx`
- Modify: `src/features/BasicSettings/components/tabs/Refresh/Refresh.search.ts`
- Modify: `src/locales/en/settings.json`
- Modify: `src/locales/es-419/settings.json`
- Modify: `src/locales/ja/settings.json`
- Modify: `src/locales/vi/settings.json`
- Modify: `src/locales/zh-CN/settings.json`
- Modify: `src/locales/zh-TW/settings.json`
- Modify: `src/services/productAnalytics/settingsSnapshot.ts`
- Modify: `src/services/productAnalytics/settings.ts`
- Modify: `src/services/productAnalytics/contracts.ts`
- Modify: `src/services/productAnalytics/privacy.ts`
- Modify: `tests/test-utils/factories.ts`
- Modify: `tests/services/configMigration/preferences/preferencesMigration.test.ts`
- Modify: `tests/services/userPreferences.sharedPreferences.test.ts`
- Modify: `tests/services/userPreferences.test.ts`
- Modify: `tests/contexts/UserPreferencesContext.test.tsx`
- Modify: `tests/services/webdavAutoSyncService.test.ts`
- Modify: `tests/services/webdavSelectiveSync.test.ts`
- Modify: `tests/services/protectionBypass/policy.test.ts`
- Modify: `tests/features/AccountManagement/components/TempWindowFallbackReminderGate.test.tsx`
- Modify: `tests/utils/tempWindowFetch.fallback.test.ts`
- Modify: `tests/entrypoints/options/ShieldSettings.test.tsx`
- Modify: `tests/features/BasicSettings/Refresh.search.test.ts`
- Modify: `tests/entrypoints/options/BasicSettings.lazyMount.test.tsx`
- Modify: `tests/services/productAnalytics/settings.test.ts`
- Modify: `tests/services/productAnalytics/settingsSnapshot.test.ts`
- Modify: `tests/services/productAnalytics/privacy.test.ts`

- [ ] **Step 1: Write failing pure migration and preference-service tests**

In `preferencesMigration.test.ts`, cover canonical preservation and the legacy
account-refresh seed:

```ts
expect(
  normalizeTempWindowFallbackPreferences(
    {
      enabled: true,
      useForAutoRefresh: false,
      tempContextMode: TEMP_CONTEXT_MODES.Composite,
    },
  ),
).toMatchObject({
  automaticFeatureBypass: {
    account_refresh: false,
    checkin: true,
  },
})
```

Add coverage proving an existing valid canonical map remains unchanged. Assert
all eight booleans exist, invalid or missing values use the migration defaults,
repeat normalization is idempotent, and the returned object has none of:

```ts
[
  "useInPopup",
  "useInSidePanel",
  "useInOptions",
  "useForAutoRefresh",
  "useForManualRefresh",
]
```

In `userPreferences.sharedPreferences.test.ts`, prove reading an existing v26
snapshot returns the canonical v27 shape with preserved
`lastUpdated`/`sharedPreferencesLastUpdated` while leaving the raw v26 object
unchanged. Strict reads must not attempt a canonical write-back. A missing
storage entry must still return defaults without persisting them. Existing
save/import coverage must prove those normal write paths persist canonical data.

In `webdavAutoSyncService.test.ts`, import an ordinary legacy v26 preference
payload through the existing WebDAV path and prove it lands as v27 with the
five old keys physically absent. In `webdavSelectiveSync.test.ts`, prove the
next upload contains only the canonical feature map. Do not add cross-version
winner selection or local-version preservation assertions.

- [ ] **Step 2: Run migration tests and verify RED**

```powershell
pnpm exec vitest --run tests/services/configMigration/preferences/preferencesMigration.test.ts tests/services/userPreferences.sharedPreferences.test.ts tests/services/userPreferences.test.ts tests/contexts/UserPreferencesContext.test.tsx tests/services/webdavAutoSyncService.test.ts tests/services/webdavSelectiveSync.test.ts
```

Expected: FAIL because version 27, the canonical normalizer, read-only canonical
snapshot behavior, and the feature map do not exist.

- [ ] **Step 3: Implement the canonical preference shape and normalizer**

Create `tempWindowFallbackPreferences.ts` with computed catalog keys:

```ts
export const DEFAULT_AUTOMATIC_FEATURE_BYPASS = {
  [PROTECTION_BYPASS_AUTOMATIC_FEATURES.AccountRefresh]: true,
  [PROTECTION_BYPASS_AUTOMATIC_FEATURES.BalanceHistory]: true,
  [PROTECTION_BYPASS_AUTOMATIC_FEATURES.Checkin]: true,
  [PROTECTION_BYPASS_AUTOMATIC_FEATURES.RedemptionAssist]: true,
  [PROTECTION_BYPASS_AUTOMATIC_FEATURES.LdohSiteLookup]: true,
  [PROTECTION_BYPASS_AUTOMATIC_FEATURES.KeyManagement]: true,
  [PROTECTION_BYPASS_AUTOMATIC_FEATURES.ManagedSiteChannels]: true,
  [PROTECTION_BYPASS_AUTOMATIC_FEATURES.ManagedSiteModelSync]: true,
} as const satisfies Record<ProtectionBypassAutomaticFeature, boolean>

export interface TempWindowFallbackPreferences {
  enabled: boolean
  automaticFeatureBypass: Record<ProtectionBypassAutomaticFeature, boolean>
  tempContextMode: TempContextMode
}
```

The normalizer accepts an `unknown` source and rebuilds only the three canonical
fields. Preserve each valid boolean already present in
`automaticFeatureBypass`. If `account_refresh` is missing, use a valid legacy
`useForAutoRefresh`, otherwise `true`; every other missing or invalid feature
defaults to `true`.

Do not export the legacy interface. Keep it as a narrow internal read shape.

- [ ] **Step 4: Add version 27 with read-only migration and canonical writes**

Register version 27 and have that migration assign only the rebuilt
`tempWindowFallback` plus `preferencesVersion: 27`.

Refactor `UserPreferencesService` around one clearly named read-only snapshot
helper. Public `getPreferences` and `getPreferencesStrict` call it without
acquiring the `USER_PREFERENCES` write lock and without writing extension
storage. Normal reads retain their default fallback, while strict reads retain
their error behavior for actual storage-get or migration failures.

The helper returns a default-merged canonical v27 snapshot with existing
timestamps and no legacy keys; the raw legacy object may remain until the next
normal save or import. `savePreferencesWithResult` and `importPreferences`
retain their existing outer write locks and call the read-only helper inside
those critical sections without nested lock acquisition. Import continues the
ordinary sequential migration, applies existing WebDAV-local field restoration
when requested, and saves one canonical object. Manual import and WebDAV import
use this same path. Do not add cross-version field arbitration, local-v2
fallback, or upload compatibility logic; exports and later ordinary uploads
naturally contain only the canonical map.

- [ ] **Step 5: Replace runtime policy and reminder compatibility gates**

Normalize persisted settings to:

```ts
export interface ProtectionBypassPolicy {
  automaticMasterEnabled: boolean
  automaticFeatureBypass: Record<ProtectionBypassAutomaticFeature, boolean>
  preferredMode: TempContextMode
}
```

In `evaluateProtectionBypassPolicy`, explicit commands skip the master and
feature map. Automatic executions deny on master false or their own map value
false. Delete manual-refresh and surface authorization branches. Keep
`execution.surface` in decision context and pass it to the pool for Firefox,
minimization, and presentation behavior.

Make the account-health reminder check the known automatic account-refresh
invocation rather than page surface or manual policy. Extract/reuse the same
preference-only evaluation used by the policy; do not copy master/feature logic
into the component. Permission failure remains actionable. An explicit command
must never produce a disabled reminder merely because the automatic master is
off.

- [ ] **Step 6: Replace the settings card, IDs, search, and locale copy**

Add `SETTINGS_ANCHORS.SHIELD_SETTINGS`, map it to the `refresh` tab, and create
this target family in `searchTargets.ts`:

```ts
export const SHIELD_SETTINGS_TARGET_IDS = {
  root: SETTINGS_ANCHORS.SHIELD_SETTINGS,
  enabled: "shield-enabled",
  method: "shield-method",
  automaticFeatures: "shield-automatic-features",
  feature: {
    [PROTECTION_BYPASS_AUTOMATIC_FEATURES.AccountRefresh]:
      "shield-automatic-feature-account-refresh",
    [PROTECTION_BYPASS_AUTOMATIC_FEATURES.BalanceHistory]:
      "shield-automatic-feature-balance-history",
    [PROTECTION_BYPASS_AUTOMATIC_FEATURES.Checkin]:
      "shield-automatic-feature-checkin",
    [PROTECTION_BYPASS_AUTOMATIC_FEATURES.RedemptionAssist]:
      "shield-automatic-feature-redemption-assist",
    [PROTECTION_BYPASS_AUTOMATIC_FEATURES.LdohSiteLookup]:
      "shield-automatic-feature-ldoh-site-lookup",
    [PROTECTION_BYPASS_AUTOMATIC_FEATURES.KeyManagement]:
      "shield-automatic-feature-key-management",
    [PROTECTION_BYPASS_AUTOMATIC_FEATURES.ManagedSiteChannels]:
      "shield-automatic-feature-managed-site-channels",
    [PROTECTION_BYPASS_AUTOMATIC_FEATURES.ManagedSiteModelSync]:
      "shield-automatic-feature-managed-site-model-sync",
  },
} as const satisfies {
  root: string
  enabled: string
  method: string
  automaticFeatures: string
  feature: Record<ProtectionBypassAutomaticFeature, string>
}
```

Remove the outer duplicate `shield-settings` ID from `AutoRefreshTab`. Render
eight checkboxes in `ShieldSettings`, with all translation calls using literal
keys. A click submits a complete record:

```ts
updateTempWindowFallback({
  automaticFeatureBypass: {
    ...tempWindowFallback.automaticFeatureBypass,
    [feature]: Boolean(checked),
  },
})
```

Never disable a feature checkbox because the master or its owning product
feature is off. Delete the five old controls and their search definitions. Add
one search definition per automatic feature using the exported target IDs.
Preserve the root anchor and refresh tab.

Synchronize all six `settings.json` files. The group copy must say that these
choices allow automatic features to open a temporary verification page, do not
enable/disable the product feature, and do not affect user-started actions.

- [ ] **Step 7: Replace settings telemetry with eight fixed booleans**

Keep master, mode, and reminder fields. Delete the five old snapshot fields and
add these exact fixed scalar properties to snapshot catalogs, payload types,
builders, and privacy allow-lists:

```text
temp_window_fallback_automatic_bypass_account_refresh_enabled
temp_window_fallback_automatic_bypass_balance_history_enabled
temp_window_fallback_automatic_bypass_checkin_enabled
temp_window_fallback_automatic_bypass_redemption_assist_enabled
temp_window_fallback_automatic_bypass_ldoh_site_lookup_enabled
temp_window_fallback_automatic_bypass_key_management_enabled
temp_window_fallback_automatic_bypass_managed_site_channels_enabled
temp_window_fallback_automatic_bypass_managed_site_model_sync_enabled
```

The event never contains the `automaticFeatureBypass` object or a dynamic
property. Centralize the fixed property catalog in `settingsSnapshot.ts` so
contracts, builders, and privacy tests cannot drift. Add all eight fixed keys
to both the event allowed-key set and `PRIVACY_REVIEWED_ALLOWED_KEYS`; privacy
tests must prove all eight survive sanitization while the five legacy fields
and any dynamic feature-map object are discarded.

- [ ] **Step 8: Run the product-surface tests and locale extraction**

```powershell
pnpm exec vitest --run tests/services/configMigration/preferences/preferencesMigration.test.ts tests/services/userPreferences.sharedPreferences.test.ts tests/services/userPreferences.test.ts tests/contexts/UserPreferencesContext.test.tsx tests/services/webdavAutoSyncService.test.ts tests/services/webdavSelectiveSync.test.ts tests/services/protectionBypass/policy.test.ts tests/features/AccountManagement/components/TempWindowFallbackReminderGate.test.tsx tests/utils/tempWindowFetch.fallback.test.ts tests/entrypoints/options/ShieldSettings.test.tsx tests/features/BasicSettings/Refresh.search.test.ts tests/entrypoints/options/BasicSettings.lazyMount.test.tsx tests/services/productAnalytics/settings.test.ts tests/services/productAnalytics/settingsSnapshot.test.ts tests/services/productAnalytics/privacy.test.ts
pnpm run i18n:extract:ci
```

Expected: all tests PASS; extraction reports no locale changes. The composed
`BasicSettings.lazyMount.test.tsx` render, not only the isolated card test,
finds exactly one `shield-settings` DOM ID; component tests find eight editable
controls.

- [ ] **Step 9: Audit legacy keys, validate staged files, and commit**

```powershell
rg -n "useInPopup|useInSidePanel|useInOptions|useForAutoRefresh|useForManualRefresh|shield-contexts|shield-popup|shield-sidepanel|shield-options|shield-auto-refresh|shield-manual-refresh" src tests e2e
```

Expected: legacy preference keys occur only in migration/round-trip fixtures;
old DOM/search IDs have no production hits.

Stage only Task 2 files, then run:

```powershell
pnpm run validate:staged
git commit -m "feat(protection-bypass): configure automatic features"
```

Expected: staged validation and the commit hook PASS.

## Task 3: Lock Architecture, Propagation, and Deletion Invariants

**Files:**

- Modify: `tests/entrypoints/background/protectionBypassArchitecture.test.ts`
- Modify: `tests/entrypoints/background/tempWindowPoolTestAdapter.ts`
- Modify: `tests/entrypoints/background/tempWindowPoolWindowFallback.test.ts`
- Modify: `tests/services/runtimeTypedMessagingSetup.test.ts`
- Modify: `tests/services/ldohSiteLookup.runtime.test.ts`
- Modify: `tests/utils/tempWindowFetch.background.test.ts`
- Modify: `tests/utils/tempWindowFetch.fallback.test.ts`
- Modify: `tests/services/accountStorage.test.ts`
- Modify: `tests/services/accounts/apiServiceRequest.test.ts`
- Modify: `tests/services/apiTransport/request.test.ts`
- Modify: `tests/services/managedSites/providers/newApiSession.test.ts`
- Modify: `tests/services/accountBrowserSession/sessionReader.test.ts`

- [ ] **Step 1: Add failing architecture and propagation assertions**

The architecture suite must prove:

```ts
for (const feature of Object.values(PROTECTION_BYPASS_FEATURES)) {
  expect(PROTECTION_BYPASS_FEATURE_TASK_KINDS[feature]).toBeDefined()
  expect(PROTECTION_BYPASS_FEATURE_TASK_KINDS[feature]).not.toContain(
    TEMP_CONTEXT_TASK_KINDS.RenderedTitle,
  )
  expect(PROTECTION_BYPASS_FEATURE_TASK_KINDS[feature]).not.toContain(
    TEMP_CONTEXT_TASK_KINDS.OpenContext,
  )
}
```

Keep existing source-boundary assertions that only the Coordinator imports the
authorized pool seam and browser tab/window creation stays private. Add source
audits proving production source contains none of:

```text
site_detection
session_resync
verify_protection
PROTECTION_BYPASS_FEATURE_OPERATIONS
surface_disabled
manual_feature_disabled
operation_not_permitted
```

Assert `ModelRedirectService` never imports or constructs protection-bypass
execution. Assert the existing exported rendered-title/open-context helpers
have no production caller; do not delete them in this task.

Propagation tests must prove one authoritative execution value crosses account
storage, API transport, session reads, New API hidden-key reads, Turnstile,
native page actions, and OpenRouter management-key action without task-level
source/intent duplication. Persisted or delayed retry records must not contain
a user-command execution.

Update `tempWindowPoolTestAdapter.ts` to a structurally valid v2 execution used
only below the policy boundary; do not imply its dormant rendered-title task is
feature-authorized. Update the window-fallback and LDOH runtime fixtures to v2
and their actual owning features. These are fixture reconciliations, not new
policy grants.

- [ ] **Step 2: Run the architecture and propagation tests**

```powershell
pnpm exec vitest --run tests/entrypoints/background/protectionBypassArchitecture.test.ts tests/entrypoints/background/tempWindowPoolWindowFallback.test.ts tests/services/runtimeTypedMessagingSetup.test.ts tests/services/ldohSiteLookup.runtime.test.ts tests/utils/tempWindowFetch.background.test.ts tests/utils/tempWindowFetch.fallback.test.ts tests/services/accountStorage.test.ts tests/services/accounts/apiServiceRequest.test.ts tests/services/apiTransport/request.test.ts tests/services/managedSites/providers/newApiSession.test.ts tests/services/accountBrowserSession/sessionReader.test.ts
```

Expected: new assertions PASS after fixture reconciliation; any remaining old
literal or ownership leak fails with its exact file.

- [ ] **Step 3: Run related tests for the central changed surfaces**

```powershell
pnpm exec vitest related --run src/services/protectionBypass/contracts.ts src/services/protectionBypass/client.ts src/services/protectionBypass/policy.ts src/services/protectionBypass/preferencePolicy.ts src/services/protectionBypass/decisionErrorCode.ts src/services/preferences/tempWindowFallbackPreferences.ts src/services/preferences/userPreferences.ts src/entrypoints/background/protectionBypassCoordinator.ts src/entrypoints/background/runtimeMessages.ts src/entrypoints/background/tempWindowPool.ts src/utils/browser/tempWindowFetch.ts src/features/BasicSettings/components/tabs/Refresh/ShieldSettings.tsx
```

Expected: all discovered related suites PASS. If the Windows runner exits with
`EPIPE`, classify it as tooling and use the explicit Task 1–4 matrices as
fallback evidence; never report the failed related run as passing.

- [ ] **Step 4: Validate staged reconciliation and commit**

Stage only the Task 3 files, then run:

```powershell
pnpm run validate:staged
git commit -m "test(protection-bypass): lock feature policy boundaries"
```

Expected: staged validation and commit hook PASS.

## Task 4: Update the Two Browser Regressions

**Files:**

- Modify: `e2e/autoCheckinNativePageFallback.spec.ts`
- Modify: `e2e/optionsSearchNavigation.spec.ts`
- Modify: `e2e/shieldBypassContentPrompt.spec.ts`

- [ ] **Step 1: Change the check-in fixture to a feature-level denial**

Seed the automatic master on and only check-in off:

```ts
tempWindowFallback: {
  ...DEFAULT_PREFERENCES.tempWindowFallback!,
  enabled: true,
  automaticFeatureBypass: {
    ...DEFAULT_PREFERENCES.tempWindowFallback!.automaticFeatureBypass,
    [PROTECTION_BYPASS_AUTOMATIC_FEATURES.Checkin]: false,
  },
  tempContextMode: TEMP_CONTEXT_MODES.Tab,
}
```

Retain the existing observable assertions: UI-open automatic check-in reaches
the direct request but creates no temporary context; the explicit Run Now
action opens the fixture page, clicks it, and persists success.

- [ ] **Step 2: Extend settings search/deep-link coverage**

In `optionsSearchNavigation.spec.ts`, seed the automatic master off and the
check-in bypass preference false, search for automatic check-in verification
assistance, select the result, and assert `tab=refresh`, anchor/highlight equal
the exported check-in target ID, and the checkbox remains enabled. Toggle it
and reload to prove the complete feature record persisted even while the master
was off.

In `shieldBypassContentPrompt.spec.ts`, preserve the existing prompt-to-root
anchor flow and assert the settings page renders the automatic-feature group
plus the check-in and balance-history controls. Do not add one browser scenario
per feature; unit tests own the exhaustive eight-item matrix.

- [ ] **Step 3: Run the targeted Chromium E2E tests**

```powershell
pnpm e2e -- e2e/autoCheckinNativePageFallback.spec.ts --grep "automatic native-page fallback is denied while an explicit run is allowed"
pnpm e2e -- e2e/optionsSearchNavigation.spec.ts
pnpm e2e -- e2e/shieldBypassContentPrompt.spec.ts
```

Expected: all three targeted flows PASS in the built extension.

- [ ] **Step 4: Validate and commit the browser regressions**

Stage only the three Task 4 E2E files, then run:

```powershell
pnpm run validate:staged
git commit -m "test(e2e): cover automatic bypass feature controls"
```

Expected: staged validation and commit hook PASS.

## Task 5: Run Final Gates and Inspect the Integrated Branch

**Files:**

- Verify: all task-scoped files from Tasks 1–4

- [ ] **Step 1: Run final static deletion and scope audits**

```powershell
rg -n "site_detection|session_resync|verify_protection|PROTECTION_BYPASS_FEATURE_OPERATIONS|surface_disabled|manual_feature_disabled|operation_not_permitted" src tests e2e
rg -n "useInPopup|useInSidePanel|useInOptions|useForAutoRefresh|useForManualRefresh" src tests e2e
rg -n "createAutomaticProtectionBypassExecution" src/services/models/modelRedirect
git diff main...HEAD --check
git status --short
```

Expected:

- old runtime values/reasons have no production hits and appear only in
  explicit legacy-rejection/persisted-state tests when needed;
- old preference keys appear only in migration/import fixtures;
- Model Redirect has no automatic execution construction;
- diff check exits zero;
- status contains only task-scoped changes plus the pre-existing untracked
  files.

- [ ] **Step 2: Run locale, staged, and push-equivalent gates**

```powershell
pnpm run i18n:extract:ci
pnpm run validate:push
```

Expected: extraction reports no changes; `validate:push` completes `compile`
and `knip`. Every implementation commit already passed `validate:staged`; if a
final fix is needed, stage only that fix, rerun `validate:staged`, and commit it
before handoff.

If `validate:push` reports stale WXT generated types, run
`pnpm exec wxt prepare`, verify it creates no tracked diff, then retry.

- [ ] **Step 3: Inspect history and final tree**

```powershell
git log --oneline --decorate -10
git diff main...HEAD --stat
git status --short
```

Expected: the approved design/plan commits plus four implementation/test
commits, no unrelated tracked change, and all pre-existing untracked files
untouched.

- [ ] **Step 4: Report evidence and release-readiness decisions**

Report separately:

- focused and related Vitest evidence;
- local/imported preference migration evidence;
- locale/staged/push gate evidence;
- targeted Playwright browser evidence;
- unchanged pre-existing untracked files;
- telemetry decision: reuse settings snapshot and daily summary with eight
  fixed booleans/canonical features, no per-toggle event;
- E2E decision: one exhaustive unit matrix plus representative automatic-denied
  versus manual-allowed and deep-link browser flows;
- maintainability decision: one product catalog, one automatic subset, one
  exact task matrix, one preference normalizer, and one runtime execution
  validator/parser; dormant rendered-title/open-context deletion remains
  outside scope.
