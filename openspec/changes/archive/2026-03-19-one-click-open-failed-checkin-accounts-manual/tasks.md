## 1. Recon And Helper Reuse

- [x] 1.1 Confirm the current manual sign-in flow in `src/features/AutoCheckin/AutoCheckin.tsx`, `src/features/AutoCheckin/components/ActionBar.tsx`, `src/features/AutoCheckin/components/ResultsTable.tsx`, and `src/utils/navigation/index.ts` so the new bulk action reuses the existing destination semantics instead of adding a parallel flow.
- [x] 1.2 Extract or centralize the Auto Check-in manual-open helper so the existing per-row action and the new page-level bulk action share account resolution, best-effort error handling, and any brief clarifying comments needed for non-obvious bulk-open behavior.

## 2. Auto Check-in Bulk Manual Open

- [x] 2.1 Extend `src/features/AutoCheckin/components/ActionBar.tsx` and `src/features/AutoCheckin/AutoCheckin.tsx` with failed-account detection, loading state, and a page-level bulk manual sign-in button that targets failed accounts from the latest stored status.
- [x] 2.2 Implement best-effort bulk manual-open execution in the Auto Check-in feature so one account-opening failure does not block the remaining failed accounts, while keeping the existing single-account "Manual sign-in" action intact.
- [x] 2.3 Add localized loading/success/error strings for the bulk manual-open action in `src/locales/zh-CN/autoCheckin.json` and `src/locales/en/autoCheckin.json`.
- [x] 2.4 Preserve external bulk-open modifier semantics for the Auto Check-in action so Shift-click opens failed manual sign-in pages in a dedicated new window when supported.
- [x] 2.5 Add a visible user hint near the bulk action so the Shift-click new-window option is discoverable.

## 3. Verification

- [x] 3.1 Add or update focused options-page tests covering bulk-action visibility/disabled state, failed-account target selection, and best-effort completion feedback (for example `tests/entrypoints/options/AutoCheckinBulkManualOpen.test.tsx` plus related existing Auto Check-in tests).
- [x] 3.2 Run `pnpm lint`.
- [x] 3.3 Run the smallest related automated test command for the touched behavior, for example `pnpm test -- tests/entrypoints/options/AutoCheckinBulkManualOpen.test.tsx tests/entrypoints/options/AutoCheckinQuickRun.test.tsx tests/entrypoints/options/AutoCheckinResultsTableDevActions.test.tsx`, and document blockers if validation cannot complete.
