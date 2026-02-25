# i18n-test-keys Specification

## Purpose
TBD - created by archiving change i18n-test-keys. Update Purpose after archive.
## Requirements
### Requirement: Vitest i18n returns stable namespaced keys by default

The test environment SHALL configure i18next so that missing translations render as fully-qualified translation keys in the form `<namespace>:<key>`.

This requirement exists to enable translation-key assertions without loading locale JSON in most tests.

#### Scenario: Missing translation renders namespaced key

- **WHEN** a test calls `t("ui:searchableSelect.noOptions")` and no translation resources are loaded
- **THEN** the returned string MUST equal `ui:searchableSelect.noOptions`

#### Scenario: Missing translation renders namespaced key for ns option

- **WHEN** a test calls `t("searchableSelect.noOptions", { ns: "ui" })` and no translation resources are loaded
- **THEN** the returned string MUST equal `ui:searchableSelect.noOptions`

#### Scenario: Missing translation ignores defaultValue fallbacks

- **WHEN** a test calls `t("searchableSelect.noOptions", { ns: "ui", defaultValue: "fallback" })` and no translation resources are loaded
- **THEN** the returned string MUST equal `ui:searchableSelect.noOptions`

### Requirement: React component tests provide i18n via a shared provider wrapper

The test utilities SHALL provide a single, recommended render path that wraps React trees with `I18nextProvider` using a deterministic test i18n instance.

#### Scenario: Component can call useTranslation without mocks

- **WHEN** a component uses `useTranslation("ui")` and renders through the shared `render(...)` utility
- **THEN** the component MUST be able to render without requiring `vi.mock("react-i18next")`

### Requirement: Hook tests can run with the same providers as component tests

The test utilities SHALL expose a provider-wrapped `renderHook(...)` helper that uses the same provider stack as the shared `render(...)` utility.

#### Scenario: Hook can use useTranslation without mocks

- **WHEN** a hook uses `useTranslation(...)` and is executed via the provider-wrapped `renderHook(...)` utility
- **THEN** the hook MUST be able to run without requiring `vi.mock("react-i18next")`

### Requirement: Non-React code paths using i18next.t are deterministic in Vitest

The Vitest global setup SHALL initialize the global i18next singleton so that modules importing `i18next` (or `t` from `"i18next"`) can translate deterministically during tests.

#### Scenario: Service code can call i18next.t without mocks

- **WHEN** a non-React module calls `i18next.t("messages:errors.operation.failed")` during a test
- **THEN** it MUST return the stable namespaced key `messages:errors.operation.failed` without requiring `vi.mock("i18next")`

### Requirement: Real locale bundle assertions are opt-in

Tests SHOULD default to asserting translation keys. If a test needs to assert localized copy, it MUST explicitly load the necessary resource bundles within the test.

#### Scenario: Copy assertion requires explicit resource setup

- **WHEN** a test asserts on a localized English string
- **THEN** the test MUST explicitly load the required namespace resources for the chosen language within that test’s setup

