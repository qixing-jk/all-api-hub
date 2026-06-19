# Account Site Onboarding Substrate Design

Date: 2026-06-19

## Purpose

Move the earliest account-site onboarding facts into a dedicated substrate so a
new account site type can become identifiable and session-readable without
threading raw site-type branches through constants, content scripts, and
auto-detect orchestration.

Recent adapter slices moved account completion, key management, account
refresh, model pricing, manual account data, account bootstrap, and related
Sub2API auth-session behavior behind `getSiteAdapter(siteType)`. Those slices
make a known account site type usable after detection. The remaining
high-friction path is earlier: choosing the site type and extracting browser
session identity still require edits in scattered product Modules before the
Adapter can be used.

This spec defines an account-site onboarding substrate for detection metadata
and content-session extraction. It intentionally stops before Account Dialog UI
policy, redemption, and managed-site operations.

## Current Context

The current `SiteAdapter` Interface already exposes backend capabilities for
known account site types:

```ts
type SiteAdapter = {
  siteType: AccountSiteType
  family?: SiteBackendFamily
  siteNotice?: SiteNoticeCapability
  siteAnnouncements?: SiteAnnouncementsCapability
  modelCatalog?: ModelCatalogCapability
  modelPricing?: ModelPricingCapability
  accountData?: AccountDataCapability
  accountBootstrap?: AccountBootstrapCapability
  accountCompletion?: AccountCompletionCapability
  keyManagement?: KeyManagementCapability
  accountRefresh?: AccountRefreshCapability
}
```

Those capabilities start after a candidate `AccountSiteType` exists.

Today the pre-adapter onboarding facts are still split across several Modules:

- `src/constants/siteType.ts`
  - `ACCOUNT_SITE_TYPES` defines the supported account site type universe.
  - `ACCOUNT_SITE_TITLE_RULES` maps root page titles to site types.
  - `ACCOUNT_SITE_DOMAIN_RULES` maps known hostnames to site types.
  - `SITE_ROUTE_CONFIGS` stores static route paths.
- `src/services/siteDetection/detectSiteType.ts`
  - domain rules run first.
  - root title rules run second.
  - generic `/api/user/self` auth-error probing runs last.
- `src/entrypoints/content/messageHandlers/handlers/storage.ts`
  - current-tab and temp-context auto-detect read Sub2API's JWT session from
    dedicated localStorage keys.
  - otherwise they read a generic `localStorage["user"]` payload and resolve a
    compatible account identity.
- `src/services/siteDetection/autoDetectService.ts`
  - requests content-script localStorage identity before API fallback.
  - passes `siteType` hints to the content script, but the content script still
    owns the extraction branch.
- Account Dialog Modules still contain UI policy branches for Sub2API and
  AIHubMix, but those are product policy rather than the substrate covered by
  this spec.

The current backend differences prove the Seam is real:

- New API-family compatible sites generally expose a `user` object in
  localStorage and can be identified by title or compatible auth-error
  headers.
- Sub2API stores a JWT session in `auth_token`, `refresh_token`,
  `token_expires_at`, and `auth_user`, and may need proactive token refresh
  inside the content script before returning identity data.
- AIHubMix uses fixed hostnames and split API/web origins; current account
  auto-detect can start from console pages but saved accounts operate against
  the API origin.

## Problem

Adding a new non-compatible account site type still requires edits before any
`SiteAdapter` capability can help.

Current friction:

1. Site-type metadata is spread across separate exported arrays and route
   config objects. A new site type has to remember every registration surface.
2. `detectSiteType.ts` knows how to order detection strategies, but the rule
   data is not owned by a single onboarding Module.
3. `storage.ts` is the largest early runtime branch: Sub2API session extraction
   and generic compatible user extraction live in one content-script handler.
4. A new site with different browser-session storage would add a third branch
   in the content script instead of satisfying a narrow extractor Interface.
5. Tests for content-session extraction and site-type detection do not share a
   common Interface that future site types can implement.

Deletion test: if the Sub2API-specific session extraction branch and the
generic compatible localStorage user branch were deleted from the content
message handler, the complexity should not reappear as raw `siteType` branches
in the same handler. It should move behind a site-scoped onboarding extractor
Interface. Likewise, detection metadata should be registered once and projected
into title rules, domain rules, route config, and fallback probing.

## Goals

- Add a dedicated account-site onboarding Module that owns:
  - detection metadata
  - static route metadata currently tied to site registration
  - content-session extractor selection
  - shared extractor result shape
- Route `detectSiteType.ts` through the onboarding registry for domain/title
  rules and compatible fallback metadata.
- Route `handleGetUserFromLocalStorage(...)` through registered content-session
  extractors instead of hard-coded Sub2API and generic branches.
- Preserve current behavior:
  - domain detection still wins over title and API-error probing
  - root title detection still uses the original HTML title
  - compatible `/api/user/self` auth-error probing still works for existing
    compatible site types
  - Sub2API localStorage extraction still refreshes near-expiry tokens and
    returns `sub2apiAuth`
  - generic compatible user extraction still uses
    `resolveStoredAccountUserIdentity(user, siteType)`
  - content-script responses keep the same wire shape consumed by
    `autoDetectService`
  - `SITE_TYPES`, `ACCOUNT_SITE_TYPES`, `MANAGED_SITE_TYPES`,
    `getAccountSiteApiRouter(...)`, and public type exports remain available
    for compatibility
- Keep `SiteAdapter` focused on backend capabilities after a site type is
  known.
- Add focused tests for registry projections, detection ordering, extractor
  selection, Sub2API session extraction, and compatible localStorage fallback.

## Non-Goals

- Do not add a new account site type in this slice.
- Do not change Account Dialog UI policy for Sub2API refresh-token fields,
  AIHubMix one-time-key behavior, cookie-auth visibility, or check-in controls.
- Do not migrate redemption, managed-site channel operations, managed-site
  model sync, or managed-site provider registration.
- Do not remove `SITE_TYPES`, `ACCOUNT_SITE_TYPES`, route helpers, or existing
  exported detection helpers.
- Do not move `accountBootstrap`, `accountCompletion`, `accountData`,
  `keyManagement`, `modelPricing`, or `accountRefresh` into the onboarding
  substrate.
- Do not introduce remote detection metadata or plugin-loaded site definitions.
- Do not change user-facing copy, locale keys, telemetry schema, settings
  search entries, or Playwright E2E tests.

## Approaches Considered

### Approach A: Keep Adding Branches In Existing Files

This keeps implementation small for one site type, but it preserves the same
friction. Every new site still has to touch constants, detection rules, route
config, content-script localStorage parsing, and tests independently.

This should not be the next step.

### Approach B: Put Detection And Session Extraction On `SiteAdapter`

`SiteAdapter` could gain detection rules and content-session extraction.

This blurs the Seam. `SiteAdapter` is selected by `siteType`, but detection and
content-session extraction are used before or while discovering the site type.
It would also pull content-script browser runtime concerns into backend
Adapters.

This should not be the next step.

### Approach C: Add A Separate Account-Site Onboarding Registry

Create a substrate that registers account-site metadata and optional
content-session extractors. Detection and content-script handlers consume that
registry, then pass the resulting `siteType` into the existing `SiteAdapter`
registry.

This is the recommended path. It keeps the pre-adapter facts in one Module,
gives new site types a clear registration surface, and preserves the existing
post-detection Adapter architecture.

## Design

### 1. Add Account-Site Onboarding Contracts

Create:

```text
src/services/accountSiteOnboarding/contracts.ts
```

Proposed Interface:

```ts
import type { AccountSiteType } from "~/constants/siteType"
import type { AuthTypeEnum } from "~/types"

export type AccountSiteRouteConfig = {
  loginPath?: string
  usagePath?: string
  checkInPath?: string
  adminCredentialsPath?: string
  redeemPath?: string
  siteAnnouncementsPath?: string
}

export type AccountSiteDetectionMetadata = {
  titlePatterns?: readonly RegExp[]
  hostnames?: readonly string[]
  compatUserIdHeaderNames?: readonly string[]
}

export type ContentSessionExtractionContext = {
  url?: string
  siteTypeHint?: AccountSiteType
}

export type ContentSessionExtractionResult = {
  userId: string
  username?: string
  user?: {
    id?: string | number
    username?: string
    balance?: number
  }
  accessToken?: string
  siteTypeHint?: AccountSiteType
  sub2apiAuth?: {
    refreshToken: string
    tokenExpiresAt?: number | null
  }
  authType?: AuthTypeEnum
}

export type ContentSessionExtractor = {
  id: string
  canExtract(context: ContentSessionExtractionContext): boolean
  extract(context: ContentSessionExtractionContext):
    | Promise<ContentSessionExtractionResult | null>
    | ContentSessionExtractionResult
    | null
}

export type AccountSiteOnboardingDefinition = {
  siteType: AccountSiteType
  detection?: AccountSiteDetectionMetadata
  routes?: AccountSiteRouteConfig
  contentSessionExtractor?: ContentSessionExtractor
}
```

The Interface intentionally separates:

- static metadata used to choose a site type
- browser-session extraction used by content scripts
- backend capabilities already owned by `SiteAdapter`

`ContentSessionExtractionResult` should match the existing wire contract from
content script to `autoDetectService`, so the auto-detect orchestrator does not
need a payload migration in this slice.

### 2. Add The Onboarding Registry

Create:

```text
src/services/accountSiteOnboarding/registry.ts
```

The registry should export:

```ts
export const accountSiteOnboardingDefinitions:
  readonly AccountSiteOnboardingDefinition[]

export function getAccountSiteOnboardingDefinition(
  siteType: AccountSiteType,
): AccountSiteOnboardingDefinition | undefined

export function getAccountSiteDomainRules(): readonly {
  name: AccountSiteType
  hostnames: readonly string[]
}[]

export function getAccountSiteTitleRules(): readonly {
  name: AccountSiteType
  regex: RegExp
}[]

export function getAccountSiteRouteOverrides(
  siteType: AccountSiteType,
): AccountSiteRouteConfig | undefined

export function getContentSessionExtractors():
  readonly ContentSessionExtractor[]
```

The first implementation can migrate existing metadata without changing public
exports:

- One API/New API-family title patterns
- AnyRouter, WONG, and other compatible title patterns
- AIHubMix hostnames
- existing static route overrides
- Sub2API content-session extractor
- compatible localStorage `user` extractor

Keep `SITE_TYPES.UNKNOWN` registered only where existing public arrays require
it. It should not have a content-session extractor.

### 3. Keep `siteType.ts` As The Compatibility Facade

Modify:

```text
src/constants/siteType.ts
```

Keep the public exports:

- `SITE_TYPES`
- `ACCOUNT_SITE_TYPES`
- `ACCOUNT_SITE_TYPE_VALUES`
- `MANAGED_SITE_TYPES`
- `ACCOUNT_SITE_TITLE_RULES`
- `ACCOUNT_SITE_DOMAIN_RULES`
- `getSiteRouteConfigForKey(...)`
- `getAccountSiteApiRouter(...)`

But derive title rules, domain rules, and route overrides from the onboarding
registry where practical. This makes the new registry the source of truth
without breaking existing callers.

`SITE_TYPES` and the account/managed site type arrays can stay in
`siteType.ts` for now because they define TypeScript literal unions used across
the repo. Moving those constants is not needed for this slice.

### 4. Route Site-Type Detection Through Registry Projections

Modify:

```text
src/services/siteDetection/detectSiteType.ts
```

Preserve detection ordering:

1. domain metadata
2. root HTML title metadata
3. compatible `/api/user/self` auth-error probing

The detector should consume `getAccountSiteDomainRules()` and
`getAccountSiteTitleRules()` from the onboarding registry or compatibility
facade, not hard-coded arrays.

For API-error probing, replace the current direct
`COMPAT_USER_ID_ERROR_HEADER_TO_SITE_TYPE` projection with registry metadata:

```ts
compatUserIdHeaderNames?: readonly string[]
```

New API-family compatible sites can keep using the existing compat header map
while the registry exposes the normalized detection rules consumed by
`detectSiteType.ts`.

### 5. Extract Sub2API Content-Session Logic

Create:

```text
src/services/accountSiteOnboarding/contentSession/sub2api.ts
```

Move the Sub2API-specific localStorage extraction from `storage.ts` into a
`ContentSessionExtractor`.

Preserve behavior:

- read `auth_token`, `refresh_token`, `token_expires_at`, and `auth_user`
- refresh tokens near expiry through `/api/v1/auth/refresh`
- write refreshed tokens back to localStorage
- parse identity through `parseSub2ApiUserIdentity(...)`
- return `siteTypeHint: SITE_TYPES.SUB2API`
- return `sub2apiAuth.refreshToken` and optional `tokenExpiresAt`
- return login-required failure by producing `null` and letting the caller map
  it to the existing content error

Keep the no-token logging/security invariant: never log tokens.

### 6. Extract Compatible LocalStorage User Logic

Create:

```text
src/services/accountSiteOnboarding/contentSession/compatibleUser.ts
```

Move the generic branch from `storage.ts` into a `ContentSessionExtractor`.

Preserve behavior:

- read `localStorage["user"]`
- parse JSON defensively
- use `resolveStoredAccountUserIdentity(user, siteTypeHint)`
- return `siteTypeHint` when the hint is a known account site type and not
  `unknown`
- return `null` when identity cannot be resolved

This extractor should be the fallback for compatible account site types that do
not provide a dedicated extractor.

### 7. Route Content Message Handling Through Extractors

Modify:

```text
src/entrypoints/content/messageHandlers/handlers/storage.ts
```

Keep `handleGetLocalStorage(...)` unchanged.

Replace the hard-coded `handleGetUserFromLocalStorage(...)` branches with:

```ts
const context = {
  url: typeof request?.url === "string" ? request.url : undefined,
  siteTypeHint: isAccountSiteType(request?.siteType)
    ? request.siteType
    : SITE_TYPES.UNKNOWN,
}

for (const extractor of getContentSessionExtractors()) {
  if (!extractor.canExtract(context)) continue
  const result = await extractor.extract(context)
  if (result) {
    sendResponse({ success: true, data: result })
    return
  }
}

sendResponse({
  success: false,
  error: t("messages:content.userInfoNotFound"),
})
```

Ordering matters:

1. dedicated exact-site extractors, such as Sub2API
2. compatible fallback extractor

This preserves Sub2API's specialized session behavior while giving future
non-compatible sites a clear slot.

### 8. Keep Auto-Detect Wire Shape Stable

`autoDetectService` should not need a payload migration. It should keep sending
the same runtime/content message request fields:

- `url`
- `siteType`
- current-tab or temp-context metadata owned by the existing flow

The content script decides which extractor can handle the request and returns
the same data shape as today.

If implementation reveals duplicated request shaping in `autoDetectService`,
the plan may add a small local helper there, but this spec does not require a
new auto-detect Interface.

### 9. Keep Account Dialog Policy As Follow-Up

Do not move these branches in this slice:

- Sub2API disables cookie auth and built-in check-in
- Sub2API refresh-token form controls and import action
- AIHubMix clears saved cookie auth after token import
- AIHubMix post-save foreground key prompt
- Sub2API post-save token dialog

Those are product workflow policy, not detection metadata or browser-session
extraction. They deserve a later `accountSitePolicy` Module that consumes
adapter/onboarding facts and returns UI policy flags.

## Error Handling

Content-session extractors should not throw for expected "not logged in" or
"not this site" cases. They should return `null`.

Expected fatal or unexpected failures should be caught by
`handleGetUserFromLocalStorage(...)` and mapped to the existing response shape:

```ts
{ success: false, error: getErrorMessage(error) }
```

Specific behavior to preserve:

- Sub2API missing, expired, or unrefreshable auth returns the existing
  login-required user-facing error.
- Generic compatible missing user data returns
  `messages:content.userInfoNotFound`.
- Invalid JSON in one extractor should not prevent later fallback extractors
  unless it represents an unexpected implementation error in that extractor.
- No token or user payload should be logged.

## Telemetry Decision

Telemetry decision: reuse existing.

This is an internal architecture migration. Existing auto-detect analytics
should continue to report the same strategy, site type, fetch-context, current
tab, incognito, and failure-stage fields.

Do not add telemetry fields for localStorage key names, hostnames, raw errors,
tokens, user ids, or backend messages.

## Settings Search Decision

Settings search decision: none.

No settings UI, route, anchor, or search definition changes.

## E2E Decision

E2E decision: no new Playwright E2E in this slice.

The main risk is deterministic routing and extraction logic. Focused Vitest
coverage for registry projections, detection ordering, and content-session
extractors directly covers that risk.

Existing browser-level auto-detect and Sub2API flows remain the broader guard
for content-script/runtime-message integration. Run them only if implementation
changes runtime action ids, message payloads, or extension entrypoint imports.

## Testing Strategy

Add registry tests:

- `tests/services/accountSiteOnboarding/registry.test.ts`
  - title rules include the same account site type names as the old exported
    title rules.
  - AIHubMix domain metadata projects to the same hostname set.
  - route overrides preserve existing paths for Sub2API, AIHubMix, Veloera,
    OneHub, DoneHub, V-API, Rix-API, AnyRouter, and WONG.
  - content-session extractors are ordered with Sub2API before compatible
    fallback.

Update detection tests:

- `tests/services/detectSiteType.test.ts`
  - domain detection still wins.
  - title detection still matches existing site title variants.
  - compatible auth-error fallback still maps known user-id header markers.
  - unknown detection remains unknown when no metadata matches.

Add extractor tests:

- `tests/services/accountSiteOnboarding/contentSession/sub2api.test.ts`
  - valid Sub2API localStorage returns identity, access token, site hint, and
    `sub2apiAuth`.
  - near-expiry Sub2API token refresh updates localStorage and returns refreshed
    auth data.
  - missing or invalid Sub2API auth returns `null` or the existing login
    required path without logging secrets.
- `tests/services/accountSiteOnboarding/contentSession/compatibleUser.test.ts`
  - compatible `localStorage["user"]` returns the same identity shape as
    `resolveStoredAccountUserIdentity(...)`.
  - unknown site type omits `siteTypeHint`.
  - missing or malformed user payload returns `null`.

Update content handler tests:

- existing storage-handler tests should assert that
  `handleGetUserFromLocalStorage(...)`:
  - tries dedicated extractors before compatible fallback
  - preserves successful response shape
  - preserves `messages:content.userInfoNotFound` when no extractor returns
    data
  - preserves `getErrorMessage(...)` mapping for unexpected extractor errors

Focused validation:

```powershell
pnpm vitest run tests/services/accountSiteOnboarding/registry.test.ts tests/services/accountSiteOnboarding/contentSession/sub2api.test.ts tests/services/accountSiteOnboarding/contentSession/compatibleUser.test.ts tests/services/detectSiteType.test.ts tests/entrypoints/content/messageHandlers/storage.test.ts
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
shared site-type registration, content-script code, and detection wiring.

## Rollout

1. Add onboarding contracts and registry tests.
2. Move existing metadata into onboarding definitions while preserving
   compatibility exports from `siteType.ts`.
3. Route `detectSiteType.ts` through registry projections.
4. Extract Sub2API content-session logic into its extractor with focused tests.
5. Extract compatible `localStorage["user"]` logic into its extractor with
   focused tests.
6. Route `handleGetUserFromLocalStorage(...)` through extractor ordering.
7. Re-run focused tests after each migration group.
8. Run `pnpm compile` and `pnpm run validate:staged`.
9. Inspect the final diff for scope drift.
10. Run `pnpm run validate:push` before pushing or opening a PR.

## Follow-Up, Not In Scope For This Spec

Later slices may migrate:

- Account Dialog site policy for auth method visibility, check-in availability,
  Sub2API refresh-token controls, AIHubMix access-token behavior, and post-save
  token prompts.
- redemption through a `redemption` capability.
- managed-site channel operations and model sync behind a managed-site-specific
  Interface.
- a narrow import guard preventing new product Modules from importing the
  legacy `apiService` facade outside approved adapter/compatibility layers.
- adding a new account site type using the reduced onboarding plus Adapter
  surface.

Do not turn the onboarding substrate into a second `SiteAdapter`. It exists
because detection metadata and content-session extraction happen before backend
capabilities can be selected. Once a site type is known, backend protocol work
should still flow through `getSiteAdapter(siteType)`.
