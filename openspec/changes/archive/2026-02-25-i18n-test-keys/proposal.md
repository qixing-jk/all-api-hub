## Why

Our Vitest suite currently mixes real locale bundles with ad-hoc mocks of `i18next` / `react-i18next`, and some tests assert English/Chinese copy. This makes tests brittle when translations change and increases per-test setup overhead.

## What Changes

- Introduce a consistent i18n test harness so missing translations render stable, fully-qualified translation keys (e.g. `ui:searchableSelect.noOptions`), enabling key-based assertions.
- Ensure both React tests (via `I18nextProvider`) and non-React code paths (direct `i18next.t` / `t` imports) see the same predictable behavior in Vitest.
- Provide shared Testing Library utilities (including provider-wrapped `renderHook`) so tests can avoid mocking `react-i18next` just to satisfy `useTranslation`.
- Refactor existing tests to stop importing locale JSON / calling `addResourceBundle` where not needed, and replace copy-based assertions with translation-key assertions.

## Capabilities

### New Capabilities

- `i18n-test-keys`: A standardized Vitest i18n setup where tests assert translation keys (not localized copy), covering both React and non-React `i18next` usage.

### Modified Capabilities

<!-- None -->

## Impact

- Test infrastructure: `tests/setup.ts`, `tests/test-utils/i18n.ts`, `tests/test-utils/render.tsx` (and related test utilities).
- Many unit/component tests currently mocking `i18next` / `react-i18next` or asserting localized copy.
- Documentation updates for the project’s testing guidelines may be needed to codify the key-assertion convention.
