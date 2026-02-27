## Context

The extension uses a “temp window/tab” (tempContext) flow to re-issue certain API requests in a real browser page context. This can recover requests when the upstream response is actually a WAF/challenge/login page that requires browser state (cookies, JS execution, redirects) before API access succeeds.

Today, the fallback is eligible for common HTTP failures (notably 401 and 429). In practice, many 401/429 responses are *not* recoverable via a browser context (invalid credentials, real rate limiting), so auto-triggering tempContext creates unnecessary user disturbance and can hide the real remediation (fix token/cookie, wait, etc.).

This change focuses on reducing false positives while preserving recovery for the cases where 401/429 are “disguised HTML pages”.

Constraints / notes:
- The decision pipeline is shared across many API calls (`fetchApi*` → `executeWithTempWindowFallback`), so changes must be conservative and low-risk.
- We want a low-cost signal. Reading full response bodies is expensive and may consume streams; this design uses response headers only.

## Goals / Non-Goals

**Goals:**
- Reduce tempContext auto-triggers caused by plain 401/429 API errors.
- Preserve recoverability when a 401/429 response is actually an HTML challenge/login page returned while JSON is expected.
- Make “real rate limiting” easy to identify and avoid escalating (429 + `Retry-After`).
- Keep per-request allowlist overrides usable for site/endpoint-specific needs.

**Non-Goals:**
- Implement new WAF detection via DOM/body parsing in the primary fetch path.
- Add new user-facing UI flows (dialogs/buttons) as part of this change.
- Change the tempContext readiness checks (CAP/Cloudflare) or tempContext lifecycle behavior.

## Decisions

### Decision: Use header-only “response sniffing” for 401/429 when JSON is expected

**Approach**
- In the shared low-level request helper (`apiRequest`), when `responseType === "json"` and `response.ok === false`:
  - If `status === 429` and the `Retry-After` header is present, keep classification as `HTTP_429` (treat as real rate limiting).
  - Else, if `status` is `401` or `429` and the `Content-Type` header indicates HTML (e.g., `text/html`, `application/xhtml+xml`), classify the error as `CONTENT_TYPE_MISMATCH` while keeping the original HTTP status code for diagnostics.
  - Otherwise, keep existing HTTP-based codes (`HTTP_401`, `HTTP_429`, etc.).

**Rationale**
- The strongest low-cost signal that a response is “not the API” is `Content-Type: text/html` when the caller expects JSON.
- Header-only logic avoids consuming response streams and avoids performance regressions.
- `Retry-After` is a strong counter-signal for real rate limiting; we should not open tempContext in that case.

**Alternatives considered**
- Parse the body snippet to detect known challenge templates. Rejected for cost/complexity and stream-consumption risks.
- Keep 401/429 in the default fallback allowlist and add more heuristics in `shouldUseTempWindowFallback`. Rejected because the classification should happen as close to the HTTP response as possible, and allowlists remain the simple policy surface.

### Decision: Tighten the default fallback allowlist to avoid plain 401/429 triggers

**Approach**
- Update the global default fallback allowlist to remove direct 401/429 triggers, relying on:
  - `HTTP_403` (existing high-signal for WAF blocks in many deployments), and
  - `CONTENT_TYPE_MISMATCH` (now also covers disguised 401/429 HTML responses for JSON requests).
- Leave per-request overrides unchanged so a specific site/endpoint can explicitly opt into 401/429 fallback if needed.

**Rationale**
- The default should be conservative to minimize user disturbance.
- With the new classification, the “recoverable 401/429” cases become `CONTENT_TYPE_MISMATCH`, so we do not lose functionality.

**Alternatives considered**
- Keep 401/429 in defaults but add cooldowns/throttles. Rejected as it still auto-triggers in unrecoverable cases, just less often.

## Risks / Trade-offs

- [Risk] Some servers may return JSON with a non-JSON `Content-Type` (e.g., `text/plain`) for 401/429, causing missed recovery.
  - → Mitigation: Keep this change conservative (HTML-only). Use per-request overrides for known backends, and consider a future body-sniff opt-in for specific sites.
- [Risk] Some WAFs may return HTML with `Content-Type: application/json` (misleading header), so we may still miss recovery.
  - → Mitigation: Out of scope for this version; would require body sniffing or other signals.
- [Risk] Tightening the default allowlist could reduce recovery for legacy sites that previously relied on 401/429 triggers without HTML content-type mismatch.
  - → Mitigation: Provide a clear per-request override mechanism; validate against known flows (e.g., LDOH already uses 403-only).

## Migration Plan

1. Implement the 401/429 header sniffing in the shared request helper and add focused unit tests.
2. Tighten the default temp-window fallback allowlist to remove plain 401/429 triggers and adjust unit tests accordingly.
3. Monitor for regressions on sites that previously relied on fallback; add targeted per-request overrides if needed.
4. Rollback: revert allowlist tightening and/or the header sniffing; no data migrations required.

## Open Questions

- Which exact `Content-Type` values should count as “HTML” (strict `text/html` only vs include `application/xhtml+xml`)? The design assumes both.
- Do we need an explicit metric/log tag to distinguish “429 real rate limit” from “429 HTML disguised challenge” for debugging?
