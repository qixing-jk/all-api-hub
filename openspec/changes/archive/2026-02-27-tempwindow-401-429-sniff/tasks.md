## 1. Response classification (401/429 sniff)

- [x] 1.1 Update `services/apiService/common/utils.ts` `apiRequest` to sniff `Content-Type` for non-OK JSON responses and relabel 401/429 HTML responses as `CONTENT_TYPE_MISMATCH`
- [x] 1.2 Add `Retry-After` guard for 429 so 429 + `Retry-After` remains classified as `HTTP_429`
- [x] 1.3 Add unit tests for the new 401/429 classification behavior (HTML vs JSON, and 429 with/without `Retry-After`)

## 2. Default temp-window fallback policy tightening

- [x] 2.1 Update the default temp-window fallback allowlist in `utils/tempWindowFetch.ts` to avoid auto-triggering on plain 401/429 errors by default
- [x] 2.2 Update allowlist matching tests (`tests/utils/tempWindowFetch.allowlist.test.ts`) to reflect the new defaults

## 3. Validation and regression checks

- [x] 3.1 Ensure per-request allowlist overrides still work as expected for site-specific flows (spot-check an existing override usage)
- [x] 3.2 Run targeted test suite (`pnpm -s test`) and ensure changes are covered and passing
