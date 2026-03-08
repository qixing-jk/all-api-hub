## 1. Effective support and fallback plumbing

- [x] 1.1 Refine side panel support detection in `src/utils/browser/browserApi.ts` and `src/utils/browser/device.ts` so effective support is not based on API presence alone
- [x] 1.2 Downgrade support after observed open failures and add a shared side-panel open path that falls back to the Basic settings surface when open fails
- [x] 1.3 Update background action-click wiring in `src/entrypoints/background/actionClickBehavior.ts` to keep Chromium on the extension-managed fallback path and avoid dead-click behavior on false-positive runtimes

## 2. UI behavior alignment

- [x] 2.1 Update popup-side direct side-panel entry points to hide unsupported side-panel affordances and use the shared fallback behavior when invoked
- [x] 2.2 Update action-click settings UI messaging and support state to reflect effective side panel usability and device-local fallback behavior on the current runtime

## 3. Focused regression coverage

- [x] 3.1 Extend `tests/utils/browserApi.test.ts` and `tests/utils/browser.test.ts` with false-positive runtime and shared device-classification coverage
- [x] 3.2 Extend `tests/entrypoints/background/actionClickBehavior.test.ts` and `tests/utils/navigation.test.ts` with shared fallback and dead-click prevention coverage
- [x] 3.3 Extend popup/options tests for hidden unsupported side-panel entry points, direct-entry fallback, and unsupported-state messaging
