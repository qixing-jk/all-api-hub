## 1. Baseline & Test Harness

- [x] 1.1 Update `tests/test-utils/i18n.ts` to enable `appendNamespaceToMissingKey: true` and `react: { useSuspense: false }` with deterministic `lng`/`fallbackLng`
- [x] 1.2 Initialize the global `i18next` singleton in `tests/setup.ts` with the same key-assertion config (and deterministic init timing)

## 2. Testing Library Utilities

- [x] 2.1 Extend `tests/test-utils/render.tsx` to export a provider-wrapped `renderHook(...)` helper matching the `render(...)` provider stack
- [x] 2.2 Add/update documentation (e.g. `CONTRIBUTING.md` / `CLAUDE.md`) to codify “assert translation keys by default” and when mocks are acceptable

## 3. Refactor Tests Toward Key Assertions

- [x] 3.1 Replace localized-copy assertions with key assertions for representative component tests (remove locale JSON imports + `addResourceBundle` where possible)
- [x] 3.2 Remove `vi.mock("react-i18next")` from hook/component tests that can use the provider-wrapped `render(...)` / `renderHook(...)` utilities
- [x] 3.3 Remove `vi.mock("i18next")` from unit/service tests where the global singleton init makes `t()` deterministic

## 4. Validation

- [x] 4.1 Run `pnpm lint && pnpm format:check && pnpm compile && pnpm test:ci` and ensure refactored tests pass without i18n-related warnings/flakes
- [x] 4.2 Add a small focused test that verifies the key-assertion behavior (`appendNamespaceToMissingKey`) for both React and non-React code paths
