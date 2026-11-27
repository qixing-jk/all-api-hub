# CI and releases

## Continuous integration

GitHub Actions selects checks according to each workflow's configured events and changed paths:

- [Quality](../../.github/workflows/quality.yml) runs type checking, linting, unused-code checks, and translation extraction/completeness validation.
- [Test](../../.github/workflows/test.yml) runs the Vitest suite in parallel shards, merges coverage, and uploads artifacts.
- [E2E](../../.github/workflows/e2e-smoke.yml) runs the browser and extension smoke checks for applicable changes.
- [Commit message checks](../../.github/workflows/commitlint.yml) and [PR title checks](../../.github/workflows/commitlint-title.yml) enforce Conventional Commits for delivery.

Regular E2E is path-triggered and includes desktop Firefox smoke tests. The [browser compatibility matrix](../../.github/workflows/e2e-browser-compat.yml) and [real-site workflows](../../e2e/realSite/README.md) also run on their own schedules. Run focused checks for risks the PR checks leave open.

### Browser test sharding and build variants

Scheduled browser compatibility runs cover every supported Chrome version and all three shards. A manual run can select comma-separated `chrome_versions` and `shards`. Both default to `all`. For example, run the second shard on Chrome 114 and Chrome stable with:

```bash
gh workflow run e2e-browser-compat.yml -f chrome_versions=114,stable -f shards=2
```

Shard numbers select one of three groups balanced by measured spec duration. The build freezes one duration profile for all selected browsers and failed-job reruns; without usable timings, each job falls back to Playwright's test-count split. The isolated performance suite runs for each selected browser when shard 2 is included.

The default E2E suite uses six runners and balances specs by measured duration. Each shard records a JSON report, and a follow-up job caches `.e2e-durations/spec-durations.json` built from those reports. Pull requests restore the base branch's copy. Without a duration manifest, the jobs fall back to Playwright's `--shard`. Use `node scripts/write-e2e-spec-durations.mjs` and `node scripts/e2e-shard-plan.mjs --index 1 --total 6` to reproduce the pipeline locally.

The DNR and bookmarks E2E variants are derived from the default build with `node scripts/e2e-build-variants.mjs` instead of being built separately: `wxt.config.ts` changes only `permissions` and `optional_permissions` between them. [A test](../../tests/scripts/e2eBuildVariantDerive.test.ts) compares the real manifest factory across variants and fails if any other field diverges, so a future variant-specific manifest change cannot silently ship the wrong build.

### Unit test sharding and reports

CI splits the unit suite across six runners in [the test workflow](../../.github/workflows/test.yml). [The shard sequencer](../../vitest.shardSequencer.ts) balances files using measured durations from previous runs.

Failed assertions do not prevent coverage analysis: when all shard reports contain test and coverage data, the merge job uploads the generated LCOV to Codecov even if the merge command exits with test failures. Tests keep their failing status. Missing reports, missing coverage, unhandled worker errors, or mixed Vitest versions block coverage publication; available merged coverage and JUnit reports remain in workflow artifacts for diagnosis. The job summary records report completeness. Run `node --test tests/scripts/check-unit-test-reports.test.mjs` to check these guards and reproduce a real failed two-shard merge locally without uploading anything.

The merge job generates `.vitest-durations/shard-durations.json` from blob reports and caches it for later runs. No manual weight maintenance is needed. If no usable manifest exists, the sequencer falls back to Vitest's default file-count slices. See [the duration-report generator](../../scripts/write-unit-test-durations.mjs) for load correction and incomplete-report handling.

To see a duration-balanced split locally, publish a manifest from your own run and shard against it:

```bash
pnpm exec vitest --run --reporter=blob
pnpm test:durations
pnpm exec vitest --run --shard=1/6
```

The sequencer reads that manifest path by default. Set `UNIT_TEST_SHARD_DURATIONS` in your shell to use a different manifest.

## Release packaging

Release automation uses `node scripts/package-distribution.mjs --stores` to build separate Chrome Web Store, Edge Add-ons, and Firefox AMO archives under `.output/stores/`. GitHub archives remain at `.output/*.zip`. The command validates each archive's `distribution.json` using `unzip`, available on the CI runner. Nightly sets `AAH_DISTRIBUTION_CHANNEL=github-nightly` and omits `--stores`.

To reproduce a single store build, set `AAH_DISTRIBUTION_CHANNEL` to `chrome-web-store`, `edge-addons`, or `firefox-amo`, then run `pnpm exec wxt zip -b chrome`, `-b edge`, or `-b firefox` respectively. `AAH_BUILD_REVISION` supplies the source commit for Nightly comparisons. Unmarked production builds report `unknown`; serve builds report `local-development`. Markers identify the current artifact, not its download website. Keep store packages separate from GitHub packages and from other stores' packages.

Analytics includes the finite `distribution_channel` enum on existing consent-controlled events. Count distinct anonymous installations on `app_opened`, grouped by channel, browser family and application version, for active-install distribution. Event counts are not installation counts. Old or unmarked packages remain unknown; installations with analytics disabled are absent from this sample.

## Release notes shown after updates

Updates leave a persistent pending version before checking documentation. Opening the options page checks for the installed version's published notes; missing notes or unavailable sources remain pending for the next visit. Once notes are ready, the pending marker is consumed under the storage lock so only one settings window displays the reminder. Disabling automatic update logs discards the pending reminder when options opens. Popup and side panel visits do not trigger these checks.

For patch releases, write a short explanation in that version's own changelog section and link to the previous release's main updates when helpful. The dialog always uses the actual installed version. Deferred checking requires an extension build containing this workflow; publishing documentation alone cannot add it to older installed builds.
