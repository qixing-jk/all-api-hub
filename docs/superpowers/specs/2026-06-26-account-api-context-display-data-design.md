# Account API Context And Display Data Ownership Design

Date: 2026-06-26

## Purpose

Move account request enrichment out of legacy `apiService/common` and make the
account data layers explicit.

The current behavior works, but the ownership is confusing:

- `DisplaySiteData` is named like a display-only DTO, while it also carries
  account operation fields such as `baseUrl`, `token`, `userId`, `authType`,
  and `cookieAuthSessionCookie`.
- `apiService/common` silently looks up `accountStorage` when a request is
  missing `accountId`, then fills `accountId` and cookie-auth session data.
- Some workflows need the latest persisted `SiteAccount`, while immediate UI
  actions already have a current display-account snapshot.

This spec keeps behavior compatible while establishing a clearer seam:
account-owned code prepares account API context; adapter/protocol code consumes
prepared requests and does not query storage.

## Current Context

Current relevant modules:

- `src/types/index.ts`
  - `SiteAccount` is the persisted canonical account shape.
  - `DisplaySiteData` is produced from `SiteAccount` for UI use, but includes
    operation fields needed by account actions.
- `src/services/accounts/accountStorage.ts`
  - owns `SiteAccount` persistence and normalization;
  - exposes `convertToDisplayData(...)`, `resolveDisplayData(...)`, and
    `getDisplayDataById(...)`;
  - currently maps `cookieAuth.sessionCookie` to
    `DisplaySiteData.cookieAuthSessionCookie`.
- `src/services/accounts/utils/apiServiceRequest.ts`
  - already contains `createDisplayAccountApiContext(...)`;
  - builds `ApiServiceRequest` from `DisplaySiteData`-like input;
  - adds account-site session decoration such as Sub2API auth session when the
    account-site profile requires it.
- `src/services/apiTransport/type.ts`
  - defines `ApiServiceRequest` / `ApiTransportRequest`;
  - includes `accountId`, auth config, `cookieAuthSessionCookie`, and
    fetch-context fields.
- `src/services/apiService/common/utils.ts`
  - imports `accountStorage`;
  - `resolveAccountAwareRequest(...)` searches by `baseUrl` and `userId` when
    `accountId` is absent;
  - `fetchApi(...)` and `fetchApiData(...)` call that resolver before transport.
- `src/services/apiService/common/index.ts`
  - imports `accountStorage` and `UI_CONSTANTS`;
  - `fetchTodayIncome(...)` uses persisted account data to choose exchange-rate
    conversion.

## Problem

The current seam makes account identity and request enrichment implicit.

Friction:

1. `apiService/common` looks like a protocol Module, but it also owns account
   persistence fallback. That means adapter-readiness can still depend on
   hidden storage behavior rather than explicit Site Adapter Capability inputs.
2. Looking up by `baseUrl + userId` is weaker than using stable `accountId`.
   It is useful only as migration compatibility for existing callers that do
   not yet carry account identity. New account API flows should always enter
   through `accountId` or a display snapshot whose `id` is present.
3. `DisplaySiteData` has become a UI account snapshot, not a pure display DTO.
   That is acceptable for current UI workflows, but dangerous if service and
   protocol Modules keep accepting it as a general account object.
4. Some workflows should re-read the latest `SiteAccount` by id, while others
   can safely use a just-loaded UI snapshot. The current layering does not make
   that choice explicit.
5. `DisplaySiteData.id` already is the stable account id, while
   `DisplaySiteData.accountId?: string` duplicates identity and invites
   inconsistent callers.

Deletion test: if `resolveAccountAwareRequest(...)` disappeared from
`apiService/common`, the missing behavior should reappear once in an
accounts-owned request-context Module, not across every adapter or feature.

## Goals

- Remove account-storage lookup from `apiService/common` request helpers.
- Create an accounts-owned request-context Interface for account API calls.
- Treat `SiteAccount` as canonical persisted account data.
- Treat `DisplaySiteData` as a UI account snapshot, not as a deep service
  Interface.
- Preserve immediate UI flows that can build a request from a current
  `DisplaySiteData` snapshot without unnecessary storage reads.
- Require stable `accountId` in every new Account API context. Long-lived
  workflows, background work, retries, repairs, scheduled jobs, and any flow
  that only needs identity should store and pass `accountId`, not
  `baseUrl + userId`.
- Keep legacy `baseUrl + userId` lookup as a narrow compatibility path only
  when preserving current behavior requires it.
- Keep existing cookie-auth session behavior.
- Establish a gradual path for reducing `DisplaySiteData` as a catch-all type.

## Non-Goals

- Do not immediately delete operation fields from `DisplaySiteData`.
- Do not rename `DisplaySiteData` in the first implementation slice.
- Do not force every UI click to re-query `accountStorage`.
- Do not change persisted `SiteAccount` schema.
- Do not change account detection, account import, or account save behavior.
- Do not change adapter protocol behavior except for making request enrichment
  explicit.
- Do not add telemetry, settings search entries, or Playwright E2E tests by
  default.
- Do not remove legacy `baseUrl + userId` compatibility until all callers are
  migrated to explicit account context or proven not to need it.

## Vocabulary

Use these terms in implementation and follow-up specs:

- **SiteAccount**: canonical persisted account record.
- **Display account snapshot**: the existing `DisplaySiteData` read model
  produced for UI lists, dialogs, filtering, and immediate user actions.
- **Account API context**: prepared account-operation data used by adapters and
  protocol helpers. It includes stable account identity and an
  `ApiServiceRequest`.
- **Account API capability context**: the existing display-account context that
  resolves the site adapter capabilities together with the prepared request.
- **Stored account context**: an Account API context resolved from
  `accountId` by reading the latest `SiteAccount`.
- **Snapshot account context**: an Account API context built from a current
  display account snapshot without another storage read.

## Approaches Considered

### Approach A: Make `DisplaySiteData` Pure Display Immediately

This would remove `token`, `userId`, `authType`, and
`cookieAuthSessionCookie` from `DisplaySiteData` and force operation callers to
resolve `SiteAccount` separately.

This has clean naming, but it is too broad for the next slice. Many UI flows
use `DisplaySiteData` for immediate actions, and changing all of them at once
would create a high-risk migration with little short-term user benefit.

This should not be the first step.

### Approach B: Keep `DisplaySiteData` As The Main Account Interface

This keeps implementation cheap, but it codifies the current problem. New
service Modules would keep accepting a wide UI snapshot and would continue to
learn too much about UI-derived account data.

This should not be the next step.

### Approach C: Add An Account API Context Seam And Gradually Narrow
`DisplaySiteData`

This is the recommended path.

Keep `DisplaySiteData` fields stable for existing UI behavior, but stop passing
the whole type into new service/protocol seams. Introduce accounts-owned
context builders that turn either `accountId` or a display account snapshot
into a prepared Account API context.

This creates Locality for account request policy, keeps UI flows ergonomic, and
lets later slices reduce `DisplaySiteData` safely. The request-context seam
should sit below the existing capability context so current token-management
callers do not need a broad migration merely to keep using adapter
capabilities.

## Design

### 1. Define Account API Context In The Accounts Module

Create or extend an accounts-owned Module, likely
`src/services/accounts/utils/apiServiceRequest.ts`.

Add a request-only Interface that makes the source explicit:

```ts
export interface AccountApiContext {
  accountId: string
  siteType: AccountSiteType
  request: ApiServiceRequest
}

export async function resolveStoredAccountApiContext(
  accountId: string,
): Promise<AccountApiContext>

export function createDisplayAccountRequestContext(
  account: DisplayAccountApiSnapshot,
): AccountApiContext
```

`DisplayAccountApiSnapshot` should be a narrow structural type, not the full
`DisplaySiteData` Interface:

```ts
export type DisplayAccountApiSnapshot = Pick<
  DisplaySiteData,
  | "id"
  | "siteType"
  | "baseUrl"
  | "authType"
  | "userId"
  | "token"
  | "cookieAuthSessionCookie"
>
```

This lets current UI callers pass `DisplaySiteData` structurally while making
new service APIs depend only on the fields they actually need.

The existing `createDisplayAccountApiContext(...)` should stay as the
capability context unless a later migration explicitly renames it:

```ts
export interface DisplayAccountApiCapabilityContext {
  adapter: SiteAdapter
  keyManagement: KeyManagementCapability | undefined
  tokenProvisioning: TokenProvisioningCapability | undefined
  request: ApiServiceRequest
}
```

It should call `createDisplayAccountRequestContext(...)` internally and then
attach `adapter`, `keyManagement`, and `tokenProvisioning`. This preserves
current callers that destructure capabilities while giving new account-owned
workflows a smaller request-only seam.

### 2. Resolve Stored Account Context By Stable Account Id

`resolveStoredAccountApiContext(accountId)` should:

1. reject a missing or blank `accountId`;
2. read the latest `SiteAccount` from `accountStorage`;
3. normalize it through existing storage normalization;
4. build `ApiServiceRequest` from canonical account fields;
5. set `request.accountId` from the stored account id;
6. apply account-site profile request decoration, such as Sub2API auth session;
7. include the same cookie-auth session value currently added by
   `DisplaySiteData.cookieAuthSessionCookie`;
8. throw a typed or clearly named error if the account no longer exists or is
   not usable for account API requests.

The stored path and snapshot path should share the same request builder after
their input data is normalized. New request contexts should place the session
cookie in `request.auth.cookie`, matching the current display-account builder.
Top-level `request.cookieAuthSessionCookie` should be kept only where needed to
preserve legacy prepared requests during migration.

The stored path must not fall back to `baseUrl + userId` lookup. Its contract is
stable account identity in, latest stored account context out. Any origin
matching behavior needed to preserve old callers belongs only in the legacy
compatibility helper described below.

Use this path for:

- background refresh;
- scheduled jobs;
- retries;
- repair flows;
- post-save workflows;
- long-running flows;
- flows that already carry only `accountId`.

### 3. Build Snapshot Account Context Without A Storage Read

`createDisplayAccountRequestContext(account)` should build the snapshot request
without querying `accountStorage`. `createDisplayAccountApiContext(account)`
should remain available for callers that need adapter capabilities, and it also
must not query `accountStorage`.

The snapshot path should treat `account.id` as required and write it to
`request.accountId`. A snapshot without an id is not a valid Account API context
and should fail before reaching adapter or transport code.

Use this path for immediate UI operations when the UI already has a current
display account snapshot:

- opening token dialogs;
- copying a key from the current account row;
- starting a Model List account-key dialog;
- opening managed-site channel dialog from a visible account action.

The snapshot path is not canonical. It is a convenience for current UI state.
Any follow-up retry, background task, or persisted job should store the
`accountId` and resolve a stored context later.

### 4. Move Legacy Request Enrichment Out Of `apiService/common`

Remove `accountStorage` import from `src/services/apiService/common/utils.ts`.

`fetchApi(...)` and `fetchApiData(...)` should call transport with the request
they receive. They should not:

- look up accounts;
- infer account identity by `baseUrl + userId`;
- fill `accountId`;
- fill `cookieAuthSessionCookie`.

During migration, if hidden lookup must remain for compatibility, move it to an
accounts-owned compatibility helper such as:

```ts
export async function resolveLegacyAccountAwareRequest(
  request: ApiServiceRequest,
  context?: { endpoint?: string },
): Promise<ApiServiceRequest>
```

That helper may use `baseUrl + userId`, including the existing profile-origin
matching behavior, but it should be documented as legacy and should live under
`src/services/accounts/**`, not under `apiService/common`. Keep endpoint/log
context available so warnings for missing `accountId` remain diagnosable during
migration.

New call sites should not use the legacy helper. Delete it only after current
callers are migrated to explicit Account API context or an `rg`/test pass proves
they never need account-owned request enrichment.

### 5. Treat `fetchTodayIncome(...)` As Account-Owned Policy

`fetchTodayIncome(...)` currently needs persisted account exchange-rate data.
That logic should not stay hidden inside a generic common protocol Module.

Preferred direction:

- keep the backend request itself in the protocol adapter;
- move exchange-rate selection and persisted-account lookup to an
  accounts-owned refresh/income orchestration helper;
- pass the chosen exchange rate into the parser or result-normalization helper.

If this is too large for the first implementation slice, keep it as an explicit
second task after request enrichment moves out of `common/utils.ts`.

The first implementation plan must make this boundary explicit. If
`fetchTodayIncome(...)` is not moved in the first slice, then
`apiService/common/index.ts` remains a documented temporary exception to the
broader "no account storage in protocol/common" direction. Do not claim the
whole `apiService/common` package is storage-free until this exception is
removed.

### 6. Clarify `DisplaySiteData` Ownership Without Immediate Field Deletion

Short-term rules:

- Do not add new non-display or protocol fields to `DisplaySiteData`.
- Do not introduce new deep service Interfaces that accept full
  `DisplaySiteData`.
- New account-operation helpers should accept `accountId`,
  `AccountApiContext`, or a narrow `Pick<DisplaySiteData, ...>`.
- Treat `DisplaySiteData.id` as the account id.
- Do not use `DisplaySiteData.accountId` for new code. It duplicates `id` and
  should be considered migration debt.

The existing operation fields may remain for now:

- `baseUrl`
- `token`
- `userId`
- `authType`
- `cookieAuthSessionCookie`
- `siteType`

They are operation snapshot fields, not proof that `DisplaySiteData` is the
canonical account model.

### 7. Gradual Evolution Direction For `DisplaySiteData`

After the Account API context seam is in place, evolve in small steps:

1. Replace deep `DisplaySiteData` parameters with narrow structural types.
2. Replace long-lived workflow inputs with `accountId`.
3. Replace repeated request-building code with `AccountApiContext` builders.
4. Stop reading `DisplaySiteData.accountId`; use `id`.
5. Consider a type alias or rename when consumers are narrower:
   - `DisplayAccountSnapshot`;
   - `AccountViewData`;
   - `AccountListItemData`.
6. Only then consider deleting operation fields from the display read model, if
   enough call sites no longer need them.

This keeps the migration progressive rather than making one broad UI type
rewrite.

## Data Flow

### Immediate UI Operation

```text
Account list state
  -> DisplaySiteData snapshot
  -> createDisplayAccountRequestContext(snapshot)
     or createDisplayAccountApiContext(snapshot) when adapter capabilities are needed
  -> Site Adapter Capability / apiService protocol
  -> transport
```

No storage read is required in this path.

### Background Or Long-Lived Operation

```text
Stored job / retry / scheduler
  -> accountId
  -> resolveStoredAccountApiContext(accountId)
  -> latest SiteAccount from accountStorage
  -> AccountApiContext
  -> Site Adapter Capability / apiService protocol
  -> transport
```

This path intentionally re-reads storage.

### Legacy Compatibility Path

```text
Legacy caller without accountId
  -> accounts-owned resolveLegacyAccountAwareRequest(...)
  -> baseUrl + userId lookup
  -> prepared ApiServiceRequest
  -> apiService protocol
```

This path should shrink over time and should not be used by new code.

## Error Handling

`resolveStoredAccountApiContext(accountId)` should fail explicitly when:

- the account id is missing;
- the account no longer exists;
- the account has no usable base URL;
- the account has no usable account identity;
- the account auth type requires credentials that are absent.

Errors should be stable enough for callers to map to user-facing recovery
messages, but they must not include tokens, cookies, or raw backend messages.

Snapshot context creation may keep current behavior at first, but follow-up
work should consider the same validation rules currently used by
`canManageDisplayAccountTokens(...)`.

## Testing Strategy

Add focused tests for the accounts-owned context Module:

- `createDisplayAccountApiContext(...)` builds the same request shape from a
  display account snapshot as today;
- `createDisplayAccountRequestContext(...)` returns the request-only context,
  while `createDisplayAccountApiContext(...)` preserves the existing adapter
  capability context shape;
- cookie-auth session data from the snapshot is preserved;
- Sub2API auth session decoration still applies when the profile requires it;
- `resolveStoredAccountApiContext(accountId)` reads the latest stored account;
- stored context uses canonical `SiteAccount` fields, not stale display data;
- missing account id or deleted account returns a stable error;
- legacy `baseUrl + userId` compatibility, if retained, lives under accounts
  helpers and preserves current cookie-session fallback.
- existing `apiService/common/utils.ts` missing-`accountId` tests are either
  moved to the accounts-owned legacy helper or deleted only after all relevant
  callers are migrated to explicit account context.

Update protocol tests:

- `apiService/common/utils.ts` no longer mocks or imports `accountStorage`;
- `fetchApi(...)` and `fetchApiData(...)` pass prepared requests through
  unchanged.

Update impacted feature/service tests only where their input seam changes:

- immediate UI paths can still build request context from display snapshots;
- background/repair/refresh paths resolve by `accountId`.

Focused validation should start with affected tests around
`accounts/utils/apiServiceRequest`, `apiService/common/utils`, and the first
migrated callers. Run `pnpm run validate:staged` before committing an
implementation slice.

Run `pnpm run validate:push` before publishing a slice that changes shared
exports, adapter contracts, or account request wiring.

## Telemetry Decision

Telemetry decision: none.

This is an internal ownership and request-context refactor. It does not add a
new user action or observable product state.

## Settings Search Decision

Settings search decision: none.

No settings UI, anchors, or deep links change.

## E2E Decision

E2E decision: no new Playwright E2E by default.

The primary risk is request-context construction and storage lookup ownership,
which is better covered by focused unit tests. Add E2E only if an
implementation slice changes cross-entrypoint browser behavior or extension
runtime transport behavior.

## Rollout

1. Add `AccountApiContext`, `DisplayAccountApiSnapshot`, and request-only
   builders under `src/services/accounts/utils/apiServiceRequest.ts`.
2. Keep `createDisplayAccountApiContext(...)` as the capability context and
   have it call the request-only builder internally.
3. Add `resolveStoredAccountApiContext(accountId)` and focused tests.
4. Move legacy missing-`accountId` enrichment from `apiService/common/utils.ts`
   into an accounts-owned compatibility helper, or delete it if all current
   callers are migrated in the same slice.
5. Update `apiService/common/utils.ts` to stop importing `accountStorage`.
6. Migrate the first narrow caller group to explicit request-context builders
   where they do not need adapter capabilities; leave capability consumers on
   `createDisplayAccountApiContext(...)` until a later targeted migration.
7. Decide the `fetchTodayIncome(...)` boundary in the first implementation
   plan: either move exchange-rate/account lookup out of generic
   `apiService/common` in the same slice, or document
   `src/services/apiService/common/index.ts` as the remaining temporary
   `accountStorage` exception.
8. Add lint/ownership checks or `rg` review commands in the plan so
   `apiService/common` does not regain `accountStorage` imports.
9. Gradually replace deep `DisplaySiteData` parameters with `accountId`,
   `AccountApiContext`, or narrow snapshot types.
10. Consider renaming or splitting `DisplaySiteData` only after consumers no
   longer treat it as a general service object.

## Migration Checks

Use these checks during implementation:

```powershell
rg "accountStorage" src/services/apiService/common
rg "getAccountByBaseUrlAndUserId" src/services/apiService src/services/apiAdapters
rg "DisplaySiteData" src/services/apiService src/services/apiAdapters src/services/apiTransport
rg "accountId\\?:" src/types/index.ts src/services src/features
rg "createDisplayAccountRequestContext|createDisplayAccountApiContext|resolveStoredAccountApiContext|resolveLegacyAccountAwareRequest" src tests
```

Expected direction:

- no `accountStorage` imports in `apiService/common/utils.ts`;
- no `accountStorage` imports in the rest of `apiService/common` once the
  `fetchTodayIncome(...)` exception is moved;
- no new full-`DisplaySiteData` parameters in protocol or adapter Modules;
- new account operations choose either stored context by `accountId` or snapshot
  context by narrow display-account fields;
- capability consumers may keep using `createDisplayAccountApiContext(...)`,
  but request-only consumers should prefer `AccountApiContext`;
- `DisplaySiteData.accountId` is not used by new code;
- legacy `baseUrl + userId` lookup is isolated, logged with enough request
  context to diagnose, and shrinking.

## Follow-Up, Not In Scope For The First Slice

- Rename `DisplaySiteData` to a more honest account snapshot/read-model name.
- Delete operation fields from `DisplaySiteData`.
- Remove legacy `baseUrl + userId` account lookup after all callers carry
  explicit identity.
- Move `fetchTodayIncome(...)` exchange-rate policy if it is not included in
  the first implementation slice.
- Add static ownership enforcement for protocol Modules if repeated drift
  appears.

The intended seam split is: storage owns canonical `SiteAccount`; accounts
application code builds Account API context; UI consumes display account
snapshots; adapters and protocol Modules consume prepared requests without
querying account storage.
