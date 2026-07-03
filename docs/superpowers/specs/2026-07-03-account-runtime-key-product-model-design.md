# Account Runtime Key Product Model Design

Date: 2026-07-03

## Purpose

Make `AccountRuntimeKey` the product canonical model for account-scoped keys
that can be used at runtime, while keeping backend resource facts explicit.

SharedChat exposed the gap: its Codex key is an account-bound service
credential, not a CRUD-managed API token. The current implementation works by
turning that service credential into transient `ApiToken` / `AccountToken`
objects at several call sites. That is acceptable as a short compatibility
patch, but it is not the right long-term interface. Product flows that only need
a usable key should not learn fake token ids, token quota defaults, or which
service credential fields were copied into token-shaped objects.

This design intentionally favors a faster migration to the correct model over
preserving every legacy token-shaped helper. Compatibility shims may exist at
unavoidable edges, but new and migrated product code should consume
`AccountRuntimeKey` directly.

## Domain Model

### Backend Resource Facts

`AccountToken` remains the product representation of a real token resource
returned by token inventory. It supports token-resource behavior such as stable
token id, update, delete, token metadata, token groups, model limits, and token
secret resolution.

`AccountServiceCredential` remains the site-adapter representation of an
account-bound singleton service key. It supports service-credential behavior
such as fetch, optional rotate, service label, authenticated state, and optional
service-specific base URL.

### Product Canonical Model

`AccountRuntimeKey` represents the shared product concept:

> a key available from an account that can be used for runtime requests such as
> verification, model probing, export, or CLI configuration.

It is not a replacement for `AccountToken` in token CRUD surfaces. It is the
model for mixed runtime-key surfaces where the source may be either a real API
token or a service credential.

## Target Interface

Create a product module near the account key helpers:

```text
src/services/accounts/accountRuntimeKeys.ts
```

The target shape should be source-aware and action-oriented:

```ts
export const ACCOUNT_RUNTIME_KEY_SOURCES = {
  AccountToken: "account_token",
  ServiceCredential: "service_credential",
} as const

export type AccountRuntimeKeySource =
  (typeof ACCOUNT_RUNTIME_KEY_SOURCES)[keyof typeof ACCOUNT_RUNTIME_KEY_SOURCES]

type AccountRuntimeKeyBase = {
  id: string
  source: AccountRuntimeKeySource
  accountId: string
  accountName: string
  siteType: AccountSiteType
  label: string
  secret: string
  baseUrl: string
  status: "active" | "inactive" | "unknown"
  capabilities: {
    copy: boolean
    export: boolean
    verify: boolean
    fetchRuntimeModels: boolean
    rotate: boolean
    updateToken: boolean
    deleteToken: boolean
  }
}

export type AccountTokenRuntimeKey = AccountRuntimeKeyBase & {
  source: typeof ACCOUNT_RUNTIME_KEY_SOURCES.AccountToken
  tokenId: number
  token: AccountToken
}

export type ServiceCredentialRuntimeKey = AccountRuntimeKeyBase & {
  source: typeof ACCOUNT_RUNTIME_KEY_SOURCES.ServiceCredential
  service: AccountServiceCredential["service"]
  credential: AccountServiceCredential
}

export type AccountRuntimeKey =
  | AccountTokenRuntimeKey
  | ServiceCredentialRuntimeKey
```

The concrete implementation may refine field names, but the interface must
preserve these properties:

- stable string `id`, never a fake numeric token id;
- explicit `source`, so source-specific operations are deliberate;
- `label`, `secret`, `baseUrl`, and account identity for runtime consumers;
- action capabilities, so consumers do not infer behavior from source names;
- access to the raw source object only for source-specific operations.

## Module Responsibilities

`accountRuntimeKeys.ts` should own:

- building a runtime key from an `AccountToken`;
- building a runtime key from an `AccountServiceCredential`;
- creating stable runtime-key ids;
- resolving the runtime base URL, including service-credential base URL
  override;
- normalizing active/inactive/unknown status;
- exposing type guards such as `isAccountTokenRuntimeKey` and
  `isServiceCredentialRuntimeKey`;
- converting to legacy `ApiToken` or `AccountToken` only for edges that still
  require token-shaped inputs;
- collecting secrets from runtime keys for sanitized error handling and export
  flows.

It should not own:

- backend HTTP calls;
- token CRUD;
- service-credential rotation side effects;
- model catalog fetching;
- React state;
- managed-site channel matching;
- persisted account or profile schemas.

## Fast Migration Strategy

The migration should be assertive: move mixed runtime-key flows to
`AccountRuntimeKey` rather than extending the transient-token helpers.

### Replace Transient Token Builders

Move the current repeated service-credential-to-token conversions into the new
module and then delete local copies:

- `src/services/accounts/utils/apiServiceRequest.ts`
  - current `toServiceCredentialRuntimeToken`;
- `src/features/KeyManagement/utils.ts`
  - current `buildServiceCredentialTransientToken`;
- `src/services/managedSites/tokenBatchExport.ts`
  - current `buildTransientTokenFromServiceCredential`.

Long term, these should become legacy edge conversions only. The common path
should pass `AccountRuntimeKey`.

### Runtime Key Fetching

Replace or supplement `fetchDisplayAccountRuntimeKeys(account): Promise<ApiToken[]>`
with:

```ts
fetchDisplayAccountRuntimeKeys(account): Promise<AccountRuntimeKey[]>
```

If an old consumer still needs token-shaped output during the migration, expose
a clearly named compatibility helper:

```ts
fetchDisplayAccountRuntimeKeyTokens(account): Promise<ApiToken[]>
```

Do not keep ambiguous names where `runtimeKeys` actually returns fake tokens.

### Secret Resolution

Add a runtime-key-level resolver:

```ts
resolveDisplayAccountRuntimeKeySecret(account, runtimeKey, options)
```

For account-token runtime keys, delegate through the token secret resolver. For
service-credential runtime keys, fetch or use the service credential secret
according to the adapter capability. Callers that work with runtime keys should
not call `resolveDisplayAccountTokenForSecret(...)` directly.

### Key Management Entries

`KeyManagementEntry` can either become an alias/projection of
`AccountRuntimeKey` or keep feature-only UI state around a runtime key. It
should stop re-encoding service credentials into a separate product taxonomy
that then has to be mapped again for exports.

Recommended target:

```ts
type KeyManagementEntry = {
  runtimeKey: AccountRuntimeKey
  uiState: {
    isRotating?: boolean
    statusCheck?: ...
  }
}
```

Token CRUD buttons must remain guarded by runtime-key capabilities or by
`isAccountTokenRuntimeKey(...)`.

### Export And Profile Flows

Move these flows to `AccountRuntimeKey` inputs:

- API credential profile batch save;
- CLIProxy batch export;
- managed-site token batch export preview and submit paths;
- verification dialogs;
- Model List runtime catalog fallback;
- batch model verification.

Destination-specific modules should receive normalized runtime keys and should
not branch directly on `AccountServiceCredential` unless the destination action
is service-credential-specific.

### Model List Readiness

`resolveModelListAccountSourceReadiness(...)` should describe whether the route
uses account runtime keys and whether token-secret resolution is required. UI
hooks should consume readiness and runtime keys rather than checking
`serviceCredential && !keyManagement`.

The readiness module should own product routing facts; adapters should continue
to own backend capabilities.

## Naming Rules

- Use `runtime key` for mixed surfaces.
- Use `API token` or `token` only when the source is a real token resource or
  the action is token CRUD.
- Do not call service credentials tokens in user-facing copy, tests, comments,
  or new internal identifiers.
- Avoid new sentinel token ids such as `-1` or `0`. Runtime-key ids are strings
  derived from account id and source identity.

## Non-Goals

- Do not persist `AccountRuntimeKey` as a new stored schema in this slice.
- Do not change backend protocols.
- Do not merge `AccountToken` and `AccountServiceCredential` into one raw
  backend resource type.
- Do not make token CRUD work for service credentials.
- Do not add telemetry fields unless the implementation changes visible user
  actions or funnel semantics.
- Do not preserve legacy token-shaped helpers merely for internal convenience
  once their callers can consume `AccountRuntimeKey`.

## Implementation Slices

### Slice 1: Core Product Model

Files:

- Create `src/services/accounts/accountRuntimeKeys.ts`.
- Update `src/services/accounts/utils/apiServiceRequest.ts`.
- Add `tests/services/accounts/accountRuntimeKeys.test.ts`.
- Update `tests/services/accounts/apiServiceRequest.test.ts`.

Work:

- Define runtime-key source constants, types, builders, type guards, and legacy
  conversion helpers.
- Replace the local service-credential transient token builder in
  `apiServiceRequest.ts`.
- Rename ambiguous runtime-key helpers if needed so return types are honest.

### Slice 2: Verification And Model Probing

Files:

- `src/components/dialogs/VerifyApiDialog/index.tsx`
- `src/components/dialogs/VerifyCliSupportDialog/index.tsx`
- `src/features/ModelList/components/BatchVerifyModelsDialog.tsx`
- `src/features/ModelList/hooks/useModelData.ts`
- `src/services/modelList/accountSources/tokenScopedFallback.ts`
- related tests under `tests/components`, `tests/features/ModelList`, and
  `tests/services/modelList`.

Work:

- Pass `AccountRuntimeKey` through runtime verification and model probing.
- Remove token-shaped assumptions from runtime-key fallback state.
- Keep token-specific metadata only where the source is an account token.

### Slice 3: Key Management Entry Model

Files:

- `src/features/KeyManagement/types.ts`
- `src/features/KeyManagement/utils.ts`
- `src/features/KeyManagement/hooks/useKeyManagement.ts`
- `src/features/KeyManagement/components/TokenList.tsx`
- `src/features/KeyManagement/components/BatchCliProxyExportDialog.tsx`
- `src/features/KeyManagement/components/ServiceCredentialCard.tsx`
- related Key Management tests.

Work:

- Make Key Management entries wrap `AccountRuntimeKey`.
- Remove feature-local service credential transient token builders.
- Keep token CRUD controls source/capability gated.
- Keep service credential rotate controls source/capability gated.

### Slice 4: Export And Profile Destinations

Files:

- `src/features/TokenProvisioning/utils/apiCredentialProfileSaveAction.tsx`
- `src/services/managedSites/tokenBatchExport.ts`
- `src/types/managedSiteTokenBatchExport.ts`
- related tests.

Work:

- Accept `AccountRuntimeKey` for mixed export/profile flows.
- Delete destination-local service-credential branching where normalized runtime
  key fields are enough.
- Keep source-specific channel matching or token id fields only where the
  destination contract genuinely requires them.

### Slice 5: Copy And Cleanup

Files:

- Locale files under `src/locales/**` if visible copy changes.
- Any remaining tests or helper modules that still call runtime keys tokens.

Work:

- Rename visible and internal mixed-flow wording from token to runtime key where
  appropriate.
- Remove obsolete compatibility helpers.
- Run a final grep for new fake-token ids and service-credential token wording.

## Testing Strategy

Core tests:

- account token maps to an account-token runtime key with stable id, token id,
  account identity, base URL, label, secret, and token capabilities;
- service credential maps to a service-credential runtime key with stable id,
  service id, account identity, service base URL override, label, secret, and no
  token CRUD capabilities;
- empty or unauthenticated service credential maps to inactive/unknown behavior
  without creating a fake token id;
- legacy conversion is covered only in tests for legacy edges.

Flow tests:

- verification dialogs list and resolve runtime keys from both source kinds;
- Model List fallback loads runtime catalogs for account-token and
  service-credential runtime keys without checking adapter internals in React
  hooks;
- Key Management selection/export uses runtime-key ids and still blocks token
  CRUD for service credentials;
- API credential profile save and CLIProxy export use normalized runtime-key
  fields;
- managed-site export uses service-credential base URL where appropriate and
  does not call token secret resolution for service credentials.

Quality checks:

```bash
pnpm vitest run tests/services/accounts/accountRuntimeKeys.test.ts
pnpm vitest run tests/services/accounts/apiServiceRequest.test.ts
pnpm vitest run tests/entrypoints/options/pages/KeyManagement/useKeyManagement.test.tsx
pnpm vitest run tests/entrypoints/options/pages/ModelList/useModelData.test.tsx
pnpm vitest run tests/features/TokenProvisioning/utils/apiCredentialProfileSaveAction.test.ts
pnpm vitest run tests/services/managedSites/tokenBatchExport.test.ts
pnpm compile
pnpm run validate:staged
pnpm run validate:push
```

`validate:push` is required before publishing or handing off an implementation
branch because this migration changes shared service contracts and export
surfaces where `knip` frequently catches stale compatibility exports.

## Done Criteria

- Mixed runtime/read/export flows consume `AccountRuntimeKey` directly.
- `AccountToken` is reserved for real token resources and token CRUD behavior.
- `AccountServiceCredential` is reserved for backend adapter facts and
  service-credential-specific actions.
- No product flow creates a fake token id for service credentials except inside
  explicitly named legacy edge conversion helpers.
- React/UI code consumes product policy and runtime-key capabilities rather than
  branching on raw `serviceCredential && !keyManagement`.
- Tests cover the runtime-key interface instead of only asserting transient
  token shapes.
