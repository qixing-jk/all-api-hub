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

## Detailed Flow (Target Behavior)

This change introduces an on-demand Turnstile-assisted temp-context fetch and wires it into the `new-api` auto check-in provider.

### Provider flow (`new-api` check-in)

1. Attempt the normal check-in request: `POST /api/user/checkin`.
2. If the provider result indicates Turnstile is required (message-based heuristic), attempt a best-effort assisted retry for the same account in the same run:
   - Open the check-in page in a temp context (a real tab/window).
   - Wait for protection guards (Cloudflare + CAP) to be cleared.
   - Wait for a Turnstile token (best-effort, bounded timeout).
   - Replay `POST /api/user/checkin?turnstile=<token>` in the same temp tab so cookies + token apply together.
3. Multi-account edge case: if the assisted attempt reports `turnstile.status = not_present` and `turnstile.hasTurnstile = false`, optionally retry once more in an incognito/private temp context to avoid inheriting a different logged-in web UI user.
4. If a token still cannot be obtained, best-effort verify whether the account is already checked in today; otherwise return a failed result with an actionable message instructing manual verification (or incognito permission requirements).

### Background temp-context flow (Turnstile-assisted fetch)

1. Acquire/reuse a temp context for the origin.
2. Navigate the temp tab to the provided `pageUrl` (the page that can render Turnstile).
3. Wait for `tab.status === "complete"` and confirm both guards pass:
   - Cloudflare challenge guard is passed (or not present)
   - CAP checkpoint guard is passed (or not present)
4. Ask the content script to wait for a Turnstile token via a dedicated runtime action.
5. If a token is obtained, append it to the target `fetchUrl` as a query parameter (default key: `turnstile`) and replay the request in the same tab via `ContentPerformTempWindowFetch`.

### Content flow (wait for token)

1. Detect Turnstile presence using stable DOM markers (see Decisions below).
2. Best-effort “auto-start”:
   - If Turnstile is not yet present, attempt to click the page’s “check-in” trigger once or twice to cause the widget to render on deployments that show Turnstile lazily.
   - When Turnstile markers exist, attempt to click a stable widget container/iframe marker to start verification.
   - Auto-start attempts are throttled per `requestId` to avoid spamming repeated clicks.
3. Poll for a token in DOM fields (`cf-turnstile-response`) until timeout.
4. Return a structured result: `not_present` / `token_obtained` / `timeout`.

## Decisions

1) **Introduce a dedicated Turnstile guard/token content handler (mirroring CAP)**
- Add a new runtime action: `RuntimeActionIds.ContentWaitForTurnstileToken`.
- Implement a content handler under `entrypoints/content/messageHandlers/handlers/` with shared logic in `entrypoints/content/messageHandlers/utils/`.

Rationale: Turnstile is DOM-driven and must run where the widget exists. Keeping it separate from `cloudflareGuard` avoids accidentally treating normal Turnstile widgets as “Cloudflare challenge pages”.

Alternatives considered:
- Extending `detectCloudflareChallengePage` to treat Turnstile as a “challenge”. Rejected: Turnstile can appear on normal pages and should not block generic readiness.

2) **Keep Turnstile out of the global temp-context readiness gate by default**
- Do not change `checkTempContextProtectionGuards` / `waitForTabComplete` to require Turnstile for all contexts.
- Only run the Turnstile waiting flow when the auto-checkin provider determines the check-in request failed due to Turnstile requirements.

Rationale: `tempWindowFetch` is used as a generic protection-bypass mechanism. Treating any embedded Turnstile as a blocking guard would risk delaying unrelated flows and introducing new user-visible tabs/windows.

3) **Token acquisition is best-effort (DOM-only, no page hooks)**
- Detect Turnstile presence via stable DOM markers:
  - `input`/`textarea[name="cf-turnstile-response"]`
  - `.cf-turnstile` containers
  - Turnstile iframes/scripts (`challenges.cloudflare.com/turnstile`)
- Treat a token as “available” only when a non-empty `cf-turnstile-response` value is observed.
- Best-effort auto-start is implemented via stable, user-like clicks and is throttled per `requestId`:
  - Optional pre-trigger: click a “check-in” button/trigger on the page to cause Turnstile to render on lazy deployments.
  - Click a stable widget container/iframe marker when present.

Rationale: Keeping token acquisition DOM-only avoids brittle page-world hooks and reduces the risk surface. It also makes the behavior predictable: when a deployment does not expose a DOM token field, the flow will time out and fall back to manual verification.

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

## Runtime Contracts (Suggested)

### Background action: Turnstile-assisted temp-context fetch

- `RuntimeActionIds.TempWindowTurnstileFetch`
- Request fields (minimum):
  - `originUrl`: origin used for temp-context acquisition/reuse
  - `pageUrl`: a page URL that can render Turnstile for this flow
  - `fetchUrl`: protected API URL to replay
  - `fetchOptions`: `RequestInit` for the replayed request
  - `useIncognito` (optional): run the temp context in an incognito/private window for storage isolation (multi-account scenarios)
  - `turnstileTimeoutMs` (optional): bounded timeout for token wait
  - `turnstileParamName` (optional): query key to append (default: `turnstile`)
  - `turnstilePreTrigger` (optional): best-effort pre-trigger to render the widget on lazy deployments (e.g. click a check-in button)
- Response fields:
  - `success/status/headers/data/error` (same shape as existing temp-window fetch)
  - `turnstile: { status, hasTurnstile }` where `status` is one of `not_present | token_obtained | timeout | error`

### Content action: wait for Turnstile token

- `RuntimeActionIds.ContentWaitForTurnstileToken`
- Request fields:
  - `requestId`: required for throttling/cleanup
  - `timeoutMs` (optional): bounded timeout (suggest: default 12s; clamp to 0.5–30s)
  - `preTrigger` (optional): best-effort pre-trigger configuration for lazy widget rendering
- Response fields:
  - `success: boolean`
  - On success: `{ status, token, detection }` where `status` is `not_present | token_obtained | timeout`
  - `detection` includes `hasTurnstile` and optional diagnostic metadata (score/reasons/title/url)

## Implementation Outline (Diff vs main)

- Add runtime action IDs and routes:
  - `constants/runtimeActions.ts`
  - `entrypoints/background/runtimeMessages.ts`
  - `entrypoints/content/messageHandlers/index.ts`
  - `entrypoints/content/messageHandlers/handlers/index.ts`
- Add content-side Turnstile helpers + handler:
  - `entrypoints/content/messageHandlers/utils/turnstileGuard.ts`
  - `entrypoints/content/messageHandlers/handlers/turnstileGuard.ts`
- Add background Turnstile-assisted temp-context fetch handler:
  - `entrypoints/background/tempWindowPool.ts`
  - plus a foreground-friendly wrapper `utils/tempWindowFetch.ts`
- Wire into new-api auto check-in provider with a best-effort retry (with optional incognito/private retry) and actionable failure:
  - `services/autoCheckin/providers/newApi.ts`
  - i18n: `locales/en/autoCheckin.json`, `locales/zh_CN/autoCheckin.json`
- Shared helper:
  - `utils/url.ts` (`appendQueryParam`)
- Tests:
  - `tests/entrypoints/content/messageHandlers/utils/turnstileGuard.test.ts`
  - `tests/services/autoCheckin/providers/newApi.test.ts`

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

- **Deployment variance:** upstream New API expects `?turnstile=<token>`. Confirm whether affected deployments use the same query key or require a different parameter name/shape.
- **Token exposure shape:** some Turnstile integrations may not write tokens to `cf-turnstile-response` DOM fields. If this is common in target deployments, consider a future extension (still best-effort) that can read tokens from additional stable, non-invasive signals.
- **Which site types are impacted:** confirm whether this should remain scoped to `new-api` or be extended to other New-API-family site types.
