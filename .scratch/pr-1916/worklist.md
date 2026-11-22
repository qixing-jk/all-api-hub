# PR 1916 feedback and acceptance

Intake head `a54696e66c9ec33995705912833de4a0dc9c342f` on main `d056e4b32543f1df3fad8466564453f3c6d6474b`. GitHub confirms that #1915 merged the account slice and #1916 carries the balance-history continuation. The original #1914 is still open on its earlier branch.

## CI and review

| Source | Finding | Local evidence |
| --- | --- | --- |
| GitHub test run 45034298541 | 15 failures across provider availability, Daya history day, and Cubence/Krill provider periods | UTC reproduction failed all 15. The four corrected files passed 144 tests. |
| GitHub test run 45034298464 | Two NanoGPT onboarding tests expected legacy subscription scalars | Chromium verifies exact weekly allowance persistence, the active plan indicator, zero wallet refresh and identity mismatch. Both passed after updating the readback. |
| 4658608011 | Anonymous archive can attach to a replacement wallet | Archived USD remains selectable independently. Native history excludes anonymous legacy balances. Reporting tests cover available and filtered-out archives. |
| 4658608012 and other report threads | Chart can compete with selected reference setting | Available reference remains selected. When an archived metric disappears a native metric powers both display and chart. The surviving source key resolves inside its group. |
| Account refresh | Quota-only adapter must update current counters without re-dating failed metrics | Unit tests cover a newer complete consumption counter and absent income while preserving the archived timestamp. |
| RelayFor provider-day cost | Undated provider cost must stay out of local date buckets | Activity regression around local midnight verifies latest total without dated values. |
| Requesty organization | Credential edit can reuse stale form identity | Account edit sends the resolved organization to the balance adapter. |
| VoAPI v2 | Partial day statistics and decimal overflow | Cumulative history records spend at noon. An unavailable amount is never marked complete or stored as zero. |
| History compaction | A balance captured before billing timing is known can be discarded | Sequential saves before a billing window becomes available preserve the closest balance. Candidate hold is 26 hours and only applies to eligible known wallets/ledgers. |
| Current net inflow estimation | Bad timestamps, ended series, wrong baseline and equivalent time zones | Tests cover invalid point, ended ledger, earlier compatible point, and an equivalent UTC identifier. Date formatter is reused. |
| Account snapshot | A delayed targeted history read can replace a newer full-load row | Full-load generation guards accounts that were already known and preserves new account additions. AccountDataContext passed 93 tests. |
| Provider reviews | RelayFor tokens/grants/payloads, Novita exact parsing, Vercel invalid credits, NanoGPT quota and identity, FoxCode identity, SharedChat malformed plan, Xiaoen contradictory total | Provider red/green logs retain results. Dahl cancellation already rejects through the Cookie-operation abort runner. Its regression passed on the baseline. |
| UI reviews | Retry with empty message, archive labels and order, quota axis scale, estimate refresh settings, wallet and total windows | Component tests and focused Chromium tests exercise these paths. |

## Coverage

Codecov at intake reports 2,142 hits, 91 misses and 182 partials (88.70%). The [source gap inventory](artifacts/patch-coverage-gaps.json) intersects the full provider report with the PR diff and reproduces all reported counts across 48 source files. The instrumented Windows run is diagnostic. Current-head Codecov and Actions remain required for remote reconciliation.

The [local diagnostic cross-reference](artifacts/coverage-reconciliation.json) records all 273 provider-reported source lines, their corresponding source positions, and local instrumentation evidence. Source attribution differs between the local and uploaded instruments. The file list is complete for the intake report. Remaining provider-only decisions depend on the updated exact-head report. Scoped tests added separately cover editor capture failure, an incomplete capture reply, overlapping windows crossing an already-excluded interval, impossible report dates, wallet identity, and presentation of missing evidence.

## Rendered acceptance

The Windows Chromium run covered the history, account details, narrow charts, theme changes and NanoGPT onboarding. The workflow that used to inspect a legacy overlay was repaired to select the current converted metric. It passed on its own rebuilt extension and produced the captures below. Baseline screenshots for the exact fixture in each revised state were unavailable. These images show the actual application using controlled data.

### Converted balance

![Converted balance](artifacts/visual-capture/history-converted-balance.png)

### Account summary with archived references

![Account summary with recorded and converted balances](artifacts/visual-capture/history-mixed-archive-row.png)

### Native and archive metric options

![Metric menu](artifacts/visual-capture/history-native-metric-menu.png)

### Native CNY income

![CNY income](artifacts/visual-capture/history-native-cny-income.png)

### Converted spending

![Converted spending](artifacts/visual-capture/history-converted-spending.png)

## Follow-up on ad9085fee6

GitHub Actions passed on this head. Codecov reported 2,273 hits, 60 misses and 173 partials (90.70%, target 93.85%). [Published-head line inventory](artifacts/patch-coverage-gaps-ad9085fee6.json) reproduces the totals across 51 changed source files. CodeRabbit completed on the published SHA and issued [three inline and two outside-diff findings](https://github.com/qixing-jk/all-api-hub/pull/1916#pullrequestreview-6013131996).

| Finding | Follow-up behavior | Evidence |
| --- | --- | --- |
| 4658817717 | A full snapshot committed during the targeted account query is kept, including through the later history read. | AccountDataContext regression tests exercise both suspension points. |
| 4658817721 | Duplicate-account details render exact native spending where recorded. An absent legacy counter renders as unavailable. | DedupeAccountCard native-precision and legacy cases. |
| 4658817723 | A known NanoGPT reset instant retains the quota window with unknown counters. | NanoGPT parsing and management-only refresh regression. |
| SharedChat balance | Successful subscription refresh explicitly retires the legacy converted balance collection. | Actual adapter response through the shared balance acceptance function. |
| Account creation | Initial saves translate legacy wire balance evidence with the refresh compatibility mapper. | Normal account save and readback with legacy quota and slow status lookup. |
| Archived estimate tooltip | A capture time outside the date range leaves the estimate readable. A valid interval can still be inspected. | Reporting test fails with RangeError on the published version and passes with both inputs. |

[Scoped Vitest run](artifacts/followup-final-coverage.log) passed 375 tests across 15 files. Its instrumentation exit reflects the global thresholds applied to a deliberately scoped run. [Chromium](artifacts/followup-chromium.log) passed the build and four workflows covering history, duplicate-account cleanup and both NanoGPT onboarding paths. The duplicate-account exact amount was verified at the component boundary.

The [local patch diagnostic](artifacts/followup-patch-diagnostic.json) maps estimates back to the prior remote coverage lines. The comparison combines the published Linux CI LCOV and this Windows scoped run, with source-line matching. It estimates 94.28%, so the current published gate requires fresh CI evidence. It cannot certify branch attribution across different builds. Remaining estimated misses and partials stay in the inventory for final provider reconciliation.


## Resumed follow-up from 4f94e82e18

The two latest CodeRabbit findings are repaired: targeted reloads read storage again when an overlapping full load makes read ordering uncertain, and native partial consumption retains its translated qualification. The existing red run reproduced both findings; the restored locked dependencies passed 135 tests across AccountDataContext, DedupeAccountCard and todayIncomeEstimate. The latter also verifies reporting-zone incompatibility with the same UTC offset.

Chromium passed duplicate-account preview/deletion with exact partial consumption and the 390px density flow. The complete dialog capture was inspected; precision and the partial indication remain readable, with normal long-value wrapping. The earlier same-fixture baseline is retained in artifacts/dedupe-visual-baseline; final evidence is in artifacts/resume-chromium. All fixtures are controlled, not live provider accounts.

CI on the source head had two failures. Shard 2 initially remained at Loading scopes with no key rows, then its retry reached the appearance drawer before its 180-second total test budget expired. The local 390px test passed; no fixture defect is established. Shard 3 reached its 12-minute job-step budget without an assertion failure in the log. Preserve artifacts/ci-density, artifacts/ci-shard3 and the e2e-4f94 logs for diagnosis if either failure recurs; a clean retry alone does not establish the cause. No retry count, timeout or assertion was weakened. Final-head CI remains required.

Coverage decisions for all previously implicated file groups are retained in artifacts/coverage-dispositions-4f94e82e18.md and the 47-file provider line inventory. The current provider report must be checked after publication. Outstanding remote acceptance includes the completed review of the new head, inline acceptance for still-open handled findings, all required checks, coverage and mergeability.

Task artifacts, including interrupted dependency-install backup packages, remain local pending review or unresolved diagnosis. They are not tracked and must not be deleted while evidence remains needed. This report is the retained reviewer entry point; the behavior regressions remain in tests.

## Absent consumption on reload

CodeRabbit's post-reply inspection found a remaining legacy-only case: normalization defaulted a missing stored consumption counter to zero while retaining Complete coverage. The component regression runs the stored account through normalizeSiteAccount and verifies that absent evidence renders unavailable while an explicit zero stays visible. The absent case failed on 02b56673b5; both cases and the full DedupeAccountCard/accountDefaults suites passed (70 tests) after normalization classified the missing evidence as unavailable/invalid payload. Native consumption retains its independent exact amount and coverage. No numeric storage shape changed.

Remote validation on 02b56673b5 passed all 30 checks and Codecov at 94.33% (11 misses, 132 partials in 47 source files). This is source-head evidence for the final repair; the next published head still needs its own CI, coverage, review and thread acceptance. The original density/shard-timeout traces remain local because their cause is unresolved despite all three repeated density passes and successful source-head CI.
