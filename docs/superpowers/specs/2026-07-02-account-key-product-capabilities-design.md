# Account Key Product Capabilities Design

Date: 2026-07-02

## Purpose

Separate product-level account key semantics from backend adapter method
availability so account workflows can ask precise questions such as "can this
account create API tokens?" or "can this account expose a runtime key?" instead
of treating `account.keyManagement` as a single all-or-nothing capability.

This is needed because some supported backends expose usable account runtime
credentials without exposing token inventory CRUD. SharedChat is the immediate
example: it can provide an account-bound service credential, but it should not
enable create, update, delete, model-limit, or user-group token-management UI.

## Current Context

`src/services/apiAdapters/contracts/keyManagement.ts` currently defines
`KeyManagementCapability` as one broad contract:

```ts
type KeyManagementCapability = {
  fetchTokens(...)
  createToken(...)
  updateToken(...)
  resolveTokenKey(...)
  deleteToken(...)
  fetchAvailableModels(...)
  userGroups?: ...
}
```

The account capability registry exposes it as:

```ts
account: {
  keyManagement?: KeyManagementCapability
  serviceCredential?: ServiceCredentialCapability
  tokenProvisioning?: TokenProvisioningCapability
}
```

This shape worked for New API-family sites where token inventory, creation,
mutation, key resolution, model metadata, and user groups mostly travel
together. It is too coarse for account types where the product can still use a
runtime key but the backend does not support token CRUD.

Recent SharedChat work introduced a narrow runtime-key path:

- `fetchDisplayAccountRuntimeKeys(...)` can return token inventory for
  `keyManagement` sites or synthesize a singleton runtime token from
  `serviceCredential`.
- `canCreateDisplayAccountTokens(...)` gates create actions on
  `keyManagement` instead of only account completeness.

That fixes the immediate error path, but it is still a local patch around a
coarse capability model.

## Problem

The product currently conflates at least seven separate concepts:

1. runtime key listing;
2. runtime key secret resolution;
3. API token creation;
4. API token update;
5. API token deletion;
6. token form metadata such as available models;
7. token groups.

When UI and service code ask only whether `keyManagement` exists, they cannot
distinguish "can list a token-like runtime credential" from "can create a new
API token" or "can fetch model-limit metadata." This causes two recurring
failure modes:

- Unsupported actions remain visible and fail after the user clicks them.
- Supported service-credential workflows are hidden or treated as broken
  because they are not token CRUD.

Making every method of `KeyManagementCapability` optional would not solve the
product problem by itself. It would move optional checks into many callers while
still leaving the product semantics unnamed.

## Goals

- Introduce one product-level account key capability projection that normalizes
  backend facts into UI/use-case semantics.
- Keep `KeyManagementCapability` stable for the first slice so existing
  adapters and tests do not need a broad mechanical rewrite.
- Express service credentials as first-class runtime key sources without
  pretending they are token CRUD resources.
- Route create, update, delete, list, secret-resolution, model-metadata, and
  user-group checks through named product capability helpers.
- Preserve current behavior for New API-family, Sub2API, AIHubMix, managed-site
  token flows, API credential profile export, CLIProxy export, and default
  token lifecycle.
- Make unsupported actions disabled or omitted before execution, with local
  fallback copy where the UI needs to explain why an action is unavailable.
- Prepare a later adapter-contract split into smaller protocol capabilities.

## Non-Goals

- Do not directly convert `KeyManagementCapability` into a set of optional
  methods in the first implementation slice.
- Do not remove `account.keyManagement` from site-type capabilities in the
  first slice.
- Do not add a new site type.
- Do not change persisted account, token, API credential profile, or managed
  site schemas.
- Do not redesign Key Management UI layout.
- Do not change backend HTTP protocol implementations.
- Do not add telemetry schema changes unless a later implementation slice adds
  materially new user-visible actions.
- Do not manually edit generated translated docs; this is an internal design
  spec.

## Design

### 1. Add A Product Capability Projection

Create a product-level capability module near the account key helpers, for
example:

```text
src/services/accounts/keyProductCapabilities.ts
```

The exported shape should describe user/product semantics, not adapter method
names:

```ts
type AccountKeyProductCapabilities = {
  runtimeKeys: {
    list: boolean
    resolveSecret: boolean
  }
  apiTokens: {
    create: boolean
    update: boolean
    delete: boolean
  }
  tokenMetadata: {
    fetchAvailableModels: boolean
    fetchUserGroups: boolean
  }
  serviceCredential: {
    fetch: boolean
    rotate: boolean
  }
}
```

The projection should be derived from:

- normalized account readiness from `canManageDisplayAccountTokens(...)`;
- `createDisplayAccountApiContext(account).keyManagement`;
- `createDisplayAccountApiContext(account).serviceCredential`;
- optional capability members such as `keyManagement.userGroups`;
- future split capabilities once adapter contracts are decomposed.

It should also export narrow helpers for callers that do not need the whole
object:

```ts
getAccountKeyProductCapabilities(account)
canListAccountRuntimeKeys(account)
canResolveAccountRuntimeKeySecret(account)
canCreateAccountApiTokens(account)
canUpdateAccountApiTokens(account)
canDeleteAccountApiTokens(account)
canFetchAccountTokenModels(account)
canFetchAccountTokenGroups(account)
canFetchAccountServiceCredential(account)
canRotateAccountServiceCredential(account)
```

Naming should stay product-oriented. Avoid helpers like
`hasKeyManagementCreateToken` in product callers.

### 2. Define Semantic Mapping

For `keyManagement` sites with complete account auth:

```ts
runtimeKeys.list = true
runtimeKeys.resolveSecret = true
apiTokens.create = true
apiTokens.update = true
apiTokens.delete = true
tokenMetadata.fetchAvailableModels = true
tokenMetadata.fetchUserGroups = Boolean(keyManagement.userGroups)
serviceCredential.fetch = Boolean(serviceCredential)
serviceCredential.rotate = Boolean(serviceCredential?.rotate)
```

For service-credential-only sites with complete account auth:

```ts
runtimeKeys.list = true
runtimeKeys.resolveSecret = true
apiTokens.create = false
apiTokens.update = false
apiTokens.delete = false
tokenMetadata.fetchAvailableModels = false
tokenMetadata.fetchUserGroups = false
serviceCredential.fetch = true
serviceCredential.rotate = Boolean(serviceCredential.rotate)
```

For disabled accounts, missing auth context, unsupported auth type, or missing
account id/base URL/user id:

```ts
runtimeKeys.list = false
runtimeKeys.resolveSecret = false
apiTokens.create = false
apiTokens.update = false
apiTokens.delete = false
tokenMetadata.fetchAvailableModels = false
tokenMetadata.fetchUserGroups = false
serviceCredential.fetch = false
serviceCredential.rotate = false
```

This mapping makes SharedChat explicit: it can list and resolve a runtime key
through `serviceCredential`, but it cannot create, update, delete, configure
model limits, or fetch user groups for API tokens.

### 3. Move Existing Guards To The Projection

Replace the current local create/runtime helpers with projection-backed
helpers:

- `canCreateDisplayAccountTokens(...)` becomes a compatibility export that
  delegates to `canCreateAccountApiTokens(...)`.
- `fetchDisplayAccountRuntimeKeys(...)` uses
  `canListAccountRuntimeKeys(...)` for its precondition and continues to choose
  between token inventory and service credential sources.
- Copy-key dialogs use `runtimeKeys.list` for loading keys and
  `apiTokens.create` for quick/default token creation.
- Model-key dialogs use `runtimeKeys.list` for current key options and
  `apiTokens.create` for custom/model-specific key creation.
- Key Management page add actions use `apiTokens.create`.
- Key Management item edit/delete controls should move to
  `apiTokens.update/delete` in the same or next slice.

The first implementation should not require every call site to consume the full
capability object. Small helpers keep call sites readable and make tests
focused.

### 4. Keep Adapter Contracts Stable Initially

Do not split `KeyManagementCapability` immediately. The projection should
consume the current broad contract and expose precise product facts.

This gives the codebase a stable migration target before changing adapter
contracts. Once product callers no longer ask for `keyManagement` directly, a
follow-up can split the adapter protocol into smaller pieces:

```ts
type TokenInventoryCapability = { fetchTokens(...) }
type TokenCreationCapability = { createToken(...) }
type TokenMutationCapability = { updateToken(...); deleteToken(...) }
type TokenSecretCapability = { resolveTokenKey(...) }
type TokenMetadataCapability = {
  fetchAvailableModels(...)
  userGroups?: UserGroupsCapability
}
```

At that point `SiteTypeCapabilities.account` can evolve toward:

```ts
account: {
  tokenInventory?: TokenInventoryCapability
  tokenCreation?: TokenCreationCapability
  tokenMutation?: TokenMutationCapability
  tokenSecret?: TokenSecretCapability
  tokenMetadata?: TokenMetadataCapability
  serviceCredential?: ServiceCredentialCapability
}
```

The projection should be the compatibility boundary during that later split.
Product callers should not need broad rewrites when the underlying adapter
shape changes.

### 5. Unsupported UI Behavior

User-visible create/update/delete controls must not rely on thrown
`keyManagement is not implemented` errors as the primary unsupported-state
handling.

Expected behavior:

- Header and empty-state create actions are disabled when
  `apiTokens.create` is false.
- Add-token dialogs receive only accounts where `apiTokens.create` is true.
- Model-key and copy-key quick-create actions are disabled when
  `apiTokens.create` is false, while still showing available runtime keys when
  `runtimeKeys.list` is true.
- Edit and delete controls are disabled or hidden when the corresponding
  mutation capability is false.
- Form sections that depend on models or groups are only loaded when
  `tokenMetadata.fetchAvailableModels` or `tokenMetadata.fetchUserGroups` is
  true.

Service credentials should remain available for copy/export/verification flows
where the product only needs a runtime key and not token CRUD.

## Migration Plan

### Slice 1: Projection And Current SharedChat Guards

Files:

- Create `src/services/accounts/keyProductCapabilities.ts`.
- Update `src/services/accounts/utils/apiServiceRequest.ts`.
- Update:
  - `src/features/KeyManagement/KeyManagement.tsx`
  - `src/features/KeyManagement/components/TokenList.tsx`
  - `src/features/AccountManagement/components/CopyKeyDialog/hooks/useCopyKeyDialog.ts`
  - `src/features/ModelList/components/ModelKeyDialog/hooks/useModelKeyDialog.ts`
- Update focused tests covering projection and the existing SharedChat
  unsupported-create behavior.

Outcome:

- Existing SharedChat fix is expressed through product semantics rather than a
  direct `keyManagement` existence check.
- No adapter contract split yet.

### Slice 2: Metadata And Mutation Callers

Files to inspect and migrate:

- `src/features/TokenProvisioning/components/AddTokenDialog/hooks/useTokenData.ts`
- `src/features/TokenProvisioning/components/AddTokenDialog/index.tsx`
- `src/features/KeyManagement/hooks/useKeyManagement.ts`
- `src/features/KeyManagement/components/TokenListItem/**`
- account key auto-provisioning and repair helpers under
  `src/services/accounts/accountKeyAutoProvisioning/**`

Outcome:

- Fetch-models/user-groups calls use metadata capability checks.
- Edit/delete controls and service calls use mutation capability checks.
- Auto-provisioning flows distinguish "cannot create token" from "account
  unavailable" and surface stable local fallback messages.

### Slice 3: Adapter Contract Split

Files:

- `src/services/apiAdapters/contracts/keyManagement.ts`
- `src/services/apiAdapters/contracts/siteTypeCapabilities.ts`
- adapter implementations under `src/services/apiAdapters/**`
- projection module from Slice 1

Outcome:

- New smaller protocol capability interfaces exist.
- Existing broad `keyManagement` is removed or reduced to a compatibility type
  only if a single commit cannot complete the migration safely.
- Product callers keep using the projection helpers.

## Testing Strategy

Unit tests:

- Projection returns all false for null, disabled, incomplete, and unsupported
  accounts.
- New API-family mocked capability maps to token inventory, CRUD, metadata, and
  optional user-group support.
- SharedChat-like service-credential-only capability maps to runtime key access
  but no token CRUD or metadata.
- Service credential rotation maps only when `rotate` exists.

Component/hook tests:

- Key Management add-token header and empty-state actions are disabled when
  `apiTokens.create` is false.
- AddTokenDialog receives only create-capable accounts.
- CopyKeyDialog and ModelKeyDialog load runtime keys for service-credential
  accounts but disable create actions.
- Edit/delete controls respect mutation capabilities once migrated.
- AddTokenDialog metadata loading does not call unavailable model/group
  methods.

Regression tests:

- New API-family account still supports token list, create, edit, delete,
  metadata, and user groups.
- Sub2API group-selection behavior remains intact.
- AIHubMix one-time-secret behavior remains intact.
- SharedChat no longer throws `keyManagement is not implemented` from normal
  list/copy/verify flows or visible create controls.

Validation commands:

```bash
pnpm vitest run tests/services/accounts/apiServiceRequest.test.ts
pnpm vitest run tests/features/AccountManagement/components/CopyKeyDialog.test.tsx
pnpm vitest run tests/features/ModelList/components/ModelKeyDialog.test.tsx
pnpm vitest run tests/entrypoints/options/pages/KeyManagement/KeyManagement.emptyStateActions.test.tsx
pnpm vitest run tests/entrypoints/options/pages/KeyManagement/TokenList.emptyStates.test.tsx
pnpm tsc --noEmit
pnpm run validate:staged
pnpm run validate:push
```

`validate:push` is appropriate once implementation starts because this changes
shared TypeScript service contracts and feature-level UI gates.

## Compatibility And Rollout

- Slice 1 should preserve existing exports such as
  `canCreateDisplayAccountTokens(...)` by delegating to the new projection.
- Existing adapter implementations do not need to change until Slice 3.
- Product UI should migrate before adapter contracts split, so the later split
  mostly changes the projection internals and adapter registry wiring.
- If a call site still needs `requireDisplayAccountKeyManagement(...)`, it must
  either be in backend/protocol code or be documented as a temporary bridge with
  a clear target capability helper.

## Open Decisions

1. Whether update and delete should be a single `tokenMutation` semantic or
   separate product booleans. The spec uses separate booleans because UI can
   plausibly allow one without the other.
2. Whether `fetchAvailableModels` belongs under `tokenMetadata` or a broader
   account model capability. The first slice should keep it under token
   metadata because it currently feeds token creation/model-limit UI.
3. Whether service credential rotation should be shown in Key Management or
   remain localized to service credential cards. The projection should expose
   the fact either way.

## Done Criteria

- Product callers no longer infer create/update/delete/model/group support from
  the presence of `account.keyManagement`.
- SharedChat-style service credentials are represented as runtime key access,
  not token CRUD.
- Unsupported actions are disabled or omitted before execution.
- Existing key-management behavior for full token-CRUD sites is unchanged.
- Tests cover the semantic mapping and the main UI gates.
- The adapter contract can be split later without forcing another broad UI
  migration.
