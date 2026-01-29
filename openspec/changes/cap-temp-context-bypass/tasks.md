## 1. Content CAP Guard

- [x] 1.1 Add `RuntimeActionIds.ContentCheckCapGuard` to the canonical runtime action registry
- [x] 1.2 Implement CAP checkpoint detection + best-effort auto-start (solve/click) with per-request throttling
- [x] 1.3 Wire CAP guard handler into content message routing

## 2. Temp Context Readiness Gate

- [x] 2.1 Add a helper to check CAP + Cloudflare guard status concurrently for a tab
- [x] 2.2 Update `waitForTabComplete` to require `capPassed && cfPassed` before resolving

## 3. Tests

- [x] 3.1 Add unit tests for CAP detection scenarios
- [x] 3.2 Add unit tests for CAP auto-start behavior + throttling
- [x] 3.3 Add unit tests for the background guard aggregation helper

## 4. Verification

- [x] 4.1 Run `pnpm test` and `pnpm compile` to verify implementation (tests pass; `pnpm compile` currently fails due to pre-existing TS errors outside this change)
