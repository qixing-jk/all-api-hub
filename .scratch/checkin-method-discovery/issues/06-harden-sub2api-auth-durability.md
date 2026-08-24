# Harden Sub2API Authentication Durability

Status: resolved

Blocked by: 03

## Objective

Ensure a Sub2API check-in can never persist credentials for the wrong same-origin account and never proceeds to its business POST with unpersisted rotated credentials.

## Scope

- Deepen `Sub2ApiAuthSession` persistence from a boolean into typed outcomes for persisted, account missing, identity mismatch, and write failure.
- Require expected normalized origin and expected account identity on credential updates.
- Re-read the latest account inside the account storage lock before applying updates.
- Validate refreshed or resynced credentials against the expected user identity before writeback.
- Make browser-session resync reject another user on the same origin.
- Return and preserve the complete usable credential set: access token, refresh token, expiry, and user ID. When resync omits supplemental refresh/expiry values, preserve the latest valid stored values.
- Persist a rotated access/refresh token set atomically before any later check-in POST; persistence failure stops the flow with a controlled result.
- Preserve the existing per-account auth serialization and one bounded 401 recovery policy.
- Treat a lost refresh-token response as an uncertain credential mutation: do not blindly replay the old refresh token; attempt only identity-checked recovery.

## Acceptance Criteria

- Same-origin different-user browser credentials never update the account.
- Account deletion or identity change during a request produces a typed non-success result.
- Rotated credentials are durably stored before a caller can continue to a business mutation.
- A persistence failure is observable and cannot be mistaken for durable success.
- Supplemental refresh/expiry data is neither erased nor copied from a different account.
- Existing non-check-in Sub2API callers remain compatible with the deeper auth Module contract.

## Tests

- Extend `sub2apiAuthSession`, token refresh/resync, Sub2API request, and account storage tests for expected identity/origin, deletion races, complete rotation persistence, preservation of supplemental auth, and failed persistence.
- Add a test proving a business callback is not invoked after rotated-token persistence failure.
- Use fake identities, tokens, and reserved example origins only.

## Telemetry Decision

Reuse or add only controlled identity-mismatch and credential-durability categories. Do not record identities, origins, tokens, cookies, backend messages, or response bodies.

## Validation

- Run Vitest related to every changed Sub2API auth and account-storage file.
- Run `pnpm compile` because the auth port is shared by multiple account operations.

## Comments

- 2026-08-22: Resolved by PR #1343. Credential updates now validate normalized origin and account identity under the account-storage lock, preserve complete rotated credential state, expose deletion/mismatch/write failures, and stop downstream business callbacks when rotated credentials cannot be persisted. Focused auth/storage coverage, compile, lint, locale extraction, the full Vitest suite, and PR CI passed.
