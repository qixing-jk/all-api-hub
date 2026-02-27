## Why

The temp-window fallback currently auto-triggers on common HTTP errors like 401 and 429, which can open temporary windows/tabs in situations that are not recoverable via browser context (e.g., invalid credentials or real rate limiting). This creates user-facing noise and can mask actionable root causes.

## What Changes

- Tighten the default temp-window fallback trigger criteria to reduce false positives for 401/429 while preserving recovery for genuine WAF/challenge cases.
- Add a lightweight “response sniff” for non-OK responses when JSON is expected:
  - Treat 401/429 responses that clearly return HTML as `CONTENT_TYPE_MISMATCH` so they remain eligible for recovery when a challenge/login page is returned instead of API JSON.
  - Treat 429 responses with `Retry-After` as a real rate-limit signal (not a challenge) to avoid opening temp contexts unnecessarily.
- Keep per-request/endpoint overrides supported so site-specific flows can opt into more aggressive behavior when justified.
- Add/adjust unit tests to cover the new classification and the updated default fallback behavior.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `temp-window-fallback`

## Impact

- Affects shared API request plumbing (error classification for non-OK JSON requests) and the default temp-window fallback allowlist/decision behavior.
- Reduces user disturbance (fewer unexpected temp windows/tabs), especially during unauthenticated and rate-limited states.
- Requires updates to unit tests around temp-window fallback matching and API error classification.
