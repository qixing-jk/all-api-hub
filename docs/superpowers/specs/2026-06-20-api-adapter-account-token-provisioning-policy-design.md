# API Adapter Account Token Provisioning Policy Design

Date: 2026-06-20

## Purpose

Make the next account site type faster to add by moving default API-token
provisioning policy behind the `SiteAdapter` Seam.

Recent slices moved account-site onboarding metadata, account bootstrap,
account completion, account data, account refresh, model pricing, model catalog
loading, and token lifecycle operations behind `getSiteAdapter(siteType)`.
Those changes make an account site detectable, saveable, refreshable, and able
to list/create/update/delete/reveal API keys through `SiteAdapter.keyManagement`.

The remaining friction is not a missing backend operation. The friction is
product policy around when All API Hub is allowed to create a default key:

- compatible sites can usually create an ungrouped default key and recover it
  from either the create response or a follow-up inventory read.
- Sub2API requires a current upstream group; some workflows can auto-select the
  only group, but must ask the user when multiple groups exist.
- AIHubMix can create a key only when the workflow can show the one-time full
  secret immediately; background helpers and repair jobs must not create a key
  that can only be recovered as a masked inventory row.

Those rules are currently duplicated across account workflow Modules. This spec
adds a narrow `tokenProvisioning` Adapter capability that describes those rules
without moving raw token CRUD out of `keyManagement`.

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
  redemption?: RedemptionCapability
}
```

`KeyManagementCapability` is already a real Adapter Interface for backend token
operations:

```ts
type KeyManagementCapability = {
  fetchTokens(request, options?): Promise<ApiToken[]>
  createToken(request, tokenData): Promise<CreateTokenResult>
  updateToken(request): Promise<boolean | void>
  resolveTokenKey(request): Promise<string>
  deleteToken(request): Promise<boolean | void>
  fetchAvailableModels(request): Promise<string[]>
  userGroups?: UserGroupsCapability
}
```

Current policy decisions still live in product Modules:

- `src/services/accounts/accountPostSaveWorkflow/ensureAccountToken.ts`
  - treats AIHubMix inventory tokens as usable only when the key is unmasked
  - routes Sub2API through `resolveSub2ApiQuickCreateResolution(...)`
  - marks AIHubMix created keys as one-time secrets
- `src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts`
  - blocks Sub2API implicit default-key creation
  - blocks AIHubMix implicit default-key creation
- `src/services/accounts/accountOperations.ts`
  - `resolveSub2ApiQuickCreateResolution(...)` is hard-coded to Sub2API
  - `ensureAccountApiToken(...)` accepts only a Sub2API group override
  - AIHubMix creation is blocked outside the one-time-key dialog path
- `src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts`
  - uses `keyManagement`, but still branches for Sub2API and AIHubMix when no
    groups exist
- `src/services/accounts/accountKeyAutoProvisioning/repair.ts`
  - skips Sub2API and AIHubMix with site-type-specific reasons

The backend operation Seam is already strong enough. The product policy Seam is
still shallow.

## Problem

Adding another non-compatible account site type would still require editing
several account workflow Modules even after its Adapter implements
`keyManagement`.

Current friction:

1. Default-key creation rules are duplicated across post-save automation,
   background provisioning, shared token ensure, group coverage, and repair.
2. The policy is encoded as raw `SITE_TYPES.SUB2API` and
   `SITE_TYPES.AIHUBMIX` checks, so a new site type with similar constraints
   must copy the same branches.
3. Group resolution is named after Sub2API even though the concept is broader:
   "default key creation requires a current upstream group".
4. One-time-secret behavior is named after AIHubMix even though the concept is
   broader: "created keys are usable only when the create response includes the
   full secret".
5. Tests prove individual branches, but not a shared policy Interface that new
   Adapters can satisfy.

Deletion test: if the raw Sub2API and AIHubMix token-provisioning branches were
deleted from account workflow Modules, the complexity should reappear only in
the new `tokenProvisioning` Adapter capability and its tests. It should not
reappear as another set of site-type checks in each workflow.

## Goals

- Add a narrow `tokenProvisioning` Adapter capability.
- Keep backend token operations in `keyManagement`.
- Move account-token provisioning decisions behind `tokenProvisioning`:
  - whether an existing inventory token is usable for a workflow
  - whether default token creation can happen without user input
  - whether group selection is required, auto-resolvable, or blocked
  - whether a created key must be treated as a one-time secret
  - whether account-key repair is eligible for the site type
- Preserve existing product behavior:
  - New API-family default token creation continues to work without group input
  - Sub2API still refuses silent ungrouped creation
  - Sub2API post-save creation auto-selects exactly one current group
  - Sub2API post-save creation asks the user when multiple groups exist
  - AIHubMix background/default repair creation remains blocked
  - AIHubMix post-save creation remains allowed only when a full one-time
    secret can be shown
  - group coverage and invalid-token deletion results remain unchanged
  - Sub2API auth-session request decoration remains owned by
    `createDisplayAccountApiContext(...)`
- Provide Adapter implementations for:
  - New API-family compatible account sites
  - Sub2API
  - AIHubMix
- Add focused policy, workflow, and repair tests.

## Non-Goals

- Do not add a new site type in this slice.
- Do not redesign `KeyManagementCapability`.
- Do not move token list/create/update/delete/reveal operations out of
  `keyManagement`.
- Do not migrate model pricing, runtime model catalog, redemption, site
  announcements, account data, account refresh, account bootstrap, or account
  completion.
- Do not migrate managed-site channel CRUD, managed-site providers, or
  managed-site model sync.
- Do not change the default token payload produced by
  `generateDefaultTokenRequest()`.
- Do not change Account Dialog UI copy, one-time-key dialog UI, locale keys,
  telemetry schema, settings search, or Playwright E2E coverage.
- Do not add an import guard in this slice.

## Approaches Considered

### Approach A: Keep Site-Type Branches In Account Workflows

This keeps the implementation small, but it leaves the next new account site
type dependent on edits in every workflow that can create or repair a key.

This should not be the next step. The Adapter Seam would cover token CRUD but
not the product policy that decides when CRUD is safe.

### Approach B: Move Full Provisioning Workflows Into Adapters

Adapters could expose methods such as `ensureDefaultToken(...)` or
`ensurePostSaveToken(...)`.

This hides too much product behavior behind backend Adapters. The workflows
own UI state, toasts, progress snapshots, one-time-key acknowledgement, and
repair result persistence. Moving full workflows into Adapters would make the
Adapter Interface broad and difficult to test.

### Approach C: Add A Small `tokenProvisioning` Policy Capability

Add an Adapter capability that answers policy questions while product workflow
Modules continue to own orchestration, storage, UI state, and calls to
`keyManagement`.

This is the recommended path. It makes `SiteAdapter` deeper without turning it
into a second flat `apiService` facade: the Adapter owns site-specific policy,
while account workflow Modules keep product orchestration.

## Design

### 1. Add `TokenProvisioningCapability`

Create:

```text
src/services/apiAdapters/contracts/tokenProvisioning.ts
```

Proposed types:

```ts
import type {
  CreateTokenRequest,
  CreateTokenResult,
  UserGroupInfo,
} from "~/services/apiService/common/type"
import type { ApiToken } from "~/types"

export const TOKEN_PROVISIONING_WORKFLOWS = {
  BackgroundAutoProvision: "background_auto_provision",
  SharedEnsure: "shared_ensure",
  PostSaveAutomation: "post_save_automation",
  Repair: "repair",
} as const

export type TokenProvisioningWorkflow =
  (typeof TOKEN_PROVISIONING_WORKFLOWS)[keyof typeof TOKEN_PROVISIONING_WORKFLOWS]

export const TOKEN_PROVISIONING_BLOCK_REASONS = {
  GroupRequired: "group_required",
  AvailableGroupRequired: "available_group_required",
  GroupSelectionRequired: "group_selection_required",
  OneTimeSecretRequired: "one_time_secret_required",
  CreateFailed: "create_failed",
  CreatedTokenSecretUnavailable: "created_token_secret_unavailable",
} as const

export type TokenProvisioningBlockReason =
  (typeof TOKEN_PROVISIONING_BLOCK_REASONS)[keyof typeof TOKEN_PROVISIONING_BLOCK_REASONS]

export type ResolveDefaultTokenCreationRequest = {
  workflow: TokenProvisioningWorkflow
  defaultTokenData: CreateTokenRequest
  explicitGroup?: string
  userGroups?: Record<string, UserGroupInfo>
}

export type DefaultTokenCreationDecision =
  | {
      kind: "create"
      tokenData: CreateTokenRequest
      oneTimeSecret: boolean
      recoverCreatedToken: "created_response_first" | "inventory_refetch"
    }
  | {
      kind: "selection_required"
      allowedGroups: string[]
      reason: typeof TOKEN_PROVISIONING_BLOCK_REASONS.GroupSelectionRequired
    }
  | {
      kind: "blocked"
      reason: TokenProvisioningBlockReason
    }

export type CreatedTokenSecretDecision =
  | { kind: "usable"; token: ApiToken; oneTimeSecret: boolean }
  | {
      kind: "failed"
      reason: typeof TOKEN_PROVISIONING_BLOCK_REASONS.CreateFailed
    }
  | {
      kind: "unavailable"
      reason: typeof TOKEN_PROVISIONING_BLOCK_REASONS.CreatedTokenSecretUnavailable
    }
  | { kind: "needs_inventory_refetch" }

export type TokenProvisioningRepairPolicy =
  | { kind: "eligible" }
  | { kind: "skipped"; skipReason: "sub2api" | "aihubmixOneTimeKey" }

export type TokenProvisioningCapability = {
  isInventoryTokenUsable(params: {
    workflow: TokenProvisioningWorkflow
    token: ApiToken
  }): boolean
  resolveDefaultTokenCreation(
    request: ResolveDefaultTokenCreationRequest,
  ): DefaultTokenCreationDecision
  classifyCreatedToken(params: {
    workflow: TokenProvisioningWorkflow
    result: CreateTokenResult
  }): CreatedTokenSecretDecision
  getRepairPolicy(): TokenProvisioningRepairPolicy
}
```

The exact type names can be refined during implementation, but the Interface
should keep these constraints:

- The capability returns stable reason codes, not translated strings.
- The capability does not call backend APIs.
- The capability does not read storage.
- The capability does not show UI or send telemetry.
- The capability accepts existing `keyManagement.userGroups` output instead of
  fetching groups itself.
- The capability receives `generateDefaultTokenRequest()` output instead of
  owning the default payload.

### 2. Extend `SiteAdapter`

Modify:

```text
src/services/apiAdapters/contracts/siteAdapter.ts
```

Add:

```ts
tokenProvisioning?: TokenProvisioningCapability
```

Capability presence is the support signal for account-token provisioning
policy. Account site Adapters that support `keyManagement` should expose this
capability. Unsupported account-site Adapters may omit it and let callers use
the existing missing-capability error path.

### 3. Add New API-Family Policy

Create:

```text
src/services/apiAdapters/newApi/tokenProvisioning.ts
```

New API-family behavior:

- existing inventory tokens are usable for all current workflows
- default token creation is allowed for all current workflows
- group selection is not required
- created tokens may be used from the create response when present
- otherwise callers may recover the token from a follow-up inventory read
- account-key repair is eligible

Expected decision shape:

```ts
export const newApiTokenProvisioning: TokenProvisioningCapability = {
  isInventoryTokenUsable: () => true,
  resolveDefaultTokenCreation: ({ defaultTokenData }) => ({
    kind: "create",
    tokenData: defaultTokenData,
    oneTimeSecret: false,
    recoverCreatedToken: "inventory_refetch",
  }),
  classifyCreatedToken: ({ result }) =>
    isCreatedApiToken(result)
      ? { kind: "usable", token: result, oneTimeSecret: false }
      : result
        ? { kind: "needs_inventory_refetch" }
        : { kind: "failed", reason: "create_failed" },
  getRepairPolicy: () => ({ kind: "eligible" }),
}
```

Wire it through:

```text
src/services/apiAdapters/newApi/index.ts
```

### 4. Add Sub2API Policy

Create:

```text
src/services/apiAdapters/sub2api/tokenProvisioning.ts
```

Sub2API behavior:

- existing inventory tokens are usable for all current workflows
- default token creation requires a current upstream group
- post-save automation may auto-select exactly one available group
- post-save automation must return `selection_required` when multiple groups
  are available
- shared/background helpers may create only when an explicit group is supplied
- empty group inventory is blocked
- created tokens may be recovered by follow-up inventory read
- account-key repair remains skipped with `sub2api`

Group normalization should move out of `accountOperations.ts` and become part
of this policy Module:

```ts
export function normalizeTokenProvisioningGroupNames(
  groups: Record<string, unknown>,
): string[]
```

Expected decision shape:

```ts
resolveDefaultTokenCreation({
  workflow,
  defaultTokenData,
  explicitGroup,
  userGroups,
}) {
  const normalizedExplicitGroup = explicitGroup?.trim() ?? ""
  if (normalizedExplicitGroup) {
    return {
      kind: "create",
      tokenData: { ...defaultTokenData, group: normalizedExplicitGroup },
      oneTimeSecret: false,
      recoverCreatedToken: "inventory_refetch",
    }
  }

  const validGroups = normalizeTokenProvisioningGroupNames(userGroups ?? {})
  if (validGroups.length === 0) {
    return { kind: "blocked", reason: "available_group_required" }
  }

  if (workflow !== TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation) {
    return { kind: "blocked", reason: "group_required" }
  }

  if (validGroups.length === 1) {
    return {
      kind: "create",
      tokenData: { ...defaultTokenData, group: validGroups[0] },
      oneTimeSecret: false,
      recoverCreatedToken: "inventory_refetch",
    }
  }

  return {
    kind: "selection_required",
    allowedGroups: validGroups,
    reason: "group_selection_required",
  }
}
```

Wire it through:

```text
src/services/apiAdapters/sub2api/index.ts
```

### 5. Add AIHubMix Policy

Create:

```text
src/services/apiAdapters/aihubmix/tokenProvisioning.ts
```

AIHubMix behavior:

- an existing inventory token is usable only when it contains a full unmasked
  secret
- background/default/shared/repair creation is blocked because those workflows
  cannot guarantee one-time-secret acknowledgement
- post-save automation may create a token because the one-time-key flow can
  show the created full secret immediately
- the create result must include a full unmasked token secret
- created keys are one-time secrets
- account-key repair remains skipped with `aihubmixOneTimeKey`

The policy should reuse the existing API-key helpers:

```ts
hasUsableApiTokenKey(...)
isMaskedApiTokenKey(...)
```

Expected decision shape:

```ts
resolveDefaultTokenCreation({ workflow, defaultTokenData }) {
  if (workflow !== TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation) {
    return { kind: "blocked", reason: "one_time_secret_required" }
  }

  return {
    kind: "create",
    tokenData: defaultTokenData,
    oneTimeSecret: true,
    recoverCreatedToken: "created_response_first",
  }
}

classifyCreatedToken({ result }) {
  if (!result) {
    return { kind: "failed", reason: "create_failed" }
  }

  if (isCreatedApiToken(result) && hasUsableFullTokenSecret(result)) {
    return { kind: "usable", token: result, oneTimeSecret: true }
  }

  return {
    kind: "unavailable",
    reason: "created_token_secret_unavailable",
  }
}
```

Wire it through:

```text
src/services/apiAdapters/aihubmix/index.ts
```

### 6. Add A Shared Requirement Helper

Create or extend a small helper near the existing display-account context:

```text
src/services/accounts/utils/apiServiceRequest.ts
```

Add:

```ts
export const createMissingTokenProvisioningCapabilityError = (
  siteType: string,
) => new Error(`tokenProvisioning is not implemented for ${siteType}`)

export const requireDisplayAccountTokenProvisioning = (
  account: Pick<DisplaySiteData, "siteType">,
  tokenProvisioning: TokenProvisioningCapability | undefined,
): TokenProvisioningCapability => {
  if (!tokenProvisioning) {
    throw createMissingTokenProvisioningCapabilityError(account.siteType)
  }

  return tokenProvisioning
}
```

`createDisplayAccountApiContext(...)` may include
`tokenProvisioning: adapter.tokenProvisioning` for consistency with
`keyManagement`, but it should continue to be primarily a request builder and
adapter resolver. Do not add backend operations to this helper.

### 7. Route Post-Save Token Ensure Through Policy

Modify:

```text
src/services/accounts/accountPostSaveWorkflow/ensureAccountToken.ts
```

`inspectAccountTokenInventory(...)` should ask policy whether the inventory
token is usable:

```ts
const tokenProvisioning = requireDisplayAccountTokenProvisioning(
  displaySiteData,
  getSiteAdapter(displaySiteData.siteType).tokenProvisioning,
)

hasUsableSecret: tokenProvisioning.isInventoryTokenUsable({
  workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
  token: existingToken,
})
```

`createDefaultToken(...)` should:

1. build `generateDefaultTokenRequest()`
2. pass the workflow, optional explicit group, and optional user groups to
   `tokenProvisioning.resolveDefaultTokenCreation(...)`
3. create only when the decision is `create`
4. classify the create result with `classifyCreatedToken(...)`
5. refetch inventory only when the decision says `needs_inventory_refetch`

`ensureAccountTokenForPostSaveWorkflow(...)` should preserve existing result
kinds:

- policy `selection_required` maps to
  `ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Sub2ApiSelectionRequired`
- policy `available_group_required`, `group_required`, `create_failed`, or
  ordinary create failure maps to `TokenCreationFailed`
- policy `one_time_secret_required` or `created_token_secret_unavailable` maps
  to `TokenSecretUnavailable`
- policy-created AIHubMix tokens still return `oneTimeSecret: true`

This keeps UI behavior stable while removing raw Sub2API and AIHubMix policy
branches from the workflow Module.

### 8. Route Background Default Token Ensure Through Policy

Modify:

```text
src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts
```

`ensureDefaultApiTokenForAccount(...)` should use:

```ts
TOKEN_PROVISIONING_WORKFLOWS.BackgroundAutoProvision
```

The function should preserve current errors:

- Sub2API policy `group_required` maps to
  `messages:sub2api.createRequiresGroup`
- AIHubMix policy `one_time_secret_required` maps to
  `messages:aihubmix.createRequiresOneTimeKeyDialog`
- create failure still throws `create_token_failed`
- no inventory token after create still throws `token_not_found`

The default token request payload remains owned by
`generateDefaultTokenRequest()` and must not change.

### 9. Route Shared Token Ensure Through Policy

Modify:

```text
src/services/accounts/accountOperations.ts
```

Replace `resolveSub2ApiQuickCreateResolution(...)` with a site-agnostic
helper:

```ts
export type DefaultTokenQuickCreateResolution =
  | { kind: "ready"; tokenData: CreateTokenRequest }
  | { kind: "selection_required"; allowedGroups: string[] }
  | { kind: "blocked"; reason: TokenProvisioningBlockReason; message: string }

export async function resolveDefaultTokenQuickCreateResolution(
  account: DisplayAccountTokenProvisioningInput,
  options?: { explicitGroup?: string },
): Promise<DefaultTokenQuickCreateResolution>
```

Implementation should:

- get `keyManagement` and `tokenProvisioning` from the Adapter
- fetch `keyManagement.userGroups` only when the policy needs group data or
  when the site exposes `userGroups`
- call `resolveDefaultTokenCreation(...)` with
  `TOKEN_PROVISIONING_WORKFLOWS.SharedEnsure`
- translate policy reason codes to existing messages

Keep a compatibility wrapper for old call sites/tests during this slice:

```ts
export async function resolveSub2ApiQuickCreateResolution(account) {
  if (account.siteType !== SITE_TYPES.SUB2API) {
    throw new Error("sub2api_quick_create_not_applicable")
  }

  const resolution = await resolveDefaultTokenQuickCreateResolution(account)
  ...
}
```

`ensureAccountApiToken(...)` should use `resolveDefaultTokenCreation(...)`
instead of raw `displaySiteData.siteType` checks. Existing option
`sub2apiGroup` can remain as a compatibility input in this slice, but should be
translated into a generic `explicitGroup` before calling the policy.

### 10. Route Group Coverage And Repair Through Policy

Modify:

```text
src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts
src/services/accounts/accountKeyAutoProvisioning/repair.ts
```

`ensureAccountKeysForAvailableGroups(...)` should ask policy how to handle the
empty-group and no-token case instead of checking Sub2API and AIHubMix
directly.

Preserve existing behavior:

- if groups are empty and tokens exist, the account is covered
- if groups are empty and no tokens exist, New API-family creates one default
  token
- if groups are empty and no tokens exist, Sub2API reports the existing group
  required error
- if groups are empty and no tokens exist, AIHubMix reports the existing
  one-time-secret required error
- unavailable-group tokens remain invalid repair targets
- failed group creation records missing groups and continues
- invalid-token deletion still uses `keyManagement.deleteToken(...)`

`repair.ts#getSkipReason(...)` should ask:

```ts
getSiteAdapter(account.site_type).tokenProvisioning?.getRepairPolicy()
```

Mapping must preserve current skip reasons:

- Sub2API -> `sub2api`
- AIHubMix -> `aihubmixOneTimeKey`
- none auth remains `noneAuth` and is still owned by repair because it depends
  on stored-account auth state, not site provisioning policy

## Error Handling

The policy capability should return reason codes. Workflow Modules remain
responsible for mapping those codes to existing localized messages and result
kinds.

Required mappings:

- `group_required`
  - `messages:sub2api.createRequiresGroup` in background/shared helpers
- `available_group_required`
  - `messages:sub2api.createRequiresAvailableGroup` in post-save quick-create
- `group_selection_required`
  - selection-required result with the existing allowed-group list
- `one_time_secret_required`
  - `messages:aihubmix.createRequiresOneTimeKeyDialog`
- `create_failed`
  - existing create-failed message or `create_token_failed`, depending on the
    workflow's current behavior
- `created_token_secret_unavailable`
  - `ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES.TokenSecretUnavailable`

Missing `tokenProvisioning` should be treated as a programming/configuration
error like missing `keyManagement`.

Do not add user-facing copy in this slice.

## Telemetry Decision

Telemetry decision: reuse existing.

This is an internal routing and policy-locality refactor. It does not add a
new user-visible action or analytics field. Existing account save, post-save
automation, repair, and key-management telemetry should continue to emit from
their current owners with the same sanitized payloads.

## Settings Search Decision

Settings search decision: none.

No settings UI, route, anchor, or search definition changes.

## E2E Decision

E2E decision: no new Playwright E2E in this slice.

The primary risk is service-layer policy routing and preservation of existing
result mappings. Focused Vitest tests at Adapter, account workflow, and repair
levels cover that directly. Browser runtime behavior is unchanged.

## Testing Strategy

Add Adapter policy tests:

- `tests/services/apiAdapters/tokenProvisioning.test.ts`
  - New API-family allows ungrouped default token creation in every current
    workflow and is repair eligible
  - Sub2API requires a group, auto-selects exactly one group for post-save,
    returns selection-required for multiple groups, and is skipped for repair
  - AIHubMix blocks non-post-save creation, allows post-save one-time creation,
    rejects masked create results, and is skipped for repair
  - group normalization trims, dedupes, and drops blank group names

Update registry tests:

- `tests/services/apiAdapters/registry.test.ts`
  - New API-family, Sub2API, and AIHubMix expose `tokenProvisioning`
  - unsupported Adapters omit `tokenProvisioning`

Update account workflow tests:

- `tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts`
  - post-save workflow uses `tokenProvisioning`
  - Sub2API single-group, multi-group, and no-group results remain unchanged
  - AIHubMix one-time-secret and masked-secret results remain unchanged
- `tests/services/accountOperations.ensureAccountApiToken.test.ts`
  - shared ensure maps generic policy decisions back to existing Sub2API and
    AIHubMix errors
  - compatibility `sub2apiGroup` still creates a grouped token
  - generic quick-create helper supports policy-driven group selection
- `tests/services/accountKeyGroupCoverage.test.ts`
  - empty-group fallback uses policy instead of raw site-type checks
  - invalid-token deletion behavior remains unchanged
- `tests/services/accountKeyRepair.test.ts`
  - repair skip reasons are resolved through `tokenProvisioning`
  - none-auth skip remains repair-owned

Focused validation:

```powershell
pnpm vitest run tests/services/apiAdapters/tokenProvisioning.test.ts tests/services/apiAdapters/registry.test.ts tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts tests/services/accountOperations.ensureAccountApiToken.test.ts tests/services/accountKeyGroupCoverage.test.ts tests/services/accountKeyRepair.test.ts
```

Related validation:

```powershell
pnpm vitest related --run src/services/apiAdapters/contracts/tokenProvisioning.ts src/services/apiAdapters/contracts/siteAdapter.ts src/services/accounts/accountPostSaveWorkflow/ensureAccountToken.ts src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts src/services/accounts/accountKeyAutoProvisioning/repair.ts src/services/accounts/accountOperations.ts
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
shared Adapter contracts and cross-module account workflow routing.

## Rollout

1. Add `TokenProvisioningCapability` contract and failing policy tests.
2. Add New API-family, Sub2API, and AIHubMix policy Modules.
3. Wire `tokenProvisioning` into `SiteAdapter` and the registry expectations.
4. Route post-save token ensure through policy.
5. Route background default token ensure through policy.
6. Add the generic quick-create resolver and keep the Sub2API compatibility
   wrapper.
7. Route `ensureAccountApiToken(...)` through policy.
8. Route group coverage empty-group/default-token behavior through policy.
9. Route repair skip reasons through policy.
10. Run focused tests after each workflow group.
11. Run related validation, `validate:staged`, and `validate:push` before PR.

## Follow-Up, Not In Scope For This Spec

Later slices may:

- remove the Sub2API-named compatibility wrapper once call sites move to the
  generic quick-create resolver
- add UI support for a non-Sub2API backend that requires user group selection
- generalize one-time-secret acknowledgement if another backend behaves like
  AIHubMix
- move account identity and URL normalization into adapter-owned policy
- migrate Model List fallback behavior out of UI hooks
- migrate managed-site runtime/provider registration

Do not turn `tokenProvisioning` into a full workflow runner. Its job is to
answer site-specific policy questions. Account workflow Modules still own
requests, persistence, UI state, progress reporting, toasts, telemetry, and
calls to `keyManagement`.
