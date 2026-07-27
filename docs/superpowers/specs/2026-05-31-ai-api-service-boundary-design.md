# AI API Service Boundary Design

Date: 2026-05-31

## Purpose

Separate the AI API protocol compatibility layer from the account-site
compatibility layer currently mixed under `src/services/apiService`.

The first implementation phase should make the boundary explicit without
changing runtime behavior. AI API helpers should no longer depend on
`~/services/apiService/**`, and all existing call sites should import the new
AI API entrypoints directly.

## Current Context

`src/services/apiService` currently contains two different responsibilities:

- account-site adapters and overrides, such as `common`, `aihubmix`,
  `anyrouter`, `oneHub`, `doneHub`, `sub2api`, `veloera`, and `wong`.
- AI API protocol helpers, currently `openaiCompatible`, `anthropic`, and
  `google`.

The account-site layer is selected through `getApiService(site)` and resolves
site-specific overrides for account data, tokens, balances, check-in, model
pricing, channels, and other site-owned behavior.

The AI API protocol helpers are different. They fetch upstream model lists from
OpenAI-compatible, Anthropic, and Google-compatible endpoints for API
credential profiles, Web AI API Check, CLI export dialogs, and managed-site
token-scoped model discovery. They are not selected through `getApiService`.

## Goals

- Move AI API protocol helpers out of `src/services/apiService`.
- Introduce a neutral transport layer for shared request and error
  infrastructure.
- Ensure `src/services/aiApi/**` has no imports from
  `~/services/apiService/**`.
- Update all production imports and test mocks to the new AI API paths.
- Do not keep old `apiService/openaiCompatible`, `apiService/anthropic`, or
  `apiService/google` re-export shims.
- Preserve existing behavior and public user-facing flows.

## Non-Goals

- Do not redesign `getApiService(site)` or the site override map.
- Do not rename or restructure every account-site adapter.
- Do not move account-site domain types such as `PricingResponse`,
  `ModelPricing`, `CreateTokenRequest`, channel payloads, check-in data, or log
  response shapes unless a narrow transport dependency requires it.
- Do not change model-list, API credential profile, Web AI API Check, CLI
  export, account, key-management, or managed-site business behavior.
- Do not add UI, settings search, telemetry, or E2E behavior changes for this
  internal refactor.

## Target Structure

```text
src/services/
  apiTransport/
    errors.ts
    request.ts
    type.ts
  aiApi/
    openaiCompatible/
    anthropic/
    google/
  apiService/
    index.ts
    common/
    aihubmix/
    anyrouter/
    axonHub/
    claudeCodeHub/
    doneHub/
    octopus/
    oneHub/
    sub2api/
    veloera/
    wong/
```

`apiTransport` is the neutral shared layer. It should contain the request
helpers and error primitives that both account-site adapters and AI API
protocol helpers need.

`aiApi` is the AI API protocol layer. It owns protocol-specific model-list
helpers for OpenAI-compatible, Anthropic, and Google APIs.

`apiService` remains the account-site compatibility layer. It owns site
adapters, account-site request shapes, token operations, balance operations,
check-in behavior, channel operations, and site model-pricing behavior.

## Dependency Direction

Allowed dependencies:

```text
services/aiApi        -> services/apiTransport
services/apiService   -> services/apiTransport
feature/UI/services   -> services/aiApi
feature/UI/services   -> services/apiService
```

Forbidden dependency:

```text
services/aiApi        -> services/apiService
```

This direction should be enforced by ESLint, not only by a one-off test.

Add a focused `no-restricted-imports` override for
`src/services/aiApi/**/*.{js,cjs,mjs,jsx,ts,tsx}`:

```js
{
  files: ["src/services/aiApi/**/*.{js,cjs,mjs,jsx,ts,tsx}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: [
              "~/services/apiService/**",
              "../apiService/**",
              "../../apiService/**",
              "../../../apiService/**",
            ],
            message:
              "AI API protocol modules must not depend on the account-site apiService layer. Use ~/services/apiTransport/** for shared transport code.",
          },
        ],
      },
    ],
  },
}
```

This follows the repository's existing ESLint guardrail pattern for entrypoint
boundaries.

## Migration Design

Move these modules:

- `src/services/apiService/openaiCompatible` to
  `src/services/aiApi/openaiCompatible`
- `src/services/apiService/anthropic` to `src/services/aiApi/anthropic`
- `src/services/apiService/google` to `src/services/aiApi/google`

Extract only the neutral pieces required by both layers:

- `ApiError` and `API_ERROR_CODES`
- `fetchApi` and `fetchApiData`
- minimal request DTOs used by transport
- upstream model-list types used by OpenAI-compatible helpers

Account-site-specific types should stay in `src/services/apiService/common`.
When needed, the account-site layer may keep existing exported names as type
aliases over the neutral transport types to reduce unrelated churn.

Update all production and test imports from old AI API paths to new paths:

- `~/services/apiService/openaiCompatible` becomes
  `~/services/aiApi/openaiCompatible`
- `~/services/apiService/anthropic` becomes `~/services/aiApi/anthropic`
- `~/services/apiService/google` becomes `~/services/aiApi/google`

Do not add compatibility re-exports at the old paths. After migration, the old
directories should be removed.

## Behavior Preservation

The protocol helpers should keep the current endpoint semantics:

- OpenAI-compatible: fetch `/v1/models`, return model IDs from response `data`.
- Anthropic: fetch `/v1/models` with `x-api-key` and
  `anthropic-version: 2023-06-01`, preserve pagination, de-duplication, error
  logging, and model-count cap behavior.
- Google: fetch `/v1beta/models` with `x-goog-api-key`, preserve pagination,
  `models/` prefix normalization, de-duplication, error logging, and
  model-count cap behavior.

Transport extraction should move code without changing request construction,
temporary-window fallback behavior, response parsing, or error classification.

## Validation Plan

Focused behavior validation:

- Run the migrated AI API model-fetcher tests.
- Run related tests for API credential profile model catalog, AI API
  verification model probes, Web AI API Check background model fetch, CLI export
  dialogs, and managed-site token-scoped model discovery when touched by import
  migration.

Boundary validation:

- Run ESLint on the affected files or `pnpm lint` when practical.
- Confirm ESLint fails for future imports from `src/services/aiApi/**` to
  `~/services/apiService/**`.

Migration completeness checks:

```powershell
rg "~/services/apiService/(openaiCompatible|anthropic|google)" src tests
rg "services/apiService model fetchers|apiService/openaiCompatible|apiService/anthropic|apiService/google" src tests
```

The first command must return no production or test import paths. The second
command is a cleanup check for stale test descriptions, mock paths, or comments.

Repository validation:

- Run `pnpm compile`.
- Stage only task-scoped files and run `pnpm run validate:staged`.
- Add `pnpm knip` only if the implementation changes export wiring, removes
  files, or otherwise affects dependency/unused-file analysis beyond ordinary
  import migration.

## E2E and Telemetry Decisions

E2E decision: no E2E coverage should be added for this phase. The risk is
module ownership, import paths, transport extraction, and protocol helper
behavior, which are covered by TypeScript, ESLint, and focused Vitest tests.

Telemetry decision: none. This is an internal architecture refactor with no
new or changed user-visible action, setting, background flow, confirmation
path, or result event.

## Risks and Mitigations

Risk: moving transport helpers could accidentally change account-site request
behavior.

Mitigation: extract the existing implementation without semantic changes and
cover affected account-site callers through existing focused tests and
type-checking.

Risk: import migration may miss test mocks or comments.

Mitigation: update production imports and `vi.mock(...)` paths together, then
use `rg` cleanup checks for old paths.

Risk: type migration could grow too broad.

Mitigation: move only neutral request and AI API model-list types. Keep
account-site domain types in `apiService/common/type.ts`.

Risk: future contributors may put AI protocol helpers back under `apiService`.

Mitigation: enforce the dependency direction with ESLint and keep the directory
names explicit.
