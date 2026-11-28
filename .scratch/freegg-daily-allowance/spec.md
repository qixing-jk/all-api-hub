# FreeGG PR #1933 repair

Status: ready-for-agent

## Current scope: ensure today's allowance (2026-11-28)

The user clarified that FreeGG should behave like the other check-in methods:
the goal is to receive today's allowance, including through an ordinary account
read or a concurrent website visit. Request-level causal attribution is not a
product requirement. This supersedes the historical dispatch-time attribution
and post-check-in refresh exclusions below.

Keep the saved account identity, read-only discovery/status, authoritative daily
ledger evidence and existing shared execution controls. Remove FreeGG-specific
dispatch clock projection and the scheduler's balance-refresh exception.
Use the existing authoritative-status admission requirement, as other status-based
methods do: an unavailable preflight or final ledger cannot establish a successful
claim. Reuse the shared executor's status proof instead of reading a second baseline.
A newly observed grant may supply its actual amount without claiming which
concurrent visit caused it.

Use the shared retry policy: uncertain execution may be scheduled for a later
attempt, which must first confirm the current status. Transport still does not
replay the explicit claim inline. Normal account queries retain their usual
recovery and refresh behavior; there is no cross-cutting FreeGG self policy.

Validation uses the existing provider and scheduler interfaces, with failing
behavior tests before implementation. Baseline for this iteration is
`8d08929df4`; main `7dce5bd68a` was merged without rewriting published history.
Acceptance evidence: `test-results/freegg-pr1933/completion-simplification.md`.

The original requests, #1874 and #1908, describe automatic check-in on visiting
the website without a fresh logout/login. Comparison of original `566305de46`,
published repair `8d08929df4`, and the current implementation is retained in
the acceptance report. The original type-4/stable-ID/quota assumptions differ
from the subsequently verified native contract below; they must not be restored
as a simplification.

Current validation: TypeScript compile; 698 tests across 24 affected unit and
component files; five live-evidence helper tests; live-runner syntax check.
Independent Standards and Spec reviews found no remaining implementation blocker
after updating the live runner to expect one claim plus the normal balance
refresh. Same-second, concurrent, and rollover completion remain controlled-test
evidence; no new live grant was obtained during this iteration. Existing native
evidence and screenshots retain their original build/scenario limits.

## Check-in origin scope and ordinary site-type detection (2026-11-28)

The user clarified that the static list is for check-in eligibility, not a forced
account site type. Remove the FreeGG hostname from the New API account-site
definition and remove the shared FREEGG_HOSTNAMES constant. Keep the verified
HTTPS origin directly in freeggDailyAllowanceConfig.ts, owned by the allowance
adapter. Normal site-type detection and mismatch checks use their existing
protocol/title/status signals; the same hostname may resolve to another type or
remain unknown when those signals do not identify it. This supersedes the
maintained account-family mapping described in commit 1f24111ef5.

The allowance implementation can serve further deployments after verifying the
same trigger and ledger contract. Do not broaden discovery to all New API sites:
public `system_name` is branding, and `checkin_enabled` describes a separate native
check-in feature. Allowance logs prove a grant but do not independently prove its
self-request trigger; new accounts may have no logs. A distinctive read-only
capability marker could support generic discovery if verified in the future.
For now, maintain the known check-in origins and reuse the existing provider.
Check-in discovery remains local; ordinary site detection resumes its shared
requests. No new site types or generic detection framework are introduced.

Validation: the site-type regression first failed for a changed backend and
unidentifiable responses because the hostname forced agreement. After removing
the mapping, 288 tests across 11 affected files, TypeScript compile and the Chrome
MV3 production build passed. Both account-site definition files now match main;
only the check-in adapter owns the FreeGG origin list. These are controlled-test
and build results, not a new live onboarding or allowance run.

## Historical repair scope and evidence

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
