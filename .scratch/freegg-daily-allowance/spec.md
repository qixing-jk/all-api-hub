# FreeGG PR #1933 repair

Status: ready-for-agent

Take over the published PR without rewriting its history. Preserve one method
identity (`freegg:daily-allowance`), its mutation admission/no-replay safeguards,
and verify the deployed protocol through real browser observations.

Baseline: PR d12f165d7ecefc398a1827d66615b414424d8ea3, integrated with main
f6a22a442aa8ccd8e6efb699f6f954fdb91a1ca2. Original `temp15` remains intact.
Historical sanitized protocol evidence lives in that checkout's
`.scratch/freegg-daily-allowance/spec.md`; it is a lead for live verification.

## Acceptance inventory

| Scenario | Expected result | Evidence plan / state |
| --- | --- | --- |
| Discovery and origin scope | The exact verified HTTPS origin gets the method without a network request | Provider discovery regression tests |
| Normal add-account detection | Native identity retained; missing scoped token has usable native UI continuation; save/reopen/refresh succeeds | Actual isolated extension CDP |
| Missing/expired credentials, identity mismatch | No blind claim or unrelated identity acceptance; actionable result | Focused behavior tests; live available variants |
| Today's grant / older grant | Read-only status uses deployment UTC+8 day; today's grant skips mutation | Real logs plus tests and extension UI |
| Incomplete/malformed/paginated logs | Unknown remains unknown; complete negative evidence permits claim | Behavior tests |
| Actual claim and reward | One authenticated mutation; matching new structured grant confirms success; currency amount remains accurate when quota=0 | Real site when naturally available, regression fixture |
| Lost response / 401 / 429 / cancellation | Read-only reconciliation; no automatic replay or hidden self refresh | Behavior tests |
| Day boundary / duplicate execution | Current business day controls status and skipping; existing deduplication retained | Boundary tests and historic live evidence |
| Automatic intent, history, status refresh | Correct eligibility and truthful results, no duplicate mutation | Shared tests plus real extension controls |
| PR delivery | Registry failure and all known patch coverage gaps resolved; exact-head checks/review/coverage reconciled | Collector and Codecov artifacts |

## Local evidence

Live reports and screenshots are retained under `test-results/freegg-live/`;
protocol diagnostics and regression evidence live under
`test-results/freegg-pr1933/` (both ignored). Secret transfer artifacts must be removed
after use; sanitized protocol observations are preserved here when verified.
Browser setup/session transfer is separate from extension onboarding acceptance.

## Verified deployment contract (2026-11-27)

Live FreeGG v1.0.0-rc.49 exposes `checkin_enabled: false` while its separate
allowance grants USD 20 on the first authenticated `/api/user/self` of a UTC+8
day. Normal extension account detection performed that grant on November 27:
quota moved from 145000000 to 155000000; `setting.allowance_date` changed from
2026-11-26 to 2026-11-27. This is native grant evidence, not an assertion that the
new provider's mutation path executed that grant. UTC+8 rollover was observed
in the earlier midnight experiment retained in original temp15.

Authenticated, cookie-independent ledger reads with the user's supplied scoped
Access Token proved total 7 -> 8 and old newest ID 1 -> 2. IDs are display
positions. The deployed record below is sanitized (account and timestamp replaced):

```json
{"id":1,"user_id":17,"type":1,"created_at":1795478400,"quota":0,
 "content":"Daily allowance ＄20.000000",
 "other":"{\"content_parts\":[{\"key\":\"Daily allowance {{quota}}\",\"params\":{\"quota\":\"＄20.000000\"}}]}"}
```

Use the dedicated structured key and execution timestamp, validate returned
identity and any valid receipt date, and derive USD only from an explicit dollar
marker. Damaged/incomplete negative evidence stays unknown. Never infer a grant
from balance growth, quota=0, unrelated top-ups or a changed list-position ID.
Read-only status uses the ledger. Normal account reads can credit the allowance
and use the standard New API transport policy.

The native token creation UI was exercised with read-only scopes, 30-day expiry,
and a test name. Its only verification option, GitHub OAuth, returned 404 at the
real authorization URL. No new token was confirmed. Existing-token continuation
was tested separately using shared local configuration; the dashboard bearer
was never saved as a scoped management token.

## Reproduce and evidence limits

Use an isolated Chrome profile with the production build and an authenticated
FreeGG website session. Configure `FREEGG_ACCESS_TOKEN` and the independently
verified `FREEGG_EXPECTED_USER_ID` through the shared environment loader, plus
the profile/CDP settings. Run `node scripts/test-freegg-checkin-e2e-live.mjs`.
The runner starts ordinary Add Account -> Detect and fills only the requested
missing token. It checks save/reopen, method discovery, automatic intent, account
refresh, already-claimed execution, ledger readback and task-account cleanup.
It does not issue a new token or count session transfer as onboarding.

Chrome production live report: `test-results/freegg-live/` (unique run folders).
Protocol before/after and TDD evidence: `test-results/freegg-pr1933/`.
Both directories are retained locally for review; no raw tokens are written.
Chrome and Firefox production builds passed. Firefox live site execution has not
been performed. The original temp15 checkout and unrelated scratch are preserved.

## Feedback worklist

- Original registry count failure: test count reconciled with merged registrations.
- Original Codecov adapter gaps: malformed settings/envelopes, structured metadata,
  unreadable amounts and pagination exercised through provider behavior tests.
- Original provider gaps: credentials, origin/identity guards, uncertainty,
  cancellation, discovery, status readback and boundary behavior tested.
- Original retry scheduling partial: removed or concurrently disabled accounts
  fall back to account ID and clear the queue; behavior test added.
- Defensive branches unreachable after validated ledger/type contracts do not
  warrant implementation-mirroring tests. Updated remote coverage remains required.
- Visual review found the generic account-refresh-no-check-in promise contradicted
  FreeGG. Presentation metadata suppresses that promise for this deployment;
  its own disclosure explains the native refresh side effect. Form regression added.
- New-token issuance: blocked by the site's GitHub OAuth 404; existing-token path
  verified independently. Preserve this limitation in the PR description.
- Independent source/evidence review found and rechecked mutation admission after
  pagination, route-field ownership, and clock-day disagreement protections.
  No remaining code blocker in those paths. Exact-head remote reconciliation is pending.

## Midnight execution and clock correction (2026-11-28)

At the real UTC+8 reset the prepared production account issued the claim and the
ledger grew from 8 to 9 with a new USD 20 record at server 16:00:06Z. The initial
production result was uncertain: the server clock was 2–3 seconds ahead of the
browser (confirmed independently with the ledger HTTP Date header), and strict
client-time validation rejected that event as future evidence. The corrected
adapter reads the server's HTTP Date through shared transport and compares server
event timestamps within server observation bounds. If server and client disagree
on the UTC+8 business date, baseline/status/readback stay unknown; this prevents
reclassifying an existing next-day grant as new income for the previous day.
Regression tests reproduced both the three-second clock offset and midnight
misattribution before the corresponding fixes.

The actual mutation and native credit are live evidence; the corrected fresh-claim
success-result path is regression-test evidence. A second new grant cannot be
produced the same day. Do not present the failed initial production result as a
successful final-build claim. Its retained evidence is `after-midnight.json` and
`live-reset-2.log` under the local task results directory. The runner's optional
`--await-reset` prepares normal onboarding within 30 minutes before UTC+8 midnight
and asserts one mutation, one additional ledger entry and the USD 20 award.

## Current-head review corrections

The dispatch observer now rechecks the baseline's UTC+8 day after transport
queueing and cancels an expired request before native fetch. Award attribution
uses actual dispatch and a conservative server-clock bound that includes the
baseline request interval and timestamp precision. A grant indistinguishable
from a pre-dispatch event remains uncertain. Passing success fixtures model a
two-second processing interval; they do not prove the site grants slowly enough
for the final build to confirm every new credit.

Incomplete or contradictory readback cannot confirm an award. A readback
401/429 after a dispatched mutation remains uncertain and cannot be retried.
Regression tests reproduced these findings before the fixes. Focused validation
now passes 185 tests; the selected provider/protocol/config coverage is 100% lines
and 99.54% branches. The sole missing protocol branch checks type after validated
type-1 records and is not reachable through the provider contract.

The live runner pins its intended reset before onboarding, stops preparation
within two minutes of that reset, takes its skip baseline after account refresh,
accepts only post-click results, independently matches the structured USD grant,
and retains read-only ledger/result evidence on failure without replaying.
The final Chrome production build also passed manual existing-token entry,
save/reopen, discovery, refresh and already-claimed execution with zero claim
requests. This is separate from earlier automatic onboarding acceptance: the
isolated native website session had expired. Its report is retained under
`test-results/freegg-live/aah-cdp-suites-CzYGq6/`.

The subsequent boundary review extends both dispatch checks to the projected
server day, including HTTP Date precision and elapsed time. Confirmation requires
the grant's business day to match the baseline; an old-day grant can still be
confirmed when its readback arrives after reset. The live oracle independently
accepts same-second native credit only with a baseline lacking that day's grant;
this does not relax the provider's stricter attribution rule. The focused suite
passes 89 tests for these final provider and evidence-helper behaviors.


## Discovery and concurrent grants follow-up

Discovery matches the verified HTTPS origin even during a public status outage
or a site rename. An explicit allowance request disables recovery and replay.
Ordinary New API queries use their existing recovery policy. When valid same-day
ledger readback confirms the allowance but cannot tie it to the dispatched
request, the result is already claimed with no new award.
