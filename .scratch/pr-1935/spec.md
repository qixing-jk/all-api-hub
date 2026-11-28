# Xingchi check-in PR #1935

## Scope and fixed references

Issue #1920 requests check-in support for https://xingchiapi.com/dashboard. The reported deployment is Sub2API; retain that existing account site type and add only a protocol-specific check-in method. Original PR head: 93c89548083f47f7695c787cd0ce4b8cf24ac39d. Integration baseline: 430f46609e08c165e7b485d460a52b55c4ca671a. Merge published history normally.

The native dashboard has a daily quota claim. Do not infer currency or account balance credit from an unclassified amount. Preserve non-repeat-safe execution and keep candidate discovery/passive reconciliation free of authentication renewal.

## Review worklist

- PR uses `Refs #1920`, not a closing reference. Signed-in discovery and a real claim now pass, so use `Closes #1920` and retain the issue until merge. Explicitly disclose that an interactive verification challenge did not appear during this test.
- Confirmed base conflicts: retain the current attempt-scoped Sub2API execution and authentication owners; merge provider registrations and test candidates.
- P2: browser binding recovered during admission was discarded before POST/readback. Reuse `withSub2ApiCheckInExecution` and `readAuthenticatedCheckInStatus`; HTTP and binding matrices protect the behavior.
- P2: malformed POST 401 was classified as definitive authentication failure. Use `postSub2ApiCheckIn` so status can reconcile uncertainty without replay and redirects cannot forward the claim.
- Code review: specification intent matches original PR; real-site verification was missing. Standards findings above require fixes.
- Old-head Codecov gaps at protocol lines 121, 122 and 125 concern the last admission guard. Added behavior tests verify permission, revocation and rejected admission without an unauthorized POST.

## Acceptance inventory

| Scenario | Evidence / state |
| --- | --- |
| Protocol discriminator; enabled/disabled, foreign/malformed status | Provider/protocol tests |
| Passive detection/status, cancellation, missing credentials | Existing provider/transport tests |
| Initial admission renewal; imported selection; identity mismatch; storage failure | Xingchi rows in HTTP execution matrix |
| Recovered browser binding reaches POST | Xingchi row in Sub2API read-request matrix |
| One POST; duplicates; uncertain reply; no replay; redirects | Protocol/provider/HTTP checks |
| Award is retained without invented currency/asset/fulfillment | Provider tests; native outcome inspected separately |
| Fresh extension onboarding and automatic method discovery | Passed on 2026-11-28; see acceptance report |
| Save/reopen and re-detect preserve automatic selection | Passed on 2026-11-28; see acceptance report |
| First grant through extension; native status readback | Passed on 2026-11-28; see acceptance report |
| Repeat action skips without another POST | Passed on 2026-11-28; see acceptance report |
| Native verification shield and recovery | Authenticated live claim passed without an interactive challenge; challenge-solving branch not exercised |
| Runtime/browser compatibility | Chromium CDP; no new extension API introduced, inherited transport covered by existing tests |
| Exact-head CI, coverage, bot review, mergeability | Pending publication |

## Local evidence

The maintained acceptance report is `artifacts/acceptance.md` (review-only, ignored). Logs, original failures, native observations and screenshots stay in `artifacts/`; never publish raw account/session evidence. The first CDP run exposed a stale dev output and a mismatched server probe; its images are diagnostic only. The verified replacement server uses this checkout on port 3027. Session setup transfers only the target site's access token/user/expiry, verifies source and target identity, and excludes the source refresh credential.

## Confirmed native contract and repairs (2026-11-28)

The live dashboard status returned `enabled`, `amount`, `claimed_today`, `today`, `total_count`, and `total_amount`. Three read-only timezone probes (Pacific/Kiritimati, Pacific/Honolulu, Asia/Shanghai) returned the same server date, including a zone whose local date differed. Preserve the server's `today`; do not infer its day from the supplied query or browser clock. An execution-scoped date comparison now prevents next-day readback from confirming a previous lost response. Confirmed grants retain their award even if current-day readback fails. Unit tests cover rollover, missing dates, concurrent attempts and readback failure.

One extension-led POST returned amount 300, new_balance 300, claimed_today true, total_count 1, and next_claim_at with a +08:00 midnight offset. Native UI calls the reward quota and displays the balance with a dollar sign; the award remains conservatively unclassified rather than inferring a conversion. Raw native responses remain local in `artifacts/live-1795861952153/network.json`.

Normal account onboarding, automatic selection, save/reopen and redetection passed. The fresh-grant run succeeded through its first POST, then its repeat assertion raced the previous UI action's completion; retain this failed whole-run report with its successful grant evidence. The revised runner reloads the ordinary account page between completed actions. The follow-up run `artifacts/live-1795862223684/report.json` passed already-claimed and repeat flows with zero POSTs, native readback and cleanup. No interactive verification shield appeared in these authenticated flows. Real expiry recovery and real server midnight remain deterministic-test evidence only.

Reproduce after preparing a verified isolated website session: set `XINGCHI_EXPECTED_USER_ID`, launch `pnpm browser:cdp:isolate -- --dev --dev-port 3027`, then `node scripts/test-xingchi-checkin-e2e-live.mjs --isolate --execute`. On a naturally claimed account add `--expect-already-claimed`; it never counts as fresh-grant evidence. Without `--execute`, onboarding runs but claim acceptance remains blocked. No credential or account injection is used. Raw evidence and screenshots remain local; `.gitignore`, this specification and the reusable runner are retained in Git.
