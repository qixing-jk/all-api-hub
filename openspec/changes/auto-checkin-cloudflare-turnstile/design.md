## Context

Auto check-in is executed by `services/autoCheckin/scheduler.ts`, which calls a per-site provider (for example `services/autoCheckin/providers/newApi.ts` does `POST /api/user/checkin`). In upstream New API, `POST /api/user/checkin` is protected by a Turnstile middleware which expects a Turnstile token via the `turnstile` query parameter (e.g. `/api/user/checkin?turnstile=<token>`). When missing/invalid, the server can respond with `success=false` messages such as `Turnstile token 为空` / `Turnstile 校验失败，请刷新重试！`.

This repo already contains a “temp window/tab” mechanism (`entrypoints/background/tempWindowPool.ts`, `utils/tempWindowFetch.ts`) that opens a real browser context and runs content-script helpers to bypass protection pages (Cloudflare challenge pages + CAP checkpoints) before replaying requests. Readiness gating is implemented via content-side guard checks (`RuntimeActionIds.ContentCheckCloudflareGuard`, `RuntimeActionIds.ContentCheckCapGuard`).

Turnstile is different from full-page WAF challenges: it is a page-embedded widget that produces a short-lived, single-use token which must be included in the protected request. The extension must not attempt to “solve” Turnstile (no cracking / external solvers); it can only do best-effort, user-like interactions (for example, focusing/clicking the widget) and wait for the token to be produced by the legitimate widget.

Key constraints:
- MV3 service worker (Chromium) vs MV2 background (Firefox): avoid long-running waits that keep a background context alive indefinitely.
- Security/privacy: never persist Turnstile tokens; avoid logging token values.
- Scope: keep behavior limited to the extension’s temporary contexts; do not affect normal browsing.

## Goals / Non-Goals

**Goals:**
- Detect Turnstile-required check-in failures (at least for `new-api`) and trigger a best-effort fallback instead of immediately failing.
- Reuse the existing temp-context infrastructure to open the account’s check-in page and run a content-script flow to:
  - Detect the presence of a Turnstile widget.
  - Best-effort “auto-start” the widget via stable, user-like clicks.
  - Wait for a Turnstile token to appear (when the widget can complete automatically).
- Retry the check-in request with the obtained Turnstile token attached (implementation must be compatible and safe).
- If Turnstile cannot be completed automatically, fail gracefully with an actionable message that guides the user to manual completion.
- Add tests for Turnstile detection/guard behavior and the provider fallback path.

**Non-Goals:**
- Implement Turnstile solving (no reverse-engineering, PoW cracking, or third-party captcha services).
- Add new complex UI surfaces beyond existing temp-context/shield-bypass prompts (best-effort hints only).
- Make Turnstile a mandatory readiness gate for *all* temp-window flows (avoid breaking unrelated temp-window usage).

## Decisions

1) **Introduce a dedicated Turnstile guard/token content handler (mirroring CAP)**
- Add a new runtime action (for example `RuntimeActionIds.ContentWaitForTurnstileToken` or a `ContentCheckTurnstileGuard` + `ContentGetTurnstileToken` pair).
- Implement in content script under `entrypoints/content/messageHandlers/handlers/` with shared logic in `entrypoints/content/messageHandlers/utils/`.

Rationale: Turnstile is DOM-driven and must run where the widget exists. Keeping it separate from `cloudflareGuard` avoids accidentally treating normal Turnstile widgets as “Cloudflare challenge pages”.

Alternatives considered:
- Extending `detectCloudflareChallengePage` to treat Turnstile as a “challenge”. Rejected: Turnstile can appear on normal pages and should not block generic readiness.

2) **Keep Turnstile out of the global temp-context readiness gate by default**
- Do not change `checkTempContextProtectionGuards` / `waitForTabComplete` to require Turnstile for all contexts.
- Only run the Turnstile waiting flow when the auto-checkin provider determines the check-in request failed due to Turnstile requirements.

Rationale: `tempWindowFetch` is used as a generic protection-bypass mechanism. Treating any embedded Turnstile as a blocking guard would risk delaying unrelated flows and introducing new user-visible tabs/windows.

3) **Token acquisition is best-effort (DOM-first with page-hook fallback)**
- Detect Turnstile presence via stable DOM markers:
  - `input`/`textarea[name="cf-turnstile-response"]`
  - `.cf-turnstile` containers / `data-sitekey` markers
  - Turnstile iframes/scripts (`challenges.cloudflare.com/turnstile`)
- Acquire a token via best-effort strategies (stop at the first success):
  - Read a non-empty `cf-turnstile-response` value when present (implicit rendering).
  - Inject a minimal page-world hook to capture the token from Turnstile callbacks (used by `react-turnstile`) and forward it to the content script via `window.postMessage`.
  - Observe outgoing `fetch`/XHR to `/api/user/checkin?turnstile=...` and parse the token from the request URL (when the site’s own UI performs the check-in call).
- Best-effort auto-start by simulating a click on a stable, visible widget container/iframe host, throttled per `requestId` (same pattern as `capGuard.ts`).

Rationale: Content scripts run in an isolated world and can’t reliably access page JS state. Some sites (including upstream New API’s UI) obtain the token via JS callbacks (not a hidden input), so we need a page-hook fallback for practical coverage.

4) **Provider-driven fallback: retry check-in with an acquired token**
- Extend the `new-api` auto check-in provider to recognize Turnstile-required failures via message matching (case-insensitive contains `turnstile` and a “missing token” shape).
- Fallback flow:
  1. Determine a page URL likely to render the widget:
     - Prefer `account.checkIn.customCheckIn.url` when configured.
     - Otherwise use `joinUrl(account.site_url, getSiteApiRouter(account.site_type).checkInPath)` (same logic as `utils/navigation.ts`).
  2. Use the temp-context mechanism to open that page (minimized by default) so the widget can render in a real browser environment.
  3. Ask the content script to wait for a Turnstile token (best-effort auto-start, bounded timeout).
  4. Retry `POST /api/user/checkin?turnstile=<token>` (matches upstream New API’s `TurnstileCheck()` contract and web UI behavior).
     - If a deployment is known to diverge, keep token attachment pluggable (see Open Questions).
  5. Release the temp context and return a normal provider result (`success` / `already_checked` / `failed`).

Rationale: Keeping the fallback inside the provider keeps the scheduler generic and limits Turnstile handling to the site types/endpoints that actually need it.

## Risks / Trade-offs

- **[Programmatic clicks may not count as a user gesture]** → Some Turnstile widgets may still require manual completion. Mitigation: best-effort click + short wait; return a clear failure message instructing manual check-in.
- **[False positives in detection]** → Mis-identifying a widget could cause unnecessary waits. Mitigation: conservative detection and only enabling the flow after a confirmed “missing Turnstile token” failure.
- **[Token expiry / single-use semantics]** → Tokens can expire quickly and may be single-use. Mitigation: acquire the token immediately before retrying the check-in request; keep timeouts bounded.
- **[Background lifetime constraints]** → Long waits risk MV3 service worker suspension. Mitigation: keep the Turnstile wait timeout short and implement the waiting logic in the content script where possible.

## Migration Plan

- No persistent data migration required.
- Rollout as a behavior change in auto check-in:
  - Only triggers when Turnstile-required failures are detected.
  - May open a minimized temporary tab/window briefly as part of the best-effort flow.
- Update user-facing copy (i18n) to explain why the check-in failed and how to manually complete verification when needed.

## Open Questions

- **Deployment variance:** upstream New API expects `?turnstile=<token>`. Do the impacted deployments follow upstream, or do they require a different parameter/header/body shape (for example `cf-turnstile-response`)? A redacted network trace from a successful manual check-in (URL + method + response shape; no secrets) is needed to confirm.
- **Which site types are impacted:** is this limited to `new-api`, or do other providers (for example `Veloera`, `anyrouter`) need the same fallback?
- **UX policy:** should scheduled daily runs be allowed to open a visible temp window for manual completion, or should the flow remain minimized and fail quickly when not automatic?
