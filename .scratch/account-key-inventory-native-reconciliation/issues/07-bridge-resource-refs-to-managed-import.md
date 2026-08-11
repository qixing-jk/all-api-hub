# Bridge Repair-Created Resource Refs to Managed Import

Status: resolved

Blocked by: 06

## Objective

Replace repair-created numeric token resolution with an exact Resource Ref to
Runtime Key bridge while retaining the existing shared managed-site review and
execution flow.

## Scope

- Resolve each created ref against the current saved account and current
  `AccountKeyResourceSession`.
- For current-session review only, prefer the bounded
  `browser.storage.session` created-secret handoff; historical review must
  bypass it and call `session.runtimeKey.resolve(ref)`.
- Emit a transient `AccountRuntimeKey` or an explicit blocked-reference row.
- Never substitute another resource when the account, site type, normalized
  source origin, scope, resource, or secret cannot be resolved.
- Feed the existing shared managed import preview/execution flow through one
  neutral bridge projection.
- Replace token-based repair receipts and retry keys with target fingerprint
  plus resource-ref identity.
- Keep `trusted-new` limited to exact current-session creation provenance;
  failed or uncertain target writes retry through complete reconciliation.
- Preserve target-change checks, selection, model edits, partial results,
  controlled diagnostics, and secret redaction.

## Acceptance Criteria

- Tests cross the managed import bridge public seam with `AccountRuntimeKey` or
  correlated created-secret input and Resource Ref based receipts.
- Runtime resolver tests cover exact success, missing account, changed site
  type, changed source origin, missing scope/resource, unresolved secret, and
  create-response-only resources.
- No secret is written to progress, receipts, runtime messages, logs, or
  telemetry.
- New jobs, cancellation, failure, and cold-start terminalization clear the
  transient cache; successful or already-present receipts discard exact refs.
- Same-target successful receipts suppress confirmed repeats; failed and
  uncertain receipts force complete verification.
- The implementation does not migrate every target Managed Site Type Adapter
  and does not add a repair-specific channel creator.

## Validation

- Run repair-created candidate, runtime-key resolution, managed import preview,
  execution, receipt, retry, mutation-outcome, and dialog-related tests.
- Run `pnpm compile` and locale extraction if copy changes.
- Extend one representative Playwright flow only if the real extension bridge
  behavior is not covered by existing browser tests.

## Out of Scope

- Rewriting all managed-site channel-draft Adapters around runtime keys.
- Multi-target or automatic import.

## Comments

2026-08-11: Implemented exact ref-to-runtime-key resolution, normalized source
origin validation before opening a resource session, blocked rows, target/ref
receipts, trusted-new boundaries, and reuse of the shared managed import
review/execution flow. Focused bridge tests and the representative E2E pass.

2026-08-11: Final hardening added a bounded `browser.storage.session` handoff
for create-response-only secrets keyed by job plus full ref. Current-session
review may consume it; historical review always uses the native runtime
resolver. The runner clears it on new jobs, cancellation, failure, and
cold-start terminalization, and removes terminally imported refs. Adjacent
safety fixes reject duplicate invalid-delete refs before mutation, validate
runtime ref scopes through the factory before provider resolution, and keep
accounts partial when inventory is incomplete even if known requirements are
covered.

2026-08-11: Exact-ref secret capture now deduplicates repeated identical
secrets and rejects conflicting secrets from the same capture or an existing
cache entry without writing. This prevents a later requirement result from
overwriting the provenance attached to the first occurrence of the ref.

2026-08-11: Final current-tree validation covered 170 repair/UI/import tests,
87 CopyKey/runtime/messaging tests, 314 provider/account-lifecycle tests,
`pnpm compile`, i18n extraction, scoped lint/format/diff checks, and the
representative Playwright repair/delete/import scenario. Independent read-only
review found no remaining material issue.
