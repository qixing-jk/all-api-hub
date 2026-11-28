# PR CI throughput and timeout investigation

Baseline: `137403eef477625f343c068a0cc27de2a25a0f55` (2026-11-28).

The goal is shorter, reliable PR feedback with measured benefits and little added
maintenance. Keep test coverage, assertions, isolation, and existing deadlines.
The agreed test boundaries are the actual CI CLIs, shared browser fixtures, and
the existing failing browser workflows. Generated evidence stays in `artifacts/`.

Current iteration: fix unit CI shard correctness, retain the financial file split,
and withdraw the page-clock experiment after hosted timeout failures. Main
`d05e7cf117` has been merged, including the earlier native-details batching fix
and the catalog/native-editor refactor. The original performance baseline remains
fixed above. Full Test and E2E passed after integration on `f078dc52a7`; both
inventories are complete. Firefox needed one job rerun after an RDP greeting
disconnect; this remains an unresolved startup flake. The original failure is
retained below. Whole-E2E speedup remains unproven.

## Baseline and hypotheses

- Recent ordinary PRs: E2E 13-16 minutes; Test about 9 minutes. In run
  [46111395031](https://github.com/qixing-jk/all-api-hub/actions/runs/46111395031),
  the six smoke steps took 440-695 seconds. Build took 59 seconds. In Test run
  [46111394972](https://github.com/qixing-jk/all-api-hub/actions/runs/46111394972),
  test steps took 234-396 seconds and report merging/publishing took 94 seconds.
- Main run [46108211172](https://github.com/qixing-jk/all-api-hub/actions/runs/46108211172)
  provides six JSON reports with 994 passing Chromium cases and no retries.
  Worker tails show limited spare capacity in most shards. Parallelizing all
  files or increasing worker count is not an established overall speedup.
- The account-editor click timeout and missing layout element in older runs
  already have main-branch fixes. Do not claim them as this task's repairs.
- Firefox greeting failure in run
  [46059147892](https://github.com/qixing-jk/all-api-hub/actions/runs/46059147892)
  remains unexplained. A retry alone will not establish its cause.

Candidates, in priority order:

1. Shared component rendering imports a dialog barrel that loads unused editor
   containers. Import the existing provider directly and compare the same tests.
2. Independent cases in large sequential E2E files can leave workers idle. Compare
   bounded parallel execution using the existing helper and the same cases.
3. Inspect long waits in native account-recovery flows and Firefox startup;
   change only a reproducible wait or lifecycle defect.

## Acceptance

| Outcome | Validation | State |
| --- | --- | --- |
| Lower PR CI duration | Fixed-input before/after measurements; distinguish local and hosted results | Local subset and hosted long-file gains; full hosted comparison below does not establish an overall E2E speedup |
| Retain behavior and failure detection | Existing affected unit/E2E cases; preserve behavior/layout assertions and deadlines | Full hosted Test/E2E pass; original identities retained except the documented one-to-five matrix split. Screenshot-only hygiene checks become opt-in in round two. |
| Repair internal timeout causes | Reproduce current failure before changing its owning logic | Hung probes, closed-context polling and unfinished HTTP connection teardown reproduced; focused checks and full hosted E2E pass |
| Low complexity | Reuse existing helpers; reject experiments without measurable benefit | Direct import, scoped parallel modes, split existing scenarios and bounded existing probe. One lightweight profile job prevents cache races. |

## Local measurements

Windows, Node 24.22.2, Playwright's installed Chromium, Vitest 5.1.0. Timed
commands run sequentially, without another task-owned build or test running.
These figures do not establish a percentage improvement for hosted CI.

| Change | Before | After | Retained behavior |
| --- | ---: | ---: | --- |
| Independent webpage verification and token recovery cases use four existing workers | 357.20s | 145.03s | Same 52 passing cases; no retries, failures or removed assertions |
| Split AIMLAPI's combined authentication matrix | 24.93s | 17.80s | All five original credential scenarios, with ordinary per-case deadlines and independent retries |
| Import the shared render provider directly | 24.82s median | 19.31s median | Same six files, 62 tests, four workers and all-source JSON coverage |

The render comparison alternated baseline/candidate ordering over three runs per
variant. Wall times (including CLI): before 29.82/24.11/24.82s; after
19.69/18.66/19.31s. All 62 test identities and outcomes match. Both coverage
reports contain the same 3,428 source files. The six tested UI modules retain
their statement/function/branch hit sets; raw initialization hit counts in
unrelated modules decrease because unused editors no longer load. Full-suite
validation of shared-provider consumers passed. A sequential local full-suite
comparison was stopped after roughly six minutes with only part of the baseline
completed; its partial output is retained and is not passing evidence. Full-suite
coverage should be verified using the existing six CI shards.

Reports: `artifacts/content-{before,after}.json`,
`artifacts/auth-before.json`, `artifacts/auth-after-final.json`, and
`artifacts/unit-{before,after}-{1,2,3}.{json,seconds,log}`. The first attempted
authentication candidate run rejected a stale E2E build before executing test
bodies; it is retained separately as `auth-after.*`, and excluded from timings.

## Reproduced startup defect

`getExtensionServiceWorker` checked its deadline around a loop, but awaited
`Worker.evaluate()` without any bound. A worker that never replies bypassed
both the declared deadline and the enclosing fixture's startup retry. The same
defect affected fresh and cached workers.

`pnpm exec vitest run tests/utils/extensionServiceWorker.test.ts --maxWorkers=1`
failed both new deadline cases before the fix (`artifacts/startup-red.log`).
Bounding the probe by the existing deadline and clearing its timer makes both
pass. Together with `extensionLaunch.test.ts`, 27 checks pass
(`artifacts/startup-green.log`). This is a deterministic fault-injection result;
it does not attribute the historical Firefox greeting failure to this cause.

A second regression exposed `waitForEvent` swallowing a closed-context error and
hot-looping until the deadline. Only Playwright's ordinary polling timeout is now
ignored; browser closure is propagated immediately. Its pre-fix failure is in
`artifacts/closed-context-red.log`; all 28 startup unit checks pass in
`artifacts/startup-final-unit.log`.

The real-browser test `e2e/extensionStartupDeadline.spec.ts` occupies the actual
Chromium service worker, confirms its console marker, asserts the deadline failure,
terminates that evaluation and confirms recovery. It also checks an explicitly
closed context. Both scenarios passed three times without retries (six browser
cases plus build), recorded in [the final browser log](artifacts/startup-confirmed-browser.log).
Browser cleanup remains owned by the existing test fixture.

The initial pause-based browser test passed once but failed when repeated: the
readiness probe could execute before the pause took effect. The first blocking
evaluation attempt had the same command-ordering race. These failures remain in
`artifacts/startup-final-browser*`; neither establishes a defect in the fixed
deadline logic. Waiting for the worker's own console marker made the fault
injection deterministic. The initial pause-based passes are excluded from final
startup acceptance.

## Decisions and remaining evidence

- Keep the existing six test runners, four workers and coverage thresholds.
  Setup/build caches are already effective; no extra test runner or cache layer
  is justified. The later correctness repair adds one lightweight profile producer.
- Preserve complete stateful multiwindow recovery journeys. Parallelize their
  independent scenarios rather than severing the state transition being tested.
- Split the AIMLAPI matrix's five independent combinations instead of giving all
  combinations one 180-second budget. Each still calls the existing UI scenarios.
- Do not retry the previously rejected dependency optimizer or add a lighter
  test environment: the existing investigation records coverage changes or
  inconsistent net gains in `.scratch/ci-runner-performance/spec.md`.
- The three affected behavior suites passed twice without retries: 136 passing
  behavior cases in [the browser report](artifacts/final-browser.json). That run
  also had one build and two initial pause-based tests, superseded by the corrected
  six-case startup verification above. This stability run overlapped unit/static
  checks, so its duration is not used as a controlled performance comparison.
- Type checking, targeted ESLint and Knip passed. Knip reports its existing
  unused ignore-pattern hint. The authorized experimental branch
  `perf/pr-ci-throughput` is published; no PR has been created.

The 167 affected unit/component checks are recorded in
[the unit log](artifacts/final-unit.log). The final startup checks add the
closed-context regression ([28 passes](artifacts/startup-final-unit.log)).
Local benchmark drivers remain at `artifacts/measure-render.ps1` and
`artifacts/measure-full-unit.ps1`; they restore the task-owned render import in
`finally`. The full-suite driver was stopped with its owned process tree and the
candidate import was explicitly restored. Partial output is retained solely for
diagnosis, not as a completed comparison. All other generated logs, reports,
coverage and failed experiment artifacts remain local for review; unrelated
scratch material is preserved.

Raw job logs, step timing responses, main JSON reports, and local baseline output
are retained in `artifacts/` for review. The old account-editor trace download
failed with `unexpected EOF`; the job logs were retrieved successfully.

## Hosted comparison (2026-11-28)

The baseline is the SHA above; the measured candidate is
`4dd6a88d51f1bf9f6bb80b85821086386cd798a4`. All four runs completed successfully:

- Test: [baseline 46117837048](https://github.com/qixing-jk/all-api-hub/actions/runs/46117837048)
  and [candidate 46117846689](https://github.com/qixing-jk/all-api-hub/actions/runs/46117846689).
- E2E: [baseline 46117841643](https://github.com/qixing-jk/all-api-hub/actions/runs/46117841643)
  and [candidate 46117851123](https://github.com/qixing-jk/all-api-hub/actions/runs/46117851123).

Both Test runs used Node 24.22.2, four workers per shard, timing cache
`unit-test-durations-46112807572-1`, and the same compiled-module cache content
for each corresponding shard. Both E2E runs used timing profile
`e2e-spec-durations-46112807598-1`; downloaded profile SHA-256 values match
(`570ec62ac739a2618165f67e1f0392be238697de84e83beb7848e07f91d0a9a9`).
Adding the startup spec changes some E2E shard assignments, so compare the full
inventory and individual files rather than treating each shard as identical work.

| Hosted measurement | Baseline | Candidate |
| --- | ---: | ---: |
| Test workflow wall time | 527s | 507s |
| Test slowest execution step | 387s | 359s |
| Test six execution steps, sum | 1,823s | 1,795s |
| Test all job durations, sum | 2,205s | 2,208s |
| E2E workflow wall time | 936s | 1,168s |
| E2E slowest default smoke step | 838s | 749s |
| E2E six default smoke steps, sum | 3,811s | 4,063s |
| E2E all job durations, sum | 4,586s | 4,936s |
| E2E build job | 22s (cache hit) | 57s (cache miss) |
| Longest build-to-shard-start gap | 171s | 268s |

These are single-run observations, not a controlled whole-CI speedup estimate.
Hosted CPU models vary even within each Test run (EPYC 9V45, 9V74, 7763 and Xeon
8573C). E2E candidate shards also queued substantially later. The candidate's
slower total E2E duration and higher aggregate runner time must remain visible;
shorter individual files do not establish lower overall CI cost.

The individual files' first-test-start to last-test-end spans decreased:
webpage verification 295.40s to 176.44s, token recovery 489.38s to 150.12s, and
AIMLAPI authentication 291.37s to 203.40s. Their summed test durations were
294.88s to 459.73s, 488.98s to 464.70s, and 290.99s to 324.83s respectively.
Surrounding unchanged files on the webpage shard were also slower (median test
work ratio 1.48), so do not attribute its higher aggregate cost solely to the
parallel setting. Keep the small, isolated changes on the strength of the
repeated local comparison and hosted file-span improvement; do not add runners,
workers or another scheduling layer on this evidence.

The full unit inventory contains the same 35,086 original cases plus three new
startup regressions: 35,087 passes and the same two skips, across 2,143 files.
Coverage contains the same 3,428 sources and identical statement/function hit
sets. Branch coverage adds one hit in an unchanged concurrency-control module;
no hit is lost. Global coverage remains 97.37% statements, 93.70% branches,
98.32% functions and 98.47% lines; completeness and upload gates passed.

The default E2E inventory is 1,001 baseline cases and 1,007 candidate cases,
excluding six skipped build setup entries. The only identity changes are the
one-to-five authentication split and two startup regressions. Candidate: 1,000
passes, seven existing skips, zero retries. Baseline: 993 first-attempt passes,
one retried pass and seven skips. Firefox smoke, DNR, bookmarks and isolated
performance cases also completed successfully. Firefox AMO packaging is a
release-only job and was correctly skipped by both dispatches. These dispatches
exercise the ordinary PR test jobs, not PR-only reporting or release packaging.

Evidence: `artifacts/hosted-timings.json`, `hosted-unit-identity.json`,
`hosted-coverage-comparison.json`, `hosted-e2e-identity.json`,
`hosted-{base,candidate}-e2e-summary.json` and `hosted-{base,candidate}/`.
`summarize-ci.py`, `compare-unit.py` and `compare-e2e.py` in `artifacts/` reproduce
the comparisons from retained API responses and downloaded reports.

## Follow-up: HTTP fixture teardown timeout

The baseline E2E retry was `newApiSessionVerification.spec.ts`'s
`missing-channel-manual-retry`: `sessionSite` teardown exceeded 63,446ms.
The existing fixture awaited `server.close()` while an unfinished HTTP request
could keep the server alive. Session revocation occurs before this close and
retains its existing assertion.

A temporary diagnostic runs that original browser scenario with an incomplete
HTTP request and a two-second fixture deadline. The original UI assertions and
session cleanup passed, then teardown failed. After closing the server's active
connections immediately after stopping acceptance, the same scenario passed.
This confirms the cleanup defect; the original CI trace records the successful
retry, so it cannot independently prove which connection stalled the first run.
No production timeout or normal test deadline was increased.

Reproducer: `artifacts/reproduce-session-close.py` (Python 3, Node 24, installed
Playwright Chromium and current E2E build). It temporarily instruments the
original spec, runs only the affected case, restores the source bytes in
`finally`, and retains output. Run with `SESSION_CLOSE_VARIANT` set to a fresh
label. The confirmed red/green logs are `session-close-red-utf8.log` and
`session-close-green.log`; the initial `session-close-red.log` also had a
diagnostic encoding error and is excluded. Both original cases subsequently
passed three times without retries (`session-close-final.log`, six passes).
Targeted ESLint, commit gates and pre-push type checking/Knip passed.

The follow-up implementation is `d657ef48bef7fc1565596c3de5788d25f555154b`.
[Complete E2E verification 46119950425](https://github.com/qixing-jk/all-api-hub/actions/runs/46119950425)
passed on that exact revision. The six default reports contain the same 1,007
identities as the first candidate: 1,000 passing cases, seven existing skips,
no retries and no missing or duplicate cases. Both session-verification cases
passed. Firefox's 20 cases, DNR's six, bookmarks' three and both isolated
performance cases also passed without retries.

This run restored the candidate build and its updated timing profile
`e2e-spec-durations-46117851123-1`. Workflow time was 1,008s (16m48s), the slowest
default execution step 818s, six smoke steps totaled 3,818s and all jobs totaled
4,685s. The baseline values were 936s, 838s, 3,811s and 4,586s. This second
candidate run therefore still does not establish an overall E2E speedup or
lower runner cost. Its changed timing profile and runner allocation also prevent
using it as a fixed-input repeat. Keep the demonstrated long-file/local benefits
and timeout corrections; broader CI throughput gains remain unproven, and
additional scheduling infrastructure is not justified by this evidence.

Final evidence: `artifacts/hosted-final/`, `hosted-final-e2e-summary.json`,
`hosted-final-e2e-identity.json`, `hosted-final-timings.json`,
`jobs-46119950425.json`, and `final-performance-attempt-1.log`. Full unit/coverage
evidence above remains applicable: this follow-up changes only one browser-test
fixture and the evidence document. Any subsequent commit containing only this
report does not alter the tested implementation.

## Second round: optional capture and measured worker tails

Iteration baseline: `f9df3f95001e0020dbe51efbe847fa0ec54e85dd`; the original
branch baseline above is unchanged. The retained implementation changes only
three browser specs. Density screenshots now use the existing opt-in
`captureVisualViews` helper. All layout, hit-area, persistence and cross-view
assertions still run normally; only screenshot hygiene (scrolling, moving the
pointer, waiting for tooltip/toast dismissal) runs inside `beforeCapture`.
Playwright's existing failure screenshots and retry traces remain enabled.
The 16 independent password-login scenarios may use the existing four workers;
reused user-data profiles keep their sequential mode. Production deadlines,
including the deliberately slow WAF and uncaptured-login scenarios, are unchanged.

| Second-round outcome | Evidence | Result |
| --- | --- | --- |
| Remove unconditional review screenshots | Same five density cases, before/after then after/before order | 52.87s to 49.45s; 55.17s to 54.70s. Cumulative case time 182.42s to 141.97s and 193.39s to 157.59s. Whole-group gain is small; primary benefit is less work. |
| Preserve optional visual evidence | `density-capture-expected.json` written before capture; both original density files with `AAH_VISUAL_CAPTURE_DIR` | Five passes; all 114 PNG/JSON pairs have matching IDs, expected viewports and SHA-256 hashes. Narrow account rows, narrow calendar and desktop search inspected. |
| Reduce serial password-login tail | Same 49 cases including the financial workload; inventories compared | Password file span 240.36s before, 101.96s and 102.94s with parallel mode. The whole experiment is qualified by startup retries below. |
| Retain password workflow behavior | `password-parallel.json`: 16 original cases repeated three times, four workers | 48 passes, no test-level retries; two fixture-level launch retries are recorded separately, not hidden by the pass count. The full hosted run below has none. |
| Fix newly observed Chromium launch timeout | Original workloads, minimal startup case, browser and protocol diagnostics | Not resolved. No evidence yet supports changing launcher behavior or increasing its deadline. |

Commands use the existing build and `--project=chromium --workers=4 --reporter
list,json`, with each measurement running alone among this task's local commands.
`compare-local-opportunities.py` compares original test identities, statuses,
attempts, file spans and cumulative case duration. `repeat-density.py` runs the
reverse-order comparison and restores source bytes in `finally`. Logs, JSON,
timings and outputs are retained as `density-{before,after}*`,
`density-capture*`, `tail-{before,after}*`, and `password-parallel*` in `artifacts/`.
The first repeat script used Windows backslashes as Playwright test regexes and
matched no tests; `density-after-repeat.log` is excluded from measurements.

For optional capture, set `AAH_VISUAL_CAPTURE_DIR` to a fresh output directory
and run `e2e/densitySettings.spec.ts e2e/densityCoverage.spec.ts`. Fixed checkpoint
IDs include route, density and width. Use the existing `pnpm visual:capture`
entrypoint for metadata reports/comparison. The screenshot helper's animation
and font readiness applies only when capture is enabled. No new screenshot
framework, workflow, runner or worker count was introduced.

### Rejected experiments and unresolved startup evidence

Financial scenarios also showed a hosted worker tail, but enabling parallel mode
in both financial and password files produced two runs of 49 passes at 170.00s
and 178.57s versus the serial 244.03s baseline. Each candidate had one 25-second
Chromium launch timeout and fixture retry in a financial case. Total case work
rose from 452.30s to 562.19s and 593.57s. Financial parallel mode was reverted;
the experiments do not establish a favorable stability/cost tradeoff.

Parallelizing the two density-coverage viewports also failed the cost/benefit
check: 59.37s and 98.72s Playwright durations versus 48.9s and 54.1s without this
extra parallelism. It was reverted. Smaller scenarios cannot always improve
packing: the fifth case still starts after an occupied worker becomes free.

The user requested further diagnosis rather than treating launch timeouts as
unavoidable. The original Chromium failure occurs in `launchPersistentContext`,
before the extension service-worker probe fixed earlier in this branch. Its log
reports a launched PID, followed by the unchanged 25-second deadline. During
the first failure the browser retained its profile lock after the fixture had
retried; it exited when its Playwright worker ended. No task-owned browser
process accumulated across completed commands. Automatic approval rejected
cleanup of that unused temporary profile, so it remains on disk.

The original financial workload with protocol logging passed all 33 cases;
browser-only diagnostics passed 99 cases; a minimal original startup regression
passed 40 repetitions with four workers. These are negative reproduction results,
not a fix. Subsequent uninstrumented density and password runs also exhibited
launch retries. Host observation during those runs found 97% CPU load and about
3 GB free physical memory out of 32 GB, with concurrent non-task Node,
TypeScript and Python workloads. Thus the local parallel comparison has host
contention as a confounder; it cannot identify an application or Chromium defect.
No speculative process killer, browser sharing/reset layer, timeout increase,
or extra retry was added. Retain `financial-startup-{protocol,browser}*`,
`startup-protocol*` and `password-parallel-startup-retries.json` locally for a
future isolated reproduction. The protocol logs contain synthetic fixture data
and remain ignored rather than being published.

The fresh hosted main baseline is
[E2E 46123361818](https://github.com/qixing-jk/all-api-hub/actions/runs/46123361818)
at the original baseline SHA. It completed successfully, including Firefox,
DNR, bookmarks and isolated performance checks. Its six default JSON reports
show no test or fixture-startup retries.

### Second-round complete hosted result

[Candidate E2E 46125843480](https://github.com/qixing-jk/all-api-hub/actions/runs/46125843480)
passed on exact implementation `49d3488bda899a019f044c4a2cfeb06c7b5c45b6`.
The six default reports contain 1,000 passes and the same seven existing skips,
with zero test-level retries, zero fixture startup retries and no duplicate
identities. All 1,007 identities match the previous completed candidate run
46119950425. Against original main, the only identity changes are the earlier
one-to-five authentication split and two startup regressions. Firefox, DNR,
bookmarks and isolated performance checks all passed; release-only AMO validation
was correctly skipped. The earlier full unit/coverage evidence remains applicable
because this round changes only browser specs and this report. Pre-commit ESLint
and formatting, pre-push type checking and Knip passed.

| Fresh hosted comparison | Main baseline | Final candidate |
| --- | ---: | ---: |
| Workflow wall time | 891s (14m51s) | 866s (14m26s) |
| Slowest default smoke step | 722s | 775s |
| Six default smoke steps, sum | 3,686s | 3,448s |
| All job durations, sum | 4,576s | 4,287s |
| Password-login file span / cumulative case time | 294.19s / 293.87s | 118.13s / 270.66s |
| Density-settings file span / cumulative case time | 187.89s / 311.56s | 115.92s / 205.82s |
| Density-coverage file span / cumulative case time | 66.41s / 66.40s | 61.07s / 61.05s |

This observation has 2.8% lower workflow wall time, 6.5% lower summed default
execution time and 6.3% lower summed job time. It does **not** establish a stable
whole-CI improvement: the slowest shard increased, hosted runner allocations
vary, and the restored timing-profile hashes differ (baseline `25fa8c76...`,
candidate `c812432f...`). Earlier whole-run comparisons above remain visible.
The small retained changes have repeated local density-work savings and hosted
file-level gains without adding workers or runner jobs; no more scheduling
infrastructure is justified by these measurements.

The public capture CLI also passed on the final implementation:
`pnpm visual:capture --spec e2e/densitySettings.spec.ts --grep "global density
preserves text and fits 320px views$" --fixture density-global-v1`, supplying all
12 expected route/density checkpoint IDs with repeated `--expect-checkpoint`.
It produced `.scratch/visual-captures/run-PEX0eT/capture.json` and `capture.md`,
including build provenance and hashes. This local capture directory and the
114-checkpoint run remain review evidence, outside Git.

P2 unresolved evidence gap: under concurrent local host workloads, Chromium can
hit the fixture's 25-second launch deadline before service-worker readiness.
The owning boundary is `e2e/fixtures/extensionTest.ts`'s persistent-context
launch. Closing this gap requires reproducing a failed launch with usable
startup diagnostics on an isolated host, followed by a behavior test and a
verified targeted correction. Passing instrumented runs or this clean hosted
run do not resolve that local cause. The earlier reproduced probe/context/HTTP
teardown defects are fixed independently.

Review recommendation: retain the three small browser-spec changes and the
earlier verified timeout fixes. Preserve this report in Git; keep raw diagnostic
logs, failed experiments and comparison outputs in ignored `artifacts/` through
review. `compare-round2.py`, `hosted-round2-{base,candidate}-summary.json`,
`hosted-round2-identities.json`, `hosted-round2-iteration-identity.json`,
`hosted-round2-{base,candidate}/`, and both run/job API snapshots reproduce the
hosted comparison. No PR has been created.

## Third round: financial matrix waits and file scheduling

### Observed growth and chosen scope

The six default smoke execution steps grew from a summed 2,531s on November 15
([43727863243](https://github.com/qixing-jk/all-api-hub/actions/runs/43727863243))
to 3,100s on November 21
([44937190946](https://github.com/qixing-jk/all-api-hub/actions/runs/44937190946))
and 3,686s in the November 28 baseline above. The slowest step rose from 480s
to 649s and 722s. These snapshots establish the reported slowdown, not its full
cause: runner allocation and test inventory also changed. From `20d783705d14`
to the fixed baseline, E2E changed across 112 files (+22,612/-929 lines).
The 23 newly added default spec files account for 2,332.54s of the baseline's
13,528.79s cumulative case duration. Cumulative case duration is not job wall time.

In the prior candidate, `devFinancialFixtures.spec.ts` occupied one worker for
502.90s (502.11s cumulative case work). Trace inspection of the original native
state matrix found 128 search fills repeatedly paying the production 150ms
debounce. The ordinary UI search is only how these balance assertions materialize
virtualized rows. Needle-settings screenshots occupied about 0.8s of a 14.2s
profiled case, so their removal did not justify expanding this iteration.

### Initial experiment and contracts (clock later withdrawn)

- Install Playwright's page clock before navigation in the three native-site
  matrix phases and the native-state matrix; advance 200ms after each real search
  fill. The clock runs normally between advances. Original real UI interactions,
  visible values, currency changes, zero/missing/stale distinctions, persisted
  account readback and cleanup assertions remain. Production debounce and all
  existing deadlines remain unchanged. Clock semantics follow the
  [official clock guide](https://playwright.dev/docs/clock).
- Keep 10 fixture creation/lifecycle/matrix cases in `devFinancialFixtures.spec.ts`,
  move eight typography cases to `devFinancialTypography.spec.ts` and 15 ordinary
  display cases to `devFinancialDisplay.spec.ts`. These are sequential files;
  existing worker/file scheduling can distribute them. No new parallel mode,
  shared helper layer, worker count or workflow was introduced.
- Update the existing real-site guide's command to include all three files.
  TypeScript AST comparison confirms all 19 non-import top-level statements
  match the saved clock-optimized unsplit source. All 33 original test titles,
  projects and expected outcomes match after only normalizing the file move.

### Local acceptance

Same build and four configured Chromium workers; commands run sequentially.
The unchanged build's provenance records baseline `137403eef4` and input hash
`baa633c76314af5a6a5823ec7bdaf59533814f0fbe2b5451b3a234b24702dd5d`;
the existing fixture verifies current build inputs before reuse.

| Comparison | Before | After | Result |
| --- | ---: | ---: | --- |
| Four financial matrices, CLI wall | 117.36s | 67.60s | Same four passing original cases |
| Native-state matrix, case duration | 48.0s | 21.2s | Same 41-type state matrix and persistence/cleanup assertions |
| All 33 cases, clock enabled, CLI wall | 171.85s unsplit | 87.42s split; 91.66s repeat | 33/33 pass in every run; no test-level retries |
| All 33 cases, cumulative case work | 168.30s unsplit | 185.71s split; 217.66s repeat | Increased overlap/contention; repeat includes a startup retry |
| Fixture startup retries | 0 unsplit | 0 split; 1 repeat | Existing 25s Chromium launch problem remains unresolved |

The repeat's typography case hit `launchPersistentContext`'s 25s deadline and
recovered through the existing fixture retry. Preserve that failure in
`financial-clock-split-repeat.{json,log}`; do not describe the repeat as retry-free
or infer the local launch cause from eventual success. The first split run was
clean. Remote validation must assess whether the scheduling benefit carries to CI.

Optional screenshot acceptance ran all four clock-modified cases successfully.
The predeclared `financial-capture-expected.json` contains 74 checkpoint IDs;
all 74 PNG/metadata pairs match exactly, including each image's SHA-256.
The missing-state row and opened Dahl details were visually inspected: the
expected row state and complete detail content are rendered. No product UI
changed; the remaining images retain the existing capture assertions.

The actual six-shard CLI, using the previous hosted profile, assigns all 196
default spec files exactly once. Fixtures/display initially land on shard 1 and
typography on shard 6. The old fixture weight still describes all 33 cases;
the two new files initially use the existing median fallback until a subsequent
successful workflow refreshes the profile. This cold-profile limitation is
explicit; no special migration or new scheduling machinery was added.

Local reproduction: with `AAH_SKIP_E2E_BUILD=1`, run
`pnpm exec playwright test e2e/devFinancialFixtures.spec.ts e2e/devFinancialDisplay.spec.ts e2e/devFinancialTypography.spec.ts --project=chromium --workers=4 --reporter=list,json`.
For the four matrix cases use `--grep "dev native observation states|dev site balance scenarios"`.
Set `AAH_VISUAL_CAPTURE_DIR` to a fresh directory for optional captures.
The retained before source is `artifacts/financial-clock-unsplit-source.ts`.

Keep this decision/evidence summary in Git. Keep the raw `financial-filter-*`,
`financial-state-clock-*`, `financial-clock-*`, `round3-*`, historical job snapshots,
and task-local comparison/split scripts in ignored `artifacts/` through review.
`verify-round3-local.py` and `round3-local-summary.json` record inventory, timing,
retry and capture checks. The existing local startup gap remains open.

### Hosted rejection of the clock experiment

The first hosted run [46130108584](https://github.com/qixing-jk/all-api-hub/actions/runs/46130108584)
on `50100de3d0` passed 1,000 cases with seven existing skips and no test or
fixture-startup retries. All 1,007 identities match round two after only mapping
the financial file moves. Wall time was 937s, six smoke steps summed 3,568s,
the slowest step was 707s, and all jobs summed 4,330s. Financial case work rose
from 502.11s to 603.49s despite the shorter maximum file span (320.23s).

A justified repeat using the refreshed profile,
[46131468454](https://github.com/qixing-jk/all-api-hub/actions/runs/46131468454),
failed both native-details and currency-switching cases on both attempts.
There were 998 passes, seven skips and two failures, with no lost/duplicate
identities or startup retries. Wall time was 896s, smoke sum 3,559s, maximum
797s and job sum 4,436s. This is failed validation, not a speed improvement.

Retained retry traces show 31 `clockFastForward` calls totaling 13.84s in details
and 47 totaling 17.82s in currency switching; individual advances reached
0.91s/0.98s. The local speedup did not carry to Linux CI. All six clock additions
were therefore removed. Preserve the failed run's reports, screenshots and traces
under `artifacts/hosted-round3-repeat/`. Keep the three ordinary spec files;
their final scheduling benefit must be assessed without the clock change.

Main advanced during the audit to `430f46609e`. Merge `4701e7a7cb` retained its
three native-detail batches and verification reminder fixes. The merged financial
suite passed 35 cases locally before withdrawing the clock; final validation uses
the updated 35 cases. The two added identities come from upstream batching,
not reduced coverage. The merge's staged tests, i18n and native permission gates
passed. The original baseline and all unsuccessful measurements remain above.

## Unit shard correctness: duplicate and missing files

This is a correctness failure: CI can be green while tests were omitted. The
user assigned this repair here after PR #1958 reverted its workflow edits.
The other agent supplied concrete evidence through Orca; the JUnit and cache
logs were independently checked in the named worktree.

[Test 46130053600](https://github.com/qixing-jk/all-api-hub/actions/runs/46130053600)
at `c0203e33d669ccb8dab951c0b03b6b9e82053930` passed every shard and merge job.
Shard 2 restored `unit-test-durations-46112807572-1`; shards 1, 3 and 4 restored
`unit-test-durations-46129396704-1`. Its JUnit contains 2,143 file records but
only 1,653 unique names: 490 duplicate records. The native and Krill key-resource
field-policy test files are absent. Source evidence remains at
`G:/Development_Data/WorkSpaces/orca/all-api-hub/pr-1958-feedback/.scratch/pr-1958/artifacts/`
(`shard-1.log` through `shard-4.log`, `ci-tests-initial/test-report.junit.xml`).

Root causes: each unit shard independently restored a moving cache prefix, and
`check-unit-test-reports.mjs` checked report presence/data but not file identity.
The existing test fixtures even treated the same file in two shards as valid.

The final workflow resolves the timing cache once in `unit-test-profile`, writes
an explicit empty profile on a miss, and uploads one artifact consumed by every
shard and ordinary failed-job retry. Explicit comparison cache keys remain
supported. The producer needs no checkout, dependency install or browser.
The merge uses `vitest list --filesOnly` to obtain the configured file/project
inventory without executing tests, then checks its exact equality with the
reported files. Duplicate, missing, unexpected, invalid or empty inventories fail
before complete coverage/timing publication. Distinct Vitest projects remain
distinct. Both coverage and JUnit Codecov uploads require a complete result;
partial artifacts remain available for diagnosis. Assertion failures with a
complete inventory still retain their coverage and continue to fail CI normally.

| Correctness scenario | Executed check | Result |
| --- | --- | --- |
| Cache changes between shard launches or before a retry | Actual Vitest CLI on 18 files and two differing duration profiles | Red with independent cache restores; green with frozen artifact; every file runs once |
| Duplicate file in otherwise complete shard reports | Actual report-guard CLI | Previously emitted complete=true; now fails with complete=false and no timing output |
| Missing file while every shard has valid tests/coverage | Actual CLI with independent expected inventory | Fails and names the missing editor file |
| Multiple projects, unexpected/empty/duplicate expected identities | Report-guard CLI | Accepted only for exact file/project coverage |
| Failed assertion, valid coverage and exact actual inventory | Real Vitest shard/merge plus list CLI | Coverage retained; merged test command remains failed |
| Cache miss or restored profile | Actual workflow initialization command | Empty profile is explicit; existing bytes are preserved |
| Producer failure, release bypass, cancellation and explicit cache pins | Existing scheduling checks | 79 passing checks |

`pnpm test:ci:scripts` passed 81 checks; unchanged shard-planner/sequencer checks
passed 38 checks. Red/green evidence is in `artifacts/unit-{duplicate,missing,profile}-red.log`,
`unit-report-guards-green.log`, `unit-ci-cli-guards.log` and `unit-ci-scheduling-final.log`.

Audit of other consumers: E2E smoke and browser compatibility already consume
one run artifact from the shared build producer. Their planner inventories and
the six hosted E2E reports were checked for omissions/duplicates. No equivalent
moving-cache read was found there. Compiled-module/browser caches do not select
test membership. The E2E timing writer tolerates incomplete old measurements;
unknown files receive median weights from the same frozen input. This affects
packing, not membership. This audit does not assert every historical run was
complete or add a new cross-workflow scheduling framework.

The earlier controlled unit comparison used a fixed cache key. Its retained
candidate JUnit was rechecked: 2,143 records, 2,143 unique files, zero duplicates.
Its results remain applicable to that revision. The faulty PR #1958 run is not
valid full-suite or coverage evidence and must be rerun after the fix reaches it.

### Final unit CI validation

[Test 46133677647](https://github.com/qixing-jk/all-api-hub/actions/runs/46133677647)
passed on `71ee31efa82f5a26e09e68d8be0c59d969603997`: 35,125 tests passed,
two existing skips, 2,144 unique test files. The independent JUnit comparison
matches all 2,144 files from the current Vitest collection inventory, including
both editor files absent from PR #1958. The hosted guard separately verified
file/project identities before coverage and JUnit uploads, both of which succeeded.

The profile producer ran for 5s and resolved cache
`unit-test-durations-46129396704-1` once. All six shard logs confirm artifact
`15258464903`, digest
`570a3afac79ade3727cba790b9eeef68ced0b3000962a5e2f025b99336543fce`.
This proves equal inputs in this complete run; the actual-CLI regression covers
an intervening cache update and a repeated shard. No real failed-job rerun was
needed because the final Test run passed on its first attempt.

Workflow wall time was 508s, the slowest unit execution step 328s, six execution
steps summed 1,609s and all job durations summed 1,990s. These timings accompany
the correctness result; they are not a controlled speed comparison with the
earlier base because main/test inventory, restored profile and runner allocations
changed. Global coverage passed (statements 97.37%, branches 93.71%, functions
98.33%, lines 98.47%).

The final local financial run after withdrawing the clock passed 35/35 cases,
with zero test/startup retries. Keep `financial-final-no-clock.{json,log}`,
`hosted-final-unit/`, `final-unit-{all-jobs,merge,profile-job}.log`, the final run/job
snapshots and `verify-final-hosted.py` locally through review. The corrected
workflow, report CLI and regression checks are the durable prevention; no new
agent rule or memory update is needed.

### Final E2E validation and review decision

[E2E 46133680401](https://github.com/qixing-jk/all-api-hub/actions/runs/46133680401)
passed on the same implementation `71ee31efa8`: 1,002 passes, the same seven
existing skips, zero test retries and zero fixture-startup retries. All 1,009
test identities exactly match an independent final `playwright test --list`
collection; there are no duplicate or missing identities. `--list` does not
execute conditional skip statements, so runtime skipped identities were separately
checked against the prior complete run and match exactly. All 196 expected default
specs are present. Firefox, DNR, bookmarks and isolated performance tests passed.

| Hosted outcome | Fixed main baseline | Prior candidate | Final implementation |
| --- | ---: | ---: | ---: |
| Workflow wall time | 891s | 866s | 938s |
| Slowest default smoke step | 722s | 775s | 753s |
| Six smoke execution steps, sum | 3,686s | 3,448s | 3,862s |
| All job durations, sum | 4,576s | 4,287s | 4,755s |
| Financial longest file span | 455.30s | 502.90s | 290.62s |
| Financial cumulative case work | 454.67s | 502.11s | 563.26s |

Final financial spans are 290.62s for 12 lifecycle/matrix cases, 167.05s for
15 display cases, and 106.26s for eight typography cases. The two additional
cases are upstream's detail batching; build content, timing profiles and runner
allocations also changed. These figures do not establish overall CI improvement
or isolate the split's hosted cost. Keep the ordinary file split for local feedback
latency and smaller worker tails, but do not advertise a whole-run speedup.
The clock experiment is rejected on the actual CI evidence above.

Review recommendation: retain the verified startup/HTTP teardown fixes, optional
density captures, scoped independent cases, and unit shard correctness repair.
The remaining Windows launch timeout under host contention is an explicitly open
P2 investigation, not repaired by passing hosted runs. The historic Firefox
greeting failure also remains unexplained. No retries or deadlines were increased
by this round, and no PR was created. Final source changes were committed and
pushed; this report-only follow-up records completed remote evidence.

Keep `hosted-final-e2e/`, `hosted-final-e2e-summary.json`, final run/job snapshots,
`final-e2e-expected.json` and `verify-final-hosted.py` in ignored artifacts through
review. Earlier failed experiments remain useful evidence for the rejected clock
approach and the unresolved local startup issue. Preserve the unrelated
`.scratch/browser-tab-site-favicon/` directory.

## Branch finishing after current main integration

Published history was retained. Merge `19ebed1211` integrates main `d05e7cf117`
without conflicts. Upstream moved native-editor policies and centralized catalog
discriminants without changing the CI, browser-fixture or render-provider
contracts consumed here. Documentation now explains the frozen unit profile,
exact inventory guard and optional density captures. The branch remains
`perf/pr-ci-throughput`, targeting `main`; no PR was created.

A TypeScript AST check against that main revision confirms all 21 non-import
top-level statements in the original financial spec are identical across the
three final files. Original clock calls are unchanged; the rejected search-clock
experiment contributes no final calls. The check is retained as
`artifacts/finish-financial-equivalence.json`. No production source is changed
relative to current main.

Both workflows ran on `f078dc52a748a86b2c150a825183a94a20dbd60e`:

- [Test 46137132554](https://github.com/qixing-jk/all-api-hub/actions/runs/46137132554)
  passed: 35,125 passing tests, two original skips and all 2,144 independently
  collected files exactly once. All six shards downloaded artifact `15260406452`
  with digest `062627f6556dd2d4b9fddd9d47b83f5e8a32bf6afc7353e253b026df25c330ce`.
  Coverage and JUnit upload guards passed; global coverage stayed 97.37%
  statements, 93.71% branches, 98.33% functions and 98.47% lines. Wall time was
  518s; unit steps had a 361s maximum and 1,921s sum.
- [E2E 46137137445](https://github.com/qixing-jk/all-api-hub/actions/runs/46137137445)
  default Chromium reports contain 1,002 passes and the same seven skips. All
  1,009 identities across 196 files exactly match independent smoke collection,
  with no duplicates, missing cases, test retries or fixture-startup retries.
  DNR, bookmarks and isolated performance passed. First-attempt wall time was
  956s, smoke steps had a 732s maximum and 3,471s sum. Financial work was 475.76s,
  with a longest file span of 232.16s. These remain observations with different
  base/profile/runner inputs, not proof of whole-CI speedup.
- Firefox first attempt passed 19 cases and failed the native-sidebar handoff
  case during fixture initialization, before its test body. The embedded HTML
  report locates the failure in `connectRdp`'s initial greeting promise:
  `Firefox debugger disconnected` after 4.65s of fixture setup. There was no
  screenshot because no extension adapter had been created. The Firefox suite,
  fixture, RDP transport and product inputs are unchanged relative to main.
  The original case passed ten local repetitions in Firefox 157.0.1 with no
  retries. A rerun of only the failed remote Firefox job passed all 20 cases,
  making workflow attempt 2 successful. Neither result establishes the cause or
  fixes the intermittent greeting disconnect. No retry or deadline was added.

Retain the first Firefox log, HTML report, extracted failed-case steps, local
repeat log and remote rerun log as `artifacts/finish-firefox-*`. The independent
inventories, JUnit, six Chromium JSON reports, run/job snapshots and summaries
remain under `artifacts/finish-*`, with `verify-finish-hosted.py` reproducing the
inventory checks. `run-46137137445.json` preserves the failed first attempt;
`finish-e2e-attempt2.json` records the successful retry without overwriting it.

Pre-commit documentation checks and pre-push compile/Knip passed. Related-issue
searches covered titles, bodies and comments for CI, E2E, sharding, missing tests
and timeouts; no matching issue warrants a closing reference. The report and
rejected-experiment decisions remain in Git; raw evidence stays local through
review, and unrelated scratch is preserved. Regression protection lives in the
existing CLI tests; no additional agent rule or memory entry is needed.


## PR 1960 feedback repairs

Review baseline: `5632277f8e1015dbad867b8a705b9499d8fe7857`, based on
`d05e7cf117468050a19662690406ae7c9106c733`. This follow-up corrects the
closed-context claim above: the old assertion accepted a timeout message that
merely contained a cached worker's "closed" error. Published history is retained.
The initial full collection and pre-push collection include all annotations and
report no collection errors or uncovered coverable lines.

| Source / outcome | Before | Repair and local evidence |
| --- | --- | --- |
| Review 4726798117: reused profile | Separate files can launch the same profile concurrently, including with `--workers=4`. | Cap the Chromium project at one worker whenever `AAH_E2E_USER_DATA_DIR` is set. The real CLI regression fails on the old config and passes on the repair, verifying two files finish in the same worker. Normal isolated-profile scheduling is unchanged. |
| Review 4726798120: default captures | The capture CLI supplies JSON `null`; the spec tries to iterate it. | Apply the same nullish default as the capture helper. Actual CLI failure retained in `artifacts/pr1960-capture-null-red.log` and its referenced run log. |
| Review 4726798123: context captures | After fixing null, readback fails with ENOENT for `-context.json`. | Read the helper's `.context` artifacts. Default captures contain exactly 12 checkpoints; explicit `dark:390x900` contains six. PNG dimensions and metadata readback pass in both real browser runs. See `artifacts/pr1960-capture-validation.json`. |
| Review 4726798131: closed context | The strengthened original E2E consumes its five-second deadline and fails. | Check the browser's public context list before worker lookup and polling. The closed and unresponsive worker cases each pass three real Chromium repetitions; the 28 startup unit cases also pass. |
| Review 4726798133: density commands | The documented CLI omits required `--grep` and exits before running. | Both exact documented commands pass, producing 12 settings and 39 secondary-surface screenshots. |
| Review body 6097518616: moved baselines | Old custom workflow identity includes the previous spec path. | Document recapture without `--baseline`, then manual checkpoint pairing with `visual:compare` under matching fixture/environment/provenance constraints. |
| E2E job 140962882388: currency timeout | Both attempts exceed the body budget while traversing 41 accounts (62.9s/64.5s including fixture setup). Trace shows steady search/assertion progress, followed by teardown closure. | Extend the existing 15-site detail batching to converted balances; retain reload, Popup and Side Panel checks separately. No timeout/retry increase, clock manipulation or assertion deletion. All converted account expectations remain covered. Three repetitions of the four currency cases pass; final regression also covers the complete financial-fixture file. |

The capture artifacts are runner correctness evidence on unchanged product UI,
not new visual acceptance claims: `.scratch/visual-captures/run-5ab0ix`,
`run-CxZfoP`, `run-rYfy0A`, and `run-1CuanE`. Keep these and `artifacts/pr1960-*`
through review. The 82 script tests pass, including the frozen-profile and exact
inventory regressions. The financial batching adds three fixture setups, trading
some cumulative execution cost for bounded per-case work; it is not claimed as a
whole-E2E speedup.

P2 stability gap: the same hosted job's 1280px density case failed once while
Key Management still showed "Loading scopes"; its retry passed. The retained
error context and retry trace show a mocked New API route, but the first attempt
has no trace and does not establish the cause. One focused local run and six
more repetitions with two workers pass without retries. No speculative product,
timeout or mock change is made. Owner: `e2e/densitySettings.spec.ts` and native key
scope loading. A failing-attempt trace plus a reproducing regression is needed
to close this intermittent failure. The historical Firefox greeting and Windows
launch gaps above also remain open. These stability gaps are separate from
exact-head check success and bot thread acceptance.

Remote reconciliation is pending for the repair commit. Inline replies must
follow terminal review of that head and fresh thread collection; bot closure is
not implied by local fixes. No durable instruction change qualifies: regression
protection belongs in the existing tests and tooling.
