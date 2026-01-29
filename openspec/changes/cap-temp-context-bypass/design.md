## Context

The extension uses a “temp window/tab” flow to bypass protection pages and replay network requests with the browser’s cookies. The background `tempWindowPool` creates (or reuses) a temporary context per origin and waits until it is “ready” before performing `ContentPerformTempWindowFetch`.

Today, readiness is gated only by a Cloudflare challenge detector (`ContentCheckCloudflareGuard`). Some relay sites use CAP (cap.js) checkpoint pages instead of Cloudflare. CAP pages can block access until the user completes a proof-of-work widget and the site sets `__cap_clearance`. Without CAP awareness, the temp context can be marked ready too early and fetch replays fail repeatedly.

Key constraints:
- The temp context should behave like a real user tab/window and rely on stable mechanisms (no reverse-engineering PoW).
- The change must be scoped to temp contexts, keeping normal browsing unaffected.
- Browser differences (Chromium vs Firefox) should not require new privileged APIs.

## Goals / Non-Goals

**Goals:**
- Detect CAP checkpoint pages inside the temp context.
- Best-effort auto-start CAP verification in a stable way:
  - Simulate a click on the CAP widget UI (prefer an inner shadow-root target when available)
- Require BOTH CAP and Cloudflare to be cleared before the temp context is considered ready.
- Keep the existing polling and timeout model in `waitForTabComplete`.
- Provide unit tests for the CAP guard detection and auto-start throttling.

**Non-Goals:**
- Implement CAP proof-of-work solving in the extension (no PoW cracking).
- Add new UI surfaces beyond the existing shield-bypass prompt toast.
- Change the temp-window fallback decision logic in `utils/tempWindowFetch.ts` (this change only affects readiness once the temp context is opened).

## Decisions

1) **Add a dedicated CAP guard runtime action and handler**
- Add `RuntimeActionIds.ContentCheckCapGuard`.
- Implement a content handler that:
  - Detects CAP checkpoint pages (DOM-based markers)
  - Attempts to “start” the widget once per `requestId` (throttled)
  - Returns `{ passed, detection }` consistent with the Cloudflare guard handler.

*Alternatives considered:*
- A combined “check all guards” action. Rejected for this change to keep routing simple and aligned with the existing Cloudflare process.

2) **Run CAP and Cloudflare checks concurrently**
- In `waitForTabComplete`, when `tab.status === "complete"`, send both messages concurrently using `Promise.allSettled`.
- Compute readiness as `capPassed && cloudflarePassed`.
- Treat failures/no-response as not passed and continue polling until timeout.

*Rationale:* This preserves the current polling structure and avoids serial latency.

3) **Auto-start CAP via stable, user-like interactions**
- Simulate a click on the CAP widget UI (prefer an inner shadow-root target when present).
- Throttle attempts by `requestId` to avoid spamming repeated calls during the polling loop.

*Rationale:* This avoids brittle protocol implementations while still improving “hands-off” success via the same interaction a user would perform.

## Risks / Trade-offs

- **[Programmatic clicks may not count as a user gesture]** → CAP might still require manual interaction. Mitigation: rely on the existing shield-bypass prompt toast and keep polling until the user finishes.
- **[False positives when a site embeds `<cap-widget>` for unrelated reasons]** → Might delay readiness unnecessarily. Mitigation: use conservative detection heuristics and include reasons in logs for diagnosis.
- **[Content script isolation differences]** → `solve()` may not be callable in some browsers. Mitigation: fall back to click simulation and manual completion.
