# Dependency refresh and DOM environment evaluation

Baseline: `1740dca289`, 2026-11-10. Scope: dependency maintenance and evaluation of DOM/icon alternatives. Branch publication and CI dispatch were authorized after the local validation below; PR creation is not part of this handoff.

## Scope and acceptance

| Outcome | Before | Expected | Evidence |
| --- | --- | --- | --- |
| Installation matches the lockfile | Local jsdom 27.0.1 versus locked 31.0.0; shell Node 24.14.1 below the project minimum | Use project Node and frozen installation | Node 24.22.2 installed and used through task-local PATH; default fnm selection retained. Frozen install restored jsdom 31.0.0. `artifacts/install.log` |
| Security maintenance | DOMPurify, fast-uri, Zod, PostCSS, lodash-es and undici have advisory matches | Upgrade supported release lines, preserve callers and record audit limits | Upgraded to 3.4.17, 4.2.3, 4.6.7, 8.5.32, 4.18.1 and 7.30.2 respectively. `artifacts/audit-before.json`, `artifacts/audit-after.json` |
| Malformed proxy URLs | Parser accepts percent-encoded HTTP/SOCKS scheme names | Reject invalid schemes at the existing validation boundary | Three new behavior tests failed before fast-uri upgrade; all 36 selected proxy/Markdown/object tests passed afterwards. `artifacts/security-red.log`, `artifacts/security-green.log` |
| Vitest report integrity | 4.0.x blob layout only | 5.1.0 with valid failed-test reports accepted; missing, corrupt, mixed-version and worker-error reports rejected | New 4.1 and 5.1 acceptance tests failed first. All 70 CI tool tests passed, including real passing/failing shards merged to LCOV/JUnit while retaining failure. `artifacts/report-red.log`, `artifacts/report-v5-red.log`, `artifacts/ci-scripts-v5.log` |
| Happy DOM | jsdom DOM group plus Node group | Retain a migration only with compatible representative behavior and measured benefit | Rejected 21.0.4: 197 assertions passed but two unhandled animation cancellations failed the run. Minimal reproduction confirmed difference from Chromium. Production retains jsdom. See below. |
| Brand icon dependencies | Icons 5 pulls UI peers; application consumes individual brand SVG components | Evaluate supported lightweight assets without losing theme behavior | All 41 used icons exist in the static package. Existing individual components already avoid the Lobe UI runtime; static migration still needs theme/gradient treatment. Deferred without claiming bundle savings. See below. |

The existing public test boundaries are MarkdownContent rendering, isValidProxyUrl, and the report-check CLI. UI/library maintenance uses existing affected-behavior tests. Performance experiments must retain test identity, isolation and coverage settings across candidates.

Generated logs and experiment outputs remain local under `artifacts/`. Preserve this entry for measured migration decisions and any unresolved validation gaps; do not remove earlier CI-performance evidence.

## Vitest 5 decision and measurement limits

The user asked specifically about a major upgrade and whether earlier evidence was CI-level. The November 4 experiments were local four-file samples, not Ubuntu full CI. This run likewise does not establish remote CI performance.

Vitest and coverage-v8 are now 5.1.0. Preserve `clearMocks: false`, threads and isolation. Stable filesystem caching defaults on, with `VITEST_FS_MODULE_CACHE=0` as an opt-out. The two inline projects can share the Vite server. The lockfile now has only Vite 8.3.6 rather than a separate Vite 7 dependency for Vitest. CI cache/report paths and both report CLIs moved together; production coverage thresholds were not weakened.

Primary references: [Vitest 5 release](https://vitest.dev/blog/vitest-5.html), [migration guide](https://vitest.dev/guide/migration.html), [Vitest security advisory](https://github.com/advisories/GHSA-5xrq-8626-4rwp). The advisory has UI/API/Browser Mode preconditions; it does not imply ordinary CLI runs are directly exploitable.

Using the existing `benchmark-test-imports.mjs`, run the heavy suite with two threads, isolation, all-source JSON coverage and two alternating rounds of `baseline,module-cache`. Both versions executed the same four files and 218 tests each time. Five displayed test titles changed only in Vitest's interpolation quoting; source cases, mode and outcomes were checked against `artifacts/test-identity-comparison.json`.

| Local process seconds | 4.1.12 | 5.1.0 |
| --- | ---: | ---: |
| Module cache disabled, round 1 | 72.325 | 64.143 |
| First module-cache population | 78.023 | 76.469 |
| Warm module cache | 60.744 | 58.382 |
| Module cache disabled, round 2 | 61.792 | 61.580 |

These are sequential version batches on Windows, not interleaved installations or a CI benchmark. No stable speedup or peak-memory claim is made. The major upgrade is retained for supported tooling, Vite alignment and stable caching after compatibility validation, rather than an asserted CI percentage gain.

Raw reports and runner configuration are in `../ci-runner-performance/artifacts/imports-dependency-v4-20261110/` and `../ci-runner-performance/artifacts/imports-dependency-v5-20261110/`. Reproduce with the matching package versions and `node .scratch/ci-runner-performance/benchmark-test-imports.mjs --suite heavy --ci-reports --variants baseline,module-cache --rounds 2 --label <unique-label>`.

### Coverage difference

Both versions reported 3,142 source files. The number with statement hits was 1,521 versus 1,520. The only file changing hit/no-hit status was `src/services/apiAdapters/krill/keyEditor.ts`: v4 counted its three imported-field aliases at lines 42–44; v5 omits those aliases from `statementMap`. Neither version executed any editor functions in the sampled tests. The transformed v5 module still contains the assignments. This is recorded as a coverage-mapping difference, not erased by lowering thresholds or excluding the file.

The direct Krill adapter suite passed 37 tests under v5 with 48/49 statements and all 18 functions hit in that editor. Evidence: `artifacts/coverage-differences.jsonl`, `artifacts/krill-v5.log`, `artifacts/krill-coverage/coverage-final.json`. Broader branch/statement count equivalence is not asserted.

## Happy DOM decision

The DOM experiment uses nine real component suites: modal, select, date picker, checkbox, switch, modern primitives, composition slots, account form and vendor marks. It preserves test identities, worker count, isolation and coverage settings; it does not include Markdown sanitization tests. DOMPurify's [supported DOM guidance](https://github.com/cure53/DOMPurify#running-dompurify-on-the-server) remains another reason to preserve jsdom for those tests.

jsdom 31.0.0 passed all 197 cases in both rounds (46.157 and 36.802 seconds). happy-dom 21.0.4 passed the assertions but failed the process with two unhandled `AbortError: The animation was canceled` errors from account-form cleanup. A failing candidate's elapsed time is not accepted as a speedup. Raw logs: `../ci-runner-performance/artifacts/imports-dependency-dom-20261110/`.

The [minimal reproduction](animation-cancel-probe.mjs) removes React, Framer Motion and project code entirely. happy-dom rejects an eagerly created animation promise when `cancel()` is called even if the caller never accesses `finished`. Chromium 156.0.8078.4 has no unhandled rejection for that sequence. A positive control that chains `finished.then()` without rejection handling does produce `AbortError` in Chromium. All reproduction assertions passed; see `artifacts/animation-cancel-comparison.jsonl`.

Live upstream verification on 2026-11-10 found [issue #2581](https://github.com/capricorn86/happy-dom/issues/2581) describing this exact 21.0.4 failure and [fix PR #2591](https://github.com/capricorn86/happy-dom/pull/2591), open and not merged at inspection. The fix follows the Web Animations requirement to mark the rejected internal promise handled while preserving rejection for explicit consumers. This independently corroborates the local comparison; the upstream report's Firefox/Safari observations were not repeated here.

Do not add a blanket rejection handler, disable animations globally, or change production animation behavior merely to hide this environment discrepancy. No animation package upgrade is justified by this finding. Retry the DOM migration after the relevant happy-dom implementation changes, then repeat the representative comparison and broader DOM suite. Other real browser engines were not probed.

happy-dom was removed from the project dependencies after the experiment. Its isolated probe installation remains under the ignored `artifacts/happy-probe/`; prerequisites are documented in the reproducer.

## Icon alternative

The official `@lobehub/icons-static-svg@1.102.0` archive is 813,763 bytes, 2,520,794 bytes unpacked, with no runtime dependencies or peers; these are package sizes, not application bundle measurements. All 41 currently imported brand variants are available. Package inventory is retained in `artifacts/icons-package.json` and the archive stays local.

Recursive inspection of all 41 entry components found 83 modules and only three external imports: `react`, `react/jsx-runtime` and `es-toolkit`. The application already imports these components individually; this path does not import Lobe UI or antd. Evidence: `artifacts/icon-import-graph.json`. Replacing them with static files can reduce installed peer dependencies, but requires maintaining `currentColor` behavior and gradient identity/repeated rendering. No runtime size/startup benefit was established, so no production icon change is included. [Official package options](https://github.com/lobehub/lobe-icons#-packages).

## Validation, remaining gaps and retention

Type checking and Knip passed. The 54 selected configuration/security test files passed 746 tests. A full local v5 run completed 1,980 files in 1,488.66 seconds: 1,976 passed, four failed; 30,683 tests passed, 13 failed, one skipped, and one unhandled error was reported. This was a local regression run without coverage, not a CI performance comparison. See `artifacts/full-v5.log`.

The failures were investigated against the original manifest and lockfile, restoring Vitest 4.0.17 and all original dependency versions. All five affected suites passed 51 tests with the existing `AAH_SAFARI_TEST_PYTHON` override set to an installed Python executable (`artifacts/failures-baseline.log`). Final migration changes and checks:

- Twelve Safari test failures came from Windows resolving `python3` to the Microsoft Store placeholder. The existing environment override resolved them; no test was skipped and no Python discovery behavior was changed.
- Vitest 5 rejects two nested Octopus `vi.mock` calls. Moving them to module scope preserves their previously hoisted execution order.
- A minimal literal-object experiment showed that v4.0.17 incorrectly passes an `arrayContaining` nested inside `toMatchObject` when the requested object has missing fields; v5.1.0 correctly fails it. See `artifacts/matcher-probe.test.ts`, `artifacts/matcher-baseline.log` and `artifacts/matcher-v5.log`. The AIHubMix test confused plan-level `meters` with quote-level `meter`. It now independently checks the plan's affected meter and the quote's missing-price issue, preserving the existing pricing implementation and strengthening the intended check.
- The SiteAnnouncements select test left its dropdown open at teardown. Radix's deferred focus restoration then dispatched an event after the DOM environment changed in the full run. The test now closes the dropdown and awaits observable focus restoration. The targeted baseline did not reproduce that asynchronous error, so it is not attributed conclusively to the version upgrade.

After restoring the final upgraded manifest and cleaned lockfile, frozen installation passed. All affected failure suites plus neighboring announcement/select suites passed: 14 files, 108 tests, no unhandled errors (`artifacts/full-failures-rechecked-v5.log`). Type checking passed again and all 70 CI tool tests passed again, including the real failed-shard merge (`artifacts/compile-final.log`, `artifacts/ci-scripts-final.log`). At the first handoff the full 1,980-file suite had not been repeated; its original failed result remains part of the evidence. The follow-up below closes the local coverage gap and records a separate intermittent worker failure.

Implementation commit: `2034b1159`. The commit hook passed formatting/lint, staged behavior tests, i18n, color/typography checks, and the native permission-warning gate. The latter rebuilt the extension and verified its Chromium warnings against the approved baseline (two Playwright tests passed; `artifacts/commit-dependencies.log`). Remote CI and a same-runner old/new CI comparison were still pending at this local-validation checkpoint. Branch publication is now authorized for CI; an old/new performance comparison is not required for this handoff.

### Full sharded validation follow-up

At code head `9ab6413f453966dc2b8a611c1e6f30a8798f4111`, the user asked what remained. The final dependencies and tests were then run locally with the CI workflow's six shards, four threads per shard, isolation, all-source v8 coverage, blob output and unchanged final thresholds. Shards ran sequentially on Windows; no durations manifest was supplied, so the documented file-count fallback assigned the files. Verbose console reporting and separate output directories were used for diagnosis. These differences mean this is local CI-pipeline validation, not Ubuntu CI or a performance comparison. The existing Python override was supplied. Reproduction command: `& .scratch/dependency-refresh/artifacts/run-final-ci-check.ps1` (requires a fresh output directory).

The first pass completed shards 1, 3, 4, 5 and 6. Shard 2 exited after 1,018 passing cases with `Worker exited unexpectedly with exit code 1 during started state` naming `BalanceHistoryOptionFilter.test.tsx`; it produced no blob. The missing-report guard correctly returned `complete=false`, even though merging the five available reports alone exited zero and exceeded the coverage thresholds. Preserve `artifacts/final-ci-20261110/`, including the original failed log, as evidence that merge success by itself does not establish report completeness.

The named file passed all six cases alone with coverage (`artifacts/worker-repro.log`). A full shard-2 diagnostic rerun passed all 330 files / 5,306 cases without a native worker error; the observer was separately checked using a deliberately failing worker. A second full shard-2 run with the original command and no observer also passed 330 files / 5,306 cases. See `artifacts/shard-2-diagnostic-20261110/`, `artifacts/worker-observer-control.jsonl` and `artifacts/shard-2-confirm-20261110/`. No product or test code was changed for these retries. The initial worker failure remains unexplained; the retries are not evidence that its root cause was fixed or that it was necessarily caused by Vitest, coverage or resource pressure.

The five initial passing blobs and the unmodified shard-2 confirmation blob were copied to a fresh directory, preserving every original. `artifacts/assemble-final-reports.mjs` verified matching versions, zero worker errors, successful file outcomes and disjoint file identities. The complete set covers **1,980 files, 30,700 passing cases and one existing skipped case**. Every blob contains coverage for the same 3,142 source files. Input paths and SHA-256 digests are in `artifacts/final-ci-accepted-20261110/summary.json`.

The public report checker accepted all six blobs, published 1,980 local file durations and returned `complete=true`. Vitest merged them into LCOV, JSON, HTML and JUnit and exited zero under the original thresholds. Results in `artifacts/final-ci-accepted-20261110/`:

| Coverage | Result | Required |
| --- | ---: | ---: |
| Statements | 97.17% | 85% |
| Branches | 93.15% | 80% |
| Functions | 98.23% | 85% |
| Lines | 98.32% | 85% |

This local checkpoint established complete passing evidence for full-suite coverage and report compatibility **after retry**. Actual Ubuntu Actions/Codecov acceptance and observation of the unexplained worker exit remained pending. A reproducible recurrence should be minimized before changing worker configuration or the implicated test. Do not count the failed first pass as green, discard its evidence, or claim a CI speedup.

The official audit fell from 243 to 173 reported findings for the resolved dependency graph; the final lockfile recheck confirms 173 (`artifacts/audit-final.json`). Remaining findings include development/transitive dependencies and ECharts; its advisory concerns Lines-series default tooltip HTML, which is not an observed current caller. These counts are audit reports, not confirmed application exploit counts. Existing peer warnings concern React types and emoji-mart, not the selected upgrades.

Remaining dependency candidates were checked again against the official registry/advisories on 2026-11-10. ECharts 6.1.0 fixes [the Lines tooltip issue](https://github.com/advisories/GHSA-fgmj-fm8m-jvvx), but this checkout registers Bar, Heatmap, Line and Pie rather than Lines (`src/components/charts/echarts.ts`). A later ECharts update should validate its zrender 6.1 rendering changes. The two critical audit entries are indirect development-tool dependencies: [shell-quote](https://github.com/advisories/GHSA-w7jw-789q-3m8p), pinned to 1.7.3 by fx-runner (fixed from 1.8.4; current latest 1.12.0), and [proxy-addr](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) 2.0.7 under addons-linter/Express (fixed in 2.0.8). Their advisory preconditions are narrower than their severity label alone implies. These are explicit follow-up candidates, not upgrades included in this change; package overrides and broader tooling refreshes were not introduced to clear audit counts.

Preserve this spec, the bounded animation reproducer and the extended benchmark driver in Git. Keep all generated before/after reports, failed candidate logs, archive and isolated probe installation local for review. No cleanup or unrelated scratch deletion is performed.
