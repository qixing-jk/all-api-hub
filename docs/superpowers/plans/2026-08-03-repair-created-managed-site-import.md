# Repair-Created Managed-Site Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users import the exact API keys created by an account-key repair job into the currently selected managed site through a simplified, user-controlled version of the existing generic batch import flow.

**Architecture:** Preserve one provider-neutral batch import service and one shared dialog. Add exact, secret-free creation references to repair progress; adapt those references into the generic batch input; distinguish source from verification policy; and persist only bounded, controlled retry receipts in the latest repair progress snapshot. The fresh repair path may trust exact current-session creation references, while historical, switched, failed, uncertain, and retry paths use the same complete verification available to manual imports.

**Tech Stack:** TypeScript, React, WXT extension messaging/storage, Vitest + Testing Library, Playwright, i18next, existing managed-site service adapters, product analytics.

---

Related design: `docs/superpowers/specs/2026-08-03-repair-created-key-managed-site-import-design.md`

## Non-negotiable implementation invariants

- The target is the single managed site currently selected in settings, for every current `ManagedSiteType`; do not special-case New API in orchestration.
- Keep `ManagedSiteTokenBatchExportDialog` and `tokenBatchExport.ts` as the only review/execution path. Do not add a repair-only importer, provider switch, preview, footer, result view, or retry implementation.
- Model source and verification truthfully:

  ```ts
  type ManagedSiteBatchImportIntent =
    | { source: "manual-selection"; verification: "complete" }
    | {
        source: "repair-created"
        verification: "trusted-new" | "complete"
      }
  ```

  The wider repair branch is intentional: historical repair results, an explicit “use complete checks” choice, and retries must retain repair attribution while using complete verification.
- `trusted-new` is allowed only for the first review of exact references created by the current in-memory repair session. It skips duplicate search and hidden target-key verification only; secret resolution, draft preparation, models, provider-required fields, configuration, and target identity remain mandatory.
- Switching to complete checks preserves current selection and model edits. Retry always uses complete checks and excludes confirmed successes for the same target.
- Manual complete mode retains its confirmation. Fresh trusted repair mode executes from the reviewed selection without a redundant second confirmation. After switching a repair review to complete mode, restore the standard confirmation step.
- A deselected preview row remains visible but has no execution outcome or receipt. Do not label it provider-skipped, and compute attempted/result summaries from selected items only. This correction applies to the manual flow too.
- Before any write, recompute the selected target fingerprint. A mismatch invalidates the preview and creates zero channels in either source mode.
- Continue sending one existing managed-site create call per selected key with concurrency `4`; do not merge heterogeneous keys or add a provider bulk endpoint. New API-compatible providers therefore continue using one `mode: "single"` request per key.
- Exact-reference recovery is best-effort. Ambiguity or inventory reload failure removes the quick-import proof, but never changes a successfully repaired account into a repair failure.
- Never persist or emit key secrets, credentials, raw URLs, models, groups, job/account/token identifiers in telemetry, raw provider messages, or target credentials. Creation references contain only account-scoped token ID and group; receipts contain only controlled status, timestamps, target digest, account ID, and token ID inside local repair progress.

## Task 1: Persist exact, secret-free references to keys created by repair

**Files:**

- Modify: `src/types/accountKeyAutoProvisioning.ts`
- Modify: `src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts`
- Modify: `src/services/accounts/accountKeyAutoProvisioning/repair.ts`
- Test: `tests/services/accountKeyGroupCoverage.test.ts`
- Test: `tests/services/accountKeyRepair.test.ts`

- [ ] Add failing group-coverage tests named around these observable behaviors:

  - records exact grouped token references after one post-create inventory refresh;
  - preserves grouped repair success when a created-token reference is ambiguous;
  - preserves grouped repair success when the post-create inventory reload fails;
  - extends the existing empty-group lifecycle recovery case to assert the exact returned token ID.

  Assert that the grouped path reads the inventory exactly once before creation and once after all creation attempts, returns only groups with exactly one newly observed ID, and retains `created: true`, `createdGroups`, and empty `missingGroups` when reference recovery fails.

- [ ] Run the focused test and confirm it fails because `createdTokens` does not exist yet:

  ```powershell
  pnpm vitest run tests/services/accountKeyGroupCoverage.test.ts
  ```

- [ ] Add the backwards-compatible public reference type:

  ```ts
  export interface AccountKeyRepairCreatedTokenReference {
    tokenId: number
    group: string
  }
  ```

  Add `createdTokens?: AccountKeyRepairCreatedTokenReference[]` to `AccountKeyRepairAccountResult`. Keep the internal `AccountKeyCoverageResult.createdTokens` required so new code cannot forget to populate it, while old stored progress remains readable.

- [ ] In `groupCoverage.ts`, extract one `fetchTokenInventory()` closure that consistently prefers `fetchAllTokens` and otherwise uses `fetchTokens`. Snapshot the pre-create token IDs.

- [ ] For the no-group lifecycle path, return the exact `createResult.token.id` and normalized token/decision group. Do not change the lifecycle’s existing ambiguous-token failure semantics.

- [ ] For grouped creation, keep the current per-group create attempts, then perform at most one best-effort inventory reload. Reuse the existing `selectSingleNewApiTokenByIdDiff(...)` behavior for ID-diff selection; for each successfully created group, accept a reference only when the normalized group contains exactly one newly observed token. Do not guess when external concurrency, eventual consistency, pagination, or duplicate IDs make the result ambiguous.

- [ ] Rerun the group-coverage test and confirm it passes.

- [ ] Add a failing repair-runner test that proves `createdTokens` is stored and broadcast without changing accounting. With two `createdGroups` but one recoverable reference, assert `summary.createdKeys === 2`, the account outcome remains `Created`, and storage/runtime payloads contain the same single reference. Extend the stored-progress test to prove an older result without `createdTokens` is returned unchanged.

- [ ] Run the repair test and confirm the new assertion fails:

  ```powershell
  pnpm vitest run tests/services/accountKeyRepair.test.ts
  ```

- [ ] Pass `result.createdTokens` through `AccountKeyRepairRunner.processEligibleAccount(...)`; do not derive `createdKeys` from reference count and do not change outcome calculation.

- [ ] Rerun both focused suites:

  ```powershell
  pnpm vitest run tests/services/accountKeyGroupCoverage.test.ts tests/services/accountKeyRepair.test.ts
  ```

- [ ] Commit this isolated provenance slice:

  ```powershell
  git add src/types/accountKeyAutoProvisioning.ts src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts src/services/accounts/accountKeyAutoProvisioning/repair.ts tests/services/accountKeyGroupCoverage.test.ts tests/services/accountKeyRepair.test.ts
  git commit -m "feat(key-management): retain repaired key references"
  ```

## Task 2: Add target identity and bounded repair-import receipts

**Files:**

- Create: `src/services/managedSites/tokenBatchImportTarget.ts`
- Modify: `src/types/accountKeyAutoProvisioning.ts`
- Modify: `src/services/accounts/accountKeyAutoProvisioning/messaging.ts`
- Modify: `src/services/accounts/accountKeyAutoProvisioning/repair.ts`
- Create: `tests/services/managedSites/tokenBatchImportTarget.test.ts`
- Test: `tests/services/accountKeyRepair.test.ts`

- [ ] Add failing target-identity tests covering every `ManagedSiteType` runtime-config shape. Assert that equivalent normalized base URLs have the same digest; site type, normalized URL, or compatible user identity changes the digest; credentials do not affect it; and the digest output contains no raw URL, username/email/user ID, or token.

- [ ] Implement `tokenBatchImportTarget.ts` around one captured `ManagedSiteRuntimeConfig`, `getManagedSiteLegacyAdminConfig(...)`, and managed-site URL normalization. Build SHA-256 over a length-delimited, versioned serialization of `{ siteType, normalizedBaseUrl, compatibleUserId }`. Return the service/config snapshot, display-safe target summary, and one-way `fingerprint` together so preparation cannot mix settings reads; never store the serialized input.

- [ ] Run the target-identity suite:

  ```powershell
  pnpm vitest run tests/services/managedSites/tokenBatchImportTarget.test.ts
  ```

- [ ] Add controlled receipt types to `accountKeyAutoProvisioning.ts`:

  ```ts
  const ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES = {
    Created: "created",
    AlreadyPresent: "already-present",
    Failed: "failed",
    Uncertain: "uncertain",
  } as const
  ```

  A stored receipt contains `targetFingerprint`, `accountId`, `tokenId`, `status`, and background-owned `updatedAt`. Add optional `managedSiteImportReceipts` to `AccountKeyRepairProgress` so the latest progress snapshot remains the single bounded store.

- [ ] Add a typed `RecordManagedSiteImportResults` extension-message request containing `jobId`, `targetFingerprint`, and controlled `{ accountId, tokenId, status }` items only. Do not accept secrets, URLs, errors, names, groups, models, or a caller-supplied timestamp.

- [ ] Add failing runner tests for receipt recording:

  - merges `created`, `already-present`, `failed`, and `uncertain` by `(targetFingerprint, accountId, tokenId)` and stamps `updatedAt`;
  - preserves receipts for another target as a separate scope;
  - rejects or no-ops a stale `jobId` without mutating current progress;
  - publishes the updated progress snapshot;
  - starts a new repair job with no old receipts;
  - reads old progress without the optional field.

- [ ] Implement receipt merging through the runner’s existing serialized progress-update queue and register the new message handler. Keep successful repair data intact and do not create a second storage key.

- [ ] Run the focused suites:

  ```powershell
  pnpm vitest run tests/services/managedSites/tokenBatchImportTarget.test.ts tests/services/accountKeyRepair.test.ts
  ```

- [ ] Commit the target/receipt protocol:

  ```powershell
  git add src/services/managedSites/tokenBatchImportTarget.ts src/types/accountKeyAutoProvisioning.ts src/services/accounts/accountKeyAutoProvisioning/messaging.ts src/services/accounts/accountKeyAutoProvisioning/repair.ts tests/services/managedSites/tokenBatchImportTarget.test.ts tests/services/accountKeyRepair.test.ts
  git commit -m "feat(managed-sites): track repair import target receipts"
  ```

## Task 3: Generalize the shared batch-import contract

**Files:**

- Modify: `src/types/managedSiteTokenBatchExport.ts`
- Modify: `src/services/managedSites/tokenBatchExport.ts`
- Test: `tests/services/managedSites/tokenBatchExport.test.ts`

- [ ] Add failing service tests for the contract before changing implementation:

  - manual selection always runs complete duplicate/exact-key verification;
  - fresh repair-created `trusted-new` skips duplicate search and hidden target-key verification but still resolves the source secret, prepares models/draft, validates provider-required fields, and exposes ordinary blockers;
  - repair-created `complete` uses the same verification path as manual;
  - an explicitly unresolved input becomes a visible blocked preview row rather than disappearing;
  - a target fingerprint mismatch immediately before execution makes zero create calls in both modes;
  - deselected items have no execution item and do not increment attempted/result counts;
  - selected items still execute with concurrency four and one provider create call per key;
  - HTTP 401 and 403 keep useful local fallback plus distinct upstream status/message details;
  - definite rejections, confirmed creation, and uncertain transport outcomes produce only controlled result categories by reusing `src/services/managedSites/mutationCertainty.ts` instead of adding a second uncertainty classifier.

- [ ] Run the focused suite and confirm the new tests fail:

  ```powershell
  pnpm vitest run tests/services/managedSites/tokenBatchExport.test.ts
  ```

- [ ] Add runtime constants/types for source and verification and the corrected intent union from the invariants above. Do not encode repair source as an alias for New API.

- [ ] Change `ManagedSiteTokenBatchExportItemInput` into a discriminated union that accepts existing resolved `{ account, runtimeKey }` items and an explicit blocked reference with stable ID, account label, key/group label, blocking reason, and local fallback. Add type guards so the resolved path stays required below the preparation boundary.

- [ ] Put `intent`, `targetFingerprint`, and target summary on the preview. Define execution items only for attempted selected rows, with controlled `created | failed | uncertain` results and safe error text. Remove the semantic coupling between user deselection and provider “skipped”; keep any compatibility count derived from genuinely non-executable preview state, not user choice.

- [ ] Split preparation into shared mandatory work and a verification policy step. Under `trusted-new`, bypass only `resolveManagedSiteChannelMatch(...)`/duplicate-search work. Under `complete`, run the existing full path unchanged for every managed-site provider.

- [ ] At execution start, resolve current runtime config and fingerprint again. Compare it with the preview fingerprint before creating the operation context or scheduling workers. Return/throw a typed target-changed failure with localized UI fallback and zero writes.

- [ ] Execute only selected executable preview IDs. Preserve the current `TOKEN_BATCH_EXPORT_CONCURRENCY = 4` mapping and the existing managed-site `createChannel`/resource create boundary.

- [ ] Classify definite provider rejection as `failed` and reuse `isManagedSiteMutationUncertainError(...)` for transport/abort/timeout cases where the request may have reached the target; never persist or report the raw error outside the private UI result. Keep 401 and 403 distinguishable in the displayed safe error.

- [ ] Rerun the service suite, then run related validation:

  ```powershell
  pnpm vitest run tests/services/managedSites/tokenBatchExport.test.ts
  pnpm vitest related --run src/types/managedSiteTokenBatchExport.ts src/services/managedSites/tokenBatchExport.ts
  ```

- [ ] Commit the provider-neutral service contract:

  ```powershell
  git add src/types/managedSiteTokenBatchExport.ts src/services/managedSites/tokenBatchExport.ts tests/services/managedSites/tokenBatchExport.test.ts
  git commit -m "feat(managed-sites): add trusted batch import intent"
  ```

## Task 4: Make the existing shared dialog a capability superset

**Files:**

- Modify: `src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog.tsx`
- Modify: `src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog/useManagedSiteTokenBatchExportDialog.ts`
- Modify: `src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog/ManagedSiteTokenBatchExportFooter.tsx`
- Modify: `src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog/ManagedSiteTokenBatchExportPreviewList.tsx`
- Modify: `src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog/ManagedSiteTokenBatchExportPreviewRow.tsx`
- Modify: `src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog/ManagedSiteTokenBatchExportStatusPanels.tsx`
- Modify: `src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog/batchExportDialogText.ts`
- Create: `src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog/managedSiteTokenBatchExportSession.ts`
- Modify: `src/features/KeyManagement/components/managedSiteTokenBatchExportPreview.ts`
- Modify: `src/features/KeyManagement/testIds.ts`
- Test: `tests/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog.test.tsx`
- Create: `tests/features/KeyManagement/components/managedSiteTokenBatchExportSession.test.ts`

- [ ] Add failing component tests proving that both sources render the same target summary, settings action, selection controls, model editor, blockers, partial results, and retry actions. Use stable feature-local test IDs rather than visible copy to locate workflow-critical controls.

- [ ] Add failing behavior tests for mode differences:

  - trusted repair starts with all executable rows selected and imports directly after review;
  - manual complete keeps the existing confirmation;
  - “use complete checks” keeps repair source, selection, and user-edited models while re-preparing, then restores confirmation;
  - complete-check preparation never overwrites an explicit model edit with refreshed defaults;
  - deselected rows remain in the preview and result screen without becoming execution/receipt items;
  - target mismatch prevents execution and offers refresh/change-target recovery;
  - retry keeps confirmed successes visible, excludes them from work, selects only failed/uncertain rows, and always prepares with `verification: "complete"`;
  - generally useful target/retry/result behavior is identical for manual and repair sources.

- [ ] Run the dialog suite and confirm failures:

  ```powershell
  pnpm vitest run tests/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog.test.tsx
  ```

- [ ] Extract pure session helpers for merging a refreshed preview while preserving explicit selection/model edits, selecting failed/uncertain retry IDs, merging cumulative controlled results, and deciding confirmation from intent. Cover them in `managedSiteTokenBatchExportSession.test.ts` so the already-large controller hook does not acquire a second copy of state-transition logic.

- [ ] Add an explicit `intent` prop and generic optional completion callback carrying controlled execution items. Keep the component ignorant of repair messaging/storage; the repair launcher owns receipt recording.

- [ ] Extend the controller hook with stable state for selected IDs, per-item model edits, active verification policy, preview fingerprint, result, and retry subset. Reconcile a new preview by ID so selection and edits survive policy changes; only initialize defaults for previously unseen rows.

- [ ] Put the current managed-site label/URL summary and existing `openSettingsTab("managedSite", { preserveHistory: true })` action in the shared dialog for both sources. Do not add a new settings anchor, search definition, or deep-link literal.

- [ ] Render the repair-created explanation and “use complete checks” action only when the source is repair-created and policy is trusted. Keep implementation terms such as provenance, receipt, resolver, fingerprint, and “untrusted” out of visible copy.

- [ ] Keep one shared preview list/row/footer. Add only controlled result/status presentation (`created`, already present from complete preview, blocked, failed, uncertain, not selected) and recovery guidance. “Not selected” is presentation state, not an execution result or receipt.

- [ ] Make retry and target-change recovery available to both sources. When retrying, build a complete-check intent with the original source and only failed/uncertain IDs; never retry a confirmed success automatically.

- [ ] Rerun the component suite:

  ```powershell
  pnpm vitest run tests/features/KeyManagement/components/managedSiteTokenBatchExportSession.test.ts tests/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog.test.tsx
  ```

- [ ] Commit the shared dialog upgrade:

  ```powershell
  git add src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog.tsx src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog src/features/KeyManagement/components/managedSiteTokenBatchExportPreview.ts src/features/KeyManagement/testIds.ts tests/features/KeyManagement/components/managedSiteTokenBatchExportSession.test.ts tests/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog.test.tsx
  git commit -m "feat(key-management): unify managed-site batch review modes"
  ```

## Task 5: Resolve repair references into generic batch inputs

**Files:**

- Create: `src/services/managedSites/repairCreatedTokenBatchImport.ts`
- Create: `tests/services/managedSites/repairCreatedTokenBatchImport.test.ts`

- [ ] Add failing adapter tests for:

  - loading each affected account’s runtime-key inventory once and selecting only exact `(accountId, tokenId)` account-token runtime keys;
  - never including pre-existing keys that were not named in `createdTokens`;
  - producing a visible blocked input when an account is missing, an exact token vanished, inventory loading fails, or a successfully created group has no unambiguous reference;
  - excluding same-target `created` receipts from retry work;
  - retaining `failed` and `uncertain` receipt items but forcing complete verification;
  - treating another target fingerprint as a separate scope;
  - returning no launch candidate for old stored progress with no exact references rather than guessing from `createdGroups`.

- [ ] Run the new suite and confirm it fails because the adapter is absent:

  ```powershell
  pnpm vitest run tests/services/managedSites/repairCreatedTokenBatchImport.test.ts
  ```

- [ ] Implement a managed-site source adapter that accepts repair progress, current display accounts, target fingerprint, and freshness. Group references by account, obtain the canonical display-account API context, load each affected account inventory once while preferring `keyManagement.fetchAllTokens` and falling back to `fetchTokens`, build runtime keys with `buildDisplayAccountTokenRuntimeKey(...)`, and match both the exact numeric token ID and normalized expected group. Never substitute a nearby token.

- [ ] For each `createdGroups` entry without a matching exact reference, add a deterministic blocked input such as `repair-created:${accountId}:${normalizedGroup}`. This keeps the repair success visible while clearly explaining why that item cannot use quick import.

- [ ] Derive verification policy as follows: only a current-session completed job with exact unused references may start trusted; historical results, failed/uncertain same-target receipts, and explicit retries start complete. The adapter must not infer freshness from timestamps alone.

- [ ] Rerun the adapter suite:

  ```powershell
  pnpm vitest run tests/services/managedSites/repairCreatedTokenBatchImport.test.ts
  ```

- [ ] Commit the source adapter:

  ```powershell
  git add src/services/managedSites/repairCreatedTokenBatchImport.ts tests/services/managedSites/repairCreatedTokenBatchImport.test.ts
  git commit -m "feat(key-management): adapt repaired keys for batch import"
  ```

## Task 6: Launch the same dialog from manual selection and repair results

**Files:**

- Modify: `src/features/KeyManagement/components/TokenList.tsx`
- Modify: `src/features/KeyManagement/components/RepairMissingKeysDialog/index.tsx`
- Optionally create if the state remains cohesive: `src/features/KeyManagement/components/RepairMissingKeysDialog/useRepairCreatedKeyManagedSiteImport.ts`
- Test: `tests/entrypoints/options/pages/KeyManagement/TokenList.batchExport.test.tsx`
- Test: `tests/features/KeyManagement/components/RepairMissingKeysDialog/index.test.tsx`
- Test: `tests/entrypoints/options/KeyManagementRepairMissingKeys.test.tsx`

- [ ] Add a failing TokenList test that asserts the existing selection action launches the shared dialog with `{ source: "manual-selection", verification: "complete" }` and preserves existing managed-site import success refresh behavior.

- [ ] Add failing repair-dialog tests:

  - current-session completed progress with references shows created-key count and current target;
  - launch resolves lazily and opens the shared dialog with trusted intent;
  - a current-version historical result opens with repair source plus complete verification;
  - old progress/no exact references shows no import action;
  - a resolver failure leaves repair results mounted and shows actionable local feedback;
  - closing shared review returns to the same repair result without losing current-session freshness state;
  - completion records only attempted controlled outcomes through the background receipt message.

- [ ] Extend the entrypoint-level repair test with the real progress transition from running to completed so the action appears only after a current-session job produces exact references.

- [ ] Run the three suites and confirm the new expectations fail:

  ```powershell
  pnpm vitest run tests/entrypoints/options/pages/KeyManagement/TokenList.batchExport.test.tsx tests/features/KeyManagement/components/RepairMissingKeysDialog/index.test.tsx tests/entrypoints/options/KeyManagementRepairMissingKeys.test.tsx
  ```

- [ ] Keep TokenList’s existing frozen-selection/dialog ownership, but replace the implicit raw-items launch with an explicit manual request carrying `{ source: "manual-selection", verification: "complete" }`. Preserve its existing completion-to-status-refresh mapping.

- [ ] Add a compact repair import action card between `RepairMissingKeysProgressCard` and `RepairMissingKeysResultsPanel`. Show the selected managed-site label and count, keep target settings available, and launch resolution lazily so merely viewing repair history performs no account/network work.

- [ ] Mount the same `ManagedSiteTokenBatchExportDialog` from the repair component as a sibling of its outer modal. While batch review is open, render the outer repair modal closed but keep the original `isOpen` value passed to `useRepairMissingKeysJob` unchanged; closing review therefore returns to the same result without resetting freshness. Do not put batch preparation/execution logic into the repair dialog.

- [ ] On batch completion, map only attempted account-token results to existing managed-site status refresh callbacks and send controlled receipt items for the active repair `jobId`/target. New creations become `created`, reconciled exact matches become `already-present`, and definite/uncertain outcomes retain their controlled status. Deselecting creates no receipt.

- [ ] Rerun the integration suites:

  ```powershell
  pnpm vitest run tests/entrypoints/options/pages/KeyManagement/TokenList.batchExport.test.tsx tests/features/KeyManagement/components/RepairMissingKeysDialog/index.test.tsx tests/entrypoints/options/KeyManagementRepairMissingKeys.test.tsx
  ```

- [ ] Commit the two entry points onto the one shared flow:

  ```powershell
  git add src/features/KeyManagement/components/TokenList.tsx src/features/KeyManagement/components/RepairMissingKeysDialog tests/entrypoints/options/pages/KeyManagement/TokenList.batchExport.test.tsx tests/features/KeyManagement/components/RepairMissingKeysDialog/index.test.tsx tests/entrypoints/options/KeyManagementRepairMissingKeys.test.tsx
  git commit -m "feat(key-management): import keys from repair results"
  ```

## Task 7: Localize the shared UX and add privacy-safe source analytics

**Files:**

- Modify: `src/locales/en/keyManagement.json`
- Modify: `src/locales/es-419/keyManagement.json`
- Modify: `src/locales/ja/keyManagement.json`
- Modify: `src/locales/pt-BR/keyManagement.json`
- Modify: `src/locales/vi/keyManagement.json`
- Modify: `src/locales/zh-CN/keyManagement.json`
- Modify: `src/locales/zh-TW/keyManagement.json`
- Modify: `src/services/productAnalytics/contracts.ts`
- Modify: `src/services/productAnalytics/actions.ts`
- Modify: `src/services/productAnalytics/privacy.ts`
- Test: `tests/services/productAnalytics/actions.test.ts`
- Test: `tests/services/productAnalytics/privacy.test.ts`
- Test: `tests/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog.test.tsx`

- [ ] Add failing analytics tests for a controlled batch-import source field with only `manual_selection` and `repair_created`. Assert both sources attach it to the existing `ExportManagedSiteTokenChannels` action and that the privacy sanitizer rejects arbitrary values and strips job IDs, account/token IDs, fingerprints, URLs, groups, models, messages, and secrets.

- [ ] Add a dedicated typed field rather than overloading unrelated generic source values. Wire it through the existing action insight mapper and explicit privacy allow-list. Do not add a new per-key analytics action.

- [ ] Add shared locale keys in all seven app locales for current target/change target, created-key simplified review, use complete checks, unavailable exact key, target changed/stale preview, controlled results, not selected, retry, and reconciliation guidance. Use proper `count` plurals for visible counts.

- [ ] Keep copy user-oriented: describe which newly created keys will be imported, which target receives them, what checks are omitted, and how to choose full checks. Do not say “provenance”, “fingerprint”, “receipt”, “resolver”, “trusted/untrusted”, or expose provider implementation details.

- [ ] Run analytics and dialog tests:

  ```powershell
  pnpm vitest run tests/services/productAnalytics/actions.test.ts tests/services/productAnalytics/privacy.test.ts tests/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog.test.tsx
  ```

- [ ] Run locale extraction verification and inspect the locale diff for accidental deletions or shape drift:

  ```powershell
  pnpm run i18n:extract:ci
  git diff -- src/locales
  ```

- [ ] Commit localization and analytics:

  ```powershell
  git add src/locales src/services/productAnalytics/contracts.ts src/services/productAnalytics/actions.ts src/services/productAnalytics/privacy.ts tests/services/productAnalytics/actions.test.ts tests/services/productAnalytics/privacy.test.ts tests/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog.test.tsx
  git commit -m "feat(key-management): localize repaired key import insights"
  ```

## Task 8: Add one browser-level regression and complete release gates

**Files:**

- Modify: `e2e/keyManagementCommonFlow.spec.ts`
- Modify as required by the existing intercepted fixture boundary: `e2e/fixtures/managedSiteChannelsIntercepted.ts`
- Modify only if new selectors are needed: `src/features/KeyManagement/testIds.ts`

- [ ] Add one intercepted Playwright test named `imports selected repair-created keys into the managed site`. Reuse the existing background repair flow and managed-site request interception.

- [ ] In the scenario, seed an account with one covered group and two missing groups; configure a separate intercepted managed-site target; run repair; open the repair-created shared review; deselect one created key through stable IDs; and execute the remaining selection.

- [ ] Assert there is no second confirmation in fresh trusted mode, exactly one target create request occurs, its payload uses the selected created key and provider single-create mode, and duplicate-search/hidden-key verification is not called for that first trusted import.

- [ ] Assert both the successful row and deselected row remain visible afterward, while only the selected row counts as attempted/created. Keep retry, error taxonomy, target matrix, and permission cases in Vitest/service tests.

- [ ] Run the focused browser scenario:

  ```powershell
  pnpm exec playwright test e2e/keyManagementCommonFlow.spec.ts --project=chromium --grep "imports selected repair-created keys"
  ```

- [ ] Run affected unit/component suites through related validation:

  ```powershell
  pnpm vitest related --run src/types/accountKeyAutoProvisioning.ts src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts src/services/accounts/accountKeyAutoProvisioning/repair.ts src/services/managedSites/tokenBatchImportTarget.ts src/services/managedSites/repairCreatedTokenBatchImport.ts src/types/managedSiteTokenBatchExport.ts src/services/managedSites/tokenBatchExport.ts src/features/KeyManagement/components/TokenList.tsx src/features/KeyManagement/components/RepairMissingKeysDialog/index.tsx src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog.tsx src/services/productAnalytics/actions.ts src/services/productAnalytics/privacy.ts
  ```

- [ ] Run TypeScript and locale gates:

  ```powershell
  pnpm compile
  pnpm run i18n:extract:ci
  ```

- [ ] Inspect the task diff for secrets, duplicated importer/provider logic, raw target data in receipts/analytics, user-deselected rows counted as results, New API-only orchestration, stale comments, formatting churn, or unrelated files:

  ```powershell
  git status --short
  git diff --check
  git diff --stat
  git diff
  ```

- [ ] Stage only the exact files named in Tasks 1–8, using the task-specific `git add` commands above, then run the actual commit gate:

  ```powershell
  git status --short
  pnpm run validate:staged
  ```

- [ ] Because this changes shared TypeScript contracts, persistence, runtime messaging, and browser behavior, run the push-equivalent gate:

  ```powershell
  pnpm run validate:push
  ```

- [ ] Commit any final E2E/gate fixes after rerunning affected checks:

  ```powershell
  git commit -m "test(key-management): cover repaired key managed-site import"
  ```

## Completion evidence to report

- Exact focused Vitest commands and pass counts.
- `pnpm compile`, `pnpm run i18n:extract:ci`, `pnpm run validate:staged`, and `pnpm run validate:push` outcomes reported separately.
- Playwright command, selected browser project, and scenario result reported separately from unit tests.
- Final commits and any unrelated pre-existing worktree state.
- Telemetry decision: reuse the existing batch-export action with one controlled source field; no raw target/key/job data.
- Settings decision: reuse the existing managed-site settings tab/deep link; no new search target is needed.
- E2E decision: retain one intercepted happy-path browser scenario because the risk crosses background repair, persisted progress, options UI, and managed-site write interception.
- Maintainability decision: one shared dialog/service/provider path, one feature adapter for repair references, one target identity helper, and bounded receipts in the existing repair snapshot; no duplicated repair-only execution path.
