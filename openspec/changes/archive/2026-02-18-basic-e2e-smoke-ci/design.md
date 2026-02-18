## Context

The repo is a WXT-based WebExtension with Chromium shipping Manifest V3. The current automated coverage is Vitest + jsdom with `wxt/testing/fake-browser`, which is valuable but does not exercise:

- Real MV3 service worker bootstrapping
- Real extension page bundling and runtime wiring (`popup.html`, `options.html`, `sidepanel.html`)
- Browser-level constraints (CSP, extension URL scheme, service worker lifecycle)

We want a minimal, reliable CI E2E smoke suite that runs on `ubuntu-latest` and validates that the built MV3 extension can load and render core pages.

Constraints to keep in mind:

- Extension loading in Playwright requires `chromium.launchPersistentContext` (persistent context) with `--load-extension=...`.
- Headless extension testing requires using the `chromium` **channel** (Playwright docs); default headless shell is not sufficient.
- Tests must be stable across i18n languages; avoid asserting localized text and prefer structural assertions.
- No secrets or real credentials should be needed; tests should avoid hitting real upstream sites.

## Goals / Non-Goals

**Goals:**

- Provide a Playwright E2E smoke suite that can run in CI without a real display.
- Build the Chromium MV3 extension (WXT) and load it as an unpacked extension in the test runner.
- Retrieve the runtime extension ID (MV3) via service worker URL and navigate to extension pages:
  - `chrome-extension://<id>/popup.html`
  - `chrome-extension://<id>/options.html`
  - (optional) `chrome-extension://<id>/sidepanel.html` if it is consistently available
- Add a GitHub Actions workflow (or extend existing) that installs Playwright Chromium, builds the extension, runs the E2E suite, and uploads artifacts (report/screenshots) on failure.

**Non-Goals:**

- Not testing toolbar UI behavior (clicking the browser extension button to open the popup).
- Not testing browser permission prompts, file pickers, or other browser chrome/system dialogs.
- Not validating upstream integrations (real API calls to third-party relay sites).
- Not covering Firefox MV2 (can be a future follow-up).

## Decisions

- **Use Playwright Test runner (`@playwright/test`)** for E2E.
  - Rationale: first-class fixtures, retries, reporters, CI ergonomics.
  - Alternative: raw Playwright API + Vitest. Rejected due to weaker CI ergonomics and fixtures.

- **Run extension tests in headless mode using `channel: "chromium"`**.
  - Rationale: Playwright docs indicate headless extension support relies on `chromium` channel (new headless mode) rather than the headless shell.
  - Alternative: headed + Xvfb. Kept as a fallback path for future tests that require browser UI chrome.

- **Test against built output `.output/chrome-mv3/`** (not source).
  - Rationale: validates the actual build artifact structure (manifest/service worker/page entrypoints) and catches bundling/regression issues.
  - Alternative: load source extension. Rejected; WXT build pipeline is part of what we want to validate.

- **Locate the extension ID via MV3 service worker URL**.
  - Approach: wait for `context.waitForEvent("serviceworker")` if needed, then parse `serviceWorker.url().split("/")[2]`.
  - Rationale: stable and recommended by Playwright docs for MV3.

- **Keep assertions language-independent**.
  - Approach: verify root container renders and key structural elements exist (e.g. `#root` has children, logo `img` with stable alt, or existence of known buttons via `aria-label` keys that are not localized only if stable).
  - Prefer `document.title` contains `All API Hub` since both `en` and `zh_CN` titles include that substring.

- **CI workflow integration**:
  - Use `pnpm exec playwright install --with-deps chromium` (Ubuntu) before running tests.
  - Upload `playwright-report/` and trace/video/screenshots only on failures to keep artifacts minimal.

## Risks / Trade-offs

- [Headless extension support changes across Chromium/Playwright versions] → Pin Playwright version via `package.json` and use official install command in CI; keep the smoke assertions minimal.
- [Flaky service worker timing] → Always `waitForEvent("serviceworker")` when `context.serviceWorkers()` is empty; add a reasonable timeout.
- [Build step failures in CI unrelated to E2E] → Make the workflow logs explicit and fail early on `pnpm build`.
- [Test accidentally depends on localized strings] → Prefer structural assertions (`#root` non-empty) and `title` substring checks rather than exact localized labels.
