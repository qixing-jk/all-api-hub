# Add Bulk Check-in Capability and Status Refresh

Status: ready-for-agent

Blocked by: 04, 05, 07

## Objective

Give users one explicit action to refresh check-in capability and current status across saved accounts, while rediscovering methods only where needed and never silently changing check-in intent or performing a check-in.

## Scope

- Add one global user-initiated action for all relevant saved accounts. Keep it separate from ordinary account refresh and background scheduling.
- Route every account through the Check-in Method Module rather than branching over protocol Adapters in the UI:
  - call `refreshSelectedStatus` when the selected method remains usable and no discovery is recommended;
  - call `discover` when no method is selected, the selection is stale, the registry has newer candidates, or `rediscoveryRecommended` is true;
  - skip accounts with no registered candidates.
- Include disabled accounts in this explicit read-only operation, while continuing to exclude them from scheduled execution.
- Preserve manual selections, `automaticExecutionEnabled`, and the existing custom check-in URL workflow.
- Never issue a check-in mutation or enable automatic execution as a side effect.
- Use bounded concurrency, per-account timeouts, cancellation, and partial-result handling so one slow or failed account does not block the remaining accounts.
- Before applying an account result, verify that the saved account identity and relevant selection state still match the operation snapshot; do not overwrite newer user edits.
- Present progress and a final summary using actionable categories such as status refreshed, method discovered, deployment disabled, manual choice required, authentication required, unsupported, unknown, failed, changed while refreshing, and skipped.
- Keep the existing per-account redetection control for targeted recovery.

## Acceptance Criteria

- A single explicit action processes all eligible saved accounts without requiring users to open each account dialog.
- Accounts with a usable selected method receive selected-only status refresh and do not enumerate every candidate.
- Accounts that require discovery run bounded read-only discovery and can recognize methods registered after the account was saved.
- The operation never invokes an Adapter `checkIn` method and never changes `automaticExecutionEnabled`.
- Manual selection remains sticky across every refresh and discovery outcome.
- Disabled accounts can have capability and status refreshed without becoming scheduler-eligible.
- Partial failures leave successful account updates intact and produce an accurate, recoverable summary.
- Concurrent account deletion or edits do not recreate an account or overwrite its newer selection and intent.
- Users can cancel remaining work without rolling back already completed account updates.
- The global action is disabled or guarded against duplicate concurrent runs.

## Tests

- Cover routing between selected-only refresh, full discovery, and skip using fake Adapters.
- Prove that the bulk operation never calls `checkIn` and never enables automatic execution.
- Cover manual selection and custom URL preservation.
- Cover newly registered candidates, ambiguous discovery, disabled methods, unsupported results, authentication failures, unknown results, and accounts without candidates.
- Cover bounded concurrency, cancellation, timeout, partial failure, and duplicate-run prevention.
- Cover account deletion and selection or intent changes while an operation is in flight.
- Add component tests for progress, partial-result summary, recovery actions, and disabled/loading states.

## Telemetry Decision

Add one user-action event and one result-summary event with controlled trigger, counts, duration bucket, cancellation state, and outcome categories. Do not record URLs, hosts, account identifiers, method endpoints, backend messages, or credentials.

## E2E Decision

Prefer Module and component tests for the routing and result matrix. Extend one existing options-page Playwright flow only if implementation introduces browser-storage, cross-entrypoint, or restart behavior that lower-level tests cannot prove.

## Validation

- Run related Vitest suites for the Check-in Method Module, account persistence, bulk-operation orchestration, UI, and analytics sanitizer.
- Run `pnpm compile` and `pnpm run i18n:extract:ci` for typed shared surfaces and new UI copy.
- If the E2E condition is met, run the affected Chromium Playwright flow.
- Inspect the final task-scoped diff for duplicated discovery rules, protocol details in UI code, accidental mutation paths, and unsafe persistence races.

## Out of Scope

- Performing check-in for every account.
- Silently enabling or disabling automatic execution.
- Background or scheduler-driven full discovery.
- Folding full capability discovery into ordinary account refresh.
- Removing the targeted per-account redetection action.
- A generic provider health scanner or arbitrary HTTP request runner.

## Comments
