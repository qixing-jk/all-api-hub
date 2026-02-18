## Why

We have solid Vitest/jsdom coverage, but CI does not exercise a real browser-extension runtime. A basic Playwright smoke suite in CI will catch regressions in the MV3 build output (manifest/service worker/bootstrapping) before they ship.

## What Changes

- Add a Playwright-based E2E smoke test suite that loads the built Chromium MV3 extension and verifies core extension pages (popup/options) can render.
- Add scripts to build the extension and run the E2E suite locally and in CI.
- Update GitHub Actions to run the E2E smoke suite on `ubuntu-latest` in headless mode.

## Capabilities

### New Capabilities

- `extension-e2e-smoke`: Basic browser-level smoke testing for the Chromium MV3 extension build (load unpacked extension; verify popup/options boot successfully).

### Modified Capabilities

- (none)

## Impact

- CI: new dependency on Playwright and a Chromium install suitable for extension testing; workflow runtime will increase (browser download + run).
- Repo: `package.json` scripts/devDependencies changes; new `e2e/` (or equivalent) Playwright test files and config; CI workflow updates under `.github/workflows/`.
- Product/runtime: no user-facing behavior change; this is test/CI only.
