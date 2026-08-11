# Remove Superseded Repair Token Contracts and Validate the Cutover

Status: resolved

Blocked by: 07

## Objective

Remove the legacy repair-only `ApiToken`, numeric `tokenId`, group-result, and
managed-import reference paths after native provider parity and the shared
bridge are proven.

## Scope

- Delete superseded repair-only coverage helpers, types, adapters, validators,
  UI projections, and tests.
- Remove `createdGroups`, repair `createdTokens`, token-based invalid deletion,
  and token-based managed import receipts from current-version code.
- Keep any non-repair key-management contract still used by unrelated product
  features.
- Confirm the current eligible-provider registry has native provisioning and
  runtime resolution or an explicit skip policy.
- Confirm historical repair progress is intentionally invalidated by version,
  not accidentally interpreted as current data.
- Confirm saved account storage and target Managed Site Type Adapters were not
  migrated or rewritten by this effort.
- Inspect the final diff for duplicate group logic, fallback propagation,
  provider branches, secret exposure, and stale comments.

## Acceptance Criteria

- Searches find no current repair or repair-created import dependency on
  `ApiToken`, numeric `tokenId`, `createdGroups`, or legacy created-token refs.
- All five public test seams remain green.
- New API-family, Sub2API, and VoAPI v2 parity is proven; excluded providers
  retain controlled skip behavior.
- Incomplete inventory, mutation uncertainty, exact provenance, invalid
  delete, rename, runtime resolution, and ref receipts remain covered.
- Account storage has no migration and every managed-site target Adapter keeps
  its pre-effort public contract.

## Validation

- Run focused and related Vitest suites for all touched account-resource,
  repair, runtime-key, managed-import, storage, telemetry, and UI modules.
- Run locale extraction when locale resources changed.
- Run `pnpm compile` and the repository commit gate.
- Use the push gate only when publishing the completed branch.
- Run the retained representative Playwright scenario when Ticket 06 or 07
  established that browser-level coverage is required.

## Out of Scope

- Removing legacy key-management APIs used outside repair.
- Migrating all Managed Site Type Adapters.
- Changing saved account data.

## Comments

2026-08-11: Removed legacy repair group/token result fields, numeric token-ID
identity, the old coverage helper, and the repair-created token import module
name. Strict scoped searches are clean; shared non-repair key-management and
managed-site batch-import contracts remain intact.
