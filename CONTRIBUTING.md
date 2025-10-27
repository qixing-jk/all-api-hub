# Contributing to All API Hub

Thank you for considering contributing to All API Hub! This guide will help you get started with development and testing.

## Development Setup

### Prerequisites

- Node.js 20 LTS or higher
- pnpm 10 or higher

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
- Firefox: Navigate to `about:debugging#/runtime/this-firefox`, click "Load Temporary Add-on", and select any file in the `.output/firefox-mv3-dev` directory.

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

Unit tests should be placed in a `__tests__` directory next to the file being tested:

```
utils/
├── formatters.ts
└── __tests__/
    └── formatters.test.ts
```

Example unit test:

```typescript
import { describe, it, expect } from "vitest"
import { formatTokenCount } from "../formatters"

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

Component tests should also be in `__tests__` directories. Use the custom render function from `tests/test-utils/render.tsx` which wraps components with required providers:

```
components/
├── LinkCard.tsx
└── __tests__/
    └── LinkCard.test.tsx
```

Example component test:

```typescript
import { describe, it, expect } from "vitest"
import { render, screen } from "~/tests/test-utils/render"
import LinkCard from "../LinkCard"

describe("LinkCard", () => {
  it("should render correctly with required props", async () => {
    render(<LinkCard title="Test" description="Test description" href="https://example.com" buttonText="Click" Icon={TestIcon} />)
    
    expect(await screen.findByText("Test")).toBeInTheDocument()
    expect(await screen.findByText("Test description")).toBeInTheDocument()
  })
})
```

### Test Infrastructure

#### Mocks

The test setup (`tests/setup.ts`) provides the following mocks:

- **@plasmohq/storage**: In-memory storage implementation
- **Browser APIs**: Mocked WebExtension APIs via `vitest-webextension-mock`
- **i18next**: Lightweight test instance configured in `tests/test-utils/i18n.ts`
- **MSW**: Mock Service Worker for API endpoint mocking

#### MSW Handlers

API mocks are defined in `tests/msw/handlers.ts`. Add or override handlers in individual test files as needed:

```typescript
import { http, HttpResponse } from "msw"
import { server } from "~/tests/msw/server"

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

- **pre-commit**: Automatically checks code formatting and linting before each commit
  - Runs `pnpm format:check` to verify code formatting
  - Runs `pnpm lint` to check for linting issues
  - If issues are found, it will attempt to auto-fix and require you to review and stage changes
  
- **pre-push**: Ensures code quality before pushing to remote
  - Runs `pnpm test:ci` to execute all tests with coverage
  - Runs `pnpm compile` to verify TypeScript type checking

The hooks are automatically set up when you run `pnpm install` (via the `prepare` script).

#### Skipping Hooks (Not Recommended)

In rare cases where you need to bypass hooks:

```bash
# Skip pre-commit hook
git commit --no-verify

# Skip pre-push hook
git push --no-verify
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
3. Runs `pnpm test:ci` to execute tests with coverage
4. Uploads coverage artifacts

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
├── components/       # Reusable React components
├── contexts/         # React context providers
├── entrypoints/      # WXT entry points (popup, options, etc.)
├── features/         # Feature modules
├── hooks/            # Custom React hooks
├── services/         # Business logic and API services
├── tests/            # Test setup and utilities
│   ├── msw/          # MSW handlers and server setup
│   └── test-utils/   # Testing utilities (custom render, etc.)
├── types/            # TypeScript type definitions
└── utils/            # Utility functions
```

## Getting Help

If you have questions or need help:

- Check the [documentation](https://qixing-jk.github.io/all-api-hub/)
- Review [existing issues](https://github.com/qixing-jk/all-api-hub/issues)
- Open a new issue with your question

Thank you for contributing! 🎉
