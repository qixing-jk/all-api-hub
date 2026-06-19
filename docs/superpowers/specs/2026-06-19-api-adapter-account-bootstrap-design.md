# API Adapter Account Bootstrap Design

Date: 2026-06-19

## Purpose

Move account-site bootstrap behavior behind the `apiAdapters` Seam so a newly
added account site type can become detectable, nameable, route-aware, and
account-completion-ready from its Adapter Module.

Recent adapter slices moved site announcements, runtime model catalog loading,
account completion, key management, saved-account refresh, Sub2API stored-auth
recovery, model pricing, manual account data loading, and key-management
lifecycle behavior behind `getSiteAdapter(siteType)`. Those slices make an
account usable after the site type and first account data are known. The
remaining high-friction onboarding path is earlier: the product still needs
legacy facade calls and raw site-type branches to discover the current user,
probe site status, derive display names, and resolve account-site web routes.

This spec defines an `accountBootstrap` Adapter capability for those early
account-site facts.

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

The current account bootstrap behavior is split across several product Modules:

- `src/services/siteDetection/autoDetectService.ts`
  - `getUserDataViaAPI(...)` calls
    `getApiService(siteType).fetchUserInfo(...)`.
  - Background and current-tab detection use content-script/runtime data first,
    then fall back to the same legacy facade call.
- `src/services/accounts/siteName.ts`
  - `getSiteName(...)` calls
    `getApiService(siteTypeHint).fetchSiteStatus(...)` when a site-type hint is
    available.
- `src/services/accounts/utils/siteRouteResolver.ts`
  - New API default-theme routing probes
    `getApiService(SITE_TYPES.NEW_API).fetchSiteStatus(...)`.
  - AIHubMix login routing is hard-coded in the resolver.
  - New API theme route overrides are hard-coded in the resolver.
- `src/services/apiAdapters/*/accountCompletion.ts`
  - Adapter-facing account completion still calls legacy facade methods inside
    Adapter implementations:
    - `fetchUserInfo(...)`
    - `getOrCreateAccessToken(...)`
    - `fetchSiteStatus(...)`
    - `fetchSupportCheckIn(...)`
    - `extractDefaultExchangeRate(...)`

The backend implementations already vary:

- New API-family compatible sites use `/api/user/self`, `/api/status`, token
  creation/list fallback, status-driven check-in support, and default-theme
  route probing through the compatible implementation plus site-specific
  overrides.
- Sub2API reads identity and access-token state from its JWT/browser-session
  model and uses dedicated status and auth-session recovery logic.
- AIHubMix uses `https://aihubmix.com` as the API origin, may start from
  `console.aihubmix.com`, sends raw `Authorization: <access_token>`, and uses a
  different web origin for login.

## Problem

The current adapter migration makes later account workflows deep, but the first
steps for adding a new account site type are still shallow and scattered.

Current friction:

1. A new non-compatible account site type still needs legacy `apiService`
   methods before automatic detection can fetch the current user through the
   API fallback.
2. Site display-name resolution and account route resolution still know
   backend-specific status and route facts outside the Adapter Module.
3. `accountCompletion` is an Adapter-facing Interface, but its implementations
   still call the wide legacy facade for bootstrap facts. That means a new
   Adapter still needs to add methods to the facade before account completion
   can be implemented.
4. Tests for early account onboarding mock `getApiService(...)`, even though
   the product behavior only needs narrow bootstrap facts.
5. Raw `SITE_TYPES.NEW_API` and `SITE_TYPES.AIHUBMIX` route/status branches in
   product Modules make the next route-sensitive site type likely to add a
   third copy of the same kind of branching.

Deletion test: if direct product calls to `fetchUserInfo(...)`,
`fetchSiteStatus(...)`, `getOrCreateAccessToken(...)`,
`fetchSupportCheckIn(...)`, and `extractDefaultExchangeRate(...)` are deleted
outside `apiAdapters` and backend implementations, the complexity should not
reappear as raw `siteType` branches in product Modules. Account-site bootstrap
facts should sit behind `SiteAdapter.accountBootstrap`.

## Goals

- Add a narrow `accountBootstrap` Adapter capability.
- Route API-fallback user discovery in `autoDetectService` through
  `getSiteAdapter(siteType).accountBootstrap`.
- Route account-site display-name status probing through the Adapter.
- Route account-site web route resolution through the Adapter for route kinds
  currently handled by `siteRouteResolver`.
- Deepen `accountCompletion` implementations so they use the bootstrap
  capability instead of calling the legacy `getApiService(...)` facade.
- Preserve existing behavior:
  - current-tab content-script detection remains the first choice when the
    target origin matches
  - background temp-context detection remains the second choice when available
  - API fallback uses cookie auth with the same fetch context
  - current-tab reload hints and analytics-safe context fields remain unchanged
  - AIHubMix API-origin normalization and console login routing remain
    unchanged
  - New API default-theme route probing remains cached and bounded
  - `getSiteName(...)` still prefers non-default tab titles and falls back to a
    domain-derived name
  - account completion keeps current auth, check-in, exchange-rate, username,
    and access-token validation semantics
- Provide Adapter implementations for:
  - New API-family compatible account sites
  - Sub2API
  - AIHubMix
- Keep the legacy `getApiService(...)` facade available for non-migrated
  capabilities and backend delegation.
- Add focused Adapter, auto-detect, route, site-name, and account-completion
  regression tests.

## Non-Goals

- Do not add a new site type in this slice.
- Do not migrate domain/title site-type detection rules from
  `src/constants/siteType.ts` or `src/services/siteDetection/detectSiteType.ts`.
- Do not move browser current-tab content-script localStorage reads behind the
  Adapter. Those are browser messaging concerns, not backend protocol calls.
- Do not migrate default token provisioning policy, Sub2API group-selection
  policy, or AIHubMix one-time-secret workflow.
- Do not migrate redemption, managed-site channel operations, managed-site
  model sync, or managed-site provider registration.
- Do not remove `getApiService(...)` or `ApiServiceCapabilities` globally.
- Do not add an import guard in this slice.
- Do not change user-facing copy, locale keys, telemetry schema, settings
  search entries, or Playwright E2E tests.

## Approaches Considered

### Approach A: Add Only `accountDiscovery`

Add an Adapter capability only for `fetchUserInfo(...)` and migrate
`autoDetectService`.

This is too shallow. It removes one legacy facade call, but leaves site status,
route probing, display-name probing, exchange-rate extraction, and completion
token bootstrap split across product Modules and account-completion Adapters.
The next site type would still require several non-adapter edits before the
first account is usable.

### Approach B: Add Separate `siteStatus`, `siteRoutes`, And `tokenBootstrap`

Split each operation into its own capability.

This keeps each Interface tiny, but it fragments one account-onboarding concept
across multiple optional slots. Callers would need to learn several capability
names to complete one account bootstrap workflow, and tests would still mock a
collection of shallow Interfaces.

### Approach C: Add One `accountBootstrap` Capability

Add one Adapter capability for early account-site facts: user discovery, access
token bootstrap, site status, exchange-rate extraction, check-in support, and
web route resolution.

This is the recommended path. It creates one truthful Adapter Seam for the
early account onboarding flow. The Interface is broader than a single method,
but it gives caller Leverage: auto-detect, site-name resolution, route
resolution, and account completion can all depend on one deep Module.

## Design

### 1. Add `AccountBootstrapCapability`

Create:

```text
src/services/apiAdapters/contracts/accountBootstrap.ts
```

Proposed Interface:

```ts
import type { AccountSiteType } from "~/constants/siteType"
import type {
  AccessTokenInfo,
  ApiServiceRequest,
  SiteStatusInfo,
  UserInfo,
} from "~/services/apiService/common/type"

export type AccountBootstrapRouteKind =
  | "login"
  | "usage"
  | "checkIn"
  | "adminCredentials"
  | "redeem"
  | "siteAnnouncements"

export type AccountBootstrapRouteTarget = {
  baseUrl: string
  siteType: AccountSiteType
}

export type AccountBootstrapCapability = {
  fetchUserInfo(request: ApiServiceRequest): Promise<UserInfo>
  getOrCreateAccessToken(
    request: ApiServiceRequest,
  ): Promise<AccessTokenInfo>
  fetchSiteStatus(request: ApiServiceRequest): Promise<SiteStatusInfo | null>
  fetchCheckInSupport(
    request: ApiServiceRequest,
  ): Promise<boolean | undefined>
  extractDefaultExchangeRate(siteStatus: SiteStatusInfo | null): number | null
  resolveRoutePath(
    target: AccountBootstrapRouteTarget,
    route: AccountBootstrapRouteKind,
  ): Promise<string>
}
```

The Interface intentionally reuses existing request and response types. This
slice changes the Seam, not the upstream protocol models.

`resolveRoutePath(...)` returns a path, not a full URL. Product code still owns
normalizing the user-supplied base URL and joining the path into a final URL.
This keeps browser/navigation behavior in the route resolver while moving
backend route facts into the Adapter.

Capability presence is the support signal. A missing `accountBootstrap`
capability means the site type cannot participate in API-fallback auto-detect,
site-status display-name probing, Adapter-owned account completion, or
Adapter-owned route resolution.

### 2. Extend `SiteAdapter`

Modify:

```text
src/services/apiAdapters/contracts/siteAdapter.ts
```

Add:

```ts
accountBootstrap?: AccountBootstrapCapability
```

Expected support after this slice:

- New API-family Adapters expose `accountBootstrap`.
- Sub2API exposes `accountBootstrap`.
- AIHubMix exposes `accountBootstrap`.
- Unsupported Adapters omit `accountBootstrap`.

### 3. Add New API-Family Account Bootstrap Adapter

Create:

```text
src/services/apiAdapters/newApi/accountBootstrap.ts
```

The Adapter should bind to the site-scoped legacy facade:

```ts
import type { AccountSiteType } from "~/constants/siteType"
import { SITE_TYPES } from "~/constants/siteType"
import type { AccountBootstrapCapability } from "~/services/apiAdapters/contracts/accountBootstrap"
import { getApiService } from "~/services/apiService"

export const createNewApiAccountBootstrap = (
  siteType: AccountSiteType,
): AccountBootstrapCapability => {
  const apiService = getApiService(siteType)

  return {
    fetchUserInfo: (request) => apiService.fetchUserInfo(request),
    getOrCreateAccessToken: (request) =>
      apiService.getOrCreateAccessToken(request),
    fetchSiteStatus: (request) => apiService.fetchSiteStatus(request),
    fetchCheckInSupport: (request) =>
      apiService.fetchSupportCheckIn(request),
    extractDefaultExchangeRate: (siteStatus) =>
      apiService.extractDefaultExchangeRate(siteStatus),
    resolveRoutePath: (target, route) =>
      resolveNewApiFamilyRoutePath({
        target,
        route,
        fetchSiteStatus: (request) => apiService.fetchSiteStatus(request),
      }),
  }
}
```

`resolveNewApiFamilyRoutePath(...)` can live in the Adapter implementation or
remain private to `siteRouteResolver` while being supplied with the Adapter
capability. The important contract is that New API default-theme probing uses
the Adapter's `fetchSiteStatus(...)`, preserves the existing bounded cache, and
falls back to static route config when probing fails.

Delegating through `getApiService(siteType)` preserves current One API/New
API-compatible override behavior for AnyRouter, Veloera, OneHub, DoneHub,
V-API, VoAPI, Super-API, Rix-API, Neo-API, WONG, and unknown-compatible sites.

### 4. Add Sub2API Account Bootstrap Adapter

Create:

```text
src/services/apiAdapters/sub2api/accountBootstrap.ts
```

The Adapter should delegate to existing Sub2API implementation functions:

```ts
import {
  extractDefaultExchangeRate,
  fetchSiteStatus,
  fetchSupportCheckIn,
  fetchUserInfo,
  getOrCreateAccessToken,
} from "~/services/apiService/sub2api"
```

Route resolution should keep the existing static Sub2API route config from
`getAccountSiteApiRouter(SITE_TYPES.SUB2API)`.

Sub2API behavior must remain unchanged:

- API-fallback user discovery still uses cookie auth and may fail when the
  browser-session/JWT context is unavailable.
- Access-token recovery and refresh-token re-sync stay in the Sub2API
  implementation.
- Status probing keeps the current Sub2API endpoint and default exchange-rate
  extraction.
- Check-in support remains disabled.
- Existing Sub2API route paths remain unchanged.

### 5. Add AIHubMix Account Bootstrap Adapter

Create:

```text
src/services/apiAdapters/aihubmix/accountBootstrap.ts
```

The Adapter should delegate to existing AIHubMix implementation functions:

```ts
import {
  extractDefaultExchangeRate,
  fetchSiteStatus,
  fetchSupportCheckIn,
  fetchUserInfo,
  getOrCreateAccessToken,
} from "~/services/apiService/aihubmix"
```

Route resolution should preserve AIHubMix's split origin behavior:

- API requests use `AIHUBMIX_API_ORIGIN`.
- Login route resolution uses `AIHUBMIX_WEB_ORIGIN`.
- Other account-site route paths keep the current AIHubMix route config.

AIHubMix behavior must remain unchanged:

- API origin normalization stays in AIHubMix implementation and account URL
  normalization helpers.
- Token-authenticated requests continue sending raw
  `Authorization: <access_token>` without a `Bearer` prefix.
- `getOrCreateAccessToken(...)` still reuses `fetchUserInfo(...)`.
- Check-in support remains disabled.
- Login routing from `console.aihubmix.com` still resolves to
  `https://console.aihubmix.com/sign-in`.

### 6. Route API-Fallback User Discovery Through The Adapter

Modify:

```text
src/services/siteDetection/autoDetectService.ts
```

Replace the legacy facade call in `getUserDataViaAPI(...)`:

```ts
const userInfo = await getApiService(siteType).fetchUserInfo(...)
```

with:

```ts
const accountBootstrap = getSiteAdapter(siteType).accountBootstrap
const userInfo = await requireAccountBootstrapCapability(
  siteType,
  accountBootstrap,
).fetchUserInfo(...)
```

Preserve the request shape:

```ts
{
  baseUrl: url,
  auth: {
    authType: AuthTypeEnum.Cookie,
  },
  ...(fetchContext ? { fetchContext } : {}),
}
```

Missing capability should behave like the current failed API fallback:

- log a warning with the site type and safe fetch context summary
- return `null`
- let the existing fallback chain continue

Do not change current-tab content-script data reads or background runtime
message payloads.

### 7. Route Site Display-Name Status Probing Through The Adapter

Modify:

```text
src/services/accounts/siteName.ts
```

Replace:

```ts
getApiService(siteTypeHint).fetchSiteStatus(...)
```

with:

```ts
getSiteAdapter(siteTypeHint).accountBootstrap?.fetchSiteStatus(...)
```

Use a local capability guard only when `siteTypeHint` is an account site type.
If the capability is missing or the status probe fails, keep the current
domain-prefix fallback.

Preserve existing display-name behavior:

- non-default browser tab title wins
- no site-type hint means no status probe
- pre-fetched `siteStatusInfo` avoids a redundant status probe
- default-like upstream `system_name` falls back to the domain name
- invalid URLs fall back to the raw input prefix

### 8. Route Account-Site Route Resolution Through The Adapter

Modify:

```text
src/services/accounts/utils/siteRouteResolver.ts
```

Keep product ownership of:

- base URL normalization
- final `joinUrl(...)`
- best-effort login fallback when no site-type hint exists
- bounded New API theme cache
- cache clearing for tests

Move route path selection to `accountBootstrap.resolveRoutePath(...)` when the
capability exists.

For New API default-theme probing:

- keep `SITE_ROUTE_THEME_CACHE_TTL_MS`
- keep `SITE_ROUTE_THEME_CACHE_MAX_ENTRIES`
- key the cache by normalized base URL
- fetch status through `accountBootstrap.fetchSiteStatus(...)`
- fall back to static paths when status probing fails

For AIHubMix login routing:

- `resolveAccountSiteLoginUrl(...)` should continue resolving
  `SITE_TYPES.AIHUBMIX` login URLs against `AIHUBMIX_WEB_ORIGIN`
- `getBestEffortLoginUrl(...)` should continue using the AIHubMix hostname
  allow-list when no site-type hint exists

If the capability is missing, fall back to static route config from
`getAccountSiteApiRouter(siteType)`.

### 9. Deepen Account Completion Implementations

Modify:

```text
src/services/apiAdapters/newApi/accountCompletion.ts
src/services/apiAdapters/sub2api/accountCompletion.ts
src/services/apiAdapters/aihubmix/accountCompletion.ts
```

Each Adapter should use its sibling `accountBootstrap` implementation for:

- `fetchUserInfo(...)`
- `getOrCreateAccessToken(...)`
- `fetchSiteStatus(...)`
- `fetchCheckInSupport(...)`
- `extractDefaultExchangeRate(...)`

The `AccountCompletionCapability` Interface should not grow in this slice.
Account completion remains the product workflow Interface; account bootstrap
becomes an internal Adapter dependency for backend facts.

Preserve current completion behavior:

- New API-family cookie auth fetches token info via `fetchUserInfo(...)`.
- New API-family access-token auth calls `getOrCreateAccessToken(...)`.
- New API-family status failure maps to `SiteStatusFetchFailed`.
- New API-family check-in support uses `status.checkin_enabled` when present
  and `fetchCheckInSupport(...)` otherwise.
- Sub2API requires a detected access token and disables check-in.
- Sub2API preserves detected `sub2apiAuth`.
- AIHubMix uses detected token info when available and falls back to
  `getOrCreateAccessToken(...)`.
- AIHubMix validates username and access token before returning completion
  data.
- All implementations keep exchange-rate fallback to
  `UI_CONSTANTS.EXCHANGE_RATE.DEFAULT`.

### 10. Keep Site-Type Detection Rules Separate

Do not move:

- `ACCOUNT_SITE_TITLE_RULES`
- `ACCOUNT_SITE_DOMAIN_RULES`
- `COMPAT_USER_ID_HEADER_TO_SITE_TYPE`
- `fetchSiteOriginalTitle(...)`
- `getAccountSiteUserIdType(...)`
- `detectAccountSiteTypeFromDomain(...)`

Those rules decide which Adapter to use. The new `accountBootstrap` capability
starts after a candidate `AccountSiteType` exists.

## Error Handling

Adapter methods should delegate backend errors unchanged.

Product behavior should stay as it is today:

- API-fallback user discovery catches backend errors, logs them, and returns
  `null`.
- Current-tab reload hint behavior remains tied to content-script receiver
  availability and generic fallback failure.
- Site-name status probing failures fall back to domain-derived names.
- Route status probing failures fall back to static route paths.
- Account completion wraps token-fetch and site-status failures in
  `AutoDetectCompletionError` through existing helpers.
- Missing `accountBootstrap` capability is non-fatal in best-effort helpers
  (`autoDetectService`, `siteName`, route resolver), but account-completion
  Adapters for supported site types should fail tests if their sibling
  capability is missing.

Do not add user-facing copy for missing `accountBootstrap` in this slice.

## Telemetry Decision

Telemetry decision: reuse existing.

This is an internal architecture migration. It does not add a new user action,
setting, result category, or analytics field. Existing auto-detect analytics
fields should remain unchanged:

- strategy
- site type
- fetch context kind
- incognito context used
- current-tab matched
- failure reason mapping

## Settings Search Decision

Settings search decision: none.

No settings UI, route, anchor, or search definition changes.

## E2E Decision

E2E decision: no new Playwright E2E in this slice.

The risk is service-layer routing, request preservation, fallback behavior, and
route/status probing. Focused Vitest coverage at Adapter, auto-detect,
site-name, route, and account-completion levels directly covers that risk.
Browser runtime behavior is unchanged because content-script and background
message entry points keep their existing payloads.

Run broader browser-level checks only if implementation evidence shows an
import-scope change involving background/content entrypoints or Sub2API
browser-session recovery.

## Testing Strategy

Add Adapter tests:

- `tests/services/apiAdapters/accountBootstrap.test.ts`
  - New API-family delegates user info, access-token bootstrap, site status,
    check-in support, and exchange-rate extraction through
    `getApiService(siteType)`.
  - New API-family route path resolution preserves static paths for non-New
    API-family variants and default-theme paths for `SITE_TYPES.NEW_API`.
  - Sub2API delegates bootstrap calls to Sub2API helpers.
  - AIHubMix delegates bootstrap calls to AIHubMix helpers and preserves
    console login path behavior.

Update registry tests:

- New API-family Adapters expose `accountBootstrap`.
- Sub2API exposes `accountBootstrap`.
- AIHubMix exposes `accountBootstrap`.
- Unsupported Adapters omit `accountBootstrap`.

Update auto-detect tests:

- `tests/services/autoDetectService.test.ts`
  - API fallback uses `getSiteAdapter(...).accountBootstrap.fetchUserInfo(...)`
    with the unchanged cookie-auth request shape.
  - Current-tab success still avoids API fallback.
  - Background success still avoids API fallback.
  - API fallback preserves current-tab and browser-context fetch contexts.
  - Missing `accountBootstrap` returns the same user-data-missing behavior as a
    failed backend fetch.
  - AIHubMix API-origin normalization remains unchanged.

Update site-name tests:

- Existing `getSiteName(...)` tests should assert status probing uses
  `accountBootstrap.fetchSiteStatus(...)`.
- Existing fallback tests should remain unchanged:
  - custom tab title wins
  - no site-type hint avoids status probing
  - provided site status avoids status probing
  - failed status probing falls back to the domain

Update route resolver tests:

- `tests/services/accounts/siteRouteResolver.test.ts`
  - New API default-theme route probing goes through
    `accountBootstrap.fetchSiteStatus(...)`.
  - Static routes are preserved for non-New API site types.
  - cached theme probes remain bounded.
  - AIHubMix login routing remains centralized and uses the web origin.
  - missing `accountBootstrap` falls back to static route config.

Update account-completion tests:

- `tests/services/apiAdapters/newApi/accountCompletion.test.ts`
  - completion calls the New API-family bootstrap Adapter rather than mocking
    legacy `getApiService(...)` directly.
  - token-fetch, site-status, check-in support, username, access-token, and
    exchange-rate behavior remains unchanged.
- `tests/services/apiAdapters/sub2api/accountCompletion.test.ts`
  - completion uses Sub2API bootstrap Adapter functions and preserves detected
    `sub2apiAuth`.
- `tests/services/apiAdapters/aihubmix/accountCompletion.test.ts`
  - completion uses AIHubMix bootstrap Adapter functions and preserves detected
    token fast path plus fallback token creation.

Focused validation:

```powershell
pnpm vitest run tests/services/apiAdapters/accountBootstrap.test.ts tests/services/apiAdapters/registry.test.ts tests/services/autoDetectService.test.ts tests/services/accounts/siteRouteResolver.test.ts tests/services/accountOperations.test.ts tests/services/apiAdapters/newApi/accountCompletion.test.ts tests/services/apiAdapters/sub2api/accountCompletion.test.ts tests/services/apiAdapters/aihubmix/accountCompletion.test.ts
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
shared Adapter contracts, auto-detect routing, and account completion internals.

## Rollout

1. Add the `accountBootstrap` contract and Adapter delegation tests.
2. Implement New API-family, Sub2API, and AIHubMix bootstrap Adapters.
3. Extend `SiteAdapter` and registry expectations.
4. Migrate API-fallback user discovery in `autoDetectService`.
5. Migrate site-name status probing.
6. Migrate route path resolution while preserving route cache behavior.
7. Deepen account-completion Adapter implementations to use bootstrap
   dependencies.
8. Run focused tests after each caller group.
9. Run `pnpm compile` and `pnpm run validate:staged`.
10. Inspect the final diff for scope drift.
11. Run `pnpm run validate:push` before pushing or opening a PR.

## Follow-Up, Not In Scope For This Spec

Later slices may migrate:

- default token provisioning policy
- Account Dialog site policy for Sub2API refresh-token fields, AIHubMix
  access-token behavior, cookie import, and check-in control visibility
- redemption through a `redemption` capability
- managed-site channel operations and model sync
- a narrow import guard preventing new product Modules from importing the
  legacy `apiService` facade outside approved adapter/compatibility layers
- adding a new account site type using the reduced Adapter surface

Do not turn `SiteAdapter` into a second flat `apiService` facade. This slice is
valid because it makes an already-real account onboarding Module deeper:
auto-detect, route/status/name probing, and account completion all get more
Leverage from one account bootstrap Interface, while backend-specific knowledge
gets better Locality inside each Adapter.
