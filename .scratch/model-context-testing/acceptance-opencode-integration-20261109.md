Archived acceptance record. Revision, results and local-only limitations below describe the original run, not the current PR head. Generated logs and browser outputs remain under the corresponding ignored artifacts directory.

# OpenCode context classifier acceptance — 2026-11-09

Scope: temp16, working changes from `d1c46b4f1b96a8d87970fee0def8183299eff165`. Fetched origin/main before implementation: 7 commits ahead, 0 behind. All requests used synthetic credentials with mocked fetch or loopback HTTP servers. No real model calls, push, or temp14 changes.

Committed as `92f015453` (`fix(verification): use OpenCode for context overflow classification`). Final worktree is clean. The commit hook passed formatting, ESLint, the staged regression file, i18n, token lint and native browser permission-warning checks (1 build + 1 browser check). Hook edits were formatting only.

## Behavior and evidence

| Outcome | Before | After / evidence |
| --- | --- | --- |
| Original user SSE after PING comments | Recognized by migrated repair | Preserved; `contextCapacityRun.test.ts`, context-tests.log (local artifact) |
| SSE overflow code without status | Inconclusive; stopped without reducing input | Decreases 2048 → 1024 and confirms acceptance; red-stream-code.log (local artifact), green-stream-code.log (local artifact), final context tests, browser SSE case |
| Multiline and additional provider wording | Old status gate / narrow regex missed valid signals | OpenCode recognizes multiline original-message projection, Z.ai and Nova wording; final context tests |
| Nested streamed code omitted from summary | Minimal adapter initially lost payload | Original payload preserved; red-stream-payload.log (local artifact), green-stream-payload.log (local artifact) |
| HTTP response body, parsed data, context-specific 413 | Narrow status/text handling | Uses OpenCode classification of raw body/data, including Cloudflare 413; final context tests and browser HTTP cases |
| Request byte limit with request_too_large | Inconclusive | Follows OpenCode recoverable overflow. This bounds the current connection's tested input, not independently the model token window; final context tests |
| Auth, quota/rate limit, generic payload size, server failures, empty/unknown error and Groq max_tokens restriction | Inconclusive | Remain inconclusive; no SDK automatic retry or new local status veto; final context tests |
| Non-provider runtime exceptions | Inconclusive | Remain inconclusive even when text resembles overflow; final context tests |
| Accepted/empty/truncated output, cancellation and budget continuation | Existing behavior | Preserved: 84 context tests and 67 consumer tests; consumer-tests.log (local artifact) |
| Account and API credential verification consumers | Shared useContextCapacity → runContextCapacity | Shared hook/history/runner tests; credential options-page Chromium tests |
| Webpage consumer and MV3 worker | Background runner, durable checkpoints | Progress/bounds/cancellation and worker-stop recovery without replay passed in Chromium |

Tests are not classifier accuracy measurements. The original user SSE has session provenance; changed envelopes, statusless code and nested shapes are derived fixtures. Additional provider phrases follow the fixed OpenCode 2.2.6 published classifier. Groq's output-parameter message is the unmodified reported message from https://github.com/anomalyco/opencode/issues/1000. The previous synthetic 401/403/429 + overflow combinations are not evidence of real misclassification and do not justify local veto logic.

## Executed checks

- `pnpm exec vitest run tests/services/modelQuality/contextCapacityRun.test.ts tests/services/modelQuality/contextCapacity.test.ts tests/services/modelQuality/contextCounter.test.ts`: **84 passed**, context-tests.log (local artifact).
- `pnpm exec vitest run tests/services/aiApiVerification/probeGeneration.test.ts tests/services/aiApiVerification.modes.http.test.ts tests/services/webAiApiCheck/contextCapacityCheckpoint.test.ts tests/services/contextCapacityHistory.test.ts tests/features/Verification/api/useContextCapacity.test.tsx --maxWorkers=2`: **67 passed**, consumer-tests.log (local artifact).
- `pnpm knip`: **passed**, knip.log (local artifact).
- `pnpm compile`: failed at the default approximately 4 GiB Node heap limit, compile.log (local artifact). Retried the same TypeScript check as `node --max-old-space-size=8192 node_modules/typescript/bin/tsc --noEmit --incremental`: **exit 0**. No persistent/global heap setting was changed. Default-heap compilation is not claimed to pass.
- `pnpm exec playwright test e2e/contextCapacity.spec.ts e2e/contentWebAiApiCheck.spec.ts --project=chromium --workers=1 --grep 'capacity|web.context|interrupted.webpage.context' --output=.scratch/model-context-testing/artifacts/opencode-integration-20261109/browser-run`: **8 passed = 1 build + 7 Chromium scenarios**, browser.log (local artifact), browser artifacts (local artifact).
- Browser build: WXT 0.21.5 / Vite 8.3.6, Chrome MV3 test build. Build input hash `2e3e0ee8663e2c7bfc6208a4e55770894ed0d4c168d2e486e8299d2914dc1ae9`; metadata records the pre-commit HEAD plus the working input hash. This is working-change evidence, not a claim of a committed-head build.

No rendered UI code changed, so no visual baseline comparison is required. Existing E2E screenshots remain available for review. No Firefox/Safari runtime, live provider, CI, or remote PR acceptance is claimed. The default-heap compiler failure is retained as a tooling limitation rather than hidden by the successful retry.

## Retention

Preserve implementation, regression tests, exact dependency/lock, and the current decision in `spec.md` in Git. Keep this ignored directory (including red/green and compiler failure evidence, browser results and screenshots) local for review. Keep the earlier SDK research and experimental directory unchanged. No deletion was performed.
