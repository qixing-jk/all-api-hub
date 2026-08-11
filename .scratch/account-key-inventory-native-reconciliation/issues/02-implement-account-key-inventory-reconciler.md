# Implement the Provider-Neutral Account Key Inventory Reconciler

Status: resolved

Blocked by: 01

## Objective

Implement `reconcileAccountKeyInventory` as the single deep module for one
account's complete inventory comparison and safe sequential provisioning.

## Scope

- Load all scopes and pages through an injected fake or real account key
  resource session.
- Stop before mutation when scope or resource inventory is incomplete.
- Consume explicit requirements and placements without inspecting display
  fields or provider labels.
- Compute covered, missing, invalid, ignored, and unknown resources.
- Provision missing requirements sequentially with cancellation checks.
- Reconcile an uncertain create with at most one read-only refresh and keep
  coverage separate from exact creation provenance.
- Preserve optional default-key rename results without changing valid coverage.
- Return deterministic per-requirement and per-resource results.

## Acceptance Criteria

- Tests exercise only the `reconcileAccountKeyInventory` public function and
  result using the neutral fake session from Ticket 01.
- Complete-empty, partial, multi-scope, multi-page, duplicate-ref, cursor-cycle,
  cancellation, blocked requirement, and unknown-placement cases are covered.
- Mixed applied/rejected/uncertain creates continue sequentially where safe and
  produce an aggregate partial result without replaying uncertain writes.
- An uncertain create may produce `covered-after-uncertain` but never an exact
  `createdRef`.
- Provider names, token fields, numeric IDs, storage, UI, and managed-site
  modules are absent from the reconciler.

## Validation

- Run the focused reconciler suite and related native-resource inventory tests.
- Run `pnpm compile`.

## Out of Scope

- Production Adapter behavior.
- Cross-account scheduling and progress persistence.
- Invalid-resource deletion and managed-site import execution.

## Comments

2026-08-11: Implemented the provider-neutral reconciler and global fail-closed
rules, including refreshed-inventory handling after uncertain creates. The
focused reconciler suite passes 15/15.
