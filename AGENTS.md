# Repository Guidelines

## Project Structure & Module Organization

- `src/entrypoints/`: WXT extension entrypoints for `background`, `content`, `popup`, `options`, and `sidepanel`.
- `src/features/`: feature-oriented UI modules; keep entrypoints thin and push reusable logic into features, services, hooks, or utils.
- `src/components/` and `src/components/ui/`: shared React components and UI primitives.
- `src/services/`: business logic, persistence, site adapters, and browser integration.
- `src/hooks/`, `src/contexts/`, `src/utils/`, `src/types/`, `src/constants/`, `src/lib/`, `src/styles/`: shared app building blocks.
- `src/locales/`: app i18n resources; manifest strings live in `src/public/_locales/`.
- `tests/`: Vitest setup, MSW handlers, and shared test utilities.
- `e2e/`: Playwright end-to-end coverage.
- Build artifacts are written to `.output/`; browser test artifacts may appear in `coverage/`, `playwright-report/`, and `test-results/`.

## Domain Knowledge: Site Types & Upstream Backends

This repo's `siteType` values are compatibility buckets used by `src/services/apiService/*` and related UI routing.

When working on a site type:

1. Confirm current in-repo behavior first in `src/constants/siteType.ts`, `src/services/siteDetection/detectSiteType.ts`, and `src/services/apiService/index.ts`.
2. Verify upstream behavior before making definitive claims when backend differences matter.
3. If upstream behavior cannot be verified, state assumptions clearly and ask for the target deployment URL, fork, version, or a redacted network trace.

### Relationships

- **One API (`one-api`)** is the original upstream family; many compatible deployments use `src/services/apiService/common/`.
- **New API (`new-api`)** is downstream of One API and mainly uses `src/services/apiService/common/`.
- **Veloera (`Veloera`)** and several other supported variants are downstream of New API; Veloera keeps dedicated overrides in `src/services/apiService/veloera/`.
- **OneHub (`one-hub`)** is downstream of One API with a substantially different surface.
- **DoneHub (`done-hub`)** is downstream of OneHub and currently layers `src/services/apiService/doneHub/` on top of `src/services/apiService/oneHub/` in `src/services/apiService/index.ts`.
- **Octopus (`octopus`)** has dedicated managed-site logic and API overrides in `src/services/apiService/octopus/` plus related provider logic under `src/services/managedSites/providers/`.
- **AnyRouter (`anyrouter`)** and **WONG公益站 (`wong-gongyi`)** have custom check-in handling.
- **Sub2API (`sub2api`)** is not One-API/New-API compatible; it has a different auth model and API surface.

### Managed Sites

`ManagedSiteType` is defined in `src/constants/siteType.ts` and currently includes:

- `new-api`
- `Veloera`
- `done-hub`
- `octopus`

Do not assume `one-hub` or every New-API-like deployment is a managed site without checking the current type definition.

### Backend Notes

- Shared One-API/New-API-family helpers live in `src/services/apiService/common/`.
- Compatible user-id headers are handled in `src/services/apiService/common/utils.ts` and related helpers.
- Some adapter directories under `src/services/apiService/` are provider-specific integrations rather than `siteType` values, so check `src/constants/siteType.ts` before documenting behavior.

### Default Upstream References

When the user names a backend without a deployment URL or fork, treat these as the default upstream references:

- One API: `https://github.com/songquanpeng/one-api`
- New API: `https://github.com/QuantumNous/new-api`
- Veloera: `https://github.com/Veloera/Veloera`
- OneHub: `https://github.com/MartialBE/one-hub`
- DoneHub: `https://github.com/deanxv/done-hub`
- Sub2API: `https://github.com/Wei-Shaw/sub2api`

If the user's reported behavior differs from upstream, ask for the exact deployment, fork, or version before concluding the repo is wrong.

## Build, Test, and Development Commands

Prereqs: Node.js 20+ and pnpm 10+.

- Install: `pnpm install` (runs `wxt prepare` via `postinstall`).
- Dev, Chromium: `pnpm dev`, then load `.output/chrome-mv3-dev` as an unpacked extension.
- Dev, Firefox: `pnpm dev:firefox`, then load `.output/firefox-mv2-dev` as a temporary add-on.
- Dev, mobile Firefox helper: `pnpm dev:mobile:firefox`.
- Build: `pnpm build`, `pnpm build:firefox`, `pnpm build:all`.
- Package: `pnpm zip`, `pnpm zip:firefox`, `pnpm zip:all`.
- Type-check: `pnpm compile`.
- Lint/format checks: `pnpm lint`, `pnpm format:check`.
- Unit tests: `pnpm test`, `pnpm test:watch`, `pnpm test:ci`.
- E2E tests: `pnpm e2e:install`, `pnpm e2e`, `pnpm e2e:ui`.

## Coding Style & Naming Conventions

- TypeScript + React with Prettier formatting and ESLint enforcement.
- Follow the existing repo style: 2 spaces, no semicolons, double quotes.
- Prefer `~/` for `src/` imports and `~~/` for repo-root imports such as tests and tooling.
- Tests typically use `*.test.ts` or `*.test.tsx` and are either colocated in `__tests__/` or organized under `tests/` for cross-cutting coverage.
- Keep options-page entrypoints thin; shared logic should not depend on `src/entrypoints/options/pages/**`.

## Implementation Expectations

- Inspect nearby existing abstractions before planning or implementing new helpers, modules, or UI patterns; prefer reuse or small extensions over parallel implementations.
- Add brief inline comments or short code-block comments when non-obvious intent, invariants, edge cases, or protocol/browser constraints need clarification; do not narrate obvious code.
- the minimum validation bar is `pnpm lint` plus the smallest related automated test scope that exercises the touched behavior.

## Testing Guidelines

- Unit and component tests use Vitest with jsdom and Testing Library.
- HTTP mocking uses MSW from `tests/msw/handlers.ts` and `tests/msw/server.ts`.
- Shared test rendering utilities live in `tests/test-utils/render.tsx`.
- Global test setup lives in `tests/setup.ts` and uses `wxt/testing/fake-browser` for WebExtension API mocking.
- Start with the smallest affected test set, then broaden only if the change is cross-cutting.
- Current coverage baseline is configured in `vitest.config.ts`.

## Documentation Guidelines

- Keep repo docs such as `README.md` and `README_EN.md` consistent when their shared content changes.
- In `docs/docs/`, treat Chinese pages as the source of truth.
- `docs/docs/en/**` and `docs/docs/ja/**` are auto-translated by `docs_assistant/translate.py` and `.github/workflows/translate-docs.yml`; avoid manual edits unless the workflow itself changes.
- When adding or removing docs pages under `docs/docs/`, update locale navigation in `docs/docs/.vuepress/config.js`.

## Security & Configuration Tips

- Never commit secrets, tokens, or private environment overrides.
- Use `.env.example` as the reference for supported environment variables.
- Treat backup or generated local files as out of scope unless the task explicitly targets them.
