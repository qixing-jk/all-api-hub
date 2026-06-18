# Sub2API Auth Session Design

Date: 2026-06-18

## Purpose

Move Sub2API dashboard JWT hydration, refresh, re-sync, and rotated-auth
persistence behind a Sub2API-specific auth session Interface instead of
carrying storage-capable callbacks on the generic `ApiServiceRequest` transport
shape.

The previous account-refresh adapter slice moved saved-account refresh toward
`SiteAdapter.accountRefresh`. During PR feedback resolution, the implementation
briefly used a global Sub2API account-storage bridge, then replaced it with an
explicit `ApiServiceRequest.accountAuthStore` callback pair. That avoided a
hidden singleton and fixed the immediate DNR bundle risk, but it is still a
transitional Seam: every account-scoped request can now carry a persistence
adapter even though only Sub2API auth recovery needs it.

## Current Context

`ApiTransportRequest` currently includes:

```ts
accountAuthStore?: {
  getAccountById: (id: string) => Promise<any>
  updateAccount: (
    id: string,
    updates: Record<string, any>,
    options: { userTimestampMode: "preserve" | "touch" },
  ) => Promise<boolean>
}
```

`ApiServiceRequest` is an alias of `ApiTransportRequest`, so that property is
visible to common API transport, New API-family code, AIHubMix, Sub2API, and
product Modules that only need a request DTO.

The remaining storage-dependent path is Sub2API key-management and auth
recovery:

- `src/services/apiService/sub2api/index.ts`
  - hydrates latest stored dashboard JWT and refresh-token metadata
  - serializes refresh/re-sync mutations
  - persists rotated access tokens and refresh tokens after key requests
  - retries key-management requests after refresh-token recovery or
    browser-session re-sync
- `src/services/accounts/utils/apiServiceRequest.ts`
  - builds display-account requests
  - currently injects `accountStorage` into every account-scoped request
- `src/services/apiAdapters/sub2api/keyManagement.ts`
  - delegates `fetchTokens`, `createToken`, and `resolveTokenKey` into
    `apiService/sub2api`

Saved-account refresh already has the better persistence shape:

- `accountStorage.refreshAccount(...)` builds an account refresh request.
- `SiteAdapter.accountRefresh.refreshAccount(...)` returns `authUpdate`.
- `accountStorage.refreshAccount(...)` persists `authUpdate` together with
  account data, preserving product merge rules and user timestamp semantics.

That refresh path should stay as-is for this slice.

## Problem

`accountAuthStore` makes the generic request Interface too wide and too
backend-aware.

Current friction:

1. Generic transport types now know about account storage, even though HTTP
   request execution does not need storage.
2. New API-family and AIHubMix account-scoped requests receive a persistence
   adapter they should never use.
3. Sub2API auth recovery owns a real protocol concern, but its persistence
   dependency is hidden inside the request DTO rather than declared as a
   Sub2API auth session dependency.
4. Tests must assert storage wiring on a generic request shape instead of
   exercising a smaller Sub2API-specific Interface.

Deletion test: if `ApiServiceRequest.accountAuthStore` is deleted, Sub2API
should still be able to hydrate latest stored auth and persist rotated auth, but
that complexity should not reappear as another generic request property or a
global account-storage import in `apiService/sub2api`. It should sit behind a
Sub2API auth session port supplied only by account/application callers that need
stored-session behavior.

## Goals

- Define a narrow Sub2API auth session Interface outside the generic transport
  request type.
- Move the current `accountAuthStore` responsibilities behind that Interface:
  - read latest stored access token, refresh token, token expiry, and user id
  - persist refreshed access token
  - persist rotated refresh token and expiry when returned by the backend
  - preserve user timestamp semantics on auth-only background writes
- Route Sub2API account-scoped key-management calls through an account-layer
  helper that supplies the session.
- Preserve current Sub2API behavior:
  - proactive refresh near expiry
  - refresh-token recovery after 401
  - browser-session JWT re-sync fallback
  - serialized mutation lock behavior
  - persisted rotated auth for key-management requests
  - `authUpdate` return behavior for saved-account refresh
- Remove `accountAuthStore` from `ApiTransportRequest` and
  `ApiServiceRequest`.
- Keep the DNR/E2E bundle fix: no global `accountStorage` import or
  registration inside `src/services/apiService/sub2api`.

## Non-Goals

- Do not rewrite Sub2API token refresh or dashboard re-sync protocol logic.
- Do not move `accountStorage.refreshAccount(...)` persistence behind this
  session port; saved-account refresh should continue to persist returned
  `authUpdate`.
- Do not migrate full Key Management CRUD, group selection UX, model pricing,
  site announcements, runtime model catalog, or account completion.
- Do not add user-facing copy, locale keys, telemetry fields, settings search
  entries, or Playwright E2E tests.
- Do not reintroduce `accountStorage` imports in `apiService/sub2api`.
- Do not add a generic storage port to `apiTransport`.
- Do not change Sub2API external backend behavior or saved account data shape.

## Approaches Considered

### Approach A: Keep `accountAuthStore` On `ApiServiceRequest`

This is the current transitional state. It is explicit and avoids a global
bridge, but the Interface is shallow: generic request callers must know about a
storage dependency that only one backend uses.

This should not be the final shape.

### Approach B: Product Orchestrator Owns All Sub2API Auth Recovery

Account/application code could perform hydration, token refresh, re-sync, and
persistence before calling Sub2API key-management helpers.

This would keep storage out of transport, but it would scatter Sub2API protocol
rules across product Modules. The Sub2API service Module already has the right
Locality for refresh/retry/error normalization, so moving the protocol up would
reduce Leverage.

### Approach C: Sub2API Auth Session Port Supplied By Account Callers

Define a Sub2API-specific session Interface, keep protocol behavior in
`apiService/sub2api`, and let account/application Modules provide an Adapter
that reads/writes `accountStorage`.

This is the recommended path. It gives Sub2API protocol code the dependency it
needs without widening generic transport types. It also keeps account storage
ownership in the account layer and avoids hidden singleton wiring.

## Design

### 1. Add A Sub2API Auth Session Contract

Create a Sub2API-owned contract near the Sub2API implementation, for example:

```text
src/services/apiService/sub2api/authSession.ts
```

Proposed Interface:

```ts
import type { AccountIdentity, Sub2ApiAuthConfig } from "~/types"

export type Sub2ApiStoredAuthSnapshot = {
  accessToken?: string
  userId?: AccountIdentity
  sub2apiAuth?: Sub2ApiAuthConfig
}

export type Sub2ApiPersistAuthUpdate = {
  accessToken: string
  refreshToken?: string
  tokenExpiresAt?: number
}

export type Sub2ApiAuthSession = {
  getLatestAuth(accountId: string): Promise<Sub2ApiStoredAuthSnapshot | null>
  persistAuthUpdate(
    accountId: string,
    update: Sub2ApiPersistAuthUpdate,
  ): Promise<boolean>
}
```

The Interface should not expose `SiteAccount`, `DisplaySiteData`, or
`accountStorage.updateAccount(...)` directly. Sub2API protocol code needs a
small auth snapshot and an auth-update write method, not the full account
storage implementation.

### 2. Define A Sub2API Session Request Shape

Keep `ApiServiceRequest` transport-only, and add a local extension type used by
Sub2API auth-aware helpers:

```ts
export type Sub2ApiAuthSessionRequest<TRequest extends ApiServiceRequest> =
  TRequest & {
    sub2apiAuthSession?: Sub2ApiAuthSession
  }
```

Only Sub2API auth-aware entry points should accept this extension. Generic
transport, common API service code, New API-family adapters, and AIHubMix should
continue accepting plain `ApiServiceRequest`.

### 3. Move Hydration To The Session Port

Replace the current `hydrateSub2ApiAuthRequest(...)` dependency on
`request.accountAuthStore` with `request.sub2apiAuthSession`.

Hydration rules should stay unchanged:

- start from request auth values
- if `accountId` and session are present, load latest stored auth
- prefer non-empty stored access token
- prefer stored refresh token and expiry when present
- fill missing user id from stored account identity
- return a hydrated request plus the session reference used for later
  persistence

Requests without a session remain valid. They can still use request-provided
access token and refresh token, but they cannot hydrate newer stored values or
persist rotated auth.

### 4. Move Persistence To The Session Port

Replace `persistSub2ApiAuthUpdate(..., accountAuthStore)` with session-based
persistence:

```ts
await session.persistAuthUpdate(request.accountId, authUpdate)
```

Persistence should remain best-effort for key-management requests:

- no `accountId`: skip
- no session: skip
- persistence returns `false`: warn
- persistence throws: warn with safe error details

The persisted update must preserve current semantics:

- always persist `account_info.access_token` equivalent when an access token is
  refreshed or re-synced
- persist `sub2apiAuth.refreshToken` and `tokenExpiresAt` only when a refresh
  token is present in the update
- preserve user timestamp mode in the account-layer Adapter

### 5. Add An Account-Layer Session Adapter

Create the storage-backed Adapter outside `apiService/sub2api`, for example:

```text
src/services/accounts/sub2apiAuthSession.ts
```

Responsibilities:

- import `accountStorage`
- implement `Sub2ApiAuthSession`
- read the latest stored account by id
- return only the auth snapshot needed by Sub2API
- update only auth-related fields
- call `accountStorage.updateAccount(..., { userTimestampMode: "preserve" })`

This keeps account persistence in the account layer and prevents DNR bundle
regressions caused by Sub2API protocol code importing account storage.

### 6. Supply The Session Only For Sub2API Account-Key Flows

Modify `src/services/accounts/utils/apiServiceRequest.ts` so
`buildApiRequestFromDisplayAccount(...)` no longer adds storage to the generic
request.

For account-scoped key-management helpers:

- build the plain request as before
- if `account.siteType === SITE_TYPES.SUB2API`, attach
  `sub2apiAuthSession: accountSub2ApiAuthSession` only for the call path that
  enters Sub2API key management
- do not attach a session for New API-family or AIHubMix requests

This helper remains the product-level entry point for:

- `fetchDisplayAccountTokens(...)`
- `resolveDisplayAccountTokenForSecret(...)`
- `createDisplayAccountApiContext(...)`

The exact implementation can be either:

1. return `request` plus an optional Sub2API session-aware request from
   `createDisplayAccountApiContext(...)`, or
2. keep `request` plain and use a small helper that decorates only Sub2API
   requests immediately before calling `adapter.keyManagement`.

Prefer the second option if it keeps the public helper Interface smaller.

### 7. Keep Account Refresh Persistence Separate

Do not force `accountStorage.refreshAccount(...)` through the session port.

Saved-account refresh should continue to:

- pass auth data in the account refresh request
- call `accountRefresh.refreshAccount(...)`
- receive `RefreshAccountResult.authUpdate`
- merge and persist auth updates in `accountStorage.refreshAccount(...)`

This distinction is important:

- key-management requests need best-effort auth persistence during protocol
  recovery
- saved-account refresh already has a product-owned persistence transaction
  with account data, health, balance history, and timestamp rules

### 8. Remove The Generic Transport Property

After all Sub2API auth recovery call sites use `sub2apiAuthSession`, remove
`accountAuthStore` from:

```text
src/services/apiTransport/type.ts
```

Then update tests and any type-only references that still mention
`ApiServiceRequest["accountAuthStore"]`.

## Error Handling

The refactor should preserve existing Sub2API error behavior.

- Missing access token with no recoverable session still maps to
  `messages:sub2api.loginRequired`.
- Invalid refresh-token contract still maps to
  `messages:sub2api.refreshTokenInvalid`.
- Browser-session re-sync absence still maps to login-required behavior.
- Business errors returned by Sub2API key/runtime endpoints remain business
  errors, not auth-session failures.
- Session read/write failures are non-fatal for key-management requests and
  should be logged with redacted messages.

Do not surface new user-facing copy for session persistence failures in this
slice.

## Telemetry Decision

Telemetry decision: none.

This is an internal architecture migration. It does not add a user action,
setting, result category, or visible product state. Existing key-management and
account-refresh telemetry should continue from their current owners.

## Settings Search Decision

Settings search decision: none.

No settings UI, route, anchor, or search definition changes.

## E2E Decision

E2E decision: no new Playwright E2E in this slice.

The behavioral risk is service-layer auth recovery and type/interface routing.
Focused Vitest coverage is the right validation layer. Existing DNR/cookie-auth
E2E coverage should remain the browser-level guard against bundle/runtime
regressions.

## Testing Strategy

Use TDD for the migration.

Update account request helper tests:

- non-Sub2API display-account requests do not expose `accountAuthStore`
- generic `createDisplayAccountApiContext(...)` returns a plain request
- Sub2API token inventory and secret-resolution calls receive a
  Sub2API-specific auth session
- New API-family and AIHubMix calls do not receive that session

Update Sub2API service tests:

- stored auth hydration uses `sub2apiAuthSession.getLatestAuth(...)`
- refresh-token recovery persists rotated access token, refresh token, and
  expiry via `sub2apiAuthSession.persistAuthUpdate(...)`
- browser-session re-sync persists the re-synced access token via the session
- requests without a session still work with request-provided auth and skip
  persistence
- mutation-lock behavior still avoids duplicate refreshes when concurrent
  callers share account id or auth identity

Update key-management tests:

- `fetchAccountTokens(...)`, `createApiToken(...)`, and
  `resolveApiTokenKey(...)` preserve current request retry/recovery behavior
  when passed a session-aware request
- tests no longer build fake `accountAuthStore` values on `ApiServiceRequest`

Update type/registry-related tests as needed:

- `ApiTransportRequest` has no storage-capable property
- Sub2API adapter delegation still passes request objects through unchanged
  except for account-layer session decoration before the adapter call

## Validation Plan

Focused validation:

```powershell
pnpm vitest run tests/services/accounts/apiServiceRequest.test.ts tests/services/apiService/sub2api/index.test.ts tests/services/apiService/sub2api/keyManagement.test.ts
```

Adapter/account regression validation:

```powershell
pnpm vitest run tests/services/apiAdapters/sub2api/accountRefresh.test.ts tests/services/apiAdapters/sub2api/keyManagement.test.ts tests/services/apiAdapters/registry.test.ts tests/services/accountStorage.test.ts
```

Type validation:

```powershell
pnpm compile
```

Commit gate:

```powershell
pnpm run validate:staged
```

If the implementation changes shared exported types, adapter contracts, or
cross-module request construction, run before pushing:

```powershell
pnpm run validate:push
```

If DNR bundle-risk code paths change or any Sub2API module starts importing
account-layer modules, run the DNR build/smoke checks from the handoff:

```powershell
$env:AAH_E2E_BUILD_VARIANT = "dnr-required"; pnpm run build:e2e
pnpm run e2e:dnr-required -- --grep "grants the Chromium cookie/DNR optional permissions needed for cookie auth"
```

## Rollout

1. Add the Sub2API auth session contract and failing tests for account-helper
   routing.
2. Add the account-layer storage-backed session Adapter.
3. Migrate Sub2API hydration and persistence internals from `accountAuthStore`
   to the session Interface.
4. Route display-account Sub2API key-management calls through the session
   Adapter while keeping non-Sub2API requests plain.
5. Update Sub2API service and key-management tests from fake
   `accountAuthStore` to fake `sub2apiAuthSession`.
6. Remove `accountAuthStore` from `ApiTransportRequest`.
7. Run focused tests and `pnpm compile`.
8. Run `pnpm run validate:staged`, inspect the final diff, and commit the
   implementation slice.
9. Run `pnpm run validate:push` before pushing or updating the PR branch.

## Follow-Up, Not In Scope For This Spec

Later slices may consider:

- a richer account-session helper if another backend needs stored auth
  recovery
- migrating additional Sub2API account workflows through smaller product
  helpers
- a lint/import guard that prevents protocol Modules from importing
  account-storage Modules directly
- a dedicated auth-session test fixture shared by Sub2API service tests

Do not generalize this into a cross-backend storage abstraction until a second
backend proves the same Seam. One Adapter is a hypothetical Seam; this slice is
valuable because it removes a known generic Interface leak while keeping the
Sub2API-specific behavior local.
