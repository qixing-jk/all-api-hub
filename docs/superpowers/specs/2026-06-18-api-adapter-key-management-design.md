# API Adapter Key Management Design

Date: 2026-06-18

## Purpose

Move account token inventory, default token creation, and token-secret
resolution behind the `apiAdapters` Seam so new account site types can become
usable after account detection without scattering backend-specific key behavior
across account workflows and UI entry points.

The recent adapter slices established `getSiteAdapter(siteType)` for site
announcements, runtime model catalog discovery, and account auto-detect
completion. The next highest-leverage slice is key management because a newly
adapted site is not practically usable unless the product can list API keys,
create a default key when appropriate, and resolve a displayed key into a
usable secret for copy/export/model-list flows.

## Current Context

The shipped `SiteAdapter` Interface exposes:

```ts
type SiteAdapter = {
  siteType: AccountSiteType
  family?: SiteBackendFamily
  siteNotice?: SiteNoticeCapability
  siteAnnouncements?: SiteAnnouncementsCapability
  modelCatalog?: ModelCatalogCapability
  accountCompletion?: AccountCompletionCapability
  keyManagement?: KeyManagementCapability
}
```

`src/services/apiService/index.ts` still provides the legacy compatibility
facade. It merges `common` helpers with site overrides and still exposes
`capabilities.keyManagement`, while the migrated account save/copy paths now
enter backend key operations through `getSiteAdapter(siteType).keyManagement`:

- `fetchAccountTokens(...)`
- `createApiToken(...)`
- `resolveApiTokenKey(...)`
- in some flows, `deleteApiToken(...)`, `updateApiToken(...)`, and
  `fetchUserGroups(...)`

Important current callers:

- `src/services/accounts/utils/apiServiceRequest.ts`
  - builds display-account requests
  - fetches token inventory
  - resolves masked/displayed token keys into usable secrets
- `src/services/accounts/accountPostSaveWorkflow/ensureAccountToken.ts`
  - inspects token inventory after save
  - creates a default token
  - preserves AIHubMix one-time-secret handling
  - preserves Sub2API group-selection handling
- `src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts`
  - background-safe default token provisioning
- `src/services/accounts/accountOperations.ts`
  - older `ensureAccountApiToken(...)` compatibility helper
- `src/features/AccountManagement/components/CopyKeyDialog/hooks/useCopyKeyDialog.ts`
  - loads keys
  - copies resolved secrets
  - creates a default key from the account row dialog
- `src/features/AccountManagement/components/AccountActionButtons/index.tsx`
  - smart-copy key shortcut
  - managed-site channel locate flow that needs the account token secret

Backend behavior already differs:

- New API-family sites use common token routes and optional `sk-` display/auth
  semantics.
- OneHub and DoneHub override token inventory response parsing.
- Sub2API key routes live under `/api/v1/keys`; key detail is the defensive
  secret-resolution fallback and must not fall through to One/New API
  `/api/token/{id}/key`.
- AIHubMix can expose the full key only at creation time; saved/listed/detail
  keys may be masked and not revealable later.

## Problem

The old flat `getApiService(...)` Interface keeps key-management behavior
working, but it is a shallow Interface for new site adaptation:

1. Product Modules must know which site types need special creation handling
   (`Sub2API` group selection, `AIHubMix` one-time secret behavior).
2. Token inventory and secret resolution are scattered across account
   workflows, row actions, copy dialogs, Model List, managed-site helpers, and
   repair flows.
3. New site support requires editing both the low-level backend implementation
   and multiple product callers to avoid wrong fallback behavior.
4. The existing `capabilities.keyManagement` boolean is too coarse. It cannot
   express "can list", "can create but the secret is one-time", "can resolve
   masked keys", or "create needs a selected group".

Deletion test: if direct `getApiService(...).fetchAccountTokens` and
`resolveApiTokenKey` calls were removed from account product Modules, the
complexity should not reappear as direct imports from `apiService/sub2api` or
`apiService/aihubmix`. It should sit behind a `keyManagement` capability on the
site Adapter, with product Modules handling product-level UX and result
mapping.

## Goals

- Add a `keyManagement` Adapter capability.
- Keep the first Interface narrow enough to accelerate new site support:
  - list account tokens
  - create account tokens
  - resolve token secrets
- Implement the capability for:
  - New API-family compatible sites
  - Sub2API
  - AIHubMix
- Route display-account token helpers through
  `getSiteAdapter(siteType).keyManagement`.
- Route post-save/default-token account workflows through the capability.
- Route the account-row copy-key and managed-channel locate flows through the
  existing display-account helper instead of direct `getApiService(...)` calls.
- Preserve current behavior for:
  - optional `sk-` formatting
  - masked-key handling
  - AIHubMix one-time-secret UX
  - Sub2API group-required and single-group quick-create behavior
  - token list invalid-payload errors
  - product analytics and user-facing copy
- Keep backend protocol logic in the existing `apiService/*` Modules for this
  slice. The Adapter should delegate rather than reimplement HTTP behavior.

## Non-Goals

- Do not migrate full Key Management page CRUD in the first implementation
  slice.
- Do not migrate `updateApiToken(...)`, `deleteApiToken(...)`,
  `fetchTokenById(...)`, `searchApiTokens(...)`, or group-repair deletion unless
  the implementation plan adds a clearly separated follow-up task.
- Do not migrate `fetchUserGroups(...)` in this first Interface.
- Do not move Sub2API available-groups or group-rate pricing inputs.
- Do not migrate redemption, model pricing, managed-site provider behavior, or
  site detection.
- Do not remove or rewrite the `getApiService(...)` compatibility facade.
- Do not change locale keys, telemetry schema, settings search, or Playwright
  E2E coverage.
- Do not add a new site type in this slice.

## Approaches Considered

### Approach A: Thin Adapter Wrapper Only

Add `keyManagement` with direct wrappers around `fetchAccountTokens`,
`createApiToken`, and `resolveApiTokenKey`, then migrate only
`src/services/accounts/utils/apiServiceRequest.ts`.

This is low risk, but the caller benefit is too small. Post-save token
provisioning and row actions would still know site-specific details, so new
site adaptation would still require edits in several places.

### Approach B: Product-Level Key Workflow Module Only

Create a product Module that hides token list/create/secret resolution without
adding an Adapter capability.

This improves some callers, but it keeps backend capability ownership outside
the Adapter Seam. A new site still cannot expose truthful capability support
from `getSiteAdapter(siteType)`.

### Approach C: Adapter Capability Plus Product Caller Migration

Add `keyManagement` to `SiteAdapter`, implement it by delegating to current
backend helpers, and migrate the display-account helper plus post-save/default
token workflows first.

This is the recommended path. It is larger than the previous one-function
slices, but still cohesive: one capability family, one Interface, and a small
set of high-leverage product callers. It improves Locality for backend-specific
key rules while preserving current product UX.

## Design

### 1. Add `KeyManagementCapability`

Create:

```text
src/services/apiAdapters/contracts/keyManagement.ts
```

Initial Interface:

```ts
import type {
  ApiServiceRequest,
  CreateTokenRequest,
  CreateTokenResult,
} from "~/services/apiService/common/type"
import type { ApiToken } from "~/types"

export type FetchAccountTokensOptions = {
  page?: number
  size?: number
}

export type ResolveTokenSecretRequest<TToken extends Pick<ApiToken, "id" | "key">> = {
  request: ApiServiceRequest
  token: TToken
}

export type KeyManagementCapability = {
  fetchTokens(
    request: ApiServiceRequest,
    options?: FetchAccountTokensOptions,
  ): Promise<ApiToken[]>
  createToken(
    request: ApiServiceRequest,
    tokenData: CreateTokenRequest,
  ): Promise<CreateTokenResult>
  resolveTokenKey<TToken extends Pick<ApiToken, "id" | "key">>(
    params: ResolveTokenSecretRequest<TToken>,
  ): Promise<string>
}
```

Notes:

- The Interface intentionally starts with the product paths needed for account
  save/copy/export readiness.
- Pagination stays optional because most current display-account callers use
  default inventory loading.
- `resolveTokenKey(...)` returns the raw usable secret. Existing product helpers
  still format optional `sk-` display/auth keys after resolution.
- Capability presence is the support signal. Missing `keyManagement` means the
  Adapter cannot participate in token inventory/create/copy flows.

### 2. Extend `SiteAdapter`

Add:

```ts
keyManagement?: KeyManagementCapability
```

Registry expectations:

- New API-family site Adapters expose `keyManagement`.
- Sub2API exposes `keyManagement`.
- AIHubMix exposes `keyManagement`.
- Existing capability expectations for `siteNotice`, `siteAnnouncements`,
  `modelCatalog`, and `accountCompletion` remain unchanged.

### 3. Add New API-Family Key Management Adapter

Create:

```text
src/services/apiAdapters/newApi/keyManagement.ts
```

Implementation should delegate by site type through the compatibility facade:

- `getApiService(siteType).fetchAccountTokens(...)`
- `getApiService(siteType).createApiToken(...)`
- `getApiService(siteType).resolveApiTokenKey(...)`

This is important for OneHub/DoneHub/Veloera-style variants that still rely on
current `getApiService(siteType)` override resolution. The New API-family
Adapter must not call `common` directly.

### 4. Add Sub2API Key Management Adapter

Create:

```text
src/services/apiAdapters/sub2api/keyManagement.ts
```

Implementation should delegate to the existing Sub2API helpers:

- `fetchAccountTokens(...)`
- `createApiToken(...)`
- `resolveApiTokenKey(...)`

The Adapter should preserve the Sub2API contract that secret resolution may use
key detail as a defensive fallback and must never fall through to compatible
`/api/token/{id}/key` behavior.

Do not move Sub2API group-selection UX into the Adapter in this slice.
Product-level workflows still decide when a group is required or can be
auto-selected, then call `createToken(...)` with the chosen group.

### 5. Add AIHubMix Key Management Adapter

Create:

```text
src/services/apiAdapters/aihubmix/keyManagement.ts
```

Implementation should delegate to the existing AIHubMix helpers:

- `fetchAccountTokens(...)`
- `createApiToken(...)`
- `resolveApiTokenKey(...)`

The Adapter must preserve AIHubMix one-time-secret behavior:

- `createToken(...)` may return the only full secret value.
- `fetchTokens(...)` and detail reads may return masked keys.
- `resolveTokenKey(...)` must reject masked keys with the existing
  token-secret-unavailable behavior, not fall back to compatible reveal routes.

### 6. Update Display-Account Token Helpers

Modify:

```text
src/services/accounts/utils/apiServiceRequest.ts
```

Current helper responsibilities should stay:

- build the display-account `ApiServiceRequest`
- validate token inventory payload shape
- log invalid payloads safely
- format optional `sk-` keys for compatible site types
- keep `canManageDisplayAccountTokens(...)`

Changes:

- `createDisplayAccountApiContext(...)` should include
  `adapter: getSiteAdapter(account.siteType)`.
- `fetchDisplayAccountTokens(...)` should call
  `adapter.keyManagement.fetchTokens(request)`.
- `resolveDisplayAccountTokenForSecret(...)` should call
  `adapter.keyManagement.resolveTokenKey({ request, token })`.
- Missing `keyManagement` should throw an implementation-oriented error such as
  `keyManagement is not implemented for <siteType>`.

This makes row actions, copy dialogs, Model List, and managed-site token helper
callers converge on one product helper instead of each resolving the backend
service independently.

### 7. Update Post-Save And Default Token Workflows

Modify:

```text
src/services/accounts/accountPostSaveWorkflow/ensureAccountToken.ts
src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts
src/services/accounts/accountOperations.ts
```

Use `getSiteAdapter(displaySiteData.siteType).keyManagement` for:

- inventory inspection
- default token creation
- follow-up inventory reload when create returns only `true`

Keep the product-level rules in these Modules:

- Sub2API group selection and blocked/selection-required result mapping
- AIHubMix one-time-secret blocked messages
- created-token vs follow-up-inventory selection
- existing token selection by id diff
- toast/user-facing message behavior in `ensureAccountApiToken(...)`

This is deliberately not a `tokenProvisioning` Adapter yet. The Adapter owns
backend token operations; the account workflow Modules own product UX and
workflow decisions.

### 8. Update Account Row Copy/Locate Flows

Modify:

```text
src/features/AccountManagement/components/AccountActionButtons/index.tsx
```

Replace direct `getApiService(site.siteType).fetchAccountTokens(...)` calls
with `fetchDisplayAccountTokens(site)`.

Keep:

- smart-copy branching for zero/one/many tokens
- fallback to opening the Copy Key dialog on load failure
- managed-site channel locate fallback behavior
- safe secret redaction before logging
- existing product analytics result categories

The flow should still use `resolveDisplayAccountTokenForSecret(...)` for
secret resolution.

### 9. Keep Copy Key Dialog Creation Focused

Modify:

```text
src/features/AccountManagement/components/CopyKeyDialog/hooks/useCopyKeyDialog.ts
```

Use `fetchDisplayAccountTokens(account)` for list and refresh paths.

For create:

- continue to use the Sub2API quick-create resolution helper before calling
  create
- obtain `keyManagement` through `createDisplayAccountApiContext(account)`
- call `adapter.keyManagement.createToken(request, tokenRequest)`
- preserve one-time key dialog behavior and auto-copy behavior

This keeps UI state unchanged while removing direct service calls from the
dialog.

## Error Handling

Adapter methods should delegate backend errors unchanged. Product Modules
should keep their current error mapping:

- Copy Key dialog uses localized load/create/copy failures.
- Account row smart-copy falls back to opening the dialog when token list load
  fails.
- Post-save workflow maps blocked states to existing
  `ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES`.
- `InvalidTokenPayloadError` remains owned by
  `src/services/accounts/utils/apiServiceRequest.ts`.
- AIHubMix masked-key secret resolution keeps returning the existing
  token-secret-unavailable error.

Missing `keyManagement` should be treated as an implementation error for
account sites that reach these workflows.

## Telemetry Decision

Telemetry decision: reuse existing.

This is an internal architecture migration. It does not add a new user action
or analytics field. Existing copy-key, create-key, delete-key, managed-channel
locate, and post-save events should continue to emit from their current owners.

## Settings Search Decision

Settings search decision: none.

No settings UI, route, anchor, or search definition changes.

## E2E Decision

E2E decision: no new Playwright E2E in this slice.

The risk is service-layer routing and response-shape preservation. Focused
Vitest coverage is the right first validation layer. Existing mocked account
flows and key-management E2E coverage already exercise the browser-level
surfaces.

## Testing Strategy

Add Adapter tests:

- New API-family `keyManagement` delegates to `getApiService(siteType)` and
  preserves pagination options.
- Sub2API `keyManagement` delegates to Sub2API token helpers.
- AIHubMix `keyManagement` delegates to AIHubMix token helpers.
- Registry exposes `keyManagement` for New API-family, Sub2API, and AIHubMix
  Adapters.

Update product helper tests:

- `fetchDisplayAccountTokens(...)` calls
  `getSiteAdapter(siteType).keyManagement.fetchTokens(...)`.
- invalid token inventory payload still throws `InvalidTokenPayloadError`.
- `resolveDisplayAccountTokenForSecret(...)` calls
  `keyManagement.resolveTokenKey(...)` and keeps optional `sk-` formatting.
- missing `keyManagement` fails clearly.

Update workflow tests:

- `ensureAccountTokenForPostSaveWorkflow(...)` uses Adapter key operations
  while preserving AIHubMix one-time-secret and Sub2API group-selection rules.
- `ensureDefaultApiTokenForAccount(...)` uses Adapter key operations and keeps
  existing unsupported-site messages.
- `ensureAccountApiToken(...)` uses Adapter key operations and keeps current
  Sub2API group and AIHubMix blocked behavior.

Update UI/hook tests where existing tests mock `getApiService(...)` for token
list/create:

- Copy Key dialog hook/component tests mock the display-account helper or
  Adapter-backed context.
- Account row action tests assert smart-copy behavior, not direct service
  implementation details.

## Validation Plan

Focused validation:

```powershell
pnpm vitest run tests/services/apiAdapters/registry.test.ts tests/services/accounts/apiServiceRequest.test.ts tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts tests/services/accountOperations.ensureAccountApiToken.test.ts
```

Additional focused validation if the implementation touches the dialog and row
actions:

```powershell
pnpm vitest run tests/features/AccountManagement/components/CopyKeyDialog.test.tsx tests/features/AccountManagement/components/CopyKeyDialog.sub2api.test.tsx
```

Related validation:

```powershell
pnpm vitest related --run src/services/apiAdapters/contracts/keyManagement.ts src/services/accounts/utils/apiServiceRequest.ts src/services/accounts/accountPostSaveWorkflow/ensureAccountToken.ts src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts src/features/AccountManagement/components/AccountActionButtons/index.tsx
```

Type validation:

```powershell
pnpm compile
```

Commit gate:

```powershell
pnpm run validate:staged
```

Pre-push / PR gate:

```powershell
pnpm run validate:push
```

Run `validate:push` before publishing because the slice changes shared
TypeScript contracts, account workflow routing, and UI token-flow imports.

## Rollout

1. Add the `keyManagement` contract and Adapter delegation tests.
2. Extend `SiteAdapter`, New API-family, Sub2API, AIHubMix, and registry tests.
3. Migrate `src/services/accounts/utils/apiServiceRequest.ts`.
4. Migrate post-save/default-token product workflows.
5. Migrate Copy Key dialog list/create paths and account row direct inventory
   calls.
6. Run focused tests after each task group.
7. Run related tests, `pnpm compile`, and `validate:staged`.
8. Inspect the diff for scope drift.
9. Run `validate:push` before pushing or opening a PR.

## Follow-Up, Not In Scope For This Spec

Later slices may migrate:

- full Key Management page create/update/delete flows
- key repair deletion and group coverage
- `fetchUserGroups(...)` / site group capability
- Sub2API price-estimation inputs
- redemption capability
- a richer support descriptor when product UI needs to distinguish list,
  create, update, delete, and secret-resolution support separately

Do not grow `SiteAdapter` into a second flat `apiService` Interface. Add each
capability only when it hides backend-specific behavior behind a smaller
Interface and gives real caller Leverage.
