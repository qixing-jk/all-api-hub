# Account Auto-Detect Completion Adapter Design

Date: 2026-06-17

## Purpose

Make new account-site support easier by moving the post-detection account
completion logic out of the large `autoDetectAccount(...)` workflow and behind
a narrow Adapter Seam.

The previous `apiAdapters` slices stopped direct backend calls from leaking into
site announcements and runtime model catalog loading. The new lint guard now
prevents ordinary product code from importing backend-specific `apiService`
Implementations directly. The next useful slice is the part that matters most
for new site types: once the site type and user id are detected, the app must
complete the account form with a username, access token, site status, exchange
rate, and check-in defaults.

## Current Context

The current flow is split across three areas:

- `src/services/siteDetection/autoDetectService.ts` chooses a detection
  strategy and returns detected identity data:
  - current tab content script
  - background temporary browser context
  - direct cookie-auth API fallback
- `src/services/accounts/accountOperations.ts` owns
  `autoDetectAccount(url, authType)` and performs completion after detection:
  - tracks the cookie interceptor URL
  - calls `autoDetectSmart(...)`
  - decides effective auth type for Sub2API and AIHubMix
  - gets token/user info with `fetchUserInfo(...)`,
    `getOrCreateAccessToken(...)`, or detected access-token data
  - fetches site status
  - derives check-in support and default exchange rate
  - maps missing username/token and backend failures into stable UI responses
- `src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts`
  consumes the final `AccountValidationResponse`, fills the form, imports
  cookies when needed, saves the account, and runs post-save token prompts.

The completion part is the highest-friction path for adding new account-site
types because it currently mixes generic workflow orchestration with
site-specific auth and backend capability differences.

## Problem

`autoDetectAccount(...)` is too wide. It knows facts that should live at a
site Adapter Seam:

1. Sub2API and AIHubMix force `AccessToken` saved auth even when the UI selected
   cookie auth.
2. Sub2API and AIHubMix can use access-token data already returned by detection,
   while compatible sites call account-site API helpers.
3. Site status and check-in support are common-looking operations, but their
   request auth mode and fallback behavior vary by backend.
4. The same function owns error classification, response shaping, exchange-rate
   extraction, and check-in defaults, making it hard to add a new site type
   without editing the central workflow.

Deletion test: if the site-specific completion branches were deleted from
`autoDetectAccount(...)`, the complexity would reappear as new `siteType`
conditionals in the same function or in the Account Dialog. It should instead
move behind a small completion capability with product-level response shaping
remaining in the account workflow.

## Goals

- Introduce a narrow account auto-detect completion Module under
  `src/services/accounts/autoDetectCompletion/`.
- Move completion orchestration into that Module while preserving the
  `autoDetectAccount(...)` public Interface and returned
  `AccountValidationResponse` shape.
- Keep `autoDetectSmart(...)` and detection strategy selection unchanged.
- Keep account save, cookie import, and post-save token initialization
  unchanged.
- Make site-specific completion facts explicit:
  - effective saved auth type
  - detection request auth type
  - token/user-info completion path
  - site status request auth mode
  - whether check-in automation should be disabled
- Keep `getApiService(...)` usage inside the new completion Module for this
  migration slice. The new Module becomes the owner to migrate later into
  `apiAdapters` capabilities when the Interface is stable.
- Preserve existing analytics-safe failure reasons:
  - `TokenFetchFailed`
  - `SiteStatusFetchFailed`
  - `UsernameMissing`
  - `AccessTokenMissing`
  - `UserIdMissing`

## Non-Goals

- Do not change `detectSiteType`, `autoDetectSmart`, current-tab detection,
  background temp-context detection, or direct API detection.
- Do not move content-script localStorage parsing, Sub2API token refresh, or
  browser-context fallback logic in this slice.
- Do not change Account Dialog state, cookie import, duplicate confirmation,
  save/update behavior, post-save refresh, Sub2API token dialog, or AIHubMix
  one-time key prompt behavior.
- Do not add a new site type in this slice.
- Do not migrate full key management, post-save token provisioning,
  Model List pricing, redemption, or managed-site behavior.
- Do not add user-facing copy, locale keys, telemetry events, settings search
  entries, or Playwright E2E tests.
- Do not move `getApiService(...)` out of all account code at once.

## Design

### 1. Add A Completion Module

Create:

```text
src/services/accounts/autoDetectCompletion/
  completion.ts
  types.ts
```

`types.ts` owns the Interface for this slice. It should reuse existing account
and auto-detect types where possible instead of inventing a second response
model.

Proposed public types:

```ts
import type { AutoDetectAnalyticsContext } from "~/constants/autoDetect"
import type { AccountSiteType } from "~/constants/siteType"
import type {
  ApiServiceFetchContext,
  SiteStatusInfo,
} from "~/services/apiService/common/type"
import type { AuthTypeEnum, CheckInConfig, Sub2ApiAuthConfig } from "~/types"

export type DetectedAccountIdentity = {
  userId: string
  user?: any
  siteType: AccountSiteType
  accessToken?: string
  sub2apiAuth?: Sub2ApiAuthConfig
  fetchContext?: ApiServiceFetchContext
}

export type AutoDetectCompletionRequest = {
  url: string
  requestedAuthType: AuthTypeEnum
  detected: DetectedAccountIdentity
  autoDetectContext?: AutoDetectAnalyticsContext
}

export type AutoDetectCompletionData = {
  username: string
  siteName: string
  accessToken: string
  userId: string
  exchangeRate: number
  authType: AuthTypeEnum
  checkIn: CheckInConfig
  siteType: AccountSiteType
  sub2apiAuth?: Sub2ApiAuthConfig
  fetchContext?: ApiServiceFetchContext
  autoDetectContext?: AutoDetectAnalyticsContext
}
```

`completion.ts` exports:

```ts
export async function completeAutoDetectedAccount(
  request: AutoDetectCompletionRequest,
): Promise<AutoDetectCompletionData>
```

This function should own the current completion behavior that happens after
`autoDetectSmart(...)` succeeds and before `autoDetectAccount(...)` returns
success.

### 2. Keep Product Response Shaping In `accountOperations`

`autoDetectAccount(...)` should still own:

- blank URL validation
- cookie interceptor tracking
- calling `autoDetectSmart(...)`
- mapping failed detection result to `AccountValidationResponse`
- `UserIdMissing` response before completion
- catching completion errors and converting them to stable UI responses

The success branch should become:

```ts
const completed = await completeAutoDetectedAccount({
  url,
  requestedAuthType: authType,
  detected: detectResult.data,
  autoDetectContext,
})

return {
  success: true,
  message: t("accountDialog:messages.autoDetectSuccess"),
  data: completed,
}
```

The new Module returns successful completion data or throws a typed completion
error. It should not return `AccountValidationResponse`; keeping response
shaping in `accountOperations` preserves the existing public workflow Interface.

### 3. Move Completion Error Typing Into The New Module

Move `AutoDetectCompletionError` and completion failure helpers into the new
Module or export them from `types.ts`:

```ts
export class AutoDetectCompletionError extends Error {
  constructor(
    readonly reason: AutoDetectFailureReason,
    cause: unknown,
  )
}
```

`accountOperations.ts` should use exported helpers to preserve the current
failure behavior:

- `getAutoDetectCompletionFailureReason(error)`
- `getAutoDetectCompletionFailureMessage(reason, message)`

If moving all helpers would create noisy churn, move only the class and keep the
message mapping in `accountOperations` for the first slice. The implementation
plan should choose the smaller diff after checking current tests.

### 4. Site-Specific Completion Rules

The first implementation should preserve the current rule table exactly.

Sub2API:

- saved auth type is `AccessToken`
- username may be empty
- access token comes from `detected.accessToken`
- no `getOrCreateAccessToken(...)` call
- check-in detection and auto-check-in are disabled
- Sub2API refresh-token auth is passed through when present

AIHubMix:

- saved auth type is `AccessToken`
- completion uses access-token data returned by detection when available
- completion can fall back to `getOrCreateAccessToken(...)` only when no
  detected access token exists, matching current behavior
- site status request uses cookie auth during import
- missing username fails as `UsernameMissing`
- missing access token fails as `AccessTokenMissing`

Compatible sites:

- saved auth type follows the requested auth type
- cookie auth calls `fetchUserInfo(...)`
- access-token auth calls `getOrCreateAccessToken(...)`
- site status request uses the effective requested auth mode
- check-in support uses `siteStatus.checkin_enabled` when present, otherwise
  falls back to `fetchSupportCheckIn(...)`

All site types:

- `fetchContext` is forwarded to service requests when present
- site name uses the existing `getSiteName(...)` behavior
- exchange rate uses `extractDefaultExchangeRate(siteStatus)` with the existing
  default fallback
- check-in support probe failure logs and falls back to disabled detection

### 5. Existing Tests Become The Contract

`tests/services/accountOperations.autoDetectAccount.test.ts` already covers the
risky behavior:

- Sub2API access-token semantics
- AIHubMix detected token path and missing-token/username failures
- cookie auth and access-token auth completion for compatible sites
- current-tab and browser-context forwarding
- site status and check-in fallback behavior
- token fetch failure classification

The migration should add focused tests for `completeAutoDetectedAccount(...)`
and keep the existing `autoDetectAccount(...)` tests green. The new tests should
not duplicate the full matrix. They should prove the new Module's Interface:

- compatible access-token completion calls `getOrCreateAccessToken`,
  `fetchSiteStatus`, and derives exchange rate/check-in output
- Sub2API completion uses detected access-token data and disables check-in
- missing token/user info throws `AutoDetectCompletionError` with the right
  reason
- site status failure throws `AutoDetectCompletionError` with
  `SiteStatusFetchFailed`

No Playwright E2E is required. This is a service-layer refactor with existing
Vitest coverage for the Account Dialog consumer path.

## Error Handling

The new completion Module should throw typed completion errors for failing
backend calls:

- token/user-info call failure -> `TokenFetchFailed`
- site status call failure -> `SiteStatusFetchFailed`

It should return normal completion data for best-effort check-in support probe
failures, with check-in detection disabled, matching current behavior.

It should throw validation-style completion errors for:

- username missing when required
- access token missing when required

`autoDetectAccount(...)` remains responsible for converting those errors into
the current localized messages and `AutoDetectErrorType.INVALID_RESPONSE` where
applicable.

## Telemetry Decision

Telemetry decision: reuse existing.

This slice preserves the existing Account Management auto-detect action and
does not add a new user action, setting, funnel step, or visible behavior.
Existing `autoDetectFailureReason`, strategy, fetch-context, and result
analytics should continue to flow through the same `AccountValidationResponse`
data.

## Settings Search Decision

Settings search decision: none.

No settings UI, anchors, routes, or search definitions change.

## E2E Decision

E2E decision: no Playwright E2E.

The main risk is service-layer routing and response shape preservation. The
existing Vitest suite already covers browser-context metadata and Account Dialog
consumer behavior; the implementation should extend Vitest rather than adding a
browser scenario.

## Validation Plan

Focused validation:

```powershell
pnpm vitest run tests/services/accountOperations.autoDetectAccount.test.ts
```

Related validation:

```powershell
pnpm vitest related --run src/services/accounts/accountOperations.ts src/services/accounts/autoDetectCompletion/completion.ts
```

Lint/config validation:

```powershell
pnpm exec eslint src/services/accounts src/features/AccountManagement/components/AccountDialog
```

Commit gate:

```powershell
pnpm run validate:staged
```

Pre-push / PR gate:

```powershell
pnpm run validate:push
```

Run `validate:push` before publishing because this slice moves shared account
workflow logic and touches TypeScript module structure.

## Rollout

1. Add the completion Module and focused tests with `autoDetectAccount(...)`
   still unchanged.
2. Move the current completion behavior into `completeAutoDetectedAccount(...)`.
3. Update `autoDetectAccount(...)` to call the new Module after successful
   `autoDetectSmart(...)`.
4. Keep all existing Account Dialog behavior unchanged.
5. Run focused tests and related tests.
6. Inspect the diff to confirm no detection strategy, save workflow, post-save
   token initialization, locale, or UI changes leaked in.
7. Commit the narrow refactor.

## Follow-Up, Not In Scope For This Spec

Later slices can build on this Module:

- introduce a declarative site completion Adapter registry after the extracted
  Interface proves stable
- move post-save token initialization into a separate onboarding capability
- document the minimal new-site onboarding checklist
- migrate `getApiService(...)` calls inside completion to `apiAdapters`
  capability objects
- decide whether Sub2API and AIHubMix completion rules should become separate
  concrete Adapters

