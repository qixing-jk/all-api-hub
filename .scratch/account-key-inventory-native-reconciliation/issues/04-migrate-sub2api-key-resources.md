# Migrate Sub2API Key Coverage to Native Resources

Status: resolved

Blocked by: 03

## Objective

Implement Sub2API-native account key inventory reconciliation without reducing
its group and secret semantics to New API token fields.

## Scope

- Reuse the Sub2API `/api/v1/keys` inventory, detail, create, update, delete,
  and secret behavior behind a native account key resource Adapter.
- Preserve full paginated inventory and cancellation.
- Use the provider group ID as requirement identity and group name only as a
  display label.
- Classify a key with a group ID but missing joined group data as unknown or
  incomplete, not ungrouped or missing.
- Map genuinely ungrouped keys explicitly.
- Normalize native create outcomes and correlate exact refs or created secrets
  when the response proves them.
- Implement exact ref runtime-key resolution with Sub2API-native secret reads.

## Acceptance Criteria

- Tests cross the provisioning and runtime resolver public seams.
- Duplicate group names cannot collapse distinct provider group IDs.
- Missing joined group data blocks writes for the affected incomplete
  inventory.
- Multi-page inventories are complete before reconciliation can create.
- Existing Sub2API eligibility and available-group behavior remain intact.
- No Sub2API route or group-ID knowledge appears in the reconciler or repair
  runner.

## Validation

- Run Sub2API key-management, token-provisioning, parsing, native resource, and
  reconciler-related Vitest suites.
- Run `pnpm compile`.

## Out of Scope

- Changing Sub2API authentication or account onboarding.
- Managed-site target Adapter changes.

## Comments

2026-08-11: Implemented Sub2API-native group-ID requirements, paginated key
inventory, exact mutations, and runtime resolution without collapsing duplicate
display names. Focused adapter and service tests pass.
