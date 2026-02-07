# Repository Guidelines

## Project Structure & Module Organization

- `entrypoints/`: WXT extension entry points (popup/options/background/content scripts).
- `components/` and `components/ui/`: shared React components (UI primitives live in `components/ui/`).
- `features/`: feature-oriented modules; keep UI thin and delegate logic to services/hooks.
- `services/`: business logic, persistence, and WebExtension/Storage integrations.
- `hooks/`, `contexts/`, `utils/`, `types/`, `constants/`: reusable app building blocks.
- `locales/`: UI i18n resources (i18next). Manifest strings live in `public/_locales/`.
- `tests/`: Vitest setup, MSW handlers, and test utilities. Build artifacts are written to `.output/`.

## Domain Knowledge: Site Types & Upstream Backends

This repo’s `siteType` values are **compatibility buckets** used to select API overrides
(`services/apiService/*`) and drive UI behavior.

When working on a site type:

1. **Confirm current in-repo behavior first**: check `constants/siteType.ts`, `services/detectSiteType.ts`,
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
  - In repo, `one-hub` and `done-hub` share the same override module (`services/apiService/oneHub/`) for token listing
    + model pricing + group info.
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
  - overrides: `services/apiService/oneHub/` (used for both `one-hub` and `done-hub` in `services/apiService/index.ts`)
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
  - overrides: `services/apiService/anyrouter/index.ts` (check-in status via `services/autoCheckin/providers/anyrouter`)

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

## Build, Test, and Development Commands

Prereqs: Node.js 20+ and pnpm 10+.

- Install: `pnpm install` (runs `wxt prepare` via `postinstall`).
- Dev (Chrome MV3): `pnpm dev`, then load unpacked from `.output/chrome-mv3-dev`.
- Dev (Firefox MV2): `pnpm dev:firefox`, then load temporary add-on from `.output/firefox-mv2-dev`.
- Build/Package: `pnpm build`, `pnpm zip` (or `pnpm build:all`, `pnpm zip:all`).
- Quality gates: `pnpm lint`, `pnpm format:check`, `pnpm compile`.

## Coding Style & Naming Conventions

- TypeScript + React. Formatting is enforced by Prettier (2 spaces, no semicolons, double quotes) and ESLint.
- Prefer the repo-root import alias: `import { render } from "~/tests/test-utils/render"`.
- Tests: `*.test.ts` / `*.test.tsx`, typically under `__tests__/` next to the code under test.

## Testing Guidelines

- Frameworks: Vitest (jsdom) + Testing Library; MSW for network mocking.
- Run: `pnpm test` (quick) or `pnpm test:ci` (coverage to `coverage/`, used in CI).
- Coverage: current global baseline is 5% (see `vitest.config.ts`). Add tests for new/changed behavior and raise thresholds incrementally.

## Documentation Guidelines

- Repo docs (e.g., `README.md`, `README_EN.md`, and other multi-language Markdown) should be kept consistent across language versions when updating content.
- Docs site (`docs/docs/`): treat Chinese pages (`docs/docs/*.md`) as the source of truth; `docs/docs/en/**` and `docs/docs/ja/**` are auto-translated (see `docs_assistant/translate.py` / `.github/workflows/translate-docs.yml`) and generally shouldn’t be edited manually.
- When adding/removing a docs page under `docs/docs/`, update the locale nav links in `docs/docs/.vuepress/config.js` for each language (e.g., `/...`, `/en/...`, `/ja/...`).

## Commit & Pull Request Guidelines

- Commits follow Conventional Commits in practice: `feat(scope): …`, `fix: …`, `docs: …`, `chore: …`.
- PRs: include a clear description, link issues when relevant, add screenshots/GIFs for UI changes, and note tested browsers (Chrome/Firefox).
- Before opening a PR, run: `pnpm lint && pnpm format:check && pnpm compile && pnpm test:ci`.

## Security & Configuration Tips

- Never commit secrets (API keys/tokens). Use `.env.example` as a reference and keep local overrides untracked.
