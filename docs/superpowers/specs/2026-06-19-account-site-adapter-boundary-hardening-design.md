# Account Site Adapter Boundary Hardening Design

Date: 2026-06-19

## Purpose

Prepare the account-site layer for faster future site-type onboarding by
turning the recent adapter migration work into enforceable layering rules.

Recent slices moved account-site detection metadata, content-session
extraction, account bootstrap, account completion, account data, account
refresh, model pricing, and most key-management lifecycle operations behind
`getSiteAdapter(siteType)`. Those changes make the Adapter Seam real for
account-site behavior. The next step is not to add a new site type. It is to
close the remaining account-mainline escape hatches back to the legacy
`getApiService(...)` facade and add lint guardrails so new account-site work
defaults to adapters.

This spec defines a boundary-hardening slice for account-site product flows.
It intentionally keeps managed-site operations, model sync, redemption, and
backend implementation modules on their existing paths until those areas get
their own migration specs.

## Current Context

The current `SiteAdapter` Interface exposes account-site capabilities:

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

The current `KeyManagementCapability` Interface already covers most token
lifecycle behavior:

```ts
type KeyManagementCapability = {
  fetchTokens(request, options?): Promise<ApiToken[]>
  createToken(request, tokenData): Promise<CreateTokenResult>
  resolveTokenKey({ request, token }): Promise<string>
  deleteToken({ request, tokenId }): Promise<boolean | void>
  fetchUserGroups(request): Promise<Record<string, UserGroupInfo>>
  fetchAvailableModels(request): Promise<string[]>
}
```

One important token lifecycle operation is still missing from the Adapter
Interface:

- `updateApiToken(request, tokenId, tokenData)`

That gap keeps account UI code dependent on the legacy service facade.

The transitional helper
`src/services/accounts/utils/apiServiceRequest.ts#createDisplayAccountApiContext`
currently returns both the new adapter context and the legacy service:

```ts
{
  service: getApiService(account.siteType),
  adapter,
  keyManagement: adapter.keyManagement,
  request,
}
```

Most account flows now use `keyManagement`, but two account-mainline token
paths still use the returned `service`:

- `src/features/KeyManagement/components/AddTokenDialog/index.tsx`
  - edit mode calls `service.updateApiToken(...)`
- `src/features/ModelList/components/ModelKeyDialog/hooks/useModelKeyDialog.ts`
  - default-key creation calls `service.createApiToken(...)`

Existing ESLint guardrails already prevent product code from importing
backend-specific `apiService` implementations directly:

```js
const apiServiceBackendImplementationImportPattern = {
  regex:
    "^(?:~/services/apiService|(?:\\.\\./){1,4}apiService)/(?:aihubmix|anyrouter|axonHub|claudeCodeHub|doneHub|octopus|oneHub|sub2api|veloera|wong)$",
  message:
    "Do not import backend-specific apiService implementations from product code. Add or use an adapter/workflow module instead.",
}
```

That guard is useful, but it is not enough. Account product Modules can still
reach the broad legacy facade through `createDisplayAccountApiContext(...).service`
or by importing the root `~/services/apiService` module.

## Problem

The adapter migration has reached the point where the remaining risk is no
longer missing capability coverage alone. The risk is that future account-site
work can accidentally bypass the Adapter Seam because the old facade is still
available in account product code.

Current friction:

1. `createDisplayAccountApiContext(...)` is a shallow Interface because it
   exposes both the preferred adapter context and the legacy `service`
   implementation detail.
2. Token edit still requires `service.updateApiToken(...)` even though token
   create/list/delete/group/model behavior already sits behind
   `keyManagement`.
3. Model List default-key creation bypasses `keyManagement.createToken(...)`,
   so a new site type could work in Key Management but fail from the model
   key dialog.
4. Existing lint rules prevent direct backend-specific imports but do not
   enforce account-mainline dependency direction.
5. Legacy exceptions are implicit. Managed-site operations, model sync, and
   redemption still need `getApiService(...)`, but they are not named as
   temporary exceptions to the account-site adapter rule.

Deletion test: if `service` were removed from
`createDisplayAccountApiContext(...)`, account-mainline token workflows should
not recreate the legacy dependency elsewhere. They should either use
`SiteAdapter.keyManagement` or fail at compile time until the narrow Adapter
Interface is deepened.

## Goals

- Deepen `KeyManagementCapability` with token update support:
  - `updateToken({ request, tokenId, tokenData }): Promise<boolean | void>`
- Route account-mainline token create and edit flows through
  `getSiteAdapter(siteType).keyManagement`.
- Remove the legacy `service` property from
  `createDisplayAccountApiContext(...)`.
- Keep `createDisplayAccountApiContext(...)` as the account-scoped request
  builder and adapter resolver:
  - `adapter`
  - `keyManagement`
  - auth-session-decorated `request`
- Add ESLint guardrails that make account-mainline code depend on adapters
  rather than the root `apiService` facade.
- Name the temporary legacy exception zones explicitly so future work does not
  infer that new account-site features should extend them.
- Preserve current behavior for:
  - Add Token edit mode
  - Model List default-key creation
  - AIHubMix one-time key behavior
  - Sub2API auth-session request decoration
  - compatible New API-family update/create token behavior
  - token cache invalidation in existing backend implementations
- Add focused tests that make `keyManagement` the test surface for account
  token create/edit paths.

## Non-Goals

- Do not add a new account site type in this slice.
- Do not remove `getApiService(...)` globally.
- Do not migrate managed-site channel CRUD, managed-site providers,
  managed-site model sync, or hosted-site settings.
- Do not migrate `src/services/redemption/redeemService.ts`.
- Do not migrate pricing assembly, API credential profile model catalog
  estimation, or Sub2API estimated pricing.
- Do not redesign Account Dialog UI policy for Sub2API, AIHubMix, cookie auth,
  check-in controls, or one-time-key display.
- Do not move account-site domain types out of
  `src/services/apiService/common/type.ts` unless token update typing requires
  a narrow alias.
- Do not change user-facing copy, locale keys, telemetry schema, settings
  search entries, or Playwright E2E tests.

## Approaches Considered

### Approach A: Keep The Transitional Service Property

This keeps the implementation tiny because callers can continue to destructure
`service` when an adapter method is missing.

This should not be the next step. The helper becomes a permanent backdoor from
account product Modules to the legacy facade. New site-type work would keep
requiring contributors to know both the Adapter Interface and the legacy
service method map.

### Approach B: Only Add `updateToken` To `keyManagement`

This fixes Add Token edit mode but leaves the broader layering issue in place.
`ModelKeyDialog` could still create tokens through `service.createApiToken`, and
future product code could still reach for `service` from the transitional
helper.

This is useful but incomplete.

### Approach C: Deepen `keyManagement` And Harden The Account Boundary

Add the missing token update method, migrate the remaining account-mainline
token create/edit call sites, remove `service` from the display-account
context helper, and add lint guardrails for account-mainline imports.

This is the recommended path. It turns the recent migration into a stronger
Interface, improves locality for future site-type token behavior, and makes
the preferred path enforceable.

## Design

### 1. Deepen `KeyManagementCapability`

Update:

```text
src/services/apiAdapters/contracts/keyManagement.ts
```

Add:

```ts
export type UpdateTokenRequest = {
  request: ApiServiceRequest
  tokenId: number
  tokenData: CreateTokenRequest
}

export type KeyManagementCapability = {
  fetchTokens(...)
  createToken(...)
  updateToken(request: UpdateTokenRequest): Promise<boolean | void>
  resolveTokenKey(...)
  deleteToken(...)
  fetchUserGroups(...)
  fetchAvailableModels(...)
}
```

`CreateTokenRequest` can remain the token form payload type for both create
and update in this slice because the existing legacy implementations already
use that shape for `updateApiToken(...)`.

Adapter implementations should map the new method to the existing backend
behavior:

- `src/services/apiAdapters/newApi/keyManagement.ts`
  - `getApiService(siteType).updateApiToken(request, tokenId, tokenData)`
- `src/services/apiAdapters/sub2api/keyManagement.ts`
  - `updateApiToken(request, tokenId, tokenData)`
- `src/services/apiAdapters/aihubmix/keyManagement.ts`
  - `updateApiToken(request, tokenId, tokenData)`

Do not add product-level branching for site-specific token update quirks. If a
site needs different update behavior, it belongs in that site's
`keyManagement` Adapter.

### 2. Remove Legacy `service` From Display Account Context

Update:

```text
src/services/accounts/utils/apiServiceRequest.ts
```

The helper should stop importing `getApiService` and return only the adapter
context used by account-mainline flows:

```ts
return {
  adapter,
  keyManagement: adapter.keyManagement,
  request: withDisplayAccountAuthSession(
    account,
    buildApiRequestFromDisplayAccount(account),
  ),
}
```

Keep `buildApiRequestFromDisplayAccount(...)` and
`withDisplayAccountAuthSession(...)` behavior unchanged. Sub2API auth-session
decoration is part of why this helper should stay as the display-account
request builder.

### 3. Migrate Account-Mainline Token Call Sites

Migrate Add Token edit mode:

```text
src/features/KeyManagement/components/AddTokenDialog/index.tsx
```

Current behavior:

```ts
await service.updateApiToken(request, editingToken.id, tokenData)
```

Target behavior:

```ts
await requireDisplayAccountKeyManagement(
  currentAccount,
  keyManagement,
).updateToken({
  request,
  tokenId: editingToken.id,
  tokenData,
})
```

Preserve the current edit-mode success toast, analytics result handling, and
error handling. The migration should only change the backend Seam used by the
operation.

Migrate Model List default-key creation:

```text
src/features/ModelList/components/ModelKeyDialog/hooks/useModelKeyDialog.ts
```

Current behavior:

```ts
const created = await service.createApiToken(request, tokenRequest)
```

Target behavior:

```ts
const created = await requireDisplayAccountKeyManagement(
  account,
  keyManagement,
).createToken(request, tokenRequest)
```

Preserve:

- group-required validation
- `canCreateToken` gating
- `generateDefaultTokenRequest()` output
- token refresh after create
- error logging payload
- user-facing fallback error message

### 4. Explicit Legacy Exception Zones

The lint rule should not pretend the whole repository is ready to stop using
`getApiService(...)`.

Allowed exception zones for this slice:

- `src/services/apiService/**`
  - backend implementation and legacy facade owner
- `src/services/apiAdapters/**`
  - adapters may wrap legacy backend functions until backend implementations
    are decomposed further
- `src/services/apiCredentialProfiles/**`
  - model catalog and estimated pricing still have their own migration path
- `src/services/checkin/autoCheckin/**`
  - background check-in orchestration is outside this account-mainline slice
- `src/services/managedSites/**`
  - managed-site channel operations use a separate provider/service Seam
- `src/services/models/modelSync/**`
  - managed-site model sync remains a managed-site concern
- `src/features/BasicSettings/components/tabs/ManagedSite/**`
  - hosted-site settings remain tied to managed-site service behavior
- `src/services/redemption/**`
  - redemption will need its own Adapter capability or workflow owner spec

These exceptions are deliberately named. They are not endorsement for new
account-site product code to keep using `apiService`.

### 5. Add Account-Mainline Lint Guardrails

Update:

```text
eslint.config.js
```

Reuse the existing backend-specific `apiService` import guard. Account-mainline
paths are not in that guard's current `ignores`, so direct imports such as
`~/services/apiService/sub2api` and `~/services/apiService/aihubmix` are already
blocked there.

Add only the missing guard for the root account-site service facade in
account-mainline product areas. Do not reject shared account-site contract
modules such as `~/services/apiService/common/type`,
`~/services/apiService/common/apiKey`, or `~/services/apiService/common/errors`
in this slice; those are still shared domain/transport contracts used by the
adapter path.

Suggested scope:

```js
{
  files: [
    "src/features/AccountManagement/**/*.{js,cjs,mjs,jsx,ts,tsx}",
    "src/features/KeyManagement/**/*.{js,cjs,mjs,jsx,ts,tsx}",
    "src/features/ModelList/**/*.{js,cjs,mjs,jsx,ts,tsx}",
    "src/components/dialogs/VerifyApiDialog/**/*.{js,cjs,mjs,jsx,ts,tsx}",
    "src/components/dialogs/VerifyCliSupportDialog/**/*.{js,cjs,mjs,jsx,ts,tsx}",
    "src/components/KiloCodeExportDialog.{js,cjs,mjs,jsx,ts,tsx}",
    "src/services/accounts/**/*.{js,cjs,mjs,jsx,ts,tsx}",
  ],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: [
              "~/services/apiService",
              "../apiService",
              "../../apiService",
              "../../../apiService",
            ],
            message:
              "Account-site product flows must use ~/services/apiAdapters or account workflow helpers instead of the legacy apiService facade.",
          },
        ],
      },
    ],
  },
}
```

The exact glob list can be adjusted during implementation if ESLint flat-config
matching needs narrower entries. The rule should be proven by linting the
affected files and by confirming no account-mainline imports from the root
facade remain. The existing backend-specific guard should continue proving that
account-mainline code cannot import backend implementation modules directly.
Imports from `apiService/common/**` remain allowed until shared account-site
DTOs and normalizers get a separate ownership cleanup.

This import guard is preferable to an AST rule for
`createDisplayAccountApiContext(...).service` because removing `service` from
the helper makes that escape hatch a TypeScript error. If implementation finds
another service-returning account helper, add the narrowest lint rule or helper
change needed to close that specific path.

### 6. Tests

Update existing focused tests rather than adding broad E2E coverage.

Recommended test surfaces:

- `tests/services/apiAdapters/keyManagement.test.ts`
  - `newApi`, Sub2API, and AIHubMix adapters expose `updateToken(...)`
  - each adapter delegates to the expected backend update function
- `tests/services/accounts/apiServiceRequest.test.ts`
  - `createDisplayAccountApiContext(...)` returns `adapter`,
    `keyManagement`, and auth-session-decorated `request`
  - it no longer exposes `service`
- Add Token dialog tests under `tests/entrypoints/options/pages/KeyManagement/`
  - edit mode calls `keyManagement.updateToken(...)`
  - create mode still calls `keyManagement.createToken(...)`
- Model Key dialog tests under `tests/entrypoints/options/pages/ModelList/`
  - default-key creation calls `keyManagement.createToken(...)`
  - missing `keyManagement` still produces the existing unsupported behavior

Tests should mock `getSiteAdapter(...)` and the `keyManagement` Interface
instead of mocking `getApiService(...)` for these account-mainline paths.

## Migration Completeness Checks

Run these cleanup checks during implementation:

```powershell
rg "getApiService\(" src/features src/components src/services/accounts
rg "service\.(createApiToken|updateApiToken|deleteApiToken|fetchAccountTokens|fetchUserGroups|fetchAccountAvailableModels)" src/features src/components src/services/accounts
rg "from \"~/services/apiService\"|from \"~/services/apiService/(aihubmix|anyrouter|axonHub|claudeCodeHub|doneHub|octopus|oneHub|sub2api|veloera|wong)" src/features/AccountManagement src/features/KeyManagement src/features/ModelList src/components src/services/accounts
rg "createDisplayAccountApiContext\(.*service|service.*createDisplayAccountApiContext" src/features src/components src/services/accounts
```

Expected result:

- No account-mainline hits for `getApiService(...)`.
- No account-mainline hits for token lifecycle calls through a `service`
  object.
- No account-mainline imports from the root `~/services/apiService` facade or
  backend-specific implementation modules.
- Managed-site, model sync, redemption, and adapter/backend implementation
  hits may remain in their explicitly allowed zones.

## Validation Plan

Focused validation:

```powershell
pnpm exec vitest related --run src/services/apiAdapters/contracts/keyManagement.ts src/services/accounts/utils/apiServiceRequest.ts src/features/KeyManagement/components/AddTokenDialog/index.tsx src/features/ModelList/components/ModelKeyDialog/hooks/useModelKeyDialog.ts
```

Boundary validation:

```powershell
pnpm exec eslint eslint.config.js src/services/accounts src/features/KeyManagement src/features/ModelList src/features/AccountManagement src/components/dialogs/VerifyApiDialog src/components/dialogs/VerifyCliSupportDialog src/components/KiloCodeExportDialog.tsx
```

Type validation:

```powershell
pnpm compile
```

Commit gate:

```powershell
pnpm run validate:staged
```

Run `pnpm run validate:push` before pushing or opening a PR if the
implementation changes export wiring, lint config behavior, or shared runtime
contracts in a way that could affect unused exports or compile-wide type
relationships.

## E2E And Telemetry Decisions

E2E decision: no Playwright E2E should be added for this slice. The behavior
risk is adapter routing, helper shape, TypeScript coverage, and ESLint
enforcement. Focused Vitest, TypeScript, and ESLint checks are the right
coverage layer.

Telemetry decision: none. This is an internal architecture hardening refactor.
It does not add a new user-visible action, setting, async background flow,
confirmation path, or result event.

## Risks And Mitigations

Risk: `updateToken(...)` may hide important per-site update semantics behind a
generic-looking method.

Mitigation: keep the Interface narrow to the existing token form payload and
put site-specific translation in each Adapter. Do not add product-level
site-type branches for update behavior.

Risk: the new ESLint guard may catch legitimate legacy areas.

Mitigation: scope the rule to account-mainline product areas first and keep the
known legacy exception zones explicit. If a caught import is truly managed-site
or redemption behavior, move it out of the guarded glob or add a narrow
exception with a comment that names the future migration owner.

Risk: removing `service` from `createDisplayAccountApiContext(...)` may reveal
additional unplanned account product dependencies.

Mitigation: treat each compile error as a boundary decision. If the behavior is
account-token lifecycle, deepen or use `keyManagement`. If it belongs to
redemption, managed-site, or another non-goal area, do not migrate it in this
slice; route through its current owner outside the guarded account-mainline
surface.

Risk: tests may continue to mock the old facade even after production code is
migrated.

Mitigation: update account-mainline tests to mock `getSiteAdapter(...)` and
`KeyManagementCapability`; use `rg` cleanup checks for stale
`getApiService(...)` mocks in the migrated files.

## Implementation Notes

- This slice should be one reviewable refactor PR, not multiple small
  capability PRs.
- The preferred implementation order is:
  1. Add failing tests for `updateToken` and no-service display context.
  2. Add `updateToken` to the Interface and Adapters.
  3. Migrate Add Token edit mode and Model Key default creation.
  4. Remove `service` from `createDisplayAccountApiContext(...)`.
  5. Add the account-mainline lint guard.
  6. Run cleanup `rg` checks, focused tests, ESLint, compile, and staged
     validation.
- Do not broaden the slice into managed-site or redemption migration even if
  `rg getApiService(...)` still reports those files.
