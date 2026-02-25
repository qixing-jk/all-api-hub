## Context

The current Vitest suite uses a mix of approaches for i18n:

- React component tests generally render through `tests/test-utils/render.tsx`, which wraps `I18nextProvider` using a shared `testI18n` instance from `tests/test-utils/i18n.ts`.
- Many tests still import locale JSON files and call `testI18n.addResourceBundle(...)` to assert localized copy.
- Some tests (especially hook/unit/service tests) use `vi.mock("react-i18next")` and/or `vi.mock("i18next")` to avoid warnings or to control `t()`.

This leads to brittle assertions (copy changes break tests), inconsistent i18n behavior across test types, and extra per-test setup/mocking.

The goal of this change is to standardize on translation-key assertions by making missing translations render stable, fully-qualified keys (e.g. `ui:searchableSelect.noOptionsAllowCustom`) while keeping both React and non-React i18n usage working without ad-hoc mocks.

## Goals / Non-Goals

**Goals:**

- Make translation-key assertions the default and easy path in tests.
- Reduce or eliminate routine `vi.mock("react-i18next")` / `vi.mock("i18next")` usage whose only purpose is “make `t()` available”.
- Ensure consistent behavior for:
  - React code paths using `useTranslation(...)` / `I18nextProvider`
  - Non-React code paths using `i18next.t(...)` or `import { t } from "i18next"`
- Keep the test harness fast and deterministic (no async language detection, no loading JSON resources by default).

**Non-Goals:**

- Validating that locale JSON content matches UX copy requirements (translation correctness).
- Catching missing/extra translation keys via every unit test. (If needed, add a dedicated locale parity check separately.)
- Changing production i18n behavior or user-facing localization behavior.

## Decisions

### 1) Assert translation keys, not localized copy

Tests should prefer asserting the translation key string (e.g. `messages:toast.loading.refreshingAccount`) instead of importing locale bundles and asserting English/Chinese text.

Rationale:

- Keys are relatively stable and intentionally part of the UI contract.
- Localized copy changes frequently and should not force unrelated test churn.
- Reduces fixture setup (`addResourceBundle`) and avoids coupling tests to specific locales.

### 2) Configure i18next to return fully-qualified missing keys

Adopt `appendNamespaceToMissingKey: true` for the test i18n configuration.

Rationale:

- Default i18next behavior returns missing keys without the namespace prefix (e.g. `pageTitle.options`), which makes key assertions ambiguous and inconsistent with how the app references strings (`ui:...`, `messages:...`).
- With `appendNamespaceToMissingKey: true`, missing translations become stable `ns:key` strings that tests can assert.

Implementation notes:

- Keep translation resources empty by default to ensure tests see keys and never “accidentally” assert localized copy.
- Set `parseMissingKeyHandler: (key) => key` so missing translations always render as stable keys even when call sites pass `defaultValue` (avoids accidental copy assertions via fallbacks).
- Pin a deterministic language (e.g. `lng: "en"`, `fallbackLng: "en"`). The chosen language is only used to pick resources (which are empty), not to define expected output.
- Disable async init in setup where possible (`initImmediate: false`) to avoid timing-related flakes for non-React imports.

### 3) Align React test i18n with production runtime constraints

Update `tests/test-utils/i18n.ts` (the `testI18n` instance) to include:

- `react: { useSuspense: false }`

Rationale:

- Production `utils/i18n.ts` disables Suspense. Mirroring this prevents “not ready” rendering paths from introducing flakes or forcing `react-i18next` mocks.

### 4) Initialize the global i18next singleton in `tests/setup.ts`

Because substantial app code uses the global singleton (`i18next.t` or `t` from `"i18next"`) outside React, the Vitest setup should initialize the singleton once with the same “key assertion” configuration.

Rationale:

- Removes the need for service tests to stub/mock `i18next` just to make `t()` return something deterministic.
- Ensures uniform behavior across React and non-React tests.

### 5) Provide provider-wrapped Testing Library helpers (including `renderHook`)

Add a shared test utility to run hooks within the same provider stack used for component tests:

- `renderHook` wrapper uses the same `AppProviders` wrapper as `render(...)` (including `I18nextProvider`).
- Implementation is a thin wrapper over `@testing-library/react`’s `renderHook`, re-exported as `renderHook` from `~/tests/test-utils/render` with `wrapper: AppProviders`.

Rationale:

- Many existing hook tests mock `react-i18next` solely because `useTranslation` is referenced by the hook/component tree.
- A wrapper-based approach is closer to production wiring and reduces mocking surface area.

### 6) Keep mocking as an exception, not the default

Mocks are still acceptable for:

- Testing error-handling branches (e.g. forcing `t()` to throw).
- Verifying that code reacts to language changes (explicit `changeLanguage` flows).
- Isolating third-party side effects unrelated to i18n.

But the default path should be: initialized i18next + provider-wrapped render utilities + key assertions.

## Risks / Trade-offs

- **[Risk] Translation keys can drift without detection** → **Mitigation**: add a dedicated locale parity check (e.g. “all namespaces share the same key set across `locales/en` and `locales/zh_CN`”) instead of relying on unit tests to validate translations.
- **[Risk] Some tests currently depend on real copy for queries (labels/placeholder text)** → **Mitigation**: switch those assertions to keys, or query by role/testid when semantics matter more than copy.
- **[Risk] Shared singleton state across tests (language/resources)** → **Mitigation**: avoid mutating resources in tests; for the rare tests that need real resources, isolate by creating a dedicated i18n instance or by locally adding/removing bundles within the test lifecycle.
- **[Risk] Initialization timing for modules that import `i18next`** → **Mitigation**: initialize i18next in `tests/setup.ts` at module load time (or earliest hook) with `initImmediate: false` to ensure deterministic behavior before most imports execute.

## Migration Plan

1. Update `tests/test-utils/i18n.ts` to use key-assertion config (`appendNamespaceToMissingKey`, `parseMissingKeyHandler`, `useSuspense: false`, no real resources).
2. Initialize global `i18next` singleton in `tests/setup.ts` with the same key-assertion config (`appendNamespaceToMissingKey`, `parseMissingKeyHandler`) and deterministic init timing (`initImmediate: false`).
3. Extend `tests/test-utils/render.tsx` to export provider-wrapped `renderHook` (and optionally re-export `@testing-library/react`’s `renderHook` signature).
4. Refactor tests incrementally:
   - Remove locale JSON imports + `addResourceBundle` where assertions can be key-based.
   - Remove `vi.mock("react-i18next")` / `vi.mock("i18next")` where no longer required.
5. Add a focused regression test to lock in the key-assertion behavior for both React and non-React code paths (see `tests/test-utils/i18nKeyAssertions.test.tsx`).
6. (Optional follow-up) Add a separate, explicit translation-parity test to keep locale key sets aligned.

## Open Questions

- Should we keep a small set of “integration-style” UI tests that load real locale bundles to catch wiring issues, while keeping the majority key-based?
- Do we want a single canonical test language (`en`) or just rely on the missing-key behavior and avoid caring about language entirely?
