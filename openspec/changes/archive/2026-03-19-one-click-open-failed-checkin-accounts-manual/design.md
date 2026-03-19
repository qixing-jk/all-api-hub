## Context

The Auto Check-in options page already exposes:

- A page-level action bar in `src/features/AutoCheckin/components/ActionBar.tsx` for run/refresh controls.
- Per-row failure recovery actions in `src/features/AutoCheckin/components/ResultsTable.tsx`, including "Manual sign-in".
- A single-account manual-open flow in `src/features/AutoCheckin/AutoCheckin.tsx` that resolves account display data via `RuntimeActionIds.AutoCheckinGetAccountInfo` and then calls `openCheckInPage(...)`.
- A background bulk-open pattern for external custom check-in in `src/services/checkin/externalCheckInService.ts`, which is useful as a reference for best-effort multi-open behavior but solves a different problem (popup-safe external custom URLs plus mark-as-checked state).

Nearest existing abstractions and how this change should use them:

- `src/features/AutoCheckin/AutoCheckin.tsx#handleOpenManualSignIn`: extend/extract into a shared helper for single-account and bulk manual-open flows.
- `src/features/AutoCheckin/components/ActionBar.tsx`: extend with a new page-level action and loading/disabled state props.
- `src/utils/navigation/index.ts#openCheckInPage`: reuse as-is so bulk-open targets the same destination as the existing row action.
- `src/services/checkin/externalCheckInService.ts`: reuse only as a design reference for best-effort multi-open semantics; do not extend it because Auto Check-in manual recovery does not need custom check-in/redeem behavior or checked-in state mutation.
- `tests/entrypoints/options/*AutoCheckin*.test.tsx`: extend/add focused options-page tests instead of introducing a new harness.

The key constraint is scope: issue #610 asks for a one-click way to open failed accounts’ manual sign-in pages from the Auto Check-in page. It does not require changing provider behavior, retry rules, or the meaning of the existing single-account "Manual sign-in" action.

## Goals / Non-Goals

**Goals:**

- Add a page-level Auto Check-in action that opens manual sign-in pages for all failed accounts from the latest stored execution result.
- Keep single-account and bulk manual-open behavior consistent by reusing the same account resolution and navigation helper.
- Provide explicit loading/success/failure feedback so users know whether any pages were opened.
- Keep the change localized to Auto Check-in UI, its helper logic, i18n, and targeted tests.

**Non-Goals:**

- Change the provider-side failure handling or retry behavior for auto check-in runs.
- Introduce a new persisted execution-history model beyond the existing latest status payload.
- Reinterpret manual sign-in targets to use provider message URLs, custom external check-in URLs, or new redeem behavior in this change.
- Add popup/side-panel bulk-open controls; this issue targets the Auto Check-in page only.

## Decisions

1) Add the bulk-open entry point to the Auto Check-in action bar

- Place the new action beside the existing "Run now" and "Refresh" controls in `ActionBar`.
- Only enable the action when the current Auto Check-in status contains at least one failed account result.
- Compute eligible targets from the latest stored `status.perAccount` set, not from the current table filter/search state, so "open all failed" keeps a stable meaning even when the user is filtering the table.
- Reuse the existing modifier semantics from external bulk check-in actions: plain click opens tabs, while Shift-click requests opening the failed manual sign-in pages inside a dedicated new window when the browser supports it.
- Surface a short inline hint next to the action area so users can discover the Shift-click new-window variant without guessing or reading release notes.

Alternatives considered:

- Put the action inside `ResultsTable` header/footer. Rejected because it is a page-level recovery action, not a table-only affordance, and `ActionBar` already hosts global actions.
- Respect current filters/search. Rejected because a search box should not silently redefine "all failed accounts".
- Add a separate setting or secondary button for "open in new window". Rejected because the repo already uses Shift-click for this exact bulk-open variant, so reusing that gesture keeps the UI smaller and behavior consistent.

2) Reuse the existing single-account manual-open flow and extract shared helper logic

- Keep `openCheckInPage(displayData)` as the final opener so bulk and per-row actions land on the same page today.
- Extract the account-opening steps from `handleOpenManualSignIn` into a shared helper in the Auto Check-in feature layer:
  - fetch account display data through `RuntimeActionIds.AutoCheckinGetAccountInfo`
  - open the page with `openCheckInPage(...)`
  - surface sanitized errors
- The bulk action will iterate failed account IDs through the same helper and collect success/failure counts for a summary toast.

Alternatives considered:

- Add a completely separate bulk-only implementation. Rejected because it would create a second copy of manual-open behavior in the same feature.
- Switch both flows to provider `messageParams.checkInUrl` or custom check-in URLs now. Rejected as an unrequested behavior change; the issue asks to scale the existing manual action, not redefine its destination semantics.

3) Keep the bulk-open flow in the options-page UI instead of adding a new background runtime action

- The Auto Check-in page is an options surface, not a transient popup, so it can safely orchestrate multiple `AutoCheckinGetAccountInfo` requests and open tabs without the popup-lifecycle problem that motivated `externalCheckInService`.
- The UI will perform best-effort iteration: one account failing to resolve/open MUST NOT stop subsequent failed accounts from being attempted.
- If browser behavior later shows that multi-open needs background ownership, the extracted helper keeps the migration path clear; but the initial implementation stays minimal.

Alternatives considered:

- Add a new runtime action such as `autoCheckin:openManualForAccounts`. Rejected for now because it adds background contract surface without a current lifecycle or state-mutation need.
- Reuse `externalCheckInService`. Rejected because that service is specific to custom external check-in and marking check-in state, which would be incorrect for failed auto-checkin recovery.

4) Use summary feedback tailored to bulk recovery

- Keep the existing per-row "Manual sign-in" toast behavior for single-account actions.
- Add bulk-open loading/success/error messages in `src/locales/*/autoCheckin.json`.
- Success feedback should communicate how many failed accounts were opened; mixed-result feedback should report opened vs failed counts so users know whether some accounts still require manual follow-up.

Alternatives considered:

- Silent success with only tabs opening. Rejected because the action can partially fail and the user needs confirmation.
- Reuse the single-account error string for bulk results. Rejected because it does not describe partial success well.

## Risks / Trade-offs

- [Opening many tabs can feel abrupt] → Mitigation: scope targets strictly to failed accounts from the latest run and report a count-based summary so users understand what happened.
- [Bulk and single-account manual-open behavior may diverge later] → Mitigation: extract and reuse one helper now so a future destination change happens in one place.
- [Options-page orchestration could behave differently across browsers when opening several tabs] → Mitigation: keep the flow best-effort and isolated; if browser-specific issues appear, the logic can be moved behind a new background action without changing the UI contract.
- [Users may expect the action to respect filters/search] → Mitigation: make the label explicitly about failed accounts, and keep the implementation tied to the latest failed result set rather than transient table filters.

## Migration Plan

- No data migration is required.
- Rollback is safe: removing the page-level action restores the existing per-row manual sign-in workflow with no storage or runtime-contract cleanup.

## Open Questions

- None for implementation. The destination remains intentionally aligned with the current row-level manual sign-in behavior.
