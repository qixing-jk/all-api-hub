# Local development

## Prerequisites

Install the Node.js version in [`.nvmrc`](../../.nvmrc) and enable Corepack using the [quick start](../../CONTRIBUTING.md#getting-started). Corepack selects the pnpm version declared in [`package.json`](../../package.json). If an older global pnpm takes precedence on your PATH, use `corepack pnpm` explicitly.

## Tech stack

All API Hub uses:

- **Framework**: [WXT](https://wxt.dev) drives the multi-browser extension tooling and build pipeline
- **UI Layer**: [React](https://react.dev) powers the options UI and popup surfaces
- **Language**: [TypeScript](https://www.typescriptlang.org) keeps the codebase type-safe end-to-end
- **Styling**: [Tailwind CSS](https://tailwindcss.com) provides utility-first styling with theme tokens
- **Components**: [Radix UI](https://www.radix-ui.com/) supplies accessible primitives layered with our design system

## Running the extension

WXT opens the browser with the extension loaded by default. To start the dev server without opening a browser, use:

```bash
pnpm dev:no-browser
# Firefox:
pnpm dev:no-browser -b firefox
```

In an interactive terminal, press `o` followed by Enter to open the browser with the extension loaded. Server/config restarts also skip automatic opening; if WXT closes an opened browser during a restart, press `o` followed by Enter again. Changes to `web-ext.config.*` take effect on the next manual opening rather than automatically restarting the browser. `WXT_OPEN_BROWSER=0` gives the regular dev commands the same behavior. Setting `webExt.disabled: true` in local `web-ext.config.ts` disables both automatic and manual opening.

When needed, `pnpm browser:cdp` opens a debugging browser with the Chrome extension loaded automatically and reuses an existing debugging window. It can also start the dev server itself. Alternatively, load the extension in your own browser as described below.

The development Chrome browser keeps its profile in this worktree's `.browser-data/chrome` directory, preserving saved accounts, settings and website logins across browser and dev-server restarts and `wxt clean`. Each worktree has separate data. Local `web-ext.config.ts` settings can override the profile and persistence; Firefox keeps its temporary-copy behavior unless `keepProfileChanges` is explicitly enabled. An existing `.wxt/chrome-data` profile is moved to the new location during WXT configuration, including before cleanup. Close the browser using that old profile first; an active profile or an existing destination stops migration without overwriting either directory. Removing `.browser-data/chrome` resets that development data; earlier disposable profiles are not migrated.

The dev server binds to `127.0.0.1`; use the address and port printed at startup. If extension pages stay blank with `net::ERR_CONNECTION_REFUSED`, check that the server is running and that a system proxy is not intercepting loopback requests. See `wxt.config.ts` for the server configuration.

To load the development extension in your own browser while the server is running:

- Chrome: Navigate to `chrome://extensions/`, enable "Developer mode", click "Load unpacked", and select the `.output/chrome-mv3-dev` directory.
- Firefox: Navigate to `about:debugging#/runtime/this-firefox`, click "Load Temporary Add-on", and select `manifest.json` inside the `.output/firefox-mv2-dev` directory.

For live desktop automation or Android Firefox, Edge, and Lemur debugging, use the [live-extension-ui-automation skill](../../.agents/skills/live-extension-ui-automation/SKILL.md). The [Android workflow](../../.agents/skills/live-extension-ui-automation/references/mobile-debugging.md) covers installed extensions, development installation, and hot updates.

## JetBrains project settings

The repository shares `.idea/modules.xml` and `.idea/all-api-hub.iml` to exclude build output, caches, test reports and visual captures from IDE project analysis and normal project searches. Test source directories (`tests/` and `e2e/`) and feature specifications under `.scratch/` remain included. Personal IDE state and other `.idea` files stay ignored.

These settings use a fixed module name and relative paths. New worktrees inherit them when checking out a revision that contains these files; existing worktree branches need to integrate that revision. Reopen the project if the IDE has not reloaded the module configuration. An explicitly selected directory or custom search scope can have different search behavior.

## Local tooling environment configuration

Playwright, real-site E2E runners, CDP launch/control runners, standalone provider probes, browser profile sync, and the E2E diagnostics launcher use `scripts/utils/local-env.mjs`. Linked worktrees automatically reuse the primary checkout's `.env.local`; the primary checkout is identified by Git, independently of which branch it has checked out. Shared credentials need only be maintained there. Files are read directly and are never copied into other worktrees.

From lowest to highest priority:

1. Primary checkout `.env.local` (shared defaults only).
2. Current checkout `.env`.
3. Current checkout `.env.local`.
4. A runner's explicit `--env-file`, where supported (currently OmniRoute).
5. Environment variables already present when the command starts, including CI.

An empty value can override a shared default. Keep checkout-specific ports, extension output paths, and other runtime differences in the current checkout. The loader does not rewrite relative paths: their interpretation remains owned by each consuming command. Prefer absolute paths for shared browser/profile locations. Never point a linked checkout's extension output at the primary checkout merely because its credentials are shared.

Shared defaults assume trusted local checkout configuration. Service addresses and credentials are merged independently; when switching deployments, also override the matching credentials rather than inheriting another deployment's token.

These controls must be set in the launching shell, not in an env file:

- `AAH_SHARED_ENV=0` disables shared-file loading.
- `AAH_SHARED_ENV_DIR=<directory>` explicitly selects the directory containing the shared `.env.local`. Relative directories resolve against this checkout. A missing explicitly selected file fails with its path; an absent automatically discovered shared file is optional.
- A nonempty `CI` disables shared-file loading, including explicit shared paths.

Ordinary clones and archives work with their own files. The primary checkout loads its own files once. Use `pnpm env:diagnostics` to print the selected shared directory and loaded file paths; this command does not print keys or values.

The loader uses Node's `util.parseEnv` syntax (comments, quoted values, multiline values, and `export`), with no shell evaluation or `${VAR}` expansion. See the [Node environment file specification](https://nodejs.org/api/environment_variables.html#dotenv).

WXT dev/build commands retain native mode/browser-specific env loading. Shared defaults with `WXT_` or `VITE_` prefixes are excluded by the Node loader because those prefixes expose variables to extension code. Keep test credentials in Node-only variables and env files out of Git; see [WXT environment variables](https://wxt.dev/guide/essentials/config/environment-variables).

## Linting and formatting

```bash
# Run ESLint and the color/typography checks
pnpm lint

# Fix ESLint issues automatically
pnpm lint:fix

# Format only the files you changed
pnpm exec prettier --write path/to/changed-file.ts

# Check formatting without modifying files
pnpm format:check
```

`pnpm format` formats the entire repository; use it when repository-wide formatting is intended.

## Type checking

```bash
# Run TypeScript compiler without emitting files
pnpm compile
```

`noUncheckedIndexedAccess` is enabled for `src/**`, `tests/**`, and `e2e/**`.

`pnpm compile` invokes the stable TypeScript 7 native compiler through the `@typescript/native` package alias. It uses one checker to limit parallel memory use, retains incremental results in `tsconfig.tsbuildinfo`, and explicitly keeps the previous automatic ambient-type discovery with `--types "*"`. The `typescript` dependency aliases the official TypeScript 6 compatibility package for the JavaScript compiler API used by ESLint and source-analysis scripts. Use `pnpm compile` for the native checker; `tsc6` remains available for API compatibility diagnostics. This follows the [official side-by-side setup](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-60). ESLint's current rules need syntax only, so its parser does not construct a second semantic TypeScript project.

## Project structure

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
├── scripts/          # Development, diagnostics, and validation commands
├── docs/             # Public documentation and project guidance
├── .agents/skills/   # Task-specific agent workflows and references
├── tests/            # Vitest setup and utilities (repo-root tooling)
│   ├── msw/          # MSW handlers and server setup
│   └── test-utils/   # Testing utilities (custom render, etc.)
```

## UI module boundaries

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

Use `~/` imports for `src/` and `~~/` for the repository root. Keep React state ownership outside `src/services/` and tests under `tests/` or `e2e/`.

Consult the focused guides for [product and UI conventions](../agents/product.md), [persistent storage](../agents/storage.md), [translations](../agents/i18n.md), and [site integrations](../agents/site-integrations.md) when changing those areas.
