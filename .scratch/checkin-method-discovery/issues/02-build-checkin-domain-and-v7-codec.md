# Build the Check-in Domain Module and Dormant V7 Codec

Status: resolved

Blocked by: 01

## Objective

Create the pure domain rules and V6-to-V7 codec behind the Check-in Methods Module without activating V7 persistence or changing product behavior.

## Scope

- Add the canonical V7 types for user execution intent, per-method knowledge, automatic/manual selection, and the existing independent custom check-in URL flow.
- Add strict normalization for persisted method IDs, detection evidence, partial known status, timestamps, and bounded controlled reasons.
- Implement the pure `inspect` projection that derives Decision, selection state, choices, execution eligibility, skip reason, and `rediscoveryRecommended`.
- Implement pure selection transitions for manual choice and restoring automatic selection.
- Implement discovery-result merge rules:
  - authoritative `matched` or `unsupported` replaces prior evidence;
  - temporary `unknown` does not revoke a prior definitive fact and records only the bounded latest unknown attempt;
  - a missing candidate entry remains unknown when aggregating a complete Decision.
- Add a dormant V6-to-V7 migration that maps legacy evidence through registry metadata and preserves the complete custom check-in object.
- Keep `CURRENT_CONFIG_VERSION` and all persisted writers unchanged in this ticket.

## Required Invariants

- Global discovery Decision only creates a new automatic selection; it never gates an existing still-executable selection.
- Manual selection is sticky.
- Legacy is an evidence source, not a mode or a separate structure.
- `compatibility_registration` is likewise only an evidence source for pre-existing provider behavior; it is not a second runtime path and cannot admit new methods.
- Decision, stale state, and execution eligibility are derived rather than persisted.
- No selection revision, discovery generation, capability fingerprint, generic request DSL, or operation journal is added.

## Acceptance Criteria

- The complete Decision matrix is covered, including matched plus unknown and multiple matched candidates.
- A new or unknown unrelated candidate cannot disable an existing usable selection.
- A syntax-safe unknown method ID survives normalization but is not executable.
- V6 `enableDetection: true` maps to the registered legacy method with `legacy_migration` evidence.
- V6 `enableDetection !== true` is not misrepresented as authoritative unsupported.
- `autoCheckInEnabled` and every existing `customCheckIn` field preserve their semantics.
- Migration and normalization are deterministic and idempotent.
- No runtime path emits V7 yet.

## Tests

- Add focused pure-module tests for the Decision and selection matrices.
- Add migration fixtures for every registered legacy provider, disabled accounts, auto execution off, missing provider mappings, legacy daily status, and custom check-in preservation.
- Add property-oriented table tests for malformed map keys and controlled timestamp/status coercion without freezing the entire object graph.

## Validation

- Run Vitest related to the new domain module, registry, account defaults, and account migration.
- Run `pnpm compile` for the shared type additions.

## Rollback

Fully reversible while the codec remains dormant and `CURRENT_CONFIG_VERSION` is unchanged.

## Comments
