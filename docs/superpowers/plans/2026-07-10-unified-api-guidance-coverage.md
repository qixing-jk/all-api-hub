# Unified API Guidance Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining Options-page Unified API setup guidance gaps without adding dismissal or automatic-hiding behavior yet.

**Architecture:** Keep the existing full guidance cards as the discovery layer. Add lightweight, page-local recovery and next-step guidance at workflow boundaries, using existing `Notice`, `EmptyState`, managed-site readiness helpers, and Options hash navigation. Do not introduce a second global guidance state model or persisted visibility state.

**Tech Stack:** React, TypeScript, WXT Options UI, i18next, Vitest, Testing Library.

---

## Task 1: Add managed-site configuration next steps

**Files:**
- Modify: `src/features/BasicSettings/components/tabs/ManagedSite/ManagedSiteTab.tsx`
- Modify: `src/locales/{en,es-419,ja,vi,zh-CN,zh-TW}/settings.json`
- Test: `tests/entrypoints/options/ManagedSiteTab.test.tsx`

- [ ] **Step 1: Write failing component tests**

Add tests proving that the Managed Site tab explains the gateway role before configuration and, after `hasValidManagedSiteConfig` reports locally complete fields, renders actions that navigate to Key Management, API Credential Library, and Managed Site Channels. Add a real-locale semantic assertion that configuration completeness is not described as a ready connection or ready gateway and that channels remain a prerequisite.

- [ ] **Step 2: Run the focused test and confirm the new assertions fail**

Run: `pnpm vitest --run tests/entrypoints/options/ManagedSiteTab.test.tsx`

Expected: FAIL because the gateway next-step notice and actions do not exist.

- [ ] **Step 3: Implement the lightweight notice**

In `ManagedSiteTab.tsx`, read `preferences` and `managedSiteType`, calculate local configuration completeness with `hasValidManagedSiteConfig`, and render a neutral `Notice` after the selected site's connection settings and before model-sync/model-redirect maintenance settings. Neither state may imply that network authentication succeeded or that the gateway is already serving traffic: the copy must explain that channels must be created or imported before the managed site becomes the external endpoint. Use `pushWithinOptionsPage` and existing menu IDs for the three configured-state actions. Keep the incomplete state informational because the user is already on the required settings screen.

- [ ] **Step 4: Add localized copy in every app locale**

Add a stable `settings:managedSite.gatewayGuidance` key family with an unconfigured title/description, configured title/description, and labels for the three next-step actions. Preserve locale key shape across all six locales.

- [ ] **Step 5: Re-run the focused test**

Run: `pnpm vitest --run tests/entrypoints/options/ManagedSiteTab.test.tsx`

Expected: PASS.

## Task 2: Add configuration recovery to source import surfaces

**Files:**
- Modify: `src/features/KeyManagement/KeyManagement.tsx`
- Modify: `src/features/ApiCredentialProfiles/ApiCredentialProfiles.tsx`
- Modify: `src/locales/{en,es-419,ja,vi,zh-CN,zh-TW}/keyManagement.json`
- Modify: `src/locales/{en,es-419,ja,vi,zh-CN,zh-TW}/apiCredentialProfiles.json`
- Test: `tests/entrypoints/options/pages/KeyManagement/KeyManagement.emptyStateActions.test.tsx`
- Test: `tests/entrypoints/options/pages/ApiCredentialProfiles/ApiCredentialProfiles.test.tsx`

- [ ] **Step 1: Write failing recovery tests**

Add behavior tests proving that an invalid managed-site configuration produces a lightweight warning with a `Configure managed site` action on both pages, while valid configuration omits that warning. Assert navigation through the existing `openSettingsTab("managedSite", { preserveHistory: true })` helper rather than DOM implementation details.

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `pnpm vitest --run tests/entrypoints/options/pages/KeyManagement/KeyManagement.emptyStateActions.test.tsx tests/entrypoints/options/pages/ApiCredentialProfiles/ApiCredentialProfiles.test.tsx`

Expected: FAIL because neither page currently exposes a persistent recovery CTA.

- [ ] **Step 3: Implement page-level recovery notices**

Use `hasValidManagedSiteConfig(preferences, managedSiteType)` on both pages. In Key Management, place the warning immediately below the header so direct export and ordinary key operations remain visibly available. In API Credential Profiles, extend the existing Unified API notice with an action only when configuration is incomplete. Route both actions through `openSettingsTab`. Keep the recovery implementation caller-local: do not change `useChannelDialog.openWithAccount` or `openWithCredentials`, because those shared helpers also serve Account Management callers outside this slice. Tests must use type-constrained complete preference snapshots with required fields removed for the incomplete state, not `preferences: null`.

- [ ] **Step 4: Add synchronized locale copy**

Add copy that says managed-site configuration is required only for gateway-channel import and does not block direct copy/export or credential storage.

- [ ] **Step 5: Re-run focused tests**

Run: `pnpm vitest --run tests/entrypoints/options/pages/KeyManagement/KeyManagement.emptyStateActions.test.tsx tests/entrypoints/options/pages/ApiCredentialProfiles/ApiCredentialProfiles.test.tsx`

Expected: PASS.

## Task 3: Cover both source paths in the empty channel state

**Files:**
- Modify: `src/features/ManagedSiteChannels/ManagedSiteChannels.tsx`
- Modify: `src/locales/{en,es-419,ja,vi,zh-CN,zh-TW}/managedSiteChannels.json`
- Test: `tests/entrypoints/options/pages/ManagedSiteChannels/ManagedSiteChannels.test.tsx`

- [ ] **Step 1: Write the failing navigation test**

Extend the loaded-empty-state test to require both `Open Key Management` and `Open API Credential Library` actions. Assert that the new action navigates to `#apiCredentialProfiles`. Add race regressions for both directions: a late success from the old site type must not replace current rows or completion state, and a late failure from the old site type must not replace the current error/toast/analytics outcome.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `pnpm vitest --run tests/entrypoints/options/pages/ManagedSiteChannels/ManagedSiteChannels.test.tsx`

Expected: FAIL because the API Credential Profiles action is absent.

- [ ] **Step 3: Add the secondary source action**

Replace the single empty-state button with a wrapping action row. Keep Key Management as the primary/default action and add API Credential Library as an outline secondary action. Use `pushWithinOptionsPage` for both explicit workflow transitions. Do not show either action for filtered-empty, initial-loading, error, or configuration-required states.

Track successful completion of the initial channel load explicitly before allowing the gateway empty state to render. Give each load a request identity and an `AbortController`; abort the previous load when the managed-site type changes or the effect is cleaned up. Guard the success, rejection, and finalization paths with both the active request identity and captured site type. A backend that ignores abort can still settle late, so both fulfilled and rejected old-type requests must be ignored and must not replace current rows, completion state, error state, toast, or analytics outcome.

- [ ] **Step 4: Add the localized action label**

Add `gatewayGuidance.empty.openApiCredentialProfiles` to all app locales.

- [ ] **Step 5: Re-run the focused test**

Run: `pnpm vitest --run tests/entrypoints/options/pages/ManagedSiteChannels/ManagedSiteChannels.test.tsx`

Expected: PASS.

## Task 4: Continue from successful batch import to channel management

**Files:**
- Modify: `src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog.tsx`
- Modify: `src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog/ManagedSiteTokenBatchExportFooter.tsx`
- Modify: `src/locales/{en,es-419,ja,vi,zh-CN,zh-TW}/keyManagement.json`
- Test: `tests/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog.test.tsx`

- [ ] **Step 1: Write the failing success-action test**

Add a test proving that a result with `createdCount > 0` renders `View channels`, clicking it closes the dialog, and then navigates to `#managedSiteChannels`. Add a companion assertion that results with zero created channels retain only the close action.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `pnpm vitest --run tests/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog.test.tsx`

Expected: FAIL because the footer currently exposes only `Close` after execution.

- [ ] **Step 3: Implement the optional continuation action**

Pass an `onViewChannels` callback into the footer. Render the button only when `executionResult.createdCount > 0`; invoke the existing close path first, then call `pushWithinOptionsPage(#managedSiteChannels)` so dialog state is cleaned before navigation and Back can return to Key Management.

- [ ] **Step 4: Add synchronized locale copy**

Add `batchManagedSiteExport.actions.viewChannels` in all app locales.

- [ ] **Step 5: Re-run the focused test**

Run: `pnpm vitest --run tests/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog.test.tsx`

Expected: PASS.

## Task 5: Validate the integrated slice

**Files:**
- Verify all task-scoped files above.

- [ ] **Step 1: Run related tests**

Run: `pnpm vitest related --run src/features/BasicSettings/components/tabs/ManagedSite/ManagedSiteTab.tsx tests/entrypoints/options/ManagedSiteTab.test.tsx src/features/KeyManagement/KeyManagement.tsx src/features/ApiCredentialProfiles/ApiCredentialProfiles.tsx tests/entrypoints/options/pages/KeyManagement/KeyManagement.emptyStateActions.test.tsx tests/entrypoints/options/pages/ApiCredentialProfiles/ApiCredentialProfiles.test.tsx src/features/ManagedSiteChannels/ManagedSiteChannels.tsx tests/entrypoints/options/pages/ManagedSiteChannels/ManagedSiteChannels.test.tsx src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog.tsx src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog/ManagedSiteTokenBatchExportFooter.tsx tests/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog.test.tsx`

Expected: PASS.

- [ ] **Step 2: Validate i18n extraction**

Run: `pnpm run i18n:extract:ci`

The extractor reconciliation is part of this slice: remove only keys confirmed unused by current source references, and backfill the existing es-419 Unified API guidance and optional model-sync copy with real translations rather than committing generated empty strings.

Expected: PASS with no locale shape drift or unexpected extraction updates.

- [ ] **Step 3: Confirm the telemetry decision**

Decision: `none` for the new recovery and continuation CTAs in this slice. They mirror existing destinations and do not introduce a new capability; the primary Overview/Account Unified API guidance actions already record adoption with controlled guidance enums. Adding new surface IDs solely for duplicated recovery links would fragment the current funnel. Tests should assert navigation outcomes, not analytics payloads. Revisit telemetry when dismissal/automatic-hiding behavior is designed, because that change will need visibility and completion signals.

- [ ] **Step 4: Stage only task-scoped files and run the commit gate**

Run: `pnpm run validate:staged`

Expected: PASS.

- [ ] **Step 5: Inspect the final staged diff**

Run: `git diff --check --cached` and `git diff --cached --stat`.

Expected: no whitespace errors, no unrelated files, and no persisted dismissal/auto-hide state.

- [ ] **Step 6: Commit**

Commit message: `feat(options): extend unified API setup guidance`
