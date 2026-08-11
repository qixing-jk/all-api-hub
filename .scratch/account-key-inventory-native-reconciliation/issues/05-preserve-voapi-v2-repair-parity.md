# Preserve VoAPI v2 Native Repair Parity

Status: resolved

Blocked by: 04

## Objective

Move VoAPI v2's currently eligible repair behavior behind the native session so
legacy repair code can later be removed without silently dropping the provider.

## Scope

- Implement VoAPI v2 account key resource inventory, refs, requirements,
  placement, native default creation, and runtime-key resolution.
- Preserve its current finite-quota/default constraint.
- Preserve explicit group-selection and available-group behavior.
- Preserve inventory-refetch creation recovery and secret resolution.
- Normalize placement gaps and mutation uncertainty without New API-specific
  fallback in shared orchestration.
- Add registry parity coverage that derives the eligible-provider set from
  capabilities.

## Acceptance Criteria

- VoAPI v2 passes the same provisioning and runtime resolver contracts as the
  other eligible providers.
- Current repair-eligible registry membership is fully represented by native
  provisioning before repair runner cutover.
- A future newly eligible provider makes the parity test fail until it exposes
  the required native facet or an explicit skip policy.
- No provider-specific branch is added to the reconciler.

## Validation

- Run VoAPI v2 provisioning, key-management, native-resource, registry, and
  reconciler-related Vitest suites.
- Run `pnpm compile`.

## Out of Scope

- Expanding repair eligibility to other providers.
- Removing legacy callers.

## Comments

2026-08-11: Implemented VoAPI v2 native pagination, multi-requirement coverage,
strict placement handling, finite-quota input blocking, exact mutations, and
runtime reveal. Focused adapter and service tests pass.
