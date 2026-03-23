# Contributing to All API Hub

Thank you for considering contributing to All API Hub! This guide will help you get started with development and testing.

## Development Setup

### Prerequisites

- Node.js 20 LTS or higher
- pnpm 10 or higher

## Tech Stack

All API Hub is built with the same stack highlighted in the in-app About page to ensure the docs match what you see in the UI:

- **Framework**: [WXT](https://wxt.dev) drives the multi-browser extension tooling and build pipeline
- **UI Layer**: [React](https://react.dev) powers the options UI and popup surfaces
- **Language**: [TypeScript](https://www.typescriptlang.org) keeps the codebase type-safe end-to-end
- **Styling**: [Tailwind CSS](https://tailwindcss.com) provides utility-first styling with theme tokens
- **Components**: [Headless UI](https://headlessui.com) supplies accessible primitives layered with our design system

### Getting Started

1. **Fork and clone the repository**

```bash
git clone https://github.com/YOUR_USERNAME/all-api-hub.git
cd all-api-hub
```

2. **Install dependencies**

```bash
pnpm install
```

3. **Start development server**

For Chrome:
```bash
pnpm dev
```

For Firefox:
```bash
pnpm dev:firefox
```

4. **Load the extension in your browser**

- Chrome: Navigate to `chrome://extensions/`, enable "Developer mode", click "Load unpacked", and select the `.output/chrome-mv3-dev` directory.
- Firefox: Navigate to `about:debugging#/runtime/this-firefox`, click "Load Temporary Add-on", and select `manifest.json` inside the `.output/firefox-mv2-dev` directory.

## Testing

### Overview

This project uses [Vitest](https://vitest.dev/) for unit and component testing. Tests run in a jsdom environment with mocked browser APIs and storage.

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode (useful during development)
pnpm test:watch

# Run tests with coverage report (used in CI)
pnpm test:ci
```

### Test Coverage

Coverage reports are automatically generated when running `pnpm test:ci`. You can view detailed coverage reports in the `coverage/` directory after running tests.

The project aims for reasonable test coverage targets (currently set to 5% globally as a baseline). These can be adjusted in `vitest.config.ts` as the project grows.

### Writing Tests

#### Unit Tests

Unit tests should be placed under the repo-level `tests/` tree. Mirror the source area in the path when it helps readability:

```
src/utils/formatters.ts
tests/utils/formatters.test.ts
```

Example unit test:

```typescript
import { describe, it, expect } from "vitest"
import { formatTokenCount } from "~/utils/formatters"

describe("formatTokenCount", () => {
  it("should format large numbers with M suffix", () => {
    expect(formatTokenCount(1500000)).toBe("1.5M")
  })

  it("should handle zero", () => {
    expect(formatTokenCount(0)).toBe("0")
  })
})
```

#### Component Tests

Component tests should also live under `tests/`. Use the custom render function from `tests/test-utils/render.tsx` which wraps components with required providers:

```
src/components/LinkCard.tsx
tests/components/LinkCard.test.tsx
```

Example component test:

```typescript
import { describe, it, expect } from "vitest"
import { render, screen } from "~~/tests/test-utils/render"
import LinkCard from "~/components/LinkCard"

describe("LinkCard", () => {
  it("should render correctly with required props", async () => {
    render(<LinkCard title="Test" description="Test description" href="https://example.com" buttonText="Click" Icon={TestIcon} />)
    
    expect(await screen.findByText("Test")).toBeInTheDocument()
    expect(await screen.findByText("Test description")).toBeInTheDocument()
  })
})
```

#### i18n in Tests (Translation Key Assertions)

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

### Test Infrastructure

#### Mocks

The test setup (`tests/setup.ts`) provides the following mocks:

- **Browser APIs + storage**: `wxt/testing/fake-browser` (wired up in `tests/setup.ts`) sets `globalThis.browser` / `globalThis.chrome`, including `browser.storage.*`. `@plasmohq/storage` works on top of this without extra mocks.
- **i18next**: Lightweight test instance configured in `tests/test-utils/i18n.ts`
- **MSW**: Mock Service Worker for API endpoint mocking

#### MSW Handlers

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

#### Custom Render

The `render` function from `tests/test-utils/render.tsx` wraps components with necessary providers:
- DeviceProvider
- UserPreferencesProvider  
- ThemeProvider

This ensures components have access to all required contexts during testing.

## Code Style

### Linting and Formatting

```bash
# Run ESLint
pnpm lint

# Fix linting issues automatically
pnpm lint:fix

# Format code with Prettier
pnpm format

# Check formatting without modifying files
pnpm format:check
```

### Type Checking

```bash
# Run TypeScript compiler without emitting files
pnpm compile
```

### Git Hooks

This project uses [Husky](https://typicode.github.io/husky) to enforce code quality through Git hooks:

- **pre-commit**: Runs `pnpm run validate:staged` (see `.husky/pre-commit` and `package.json`)
  - Runs `pnpm lint-staged --concurrent false` to format staged source and script files with Prettier, fix ESLint issues, and run `vitest related --run` for staged JS/TS files
  - Then runs `pnpm run i18n:check:staged` so repo-level translation extraction checks are not skipped when `lint-staged` passes
- **pre-push**: Runs `pnpm compile` (see `.husky/pre-push`)
  - This catches full-repo TypeScript issues locally before push

The hooks are automatically set up when you run `pnpm install` (via the `prepare` script).
If you want to reproduce the full pre-commit validation manually, run `pnpm run validate:staged`. Do not treat bare `pnpm lint-staged` as equivalent to the repo's complete pre-commit flow.
If you want to reproduce the pre-push validation manually, run `pnpm compile`.

#### Skipping Hooks (Not Recommended)

In rare cases where you need to bypass hooks:

```bash
# Skip Husky hooks (e.g., pre-commit)
git commit --no-verify
```

⚠️ **Warning**: Only skip hooks if you have a valid reason, as they ensure code quality and prevent common issues.

## Building

### Development Build

```bash
pnpm build
```

### Production Build

For Chrome:
```bash
pnpm build
pnpm zip
```

For Firefox:
```bash
pnpm build:firefox
pnpm zip:firefox
```

For all browsers:
```bash
pnpm build:all
pnpm zip:all
```

## Continuous Integration

GitHub Actions automatically runs tests on every push and pull request. The workflow:

1. Checks out the code
2. Installs dependencies with pnpm
3. Runs `pnpm compile` for full-repo type checking
4. Runs `pnpm lint` for repository-wide lint validation
5. Runs `pnpm run i18n:extract:ci` to ensure locale files stay in sync with code
6. Runs `pnpm test:ci` to execute tests with coverage
7. Uploads coverage artifacts

Make sure all tests pass before submitting a pull request.

## Pull Request Guidelines

1. **Create a feature branch** from `main`
2. **Write tests** for new features or bug fixes
3. **Ensure all tests pass**: Run `pnpm test:ci`
4. **Lint and format code**: Run `pnpm lint` and `pnpm format`
5. **Type check**: Run `pnpm compile`
6. **Write clear commit messages** describing your changes
7. **Update documentation** if you're adding new features

## Project Structure

```
all-api-hub/
├── src/              # Extension/runtime source code (WXT srcDir)
│   ├── assets/       # Runtime images/icons bundled by Vite
│   ├── components/   # Shared React components (UI primitives in src/components/ui/)
│   ├── constants/    # Shared constants
│   ├── contexts/     # React context providers
│   ├── entrypoints/  # WXT entry points (wiring-only: routing/bootstrapping/integration glue)
│   ├── features/     # Canonical home for UI feature/page modules (components/hooks/utils)
│   ├── hooks/        # Custom React hooks
│   ├── lib/          # Shared low-level helpers (e.g. cn())
│   ├── locales/      # UI i18n resources (i18next)
│   ├── public/       # Extension public assets (manifest i18n: src/public/_locales/)
│   ├── services/     # Business logic and API services
│   ├── styles/       # Global CSS (Tailwind entry)
│   ├── types/        # Shared TypeScript type definitions
│   └── utils/        # Utility functions
├── e2e/              # Playwright end-to-end tests (repo-root tooling)
├── plugins/          # Repo-root tooling (e.g. Vite/WXT plugins)
├── tests/            # Vitest setup and utilities (repo-root tooling)
│   ├── msw/          # MSW handlers and server setup
│   └── test-utils/   # Testing utilities (custom render, etc.)
```

## UI Module Taxonomy (Where Does UI Code Go?)

To keep the options UI consistent and reusable, this repo follows a single module taxonomy:

- `src/entrypoints/**` are **wiring-only**: routing, bootstrapping, and integration glue.
  - Options pages under `src/entrypoints/options/pages/**` should be thin wrappers that render feature modules.
  - Non-entrypoint code MUST NOT import from `~/entrypoints/options/pages/**`.
- `src/features/<Feature>/**` are the **canonical home for UI modules** (page/feature code), including `components/`, `hooks/`, and `utils/`.
- Shared layers:
  - `src/components/**` / `src/components/ui/**`: shared UI primitives and reusable UI components
  - `src/services/**`: business logic, storage, API clients, and background/runtime integrations
  - `src/types/**`: shared domain types used across layers
  - `src/utils/**`: shared non-UI helpers (keep UI concerns like toasts/i18n in features/entrypoints)

Dependency direction should stay one-way: `src/entrypoints/**` → `src/features/**` → shared layers (`src/components/`, `src/services/`, `src/types/`, `src/utils/`).

## Getting Help

If you have questions or need help:

- Check the [documentation](https://all-api-hub.qixing1217.top/)
- Review [existing issues](https://github.com/qixing-jk/all-api-hub/issues)
- Open a new issue with your question

Thank you for contributing! 🎉
