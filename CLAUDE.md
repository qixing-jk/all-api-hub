# CLAUDE.md

This file gives Claude Code a concise, repo-specific working guide for `all-api-hub`.

## Project Overview

All API Hub is a browser extension for managing AI relay and API-platform accounts across multiple backend families such as One API, New API, Veloera, OneHub, DoneHub, Octopus, AnyRouter, and Sub2API.

Core capabilities include:

- account discovery and site detection
- balance, quota, usage, and token management
- model sync and managed-site tooling
- auto check-in, WebDAV sync, and browser-side helper flows
- extension UI across popup, options page, and side panel

## Tech Stack

- Framework: WXT
- UI: React 19 + TypeScript
- Styling: Tailwind CSS 4 with shared UI built on Headless UI, Radix UI, Base UI, and local primitives
- State/data: React Context + TanStack Query
- Storage: `@plasmohq/storage`
- Testing: Vitest + Testing Library + MSW
- E2E: Playwright

## Common Commands

### Development

```bash
pnpm install
pnpm dev
pnpm dev:firefox
pnpm dev:mobile:firefox
pnpm compile
```

After starting a dev server:

- Chromium builds load from `.output/chrome-mv3-dev`
- Firefox builds load from `.output/firefox-mv2-dev`

### Tests

```bash
pnpm test
pnpm test:watch
pnpm test:ci
pnpm test -- path/to/test.test.ts
pnpm test -- -t "pattern"
pnpm e2e:install
pnpm e2e
pnpm e2e:ui
```

### Quality / Build

```bash
pnpm lint
pnpm lint:fix
pnpm format
pnpm format:check
pnpm build
pnpm build:firefox
pnpm build:all
pnpm zip
pnpm zip:firefox
pnpm zip:all
```

## Project Structure

- `src/entrypoints/`: WXT entrypoints for `background`, `content`, `popup`, `options`, and `sidepanel`
- `src/features/`: feature-oriented modules; UI should stay thin and delegate logic
- `src/components/` and `src/components/ui/`: shared components and UI primitives
- `src/services/`: business logic, persistence, API adapters, managed-site services, WebDAV sync, and browser integration
- `src/hooks/`, `src/contexts/`, `src/utils/`, `src/types/`, `src/constants/`, `src/lib/`, `src/styles/`: shared building blocks
- `src/locales/`: UI translations; manifest translations live in `src/public/_locales/`
- `tests/`: Vitest setup, MSW handlers, helpers, and broader test coverage
- `e2e/`: Playwright tests

## Architecture Notes

### Entrypoint Boundaries

- Keep files under `src/entrypoints/**` focused on bootstrapping, routing, and browser integration glue.
- Reusable UI and state should live under `src/features/**`, `src/components/**`, `src/hooks/**`, `src/services/**`, or `src/utils/**`.
- Non-entrypoint code should not depend on `src/entrypoints/options/pages/**`; extract shared logic instead.

### Runtime Messaging

- Runtime action constants live in `src/constants/runtimeActions.ts`.
- Background handlers are wired in `src/entrypoints/background/runtimeMessages.ts`.
- Frontend and shared callers should use `sendRuntimeMessage` from `~/utils/browser/browserApi`.

### Storage

- Storage keys are defined in `src/services/core/storageKeys.ts`.
- Prefer the existing storage services and migration helpers over direct ad-hoc reads and writes.
- The codebase uses `@plasmohq/storage`; follow existing patterns before introducing new storage wrappers.

### Temporary Window / Shield Bypass Flow

- Protected fetch flows are coordinated through background runtime messaging.
- Temporary browser contexts and tab reuse live under `src/entrypoints/background/tempWindowPool.ts` and related helpers.
- Site detection may use temporary-window fetches to retrieve original page titles when direct fetches are unreliable.

## Site Types and Backend Families

Treat `siteType` values as compatibility buckets, not strict product names.

Before changing site-specific behavior, check these files first:

- `src/constants/siteType.ts`
- `src/services/siteDetection/detectSiteType.ts`
- `src/services/apiService/index.ts`

Current high-value relationships:

- `one-api` is the original upstream family.
- `new-api` is downstream of One API and mostly uses `src/services/apiService/common/`.
- `Veloera` is downstream of New API and keeps dedicated overrides in `src/services/apiService/veloera/`.
- `one-hub` has dedicated OneHub-specific overrides in `src/services/apiService/oneHub/`.
- `done-hub` layers `src/services/apiService/doneHub/` on top of the OneHub implementation.
- `octopus` uses dedicated API and managed-site provider logic.
- `anyrouter` and `wong-gongyi` have custom check-in behavior.
- `sub2api` is a separate backend family with different auth and API behavior.

`ManagedSiteType` currently includes:

- `new-api`
- `Veloera`
- `done-hub`
- `octopus`

Do not assume every compatible backend is a managed site; verify the current type definitions first.

If a user asks about backend behavior that could differ by deployment, verify upstream or request the target deployment URL, fork, or version.

## Testing Guidance

- Global setup lives in `tests/setup.ts`.
- WebExtension APIs are mocked with `wxt/testing/fake-browser`.
- MSW handlers live in `tests/msw/handlers.ts` and `tests/msw/server.ts`.
- Shared React testing helpers live in `tests/test-utils/render.tsx`.
- Prefer the smallest affected test scope first, then broaden only if the change crosses feature or service boundaries.

## Coding Conventions

- Follow the existing Prettier and ESLint configuration: 2 spaces, no semicolons, double quotes.
- Use `~/` for `src/` imports and `~~/` for repo-root imports.
- Prefer existing abstractions before adding new ones.
- Keep entrypoints thin and avoid duplicating business logic across features or services.
- Match the repo's feature-oriented organization instead of creating one-off utility layers.

## Documentation Notes

- Keep `README.md` and `README_EN.md` aligned when shared repo-level documentation changes.
- In `docs/docs/`, Chinese pages are the source of truth.
- `docs/docs/en/**` and `docs/docs/ja/**` are usually generated via `docs_assistant/translate.py`; avoid manual edits unless the workflow itself changes.

## Practical Workflow

When making a change:

1. Check the nearest existing abstraction and current wiring.
2. Confirm whether the behavior is site-type-specific or shared.
3. Make the smallest change that fits the current architecture.
4. Run `pnpm lint` and the narrowest related test scope that still validates the touched behavior.
5. Update nearby docs when behavior or workflow guidance changes.
