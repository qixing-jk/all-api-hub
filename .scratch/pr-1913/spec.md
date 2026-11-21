# PR 1913 feedback reconciliation

Status: ready-for-agent

Scope: repair https://github.com/qixing-jk/all-api-hub/pull/1913 without rewriting history or touching the producer checkout. Original PR evidence (447 tests, 10 controlled Chromium flows and uploaded screenshots) remains authoritative for unchanged behavior. Xing owns merge and deletion.

Baseline head: 3054935de7d3691f8e5cd88e5ab114441f28afe7; base: 5acf84b5c34334252fe9b8489b1fee4149a9dd11.

## Worklist

| Source | Requirement | Outcome / evidence |
| --- | --- | --- |
| Actions 136958859853 | Eight failures in WebDAV projection and dev runway fixtures | Reproduced all eight; 33 tests now pass; artifacts/ci-reproduction.log and ci-green.log |
| Inline 4654636824 | Authority-scoped quota identity | Fixed; balanceProjection tests keep quota codes separate and currencies additive |
| Inline 4654636828, body prepaid overlap | Components cannot substitute for totals | Fixed; aggregation tests retain parent or standalone ledger, never substitute a component |
| Inline 4654636832 | Deduplicate wallet before scope comparison | Fixed; newest equivalent reading wins, incompatible scopes conflict, distinct wallets sum |
| Inline 4654636835 | Replace corrupt telemetry without rewinding admission | Fixed; raw admission reader bypasses telemetry only; restore/read-failure/future-version tests |
| Inline 4654636842 | Keep subscription-only billing after usage failure | Fixed; adapter and refresh tests preserve new limit, stale operands, separate failure and warning |
| Inline 4654636847 | Native Sub2API USD denomination | Fixed; adapter, storage and Chromium currency-preference flow |
| Inline 4654636851 | Discard unusable endpoint before strict mapping parse | Fixed; invalid endpoint discarded, usable endpoint mapping remains strict |
| Inline 4654636856 | Retained legacy balances after partial native refresh | Fixed; selector retains original amount/time until usable native replacement |
| Inline 4654636860 | Unmapped custom usage stays unitless | Fixed; persistence and stats tests distinguish newly reported unknown units from historical legacy USD |
| Inline 4654636863 | Require meaningful budget before stopping Auto | Fixed; empty/null budget rejected; zero, used-only, remaining-only and unlimited accepted |
| Inline 4654636866 | Partial unidentified/duplicate DeepSeek enumeration | Fixed; parser and refresh tests keep identified old wallets stale |
| Inline 4654636869 | Retain over-limit quota amounts | Fixed; codec keeps 100 limit, 110 used, -10 remaining and bounded display percentage |
| Inline 4654636874 | Retain partial quota field observations within interval | Fixed; retainedAmounts remain separate, preserve clocks, clear for a new reset; component and Chromium checks |
| Inline 4654636877 | Require real Kimi amount | Fixed; empty envelope rejected, component-only and zero amounts accepted |
| Inline 4654636880 | Require mapped custom balance amount | Fixed; missing balance omitted, independent counters preserved |
| Body outside diff | Superseded refresh cannot report success | Fixed; explicit storage acceptance, typed superseded error and skipped UI analytics; concurrency/controller tests |
| Body minor | Isolate booster conversion failure | Fixed; bounded conversion omits booster only, preserves valid quota |
| Body minor | Cost stale time, decimal precision, quota scale | Fixed; exact formatter, captured unit metadata and original clocks; component and Chromium evidence |
| Body minor | Restrict all-scope spending by routes | Fixed; restricted rows remain visible individually, excluded from total |
| Body minor | Translated financial labels and duplicate plurals | Fixed across eight locales; resource tests and Chinese Chromium summary, separated captions |
| Body minor/nit | Timestamp selectors, USD assertions, origin/time assertions, append bucket | Fixed and validated in owning tests; direct bucket append preserves original position references |
| Codecov | All 24 implicated files and distinct patch gaps | Enumerated artifacts/coverage-gaps.json; initial patch 78.04%, 77 misses, 118 partials |

Code outcomes above are locally validated; inline thread acceptance and exact-head remote checks remain pending until the repair is pushed and reviewed. See [coverage worklist](coverage.md) for per-file dispositions.

## Acceptance and producer handoff

The eight original CI failures reproduced before repair. The report-merge log shows the same failures propagated during blob merging; it still published coverage, so report merging was not the underlying cause. The original PR body and uploaded evidence were preserved.

The affected combined test and diagnostic coverage runs are in artifacts/coverage-final.log and artifacts/coverage-publish.log. The first diagnostic passed 725 tests over 56 files, with scoped line coverage 98.79% and branch coverage 92.08%; later tests cover the replacement read boundary and independent mapped counters. These local percentages are directional and do not replace Codecov on the final remote SHA.

The final fresh Chromium build passed eight of nine selected flows; the remaining Sub2API selector matched both the summary and the newly unit-correct detail amount. A scoped summary assertion and independent native-detail assertion repaired that test, and its isolated rerun passed without retries against the same build. Together artifacts/chromium-final.log and chromium-sub2-final.log cover all nine flows. Earlier failing runs and screenshots remain under artifacts/initial-failures/ for review. Final UI captures in artifacts/ui-final/ were inspected; exact/scaled/stale cost details had equivalent earlier inspections in artifacts/ui-4/.

Controlled fixtures establish these behaviors. No live-provider financial acquisition, local Firefox credential flows or Safari flows were run. Remote Firefox smoke is a separate signal. Fresh-before-partial captures show the state transition on the repaired build; they are not a rebuilt implementation baseline. Producer screenshots remain the unchanged branch evidence.

Producer adaptation points: WebDAV projection converts an absent normalized profile section to undefined while retaining V1 envelope behavior; DevPanel fixtures now carry matching scope, evidence and full-day cost windows. updateTelemetrySnapshot now returns { accepted, profile }; the telemetry caller rejects superseded writes distinctly. Quota snapshots optionally retain per-field stale observations, and quota spending units retain display scale/label. Later slices and all producer branches remain untouched.

## Retention

Raw snapshots, provider line coverage, reproduction logs, and final evidence stay local in artifacts/ through Xing's review. They are task-owned, ignored outputs. This worklist is the reviewer entry point; code/tests retain regression protection.
