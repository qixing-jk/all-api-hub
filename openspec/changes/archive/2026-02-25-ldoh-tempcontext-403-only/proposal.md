## Why

The current LDOH request/refresh flow may trigger `tempcontext` (temporary browsing context/window) not only on `403`, but also on `401` (unauthenticated) and `429` (rate limited). This causes unnecessary and noisy side effects, and typically does not help for `401`/`429`.

Restricting `tempcontext` usage to `403` only (more likely to represent an access block/challenge) makes the behavior more predictable and reduces unintended triggers.

## What Changes

- Narrow the LDOH request fallback behavior: only consider the `tempcontext` path when the response status is **HTTP 403**.
- **HTTP 401**: treat as “not logged in / session invalid”, and treat the LDOH site list as unavailable; MUST NOT trigger `tempcontext`.
- **HTTP 429**: treat as rate limiting; refresh fails safely (may be retried later); MUST NOT trigger `tempcontext`.
- Add/update tests to ensure `401/429` never create or reuse `tempcontext`, while preserving existing caching/UI behavior.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `ldoh-site-lookup` - Refine LDOH site list request error handling: only `403` may trigger `tempcontext`; `401/429` must not.

## Impact

- Affects LDOH site list fetch + cache refresh logic (error branches and retry strategy).
- Affects when `tempcontext` is created/reused and any related logs/prompts.
- Expected impacted areas include the LDOH request wrapper, the `tempcontext` service, and tests around LDOH behavior and conditional UI.
