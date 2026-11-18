# Unit and component testing

## Overview

This project uses [Vitest](https://vitest.dev/) for unit and component testing. The `dom` project runs component and browser-dependent tests in jsdom through `tests/setup.ts`; the `node` project runs other TypeScript tests through `tests/setup.node.ts`. Choose the environment needed by the behavior under test; `vitest.config.ts` owns project selection and both setups provide the applicable shared mocks.

## Running tests

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

## Test coverage

Coverage reports are automatically generated when running `pnpm test:ci`. You can view detailed coverage reports in the `coverage/` directory after running tests.

The repository enforces global Vitest coverage thresholds in CI. Treat `vitest.config.ts` as the source of truth for the current required values rather than copying them into this document.

## Writing tests

Add or update tests that protect observable behavior or contracts. Documentation, copy, formatting, type-only, and mechanical changes generally do not need new tests.

### Choosing coverage

- Reuse existing tests when they already protect the changed behavior. Cover relevant failure paths and direct consumers of changed shared APIs; behavior-preserving refactors still need regression evidence.
- Assert meaningful results or boundary contracts rather than whole internal structures, mock sequences, or incidental styles. Exact shapes and mock calls are appropriate when that shape or external call is itself the contract.
- Use Vitest/Testing Library for state, parsing, filtering, and isolated components. Reserve E2E for unresolved browser-extension runtime, cross-entrypoint, navigation, persistence, or interaction risks; one representative browser workflow usually complements focused state coverage better than a UI matrix.
- Prefer semantic selectors; for workflow-critical E2E controls that need a stable copy-independent selector, use feature-local `testIds.ts` constants rather than position or DOM structure. Assert user-visible copy for outcomes where appropriate.
- Keep temporary verification tests only when deterministic and valuable as regression coverage. Decide locally unless retention requires a material expansion in infrastructure, maintenance cost, or task scope.

### Unit tests

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

### Component tests

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

The wrapper includes app providers such as `UserPreferencesProvider`, whose initial loading can defer rendering. Await the first visible element with `findBy*`, then use synchronous queries for elements already rendered. See [the render helper](../../tests/test-utils/render.tsx) for provider toggles and [existing component tests](../../tests/components/LinkCard.test.tsx) for working examples.

### Translation assertions

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

## Test infrastructure

Vitest 5 shares the Vite server between the Node and DOM projects and caches transformed modules in `node_modules/.vitest-cache`. Set `VITEST_FS_MODULE_CACHE=0` to disable the module cache for a diagnostic run. Tests and coverage collection still execute when transforms are cached. Shard blob reports use `.vitest/blob`; the report checker supports the known 4.0, 4.1, 5.0 and 5.1 layouts and rejects unknown versions.

### Mocks

The shared setup (`tests/setup.shared.ts`, loaded by both test environments) provides browser/storage and i18n support. The DOM setup adds browser-specific behavior; consult the applicable setup when a test needs a particular mock:

- **Browser APIs + storage**: `wxt/testing/fake-browser` sets `globalThis.browser` / `globalThis.chrome`, including `browser.storage.*`. `@plasmohq/storage` works on top of this without extra mocks.
- **i18next**: Lightweight test instance configured in `tests/test-utils/i18n.ts`
- **MSW**: Mock Service Worker for API endpoint mocking

### MSW handlers

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

For the browser runners, see [Browser and extension testing](../../e2e/README.md). For test sharding and report publication, see [CI and releases](ci-and-releases.md).
