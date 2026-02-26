## Context

The LDOH site lookup feature refreshes an authenticated site directory via `GET /api/sites` and caches it in extension storage. The refresh entrypoint is `services/ldohSiteLookup/background.ts` (`refreshLdohSiteListCache`), which calls `fetchApi` with `credentials: "include"`.

`fetchApi` is wired to a generic “temp window” fallback pipeline (`utils/tempWindowFetch.ts`). Today, the fallback trigger set includes HTTP status codes `{401, 403, 429}` and error codes `{HTTP_401, HTTP_403, HTTP_429, CONTENT_TYPE_MISMATCH}`. As a result, when LDOH returns `401` (unauthenticated) or `429` (rate limited), the system may still attempt to create/reuse a temporary browsing context (`tempcontext`) to retry the request.

For LDOH, `401` generally means the user is not logged in (or the session is invalid), and `429` is rate limiting; neither is typically recoverable by `tempcontext`. The desired behavior is to keep the LDOH flow quiet and only consider `tempcontext` on `403` (more likely to represent an access block/challenge).

## Goals / Non-Goals

**Goals:**
- For the LDOH site list request, only trigger temp-window/tempcontext fallback when the primary request fails with **HTTP 403**.
- Ensure **HTTP 401** and **HTTP 429** never trigger tempcontext operations for LDOH.
- Keep the existing default temp-window fallback behavior unchanged for all other API requests.
- Preserve the LDOH “quiet provider” behavior: no per-row network work, de-duplicated refresh, cache-first rendering.

**Non-Goals:**
- Redesigning the temp-window pool, protection-bypass heuristics, or cookie interceptor behavior.
- Changing LDOH matching logic, cache TTL, or UI affordances beyond what is required for the fallback policy.
- Introducing new external dependencies.

## Decisions

### Decision 1: Add a per-request temp-window fallback policy override

**Rationale:** The current fallback trigger set is global (`TEMP_WINDOW_FALLBACK_STATUS`/`TEMP_WINDOW_FALLBACK_CODES` in `utils/tempWindowFetch.ts`). Special-casing LDOH inside `shouldUseTempWindowFallback` would create a growing list of one-off rules. A generic per-request override keeps the mechanism reusable and avoids coupling fallback logic to specific sites/features.

**Approach:**
- Extend `FetchApiOptions` (`services/apiService/common/type.ts`) with an optional `tempWindowFallback` config, e.g.:
  - `statusCodes?: number[]`
  - `codes?: ApiErrorCode[]`
- Extend `TempWindowFallbackContext` (`utils/tempWindowFetch.ts`) to carry the optional override.
- Update `shouldUseTempWindowFallback` to use the override allowlist(s) when provided; otherwise keep using the current global defaults.

**Alternatives considered:**
- **Hard-code LDOH in `shouldUseTempWindowFallback`** by checking `context.baseUrl === LDOH_ORIGIN` and/or endpoint. Rejected due to poor scalability and increased coupling.
- **Remove 401/429 globally** from the fallback trigger set. Rejected because it would change behavior for non-LDOH flows that may legitimately rely on 401/429 fallback.

### Decision 2: Configure the LDOH request to allow fallback only for 403

**Rationale:** The change requirement is LDOH-specific: keep tempcontext for likely “blocked/challenge” cases (`403`), but avoid it for unauthenticated (`401`) and rate-limited (`429`) cases.

**Approach:**
- Update `services/ldohSiteLookup/background.ts` `fetchLdohSites()` to pass `tempWindowFallback: { statusCodes: [403], codes: [API_ERROR_CODES.HTTP_403] }` (exact shape TBD by implementation).
- Keep `refreshLdohSiteListCache()` semantics unchanged: it still returns `{ success: false, unauthenticated?: boolean, error?: string }` on failure, but 401/429 will fail without triggering tempcontext.

**Alternatives considered:**
- **Disable fallback entirely** for LDOH. Rejected because `403` is still intended to be recoverable via tempcontext.

## Risks / Trade-offs

- **[Potential behavior regression] LDOH background fetch returns 401 but tempcontext could succeed** (e.g., due to cookie SameSite constraints). → Mitigation: validate with real LDOH deployments; if this is a real case, revisit whether the policy should be “403-only” vs “403 + specific 401 subtype” (but default to the requested behavior).
- **[Policy complexity] Adding per-request overrides increases API surface area** for `fetchApi`. → Mitigation: keep the override optional, small, and default to current behavior; cover with targeted unit tests.
- **[Test brittleness] Temp-window behavior is environment-sensitive** (Firefox popup restrictions, permissions). → Mitigation: unit-test only the policy decision logic (which statuses/codes qualify) with mocks; avoid end-to-end temp-window tests unless necessary.

## Migration Plan

- No migration required. This is a backward-compatible change:
  - New override fields are optional and default to current behavior.
  - Only the LDOH site list fetch call site is updated to pass a narrower allowlist.
- Rollback strategy: revert the LDOH override and/or remove the override plumbing while keeping global defaults intact.

## Open Questions

- Should LDOH treat `403` as `unauthenticated` in `refreshLdohSiteListCache()` (currently `401 || 403`), or should it distinguish “blocked/challenge” from “not logged in” for UI messaging?
- Should LDOH allow temp-window fallback for `CONTENT_TYPE_MISMATCH` only when the HTTP status is `403`, or is `403` status alone sufficient for all practical cases?
