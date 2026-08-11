# Migrate New API Family Key Coverage to Native Resources

Status: resolved

Blocked by: 02

## Objective

Implement native account key resources, provisioning facts, and runtime-key
resolution for every currently eligible New API Adapter Family site type.

## Scope

- Reuse the current family registry and verified per-site-type key-management
  implementations behind one native resource definition.
- Encode numeric provider token IDs as opaque `AccountKeyResourceRef.resourceId`
  values without exposing numbers to shared orchestration.
- Preserve complete pagination and secret-recovery behavior.
- Map provider group identity to requirements and resource placement inside the
  family Adapter.
- Preserve explicit one-key fallback where current family behavior uses it.
- Build provider-native default create and optional template-rename commands.
- Normalize create/update/delete certainty and recover an exact ref only when
  the applied result plus bounded inventory evidence is unambiguous.
- Implement `session.runtimeKey.resolve(ref)` for recoverable resources.

## Acceptance Criteria

- Adapter contract tests run through `session.provisioning` and
  `session.runtimeKey.resolve(ref)`.
- Every currently registered New API-family account site type retains its
  routing overrides and repair eligibility.
- Group labels do not become cross-provider requirement identity by accident;
  unsupported or unavailable group facts fail closed.
- Create acknowledgement without an ID uses one bounded unambiguous recovery;
  uncertain dispatch does not claim trusted creation provenance.
- No raw family DTO reaches the reconciler, repair progress, or React.

## Validation

- Run New API-family account key resource, key-management, provisioning, and
  registry-related Vitest suites.
- Run `pnpm compile`.

## Out of Scope

- Sub2API and VoAPI v2.
- Repair runner cutover.
- Removing family key-management APIs still used outside this effort.

## Comments

2026-08-11: Implemented New API-family native inventory, provisioning,
provider-owned rename/delete behavior, exact ref recovery, and runtime secret
resolution. Focused adapter and service tests pass.
