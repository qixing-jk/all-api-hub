# Deliver Check-in Method Discovery and Selection

Status: ready-for-agent

Blocked by: 03

## Objective

Let account onboarding and explicit redetection discover all safe candidates, automatically select a unique result, and preserve manual overrides without making ordinary refresh enumerate methods.

## Scope

- Implement the Module `discover` and `setSelection` use cases and deepen the compatibility `refreshSelectedStatus` implementation over the existing registry.
- Move each available read-only `detect`/`getStatus` operation behind its registry Adapter in this ticket. Ticket 05 owns mutation ordering, certainty, and retry rather than first introducing these status readers.
- Keep the provider Adapter Interface to `detect`, optional `getStatus`, and `checkIn`; do not expose Adapters to UI, refresh, or scheduler callers.
- Run only bounded, read-only automatic detection with a per-Adapter timeout and an account-level deadline.
- Integrate full discovery at the shared account auto-detection completion seam and the explicit redetect action.
- Reuse a status observation returned during detection rather than requesting it again in the same invocation.
- Make routine account refresh selected-only and prevent it from changing selection mode or method ID.
- Preserve an existing usable selection when discovery becomes ambiguous or an unrelated candidate is unknown.
- Allow automatic mode to switch only when the old method is authoritatively unsupported and exactly one replacement is matched; manual mode remains stale until the user acts.
- Add the minimal AccountDialog controls for current method, manual override, restore automatic, and redetect.
- Discovery and selection must not enable automatic execution as a side effect; V7 defaults and migrated intent are already owned by Ticket 03.

## Acceptance Criteria

- Unique matched, including matched-but-disabled, creates an automatic selection.
- Multiple matched candidates are ambiguous and do not create a new selection.
- Matched plus unknown is incomplete and does not create a new selection.
- Unsupported requires authoritative results for every current candidate.
- Manual selection survives refresh and every rediscovery result.
- Registry additions derive `rediscoveryRecommended` without background endpoint scanning or loss of the existing selection.
- A selected 404/405 updates only that method and never discovers or executes an alternative in the same operation.
- Passive flows never issue POST.
- A matched method without `getStatus` remains selected and is not reclassified as unsupported; ordinary refresh leaves its Status unchanged without issuing a mutation.
- A pre-existing provider without safe Detection may retain `compatibility_registration` evidence; new method registrations may not use that source.
- Disabled accounts may perform a user-initiated read-only redetection or reconciliation, but the scheduler remains disabled.

## Tests

- Cover the complete discovery and selection transition matrix with fake Adapters.
- Extend account auto-detection completion tests for unique, ambiguous, unsupported, unknown, timeout, and same-invocation status reuse.
- Extend AccountDialog tests for manual sticky behavior, restore automatic, stale selection, disabled account redetection, and stale-draft ownership.
- Cover selected-only routine refresh and prove no candidate enumeration occurs.
- Cover a matched selected Adapter without `getStatus`: refresh performs no mutation, preserves the selection, and does not derive unsupported.

## Telemetry Decision

Add controlled discovery and selection actions with trigger, Decision, candidate count, selection source, and recovery action only. Do not record method endpoints, host, URL, account identity, backend messages, or credentials.

## Validation

- Run Vitest related to the Module, auto-detection completion, account refresh, AccountDialog, and analytics sanitizer.
- Run `pnpm compile` and `pnpm run i18n:extract:ci` for typed shared surfaces and new UI copy.

## Out of Scope

- Mutation-based passive detection.
- Arbitrary user-defined HTTP requests.
- Background discovery by the scheduler.

## Comments
