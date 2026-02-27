## Why

Some supported sites require a Cloudflare Turnstile verification on the check-in page before the server will accept a check-in request. Today, auto check-in can fail on these sites with errors indicating a missing Turnstile token, reducing reliability and forcing users to manually intervene.

## What Changes

- Add a best-effort fallback for auto check-in when a site requires Cloudflare Turnstile verification (e.g. “missing Turnstile token” / “Turnstile verify failed” messages).
- Reuse the existing temporary browsing context (“temp context”) to open a real page that can render Turnstile, then:
  - wait until protection guards are cleared (Cloudflare challenge pages + CAP checkpoints),
  - attempt user-like interactions (stable clicks) to start Turnstile verification,
  - wait for a token to appear, and replay the protected API request in the same tab/context.
- Do **not** implement any cracking/bypass, proof-of-work solving, protocol reverse-engineering, or third-party captcha services; the flow is strictly best-effort and user-like.
- If a token cannot be obtained within a bounded timeout, fail gracefully with an actionable message so users can complete verification manually.

## Capabilities

### New Capabilities
- `temp-window-fallback`: Add an on-demand “Turnstile-assisted temp-context fetch” variant that can append a Turnstile token to a request before replaying it.

### Modified Capabilities
- `auto-checkin`: For `new-api` provider, detect Turnstile-required failures and perform a best-effort temp-context assisted retry (with an optional single incognito/private retry for multi-account edge cases).

## Impact

- Auto check-in provider pipeline and result/status reporting (background).
- Temp context orchestration, readiness polling, and content-script interactions (cross-browser MV3/MV2 considerations).
- User-facing messaging (i18n) for Turnstile-related failures and guidance.
- Tests covering Turnstile detection/guard behavior and the auto-checkin fallback path.
