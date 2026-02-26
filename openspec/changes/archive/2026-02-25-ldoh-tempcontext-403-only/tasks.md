## 1. Add per-request temp-window fallback policy override

- [x] 1.1 Extend `FetchApiOptions` in `services/apiService/common/type.ts` to accept an optional `tempWindowFallback` allowlist config (status codes + error codes)
- [x] 1.2 Extend `TempWindowFallbackContext` in `utils/tempWindowFetch.ts` to carry the optional allowlist config
- [x] 1.3 Update `shouldUseTempWindowFallback` in `utils/tempWindowFetch.ts` to honor the per-request allowlist when provided, and preserve existing global defaults otherwise
- [x] 1.4 Add focused unit tests for the allowlist decision logic (e.g., allow 403-only; deny 401/429) without requiring real temp-window execution

## 2. Apply LDOH 403-only policy

- [x] 2.1 Update `fetchLdohSites()` in `services/ldohSiteLookup/background.ts` to pass a temp-window fallback allowlist restricted to HTTP 403 (and corresponding API error code if applicable)
- [x] 2.2 Ensure LDOH `401` and `429` failures do not create/reuse tempcontext and still return a safe `{ success: false, ... }` response
- [x] 2.3 Re-evaluate whether `refreshLdohSiteListCache()` should mark `403` as `unauthenticated` (currently `401 || 403`) and adjust if needed per desired UX

## 3. Test and verification

- [x] 3.1 Add/adjust tests covering LDOH refresh behavior so that 401/429 do not trigger temp-window fallback, while 403 remains eligible
- [x] 3.2 Run `pnpm -s test -- tests/services/ldohSiteLookup.*` (or the closest relevant test subset) and ensure the suite passes
