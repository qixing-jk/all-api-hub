# Define Native Account-Key Reconciliation Contracts

Status: resolved

Blocked by: none

## Objective

Define the public native contracts and test fixtures required by the approved
three-layer architecture before moving any provider or repair caller.

## Scope

- Extend `AccountKeyResourceSession` with optional `provisioning` and
  `runtimeKey` facets.
- Define opaque requirements, explicit requirement discovery, resource
  placement, inventory completeness, mutation certainty, and exact creation
  provenance.
- Define provider-neutral reconciler result types and ref-based invalid,
  rename, created, and managed-import receipt identities.
- Define the new required repair-progress schema version. Historical progress
  is intentionally invalid rather than migrated; saved account storage is not
  changed.
- Add neutral fake-session builders for later contract tests using reserved
  example data.
- Keep raw provider DTOs and legacy `ApiToken` fields out of new public types.

## Acceptance Criteria

- The contracts distinguish complete empty inventory from partial, blocked,
  unavailable, and unknown states.
- A single mutation exposes `applied`, `rejected`, or `uncertain`; aggregate
  partial success is not represented as a single-resource outcome.
- Exact created provenance is distinct from coverage observed after an
  uncertain write.
- `runtimeKey.resolve(ref)` cannot return a runtime key correlated to another
  account, site type, scope, or resource ID.
- Public type and runtime-boundary tests reject malformed refs, placements,
  outcomes, and progress payloads.
- Tests use the `AccountKeyResourceSession.provisioning` and
  `session.runtimeKey.resolve(ref)` public seams, not internal factory helpers.

## Validation

- Run focused contract and native-resource related Vitest suites.
- Run `pnpm compile` because shared exported contracts change.
- Confirm the diff contains no account-storage migration or product workflow
  cutover.

## Out of Scope

- Implementing the reconciler loop.
- Adding production provider Adapters.
- Changing repair UI or managed-site execution.

## Comments

2026-08-11: Implemented the native provisioning/runtime facets, opaque refs,
mutation outcomes, placement validation, progress schema v2, and runtime
boundary coverage. Focused contract tests and `pnpm compile` pass.
