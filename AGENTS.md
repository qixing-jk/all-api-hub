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
- Tests typically use `*.test.ts` or `*.test.tsx` and are organized under `tests/`; do not add colocated `__tests__/` directories under `src/`.
- Keep options-page entrypoints thin; shared logic should not depend on `src/entrypoints/options/pages/**`.

## Implementation Expectations

- Inspect nearby existing abstractions before planning or implementing new helpers, modules, or UI patterns; prefer reuse or small extensions over parallel implementations.
- Add brief inline comments or short code-block comments when non-obvious intent, invariants, edge cases, or protocol/browser constraints need clarification; do not narrate obvious code.
- the minimum validation bar is the repo's `pre-commit`-equivalent validation flow when available; if no such flow exists, fall back to `pnpm lint` plus the repo's affected-file or related-test validation command for the touched files.
- In this repo, the default staged validation entrypoint is `pnpm run validate:staged`; do not treat bare `pnpm lint-staged` as the full pre-commit flow because it skips the separate staged i18n guard.
- When the repo defines a `pre-commit` validation flow, prefer running the equivalent `pre-commit` checks directly without creating a commit instead of assembling a hand-picked validation command set.

## Testing Guidelines

- Unit and component tests use Vitest with jsdom and Testing Library.
- HTTP mocking uses MSW from `tests/msw/handlers.ts` and `tests/msw/server.ts`.
- Shared test rendering utilities live in `tests/test-utils/render.tsx`.
- Global test setup lives in `tests/setup.ts` and uses `wxt/testing/fake-browser` for WebExtension API mocking.
- For `src/**` TS/TSX changes that add or modify executable logic, treat tests as part of the same task by default instead of waiting for CI to expose a coverage drop. Pure types, constants, copy, styles, and no-behavior refactors are the main exceptions.
- New executable files, functions, branches, listeners/controllers, or error fallback paths should usually ship with at least one targeted test covering the added behavior.
- Start with the repo-defined `pre-commit`, affected-file, or `related` validation flow for the touched files, then broaden only if the change is cross-cutting.
- For TS/TSX edits in this repo, treat `pnpm run validate:staged` / the Husky `pre-commit` path as the default affected validation flow and prefer `vitest related --run` style checks over a manually assembled test file list.
- If a change modifies shared component or hook props, validation must cover direct render/use sites and standalone harness tests that instantiate the changed API surface.
- Current coverage baseline is configured in `vitest.config.ts`.

## Documentation Guidelines

- Keep repo docs such as `README.md` and `README_EN.md` consistent when their shared content changes.
- In `docs/docs/`, treat Chinese pages as the source of truth.
- `docs/docs/en/**` and `docs/docs/ja/**` are auto-translated by `docs_assistant/translate.py` and `.github/workflows/translate-docs.yml`; avoid manual edits unless the workflow itself changes.
- When adding or removing docs pages under `docs/docs/`, update locale navigation in `docs/docs/.vuepress/config.js`.

## i18n Guidelines

- When a helper explicitly accepts a translation function, type it as `TFunction` from `i18next`. Do not hand-write signatures like `(key: string, options?: any) => string` or `ReturnType<typeof useTranslation>["t"]` unless a narrower type is intentionally required.
- When adding short badge, chip, button, or helper-copy translations, avoid `t(key, { count })` unless plural key families are explicitly intended and already modeled in locale files.
- For compact UI labels that include a number, prefer rendering the numeric count separately and translating only the static label text so `i18n:extract` does not rewrite the key into `_one` / `_other` variants unexpectedly.
- Treat any unexpected `_one`, `_other`, or similar extract-generated key-family rewrites as a signal to change the calling pattern or key shape, not as something to patch manually in locale JSON.
- After running `pnpm run i18n:extract`, inspect the locale diff before proceeding. Confirm the intended new keys are still present and no required keys were removed as "unused" by the extractor.
- If `i18n:extract` removes keys you expected to keep, fix the source usage or extractor configuration instead of re-adding locale JSON by hand. In this repo, prefer direct extractable calls such as `t("ns:key")` over wrapper names like `translate("ns:key")` unless the wrapper is explicitly configured in `i18next.config.ts`.
- After changing translation keys, locale JSON, or any UI code that adds new `t(...)` usages, run `pnpm run i18n:extract:ci` and ensure it reports no unexpected updates before handoff.
- Keep locale key shapes stable across languages; do not let one language drift into a pluralized or structurally different key family unless that family is intentionally introduced for every locale.

## Security & Configuration Tips

- Never commit secrets, tokens, or private environment overrides.
- Use `.env.example` as the reference for supported environment variables.
- Treat backup or generated local files as out of scope unless the task explicitly targets them.
