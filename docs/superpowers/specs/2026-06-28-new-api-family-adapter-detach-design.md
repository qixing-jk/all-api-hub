# New API Family Adapter Detach Design

Date: 2026-06-28

## Purpose

Make the existing account-site Adapter Seam real all the way down for the New
API family by removing `apiAdapters/newApi/*` dependency on the legacy
`getApiService(...)` dynamic facade.

The current architecture already exposes account-site behavior through
`getSiteAdapter(siteType)` and capability objects. The remaining friction is
that many New API-family Adapter Implementations still call back into
`getApiService(siteType)`, which keeps `src/services/apiService/index.ts` as
the effective routing center for migrated capabilities.

This spec defines the target shape and migration slices. It is a docs-only
design artifact and does not implement the refactor.

## Current Context

`src/services/apiAdapters/` now owns the intended account-site capability Seam:

- `contracts/siteAdapter.ts` declares optional capabilities such as
  `accountBootstrap`, `accountData`, `accountRefresh`, `keyManagement`,
  `modelPricing`, `redemption`, `siteNotice`, `siteAnnouncements`,
  `modelCatalog`, and `tokenProvisioning`.
- `registry.ts` resolves Adapter Family metadata from
  `accountSiteDefinitions` and returns New API-family, Sub2API, AIHubMix, or
  unsupported Adapters.
- Feature/domain Modules already consume `getSiteAdapter(siteType)` for many
  migrated account-site flows.

However, the New API-family Adapter Implementations still route through the old
flat compatibility Module:

```text
feature/domain Module
  -> getSiteAdapter(siteType)
    -> apiAdapters/newApi/keyManagement
      -> getApiService(siteType)
        -> apiService/index dynamic wrapper
          -> commonAPI or site override Module
```

Examples include:

- `src/services/apiAdapters/newApi/accountBootstrap.ts`
- `src/services/apiAdapters/newApi/accountData.ts`
- `src/services/apiAdapters/newApi/accountRefresh.ts`
- `src/services/apiAdapters/newApi/keyManagement.ts`
- `src/services/apiAdapters/newApi/modelPricing.ts`
- `src/services/apiAdapters/newApi/redemption.ts`

This is acceptable as migration glue, but it should not be the final shape.

## Problem

The current Module split creates a shallow loop:

1. The public account-site Interface says callers should use
   `SiteAdapter` capability objects.
2. New API-family capability Implementations immediately call back into
   `getApiService(...)`.
3. `getApiService(...)` dynamically enumerates `commonAPI`, applies override
   Modules, and exposes a broad flat Interface.
4. The codebase still has pressure to add new New API-family capability helpers
   to `common` and rely on the dynamic wrapper to make them available.

The result is that `apiAdapters` has the right external Interface, but
`apiService/index.ts` remains the deep implementation dependency for migrated
capabilities.

Deletion test: if `getApiService(...)` were removed from
`apiAdapters/newApi/*` today, the New API-family adapter implementation details
would have to be reconstructed capability by capability. That means the current
adapter Modules are not yet deep enough; they are wrappers over another broad
Interface.

## Goals

- Make `apiAdapters/newApi/*` depend on explicit New API-family Implementation
  Modules instead of `getApiService(...)`.
- Clarify that the old `common` Module means One API / New API-compatible
  backend implementation, not universal project-wide behavior.
- Keep `getSiteAdapter(siteType)` as the primary Seam for migrated
  account-site capabilities.
- Keep `apiService/index.ts` as a legacy compatibility facade for unmigrated
  callers.
- Preserve existing site override behavior for New API-family Account Site
  Types such as Veloera, DoneHub, OneHub, AnyRouter, WONG, and V-API where the
  current implementation intentionally varies.
- Migrate capability groups incrementally, with tests proving each group no
  longer depends on the legacy facade.
- Avoid broad behavior changes, locale changes, telemetry changes, or
  managed-site reshaping.

## Non-Goals

- Do not delete `src/services/apiService/index.ts` in this refactor.
- Do not move managed-site/channel-management flows into `apiAdapters` merely
  because some provider Implementations still use `getApiService(...)`.
- Do not migrate every function in `src/services/apiService/common/index.ts` at
  once.
- Do not rename persisted `siteType` values or public constants.
- Do not redesign Sub2API or AIHubMix Adapters in this slice unless a shared
  contract needs a compile fix.
- Do not change request payloads, auth decoration, token secret recovery,
  pricing math, redemption copy, announcement behavior, check-in behavior, or
  managed-site channel behavior.
- Do not broaden `SiteAdapter` with speculative capabilities.
- Do not add a dependency or generated artifact.

## Target Shape

The desired dependency direction:

```text
feature/domain Module
  -> getSiteAdapter(siteType)
    -> apiAdapters/newApi/keyManagement
      -> newApiFamily/keyManagement Implementation
```

Legacy callers may still use:

```text
legacy caller
  -> getApiService(siteType)
    -> compatibility facade
      -> New API-family Implementation or getSiteAdapter(siteType)
```

The long-term Module layout should be close to:

```text
src/services/apiAdapters/
  contracts/
  registry.ts
  newApi/
    index.ts
    accountBootstrap.ts
    accountData.ts
    accountRefresh.ts
    keyManagement.ts
    modelPricing.ts
    redemption.ts
    siteNotice.ts
    tokenProvisioning.ts
  sub2api/
  aihubmix/

src/services/apiService/
  newApiFamily/
    accountBootstrap.ts
    accountData.ts
    accountRefresh.ts
    keyManagement.ts
    modelPricing.ts
    redemption.ts
    siteNotice.ts
    tokenProvisioning.ts
    index.ts
  common/
    index.ts
  index.ts
```

`newApiFamily` is the explicit backend-family Implementation. It can initially
wrap or re-export existing `common` helpers while the file split is in
progress, but the important rule is that `apiAdapters/newApi/*` imports from
`newApiFamily`, not from `getApiService(...)`.

`common` may remain during the transition as the old helper location. Once
enough helpers move, it can either be renamed to `newApiFamily` or reduced to a
compatibility barrel. The rename should happen only when import churn is small
enough to review safely.

## Interface Ownership

`SiteAdapter` remains the caller-facing Interface for migrated account-site
capabilities.

`newApiFamily` should not expose one giant flat Interface. It should expose
capability-sized Implementation functions that match real backend behavior:

```ts
// src/services/apiService/newApiFamily/keyManagement.ts
export async function fetchAccountTokens(
  request: ApiServiceRequest,
  options: NewApiFamilySiteOptions & PaginationOptions = {},
): Promise<ApiToken[]>

export async function createApiToken(
  request: ApiServiceRequest,
  options: NewApiFamilySiteOptions & { tokenData: TokenCreateData },
): Promise<ApiResponse<ApiToken>>

export async function updateApiToken(
  request: ApiServiceRequest,
  options: NewApiFamilySiteOptions & {
    tokenId: number | string
    tokenData: TokenUpdateData
  },
): Promise<ApiResponse<ApiToken>>

export async function resolveApiTokenKey(
  request: ApiServiceRequest,
  options: NewApiFamilySiteOptions & { token: ApiToken },
): Promise<string>

export async function deleteApiToken(
  request: ApiServiceRequest,
  options: NewApiFamilySiteOptions & { tokenId: number | string },
): Promise<ApiResponse<unknown>>

export async function fetchUserGroups(
  request: ApiServiceRequest,
  options: NewApiFamilySiteOptions = {},
): Promise<UserGroup[]>

export async function fetchAccountAvailableModels(
  request: ApiServiceRequest,
  options: NewApiFamilySiteOptions = {},
): Promise<string[]>
```

The New API-family Adapter composes those functions into the capability
Interface:

```ts
// src/services/apiAdapters/newApi/keyManagement.ts
export function createNewApiKeyManagement(
  siteType: AccountSiteType,
): KeyManagementCapability {
  return {
    fetchTokens: (request, options) =>
      fetchAccountTokens(request, {
        siteType,
        page: options?.page,
        size: options?.size,
      }),
    createToken: (request, tokenData) =>
      createApiToken(request, { siteType, tokenData }),
    updateToken: ({ request, tokenId, tokenData }) =>
      updateApiToken(request, { siteType, tokenId, tokenData }),
    resolveTokenKey: ({ request, token }) =>
      resolveApiTokenKey(request, { siteType, token }),
    deleteToken: ({ request, tokenId }) =>
      deleteApiToken(request, { siteType, tokenId }),
    fetchAvailableModels: (request) =>
      fetchAccountAvailableModels(request, { siteType }),
    userGroups: {
      fetch: (request) => fetchUserGroups(request, { siteType }),
    },
  }
}
```

The exact function signatures should be chosen per slice to minimize churn, but
they must make the site override decision explicit. Passing `siteType` as an
options field is preferred over hidden argument inspection.

## Override Strategy

The hard part is preserving existing override behavior without keeping the
dynamic facade in the Adapter Implementation.

Use this rule:

- New API-family default behavior lives in `newApiFamily/*`.
- Site-specific deviations are represented by explicit implementation maps or
  small override functions inside `newApiFamily/*`.
- The map is capability-local, not a single project-wide dynamic wrapper.

Example shape:

```ts
type KeyManagementImplementation = {
  fetchAccountTokens: typeof fetchAccountTokens
  createApiToken: typeof createApiToken
  updateApiToken: typeof updateApiToken
  resolveApiTokenKey: typeof resolveApiTokenKey
  deleteApiToken: typeof deleteApiToken
  fetchUserGroups: typeof fetchUserGroups
  fetchAccountAvailableModels: typeof fetchAccountAvailableModels
}

const keyManagementOverrides: Partial<
  Record<AccountSiteType, Partial<KeyManagementImplementation>>
> = {
  [SITE_TYPES.VELOERA]: {
    resolveApiTokenKey: resolveVeloeraApiTokenKey,
  },
}

export function getNewApiFamilyKeyManagementImplementation(
  siteType: AccountSiteType,
): KeyManagementImplementation {
  return {
    ...defaultKeyManagementImplementation,
    ...keyManagementOverrides[siteType],
  }
}
```

This preserves Locality: key-management differences live in the key-management
Implementation Module instead of being discovered by enumerating every export
from `commonAPI`.

Do not introduce a universal replacement for `siteOverrideMap` during this
refactor. That would recreate the same shallow Interface under a new filename.

## Migration Slices

### Slice 1: Key Management

Files:

- Modify `src/services/apiAdapters/newApi/keyManagement.ts`
- Create `src/services/apiService/newApiFamily/keyManagement.ts`
- Optionally create `src/services/apiService/newApiFamily/index.ts`
- Test `tests/services/apiAdapters/newApi/keyManagement.test.ts` or extend the
  nearest existing adapter registry/capability tests
- Adjust `tests/services/apiService/index.test.ts` only for compatibility
  assertions affected by extracted imports

Why first:

- It is a high-value Account Site Type capability.
- Existing memory and implementation history show New API-family key management
  currently delegates through `getApiService(siteType)`.
- It has visible override risk: token inventory, token creation, user groups,
  token secret resolution, and available models must preserve site-specific
  behavior.

Done when:

- `apiAdapters/newApi/keyManagement.ts` has no import from
  `~/services/apiService`.
- Tests prove the Adapter calls the New API-family Implementation with the
  intended `siteType`.
- Existing `getApiService(siteType).fetchAccountTokens(...)` behavior remains
  compatible for legacy callers.

### Slice 2: Account Bootstrap, Data, And Refresh

Files:

- Modify `src/services/apiAdapters/newApi/accountBootstrap.ts`
- Modify `src/services/apiAdapters/newApi/accountData.ts`
- Modify `src/services/apiAdapters/newApi/accountRefresh.ts`
- Create or extend:
  - `src/services/apiService/newApiFamily/accountBootstrap.ts`
  - `src/services/apiService/newApiFamily/accountData.ts`
  - `src/services/apiService/newApiFamily/accountRefresh.ts`
- Update focused tests for auto-detect, site-name, account operations, or
  adapter capability behavior as needed

Why second:

- These capabilities are account onboarding/readiness paths and need careful
  preservation of request construction and check-in support behavior.
- They are smaller than key management but touch important setup flows.

Done when:

- The three New API-family Adapter files no longer call `getApiService(...)`.
- Auto-detect and account save/update flows still consume `getSiteAdapter`.
- Tests prove missing capability behavior and successful New API-family
  delegation.

### Slice 3: Model Pricing And Redemption

Files:

- Modify `src/services/apiAdapters/newApi/modelPricing.ts`
- Modify `src/services/apiAdapters/newApi/redemption.ts`
- Create or extend:
  - `src/services/apiService/newApiFamily/modelPricing.ts`
  - `src/services/apiService/newApiFamily/redemption.ts`
- Update model-list and redemption tests if the mocked seam changes

Why third:

- Product-level unsupported states are already handled through adapter
  capabilities.
- The main risk is preserving pricing response shape, cache ordering, credited
  amount handling, and localized failure behavior.

Done when:

- The Adapter files no longer import `getApiService`.
- Model List still checks capability support before fetch/cache paths.
- Redemption still returns the existing localized failure result for missing
  capability.

### Slice 4: Site Notice And Token Provisioning

Files:

- Modify `src/services/apiAdapters/newApi/siteNotice.ts`
- Modify `src/services/apiAdapters/newApi/tokenProvisioning.ts`
- Create or extend:
  - `src/services/apiService/newApiFamily/siteNotice.ts`
  - `src/services/apiService/newApiFamily/tokenProvisioning.ts`
- Update announcement and token-provisioning tests if imports move

Why fourth:

- `siteNotice` already imports `common` directly, so it is closer to the target
  shape and can move after riskier facade calls are gone.
- `tokenProvisioning` is policy-adjacent; keep the backend facts in the Adapter
  and product policy in the account lifecycle Modules.

Done when:

- New API-family Adapter files consistently import from `newApiFamily/*`.
- `common` no longer owns the primary import path for migrated Adapter
  Implementations.

### Slice 5: Compatibility Facade Reduction

Files:

- Modify `src/services/apiService/index.ts`
- Modify `src/services/apiService/common/index.ts` only when moved exports are
  already covered by `newApiFamily`
- Update `tests/services/apiService/index.test.ts`
- Run `pnpm knip` through `pnpm run validate:push`

Why last:

- The dynamic facade still protects legacy callers.
- Reducing it before Adapter Implementations move would create noisy churn and
  raise regression risk.

Done when:

- `apiService/index.ts` is documented as a legacy compatibility facade.
- It does not need new capability additions for migrated account-site behavior.
- Any stale `ApiServiceCapabilities` fields or unused exported types are
  removed only after searches prove no real consumer remains.

## Testing Strategy

Each migration slice should include focused tests at the real Interface:

- Adapter tests should mock the New API-family Implementation Module, not
  `~/services/apiService`.
- Legacy compatibility tests should remain in `tests/services/apiService` and
  prove old `getApiService(...)` calls still work.
- Feature/domain tests should keep using `getSiteAdapter(...)` or existing
  product Modules.
- Do not rewrite broad test fixtures just to remove old mocks. Keep legacy mocks
  alive until the specific flow has moved.

Useful assertions:

- New API-family Adapter calls pass the intended `siteType` into the
  implementation.
- Capability absence remains represented by `undefined` on `SiteAdapter`.
- Strict override behavior for Sub2API and AIHubMix remains unchanged in
  `apiService/index.ts`.
- Existing request payload fields remain unchanged:
  - `baseUrl`
  - `accountId`
  - `auth.authType`
  - `auth.userId`
  - `auth.accessToken`
  - `auth.cookie`
  - any feature-specific auth-session decoration

E2E decision: no Playwright E2E by default. The risk is service Module routing
and capability delegation, which is better covered by focused Vitest tests.
Add E2E only if a slice changes browser-extension runtime behavior,
cross-entrypoint messaging, storage, notifications, or real UI workflow
semantics.

## Validation Plan

For each implementation slice, run the focused tests for touched behavior.

Expected focused commands by slice:

```powershell
pnpm vitest run tests/services/apiAdapters/registry.test.ts tests/services/apiService/index.test.ts
```

Add slice-specific suites:

```powershell
pnpm vitest run tests/services/accountOperations.test.ts
pnpm vitest run tests/entrypoints/options/pages/ModelList/useModelData.test.tsx
pnpm vitest run tests/services/redeemService.test.ts
pnpm vitest run tests/services/siteAnnouncements/providers.test.ts
```

Use exact existing filenames after checking current tests; do not invent a test
path when a focused suite already covers the behavior.

Commit gate:

```powershell
pnpm run validate:staged
```

Push/PR gate for this refactor family:

```powershell
pnpm compile
pnpm run validate:push
```

`validate:push` is appropriate here because the work changes shared TypeScript
service contracts, import graph wiring, and likely `knip` export reachability.

## Commit Boundaries

Use one commit per migration slice:

1. `refactor(api-adapters): detach new api key management`
2. `refactor(api-adapters): detach new api account reads`
3. `refactor(api-adapters): detach new api pricing and redemption`
4. `refactor(api-adapters): route new api notice and provisioning`
5. `refactor(api-service): reduce legacy facade surface`

Do not mix compatibility facade reduction into earlier commits unless the
earlier slice cannot compile without a tiny compatibility shim.

## Diff Inspection Checklist

Before handoff for each slice, inspect the diff for:

- no new `getApiService(...)` import in `src/services/apiAdapters/newApi/**`
- no direct feature/domain import of backend-specific implementation files
- no broad `siteOverrideMap` clone under a new name
- no Sub2API or AIHubMix behavior change unless explicitly in the slice
- no managed-site migration
- no locale, telemetry, E2E, or UI copy drift
- no stale comments saying `common` is universal

## Follow-Up, Not In Scope For This Spec

- Rename `common` to `newApiFamily` after imports have moved far enough that
  the diff is reviewable.
- Move shared request/result types out of `apiService/common/type` only when
  the ownership is clear and the churn is justified.
- Normalize `SiteAnnouncementsCapability` away from Sub2API-specific data if a
  second account-scoped announcement backend appears.
- Decide whether AIHubMix should expose `family` metadata on its Adapter for
  consistency/debuggability.
