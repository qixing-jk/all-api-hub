## Why

Some target relay sites (e.g. `https://api.ouu.ch/`) use CAP (cap.js) checkpoint pages instead of Cloudflare. The current temp-context (“shield”) readiness gate only checks Cloudflare, so a temp tab/window can be treated as “ready” while it is actually stuck on a CAP checkpoint page. This causes the fallback request to run before the browser has earned the required `__cap_clearance` cookie, leading to repeated 401/403/429 failures and a poor user experience.

## What Changes

- Add CAP checkpoint detection in the temp-context content script, similar to the existing Cloudflare detection.
- When CAP is detected, attempt a best-effort “auto start” using stable, user-like interaction (simulate a click on the CAP widget UI). If CAP still requires user interaction, keep the existing user-facing prompt in the temp tab/window and wait for the user to complete the checkpoint.
- Update the background temp-context readiness gate to require BOTH:
  - Cloudflare challenge is passed (or not present)
  - CAP checkpoint is passed (or not present)
  The two checks run concurrently to keep the existing polling loop responsive.
- Add unit tests for CAP detection and auto-start throttling, plus a small unit-testable helper for background guard result aggregation.

## Capabilities

### New Capabilities
- `temp-window-fallback`: Extend the protection bypass readiness gate for temp contexts to include CAP checkpoint handling alongside Cloudflare.

### Modified Capabilities
- (none)

## Impact

- Background: `entrypoints/background/tempWindowPool.ts` (temp-context readiness gating)
- Content: `entrypoints/content/messageHandlers/**` (new CAP guard check handler + detection utility)
- Shared: `constants/runtimeActions.ts` (new runtime action identifier)
- Tests: new unit tests under `tests/` for CAP guard logic
