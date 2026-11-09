Archived acceptance record. Revision, results and local-only limitations below describe the original run, not the current PR head. Generated logs and browser outputs remain under the corresponding ignored artifacts directory.

# Context stream-error adaptation acceptance

Date: 2026-11-10 (Asia/Singapore). Starting head: `44660484e0ed6d26364296e25a4dd8cc67c549f6`. Fetched `origin/main` and confirmed base `2593b399a2e47a196aa753c9862fecaed60045bd` remains an ancestor (0 behind). Requests used mocked fetch or a loopback HTTP server with synthetic credentials. No paid model calls or remote writes.

## Behavior and evidence

| Scenario | Before | After and assertion |
| --- | --- | --- |
| Compatible SSE nested `innererror.code` | SDK strips the nested code; capacity becomes inconclusive after one request | `contextCapacityRun.test.ts`: nested upstream code preserved through SDK parsing; input reduces 2048 to 1024 and confirms the accepted point |
| Native Responses statusless overflow | SDK infers 500; OpenCode treats it as a server error | Same file: transport evidence before output, after output and `response.failed`; context-limit with an observed rejected upper bound |
| Genuine HTTP failure or explicit streamed status | Must remain inconclusive | Same table: actual HTTP 500, streamed code 500 and ordinary server_error do not claim an upper bound |
| Needle consumer | Missing nested/Responses evidence produces a generic error | `needleRun.test.ts`: three SSE forms record context-limit, process one cell and send exactly one request |
| Request state isolation | No response evidence shared between requests | Each generation creates a local response observer and retains only its error frame; selected credentials, profiles, headers, cancellation and budgets are covered by existing runner/transport tests |
| Credential UI | Newly recognized failures stopped the capacity probe | Six `e2e/contextCapacity.spec.ts` scenarios pass, including nested SSE and native Responses downgrade, credential selection, fixed output budget, rendered accepted/rejected bounds, budget continuation, output truncation and inconclusive results |
| History and worker checkpoints | Existing no-replay/persistence contracts | Context history and both checkpoint suites included in the 262-test run |

The raw frame is obtained through AI SDK 7 `include.rawChunks` / `onChunk`; no second SSE parser, response body clone, provider retry or alternate request SDK was added. Only an observed successful event-stream response permits normalizing the native SDK's fallback 500, and explicit numeric stream statuses remain authoritative. Model-quality consumers opt into the extra evidence; other verification consumers retain their defaults.

## Red/green record

Commands below were executed before their corresponding implementation changes; their output was captured in the task's tool transcript, not separate log files:

- `pnpm exec vitest run tests/services/modelQuality/contextCapacityRun.test.ts -t 'nested upstream code preserved'`: 1 failed, 52 skipped; expected context-limit plus accepted attempts, received one inconclusive attempt. After the raw-event adaptation the same test passed.
- `pnpm exec vitest run tests/services/modelQuality/contextCapacityRun.test.ts -t 'statusless Responses overflow'`: 1 failed, 53 skipped; expected context-limit, received inconclusive. Passed after observing HTTP response status. The test was then expanded/renamed to the transport-evidence table.
- Expanded transport-evidence table: the after-output case failed while four other cases passed. Normalizing both SDK provider-error classes fixed it. The subsequent `response.failed` case also passed.

## Checks executed

- 12 targeted Vitest files: **262 passed**. Files: `modelQuality/{contextCapacityRun,needleRun,contextCapacity,needleCheckpoint}`, `aiApiVerification.{providers,headers.http,clientProfiles.http,clientProfiles.modes.http,modes.http}`, `aiApiVerification/probeGeneration`, `contextCapacityHistory`, `webAiApiCheck/contextCapacityCheckpoint` (all under `tests/services`, `.test.ts`). Command: `pnpm exec vitest run <these files> --maxWorkers=2`.
- Additional `response.failed` regression: **1 passed**, bringing distinct validated tests to 263. The commit hook also runs staged test files.
- `node --max-old-space-size=8192 node_modules/typescript/bin/tsc --noEmit --incremental`: passed, including a final rerun after all TS/test edits.
- `pnpm knip`: passed. Targeted ESLint on all changed TS files: passed. `git diff --check`: passed.
- `pnpm exec playwright test e2e/contextCapacity.spec.ts --project=chromium --workers=1 --output=.scratch/model-context-testing/artifacts/stream-adaptation-20261110/browser-run`: **7 passed = 1 build + 6 Chromium scenarios**, no retries. Browser log (local artifact); artifacts (local artifact).

Browser build metadata records starting head plus working changes, not the eventual commit head. Input hash: `1cc0b0328aba16c16c247e59ed42c0954ab7ca0257d48dd16ebea9440aea73d2`. WXT 0.21.5, Vite 8.3.6, default Chrome MV3 test build. No UI design/layout changes; screenshots retained by existing tests are execution evidence, not a claimed visual comparison.

Limits: no full suite, Firefox/Safari runtime, real-provider or remote CI validation. Default approximately 4 GiB cold compilation failed during the preceding review, including a control replacing only the classifier with main in memory; no claim that this dependency caused that limit, and no global heap setting was changed.

Retention: implementation, regression tests and the dated feature-spec entry belong in Git. This ignored directory retains local browser evidence for review; previous research and artifacts were preserved.

## Final local delivery

Committed as `3e96d56c65355af682e6b00efb857200c139f4f3` (`fix(verification): preserve context stream error evidence`); working tree clean, not pushed. Commit hooks passed formatting, ESLint, both staged regression files, translation checks, color/typography checks and commitlint. Permission checks were correctly skipped because no manifest inputs changed.

After committing, the repository build-input helper reproduced `1cc0b0328aba16c16c247e59ed42c0954ab7ca0257d48dd16ebea9440aea73d2`, exactly matching the tested browser build. Build metadata retains the starting Git head; this is verified input-equivalent evidence for the committed sources, not a claim that the extension was rebuilt after commit.
