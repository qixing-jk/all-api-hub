# Contributing to All API Hub

Thank you for considering contributing to All API Hub! This guide will help you get started with development and testing.

## Contributor Licensing

By submitting a pull request or other contribution to this repository, you agree that your contribution may be licensed under:

- GNU Affero General Public License v3.0 (AGPL-3.0), and
- commercial license terms granted by the All API Hub maintainers.

You represent that you have the right to submit the contribution and that it does not infringe any third-party rights. If you do not agree to these terms, please do not submit the contribution.

## Development Setup

### Prerequisites

- Node.js from `.nvmrc`, satisfying `package.json` engines
- Corepack (`corepack pnpm` uses the pnpm version declared in each `package.json`)

Enable Corepack once with `corepack enable`. It selects the pnpm version declared by the nearest `package.json` when you run `pnpm`. If an older global pnpm still takes precedence on your PATH, use `corepack pnpm` explicitly.

### Tech Stack

All API Hub uses:

- **Framework**: [WXT](https://wxt.dev) drives the multi-browser extension tooling and build pipeline
- **UI Layer**: [React](https://react.dev) powers the options UI and popup surfaces
- **Language**: [TypeScript](https://www.typescriptlang.org) keeps the codebase type-safe end-to-end
- **Styling**: [Tailwind CSS](https://tailwindcss.com) provides utility-first styling with theme tokens
- **Components**: [Radix UI](https://www.radix-ui.com/) supplies accessible primitives layered with our design system

### Getting Started

Fork and clone the repository, then install dependencies:

```bash
git clone https://github.com/YOUR_USERNAME/all-api-hub.git
cd all-api-hub
pnpm install
```

Start the development server for your target browser:

```bash
# Chrome:
pnpm dev

# Firefox:
pnpm dev:firefox
```

These commands automatically open a browser with the extension loaded, following WXT's default behavior. To start only the dev server without opening a browser:

```bash
pnpm dev:no-browser
# Firefox:
pnpm dev:no-browser -b firefox
```

When needed, `pnpm browser:cdp` opens a debugging browser with the Chrome extension loaded automatically and reuses an existing debugging window. It can also start the dev server itself. Alternatively, load the extension in your own browser as described below. `WXT_OPEN_BROWSER=0` also disables automatic browser startup for the regular dev commands.

The dev server binds to `127.0.0.1`; use the address and port printed at startup. If extension pages stay blank with `net::ERR_CONNECTION_REFUSED`, check that the server is running and that a system proxy is not intercepting loopback requests. See `wxt.config.ts` for the server configuration.

To load the development extension in your own browser while the server is running:

- Chrome: Navigate to `chrome://extensions/`, enable "Developer mode", click "Load unpacked", and select the `.output/chrome-mv3-dev` directory.
- Firefox: Navigate to `about:debugging#/runtime/this-firefox`, click "Load Temporary Add-on", and select `manifest.json` inside the `.output/firefox-mv2-dev` directory.

For live desktop automation or Android Firefox, Edge, and Lemur debugging, use the [live-extension-ui-automation skill](.agents/skills/live-extension-ui-automation/SKILL.md). The [Android workflow](.agents/skills/live-extension-ui-automation/references/mobile-debugging.md) covers installed extensions, development installation, and hot updates.

## Testing

### Local tooling environment configuration

Playwright, real-site E2E runners, CDP launch/control runners, standalone provider probes, browser profile sync, and the E2E diagnostics launcher use `scripts/utils/local-env.mjs`. Linked worktrees automatically reuse the primary checkout's `.env.local`; the primary checkout is identified by Git, independently of which branch it has checked out. Shared credentials need only be maintained there. Files are read directly and are never copied into other worktrees.

From lowest to highest priority:

1. Primary checkout `.env.local` (shared defaults only).
2. Current checkout `.env`.
3. Current checkout `.env.local`.
4. A runner's explicit `--env-file`, where supported (currently OmniRoute).
5. Environment variables already present when the command starts, including CI.

An empty value can override a shared default. Keep checkout-specific ports, extension output paths, and other runtime differences in the current checkout. The loader does not rewrite relative paths: their interpretation remains owned by each consuming command. Prefer absolute paths for shared browser/profile locations. Never point a linked checkout's extension output at the primary checkout merely because its credentials are shared.

Shared defaults assume trusted local checkout configuration. Service addresses and credentials are merged independently; when switching deployments, also override the matching credentials rather than inheriting another deployment's token.

These controls must be set in the launching shell, not in an env file:

- `AAH_SHARED_ENV=0` disables shared-file loading.
- `AAH_SHARED_ENV_DIR=<directory>` explicitly selects the directory containing the shared `.env.local`. Relative directories resolve against this checkout. A missing explicitly selected file fails with its path; an absent automatically discovered shared file is optional.
- A nonempty `CI` disables shared-file loading, including explicit shared paths.

Ordinary clones and archives work with their own files. The primary checkout loads its own files once. Use `pnpm env:diagnostics` to print the selected shared directory and loaded file paths; this command does not print keys or values.

The loader uses Node's `util.parseEnv` syntax (comments, quoted values, multiline values, and `export`), with no shell evaluation or `${VAR}` expansion. See the [Node environment file specification](https://nodejs.org/api/environment_variables.html#dotenv).

WXT dev/build commands retain native mode/browser-specific env loading. Shared defaults with `WXT_` or `VITE_` prefixes are excluded by the Node loader because those prefixes expose variables to extension code. Keep test credentials in Node-only variables and env files out of Git; see [WXT environment variables](https://wxt.dev/guide/essentials/config/environment-variables).

### Local screenshot comparison

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

Agents prioritize representative final after images when visual judgment is needed, as described in [task acceptance](docs/agents/task-acceptance.md#compare-changed-ui). Baseline, comparison and diff artifacts primarily serve developer review; agents open them only for a concrete unresolved question. Report generation does not require opening each image or repeating review after every small edit. Reuse retained artifacts in the handoff. Do not replace existing maintained visual regression assertions with this report generator.

### Overview

This project uses [Vitest](https://vitest.dev/) for unit and component testing. The `dom` project runs component and browser-dependent tests in jsdom through `tests/setup.ts`; the `node` project runs other TypeScript tests through `tests/setup.node.ts`. Choose the environment needed by the behavior under test; `vitest.config.ts` owns project selection and both setups provide the applicable shared mocks.

### Running Tests

```bash
# Run tests related to the files you changed
pnpm exec vitest related --run path/to/changed-file.ts

# Run one or more focused test files
pnpm exec vitest run tests/path/to/feature.test.ts

# Run tests in watch mode (useful during development)
pnpm test:watch

# Run the full test suite locally when broad validation is justified
pnpm test

# Run the full suite with coverage (normally handled by CI)
pnpm test:ci
```

During normal development, run the smallest relevant test set and let the pull request CI run the full sharded suite with coverage. Run `pnpm test` or `pnpm test:ci` locally when changing test infrastructure, Vitest or coverage configuration, widely shared runtime behavior, or when reproducing a CI-only failure. Documentation, copy, formatting, type-only, and similarly narrow changes do not require the full local suite unless they affect executable behavior.

### Sharding in CI

CI splits the unit suite across six runners in [the test workflow](.github/workflows/test.yml). [The shard sequencer](vitest.shardSequencer.ts) balances files using measured durations from previous runs.

The merge job generates `.vitest-durations/shard-durations.json` from blob reports and caches it for later runs. No manual weight maintenance is needed. If no usable manifest exists, the sequencer falls back to Vitest's default file-count slices. See [the duration-report generator](scripts/write-unit-test-durations.mjs) for load correction and incomplete-report handling.

To see a duration-balanced split locally, publish a manifest from your own run and shard against it:

```bash
pnpm exec vitest --run --reporter=blob
pnpm test:durations
pnpm exec vitest --run --shard=1/6
```

The sequencer reads that manifest path by default. Set `UNIT_TEST_SHARD_DURATIONS` in your shell to use a different manifest.

### Browser and extension tests

Use Playwright when the behavior depends on the extension runtime or browser interactions:

```bash
# Install the Chromium test browser
pnpm e2e:install

# Run a focused extension workflow
pnpm e2e e2e/your-workflow.spec.ts --project=chromium

# Open the Playwright test UI
pnpm e2e:ui
```

For installed extensions, logged-in sites, desktop CDP, or Android devices, follow the [live-extension-ui-automation skill](.agents/skills/live-extension-ui-automation/SKILL.md). Use the [local environment configuration](#local-tooling-environment-configuration) for credentials and browser paths.

### Turnstile verification scenarios

Start the official Turnstile test server with `pnpm dev:turnstile`, then open Settings → Refresh → Website verification assistance in a **development** extension. The existing development trigger includes four Turnstile presets: automatic success, manual verification, verification failure, and a three-site queue. Selecting one prefills `http://127.0.0.1:8787/`; the existing delay lets you switch away before verification starts. The trigger is unavailable in release builds.

The server uses [Cloudflare's official test component and dummy keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/) and validates dummy tokens through Siteverify. It needs network access to Cloudflare, but no account, login, production key, or daily check-in allowance. It does not perform real account mutations. Failure stays pending until the existing token-wait timeout expires.

The two independent reminder channels are **In-page reminders** (on by default) and **Browser notifications** (off by default). Either, both, or neither can be enabled. In-page reminders use the focused extension page or current web page. Browser notifications require permission: enabling the channel without permission opens an explanation dialog with an explicit authorization button. Refusing or cancelling leaves the channel off. A blocked browser shows settings guidance. Delivery failures never enable a disabled channel or bring verification forward; click **Open verification window** or a browser notification to focus verification. For the three-site scenario, open and complete each request using its reminder. The server listens only on loopback ports 8787–8789. Set `AAH_TURNSTILE_PORT` to change the first port and update the trigger URL accordingly. Stop it with Ctrl+C. These local reminders do not use remote push providers. Closing or finishing a request clears its reminder. OS quiet mode can still hide an accepted system notification.

To automate official automatic success, reminders on extension/web pages, and the three-site interactive queue, stop the standalone test server, launch `pnpm browser:cdp:isolate`, then run `pnpm e2e:cdp:turnstile -- --isolate`. This runner starts its own local servers, restores preferences after the run, and saves screenshots under `.scratch/turnstile-channels/live-<timestamp>/`.

#### Firefox extension smoke tests

Run `pnpm e2e:firefox` for the real desktop Firefox toolbar popup and its handoff to the native sidebar or Options. This separate suite builds `.output/firefox-mv2-test`, installs it in a temporary Firefox profile, and uses Selenium/geckodriver to control the native browser UI plus the shared Firefox RDP adapter to inspect extension documents. It uses the Playwright runner and assertions; the Chromium extension fixture is not used.

Install Firefox first. Selenium Manager resolves geckodriver automatically and may download it on the first run. Set `AAH_E2E_FIREFOX_EXECUTABLE_PATH` or `AAH_E2E_GECKODRIVER_PATH` to use specific local binaries. The runner loads these through the shared [local environment configuration](#local-tooling-environment-configuration). `AAH_SKIP_E2E_BUILD=1` explicitly reuses the existing Firefox test artifact; leave it unset for a fresh build.

The smoke profile runs headlessly, fixes desktop pointer capabilities independently of host touch hardware, prevents popup auto-hide during inspection, and disables external networking. It uses bundled resources and synthetic data, without real accounts or credentials. Screenshots of the actual extension browsing contexts are saved under `test-results/firefox/` and retained by the E2E workflow on success and failure. Geometry and behavior assertions are automated; these screenshots are review evidence, not pixel comparison baselines.

The suite covers popup bounds, tabs, dialogs, dropdowns and scrolling; native sidebar opening and form survival after popup closure; missing/rejected sidebar API fallback to account creation in Options; and retry after both navigation destinations fail. Installing a temporary sidebar extension can open its sidebar, so the fixture closes it before testing user-initiated handoff. Gesture-sensitive actions use native WebDriver pointer input rather than scripted DOM clicks.

Browser API checks exercise Firefox's actual optional clipboard permission prompt (deny, retry, grant and revoke), credential copying and clipboard failure recovery. Successful copies are read back from Firefox's headless, in-memory clipboard. Failure scenarios inject errors only at browser API boundaries; account data and keys are synthetic. The suite does not access the desktop clipboard.

Extend `e2e/firefox/` incrementally when a feature depends on browser layout or extension APIs, and add regressions for Firefox-specific failures. Account persistence, downloads, other permissions and background lifecycle still need coverage as those areas change. Passing these checks does not establish Android Firefox, every sidebar workflow, or all-feature compatibility.

### Test Coverage

Coverage reports are automatically generated when running `pnpm test:ci`. You can view detailed coverage reports in the `coverage/` directory after running tests.

The repository enforces global Vitest coverage thresholds in CI. Treat `vitest.config.ts` as the source of truth for the current required values rather than copying them into this document.

### Writing Tests

Add or update tests when a change modifies meaningful executable behavior. A useful test should protect an observable behavior, regression, relevant edge case, or contract. Do not add tests solely to execute lines, mirror implementation details, or satisfy coverage. Documentation, copy, formatting, type-only, and mechanical changes generally do not need new tests.

#### Choosing coverage

- Reuse existing tests when they already protect the changed behavior. Cover relevant failure paths and direct consumers of changed shared APIs; behavior-preserving refactors still need regression evidence.
- Assert meaningful results or boundary contracts rather than whole internal structures, mock sequences, or incidental styles. Exact shapes and mock calls are appropriate when that shape or external call is itself the contract.
- Use Vitest/Testing Library for state, parsing, filtering, and isolated components. Reserve E2E for unresolved browser-extension runtime, cross-entrypoint, navigation, persistence, or interaction risks; one representative browser workflow usually complements focused state coverage better than a UI matrix.
- Prefer semantic selectors; for workflow-critical E2E controls that need a stable copy-independent selector, use feature-local `testIds.ts` constants rather than position or DOM structure. Assert user-visible copy for outcomes where appropriate.
- Keep temporary verification tests only when deterministic and valuable as regression coverage. Decide locally unless retention requires a material expansion in infrastructure, maintenance cost, or task scope.

#### Unit Tests

Unit tests should be placed under the repo-level `tests/` tree. Mirror the source area in the path when it helps readability:

```
src/utils/core/formatters.ts
tests/utils/formatters.test.ts
```

Example unit test:

```typescript
import { describe, it, expect } from "vitest"
import { formatTokenCount } from "~/utils/core/formatters"

describe("formatTokenCount", () => {
  it("should format large numbers with M suffix", () => {
    expect(formatTokenCount(1500000)).toBe("1.5M")
  })

  it("should handle zero", () => {
    expect(formatTokenCount(0)).toBe("0")
  })
})
```

#### Component Tests

Component tests should also live under `tests/`. Use the custom render function from `tests/test-utils/render.tsx` which wraps components with required providers:

```
src/components/LinkCard.tsx
tests/components/LinkCard.test.tsx
```

Example component test:

```tsx
import { Link } from "lucide-react"
import { describe, it, expect } from "vitest"
import { render, screen } from "~~/tests/test-utils/render"
import LinkCard from "~/components/LinkCard"

describe("LinkCard", () => {
  it("should render correctly with required props", async () => {
    render(
      <LinkCard
        title="Test"
        description="Test description"
        href="https://example.com"
        buttonText="Click"
        Icon={Link}
      />,
    )

    expect(await screen.findByRole("heading", { name: "Test" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Click" })).toHaveAttribute(
      "href",
      "https://example.com",
    )
  })
})
```

The wrapper includes app providers such as `UserPreferencesProvider`, whose initial loading can defer rendering. Await the first visible element with `findBy*`, then use synchronous queries for elements already rendered. See [the render helper](tests/test-utils/render.tsx) for provider toggles and [existing component tests](tests/components/LinkCard.test.tsx) for working examples.

#### i18n in Tests (Translation Key Assertions)

By default, tests SHOULD assert **translation keys** (e.g. `ui:searchableSelect.noOptions`) instead of localized copy (English/Chinese strings). This keeps tests stable when translations change.

The Vitest i18n test harness is configured so that **missing translations render as fully-qualified keys** (`<namespace>:<key>`). This lets you assert keys without loading any locale JSON.

Recommended patterns:

- Use `render` / `renderHook` from `~~/tests/test-utils/render` (they wrap `I18nextProvider`).
- Prefer key assertions over copy assertions (e.g. `expect(screen.getByText("ui:...")).toBeInTheDocument()`).
- Avoid `vi.mock("react-i18next")` / `vi.mock("i18next")` unless you are explicitly testing i18n edge cases.

Mocks are acceptable when you need to:

- Force error branches (e.g. make `t()` throw)
- Test language-change flows (`changeLanguage`) or resource-loading behavior
- Isolate unrelated third-party behavior

If a test truly needs to assert localized copy, it MUST explicitly load the required resource bundles within that test (e.g. via `testI18n.addResourceBundle(...)`) so it’s clear the test is intentionally copy-coupled.

If you add resource bundles to the shared `testI18n`, prefer cleaning them up in `afterAll` (e.g. `removeResourceBundle`) to avoid leaking translations into other test files running in the same worker.

### Test Infrastructure

#### Mocks

The shared setup (`tests/setup.shared.ts`, loaded by both test environments) provides browser/storage and i18n support. The DOM setup adds browser-specific behavior; consult the applicable setup when a test needs a particular mock:

- **Browser APIs + storage**: `wxt/testing/fake-browser` sets `globalThis.browser` / `globalThis.chrome`, including `browser.storage.*`. `@plasmohq/storage` works on top of this without extra mocks.
- **i18next**: Lightweight test instance configured in `tests/test-utils/i18n.ts`
- **MSW**: Mock Service Worker for API endpoint mocking

#### MSW Handlers

API mocks are defined in `tests/msw/handlers.ts`. Add or override handlers in individual test files as needed:

```typescript
import { http, HttpResponse } from "msw"
import { server } from "~~/tests/msw/server"

it("should handle API error", async () => {
  server.use(
    http.get("https://api.example.com/endpoint", () => {
      return HttpResponse.json({ error: "Not found" }, { status: 404 })
    })
  )

  // Test code here
})
```

## Code Style

### Linting and Formatting

```bash
# Run ESLint and the color/typography checks
pnpm lint

# Fix ESLint issues automatically
pnpm lint:fix

# Format only the files you changed
pnpm exec prettier --write path/to/changed-file.ts

# Check formatting without modifying files
pnpm format:check
```

`pnpm format` formats the entire repository; use it when repository-wide formatting is intended.

### Type Checking

```bash
# Run TypeScript compiler without emitting files
pnpm compile
```

`noUncheckedIndexedAccess` is enabled for `src/**`, `tests/**`, and `e2e/**`.

### Permission warning validation

Run `pnpm e2e:permissions` when changing required/optional permissions, host access, or other manifest inputs. The pre-commit hook selects this check for manifest configuration, entrypoints, plugins, dependencies, and its own tooling. The independent `Permission warnings` PR workflow uses the existing cached build producer and does not honor `skip-e2e` or `e2e-optional`; the test also runs in the default E2E suite and existing browser compatibility matrix. The command checks build freshness and uses the default manifest, without extra permissions from test-only build variants.

`e2e/extensionPermissionWarnings.spec.ts` asks the actual browser's `management.getPermissionWarningsByManifest` API for warnings from the built candidate and `e2e/fixtures/permission-warnings-baseline.json`. The baseline records the approved version 4.3.0 permission surface before DNR became required, including content-script match patterns. Compare both manifests in the same browser so changes to localized warning text do not require maintaining a warning-text snapshot. A control that promotes optional notifications to required must add a warning; new candidate warnings fail the check. JSON test attachments retain the browser version, manifests, warnings, and differences.

Do not regenerate the baseline merely to make a failure pass. Review the added access and resulting user impact before intentionally accepting a new baseline. If manifest ownership moves, update the hook's input selection as well.

This automates native **warning computation**, not CRX installation, upgrade-triggered disabling, re-approval, or store delivery. Reloading an unpacked extension does not test those flows. For complete upgrade verification, Chrome documents the [Extension Update Testing Tool](https://github.com/GoogleChromeLabs/extension-update-testing-tool): run its local server, upload the old package, install the signed CRX, upload a higher-version candidate using the same signing key, and use the extension management page's Update action. See the official [permission warning and update guide](https://developer.chrome.com/docs/extensions/develop/concepts/permission-warnings). Report that separate outcome explicitly; a passing warning computation test is not evidence that a store upgrade was exercised.

For an isolated Windows CRX check, Chrome for Testing exposes `chrome://policy/test`. In a disposable profile, its local test provider can set `ExtensionInstallAllowlist` for the test extension ID and `ExtensionInstallSources` for the loopback update server without modifying system policies. Do not use forced installation: it can suppress the permission approval behavior being tested. This test page is browser-specific; check availability instead of assuming Edge implements it. Close the test browser and remove its temporary profile afterwards.

When automating that flow, restore native download handling with CDP `Browser.setDownloadBehavior({ behavior: "default" })`; Playwright's download interception can prevent the CRX installer from running. CDP DOM drag events alone are not evidence of a native file drop or installation. Confirm the native install dialog, verify the installed ID and version, and check both candidate and control updates. An ungranted optional permission promoted to required, such as `notifications`, should disable the control with `management.ExtensionInfo.disabledReason === "permissions_increase"` until re-approved. Retain browser versions, update requests, enabled states, and dialog evidence; distinguish reconstructed permission baselines from historical release packages.

### Git Hooks

This project uses [Husky](https://typicode.github.io/husky) to enforce code quality through Git hooks:

- **pre-commit**: `validate:staged` formats and lints applicable staged files, runs staged Vitest test files, and selects i18n and native permission-warning checks when their inputs change. Staged test execution does not find related tests or replace affected-behavior validation.
- **commit-msg**: `commitlint` checks the message against the Conventional Commits rules in `commitlint.config.mjs`. Pull request titles use the same rules in CI, because a squash merge can land the title instead of an individual commit.
- **pre-push**: `validate:push:changed` examines every ref update supplied by Git. Known documentation-only ranges and ref deletions skip the extension gate; other changes and unknown ranges run `validate:push` (`compile` + `knip`). New remote refs conservatively run the full gate. Checks execute in the current checkout, so keep the checkout aligned with the code being delivered.

The hooks are automatically set up when you run `pnpm install` (via the `prepare` script). Use `pnpm run validate:staged` or the unconditional `pnpm run validate:push` manually for troubleshooting or when the corresponding hook will not run. Let an imminent hook execute its gate once rather than pre-running it on unchanged state. Bare `pnpm lint-staged` is not the complete pre-commit flow. See [.husky/README.md](.husky/README.md) for trigger ownership and troubleshooting.

#### Skipping Hooks (Not Recommended)

Fix hook failures or report the blocked delivery. Bypassing a required gate needs an explicit authorized exception with the skipped validation and remaining risk disclosed; it is not an automatic fallback for a failed check.

## Building

### Production Build

Use a build command for an unpacked production extension, or a zip command to build and package it for distribution:

| Target | Build | Package |
| --- | --- | --- |
| Chrome / Chromium | `pnpm build` | `pnpm zip` |
| Firefox | `pnpm build:firefox` | `pnpm zip:firefox` |
| Safari | `pnpm build:safari` | `pnpm zip:safari` |
| All configured browsers | `pnpm build:all` | `pnpm zip:all` |

Outputs are written under `.output/`. For development with hot updates, use the commands in [Getting Started](#getting-started).

Release automation uses `node scripts/package-distribution.mjs --stores` to build separate Chrome Web Store, Edge Add-ons, and Firefox AMO archives under `.output/stores/`. GitHub archives remain at `.output/*.zip`. The command validates each archive's `distribution.json` using `unzip`, available on the CI runner. Nightly sets `AAH_DISTRIBUTION_CHANNEL=github-nightly` and omits `--stores`.

To reproduce a single store build, set `AAH_DISTRIBUTION_CHANNEL` to `chrome-web-store`, `edge-addons`, or `firefox-amo`, then run `pnpm exec wxt zip -b chrome`, `-b edge`, or `-b firefox` respectively. `AAH_BUILD_REVISION` supplies the source commit for Nightly comparisons. Unmarked production builds report `unknown`; serve builds report `local-development`. Markers identify the current artifact, not its download website. Keep store packages separate from GitHub packages and from other stores' packages.

Analytics includes the finite `distribution_channel` enum on existing consent-controlled events. Count distinct anonymous installations on `app_opened`, grouped by channel, browser family and application version, for active-install distribution. Event counts are not installation counts. Old or unmarked packages remain unknown; installations with analytics disabled are absent from this sample.

## Continuous Integration

GitHub Actions selects checks according to each workflow's configured events and changed paths:

- [Quality](.github/workflows/quality.yml) runs type checking, linting, unused-code checks, and translation extraction/completeness validation.
- [Test](.github/workflows/test.yml) runs the Vitest suite in parallel shards, merges coverage, and uploads artifacts.
- [Commit message checks](.github/workflows/commitlint.yml) and [PR title checks](.github/workflows/commitlint-title.yml) enforce Conventional Commits for delivery.

Before submitting a pull request, run the focused tests and local validation relevant to your change. The pull request CI is the authoritative full-suite and coverage check.

CI evidence covers only workflows that actually ran for the relevant changes. The regular E2E workflow is path-triggered; browser-compatibility and real-site workflows are scheduled or manually dispatched, so ordinary PR success does not establish those results. Run additional focused checks when the task's unresolved risk requires them.

## Pull Request Guidelines

1. **Create a feature branch** from `main`
2. **Add meaningful tests for behavior changes**: Protect observable behavior, regressions, relevant edge cases, or contracts; do not add tests only to increase coverage
3. **Run affected tests**: Prefer `pnpm exec vitest related --run <changed files>` or focused test files; rely on CI for the full suite and coverage by default
4. **Commit through the staged-file gate**: Stage only task-owned changes without disturbing unrelated index state and let pre-commit run `validate:staged`
5. **Validate shared risks and requested pushes**: Broaden focused checks for shared contracts, consumers, dependencies, generated wiring, or repository structure. Let a requested push run its applicable hook checks; reuse valid evidence for unchanged relevant state
6. **Write clear commit messages** describing your changes
7. **Update documentation** if you're adding new features

## Project Structure

```
all-api-hub/
├── src/              # Extension/runtime source code (WXT srcDir)
│   ├── assets/       # Runtime images/icons bundled by Vite
│   ├── components/   # Shared React components (UI primitives in src/components/ui/)
│   ├── constants/    # Shared constants
│   ├── contexts/     # React context providers
│   ├── entrypoints/  # WXT entry points (wiring-only: routing/bootstrapping/integration glue)
│   ├── features/     # Canonical home for UI feature/page modules (components/hooks/utils)
│   ├── hooks/        # Custom React hooks
│   ├── lib/          # Shared low-level helpers (e.g. cn())
│   ├── locales/      # UI i18n resources (i18next)
│   ├── public/       # Extension public assets (manifest i18n: src/public/_locales/)
│   ├── services/     # Business logic and API services
│   ├── styles/       # Global CSS (Tailwind entry)
│   ├── types/        # Shared TypeScript type definitions
│   └── utils/        # Utility functions
├── e2e/              # Playwright end-to-end tests (repo-root tooling)
├── plugins/          # Repo-root tooling (e.g. Vite/WXT plugins)
├── scripts/          # Development, diagnostics, and validation commands
├── docs/             # Public documentation and project guidance
├── .agents/skills/   # Task-specific agent workflows and references
├── tests/            # Vitest setup and utilities (repo-root tooling)
│   ├── msw/          # MSW handlers and server setup
│   └── test-utils/   # Testing utilities (custom render, etc.)
```

## UI Module Taxonomy (Where Does UI Code Go?)

To keep the options UI consistent and reusable, this repo follows a single module taxonomy:

- `src/entrypoints/**` are **wiring-only**: routing, bootstrapping, and integration glue.
  - Options pages under `src/entrypoints/options/pages/**` should be thin wrappers that render feature modules.
  - Non-entrypoint code MUST NOT import from `~/entrypoints/options/pages/**`.
- `src/features/<Feature>/**` are the **canonical home for UI modules** (page/feature code), including `components/`, `hooks/`, and `utils/`.
- Shared layers:
  - `src/components/**` / `src/components/ui/**`: shared UI primitives and reusable UI components
  - `src/services/**`: business logic, storage, API clients, and background/runtime integrations
  - `src/types/**`: shared domain types used across layers
  - `src/utils/**`: shared non-UI helpers (keep UI concerns like toasts/i18n in features/entrypoints)

Dependency direction should stay one-way: `src/entrypoints/**` → `src/features/**` → shared layers (`src/components/`, `src/services/`, `src/types/`, `src/utils/`).

Use `~/` imports for `src/` and `~~/` for the repository root. Keep React state ownership outside `src/services/` and tests under `tests/` or `e2e/`.

Consult the focused guides for [product and UI conventions](docs/agents/product.md), [persistent storage](docs/agents/storage.md), [translations](docs/agents/i18n.md), and [site integrations](docs/agents/site-integrations.md) when changing those areas.

## Getting Help

If you have questions or need help:

- Check the [documentation](https://all-api-hub.qixing1217.top/)
- Review [existing issues](https://github.com/qixing-jk/all-api-hub/issues)
- Open a new issue with your question

Thank you for contributing! 🎉
