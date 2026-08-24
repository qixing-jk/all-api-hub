# Complete the Check-in Method Release Experience

Status: ready-for-agent

Implementation progress: partial

Blocked by: 03, 04, 05, 07

## Objective

Complete the user-visible recovery states, settings discoverability, documentation, telemetry audit, and one representative browser-level proof for the new check-in method lifecycle.

## Scope

- Present resolved, ambiguous, unknown, unsupported, disabled, manual-stale, and uncertain states using user-goal language and actionable recovery controls.
- Ensure manual override, restore automatic, redetect, status reconciliation, and explicit automatic-execution controls remain discoverable without exposing endpoint details.
- Keep the existing custom check-in URL workflow and its independent local daily status unchanged.
- Update settings search definitions, shared target IDs, deep links, and anchors for any added or moved controls.
- Synchronize all supported application locales and update the Chinese end-user auto-check-in documentation as the source of truth when shipped behavior changes.
- Audit discovery, selection, execution, reconciliation, and auth telemetry against the privacy allow-list; avoid duplicate or high-volume events.
- Extend one representative Playwright browser-extension flow across options/account persistence and background scheduler recovery.

## Required UI States

- Resolved: show the selected method without demanding routine action.
- Ambiguous: require a one-time choice and preserve an existing usable selection.
- Unknown: explain that detection could not complete and offer redetection.
- Unsupported: explain that no registered method was confirmed; keep custom URL available.
- Disabled: retain the method and explain that the deployment has disabled it.
- Status unavailable: retain the method and automatic-execution control, explain that today's state cannot be read automatically, and do not label the method unsupported.
- Manual stale: retain the user's choice and offer redetection, another method, or restore automatic.
- Uncertain: offer status verification or authentication repair, never an immediate blind POST retry.

## Acceptance Criteria

- Every non-happy path has an explanation and a valid next action.
- The UI never displays internal Adapter names, endpoint paths, raw backend messages, or unsupported certainty claims.
- Settings search reaches every new control through exported stable target IDs.
- All locales retain the same key shape and `pnpm run i18n:extract:ci` reports no unexpected changes.
- Telemetry contains only controlled booleans, enums, counts, and durations.
- Existing custom check-in page opening, redeem behavior, sorting, and local daily state tests remain green.

## E2E Decision

Add one representative Chromium extension flow because the residual risk crosses options UI, extension storage, background scheduling, and restart/re-entry:

1. configure or seed an account with a selected method;
2. exercise one non-happy recovery state such as an uncertain result;
3. reinitialize the background context or scheduler;
4. verify status reconciliation occurs before any mutation;
5. verify no blind duplicate POST occurs;
6. verify the persisted state and UI converge.

Keep the complete state matrix in Vitest/Testing Library rather than adding more browser scenarios.

## Validation

- Run related Vitest/Testing Library suites for AccountDialog, auto-check-in views, settings search, navigation, locales, and analytics privacy.
- Run `pnpm run i18n:extract:ci` and `pnpm compile`.
- Run the one affected Playwright flow in Chromium.
- Inspect the final task-scoped diff for raw protocol data, secrets, duplicated rules, and stale V6 terminology.

## Out of Scope

- A generic HTTP request editor or scripting engine.
- Concurrent V6/V7 WebDAV writers.
- A capability fingerprint.
- A generic operation journal.

## Comments

- 2026-08-24: PR #1350 delivered localized AccountDialog discovery/selection recovery states, preserved automatic intent and custom check-in independence, added privacy-safe discovery/execution analytics, and added sortable/filterable/paginated readiness and result workspaces. Remaining work includes a complete acceptance-state audit, any missing settings-search/deep-link wiring, and the ticket's representative cross-entrypoint uncertain-result/restart E2E proof after Ticket 05 supplies the final certainty contract.
