# Account Completion Adapter Design

Date: 2026-06-17

## Purpose

Move account auto-detect completion rules behind the `apiAdapters` Seam so a new
account site type can define its saved auth mode, token completion path, site
status probe, exchange-rate handling, and check-in defaults in one Adapter
Module.

The previous account auto-detect completion slice extracted the post-detection
workflow from `autoDetectAccount(...)` into
`src/services/accounts/autoDetectCompletion/`. That made the workflow easier to
test, but the new Module still hardcodes Sub2API and AIHubMix rules. This slice
should keep the public `autoDetectAccount(...)` response unchanged while moving
site-specific completion behavior into `getSiteAdapter(siteType)`.

## Current Context

The current architecture has three relevant layers:

- `src/services/siteDetection/autoDetectService.ts` detects an account identity
  and returns a site type, user id, optional user data, optional detected access
  token, optional Sub2API auth metadata, and optional fetch context.
- `src/services/accounts/accountOperations.ts` owns the public
  `autoDetectAccount(url, authType)` workflow and maps completion failures into
  `AccountValidationResponse`.
- `src/services/accounts/autoDetectCompletion/completion.ts` completes a
  detected identity with user/token data, site status, site name, exchange rate,
  check-in defaults, saved auth type, and analytics-safe failure reasons.

`completion.ts` currently calls `getApiService(siteType)` directly and contains
the site-specific decision table:

- Sub2API saves as access-token auth, uses the detected runtime access token,
  permits an empty username, forwards Sub2API auth metadata, and disables
  check-in.
- AIHubMix saves as access-token auth, can use detected web access-token data,
  probes site status with cookie auth, and requires username plus access token.
- Compatible sites follow the requested auth type, use `fetchUserInfo(...)` for
  cookie completion, use `getOrCreateAccessToken(...)` for access-token
  completion, and enable check-in based on site status or support probing.

The current `apiAdapters` tree already exposes narrow capabilities for:

- `siteNotice`
- `siteAnnouncements`
- `modelCatalog`

Those slices proved the registry pattern without replacing the old
`getApiService(...)` facade.

## Problem

`autoDetectCompletion` is now the highest-friction path for adding a new account
site type. The Module is deeper than the old `accountOperations.ts` branch, but
its Interface is still not the right Seam for site-specific behavior.

Current friction:

1. A new non-compatible account site still requires editing the central
   completion implementation to choose saved auth mode and token completion
   strategy.
2. The central Module must know which sites can trust detected access-token
   data, which sites require username, and which sites disable check-in.
3. Site status and exchange-rate completion look common, but the auth mode and
   fallback behavior are backend-specific.
4. Tests verify the extracted workflow, but a new site would need new branch
   coverage in the same central test file instead of focused Adapter tests.

Deletion test: if the Sub2API and AIHubMix branches were deleted from
`completion.ts`, the complexity would reappear either in the same Module, in
`accountOperations.ts`, or in the Account Dialog. It should instead move behind
an `accountCompletion` capability on each relevant site Adapter.

## Goals

- Add a narrow `accountCompletion` Adapter capability.
- Keep `autoDetectAccount(...)` as the public workflow and response-shaping
  owner.
- Keep `completeAutoDetectedAccount(...)` as the product-level completion
  orchestrator, but make it call the site Adapter for backend-specific
  completion.
- Provide concrete account-completion Adapters for:
  - New API-family compatible account sites
  - Sub2API
  - AIHubMix
- Preserve the existing `AutoDetectCompletionData` output shape.
- Preserve existing failure reasons:
  - `TokenFetchFailed`
  - `SiteStatusFetchFailed`
  - `UsernameMissing`
  - `AccessTokenMissing`
- Keep fetch-context validation and response shaping behavior unchanged.
- Add focused Adapter tests plus existing completion workflow regression tests.

## Non-Goals

- Do not change detection strategy selection, content-script parsing, browser
  temporary-context detection, direct cookie-auth detection, or site-type
  detection.
- Do not change Account Dialog UI state, save/update behavior, duplicate
  confirmation, cookie import, or post-save token prompts.
- Do not move post-save token provisioning in this slice.
- Do not migrate Model List pricing, Sub2API price-estimation inputs, AIHubMix
  pricing, redemption, managed-site behavior, or key-management UI actions.
- Do not add a new site type in this slice.
- Do not remove `getApiService(...)` from the whole account area.
- Do not add user-facing copy, locale keys, telemetry events, settings search
  entries, or Playwright E2E tests.

## Design

### 1. Add `AccountCompletionCapability`

Create:

```text
src/services/apiAdapters/contracts/accountCompletion.ts
```

The contract should reuse the current account auto-detect completion types
instead of inventing a parallel response model.

Proposed types:

```ts
import type {
  AutoDetectCompletionData,
  AutoDetectCompletionError,
  AutoDetectCompletionRequest,
} from "~/services/accounts/autoDetectCompletion/types"
import type { AutoDetectFailureReason } from "~/constants/autoDetect"
import type {
  ApiServiceFetchContext,
  ApiServiceRequest,
  SiteStatusInfo,
} from "~/services/apiService/common/type"
import type { AuthTypeEnum } from "~/types"

export type AccountCompletionRuntimeContext = {
  fetchContext?: ApiServiceFetchContext
}

export type AccountCompletionServiceRequestInput = {
  baseUrl: string
  auth: ApiServiceRequest["auth"]
  context: AccountCompletionRuntimeContext
}

export type AccountCompletionTokenInfo = {
  username: string
  accessToken: string
}

export type AccountCompletionCheckInDefaults = {
  enableDetection: boolean
  autoCheckInEnabled: boolean
}

export type AccountCompletionAdapterResult = Omit<
  AutoDetectCompletionData,
  "siteType" | "fetchContext" | "autoDetectContext"
>

export type AccountCompletionAdapterRequest = AutoDetectCompletionRequest & {
  context: AccountCompletionRuntimeContext
}

export type AccountCompletionHelpers = {
  createServiceRequest(
    input: AccountCompletionServiceRequestInput,
  ): ApiServiceRequest
  fetchSiteName(siteStatus: SiteStatusInfo | null): Promise<string>
  createCompletionError(
    reason: AutoDetectFailureReason,
    cause: unknown,
  ): AutoDetectCompletionError
  trimString(value: unknown): string
  createInitialCheckInConfig(input: {
    enableDetection: boolean
    autoCheckInEnabled: boolean
  }): AutoDetectCompletionData["checkIn"]
  handleCheckInSupportFetchFailure(error: unknown): false
}

export type AccountCompletionCapability = {
  complete(
    request: AccountCompletionAdapterRequest,
    helpers: AccountCompletionHelpers,
  ): Promise<AccountCompletionAdapterResult>
}
```

Implementation may tune names while preserving the Interface intent:

- The Adapter owns site-specific completion behavior.
- The product Module owns context validation, final `siteType` /
  `fetchContext` / `autoDetectContext` attachment, and failure classification
  integration.
- Helpers keep shared mechanics out of each Adapter without forcing Adapters to
  import `accountOperations.ts` or duplicate request-building code.

### 2. Extend `SiteAdapter`

Add:

```ts
accountCompletion?: AccountCompletionCapability
```

Capability presence is the support signal. Missing `accountCompletion` for an
account site is an implementation error when auto-detect completion reaches that
site.

### 3. Add New API-Family Account Completion Adapter

Create:

```text
src/services/apiAdapters/newApi/accountCompletion.ts
```

Responsibilities:

- Use `getApiService(siteType)` from the incoming detected site type so existing
  New API-family overrides remain intact.
- Preserve requested auth type:
  - cookie completion calls `fetchUserInfo(...)`
  - access-token completion calls `getOrCreateAccessToken(...)`
- Fetch site status using the effective requested auth mode.
- Use `siteStatus.checkin_enabled` when present.
- Fall back to `fetchSupportCheckIn(...)` with `AuthTypeEnum.None`.
- Use `extractDefaultExchangeRate(siteStatus)` with
  `UI_CONSTANTS.EXCHANGE_RATE.DEFAULT` fallback.
- Require username for successful completion.
- Require access token only when the effective saved auth type is
  `AuthTypeEnum.AccessToken`.

The Adapter should continue to support all site types that currently map to the
New API-family Adapter in `apiAdapters/registry.ts`.

### 4. Add Sub2API Account Completion Adapter

Create:

```text
src/services/apiAdapters/sub2api/accountCompletion.ts
```

Responsibilities:

- Save accounts as `AuthTypeEnum.AccessToken`.
- Use `detected.accessToken` and `detected.user?.username`; do not call
  `fetchUserInfo(...)` or `getOrCreateAccessToken(...)`.
- Preserve `detected.sub2apiAuth` in the returned data when present.
- Fetch site status through the existing Sub2API service implementation using
  access-token auth.
- Permit an empty username.
- Require a non-empty access token.
- Disable check-in detection and auto-check-in.
- Use `extractDefaultExchangeRate(siteStatus)` with
  `UI_CONSTANTS.EXCHANGE_RATE.DEFAULT` fallback.

The Adapter should not change Sub2API refresh-token handling or token resync
behavior.

### 5. Add AIHubMix Account Completion Adapter

Create:

```text
src/services/apiAdapters/aihubmix/accountCompletion.ts
src/services/apiAdapters/aihubmix/index.ts
```

and register AIHubMix as an Adapter with `accountCompletion` only.

Responsibilities:

- Save accounts as `AuthTypeEnum.AccessToken`.
- Prefer detected access-token data from auto-detect.
- Preserve the current fallback to `getOrCreateAccessToken(...)` when detected
  access-token data is absent.
- Fetch site status with cookie auth during import.
- Require a non-empty username.
- Require a non-empty access token.
- Use `extractDefaultExchangeRate(siteStatus)` with
  `UI_CONSTANTS.EXCHANGE_RATE.DEFAULT` fallback.
- Preserve current check-in defaults:
  - `enableDetection` follows the resolved support value
  - `autoCheckInEnabled` remains true

Do not add `siteNotice`, `siteAnnouncements`, or `modelCatalog` to AIHubMix in
this slice.

### 6. Update Completion Orchestrator

`src/services/accounts/autoDetectCompletion/completion.ts` should:

1. Keep `getAutoDetectFetchContext(...)`.
2. Build an `AccountCompletionRuntimeContext` from the validated fetch context.
3. Resolve `const adapter = getSiteAdapter(siteType)`.
4. Throw an `AutoDetectCompletionError` with an implementation-oriented cause if
   `adapter.accountCompletion` is missing.
5. Call `adapter.accountCompletion.complete(...)`.
6. Attach:
   - `siteType`
   - valid `fetchContext`
   - `autoDetectContext`

The central Module should no longer contain Sub2API or AIHubMix auth/token
branches. It may keep shared helper functions for request building, string
normalization, site-name resolution, check-in shape creation, and typed error
creation if those helpers keep Adapter Implementations small.

### 7. Keep Post-Save Token Provisioning For Later

`src/services/accounts/accountPostSaveWorkflow/ensureAccountToken.ts` still has
Sub2API and AIHubMix rules. That is a good next slice, but not part of this
one.

This slice should make `completeAutoDetectedAccount(...)` Adapter-backed first.
After that Interface proves stable, a later `tokenProvisioning` capability can
move post-save token inventory, default token creation, Sub2API group
selection, and AIHubMix one-time-secret behavior behind the same Adapter
registry.

## Error Handling

Adapters should throw `AutoDetectCompletionError` through the helper when they
can classify a failure:

- token/user-info completion failure -> `TokenFetchFailed`
- site status failure -> `SiteStatusFetchFailed`
- missing username -> `UsernameMissing`
- missing access token -> `AccessTokenMissing`

Best-effort check-in support probe failures should not fail completion. They
should log through the existing completion logger or a helper and fall back to
disabled check-in detection, matching current behavior.

Missing `accountCompletion` should be treated as an implementation error inside
`completeAutoDetectedAccount(...)`. The public `autoDetectAccount(...)` catch
path should continue to convert unexpected completion errors into the existing
localized failure response.

## Telemetry Decision

Telemetry decision: reuse existing.

This is an internal architecture migration. It does not add a new user action,
setting, background flow, visible result, or analytics field. Existing
`autoDetectContext` and `autoDetectFailureReason` values should remain
unchanged.

## Settings Search Decision

Settings search decision: none.

No settings UI, anchors, routes, or search definitions change.

## E2E Decision

E2E decision: no Playwright E2E.

The risk is service-layer routing and response-shape preservation. Existing and
updated Vitest coverage is the right layer. Browser entrypoints, UI behavior,
storage, and cross-entrypoint interactions should not change.

## Testing Strategy

Add focused Adapter tests:

- New API-family account completion:
  - access-token completion calls `getOrCreateAccessToken(...)`
  - cookie completion calls `fetchUserInfo(...)`
  - site status uses the effective requested auth mode
  - check-in uses `siteStatus.checkin_enabled` before support probing
  - missing username and missing access token throw classified completion errors
- Sub2API account completion:
  - uses detected access-token data
  - does not call user/token completion helpers
  - saves as access-token auth
  - permits empty username
  - disables check-in
  - preserves `sub2apiAuth`
- AIHubMix account completion:
  - uses detected access-token data when present
  - falls back to `getOrCreateAccessToken(...)` when needed
  - probes site status with cookie auth
  - requires username and access token

Update registry tests:

- New API-family adapters expose `accountCompletion`.
- Sub2API exposes `accountCompletion`.
- AIHubMix exposes `accountCompletion` but not unrelated capabilities.

Update completion workflow tests:

- Mock `getSiteAdapter(...)` instead of `getApiService(...)` for the central
  `completeAutoDetectedAccount(...)` tests.
- Keep coverage for valid and malformed fetch contexts.
- Keep coverage for missing capability classification.
- Keep the existing `tests/services/accountOperations.autoDetectAccount.test.ts`
  suite green as the public workflow regression contract.

## Validation Plan

Focused validation:

```powershell
pnpm vitest run tests/services/apiAdapters/registry.test.ts tests/services/apiAdapters/newApi/accountCompletion.test.ts tests/services/apiAdapters/sub2api/accountCompletion.test.ts tests/services/apiAdapters/aihubmix/accountCompletion.test.ts tests/services/accounts/autoDetectCompletion/completion.test.ts tests/services/accountOperations.autoDetectAccount.test.ts
```

Related validation:

```powershell
pnpm vitest related --run src/services/apiAdapters/contracts/accountCompletion.ts src/services/apiAdapters/registry.ts src/services/accounts/autoDetectCompletion/completion.ts
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

Run `validate:push` before publishing because this slice changes shared
TypeScript service contracts and account workflow routing.

## Rollout

1. Add the account-completion contract and registry shape tests.
2. Add New API-family, Sub2API, and AIHubMix Adapter tests.
3. Implement the three account-completion Adapters.
4. Update `completeAutoDetectedAccount(...)` to call
   `getSiteAdapter(siteType).accountCompletion`.
5. Keep `autoDetectAccount(...)` unchanged except for any import fallout caused
   by the orchestrator change.
6. Run focused and related tests.
7. Inspect the diff to confirm no post-save token, model pricing, Account
   Dialog UI, locale, telemetry, settings search, or E2E changes leaked in.
8. Commit the narrow architecture slice.

## Follow-Up, Not In Scope For This Spec

Recommended next slices after this one:

- `tokenProvisioning` Adapter capability for post-save token inventory, default
  token creation, Sub2API group selection, and AIHubMix one-time-secret
  handling.
- Model pricing inputs capability for Sub2API dashboard groups/rates/tokens and
  AIHubMix account-backed pricing.
- Site capability descriptor Module for backend family and support metadata,
  after the Adapter capabilities have enough real callers to justify it.

Do not grow `SiteAdapter` into a second flat `apiService` Interface. Each new
capability should correspond to a concrete caller benefit and should hide
backend-specific behavior behind a small Interface.
