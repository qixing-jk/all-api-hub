# Scout refactor audit — 2026-09-13

Mode: explicit pass. Scope: the complete branch delta, plus direct consumers and tests.

- Branch: `feat/checkin-adaptation-intake`; initial worktree and index were clean.
- Original head: `060925346`; original merge base: `aac07b02d3ba7c18e0ccb6783a0ad6797c4b60a6`.
- Intended base: `origin/main`, confirmed by repository conventions; no branch PR or published remote branch.
- Refreshed base and merge base: `4a33987c595fbea18279620a2ec1a908d02c2c93`.
- Rebased head before cleanup: `e3fdbc0f7`. Recovery ref: `archive/checkin-before-scout-20260913`.
- Range comparison: 21 equivalent commits; the remaining commit only incorporates the upstream successful-disable mock alongside the existing skip-hover interaction setup.

## Candidate ledger

| Location | Evidence and improvement | Classification | Validation/dependency |
| --- | --- | --- | --- |
| `pageScan.ts`, background `checkinFeedbackScan.ts` | Duplicated active scan and bounded cancellation history; share a context-local registry without sharing instances across runtimes | safe now — implemented | Existing page/background cancellation tests plus direct ownership/isolation tests |
| `scan.ts`, `scanParsing.ts`, `scanReader.ts` | Route limits duplicated and budgets distributed; name the existing fixed limits in one module and reuse them in tests | safe now — implemented | Existing request, byte, deadline, priority and cancellation coverage |
| `report.ts` | Repeated timestamp validation and method-record lookup; private formatting helper and one record lookup | safe now — implemented | Existing report output and retained-evidence tests |
| `AccountForm.tsx` | Same changed-site predicate controls evidence and auth; give it one local name | safe now — implemented | Existing same-account, changed-URL and changed-user tests |
| `AccountActionButtons` | Two identical submenu shells repeat portal, keyboard and viewport wiring; extract a same-feature component | safe now — implemented | Menu component tests and wide/narrow browser tests |
| `ResultsTableRowActions.tsx` | Four copies of direct button and label breakpoints; extract a private component retaining props, icons, classes and analytics scope | safe now — implemented | Result/component tests and responsive browser cases |
| Account action tests and shared support | Text-to-button traversal and a duplicate deferred implementation; use accessible menu-item queries and the existing deferred utility | safe now — implemented | All direct consumer tests |
| Feedback dialog tests | Locale bundles lacked cleanup; readiness test queried the obsolete unsupported label for an unconfigured account | safe now — implemented | Existing scenario retains its original fixture and uses the current feedback label |
| Local spec and slice tickets | Initial click-to-scan, direct-only, 12-request/5-MiB description had drifted from later branch commits | safe now — implemented | Append a dated current implementation snapshot, preserving historical decisions |

## Audit coverage

Inspected ownership/size, duplication/fallbacks, runtime values/types, dead code/glue, shared primitives, and test contracts. Existing form hooks, sanitized report preview, per-provider GET routes, result badges and runtime permission mappings retain their current boundaries. Locale inventory was checked for matching keys and controlled copy; this is not a new translation review. Broader account-action orchestration and the shared temporary-window pool are outside a behavior-preserving local extraction unless a concrete touched-contract issue requires them.

Every file below belongs to the original 84-file branch inventory and was inspected. Files without cleanup retain their existing behavior and contracts.

- [x] `.github/ISSUE_TEMPLATE/checkin_adaptation.md`
- [x] `.scratch/checkin-adaptation-intake/issues/01-one-click-checkin-feedback-report.md`
- [x] `.scratch/checkin-adaptation-intake/issues/02-deep-diagnosis-network-evidence.md`
- [x] `.scratch/checkin-adaptation-intake/spec.md`
- [x] `e2e/accountActionMenu.spec.ts`
- [x] `e2e/autoCheckinResultActions.spec.ts`
- [x] `e2e/checkInFeedback.spec.ts`
- [x] `src/constants/runtimeActions.ts`
- [x] `src/entrypoints/background/checkinFeedbackScan.ts`
- [x] `src/entrypoints/background/protectionBypassResourceValidation.ts`
- [x] `src/entrypoints/background/runtimeMessages.ts`
- [x] `src/entrypoints/background/tempWindowPool.ts`
- [x] `src/entrypoints/content/messageHandlers/index.ts`
- [x] `src/features/AccountManagement/components/AccountActionButtons/index.tsx`
- [x] `src/features/AccountManagement/components/AccountDialog/AccountCheckInSection.tsx`
- [x] `src/features/AccountManagement/components/AccountDialog/AccountForm.tsx`
- [x] `src/features/AccountManagement/components/AccountDialog/index.tsx`
- [x] `src/features/AutoCheckin/components/AccountSnapshotTableRow.tsx`
- [x] `src/features/AutoCheckin/components/ResultStatusBadge.tsx`
- [x] `src/features/AutoCheckin/components/ResultsTable.tsx`
- [x] `src/features/AutoCheckin/components/ResultsTableRow.tsx`
- [x] `src/features/AutoCheckin/components/ResultsTableRowActions.tsx`
- [x] `src/features/AutoCheckin/utils/autoCheckin.ts`
- [x] `src/features/BasicSettings/components/tabs/Refresh/protectionBypassHistoryPresentation.ts`
- [x] `src/features/CheckInFeedback/CheckInFeedbackButton.tsx`
- [x] `src/features/CheckInFeedback/CheckInFeedbackDialog.tsx`
- [x] `src/features/CheckInFeedback/FeedbackForm.tsx`
- [x] `src/features/CheckInFeedback/FeedbackFormFooter.tsx`
- [x] `src/features/CheckInFeedback/FeedbackReportEditor.tsx`
- [x] `src/features/CheckInFeedback/FeedbackReportPreview.tsx`
- [x] `src/features/CheckInFeedback/useCheckInFeedback.tsx`
- [x] `src/features/CheckInFeedback/useFeedbackClues.ts`
- [x] `src/features/CheckInFeedback/useFeedbackSubmission.ts`
- [x] `src/locales/de/account.json`
- [x] `src/locales/de/accountDialog.json`
- [x] `src/locales/de/shieldBypass.json`
- [x] `src/locales/en/account.json`
- [x] `src/locales/en/accountDialog.json`
- [x] `src/locales/en/shieldBypass.json`
- [x] `src/locales/es-419/account.json`
- [x] `src/locales/es-419/accountDialog.json`
- [x] `src/locales/es-419/shieldBypass.json`
- [x] `src/locales/ja/account.json`
- [x] `src/locales/ja/accountDialog.json`
- [x] `src/locales/ja/shieldBypass.json`
- [x] `src/locales/pt-BR/account.json`
- [x] `src/locales/pt-BR/accountDialog.json`
- [x] `src/locales/pt-BR/shieldBypass.json`
- [x] `src/locales/vi/account.json`
- [x] `src/locales/vi/accountDialog.json`
- [x] `src/locales/vi/shieldBypass.json`
- [x] `src/locales/zh-CN/account.json`
- [x] `src/locales/zh-CN/accountDialog.json`
- [x] `src/locales/zh-CN/shieldBypass.json`
- [x] `src/locales/zh-TW/account.json`
- [x] `src/locales/zh-TW/accountDialog.json`
- [x] `src/locales/zh-TW/shieldBypass.json`
- [x] `src/services/checkin/autoCheckin/providers/feedbackRoutes.ts`
- [x] `src/services/checkin/feedback/diagnosticSection.ts`
- [x] `src/services/checkin/feedback/pageScan.ts`
- [x] `src/services/checkin/feedback/report.ts`
- [x] `src/services/checkin/feedback/scan.ts`
- [x] `src/services/checkin/feedback/scanClient.ts`
- [x] `src/services/checkin/feedback/scanParsing.ts`
- [x] `src/services/checkin/feedback/scanReader.ts`
- [x] `src/services/checkin/feedback/scanTypes.ts`
- [x] `src/services/protectionBypass/contracts.ts`
- [x] `tests/entrypoints/background/checkinFeedbackScan.test.ts`
- [x] `tests/entrypoints/background/tempWindowPoolWindowFallback.test.ts`
- [x] `tests/features/AccountManagement/components/AccountActionButtons.analyticsAndState.test.tsx`
- [x] `tests/features/AccountManagement/components/AccountActionButtons.inviteLink.test.tsx`
- [x] `tests/features/AccountManagement/components/AccountActionButtons.shareAndLocate.test.tsx`
- [x] `tests/features/AccountManagement/components/AccountActionButtons.toggleAndCheckin.test.tsx`
- [x] `tests/features/AccountManagement/components/AccountDialog.test.tsx`
- [x] `tests/features/AccountManagement/components/accountActionButtonsTestSupport.tsx`
- [x] `tests/features/AutoCheckin/components/AccountSnapshotTable.test.tsx`
- [x] `tests/features/CheckInFeedback/CheckInFeedbackDialog.test.tsx`
- [x] `tests/features/CheckInFeedback/FeedbackReportPreview.test.tsx`
- [x] `tests/services/checkin/feedback/pageScan.test.ts`
- [x] `tests/services/checkin/feedback/report.test.ts`
- [x] `tests/services/checkin/feedback/scan.test.ts`
- [x] `tests/services/checkin/feedback/scanClient.test.ts`
- [x] `tests/services/protectionBypass/contracts.test.ts`
- [x] `tests/services/protectionBypass/policy.test.ts`

## Completion

Final rescan: no further in-scope behavior-preserving candidates with concrete benefit and proportionate validation cost. No unresolved or blocked candidates; no expanded-scope migration is proposed.

- Focused Vitest: initial 24-file run covered 290 tests; one pre-existing readiness-label assertion failed and was corrected. Follow-up coverage passed 326 tests in 10 files, including temporary-page readiness, protection contracts/policy, account action consumers and feedback dialogs. Final modified test files are also validated by the commit hook.
- `pnpm compile`: passed on the final source/test state.
- `pnpm knip`: passed after the new runtime modules and component extraction.
- Playwright: 10 Chromium scenarios passed plus the E2E build setup (11 reported tests). Covers English/Chinese account menus at 390/1100 px, result actions at 640/1200/1600 px, and protected-page feedback at 390/1100 px. Reviewed narrow feedback and wide result-table screenshots.
- Normal commit hook owns formatting, linting, changed-test execution and triggered i18n checks; no bypass.
- No full suite or live-site credential-dependent E2E was run. These are not required for the preserved local contracts exercised above.

Additional direct files inspected/changed: the extracted `AccountActionSubmenu.tsx`, `scanLimits.ts`, `scanRegistry.ts`, its ownership test, and `AccountActionButtons.smartCopy.test.tsx` (a consumer of the deduplicated test helper).
