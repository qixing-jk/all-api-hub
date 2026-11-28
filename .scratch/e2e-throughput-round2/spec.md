# E2E throughput, second round

Baseline: merged main `fb66c34006e76f262b867190295967c6f0b1690b` (2026-11-28).
Branch: `perf/e2e-throughput-round2`. Preserve unrelated favicon scratch.
Previous round: ../pr-ci-performance/spec.md and its retained PR 1960 evidence.

Goal: lower PR feedback latency and eliminate proven internal waiting defects
with small, measured changes. Keep coverage, isolation, assertions, deadlines and
retry policy. Existing agreed seams remain actual CI/runner CLI, public browser
fixtures and implicated original E2E workflows. Local experiments precede any
remote comparison. Prior authorization for an experimental branch and Actions
comparisons remains available; this request does not ask for another PR yet.

## Retained changes and acceptance

1. Search once per site type in the native financial state matrix, then assert
   each exact account row's zero, missing and stale state. All site types,
   amounts, persistence, cleanup and optional screenshot checkpoints remain.
   This removes two real search/debounce cycles per type without mocking time.
2. Run the isolated performance file after the short bookmarks permission suite.
   Download the default extension separately and keep one worker, separate output
   and the existing failure/cancellation behavior. No new job or runner is added.
   The merged-main run spent 805s on shard 2 then 78s on performance, while the
   bookmarks functional step took about 20s. Moving that tail has a concrete
   scheduling benefit; the whole workflow still depends on its other shards.

| Contract | Validation | Result |
| --- | --- | --- |
| Same native state assertions with fewer searches | Chromium, one worker, zero retries, repeat each 3, same test/build | Baseline 38.579/37.712/37.171s; grouped 19.003/18.874/18.459s. Median 37.712 to 18.874s (-50.0%). Entire command 118.465 to 61.282s. |
| Full financial file, including persistence and unrelated-account preservation | `pnpm exec playwright test e2e/devFinancialFixtures.spec.ts --project=chromium --workers=1 --retries=0 --reporter=json` | 15 functional cases plus build passed, no skips/failures/retries; 171.376s. |
| Performance isolation, default artifact, failure/cancel scheduling and job deadlines | Existing `tests/scripts/ciScheduling.test.ts` | Changed scheduling expectation failed against the old workflow; all 79 cases passed after implementation. |
| CI scripts remain consistent | `pnpm test:ci:scripts` | 82/82 passed. |
| Optional zero/missing/stale captures remain available | `pnpm visual:capture --spec e2e/devFinancialFixtures.spec.ts --grep 'native observation states' --fixture native-observation-states-v1 --expect-checkpoint native-state-zero --expect-checkpoint native-state-missing --expect-checkpoint native-state-stale` | Passed; all three declared checkpoints captured and inspected in `../visual-captures/run-plzTwq/`. Zero remains $0.00, missing remains Unavailable, stale retains $12.30 and its stale marker. |
| Hosted job placement, complete inventory, retries and elapsed time | Experimental branch E2E workflow | Pending. Local evidence alone does not establish hosted stability or total CI improvement. |

Production UI and extension API behavior do not change. Chrome is the affected
smoke runner; hosted Firefox smoke will also run unchanged. Local raw results:
`artifacts/states-{baseline,grouped}.json`, `financial-final.json`,
`scheduling-{red,green}.log`, `scripts-green.log`.

## Experiments and exclusions

Initial ranked experiments after the first trace:

1. Reduce motion only in geometry-focused density tests. Baseline 1280px case
   takes 34.7s locally, with 17.7s in assertions after repeated navigation.
   Prediction: native reduced-motion support removes entry/exit transitions,
   reducing time without changing density geometry or assertions. Use the same
   three viewport cases before/after and keep transition-specific E2E unchanged.
2. Financial matrix setup and search cost. Currency batch 1 takes 8.8s locally;
   assertions/search are the majority. Prior clock acceleration was rejected on
   hosted failures. Inspect the full file before introducing further abstractions
   or repeating that experiment.
3. Shared page-root wait has a fixed 300ms fallback on Popup/Side Panel. Measure
   its aggregate share and test readiness semantics before changing it.

Rejected initial hypothesis: most extension tests do not record failure videos.
The custom persistent context bypasses Playwright's default _contextFactory,
which owns video activation/retention. Changing global video config cannot be
credited as a speedup for these cases without separate evidence.

Reduced motion in density tests was also rejected. The same three viewports,
repeated twice with one worker and zero retries, took 180.642s normally and
196.896s with reduced motion. Baseline individual cases:
34.453/32.277/27.301/28.405/26.644/27.666s; reduced motion:
30.666/26.295/26.390/34.269/31.099/41.690s. The trial is fully reverted.
Evidence: `artifacts/density-{baseline,reduced}.json` and both trace directories.

Keep the 13s CAPTCHA grace-period scenario: its wait exercises a deliberate
unknown-state contract. Do not repeat the earlier page-clock shortcut that failed
hosted CI. The shared 300ms page-root fallback is only a future hypothesis until
a safe readiness contract and matched measurement justify a change.

Unresolved prior-round stability gaps remain: density 1280px once stalled at
"Loading scopes" on a hosted runner; local repeats and retries did not establish
a cause. Historical Firefox RDP greeting disconnects and contended Windows
browser launches also lack a reproduced root cause. This round does not claim
to fix those defects or increase their timeouts.

## Hosted comparison and evidence retention

Evidence retention: artifacts/ contains local trace and timing samples plus
hosted JSON reports; keep through review. The pre-merge main run 46142437808 is
profiling context only, because its source differs from the new baseline. The
merge push run [46144798322](https://github.com/qixing-jk/all-api-hub/actions/runs/46144798322)
completed successfully on the baseline, in 16m55s. Its six duration reports have
no unexpected or flaky cases; the native state matrix took 49.390s. The saved
jobs and reports are under `artifacts/main-merged*`. The next run may restore an
updated duration profile and use different runners, so total wall-clock changes
are observations, not a controlled causal estimate. Compare the full case
inventory and record retry failures even if the workflow is green.

Preserve this spec and the scoped ignore rule in Git. Keep raw timing, trace,
capture and hosted reports locally through review; do not delete unrelated
`.scratch/browser-tab-site-favicon/` material. Review recommendation: the two
retained changes have local support; hosted acceptance remains outstanding.
