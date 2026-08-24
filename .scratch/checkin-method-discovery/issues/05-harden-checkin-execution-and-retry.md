# Harden Selected Check-in Execution and Retry

Status: resolved

Implementation progress: complete

Blocked by: 03, 04

## Objective

Make the scheduler execute only the selected method and distinguish retryable failure from skipped, already-checked, and uncertain outcomes without introducing a generic mutation journal.

## Scope

- Deepen the compatibility `executeSelected` use case and move eligibility, selected-method resolution, status-first orchestration, account revalidation, and retry classification behind it.
- Replace the provider result's single failed bucket with a discriminated execution result:
  - success/already checked;
  - failed with explicit `retryable`;
  - skipped with a controlled reason;
  - uncertain with bounded reconciliation status.
- Make the scheduler retry queue accept only `failed && retryable`.
- Never send uncertain results, unsupported, disabled, authentication-required, identity-mismatch, or skipped outcomes into ordinary retry.
- Reuse the authoritative status readers moved behind the New API, Veloera, WONG, and VoAPI v2 registry Adapters by Ticket 04.
- Keep AnyRouter as a documented compatibility exception because its apparent status operation is the mutating sign-in POST.
- Introduce status-first for each existing Adapter only when its protocol evidence supports authoritative readback; otherwise preserve its current compatibility behavior and classify conservatively.
- Perform at most one bounded read-only reconciliation after an uncertain POST when an authoritative status reader exists.
- Do not add a generic operation journal. Future automatic Adapters must prove same-day idempotency/uniqueness, authoritative readback, or introduce a separately designed operation guard.

## Acceptance Criteria

- Scheduler and retry code never resolve Adapters or reconstruct eligibility rules directly.
- Ordinary refresh and execution access only the selected method.
- An uncertain POST is never blindly replayed in the same cycle or through ordinary retry.
- Reconciliation `checked` converges to applied; unknown remains uncertain.
- Reconciliation `not_checked` does not cause another POST in the same cycle. A later run may POST only when that Adapter has documented idempotency/readback evidence and begins status-first.
- For existing compatibility providers without pinned idempotency evidence, uncertain never retries inline or enters ordinary retry during the live execution. Document the residual crash/re-entry risk rather than claiming a cross-worker no-replay guarantee that the first release cannot prove.
- Existing providers preserve their current user-visible behavior while moving through compatibility Adapters.
- A selected matched method without `getStatus` remains executable; it skips status-first and read-only reconciliation, and an uncertain result never enters ordinary retry.
- Remote success plus local status persistence failure remains a confirmed remote result and does not retry POST.
- No generic operation journal or speculative retry counters are persisted.

## Tests

- Extend scheduler tests for selected-only execution, every skip category, typed retry admission, no inline or ordinary retry for uncertain, and local persistence failure.
- Add Adapter contract tests for status-first ordering and same-cycle status reuse where supported.
- Prove AnyRouter passive paths never call its mutating sign-in endpoint.
- Prove a selected AnyRouter account executes through `checkIn` without `getStatus`, while an uncertain result is not reconciled or retried automatically.
- For certainty-aware Adapters, cover extension worker re-entry by proving the next execution begins with authoritative status. For legacy compatibility Adapters, characterize rather than conceal the remaining crash window.

## Telemetry Decision

Add controlled execution outcome, retryability, reconciliation outcome, and local durability categories. Never record raw provider messages, URLs, identities, or response bodies.

## Validation

- Run Vitest related to the Module, scheduler, storage, every changed provider, and product analytics.
- Run `pnpm compile` because the result union is a shared contract.

## Comments

- 2026-08-24: PR #1350 moved ordinary refresh and scheduler execution onto the selected method, added status-first execution for providers with safe readback, kept AnyRouter out of passive mutation paths, improved skipped/readiness classification, and preserved confirmed remote success when local status persistence fails. Remaining work includes the complete certainty-aware execution union, bounded uncertain reconciliation and retry admission contract, and the corresponding telemetry and worker re-entry coverage.
- 2026-08-24: Added a bounded retry-safety slice without reducing first-attempt availability. Initial daily and user-triggered runs retain best-effort status readback, while automatic retries require a fresh authoritative status before another mutation. A temporary readback failure performs no mutation but stays queued within the configured attempt limit. Newly produced failures persist an explicit retryability decision; authentication/permission failures and methods without safe status readback do not enter automatic retry, and pre-contract persisted failures keep their historical compatibility behavior. The complete uncertain/reconciliation result union remains open.
- 2026-08-24: Completed the certainty-aware execution contract. Mutation transport lifecycle evidence now distinguishes lost post-dispatch results as uncertain; the selected-method use case performs at most one read-only reconciliation, converges authoritative checked state to success, and never replays unresolved results inline. Persisted account results distinguish failed, skipped, and uncertain states; only failed results with an explicit safe retry decision enter the ordinary queue, while pre-contract failed records retain compatibility. AnyRouter remains executable without passive status reads and never retries an uncertain result. Confirmed remote success survives local method-status persistence failure with a controlled durability marker. Aggregate telemetry records only controlled outcome, retryability, reconciliation, and durability counts. The residual MV3 crash window before an uncertain compatibility-provider result is persisted remains documented; no generic mutation journal was added.
