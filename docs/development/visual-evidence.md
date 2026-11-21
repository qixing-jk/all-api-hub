# Screenshots and visual evidence

Use the [local tooling environment configuration](setup.md#local-tooling-environment-configuration) for shared browser and fixture settings.

## Updating documentation screenshots

Use the maintained command after a UI or feature change. Select pages explicitly; ordinary prose edits do not require new screenshots.

```bash
pnpm docs:screenshots --list
pnpm docs:screenshots "--pages=keys,channels,sync"
pnpm docs:screenshots "--pages=web-ai-api-check,usage,balance"
```

The command builds the required extension variants from the current working tree, captures the selected pages in Chinese, English and Japanese, validates every requested PNG, and updates their existing paths under `docs/docs/static/image/`. README and guide references continue to use those paths. Use `--lang=zh`, `en` or `ja` for a single language; omit `--pages` for a full refresh. Playwright Chromium must already be installed (`pnpm e2e:install`).

Each run prints a report path under the ignored `.scratch/docs-screenshot-updates/`. It retains original images, newly captured images, command logs, a consolidated Markdown comparison gallery and JSON metadata. Pixel differences are included for matching image dimensions. Missing prior images and dimension changes are labelled explicitly. Existing documentation images have unknown original build provenance; they are asset comparisons, not controlled visual regression baselines.

Captures use deterministic demo data in the actual extension UI. A successful run does not replace visual review or prove live provider behavior. Check the final images and comparison report before committing. Capture/build failures or missing images retain failure evidence and leave existing documentation images unchanged. Captures require ready page content and requested framing anchors; readiness failures stop the run.

If publishing an image fails, the command restores attempted existing assets and removes attempted new assets. It continues restoring other assets when a rollback fails and reports failed targets and retained backup paths in `failure.json`. This recovery handles reported I/O errors; it is not an atomic transaction across process crashes or power loss.

A per-checkout lock prevents concurrent runs of this command; other build commands do not participate in that lock. A later run recovers `update.lock` only when its recorded PID is confirmed to have exited. Live, malformed or unreadable ownership is preserved. Recovery uses an exclusive `update.lock.recovery` marker; if a process is forcibly stopped during recovery, inspect that marker's PID and the main lock before manually removing either file. Preserve them when ownership cannot be verified.

Update fixture data and capture checkpoints when feature behavior changes. There is no automatic CI trigger or page inference.

The lower-level `scripts/generate-doc-screenshots.mjs` remains available for an already prepared build, including `--output=<directory>` for isolated capture.

## Local screenshot comparison

Use `pnpm visual:capture --help` for the generic entrypoint. Existing asserted Playwright workflows do not need a scenario registry entry. Add an opt-in checkpoint after the UI is ready:

```ts
import { captureVisualViews } from "~~/e2e/utils/visualCapture"

await captureVisualViews({
  page,
  ready: page.getByRole("dialog"), // choose a meaningful ready control
  id: "account-dialog",
  extensionDir,
})
```

Without capture output configured, the helper does nothing during ordinary tests. It handles visible-state/font/render waiting, screenshots, image hashes and build/environment metadata. With no view configuration it captures the current view; pass `views` in the workflow for defaults, or override them from the CLI:

For branch reviews, set `AAH_VISUAL_CAPTURE_CONTEXT=1` to capture an uncropped viewport image and metadata named `<checkpoint>-context` alongside each focused `captureTarget` image. Include both images in the [acceptance report](../agents/task-acceptance.md#maintain-one-reviewer-entry-point). Add checkpoints for relevant content reached by scrolling.

```bash
pnpm visual:capture --spec e2e/appearanceSettings.spec.ts --grep "changing text size keeps the appearance drawer bottom aligned at 390px$" --fixture appearance-drawer-default-text-v1 --view dark:390x900 --view light:1280x900
# Repeat the same command after editing; add --baseline <printed-before-directory> --diff when needed.
```

Use an actual spec and a narrow test title from the current task. `--fixture` identifies seeded state; change it when the setup semantics change. Repeated `--view` options control All API Hub's root dark class and viewport. Build variants follow `AAH_E2E_BUILD_VARIANT` (otherwise `default`); `--variant default|dnr-required|bookmarks-required` overrides it, and baselines must use the same variant. The matrix helper restores the prior dark class and an explicitly configured viewport after capture. Checkpoint IDs are discovered from emitted metadata, must be unique across selected tests, and cannot overwrite another checkpoint. Baseline pairing requires the same spec/grep identity, fixture, checkpoint IDs and environment metadata. A workflow that emits no checkpoints fails with an actionable error. The runner records spec/grep/view settings in `capture.json`. Page navigation, fixtures and meaningful assertions stay in the existing test: generic capture cannot establish that arbitrary UI has reached the right state.

For a maintained hotspot shortcut, use `pnpm visual:capture --list` and then:

```bash
# Before editing: retain the printed run directory as the baseline.
pnpm visual:capture --scenario api-key-hint
# After editing: capture the same workflow and compare matching checkpoints.
pnpm visual:capture --scenario api-key-hint --baseline .scratch/visual-captures/run-BASELINE --diff
```

The first supported scenario is the API credential creation hint reached through the mounted sidepanel sponsor workflow, in light 380×700 and dark 320×700 views. It runs the existing real-extension Playwright scenario with deterministic fixtures, waits for asserted controls and fonts, disables capture animations, and saves images plus capture metadata. It automatically uses this checkout's content-validated test build, rebuilding only when the existing build-input check requires it. It needs Playwright Chromium (`pnpm e2e:install`); it does not use the logged-in desktop profile. Per-worktree builds, temporary browser profiles, unique ignored `.scratch/visual-captures/run-*` directories and a per-worktree capture lock avoid cross-worktree output/profile collisions. The lock serializes this command within one checkout; unrelated build/dev commands do not participate in it.

Capture output includes `capture.json`, `capture.md`, per-checkpoint PNG/JSON and `playwright.log`, with build input hashes, build/capture commit identities, viewport, device scale, language, theme, browser version and image hashes. An optional `--baseline` accepts an earlier run directory. It validates workflow/fixture/checkpoint identity and image hashes before running; after capture, matching environment metadata is required for automatic pairing. It then invokes `visual:compare` for each checkpoint, without opening any image in the agent. When no baseline is supplied, the run is current-state evidence only. Failures retain runner logs and `failure.json`; a valid `capture.json` may still exist if capture succeeded but subsequent comparison failed. Capture commands never switch Git revisions or invent old UI; run the before command while the real old build/source is available.

Prefer the generic spec entrypoint for new surfaces; add registry shortcuts only for frequently used workflows. `captureVisualViews` handles both a single current view and a matrix with the same checkpoint format. Use fixed IDs and bump the fixture identifier when seeded state or capture semantics change. Keep capture opt-in. The API hint's legacy `AAH_API_HINT_VISUAL_DIR` capture option remains supported. `AAH_VISUAL_CAPTURE_INTEGRATION=1 pnpm exec vitest run tests/scripts/visualCapture.test.ts` exercises generic acquisition, configurable views and automatic pairing; ordinary unit runs omit the browser integration case.

Reuse existing Playwright/CDP flows to capture the real before/after states, then run the shared PNG comparison command from the worktree receiving the evidence:

```bash
pnpm visual:compare --before .scratch/ui/before.png --after .scratch/ui/after.png --before-source "commit/build before" --after-source "commit/build after plus local diff" --context "Chromium; 390x844; DPR 1; en; light; fixture A; dialog open" --diff
```

The command uses Node and the project's pure JavaScript PNG dependency; it needs no Python, image CLI or browser installation. Relative paths resolve against the invoking directory. Absolute input paths can reference another worktree. By default, each invocation creates a unique ignored `.scratch/visual-comparisons/run-*` directory in the current worktree. `--output <parent-directory>` selects another parent, still with a unique run directory; keep custom evidence locations outside version control. It does not read shared credentials, switch branches, build or alter input images.

The output directory contains original `before.png` / `after.png`, a labelled `comparison.png`, and `report.md` / `report.json`. JSON stdout identifies the run directory and report for automation. Reports record absolute input paths, SHA-256 hashes, decoded dimensions, declared source/build descriptions and optional capture context. These descriptions are supplied by the caller; hashes prove image bytes, not that a particular source revision produced them. Record the actual viewport, device scale, language, theme, fixtures and interaction state in `--context` or the task's capture report.

`--diff` adds an exact RGBA pixel comparison only when dimensions match: changed pixels are magenta, unchanged pixels black, with counts in the JSON report. It has no perceptual threshold or anti-aliasing tolerance. Different dimensions produce an unscaled, padded preview with `dimension-mismatch` status and no pixel diff. Omit `--before` and `--before-source` for after-only evidence with `missing-baseline` status. Neither status establishes a passed comparison; matching dimensions also do not establish equivalent capture environments. Exit code zero means evidence generation succeeded, and visual review is always required. Invalid options, missing required source descriptions, unreadable images or invalid PNGs exit nonzero before creating a run directory.
