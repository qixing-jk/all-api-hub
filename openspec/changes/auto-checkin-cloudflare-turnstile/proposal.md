## Why

Some supported sites require a Cloudflare Turnstile verification on the check-in page before the server will accept a check-in request. Today, auto check-in can fail on these sites with errors indicating a missing Turnstile token, reducing reliability and forcing users to manually intervene.

## What Changes

- Add a best-effort fallback for auto check-in when a site requires Cloudflare Turnstile verification (e.g. missing Turnstile token).
- Reuse the existing temporary browsing context (“temp context”) to load the site check-in page and run a content script that attempts user-like interactions (such as clicking a Turnstile widget) to start verification.
- Do **not** implement any cracking/bypass, proof-of-work, or protocol reverse-engineering; the flow is strictly best-effort and user-like.
- Retry the check-in only after the temp context indicates verification has likely completed and the page is ready to proceed.
- If verification cannot be completed automatically, fail gracefully with an actionable status/message so users understand they may need to complete verification manually.

## Capabilities

### New Capabilities
- (none)

### Modified Capabilities
- `auto-checkin`: Add requirements for detecting Turnstile-required failures and performing a best-effort temp-context-assisted check-in attempt before giving up.
- `temp-window-fallback`: Extend temp-context readiness/guard checks and best-effort “auto-start” behavior to cover Cloudflare Turnstile (in addition to existing Cloudflare challenge/CAP handling).

## Impact

- Auto check-in provider pipeline and result/status reporting (background).
- Temp context lifecycle, readiness polling, and content-script interactions (cross-browser MV3/MV2 considerations).
- User-facing messaging (i18n) for Turnstile-related failures and guidance.
- Tests covering Turnstile detection/guard behavior and the auto-checkin fallback path.
