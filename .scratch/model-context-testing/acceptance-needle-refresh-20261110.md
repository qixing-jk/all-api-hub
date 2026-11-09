Archived acceptance record. Revision, results and local-only limitations below describe the original run, not the current PR head. Generated logs and browser outputs remain under the corresponding ignored artifacts directory.

# OpenCode context classification after needle merge

Date: 2026-11-10 (Asia/Singapore). Scope: refresh temp16 after PR #1845 and validate the shared classifier with both consumers. All inference requests used mocked fetch or loopback HTTP servers and synthetic credentials. No live provider calls or remote writes.

## Revision and integration

- Before: `92f015453a57b58b8e3ca7e015f100c1b324dea3`, preserved by `recovery/temp16-before-needle-refresh-20261109`.
- Previous merge base: `69f81879a0c8a75158c78b531df0cdbd6fb60c9b`.
- Fetched base: `2593b399a2e47a196aa753c9862fecaed60045bd` (merged #1845, also includes #1846). GitHub main still matched this SHA at final verification.
- Strategy: rebase unpublished local commits. OpenCode commit became `28461e2111`; final regression/record commit is `44660484e0ed6d26364296e25a4dd8cc67c549f6`.
- Final status: clean, 9 ahead / 0 behind origin/main, no remote branch contains the final head.
- Conflict resolutions retained main's `ContextCounterInfo` owner, input-limit helpers and the summary-scoped E2E locator while preserving the streaming-overflow scenario.
- `contextCapacityRun.ts` and `needleRun.ts` exactly match main. Classifier, dependency/lock, original context regression file and research files exactly match the recovery revision. Range comparison (local artifact) records changes absorbed by main and the new regression.

## Behavior acceptance

| Outcome / consumer | Before / expected | Evidence | Result |
| --- | --- | --- | --- |
| Needle statusless SSE overflow | Main classifier records generic error; OpenCode records context-limit for the first cell, stops the plan after one request and does not retry | `needleRun.test.ts`: records a statusless SSE overflow as a context limit and stops the needle plan without retrying; red (local artifact), green (local artifact) | Passed; baseline failed specifically on error versus context-limit |
| Capacity request classification | Original SSE, structured/nested payloads, additional wording and context-specific 413 still reduce input; ordinary auth/rate/server/runtime/output-parameter errors remain inconclusive | `contextCapacityRun.test.ts` and runner tests (local artifact) | Passed |
| Capacity planning and needle retrieval | Preserve declaration hints, token counting, budgets, retrieval outcomes, selected coordinates, cancellation and no automatic retries | Six modelQuality files, runner tests (local artifact) | 139 passed |
| Account/API credential and webpage consumers | Preserve request modes, hooks, history, checkpoints, background dispatch and cancellation | Ten consumer test files, consumer tests (local artifact) | 238 passed |
| Credential capacity UI | HTTP bounds, budget continuation, truncated output, inconclusive results and statusless SSE reduction use selected credentials and the new summary layout | Five `contextCapacity.spec.ts` cases, browser log (local artifact) | Passed |
| Webpage capacity and needle | Probe-derived plan, persisted results, cancellation, worker-stop recovery without replay for both operations | Four `contentWebAiApiCheck.spec.ts` cases, browser log (local artifact) | Passed |
| Native needle and account credential | Cross-page ownership; whole/row/cell/column stop; streaming stops; selected-row retests; masked key reveal only when run | Eight `needleTest.spec.ts` cases, browser log (local artifact) | Passed |

The statusless payload is a derived fixture, not a claimed live capture. Capacity reduction and needle plan termination intentionally retain their separate behavior. No new UI implementation or visual design change was introduced.

## Executed commands

- Red: `pnpm exec vitest run tests/services/modelQuality/needleRun.test.ts -t 'statusless SSE overflow'`, with only the working classifier temporarily loaded from origin/main and restored in finally. Result: 1 expected failure / 36 skipped.
- Runners: `pnpm exec vitest run tests/services/modelQuality/contextCapacityRun.test.ts tests/services/modelQuality/contextCapacity.test.ts tests/services/modelQuality/contextCounter.test.ts tests/services/modelQuality/needleRun.test.ts tests/services/modelQuality/needlePlan.test.ts tests/services/modelQuality/needlePrompt.test.ts --maxWorkers=2`. Result: 139 passed.
- Consumers: `pnpm exec vitest run tests/services/aiApiVerification/probeGeneration.test.ts tests/services/aiApiVerification.modes.http.test.ts tests/services/webAiApiCheck/contextCapacityCheckpoint.test.ts tests/services/contextCapacityHistory.test.ts tests/features/Verification/api/useContextCapacity.test.tsx tests/services/modelQuality/needleCheckpoint.test.ts tests/services/modelQuality/needleHistory.test.ts tests/services/webAiApiCheck/needleClient.test.ts tests/services/webAiApiCheck/background.test.ts tests/features/Verification/api/useNeedleTest.test.tsx --maxWorkers=2`. Result: 238 passed.
- `node --max-old-space-size=8192 node_modules/typescript/bin/tsc --noEmit --incremental`: exit 0. Used the previously required per-process 8 GiB heap; default-heap compilation was not rerun or claimed. Log (local artifact) is empty because the successful compiler emitted no text.
- `pnpm knip`: exit 0, log (local artifact).
- Targeted Prettier check and ESLint: passed. Commit hook passed formatting, ESLint, the 37-test needle file, applicable token checks and commitlint; unrelated conditional gates skipped by their scripts.
- `pnpm exec playwright test e2e/contextCapacity.spec.ts e2e/needleTest.spec.ts e2e/contentWebAiApiCheck.spec.ts --project=chromium --workers=1 --grep 'capacity probe|web context probe|web needle test|interrupted webpage (context|needle)|native needle|account needle' --output=.scratch/model-context-testing/artifacts/needle-refresh-20261110/browser-run`: 18 passed = 1 build + 17 Chromium scenarios, first run, no retries. Log (local artifact), artifacts (local artifact).
- `git diff --check origin/main...HEAD`: passed. Blob comparisons and range-diff checked feature preservation.

## Build and limits

WXT 0.21.5 / Vite 8.3.6, default Chrome MV3 test build. Recorded head is the final `44660484e0ed6d26364296e25a4dd8cc67c549f6`; input hash is `bb951d1a179ebac1f9d93d33de2c4fa7d0f210a8860fd58a77bb2b54d848259f`. Recomputed using the repository build-input helper: verification (local artifact).

No full suite, remote CI, Firefox/Safari or paid-provider validation was run. Browser screenshots are retained as execution evidence; no visual comparison is claimed or required for this behavior-only integration.

Retention: source, tests, dependency lock and the dated entry in `spec.md` remain tracked. This ignored evidence directory, original OpenCode acceptance and earlier research artifacts remain local for review. No cleanup or changes in temp14 were performed.
