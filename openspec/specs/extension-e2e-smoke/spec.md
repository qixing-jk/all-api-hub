# extension-e2e-smoke Specification

## Purpose
The `extension-e2e-smoke` suite validates that the built Chromium MV3 extension can load in a real browser runtime (headless on CI), that its service worker starts and can be discovered, and that core entrypoint pages (popup, options, and sidepanel if present) render without uncaught runtime errors.

## Requirements
### Requirement: CI can load the built Chromium MV3 extension

The system MUST provide an automated E2E smoke test that loads the built unpacked Chromium MV3 extension artifact produced by `pnpm build` (WXT) from `.output/chrome-mv3/`.

#### Scenario: Load unpacked extension from build output
- **WHEN** the E2E test runner launches Chromium with the extension directory `.output/chrome-mv3/` via `--load-extension`
- **THEN** the extension's MV3 service worker SHALL start and be observable by the test runner

### Requirement: E2E smoke can discover the runtime extension id

The E2E smoke suite MUST be able to determine the runtime extension id for the loaded MV3 extension in a stable way.

#### Scenario: Discover extension id from MV3 service worker URL
- **WHEN** the test waits for the extension MV3 service worker to be available
- **THEN** the test SHALL derive the extension id from the service worker URL in the form `chrome-extension://<id>/...`

### Requirement: Popup page boots successfully

The system MUST provide an E2E smoke test that validates the extension popup page can render in a real browser extension runtime.

#### Scenario: Open popup page by extension URL
- **WHEN** the test navigates to `chrome-extension://<id>/popup.html`
- **THEN** the page SHALL render application UI content (the root container is non-empty) without uncaught runtime errors

### Requirement: Options page boots successfully

The system MUST provide an E2E smoke test that validates the extension options page can render in a real browser extension runtime.

#### Scenario: Open options page by extension URL
- **WHEN** the test navigates to `chrome-extension://<id>/options.html`
- **THEN** the page SHALL render application UI content (the root container is non-empty) without uncaught runtime errors

### Requirement: E2E smoke suite runs in CI on ubuntu-latest

The E2E smoke suite MUST be runnable in GitHub Actions on `ubuntu-latest` in a non-interactive environment.

#### Scenario: Run E2E smoke in CI headless mode
- **WHEN** the CI job installs Playwright Chromium and runs the E2E smoke command
- **THEN** the job SHALL execute without requiring a real display server (no manual GUI interaction)

