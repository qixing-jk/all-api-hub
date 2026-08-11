# Cut Account Key Repair to Native Reconciliation Results

Status: resolved

Blocked by: 02, 03, 04, 05

## Objective

Move `AccountKeyRepairRunner`, progress, messaging, invalid deletion, rename
reporting, and repair UI onto the provider-neutral reconciler result.

## Scope

- Keep enabled-account selection, skip policy, per-origin serialization,
  cancellation, and background messaging in `AccountKeyRepairRunner`.
- Call `reconcileAccountKeyInventory` once for each eligible account.
- Replace token/group result fields with requirements, per-requirement outcomes,
  exact created refs, invalid refs, and rename outcomes.
- Add the required progress schema version. Treat missing or stale versions as
  idle and replace them on the next run; do not migrate historical progress.
- Prove saved account storage is neither rewritten nor cleared.
- Route user-confirmed invalid deletion through exact refs, serial execution,
  and applied/rejected/uncertain results.
- Preserve `renameAutoTemplateTokens`; report rename uncertainty separately
  from otherwise valid coverage.
- Update UI helpers, lists, counts, filters, messages, telemetry projections,
  locales, and runtime validators to the new controlled result.

## Acceptance Criteria

- Tests cross the `AccountKeyRepairRunner` progress and per-account/
  per-requirement result seam, not private queue or helper call order.
- Partial per-requirement creation does not turn the entire background job into
  an opaque failure.
- Incomplete inventory creates no keys and renders an actionable account-level
  result.
- Invalid delete keeps rejected and uncertain rows visible and never
  automatically replays them.
- A stale progress payload reads as idle while all saved accounts remain
  unchanged.
- Progress, runtime messages, logs, telemetry, and UI state contain no secrets.

## Validation

- Run account repair, rate-limiting, messaging, storage, invalid-delete,
  component, telemetry, and locale extraction checks related to the change.
- Run `pnpm compile`.
- Inspect repair storage and account storage tests together for isolation.

## E2E Decision

Prefer Vitest and Testing Library for the result matrix. Add or extend browser
E2E only if real background/storage messaging remains an unresolved risk.

## Out of Scope

- Managed-site import bridge changes.
- Deleting legacy modules still used by managed import or other features.

## Comments

2026-08-11: Cut the repair runner, progress, messaging, UI, invalid deletion,
and rename reporting to native results. Repair/UI/message tests, locale
extraction, type-checking, and the representative extension E2E pass.
