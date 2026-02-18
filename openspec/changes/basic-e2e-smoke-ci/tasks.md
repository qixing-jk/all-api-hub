## 1. E2E Test Scaffolding

- [x] 1.1 Add Playwright test dependencies (`@playwright/test`) and a pinned Playwright version suitable for CI
- [x] 1.2 Add Playwright config for extension testing (reporter, retries in CI, timeouts)
- [x] 1.3 Add an `e2e/` test folder with shared fixtures to launch a persistent Chromium context loading `.output/chrome-mv3/`
- [x] 1.4 Implement a fixture/helper to discover the MV3 `extensionId` from the service worker URL

## 2. Smoke Test Cases

- [x] 2.1 Add a smoke test that opens `chrome-extension://<id>/popup.html` and asserts the page bootstraps (root non-empty, title contains `All API Hub`)
- [x] 2.2 Add a smoke test that opens `chrome-extension://<id>/options.html` and asserts the page bootstraps (root non-empty, title contains `All API Hub`)
- [x] 2.3 (Optional) Add a smoke test for `chrome-extension://<id>/sidepanel.html` if consistently available in the MV3 build output

## 3. Local Developer Experience

- [x] 3.1 Add `pnpm` scripts for building and running E2E locally (e.g. `pnpm e2e`, `pnpm e2e:ui`)
- [x] 3.2 Document prerequisites and how to run the E2E smoke suite locally (including expected `.output/chrome-mv3/` build output)

## 4. CI Integration

- [x] 4.1 Add/extend a GitHub Actions workflow to run E2E smoke on `ubuntu-latest`:
  - install deps
  - `pnpm build`
  - `pnpm exec playwright install --with-deps chromium`
  - run `pnpm e2e`
- [x] 4.2 Upload Playwright artifacts on failure (report, traces/screenshots/videos if enabled)
- [x] 4.3 Ensure the E2E job is wired into PR validation with an acceptable runtime budget (and make it easy to disable/mark as optional if needed)
