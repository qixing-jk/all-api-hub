# Repository Guidelines

## Project Structure & Module Organization

### Source Modules

- `src/entrypoints/`: WXT extension entrypoints for `background`, `content`, `popup`, `options`, and `sidepanel`.
- `src/features/`: feature-oriented UI modules; keep entrypoints thin and push reusable logic into features, services, hooks, or utils.
- `src/components/` and `src/components/ui/`: shared React components and UI primitives.
- `src/services/`: business logic, persistence, site adapters, and browser integration.
- `src/hooks/`, `src/contexts/`, `src/utils/`, `src/types/`, `src/constants/`, `src/lib/`, `src/styles/`: shared app building blocks.
- `src/locales/`: app i18n resources; manifest strings live in `src/public/_locales/`.

### Tests and Artifacts

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
- **AxonHub (`axonhub`)** is not One-API/New-API compatible; it uses dedicated GraphQL admin integration in `src/services/apiService/axonHub/` plus a managed-site provider in `src/services/managedSites/providers/axonHub.ts`.
- **Claude Code Hub (`claude-code-hub`)** is not One-API/New-API compatible; it uses dedicated admin/provider integration in `src/services/apiService/claudeCodeHub/` plus a managed-site provider in `src/services/managedSites/providers/claudeCodeHub.ts`.
- **AnyRouter (`anyrouter`)** and **WONG公益站 (`wong-gongyi`)** have custom check-in handling.
- **Sub2API (`sub2api`)** is not One-API/New-API compatible; it has a different auth model and API surface.
- **AIHubMix (`AIHubMix`)** is an account-only site type with dedicated overrides in `src/services/apiService/aihubmix/`. Always use `https://aihubmix.com` as the API origin, including accounts imported from `console.aihubmix.com`. Auto-detect may use logged-in web endpoints (`/call/usr/self`, `/call/usr/tkn`) to obtain the account access token, but saved accounts should operate as access-token accounts. Token-authenticated AIHubMix API requests send raw `Authorization: <access_token>` without a `Bearer` prefix. AIHubMix does not support revealing a saved API key after creation; list/detail/search responses may contain masked keys, and `resolveApiTokenKey` must not fall back to common `/api/token/{id}/key` behavior.

### Managed Sites

`ManagedSiteType` is defined in `src/constants/siteType.ts` and currently includes:

- `new-api`
- `Veloera`
- `done-hub`
- `octopus`
- `axonhub`
- `claude-code-hub`

Do not assume `one-hub` or every New-API-like deployment is a managed site without checking the current type definition.

### Backend Notes

- Shared One-API/New-API-family helpers live in `src/services/apiService/common/`.
- Compatible user-id headers are handled in `src/services/apiService/common/utils.ts` and related helpers.
- AxonHub keeps its own admin integration under `src/services/apiService/axonHub/` and managed-site provider logic under `src/services/managedSites/providers/axonHub.ts`.
- Claude Code Hub keeps its own admin/provider integration under `src/services/apiService/claudeCodeHub/` and managed-site provider logic under `src/services/managedSites/providers/claudeCodeHub.ts`.
- AIHubMix keeps account-only API overrides under `src/services/apiService/aihubmix/`; do not alias it to `new-api` or add managed-site/provider integration unless upstream support is explicitly verified.
- Some adapter directories under `src/services/apiService/` are provider-specific integrations rather than `siteType` values, so check `src/constants/siteType.ts` before documenting behavior.

### Default Upstream References

When the user names a backend without a deployment URL or fork, treat these as the default upstream references:

- One API: `https://github.com/songquanpeng/one-api`
- New API: `https://github.com/QuantumNous/new-api`
- Veloera: `https://github.com/Veloera/Veloera`
- OneHub: `https://github.com/MartialBE/one-hub`
- DoneHub: `https://github.com/deanxv/done-hub`
- AxonHub: `https://github.com/looplj/axonhub`
- Claude Code Hub: `https://github.com/ding113/claude-code-hub`
- Sub2API: `https://github.com/Wei-Shaw/sub2api`
- AIHubMix API docs: `https://docs.aihubmix.com/en/api/Cli` and `https://docs.aihubmix.com/en/api/Models-API`

If the user's reported behavior differs from upstream, ask for the exact deployment, fork, or version before concluding the repo is wrong.

### External Backend References in Code

- When implementation behavior depends on external upstream documentation or verified backend behavior, add a concise code comment near the adapter logic that records the source and the specific contract being relied on.
- This is required when the source determines protocol fields, authentication format, unsupported capabilities, compatibility boundaries, one-time secrets, endpoint selection, or deliberate non-fallback behavior.
- Prefer a short URL or upstream repository reference plus the relevant contract summary. Do not add broad comments for ordinary implementation details that are already obvious from local types or tests.

## Build, Test, and Development Commands

### Prerequisites

Node.js version from `.nvmrc` and pnpm 10+.

### Local Development

- Install: `pnpm install` (runs `wxt prepare` via `postinstall`).
- Dev, Chromium: `pnpm dev`, then load `.output/chrome-mv3-dev` as an unpacked extension.
- Dev, Firefox: `pnpm dev:firefox`, then load `.output/firefox-mv2-dev` as a temporary add-on.
- Dev, mobile Firefox helper: `pnpm dev:mobile:firefox`.

### Build and Package

- Build: `pnpm build`, `pnpm build:firefox`, `pnpm build:all`.
- Package: `pnpm zip`, `pnpm zip:firefox`, `pnpm zip:all`.

### Validation and Tests

- Type-check: `pnpm compile`.
- Repo-wide dead-code/dependency analysis: `pnpm knip`.
- Lint/format checks: `pnpm lint`, `pnpm format:check`.
- Hook-equivalent validation: `pnpm run validate:staged`, `pnpm run validate:push`.
- Unit tests: `pnpm test`, `pnpm test:watch`, `pnpm test:ci`.
- E2E tests: `pnpm e2e:install`, `pnpm e2e`, `pnpm e2e:ui`.

## Coding Style & Naming Conventions

### Style

- TypeScript + React with Prettier formatting and ESLint enforcement.
- Follow the existing repo style: 2 spaces, no semicolons, double quotes.

### Imports and File Placement

- Prefer `~/` for `src/` imports and `~~/` for repo-root imports such as tests and tooling.
- Tests typically use `*.test.ts` or `*.test.tsx` and are organized under `tests/`; do not add colocated `__tests__/` directories under `src/`.
- Keep options-page entrypoints thin; shared logic should not depend on `src/entrypoints/options/pages/**`.
- Keep `src/services/` free of React UI state wiring. Put React context/provider modules in `src/contexts/`, and place UI-facing hooks outside `services/` unless they are genuinely service-layer logic with no React state ownership.

## Implementation Expectations

### Implementation Strategy

- Inspect nearby existing abstractions before planning or implementing new helpers, modules, or UI patterns; prefer reuse or small extensions over parallel implementations.
- If a string participates in runtime branching, shared protocol values, reusable state mapping, or canonical external URLs, do not duplicate it as a bare literal across modules. Prefer a single runtime constant source, and derive types from that source when both runtime and type-level usage are needed.
- Normalize data at the highest reliable boundary, then pass the normalized shape downward. Once a contract is established, prefer required types in downstream helpers and components instead of reintroducing optional fallbacks at each leaf.
- Keep fallback behavior close to the layer that defines the rule or owns the data contract. Do not duplicate the same fallback across multiple consumers merely to compensate for weak typing or incomplete normalization upstream.

### Progressive Refactoring

- Prefer progressive refactors over big-bang rewrites when replacing legacy flows or reshaping feature boundaries.
- When a new implementation path is chosen for a feature, route subsequent feature work to that path by default.
- Legacy paths may receive only compatibility shims, required regression fixes, or migration glue that forwards toward the new path.
- Do not implement the same new capability in both the preferred path and a legacy path unless the task explicitly requires a temporary compatibility bridge.
- When keeping a legacy branch temporarily, add a short comment that states why it still exists, what new path replaces it, and what condition allows safe removal.
- Before deleting an old path, verify inbound references, impacted site types or adapters, and the relevant validation coverage.

### Comments and User Feedback

- Add brief inline comments or short code-block comments when non-obvious intent, invariants, edge cases, or protocol/browser constraints need clarification; do not narrate obvious code.
- For user-visible success/error feedback, do not rely solely on backend `message` fields; provide a local fallback when responses may be empty, unstable, or not suitable for direct display.

### Validation Floor

- The minimum validation bar is the repo's `pre-commit`-equivalent validation flow when available; if no such flow exists, fall back to `pnpm lint` plus the repo's affected-file or related-test validation command for the touched files.
- In this repo, the default staged validation entrypoint is `pnpm run validate:staged`; do not treat bare `pnpm lint-staged` as the full pre-commit flow because it skips the separate staged i18n guard.
- Do not treat `pnpm knip` as the default minimum for every task. Add it when changes can affect the module/dependency graph, such as `package.json` or lockfile edits, `knip.ts` edits, file moves/renames/deletions, new or removed exports/barrels, or dynamic wiring changes that may leave dead files, exports, or dependencies behind.
- When the repo defines a `pre-commit` validation flow, prefer running the equivalent `pre-commit` checks directly without creating a commit instead of assembling a hand-picked validation command set.

## Testing Guidelines

### Test Stack

- Unit and component tests use Vitest with jsdom and Testing Library.
- HTTP mocking uses MSW from `tests/msw/handlers.ts` and `tests/msw/server.ts`.
- Shared test rendering utilities live in `tests/test-utils/render.tsx`.
- Global test setup lives in `tests/setup.ts` and uses `wxt/testing/fake-browser` for WebExtension API mocking.

### Coverage Expectations

- For `src/**` TS/TSX changes that add or modify executable logic, treat tests as part of the same task by default instead of waiting for CI to expose a coverage drop. Pure types, constants, copy, styles, and no-behavior refactors are the main exceptions.
- New executable files, functions, branches, listeners/controllers, or error fallback paths should usually ship with at least one targeted test covering the added behavior.
- Do not stop at `happy path` coverage. For added or changed executable logic, identify and cover the most relevant `edge cases`, especially empty or partial inputs, invalid values, boundary conditions, backend error or empty responses, browser API unavailability, permission or environment limits, site-type compatibility branches, cache or persistence failures, and repeated or concurrent triggers.
- If an important `edge case` is not practical to automate in this change, call out the uncovered scenario, why it remains uncovered, and the residual risk before handoff.

### Validation Strategy

- Start with the repo-defined `pre-commit`, affected-file, or `related` validation flow for the touched files, then broaden only if the change is cross-cutting.
- For TS/TSX edits in this repo, treat `pnpm run validate:staged` / the Husky `pre-commit` path as the default affected validation flow and prefer `vitest related --run` style checks over a manually assembled test file list.
- When adding or reshaping shared exports, provider/context modules, public test utilities, runtime constant sets, or other structural wiring, prefer `pnpm run validate:push` before handoff instead of manually assembling `compile` + `knip`.
- Do not default to `pnpm run validate:push` for every small change; use it when the change is structural, cross-cutting, or likely to affect type/dependency/export analysis beyond the touched file.

### E2E and Broad Validation

- Do not add Playwright E2E coverage mechanically for every feature commit. Prefer Vitest or Testing Library for pure functions, protocol adapters, formatting/parsing logic, copy-only changes, style-only changes, and isolated component state.
- Before adding or expanding Playwright coverage, first ask whether the same regression can be covered by a targeted Vitest test. If the behavior is limited to hook state, component rendering, form validation, filtering/search/sorting, formatting, copy, or a mocked service call, use Vitest by default instead of E2E.
- Do not use E2E to exhaustively cover UI state matrices. For pages with many filters, tabs, empty states, sort modes, or control variants, keep those combinations in Vitest and reserve E2E for one representative browser-level path.
- For any new or materially changed user-facing behavior, make an explicit E2E decision before handoff: add/update an E2E test, identify the existing E2E flow that already covers the risk, or state why lower-level tests are the right coverage layer.
- Bias toward adding or updating Playwright E2E coverage only when the main risk appears in a real extension browser context. This includes cross-entrypoint behavior across popup, options, sidepanel, background, content scripts, runtime messages, tabs, windows, or extension storage; navigation, hash routing, lazy-loaded entrypoints, first-load behavior, and deep links; browser APIs or permissions such as notifications, downloads, clipboard, context menus, tab/window handling, optional permissions, service workers, or extension build output; complete critical workflows whose failure would not be visible in component tests; and interaction risks involving dialogs, popovers, floating layers, drag/drop, toasts, or confirm flows.
- Add or update E2E coverage for regressions that lower-level tests previously missed, especially when the failure involved browser runtime behavior, entrypoint integration, persisted state, or a complete user task.
- For larger PRs that add a user-visible workflow, prefer one stable happy-path E2E scenario over many narrow UI assertions. If an existing E2E already boots the relevant entrypoint and exercises a representative path, extend Vitest coverage for additional states instead of adding another browser scenario.
- Final handoffs for user-facing behavior changes should include the E2E decision and the validation actually run.
- Temporary E2E tests created only for self-verification should be deleted before handoff by default. Keep them only when they are deterministic, reusable, and provide clear long-term regression value; if retention is genuinely ambiguous, explain the tradeoff and ask before keeping them.
- If the change can invalidate unused-file, export, or dependency analysis, broaden validation to include `pnpm knip`; use `pnpm run validate:push` when you want the full local pre-push-equivalent gate instead of assembling `compile` + `knip` manually.

### Shared Surface Changes

- If a change modifies shared component or hook props, validation must cover direct render/use sites and standalone harness tests that instantiate the changed API surface.
- Current coverage baseline is configured in `vitest.config.ts`.

## Documentation Guidelines

### Source of Truth

- Keep repo docs such as `README.md` and `README_EN.md` consistent when their shared content changes.
- In `docs/docs/`, treat Chinese pages as the source of truth.

### Translation Workflow

- `docs/docs/en/**` and `docs/docs/ja/**` are auto-translated by `docs_assistant/translate.py` and `.github/workflows/translate-docs.yml`; avoid manual edits by default. If the user explicitly asks to update translated docs directly, manual edits are allowed, but keep them minimal and aligned with the Chinese source.

### Navigation

- When adding or removing docs pages under `docs/docs/`, update locale navigation in `docs/docs/.vuepress/config.js`.

## i18n Guidelines

### Typing and API Usage

- When a helper explicitly accepts a translation function, type it as `TFunction` from `i18next`. Do not hand-write signatures like `(key: string, options?: any) => string` or `ReturnType<typeof useTranslation>["t"]` unless a narrower type is intentionally required.

### Plurals and Count Semantics

- When a visible phrase depends on `count` for grammar or wording, prefer a proper pluralized translation (`t(key, { count })`, ICU/message-format equivalent, or explicit plural key family) so the locale controls the full rendered phrase.
- Only split the numeric value out of the translation when the number is a genuinely separate visual metric, such as a standalone badge/counter or a parenthesized metric that does not need grammatical agreement with the adjacent label.
- Treat unexpected `_one`, `_other`, or similar extract-generated rewrites as a signal to clarify intent in source code: either model the phrase explicitly as pluralized copy, or remove `count` from the translation call because the number is visually independent. Do not patch locale JSON blindly without fixing the source usage pattern.

### Extraction Workflow

- After running `pnpm run i18n:extract`, inspect the locale diff before proceeding. Confirm the intended new keys are still present and no required keys were removed as "unused" by the extractor.
- If `i18n:extract` removes keys you expected to keep, fix the source usage or extractor configuration instead of re-adding locale JSON by hand. In this repo, prefer direct extractable calls such as `t("ns:key")` over wrapper names like `translate("ns:key")` unless the wrapper is explicitly configured in `i18next.config.ts`.
- After changing translation keys, locale JSON, or any UI code that adds new `t(...)` usages, run `pnpm run i18n:extract:ci` and ensure it reports no unexpected updates before handoff.

### Locale Shape Consistency

- Keep locale key shapes stable across languages; do not let one language drift into a pluralized or structurally different key family unless that family is intentionally introduced for every locale.

## Security & Configuration Tips

### Secrets and Configuration

- Never commit secrets, tokens, or private environment overrides.
- Use `.env.example` as the reference for supported environment variables.

### Local Files

- Treat backup or generated local files as out of scope unless the task explicitly targets them.
