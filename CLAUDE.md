# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

All API Hub is a browser extension for managing AI API aggregation platforms (New API, one-api, Veloera, etc.). It provides unified account management, balance tracking, model synchronization, and API key management across multiple platforms.

**Tech Stack:**
- **Framework**: WXT (multi-browser extension tooling)
- **UI**: React 19 + TypeScript
- **Styling**: Tailwind CSS 4 + Headless UI
- **State Management**: React Context + TanStack Query
- **Storage**: @plasmohq/storage (browser.storage wrapper)
- **Testing**: Vitest + Testing Library + MSW

## Common Commands

### Development
```bash
pnpm dev              # Start Chrome development server
pnpm dev:firefox      # Start Firefox development server
pnpm compile          # TypeScript type checking (no emit)
```

After starting dev server:
- **Chrome**: Load unpacked extension from `.output/chrome-mv3-dev`
- **Firefox**: Load temporary add-on from `.output/firefox-mv2-dev`

### Testing
```bash
pnpm test             # Run all tests once
pnpm test:watch       # Run tests in watch mode (for active development)
pnpm test:ci          # Run tests with coverage (used in CI)
```

To run a single test file:
```bash
pnpm test path/to/test.test.ts
```

To run tests matching a pattern:
```bash
pnpm test --grep "pattern"
```

### Code Quality
```bash
pnpm lint             # Check for linting issues
pnpm lint:fix         # Auto-fix linting issues
pnpm format           # Format code with Prettier
pnpm format:check     # Check formatting without modifying
```

### Building
```bash
pnpm build            # Build for Chrome
pnpm build:firefox    # Build for Firefox
pnpm build:all        # Build for all browsers
pnpm zip:all          # Create distribution packages
```

## Architecture Overview

### Browser Extension Structure

**Entry Points** (in `entrypoints/`):
- **background/**: Background runtime (Chromium MV3: event-driven service worker; Firefox MV2: background scripts/page)
  - Runtime message routing
  - Auto-refresh scheduler
  - WebDAV auto-sync
  - Temporary window pool management
  - Cookie interceptor for multi-account isolation
- **content/**: Scripts injected into web pages
  - Cloudflare/CAP shield bypass detection
  - Temporary window fetch operations
- **popup/**: Quick-access UI (browser toolbar icon)
- **options/**: Full-featured settings and management interface
- **sidepanel/**: Chrome side panel integration

### Feature-Based Organization

Features are self-contained modules in `features/` with their own:
- `components/`: Feature-specific UI components
- `hooks/`: Feature-specific React hooks and context providers
- `utils/`: Feature-specific utilities

Example: `features/AccountManagement/` contains all account-related code.

### Service Layer

Services in `services/` encapsulate business logic:
- `services/accounts/accountStorage.ts`: Account CRUD with migration support
- `services/accounts/autoRefreshService.ts`: Background refresh scheduler
- `services/webdav/webdavAutoSyncService.ts`: Cloud backup/sync
- `services/apiService/`: Multi-platform API client with override system
  - `common/`: Base API implementation
  - `anyrouter/`, `doneHub/`, `octopus/`, `oneHub/`, `sub2api/`, `veloera/`, `wong/`: Site-specific overrides/adapters
  - `openaiCompatible/`: OpenAI-compatible backend adapter

### API Service Override System

Supports multiple API platforms with a common interface + site-specific overrides:

```typescript
// Get the right API service for a site
const apiService = getApiService(siteType)
await apiService.fetchAccountData(account)
```

Common API methods:
- `fetchAccountData()`: Get quota, usage, income
- `refreshAccountData()`: Full account refresh
- `fetchAccountTokens()`: List API keys
- `fetchModelPricing()`: Get model pricing
- `createChannel()`, `updateChannel()`: Channel management

## Domain Knowledge: Site Types & Upstream Backends

This repo’s `siteType` values are **compatibility buckets** used to select API overrides
(`services/apiService/*`) and drive UI behavior.

When working on a site type:

1. **Confirm current in-repo behavior first**: check `constants/siteType.ts`, `services/siteDetection/detectSiteType.ts`,
   and `services/apiService/index.ts` (override wiring).
2. **Verify upstream behavior when the answer depends on it** (before making definitive claims or proposing changes):
    - Use any appropriate evidence source (e.g. upstream source/docs, a *redacted* network trace from the target site: URL + method + status + response shape; remove tokens/cookies, or a minimal reproduction).
    - If upstream behavior cannot be verified, answer conditionally (state assumptions) and request the missing evidence instead of asserting a single “correct” behavior.

### Default Upstream Reference (Reduce Ambiguity)

When a user mentions a backend by name (e.g. “Sub2API”) without providing a specific deployment URL, fork, or version,
use the upstream repository linked in this document as the default reference.

- If the user’s reported behavior differs from the upstream, ask for the target deployment URL (or fork repo + tag/commit)
  and base conclusions on that evidence.

### Relationships

- **New API (`new-api`)** is downstream (fork family) of **One API (`one-api`)**.
- **Veloera (`Veloera`)** (and most other supported variants like **VoAPI**, **Super-API**, **Rix-Api**, **neo-Api**)
  is downstream of **New API (`new-api`)**. Among supported variants, **Veloera’s API diverges the most**, so we
  keep targeted adapters/overrides (notably channel APIs) in `services/apiService/veloera/`.
- **New API (`new-api`)** and **Veloera (`Veloera`)** are treated as *managed sites* (`ManagedSiteType`) for admin
  features (channel management, model sync).
- **OneHub (`one-hub`)** is downstream of **One API (`one-api`)**, but the API surface changes substantially.
  **DoneHub (`done-hub`)** is downstream of **OneHub (`one-hub`)**.
    - In repo, `one-hub` uses `services/apiService/oneHub/`; `done-hub` uses `services/apiService/doneHub/` + `services/apiService/oneHub/`
      for token listing + model pricing + group info.
- **AnyRouter (`anyrouter`)** and **WONG公益站 (`wong-gongyi`)** have site-specific check-in handling.
- Many One-API/New-API family deployments still use `services/apiService/common/` for core calls; the request helper
  sends multiple compatible user-id header names via `services/apiService/common/utils.ts`.
- **Sub2API (`sub2api`)** is *not* One-API/New-API compatible, using a JWT-based auth and a different API surface.

### One API (`one-api`)

- **Family**: the original One-API project; most deployments are compatible with `services/apiService/common/`.
- **Naming**: in code the site type string is `one-api`.
- **Links**:
    - one-api: https://github.com/songquanpeng/one-api

### New API (`new-api`)

- **Family**: downstream of One API; this repo uses the shared `services/apiService/common/` implementation.
- **Naming**: in code the site type string is `new-api` (hyphenated).
- **Links**:
    - one-api: https://github.com/songquanpeng/one-api
    - new-api: https://github.com/QuantumNous/new-api

### Veloera (`Veloera`)

- **Family**: downstream of New API; largely compatible, but some admin endpoints/payloads differ (largest divergence).
- **Naming**: in code the site type string is `Veloera` (capital “V”).
- **Links**:
    - Veloera: https://github.com/Veloera/Veloera

### OneHub (`one-hub`) / DoneHub (`done-hub`)

- **Relationship**: `one-hub` is downstream of `one-api` (API changes are substantial); `done-hub` is downstream of `one-hub`.
- **Family**: OneHub-style backends with dedicated pricing/group/token endpoints (not New-API managed-site admin).
- **Naming**: in code the site type strings are `one-hub` and `done-hub`.
- **In repo**:
    - overrides: `services/apiService/oneHub/` (`one-hub`), `services/apiService/doneHub/` + `services/apiService/oneHub/` (`done-hub`; see `services/apiService/index.ts`)
        - endpoints include `/api/available_model`, `/api/user_group_map`, `/api/token/` (see `services/apiService/oneHub/index.ts`)
    - UI routes: `constants/siteType.ts` (`/panel/*` paths)
- **Links**:
    - one-hub: https://github.com/MartialBE/one-hub
    - done-hub: https://github.com/deanxv/done-hub

### VoAPI (`VoAPI`)

- **Family**: New-API-like variant; uses `services/apiService/common/`.
- **Naming**: in code the site type string is `VoAPI` (case-sensitive in constants; matching is case-insensitive).
- **In repo**: compatibility user header `voapi-user` in `services/apiService/common/utils.ts`.
- **Links**:
    - VoAPI: https://github.com/VoAPI/VoAPI

### Super-API (`Super-API`)

- **Family**: New-API-like variant; uses `services/apiService/common/`.
- **Naming**: in code the site type string is `Super-API`.
- **Links**:
    - Super-API: https://github.com/SuperAI-Api/Super-API

### AnyRouter (`anyrouter`)

- **Family**: heavily New-API customized deployment; often require **Cookie auth** for auto-detect/refresh.
- **Naming**: in code the site type string is `anyrouter`.
- **In repo**:
    - overrides: `services/apiService/anyrouter/index.ts` (check-in status via `services/checkin/autoCheckin/providers/anyrouter.ts`)

### WONG公益站 (`wong-gongyi`)

- **Family**: heavily New-API customized deployment; WONG公益站 deployment with a custom check-in endpoint.
- **Naming**: in code the site type string is `wong-gongyi`.
- **In repo**:
    - overrides: `services/apiService/wong/index.ts` (GET `/api/user/checkin` parsing + check-in capability)

### Rix-Api (`Rix-Api`) / neo-Api (`neo-Api`)

- **Family**: New-API-like variants; uses `services/apiService/common/`.
- **Naming**: in code the site type strings are `Rix-Api` and `neo-Api`.
- **In repo**: compatibility user headers `Rix-Api-User` / `neo-api-user` in `services/apiService/common/utils.ts`.

### Sub2API (`sub2api`)

- **Family**: Sub2API-specific dashboard backend (totally different).
- **Naming**: in code the site type string is `sub2api`.
- **Links**:
    - Upstream reference: https://github.com/Wei-Shaw/sub2api

### State Management

Three-tier context architecture:

1. **App-Level Contexts** (`contexts/`):
   - `UserPreferencesContext`: Global settings, auto-refresh config
   - `ThemeContext`: Dark/light mode management
   - `DeviceContext`: Device type detection

2. **Feature-Level Contexts** (`features/*/hooks/`):
   - `AccountDataContext`: Account list, stats, refresh state
   - `AccountActionsContext`: Action handlers (add, edit, delete)
   - `DialogStateContext`: Dialog open/close state

3. **Provider Composition**: Contexts wrap components hierarchically

### Storage Architecture

**Storage Layer** (`@plasmohq/storage`):
- Wraps `browser.storage.local` with reactive updates
- Type-safe storage keys in `services/core/storageKeys.ts`
- Automatic serialization/deserialization

**Concurrency Control**:
- Web Locks API for cross-context synchronization
- Fallback to in-memory queue when locks unavailable
- `withExtensionStorageWriteLock()` wrapper prevents race conditions

**Data Migration**:
- Version-based migration system (`configVersion` field)
- Automatic migration on read operations
- Migration functions in `services/**/migrations/` (e.g., `services/accounts/migrations/`, `services/preferences/migrations/`)

### Temporary Window Pool

**Purpose**: Bypass Cloudflare/CAP protection by opening real browser contexts

**Flow**:
1. Request needs protected resource
2. Acquire temp context for origin (reuse or create)
3. Wait for page load + shield bypass
4. Execute fetch in context
5. Release context (reuse or destroy after idle)

**Implementation**: `entrypoints/background/tempWindowPool.ts`

### Runtime Message System

**Message Routing** (`entrypoints/background/runtimeMessages.ts`):
- Centralized message handler in background script
- Action-based routing with prefixes (defined in `constants/runtimeActions.ts`)
- Async response handling

**Message Prefixes**:
- `AutoRefresh:*`: Auto-refresh actions
- `WebdavAutoSync:*`: WebDAV sync actions
- `ModelSync:*`: Model sync actions
- `TempWindow:*`: Temp window operations

## Important Conventions

### Path Aliases

Use `~/` prefix for absolute imports (configured in `tsconfig.json`):
```typescript
import { formatTokenCount } from "~/utils/formatters"
import { SiteAccount } from "~/types"
```

### Naming Conventions

- **Files**: camelCase for utilities, PascalCase for components
- **Components**: PascalCase (e.g., `AccountList.tsx`)
- **Services**: camelCase with `.ts` extension (e.g., `accountStorage.ts`)
- **Hooks**: `use` prefix (e.g., `useAccountData.ts`)
- **Types**: PascalCase interfaces/types (e.g., `SiteAccount`, `ApiToken`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `NEW_API`, `DEFAULT_LANG`)

### File Organization

- **Co-location**: Tests in `__tests__/` next to source files
- **Index files**: Re-export public API from `index.ts`
- **Feature modules**: Self-contained with own components/hooks/utils
- **Shared code**: In top-level `components/`, `hooks/`, `utils/`

### Testing Patterns

**Test Structure**:
```typescript
describe("ComponentName", () => {
  it("should render correctly", () => {
    // Arrange
    const props = { ... }

    // Act
    render(<Component {...props} />)

    // Assert
    expect(screen.getByText("...")).toBeInTheDocument()
  })
})
```

**Test Utilities** (`tests/test-utils/`):
- `render.tsx`: Custom render with providers (DeviceProvider, UserPreferencesProvider, ThemeProvider)
- `factories.ts`: Test data factories for consistent fixtures
- `i18n.ts`: Lightweight i18n for tests

**Mocking**:
- Browser APIs + storage: `wxt/testing/fake-browser` in `tests/setup.ts` (sets `globalThis.browser` / `globalThis.chrome`); `@plasmohq/storage` works on top of this without extra mocks.
- HTTP: MSW handlers in `tests/msw/handlers.ts`

### Internationalization (i18n)

**Structure**:
```
locales/
├── en/
│   ├── common.json
│   ├── account.json
│   └── messages.json
└── zh_CN/
    ├── common.json
    ├── account.json
    └── messages.json
```

**Usage**:
```typescript
import { useTranslation } from "react-i18next"

const { t } = useTranslation()
t("account:healthStatus.normal")  // namespace:key
```

### Logging

**Structured Logging** (`utils/logger.ts`):
```typescript
const logger = createLogger("ServiceName")

logger.debug("Operation started", { accountId, siteType })
logger.info("Operation completed", { result })
logger.warn("Potential issue", { error })
logger.error("Operation failed", error)
```

### Error Handling

**Typed Errors**:
- `ApiError`: HTTP errors with status codes
- `API_ERROR_CODES`: Machine-readable error codes

**Error Utilities**:
```typescript
import { getErrorMessage } from "~/utils/error"

try {
  await operation()
} catch (error) {
  logger.error("Failed", error)
  toast.error(getErrorMessage(error))
}
```

## Key Data Flows

### Account Refresh Flow

```
User Action (Popup/Options)
  ↓
sendRuntimeMessage(AutoRefreshRefreshNow)
  ↓
Background: autoRefreshService.refreshNow()
  ↓
accountStorage.refreshAllAccounts()
  ↓
For each account:
  getApiService(siteType).refreshAccountData()
  ↓
  API Calls (with temp window fallback if needed)
  ↓
  accountStorage.updateAccount(id, data)
  ↓
Storage update triggers reactive listeners
  ↓
UI re-renders with fresh data
```

### WebDAV Sync Flow

```
Timer Trigger / Manual Sync
  ↓
webdavAutoSyncService.syncWithWebdav()
  ↓
1. Test WebDAV connection
2. Download remote backup (decrypt if encrypted)
3. Normalize backup format (V1 → V2 migration)
4. Merge strategy (MERGE/UPLOAD_ONLY/DOWNLOAD_ONLY)
5. Save merged data to local storage
6. Upload new backup (encrypt if enabled)
  ↓
Notify frontend of sync completion
```

### Temp Window Fetch Flow

```
API Request needs protection bypass
  ↓
sendRuntimeMessage(TempWindowFetch, { originUrl, fetchUrl, ... })
  ↓
Background: handleTempWindowFetch()
  ↓
acquireTempContext(originUrl)
  ↓
Reuse existing context OR create new window/tab
  ↓
Wait for page load + Cloudflare/CAP bypass
  ↓
Apply DNR cookie rules (if needed)
  ↓
Send message to content script: ContentPerformTempWindowFetch
  ↓
Content script executes fetch() in page context
  ↓
Return response to background
  ↓
releaseTempContext() (reuse or destroy after idle)
```

## Git Hooks

This project uses Husky for Git hooks:

- **pre-commit**: Runs `lint-staged` which:
  - Formats code with Prettier
  - Fixes linting issues with ESLint
  - Runs related tests with Vitest

- **pre-push**: Not configured in this repo currently (CI covers `pnpm test:ci`; run `pnpm test:ci && pnpm compile` locally before pushing when possible).

Hooks are automatically set up when you run `pnpm install`.

## Important Notes

### Browser Extension Development

- **Manifest Version**: This extension uses Manifest V3 in Chromium (service workers, not background pages), but Manifest V2 in Firefox (background pages).
- **Cross-browser**: Code must work in Chrome, Edge, and Firefox
- **Permissions**: Optional permissions are requested at runtime when needed
- **Storage**: Use `@plasmohq/storage` instead of direct `browser.storage` calls
- **Messages**: Use runtime message system for background ↔ content/popup communication

### WXT Framework

- **Entry points**: Files in `entrypoints/` become extension components
- **Auto-imports**: WXT auto-imports browser APIs and common utilities
- **Hot reload**: Dev server supports hot module replacement
- **Build output**: `.output/<browser>-mv<2|3>-<mode>/` contains built extension (e.g., `.output/chrome-mv3-dev`, `.output/firefox-mv2-dev`)

### React 19

- This project uses React 19 with the new JSX transform
- Use functional components with hooks
- Avoid class components

### TypeScript

- **Strict mode**: Enabled with `noUnusedLocals` and `noUnusedParameters`
- **Path aliases**: Use `~/` for absolute imports
- **Type safety**: All code should be fully typed (no `any` unless necessary)

### Tailwind CSS 4

- Uses Tailwind CSS 4 with `@tailwindcss/postcss`
- Utility-first approach
- Custom theme tokens in `tailwind.config.js` (dark mode uses `class`)
- Dark mode support via `ThemeContext`

### Testing

- **jsdom environment**: Tests run in simulated browser environment
- **Mocked browser APIs**: All WebExtension APIs are mocked
- **MSW for HTTP**: Use MSW handlers for API mocking
- **Custom render**: Always use `render` from `tests/test-utils/render.tsx`
- **Coverage targets**: Currently set to 5% globally (can be increased)

## Common Patterns

### Adding a New Feature

1. Create feature directory in `features/[FeatureName]/`
2. Add components in `features/[FeatureName]/components/`
3. Add hooks/contexts in `features/[FeatureName]/hooks/`
4. Add utilities in `features/[FeatureName]/utils/`
5. Write tests in `tests/` directories
6. Export public API from `features/[FeatureName]/index.ts`

### Adding a New API Platform

1. Create override file in `services/apiService/[platform]/`
2. Implement platform-specific methods
3. Register in `services/apiService/index.ts` siteOverrideMap
4. Add platform constant to `constants/siteType.ts`
5. Update type definitions in `types/index.ts`

### Adding a New Storage Key

1. Add key to `services/core/storageKeys.ts`
2. Add type definition for stored data
3. Add migration logic if needed in `services/**/migrations/` (e.g., `services/accounts/migrations/`, `services/preferences/migrations/`)
4. Use `@plasmohq/storage` to read/write

### Adding a New Runtime Message

1. Add action ID to `constants/runtimeActions.ts`
2. Add handler in `entrypoints/background/runtimeMessages.ts`
3. Use `sendRuntimeMessage()` from frontend code

## Documentation

- **User Documentation**: https://all-api-hub.qixing1217.top/
- **WXT Documentation**: https://wxt.dev/
- **Contributing Guide**: See CONTRIBUTING.md

### Documentation Guidelines

- Repo docs (e.g., `README.md`, `README_EN.md`, and other multi-language Markdown) should be kept consistent across language versions when updating content.
- Docs site (`docs/docs/`): treat Chinese pages (`docs/docs/*.md`) as the source of truth; `docs/docs/en/**` and `docs/docs/ja/**` are auto-translated (see `docs_assistant/translate.py` / `.github/workflows/translate-docs.yml`) and generally shouldn’t be edited manually.
- When adding/removing a docs page under `docs/docs/`, update the locale nav links in `docs/docs/.vuepress/config.js` for each language (e.g., `/...`, `/en/...`, `/ja/...`).
