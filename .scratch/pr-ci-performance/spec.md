# PR CI throughput and timeout investigation

Baseline: `137403eef477625f343c068a0cc27de2a25a0f55` (2026-11-28).

The goal is shorter, reliable PR feedback with measured benefits and little added
maintenance. Keep test coverage, assertions, isolation, and existing deadlines.
The agreed test boundaries are the actual CI CLIs, shared browser fixtures, and
the existing failing browser workflows. Generated evidence stays in `artifacts/`.

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
| Lower PR CI duration | Fixed-input before/after measurements; distinguish local and hosted results | Local subset gains measured below; hosted comparison pending |
| Retain behavior and failure detection | Existing affected unit/E2E cases, no fewer assertions or raised deadlines | 167 affected unit/component checks; four E2E files repeated twice, 139 passes including build, zero retries |
| Repair internal timeout causes | Reproduce current failure before changing its owning logic | Fresh/cached hung probes and closed-context polling fail before fixes; 28 startup checks pass after |
| Low complexity | Reuse existing helpers; reject experiments without measurable benefit | Direct import, scoped parallel modes, split existing scenarios, bounded existing probe; no new CI layers |

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

- Keep the existing six runners, four workers, coverage thresholds and CI steps.
  Setup/build caches are already effective; no added job or cache layer is justified.
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
  unused ignore-pattern hint. Full hosted coverage and before/after CI remain
  pending. No remote branch has been published.

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
