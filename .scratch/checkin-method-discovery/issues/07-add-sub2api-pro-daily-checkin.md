# Add the Sub2API Pro Daily Check-in Method

Status: resolved

Blocked by: 04, 05, 06

## Objective

Register and execute the verified `sub2api-pro:daily-checkin` protocol through the shared Check-in Methods Module with strict parsing, status-first execution, and bounded reconciliation.

## Scope

- Register `sub2api-pro:daily-checkin` for Sub2API candidates without declaring that every Sub2API deployment supports it.
- Implement strict parsing for:
  - `GET /api/v1/redeem/checkin/status`;
  - `POST /api/v1/redeem/checkin`;
  - `{ code, message, data }` success envelopes;
  - HTTP 403/409 error envelopes whose numeric top-level `code` is the HTTP code and whose stable machine reason is the top-level `reason` string.
- Treat only GET as passive detection. Do not probe aliases or `/api/v1/check-in`.
- Map 404/405 to authoritative unsupported; authentication, permission, timeout, network, and invalid-response cases to controlled unknown unless the pinned protocol proves a stronger result.
- Select a unique matched-but-disabled method while preventing execution.
- Execute GET status first, allow at most one POST that can reach the business handler for authoritative enabled/not-checked status, then perform one bounded GET reconciliation after an uncertain POST. A JWT-middleware-confirmed pre-handler 401 may be followed by one identity-checked recovered POST.
- Rely on the pinned server transaction, per-user/day uniqueness, duplicate 409, and matching status readback. Do not add a generic operation journal.
- Persist no raw reward amount in account configuration and do not infer a currency unit.
- Add a concise source comment near protocol parsing/execution with the pinned upstream fork and commit contract.

## Acceptance Criteria

- Detection never sends POST and does not guess deployment support from Site Type, host, product text, or loose fields.
- HTTP success with non-zero business `code` is not success.
- Strict DTO validation rejects malformed booleans, non-finite numeric ranges, reversed reward bounds, and missing required success fields.
- Disabled, already checked, role forbidden, authentication failure, unsupported, invalid response, and uncertain transport each map to the documented controlled result.
- Rotated credential persistence succeeds before POST or execution stops.
- Reconciliation checked converges to applied; unknown remains uncertain; not-checked never reposts in the same cycle.
- An authoritative not-checked reconciliation may become `failed + retryable`; the later retry still begins with GET and sends at most one POST capable of reaching the business handler only if it remains not checked.
- A later run always begins with GET status, so an applied request whose response was lost does not duplicate the daily reward.
- New Sub2API accounts with a registered candidate default to account-level automatic execution on; discovery and method readiness still gate execution, and users can disable the account explicitly.

## Tests

- Add parser and Adapter tests for every documented status/error envelope and transport certainty boundary.
- Prove same-cycle status reuse, status-first ordering, at most one handler-reaching POST, no ordinary retry for unresolved uncertain, and no alias fallback.
- Cover GET-stage 401 and POST-stage middleware 401 separately; only the latter may produce one recovered POST after identity validation and durable credential persistence.
- Cover identity mismatch and rotated-token persistence failure through the real auth-session seam with controlled fakes.
- Use placeholder hosts and credentials; the real protocol name and pinned source are required only for this verified integration contract.

## Telemetry Decision

Report only the allow-listed method category and controlled discovery/execution/reconciliation result enums. Do not report endpoint paths, host, account identity, raw reason/message, reward, balance, or credentials.

## Validation

- Run Vitest related to the new Adapter, Sub2API transport/auth, Check-in Methods Module, scheduler, and analytics sanitizer.
- Run `pnpm compile` and any affected export checks.

## Comments

- Implemented strict Sub2API Pro status/mutation parsing, status-first execution,
  bounded reconciliation, durable auth recovery, privacy-safe method telemetry,
  and registry integration.
- Added focused parser, transport/auth, Adapter, scheduler, compatibility-default,
  and analytics tests. New Sub2API accounts opt into automatic execution when the
  candidate is registered, while discovery and method readiness remain the
  execution gate.
