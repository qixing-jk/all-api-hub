# API Adapter Key Management Lifecycle Design

Date: 2026-06-19

## Purpose

Deepen the existing `keyManagement` Adapter Interface so a newly added account
site type can define its token lifecycle, group metadata, and token creation
model metadata in its Adapter Module instead of requiring product Modules to
call the legacy `getApiService(...)` facade.

Recent adapter slices moved site announcements, runtime model catalog loading,
account completion, key management list/create/reveal, account refresh,
Sub2API stored-auth recovery, model pricing, and account data behind
`getSiteAdapter(siteType)`. Those slices make a new account site type
detectable, saveable, refreshable, price-aware, and able to create or reveal
basic API keys. The remaining high-friction account usability path is key
management after the first key exists: deleting keys, loading group choices,
loading token model choices, repairing group coverage, and loading token
inventory from secondary dialogs still reaches through the legacy facade.

## Current Context

The current `SiteAdapter` Interface exposes:

```ts
type SiteAdapter = {
  siteType: AccountSiteType
  family?: SiteBackendFamily
  siteNotice?: SiteNoticeCapability
  siteAnnouncements?: SiteAnnouncementsCapability
  modelCatalog?: ModelCatalogCapability
  modelPricing?: ModelPricingCapability
  accountData?: AccountDataCapability
  accountCompletion?: AccountCompletionCapability
  keyManagement?: KeyManagementCapability
  accountRefresh?: AccountRefreshCapability
}
```

The current `KeyManagementCapability` Interface exposes only:

```ts
type KeyManagementCapability = {
  fetchTokens(request, options?): Promise<ApiToken[]>
  createToken(request, tokenData): Promise<CreateTokenResult>
  resolveTokenKey({ request, token }): Promise<string>
}
```

That already covers the first migration slice for token inventory, token
creation, and token secret resolution. The remaining legacy key-management
paths are still spread across product Modules:

- `src/features/KeyManagement/hooks/useKeyManagement.ts`
  - loads token inventories through `service.fetchAccountTokens(...)`
  - deletes tokens through `service.deleteApiToken(...)`
- `src/features/KeyManagement/components/AddTokenDialog/hooks/useTokenData.ts`
  - loads token model choices through `service.fetchAccountAvailableModels(...)`
  - loads group choices through `service.fetchUserGroups(...)`
- `src/services/accounts/accountOperations.ts`
  - `resolveSub2ApiQuickCreateResolution(...)` loads Sub2API groups through
    `service.fetchUserGroups(...)`
- `src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts`
  - loads tokens, groups, creates group keys, and deletes invalid tokens through
    `getApiService(siteType)`
- secondary token inventory surfaces still call `getApiService(...)` or the
  transitional `service` from `createDisplayAccountApiContext(...)`:
  - `src/components/KiloCodeExportDialog.tsx`
  - `src/components/dialogs/VerifyApiDialog/index.tsx`
  - `src/components/dialogs/VerifyCliSupportDialog/index.tsx`
  - `src/components/dialogs/ChannelDialog/hooks/useChannelDialog.ts`

The backend implementations already vary:

- New API-family compatible sites expose token list/create/reveal/delete,
  available models, and user groups through the compatible implementation plus
  site-specific overrides.
- Sub2API supports token list/create/reveal/delete, user groups, and available
  models, but default creation requires a current group and may require user
  selection when multiple groups are available.
- AIHubMix supports token list/create/reveal/delete and available models, but
  group lookup is unsupported and created API keys must be treated as one-time
  secrets when the full key is returned.

## Problem

`keyManagement` is currently a real Seam, but the Interface is still too
shallow for the product workflows that users actually exercise.

Current friction:

1. New non-compatible account site types can implement token list/create/reveal
   in `apiAdapters`, but still need legacy `apiService` wiring before users can
   delete keys, load group choices, or load model choices in token dialogs.
2. Product Modules still need to know which legacy facade method corresponds to
   each token-adjacent behavior.
3. Group-aware provisioning and invalid-token repair still mock and call the
   wide `apiService` facade even though the behavior only needs a narrow
   key-management Interface.
4. Secondary token inventory surfaces may skip the Sub2API session-decorated
   request returned by `createDisplayAccountApiContext(...)`, which increases
   the chance that a new site type or auth recovery path works in Key
   Management but fails elsewhere.
5. Tests for token lifecycle behavior are split between adapter mocks and
   legacy service mocks, so they do not make the Adapter Interface the common
   test surface.

Deletion test: if direct product calls to
`fetchAccountTokens(...)`, `createApiToken(...)`, `deleteApiToken(...)`,
`fetchUserGroups(...)`, and `fetchAccountAvailableModels(...)` are deleted
outside `apiAdapters` and backend implementations, the complexity should not
reappear as raw `siteType` branches in product Modules. Backend token
lifecycle facts should sit behind `SiteAdapter.keyManagement`.

## Goals

- Deepen the existing `KeyManagementCapability` Interface instead of adding a
  parallel key metadata capability.
- Route account-token lifecycle calls through
  `getSiteAdapter(siteType).keyManagement`:
  - list tokens
  - create tokens
  - reveal or resolve token secrets
  - delete tokens
  - load user groups for token creation and group coverage
  - load available model ids for token model-limit controls
- Preserve existing request shapes and the split between display-account reads
  and stored-account create requests.
- Preserve existing product behavior:
  - Key Management inventory loading, all-account partial failures, retry, and
    analytics
  - token deletion optimistic local removal, reload behavior, toasts, and
    analytics
  - Add Token model/group bootstrap behavior and unsupported-group fallback
  - Sub2API quick-create resolution
  - group coverage repair results and invalid-token deletion records
  - AIHubMix one-time secret handling
  - Sub2API auth-session decoration from `createDisplayAccountApiContext(...)`
- Provide Adapter implementations for:
  - New API-family compatible account sites
  - Sub2API
  - AIHubMix
- Keep the legacy `getApiService(...)` facade available for non-migrated
  capabilities.
- Add focused Adapter, account-helper, hook, and dialog regression tests.

## Non-Goals

- Do not add a new site type in this slice.
- Do not migrate redemption or `redeemCode(...)`.
- Do not migrate managed-site channel CRUD, managed-site channel status checks,
  managed-site model sync, or managed-site provider registration.
- Do not migrate account completion internals such as `fetchSiteStatus(...)`,
  `fetchSupportCheckIn(...)`, or `getOrCreateAccessToken(...)`.
- Do not move model pricing assembly, Sub2API estimated pricing, or
  `PricingResponse` construction.
- Do not introduce a generic provisioning policy engine in this slice.
  Sub2API group-selection and AIHubMix one-time-secret product semantics stay
  in account/key workflow Modules while their backend operations move through
  the Adapter Interface.
- Do not remove `getApiService(...)` or `ApiServiceCapabilities` globally.
- Do not add an import guard in this slice.
- Do not change user-facing copy, locale keys, telemetry schema, settings
  search entries, or Playwright E2E tests.

## Approaches Considered

### Approach A: Keep The Remaining Calls On `apiService`

This keeps the current behavior and avoids widening `KeyManagementCapability`.

It leaves new site type support split across two Seams: basic token operations
sit in `apiAdapters`, while delete, groups, and model metadata still require
legacy facade wiring. That keeps the Interface shallow and makes the next site
adapter harder to reason about.

### Approach B: Add Separate `keyMetadata` And `keyDeletion` Capabilities

This would avoid adding more methods to `keyManagement`, but it fragments one
product concept across several small Interfaces. Product Modules would need to
ask for multiple related capabilities before rendering one token workflow.

That fails the Depth test: the caller learns more Interface surface without
getting more Leverage.

### Approach C: Deepen `KeyManagementCapability`

Add delete, group, and available-model operations to the existing
`keyManagement` Interface, then migrate all direct token lifecycle callers to
that Interface.

This is the recommended path. It keeps one truthful Adapter Seam for account
token management. The Interface grows, but the caller gets more Leverage:
token list/create/reveal/delete and creation metadata are all available from
one Module.

### Approach D: Move All Default-Token Provisioning Policy Into Adapters

Adapters could return a high-level "create default token plan" that hides
Sub2API group-selection and AIHubMix one-time-secret policy.

That is too much for this slice. Those rules are product semantics tied to
which workflow is running: background auto-provision, post-save automation, and
interactive creation do not have identical UX constraints. This slice should
move backend operations first; a later slice can decide whether a deeper
provisioning policy Interface is worth introducing.

## Design

### 1. Extend `KeyManagementCapability`

Modify:

```text
src/services/apiAdapters/contracts/keyManagement.ts
```

Proposed Interface:

```ts
import type {
  ApiServiceRequest,
  CreateTokenRequest,
  CreateTokenResult,
  UserGroupInfo,
} from "~/services/apiService/common/type"
import type { ApiToken } from "~/types"

export type FetchAccountTokensOptions = {
  page?: number
  size?: number
}

export type ResolveTokenSecretRequest<
  TToken extends Pick<ApiToken, "id" | "key"> = Pick<ApiToken, "id" | "key">,
> = {
  request: ApiServiceRequest
  token: TToken
}

export type DeleteTokenRequest = {
  request: ApiServiceRequest
  tokenId: number
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
    request: ResolveTokenSecretRequest<TToken>,
  ): Promise<string>
  deleteToken(request: DeleteTokenRequest): Promise<boolean | void>
  fetchUserGroups(
    request: ApiServiceRequest,
  ): Promise<Record<string, UserGroupInfo>>
  fetchAvailableModels(request: ApiServiceRequest): Promise<string[]>
}
```

The Interface intentionally reuses existing request and response types. This
slice changes the Seam, not the backend protocol models.

`fetchUserGroups(...)` should preserve the existing error mode: when the
upstream does not support group lookup, the Adapter may throw the existing
`FEATURE_UNSUPPORTED` `ApiError`. Product callers that already treat that as an
empty group set should continue to do so.

`fetchAvailableModels(...)` should return the same normalized model id list as
the existing backend helper. If a backend has no model-limit endpoint but token
creation can continue without model limits, its Adapter should return an empty
array rather than forcing UI failure.

### 2. Extend New API-Family Key Management

Modify:

```text
src/services/apiAdapters/newApi/keyManagement.ts
```

The Adapter should continue binding to the site-scoped legacy facade so
OneHub, DoneHub, Veloera, AnyRouter, WONG, V-API, VoAPI, Super-API, Rix-API,
Neo-API, and unknown-compatible behavior is preserved:

```ts
export function createNewApiKeyManagement(
  siteType: AccountSiteType,
): KeyManagementCapability {
  return {
    fetchTokens: (request, options) =>
      getApiService(siteType).fetchAccountTokens(
        request,
        options?.page,
        options?.size,
      ),
    createToken: (request, tokenData) =>
      getApiService(siteType).createApiToken(request, tokenData),
    resolveTokenKey: ({ request, token }) =>
      getApiService(siteType).resolveApiTokenKey(request, token),
    deleteToken: ({ request, tokenId }) =>
      getApiService(siteType).deleteApiToken(request, tokenId),
    fetchUserGroups: (request) =>
      getApiService(siteType).fetchUserGroups(request),
    fetchAvailableModels: (request) =>
      getApiService(siteType).fetchAccountAvailableModels(request),
  }
}
```

### 3. Extend Sub2API Key Management

Modify:

```text
src/services/apiAdapters/sub2api/keyManagement.ts
```

The Adapter should delegate to existing Sub2API helpers:

```ts
import {
  createApiToken,
  deleteApiToken,
  fetchAccountAvailableModels,
  fetchAccountTokens,
  fetchUserGroups,
  resolveApiTokenKey,
} from "~/services/apiService/sub2api"
```

Sub2API behavior must remain unchanged:

- request-level auth-session decoration still comes from
  `createDisplayAccountApiContext(...)`
- group lookup drives quick-create decisions
- token creation still requires a group when product code supplies one
- token secret resolution still uses the existing Sub2API helper
- token deletion still uses the existing backend deletion helper

### 4. Extend AIHubMix Key Management

Modify:

```text
src/services/apiAdapters/aihubmix/keyManagement.ts
```

The Adapter should delegate to existing AIHubMix helpers:

```ts
import {
  createApiToken,
  deleteApiToken,
  fetchAccountAvailableModels,
  fetchAccountTokens,
  fetchUserGroups,
  resolveApiTokenKey,
} from "~/services/apiService/aihubmix"
```

AIHubMix behavior must remain unchanged:

- API origin normalization stays in the AIHubMix implementation.
- Token-authenticated requests continue sending raw
  `Authorization: <access_token>` without a `Bearer` prefix.
- Created keys are still treated as one-time secrets by product workflows.
- Group lookup can still report unsupported through the existing backend error
  path.
- `resolveTokenKey(...)` must not fall back to common `/api/token/{id}/key`
  behavior.

### 5. Route Key Management Page Inventory And Delete

Modify:

```text
src/features/KeyManagement/hooks/useKeyManagement.ts
```

Inventory loading should use:

```ts
const { keyManagement, request } = createDisplayAccountApiContext(account)
const tokens = await requireDisplayAccountKeyManagement(
  account,
  keyManagement,
).fetchTokens(request)
```

Token deletion should use:

```ts
const { keyManagement, request } = createDisplayAccountApiContext(account)
await requireDisplayAccountKeyManagement(account, keyManagement).deleteToken({
  request,
  tokenId: token.id,
})
```

Preserve all existing Key Management behavior:

- all-account mode continues to isolate per-account failures
- retry failed accounts continues to load only failed accounts
- stale request guards still protect selection changes
- delete still removes the token from local inventory immediately after
  upstream success
- managed-site token status invalidation remains unchanged
- existing analytics event ids, result categories, and privacy properties stay
  unchanged

### 6. Route Add Token Bootstrap Data

Modify:

```text
src/features/KeyManagement/components/AddTokenDialog/hooks/useTokenData.ts
```

Load model ids and groups from `keyManagement`:

```ts
const { keyManagement, request } = createDisplayAccountApiContext(currentAccount)
const capability = requireDisplayAccountKeyManagement(
  currentAccount,
  keyManagement,
)

const [models, groupsData] = await Promise.all([
  capability.fetchAvailableModels(request),
  capability.fetchUserGroups(request).catch((error) => {
    if (isFeatureUnsupportedError(error)) return EMPTY_USER_GROUPS
    throw error
  }),
])
```

Preserve the existing group defaulting behavior:

- keep an already eligible group selection
- keep a blank group when restricted groups require a manual choice
- fall back to `default` when allowed and available
- fall back to the first allowed available group when `default` is unavailable
- fall back to the first fetched group when unrestricted groups have no
  `default`
- treat unsupported group lookup as no group selection without showing an
  error

### 7. Route Sub2API Quick-Create Resolution

Modify:

```text
src/services/accounts/accountOperations.ts
```

`resolveSub2ApiQuickCreateResolution(...)` should keep its product semantics
but load groups through the Adapter:

```ts
const { keyManagement, request } = createDisplayAccountApiContext(account)
const groups = await requireDisplayAccountKeyManagement(
  account,
  keyManagement,
).fetchUserGroups(request)
```

Preserve the current resolution contract:

- non-Sub2API accounts throw `sub2api_quick_create_not_applicable`
- zero groups returns `blocked`
- one unique normalized group returns `ready`
- multiple groups returns `selection_required`

### 8. Route Group Coverage And Invalid-Token Repair

Modify:

```text
src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts
```

Replace direct `getApiService(displaySiteData.siteType)` usage with
`getSiteAdapter(displaySiteData.siteType).keyManagement`.

Preserve the two request shapes:

- inventory and group reads use display-account fields when available
- token creation and deletion use the same account request shape currently
  produced by `createAccountApiRequest(...)`

Preserve group coverage behavior:

- unsupported group lookup falls back to legacy one-key coverage
- empty group responses with an existing token are considered covered
- empty group responses without tokens create one default token unless the site
  type is Sub2API or AIHubMix
- unavailable-group tokens are reported as invalid repair targets
- failed group creation records the group as missing and continues with later
  groups
- invalid-token deletion returns the same typed deletion record

### 9. Route Secondary Token Inventory Surfaces

Migrate token inventory loads from `getApiService(...)` or transitional
`service.fetchAccountTokens(...)` to `keyManagement.fetchTokens(...)` in:

- `src/components/KiloCodeExportDialog.tsx`
- `src/components/dialogs/VerifyApiDialog/index.tsx`
- `src/components/dialogs/VerifyCliSupportDialog/index.tsx`
- `src/components/dialogs/ChannelDialog/hooks/useChannelDialog.ts`

Each display-account caller should use `createDisplayAccountApiContext(...)`
so Sub2API continues to receive the session-decorated request.

Preserve each surface's product behavior:

- Kilo Code export keeps token selection, token creation, model probing, export
  payload generation, and secret redaction unchanged.
- API verification keeps compatible-token filtering and probe execution
  unchanged.
- CLI support verification keeps profile-source behavior unchanged; only
  account-source token loading moves.
- Channel dialog keeps existing managed-site channel flow and token selection
  behavior unchanged.

## Error Handling

Adapter methods should delegate backend errors unchanged.

Product Modules should preserve current error handling:

- Missing `keyManagement` capability should use the existing
  `createMissingKeyManagementCapabilityError(...)` path.
- Unsupported group lookup remains non-fatal only in existing callers that
  already treat `FEATURE_UNSUPPORTED` as an empty group set.
- Add Token model metadata failures still show the existing localized load
  failure toast.
- Key Management inventory failures still populate per-account error state.
- Delete failures still show the backend/local error message and complete the
  existing analytics action as failure.
- Group coverage continues to distinguish unsupported groups from real group
  fetch failures.
- AIHubMix token secret unavailability and one-time-secret handling remain in
  account workflow Modules.

Do not add user-facing copy for missing `keyManagement` sub-operations in this
slice.

## Telemetry Decision

Telemetry decision: reuse existing.

This is an internal architecture migration. It does not add a new user action,
setting, result category, or analytics field. Existing Key Management,
verification, Kilo export, and account provisioning telemetry should continue
to emit from their current owners with the same payload shape and privacy
constraints.

## Settings Search Decision

Settings search decision: none.

No settings UI, route, anchor, or search definition changes.

## E2E Decision

E2E decision: no new Playwright E2E in this slice.

The risk is service-layer routing and request preservation for token lifecycle
operations. Focused Vitest coverage at Adapter, account-helper, hook, and dialog
levels directly covers that risk. Browser runtime behavior is unchanged.

Existing browser-level Sub2API/DNR coverage remains the right guard for
extension permission and runtime bundle regressions. Run those broader checks
only if implementation evidence shows an import-scope change involving
`src/services/apiService/sub2api/**` and account-storage modules.

## Testing Strategy

Update Adapter tests:

- `tests/services/apiAdapters/keyManagement.test.ts`
  - New API-family delegates token delete, user groups, and available models
    through the site-specific `getApiService(siteType)`.
  - Sub2API delegates token delete, user groups, and available models to
    Sub2API helpers.
  - AIHubMix delegates token delete, user groups, and available models to
    AIHubMix helpers.

Update registry tests:

- New API-family, Sub2API, and AIHubMix `keyManagement` objects expose:
  - `fetchTokens`
  - `createToken`
  - `resolveTokenKey`
  - `deleteToken`
  - `fetchUserGroups`
  - `fetchAvailableModels`

Update account helper tests:

- `tests/services/accountKeyGroupCoverage.test.ts`
  - group coverage uses `getSiteAdapter(...).keyManagement`
  - unsupported groups still fall back to one-key coverage
  - invalid-token deletion uses `keyManagement.deleteToken(...)`
- `tests/services/accountOperations.ensureAccountApiToken.test.ts`
  - Sub2API quick-create resolution uses `keyManagement.fetchUserGroups(...)`
  - existing Sub2API and AIHubMix creation guards remain unchanged
- `tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts`
  - Sub2API group resolution continues to return ready, blocked, or
    selection-required results
  - AIHubMix one-time-secret behavior remains unchanged

Update UI hook/dialog tests:

- `tests/entrypoints/options/pages/KeyManagement/useKeyManagement.test.tsx`
  - inventory loading uses `keyManagement.fetchTokens(...)`
  - deletion uses `keyManagement.deleteToken(...)`
  - all-account partial failure, retry, delete analytics, and optimistic local
    removal remain unchanged
- `tests/entrypoints/options/pages/KeyManagement/useTokenData.test.tsx`
  - model and group bootstrap data use `keyManagement`
  - unsupported group lookup remains non-fatal
- `tests/entrypoints/options/pages/KeyManagement/AddTokenDialog.prefill.test.tsx`
  - prefill flows still receive model and group data
- `tests/components/KiloCodeExportDialog.test.tsx`
  - token inventory loading uses `keyManagement.fetchTokens(...)`
- `tests/components/VerifyApiDialog.test.tsx`
  - account-source token loading uses `keyManagement.fetchTokens(...)`
- `tests/components/VerifyCliSupportDialog.test.tsx`
  - account-source token loading uses `keyManagement.fetchTokens(...)`
- Existing Channel dialog tests should be updated if their mocks assert
  `service.fetchAccountTokens(...)`.

Focused validation:

```powershell
pnpm vitest run tests/services/apiAdapters/keyManagement.test.ts tests/services/apiAdapters/registry.test.ts tests/services/accountKeyGroupCoverage.test.ts tests/services/accountOperations.ensureAccountApiToken.test.ts tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts tests/entrypoints/options/pages/KeyManagement/useTokenData.test.tsx tests/entrypoints/options/pages/KeyManagement/useKeyManagement.test.tsx tests/entrypoints/options/pages/KeyManagement/AddTokenDialog.prefill.test.tsx tests/components/KiloCodeExportDialog.test.tsx tests/components/VerifyApiDialog.test.tsx tests/components/VerifyCliSupportDialog.test.tsx
```

Type validation:

```powershell
pnpm compile
```

Commit gate:

```powershell
pnpm run validate:staged
```

Push gate before publishing:

```powershell
pnpm run validate:push
```

Run `validate:push` before opening or updating a PR because this slice changes
shared Adapter contracts and multiple token-workflow callers.

## Rollout

1. Extend `KeyManagementCapability` and Adapter delegation tests.
2. Implement New API-family, Sub2API, and AIHubMix Adapter methods.
3. Update registry expectations.
4. Migrate Key Management page inventory loading and deletion.
5. Migrate Add Token bootstrap data.
6. Migrate Sub2API quick-create resolution.
7. Migrate group coverage and invalid-token repair.
8. Migrate secondary token inventory surfaces.
9. Run focused tests after each caller group.
10. Run `pnpm compile` and `pnpm run validate:staged`.
11. Inspect the final diff for scope drift.
12. Run `pnpm run validate:push` before pushing or opening a PR.

## Follow-Up, Not In Scope For This Spec

Later slices may migrate:

- redemption through a `redemption` capability
- account-completion internals that still call `fetchSiteStatus(...)`,
  `fetchSupportCheckIn(...)`, and `getOrCreateAccessToken(...)`
- a deeper product-level default-token provisioning policy Interface, if the
  next non-compatible site type proves that Sub2API and AIHubMix are not the
  only special cases
- model pricing assembly and Sub2API estimated-pricing ownership
- managed-site channel operations and model sync
- site detection and route/status probing
- an import guard that prevents new product Modules from importing the legacy
  `apiService` facade outside approved adapter/compatibility layers

Do not turn `SiteAdapter` into a second flat `apiService` facade. This slice is
valid because it makes an already-real Module deeper: one key-management
Interface now hides the backend token lifecycle operations that otherwise leak
across multiple product callers.
