# Default Token Lifecycle Design

Date: 2026-06-21

## Purpose

Make the next account site type faster to add by concentrating default-token
lifecycle orchestration in one product-side Module.

Recent slices added `SiteAdapter.tokenProvisioning` and migrated quick-create
consumers to the generic default-token decision Interface. That gives each
Adapter a place to describe site-specific policy:

- whether an existing inventory token is usable
- whether default-token creation is allowed
- whether current user groups are required
- whether a created token secret can be used directly or needs inventory
  recovery
- whether repair should skip the site

The remaining friction is the lifecycle around that policy. Multiple account
workflow Modules still know how to fetch token inventory, remember existing
token ids, resolve policy, optionally fetch user groups, create a default
token, classify the create result, refetch inventory, select the new token, and
map policy failures into workflow results.

This spec adds a `defaultTokenLifecycle` Module under `src/services/accounts/`
to own that repeated orchestration. It does not add another Adapter method that
runs product workflows.

## Current Context

`src/services/apiAdapters/contracts/siteAdapter.ts` already exposes:

```ts
tokenProvisioning?: TokenProvisioningCapability
```

`src/services/apiAdapters/contracts/tokenProvisioning.ts` already defines:

- `TOKEN_PROVISIONING_WORKFLOWS.BackgroundAutoProvision`
- `TOKEN_PROVISIONING_WORKFLOWS.SharedEnsure`
- `TOKEN_PROVISIONING_WORKFLOWS.QuickCreateSelection`
- `TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation`
- `TOKEN_PROVISIONING_WORKFLOWS.Repair`
- `DEFAULT_TOKEN_CREATION_DECISION_KINDS`
- `CREATED_TOKEN_SECRET_DECISION_KINDS`
- `TOKEN_PROVISIONING_BLOCK_REASONS`

The current Adapter policy implementations exist for New API-family sites,
Sub2API, and AIHubMix.

The product lifecycle is still spread across:

- `src/services/accounts/accountOperations.ts`
  - `resolveDefaultTokenQuickCreateResolution(...)`
  - `ensureAccountApiToken(...)`
  - `autoProvisionKeyOnAccountAdd(...)`
- `src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts`
  - `ensureDefaultApiTokenForAccount(...)`
  - `generateDefaultTokenRequest()`
- `src/services/accounts/accountPostSaveWorkflow/ensureAccountToken.ts`
  - inventory inspection
  - created-token classification
  - inventory refetch and id-diff recovery
  - post-save result mapping
- `src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts`
  - empty-group/no-token fallback creation
  - repair create-result classification
- `src/services/accounts/utils/tokenProvisioning.ts`
  - second-pass default-token decision after fetching user groups

One site-type branch also remains outside policy:

```ts
if (
  account.site_type === SITE_TYPES.SUB2API ||
  account.site_type === SITE_TYPES.AIHUBMIX
) {
  return
}
```

That branch in `autoProvisionKeyOnAccountAdd(...)` preserves current behavior,
but it is exactly the kind of caller-side site-type edit point a new account
site type should not need.

## Problem

`tokenProvisioning` is now a real Adapter policy Seam, but the product
lifecycle Seam is still shallow.

Current friction:

1. Workflow Modules call policy methods directly and each reimplements part of
   token lifecycle orchestration.
2. Inventory normalization and new-token recovery by id diff currently live in
   the post-save workflow, even though shared ensure and repair need the same
   create/classify/refetch pattern.
3. `resolveDefaultTokenCreationWithUserGroups(...)` is generic, but it sits as
   an isolated helper rather than being part of a lifecycle Module with the
   surrounding create/recover behavior.
4. Background auto-provision still skips Sub2API and AIHubMix with raw
   site-type checks instead of asking the default-token lifecycle whether the
   workflow is policy-blocked.
5. Workflow-specific error mapping is reasonable, but the same policy-result
   plumbing is duplicated before each workflow reaches its own result type.
6. Tests prove each workflow branch, but not a shared lifecycle Interface that
   future account site types can reuse.

Deletion test: after this slice, deleting direct calls to
`resolveDefaultTokenCreation(...)`, `classifyCreatedToken(...)`, and
`isInventoryTokenUsable(...)` from account workflow Modules should not recreate
the logic elsewhere. The account workflows should call
`defaultTokenLifecycle` helpers and keep only workflow-specific result,
message, toast, and progress behavior.

## Goals

- Add a product-side `defaultTokenLifecycle` Module.
- Keep backend token CRUD in `SiteAdapter.keyManagement`.
- Keep site-specific token policy in `SiteAdapter.tokenProvisioning`.
- Keep UI state, toasts, progress, telemetry, storage writes, and workflow
  result shapes in the current product workflow owners.
- Centralize default-token lifecycle mechanics:
  - display-account inventory request handling
  - saved-account create request handling
  - token inventory normalization
  - existing-token usability inspection
  - existing token id capture
  - policy decision resolution
  - lazy user-group fetch when policy asks for it
  - default-token creation
  - created-token classification
  - inventory refetch and single-new-token selection
  - stable lifecycle result kinds and block reason propagation
- Preserve current behavior for New API-family sites, Sub2API, and AIHubMix.
- Remove raw Sub2API and AIHubMix skips from
  `autoProvisionKeyOnAccountAdd(...)`; preserve the same effective silent skip
  by mapping lifecycle policy-blocked results in that caller.
- Keep `resolveSub2ApiQuickCreateResolution(...)` as a compatibility wrapper
  only while existing tests or external callers still need it.
- Add focused tests for lifecycle behavior and update existing workflow tests
  to assert delegation to the lifecycle Module.

## Non-Goals

- Do not add a new site type in this slice.
- Do not redesign `TokenProvisioningCapability`.
- Do not redesign `KeyManagementCapability`.
- Do not move token list/create/update/delete/reveal operations out of
  `keyManagement`.
- Do not move product workflows into Adapters.
- Do not change the default token payload produced by
  `generateDefaultTokenRequest()`.
- Do not change Account Dialog site policy or post-save UI naming.
- Do not change user-facing copy or locale keys.
- Do not add telemetry fields.
- Do not add settings search entries.
- Do not add Playwright E2E coverage by default.
- Do not migrate explicit manual token creation in `AddTokenDialog` or
  `ModelKeyDialog`; those are not default-token lifecycle flows.
- Do not generalize the AIHubMix one-time-key UI helper in
  `src/features/KeyManagement/utils.ts` unless implementation discovers that a
  default-token caller directly depends on it. Manual created-token display is
  a follow-up policy surface.

## Approaches Considered

### Approach A: Keep Lifecycle Logic In Current Workflows

This avoids a refactor, but it leaves the next site type dependent on edits in
multiple account workflow Modules whenever its default-token lifecycle differs
from the New API-family default.

This should not be the next step. The Adapter policy Seam already exists; the
remaining Leverage is in removing duplicated product orchestration.

### Approach B: Move Full Lifecycle Into `SiteAdapter.tokenProvisioning`

Adapters could expose methods such as `ensureDefaultToken(...)` or
`ensurePostSaveToken(...)`.

This is the wrong ownership boundary. Adapters should describe backend
capability and site-specific policy. They should not own product concerns such
as display data fallback, storage records, toast behavior, post-save result
kinds, repair progress, or dialog recovery paths.

### Approach C: Add `defaultTokenLifecycle` Under `src/services/accounts`

Create an account product Module that orchestrates the lifecycle using
`keyManagement` and `tokenProvisioning`, then returns stable lifecycle results
for each workflow owner to map.

This is the recommended path. It deepens the product-side Module boundary while
preserving Adapter Locality: backend operations stay in `keyManagement`,
site-specific policy stays in `tokenProvisioning`, and product workflow
Modules keep their UX and persistence responsibilities.

## Design

### 1. Add A Default-Token Lifecycle Module

Create:

```text
src/services/accounts/defaultTokenLifecycle/
  contracts.ts
  requests.ts
  lifecycle.ts
  index.ts
```

The exact file split can be adjusted during implementation, but the Module
should expose one small public Interface and keep low-level helpers local unless
tests need them.

Recommended public exports:

```ts
export const DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS = {
  Ready: "ready",
  Created: "created",
  SelectionRequired: "selection_required",
  Blocked: "blocked",
} as const
```

```ts
export type DefaultTokenLifecycleResult =
  | {
      kind: typeof DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Ready
      token: ApiToken
      created: false
      existingTokenIds: number[]
    }
  | {
      kind: typeof DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Created
      token: ApiToken
      created: true
      oneTimeSecret: boolean
      existingTokenIds: number[]
    }
  | {
      kind: typeof DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.SelectionRequired
      allowedGroups: string[]
      existingTokenIds: number[]
    }
  | {
      kind: typeof DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Blocked
      reason: DefaultTokenLifecycleBlockReason
      existingTokenIds: number[]
      cause?: unknown
    }
```

`DefaultTokenLifecycleBlockReason` should include the existing
`TokenProvisioningBlockReason` values plus lifecycle-owned failures such as:

- `missing_user_groups`
- `create_token_failed`
- `token_not_found`
- `ambiguous_created_token`

Do not use translated messages as lifecycle reasons.

Recommended high-level entry point:

```ts
export async function ensureDefaultTokenLifecycle(params: {
  workflow: Exclude<
    TokenProvisioningWorkflow,
    typeof TOKEN_PROVISIONING_WORKFLOWS.QuickCreateSelection
  >
  account: SiteAccount
  displaySiteData: DisplaySiteData
  defaultTokenData?: CreateTokenRequest
  explicitGroup?: string
  inspectInventory?: boolean
}): Promise<DefaultTokenLifecycleResult>
```

Default behavior:

- `inspectInventory` defaults to `true`
- `defaultTokenData` defaults to `generateDefaultTokenRequest()`
- existing tokens are inspected through
  `tokenProvisioning.isInventoryTokenUsable(...)`
- `Ready` is returned only for an existing inventory token that the policy
  marks usable for the requested workflow
- creation uses `tokenProvisioning.resolveDefaultTokenCreation(...)`
- user groups are fetched only when policy returns `NeedsUserGroups`
- create results are classified through
  `tokenProvisioning.classifyCreatedToken(...)`
- inventory is refetched only when classification returns
  `NeedsInventoryRefetch`
- refetch recovery succeeds only when exactly one new valid token id appears

### 2. Keep Quick-Create Decision-Only

Quick-create resolution should not call `ensureDefaultTokenLifecycle(...)`
because it must not create a token before the consumer knows whether to open a
group-selection dialog.

Move the current `resolveDefaultTokenCreationWithUserGroups(...)` helper into
the lifecycle Module and expose a decision-only helper:

```ts
export async function resolveDefaultTokenLifecycleDecision(params: {
  workflow: typeof TOKEN_PROVISIONING_WORKFLOWS.QuickCreateSelection
  displaySiteData: DisplaySiteData
  defaultTokenData?: CreateTokenRequest
  explicitGroup?: string
}): Promise<DefaultTokenCreationDecision>
```

`accountOperations.resolveDefaultTokenQuickCreateResolution(...)` should call
this helper and keep mapping to the existing
`DefaultTokenQuickCreateResolution` type.

### 3. Normalize Inventory In One Place

Move these concepts out of
`accountPostSaveWorkflow/ensureAccountToken.ts`:

- `sanitizeApiTokens(...)`
- `getTokenIds(...)`
- `selectSingleNewApiTokenByIdDiff(...)`
- inventory state construction

Recommended lifecycle helper:

```ts
export type DefaultTokenInventoryState =
  | {
      kind: "missing"
      existingTokenIds: number[]
    }
  | {
      kind: "present"
      token: ApiToken
      existingTokenIds: number[]
      hasUsableSecret: boolean
    }
```

```ts
export async function inspectDefaultTokenInventory(params: {
  workflow: TokenProvisioningWorkflow
  displaySiteData: DisplaySiteData
}): Promise<DefaultTokenInventoryState>
```

The helper should use `createDisplayAccountApiContext(displaySiteData)` and the
Adapter capabilities from that context. It should not know about post-save
result kinds.

### 4. Centralize Create And Recovery

Add a lower-level lifecycle helper for callers that already inspected
inventory or have repair-specific request rules:

```ts
export async function createDefaultTokenFromDecision(params: {
  workflow: TokenProvisioningWorkflow
  keyManagement: KeyManagementCapability
  tokenProvisioning: TokenProvisioningCapability
  createRequest: ApiServiceRequest
  inventoryRequest: ApiServiceRequest
  decision: Extract<
    DefaultTokenCreationDecision,
    { kind: typeof DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create }
  >
  existingTokenIds: number[]
}): Promise<
  | {
      kind: typeof DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Created
      token: ApiToken
      oneTimeSecret: boolean
    }
  | {
      kind: typeof DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Blocked
      reason: DefaultTokenLifecycleBlockReason
      cause?: unknown
    }
>
```

This helper should:

1. call `keyManagement.createToken(createRequest, decision.tokenData)`
2. call `tokenProvisioning.classifyCreatedToken(...)`
3. return the created token immediately when classification is `Usable`
4. return `create_token_failed` when classification is `Failed`
5. return `created_token_secret_unavailable` when classification is
   `Unavailable`
6. refetch `keyManagement.fetchTokens(inventoryRequest)` only when
   classification is `NeedsInventoryRefetch`
7. select exactly one new token by id diff
8. return `token_not_found` or `ambiguous_created_token` when refetch recovery
   cannot prove which token was created

This is the highest Leverage part of the slice because it removes the most
error-prone duplication without changing Adapter policy.

### 5. Preserve Request Ownership

Add request helpers only where they preserve current behavior exactly:

```ts
export function createStoredAccountTokenRequest(account: SiteAccount):
  ApiServiceRequest
```

Use this for default-token creation from saved accounts in:

- `ensureDefaultApiTokenForAccount(...)`
- `ensureAccountApiToken(...)`
- `ensureAccountTokenForPostSaveWorkflow(...)`

Keep repair-specific fallback request handling in
`groupCoverage.ts` unless implementation can move it without changing
behavior. Repair currently derives request data from both stored account and
display data. Do not hide that compatibility rule behind a new helper until
focused tests lock it down.

### 6. Route Background Default Token Ensure Through Lifecycle

Modify:

```text
src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts
```

`ensureDefaultApiTokenForAccount(...)` should call:

```ts
ensureDefaultTokenLifecycle({
  workflow: TOKEN_PROVISIONING_WORKFLOWS.BackgroundAutoProvision,
  account,
  displaySiteData,
})
```

Mapping must preserve existing behavior:

- `Ready` returns `{ token, created: false }`
- `Created` returns `{ token, created: true }`
- `Blocked` with `one_time_secret_required` throws the existing AIHubMix
  one-time-key message
- `Blocked` with group-related reasons throws the existing token-provisioning
  group message
- `Blocked` with `create_token_failed` throws
  `TOKEN_PROVISIONING_ERRORS.CreateTokenFailed`
- `Blocked` with `token_not_found` or `ambiguous_created_token` throws
  `TOKEN_PROVISIONING_ERRORS.TokenNotFound`
- `SelectionRequired` is not expected for background workflow and should map to
  the existing group-required failure

`generateDefaultTokenRequest()` may remain in this file or move to the
lifecycle Module only if imports stay acyclic and existing tests still prove
the payload is unchanged. Do not modify the payload.

### 7. Route Shared Token Ensure Through Lifecycle

Modify:

```text
src/services/accounts/accountOperations.ts
```

`ensureAccountApiToken(...)` should call:

```ts
ensureDefaultTokenLifecycle({
  workflow: TOKEN_PROVISIONING_WORKFLOWS.SharedEnsure,
  account,
  displaySiteData,
  defaultTokenData: options.defaultTokenData,
  explicitGroup: options.explicitGroup ?? options.sub2apiGroup,
})
```

Mapping must preserve existing behavior:

- `Ready` or `Created` returns the token
- `Blocked` with `one_time_secret_required` or
  `created_token_secret_unavailable` throws the existing AIHubMix one-time-key
  message
- `Blocked` with `create_token_failed` throws the existing create-token-failed
  message
- group-related `Blocked` results throw the existing token-provisioning group
  message
- missing token still throws the existing token-not-found message

`sub2apiGroup` remains a temporary compatibility alias. New call sites should
continue to pass `defaultTokenData` from
`resolveDefaultTokenQuickCreateResolution(...)`.

### 8. Route Post-Save Token Ensure Through Lifecycle

Modify:

```text
src/services/accounts/accountPostSaveWorkflow/ensureAccountToken.ts
```

Replace local inventory inspection and create/refetch helpers with lifecycle
calls.

`ensureAccountTokenForPostSaveWorkflow(...)` should call:

```ts
ensureDefaultTokenLifecycle({
  workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
  account,
  displaySiteData,
})
```

Mapping must preserve existing result shapes:

- `Ready` maps to `ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Ready`
- `Created` maps to `ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Created`
- `SelectionRequired` maps to
  `ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Sub2ApiSelectionRequired`
- `Blocked` with `one_time_secret_required` or
  `created_token_secret_unavailable` maps to
  `ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES.TokenSecretUnavailable`
- `Blocked` with `available_group_required` maps to the existing available
  group message
- all other `Blocked` results map to the existing create-token-failed result

Keep the Sub2API-named post-save result kind in this slice. Renaming that UI
contract belongs to a separate Account Dialog policy cleanup.

### 9. Route Repair Fallback Creation Through Lifecycle

Modify:

```text
src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts
```

The per-group repair loop can stay local because it creates one token for each
available group and reports per-group failures. That is not the same operation
as default-token lifecycle.

Only the empty-group/no-token fallback should use lifecycle helpers:

- ask policy for `TOKEN_PROVISIONING_WORKFLOWS.Repair`
- use `createDefaultTokenFromDecision(...)` for create/classify/refetch
- preserve the current return shape
- preserve current errors for Sub2API and AIHubMix blocked policies

Do not change invalid-token detection or deletion.

`repair.ts#getSkipReason(...)` already asks
`tokenProvisioning.getRepairPolicy()`. Keep none-auth skip in repair because it
depends on stored account auth state, not site provisioning policy.

### 10. Remove Raw Auto-Provision Site-Type Skips

Modify:

```text
src/services/accounts/accountOperations.ts
```

Remove the explicit Sub2API and AIHubMix skip from
`autoProvisionKeyOnAccountAdd(...)`.

Call `ensureDefaultApiTokenForAccount(...)` and map policy-blocked lifecycle
failures to the same effective no-op behavior:

- `group_required`
- `available_group_required`
- `group_selection_required`
- `one_time_secret_required`

Those failures should not show a new error toast in the background
auto-provision flow because the current behavior silently skips those sites.

Other failures, such as invalid display data, create failure, or storage/API
failure, should keep the current failed-toast behavior.

This removes a future site-type edit point without changing user-visible
behavior.

## Error Handling

The lifecycle Module should return stable reason codes. Workflow owners remain
responsible for mapping those codes to existing messages and result kinds.

Required mappings:

- `group_required`
  - background/shared: existing token-provisioning group message
  - auto-provision-after-add: silent policy-blocked skip
- `available_group_required`
  - post-save: existing Sub2API available-group message
  - background/shared: existing token-provisioning group message
  - auto-provision-after-add: silent policy-blocked skip
- `group_selection_required`
  - quick-create: selection-required result
  - post-save: existing Sub2API selection-required result
  - auto-provision-after-add: silent policy-blocked skip
- `one_time_secret_required`
  - foreground shared ensure: existing AIHubMix one-time-key message
  - post-save: existing token-secret-unavailable result
  - auto-provision-after-add: silent policy-blocked skip
- `created_token_secret_unavailable`
  - foreground shared ensure: existing AIHubMix one-time-key message
  - post-save: existing token-secret-unavailable result
- `create_token_failed`
  - existing create-token-failed mapping for each workflow
- `token_not_found` and `ambiguous_created_token`
  - existing token-not-found or create-token-failed mapping, depending on the
    workflow's current behavior

Missing `keyManagement` or `tokenProvisioning` remains a configuration error
through `requireDisplayAccountKeyManagement(...)` and
`requireDisplayAccountTokenProvisioning(...)`.

Do not add user-facing copy in this slice.

## Telemetry Decision

Telemetry decision: reuse existing.

This is an internal lifecycle refactor. It does not add a new user-visible
action, setting, async job, or analytics field. Existing account save,
default-token ensure, repair, and managed-site import telemetry should continue
to emit from their current owners.

## Settings Search Decision

Settings search decision: none.

No settings UI, route, anchor, or search definition changes.

## E2E Decision

E2E decision: no new Playwright E2E in this slice.

The primary risk is service-layer lifecycle routing and result mapping.
Focused Vitest tests can exercise inventory, policy decisions, creation,
refetch recovery, and workflow result mapping without a browser runtime.

## Testing Strategy

Add lifecycle tests:

- `tests/services/accounts/defaultTokenLifecycle.test.ts`
  - returns `Ready` for an existing usable inventory token
  - proceeds to policy creation or blocking when inventory contains only an
    unusable token
  - `inspectDefaultTokenInventory(...)` reports `hasUsableSecret: false` for an
    existing token the policy marks unusable
  - returns `SelectionRequired` with existing token ids when policy asks for
    user selection
  - fetches user groups only after policy returns `NeedsUserGroups`
  - maps missing `keyManagement.userGroups` to a lifecycle block reason
  - creates a default token from policy-adjusted `tokenData`
  - returns a usable created token without refetch when classification is
    `Usable`
  - refetches inventory only when classification is `NeedsInventoryRefetch`
  - selects exactly one new token by id diff
  - blocks when refetch returns no new token
  - blocks when refetch returns more than one new token
  - preserves AIHubMix one-time-secret classification
  - does not import or branch on concrete site types

Update service tests:

- `tests/services/accountOperations.ensureAccountApiToken.test.ts`
  - shared ensure delegates lifecycle orchestration
  - `defaultTokenData`, `explicitGroup`, and `sub2apiGroup` behavior remains
    unchanged
  - `autoProvisionKeyOnAccountAdd(...)` no longer raw-skips Sub2API or
    AIHubMix, but still silently ignores policy-blocked lifecycle results
- `tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts`
  - post-save maps lifecycle `Ready`, `Created`, `SelectionRequired`, and
    `Blocked` results to existing result kinds
  - the exported id-diff helper moves or remains covered from the lifecycle
    Module
- `tests/services/accountKeyGroupCoverage.test.ts`
  - empty-group/no-token fallback uses lifecycle creation and preserves repair
    result shape
  - per-group creation and invalid-token deletion remain local
- `tests/services/accountKeyRepair.test.ts`
  - repair skip policy remains adapter-owned
  - none-auth skip remains repair-owned
- `tests/services/accountKeyAutoProvisioning.ensureDefaultToken.test.ts`
  - background ensure maps lifecycle results to existing errors and return
    values

Keep existing Adapter policy tests:

- `tests/services/apiAdapters/tokenProvisioning.test.ts`

Do not remove these tests; the lifecycle Module depends on that Interface but
does not replace it.

## Migration Completeness Checks

Run these searches during implementation:

```powershell
rg "resolveDefaultTokenCreationWithUserGroups" src/services/accounts tests/services
rg "resolveDefaultTokenCreation\\(" src/services/accounts tests/services
rg "classifyCreatedToken\\(" src/services/accounts tests/services
rg "isInventoryTokenUsable\\(" src/services/accounts tests/services
rg "selectSingleNewApiTokenByIdDiff|sanitizeApiTokens|getTokenIds" src/services/accounts tests/services
rg "site_type === SITE_TYPES.SUB2API|site_type === SITE_TYPES.AIHUBMIX" src/services/accounts
rg "resolveSub2ApiQuickCreateResolution" src tests
```

Expected after implementation:

- direct calls to `resolveDefaultTokenCreation(...)`,
  `classifyCreatedToken(...)`, and `isInventoryTokenUsable(...)` in
  `src/services/accounts/**` appear only inside
  `defaultTokenLifecycle/**`
- `resolveDefaultTokenCreationWithUserGroups(...)` is moved into
  `defaultTokenLifecycle/**` or removed as a standalone helper
- inventory normalization and id-diff recovery live in
  `defaultTokenLifecycle/**`
- `autoProvisionKeyOnAccountAdd(...)` has no raw Sub2API or AIHubMix skip
- `resolveSub2ApiQuickCreateResolution(...)` appears only as a compatibility
  wrapper and in compatibility tests, if retained
- `src/features/KeyManagement/utils.ts` may still contain the AIHubMix
  one-time-key UI helper because manual token creation is out of scope

## Validation Plan

Focused validation:

```powershell
pnpm vitest run tests/services/accounts/defaultTokenLifecycle.test.ts tests/services/accountOperations.ensureAccountApiToken.test.ts tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts tests/services/accountKeyGroupCoverage.test.ts tests/services/accountKeyRepair.test.ts tests/services/accountKeyAutoProvisioning.ensureDefaultToken.test.ts
```

Related validation:

```powershell
pnpm vitest related --run src/services/accounts/defaultTokenLifecycle/index.ts src/services/accounts/accountOperations.ts src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts src/services/accounts/accountPostSaveWorkflow/ensureAccountToken.ts src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts src/services/accounts/accountKeyAutoProvisioning/repair.ts
```

Commit gate:

```powershell
pnpm run validate:staged
```

Push gate before PR or remote handoff:

```powershell
pnpm run validate:push
```

Run `validate:push` before publishing because the implementation slice will
touch shared account services and cross-module contracts.

## Rollout

1. Add lifecycle contract tests for inventory, decision, create, classification,
   refetch, and blocked-result behavior.
2. Add `defaultTokenLifecycle` contracts and request helpers.
3. Move user-group second-pass decision handling into the lifecycle Module.
4. Move inventory normalization and id-diff recovery into the lifecycle Module.
5. Add `createDefaultTokenFromDecision(...)`.
6. Add `ensureDefaultTokenLifecycle(...)`.
7. Route `ensureDefaultApiTokenForAccount(...)` through lifecycle results.
8. Route `ensureAccountApiToken(...)` through lifecycle results.
9. Route `ensureAccountTokenForPostSaveWorkflow(...)` through lifecycle
   results.
10. Route group-coverage empty-group/no-token fallback creation through
    lifecycle helpers.
11. Remove raw Sub2API and AIHubMix skips from
    `autoProvisionKeyOnAccountAdd(...)` and preserve silent policy-blocked
    behavior.
12. Run migration completeness searches.
13. Run focused tests, related validation, `validate:staged`, and
    `validate:push`.

## Follow-Up, Not In Scope For This Spec

Later slices may:

- remove `resolveSub2ApiQuickCreateResolution(...)` after compatibility callers
  and tests no longer need it
- rename Sub2API-specific post-save result names once Account Dialog site
  policy is cleaned up
- generalize manual created-token one-time-secret UI policy beyond AIHubMix
- consolidate account-site registration metadata across onboarding,
  `apiAdapters/registry.ts`, and site-type constants
- add a new account site type using the completed lifecycle seam
- migrate model inventory and model-list fallback behavior behind Adapter
  capabilities

The key boundary is intentional: `tokenProvisioning` answers site-specific
policy questions, `defaultTokenLifecycle` runs reusable account-token
orchestration, and workflow Modules keep product UX and persistence behavior.
