# API Adapter Site Announcements Design

Date: 2026-06-17

## Purpose

Introduce the first narrow `apiAdapters` slice for site announcements so
backend-specific announcement behavior no longer has to pretend it belongs to
the flat `apiService/common` Interface.

This spec intentionally uses site announcements as the first capability because
the current code already has two real Adapter shapes:

- One API / New API compatible sites expose a public site notice string through
  `/api/notice`.
- Sub2API exposes account-scoped announcement records with read-state
  operations under `/api/v1/announcements`.

Those are different Interfaces. The new Seam should keep them explicit while
letting the existing `siteAnnouncements` feature continue to present one
product-level announcement model to UI callers.

## Current Context

`src/services/apiService/index.ts` currently builds its public Interface by
iterating exports from `src/services/apiService/common/index.ts`. Site-specific
modules can override helpers, and strict override sites such as Sub2API and
AIHubMix throw when a requested common helper is missing.

That model works for helpers that are genuinely common-compatible. It becomes
shallow when a site has a capability that is not part of the One API / New API
family Interface.

The current announcement path shows the problem clearly:

- `common.fetchSiteNotice(request)` owns the compatible `/api/notice` behavior.
- `common.fetchSub2ApiAnnouncements(...)` and
  `common.markSub2ApiAnnouncementRead(...)` are placeholders that exist only so
  the flat `getApiService(...)` Interface can expose Sub2API-specific names.
- `sub2api.fetchSub2ApiAnnouncements(...)` and
  `sub2api.markSub2ApiAnnouncementRead(...)` contain the real Sub2API
  implementation.
- `src/services/siteAnnouncements/providers.ts` calls the old flat
  `getApiService(...)` Interface for both the common notice provider and the
  Sub2API announcement provider.

The repository already has a product-level `siteAnnouncements` Module with
types, provider aggregation, storage, scheduling, read-state handling, and UI.
That Module should stay the owner of product-level announcement presentation.
The new Adapter layer should only expose truthful backend capabilities to feed
that existing Module.

## Problem

The current Module split creates friction:

1. `common` is overloaded. It is both a One API / New API compatible
   Implementation and the source of the flat project-wide Interface.
2. Sub2API-specific functions are forced into `common` as placeholder
   Implementations even though common-compatible sites do not support them.
3. The `siteAnnouncements` provider Module must know old flat helper names
   instead of asking a site Adapter which announcement capabilities it supports.
4. Tests can only prove the old wrapper behavior. They cannot directly test the
   new desired Seam because it does not exist yet.

Deletion test: if the Sub2API announcement placeholders were deleted today,
the complexity would reappear in `siteAnnouncements/providers.ts` as either a
direct `sub2api` import or more `getApiService` widening. That means the
current placeholder Module is not deep; it is only preserving the old flat
Interface.

## Goals

- Create a small `src/services/apiAdapters/` registry as the new Seam for
  migrated account-site backend capabilities.
- Add only the announcement capabilities needed for the first slice:
  `siteNotice` and `siteAnnouncements`.
- Keep `apiService` as a compatibility facade during migration. Do not broaden
  `apiService/index.ts` to host Adapter-only capabilities.
- Move Sub2API announcement calls behind a Sub2API Adapter capability.
- Wrap the existing common-compatible `/api/notice` helper behind a New API
  family Adapter capability.
- Update the existing `siteAnnouncements` provider Module to consume
  `getSiteAdapter(siteType)` instead of the old flat announcement helpers.
- Remove the Sub2API announcement placeholder helpers from `common` once no
  caller needs them.
- Add focused tests for the new Seam and for the provider Module's behavior.

## Non-Goals

- Do not migrate model pricing, model catalog, redemption, account, key
  management, managed-site operations, or token resolution in this slice.
- Do not replace `getApiService(...)` for existing callers outside
  `siteAnnouncements`.
- Do not introduce a giant `SiteAdapter` Interface with every future
  capability predeclared.
- Do not directly import `src/services/apiService/sub2api/index.ts` from
  `src/services/siteAnnouncements/providers.ts`.
- Do not create a parallel site-announcements feature, storage model, scheduler,
  notification path, or UI.
- Do not rename `fetchSiteNotice` to a broader announcement name unless its
  Interface actually changes.
- Do not add user-facing copy or locale keys. This is an architecture slice
  that should preserve current behavior.
- Do not change Sub2API announcement endpoint behavior, read-state semantics,
  JWT refresh behavior, or auth recovery behavior.

## Design

### 1. Add A Narrow `apiAdapters` Module

Create a new Module tree:

```text
src/services/apiAdapters/
  contracts/
    siteAdapter.ts
    siteNotice.ts
    siteAnnouncements.ts
  newApi/
    index.ts
    siteNotice.ts
  sub2api/
    index.ts
    siteAnnouncements.ts
  registry.ts
```

This file list is intentionally small. It establishes the Seam without
pretending the whole `apiService` surface is ready to migrate.

Responsibilities:

- `contracts/siteAdapter.ts` defines the minimal Adapter Interface for this
  slice.
- `contracts/siteNotice.ts` defines the common-compatible site notice
  capability.
- `contracts/siteAnnouncements.ts` defines the account-scoped announcement list
  and mark-read capability.
- `newApi/siteNotice.ts` wraps the existing `common.fetchSiteNotice`.
- `sub2api/siteAnnouncements.ts` wraps the existing Sub2API announcement
  helpers.
- `registry.ts` maps an `AccountSiteType` to the right Adapter.

The external Interface should be small:

```ts
export type SiteAdapter = {
  siteType: AccountSiteType
  family?: "newApiFamily" | "sub2api"
  siteNotice?: SiteNoticeCapability
  siteAnnouncements?: SiteAnnouncementsCapability
}
```

Capability presence is the support signal. A missing capability means the
Adapter does not support that operation in this slice.

### 2. Keep `siteNotice` And `siteAnnouncements` Separate

The two capabilities must stay separate because callers have to know different
facts to use them correctly.

`siteNotice`:

- fetches a public site notice string or `null`
- uses the existing `ApiServiceRequest`
- normalizes empty, malformed, failed, or missing `/api/notice` responses as
  no notice through the existing common helper
- does not expose mark-read

Proposed contract:

```ts
export type SiteNoticeCapability = {
  fetch(request: ApiServiceRequest): Promise<string | null>
}
```

`siteAnnouncements`:

- fetches normalized Sub2API announcement records through the existing Sub2API
  backend implementation
- supports unread-only fetch options
- supports best-effort mark-read by upstream announcement id
- depends on authenticated Sub2API request semantics already implemented in
  `src/services/apiService/sub2api/index.ts`

Proposed contract:

```ts
export type SiteAnnouncementsFetchOptions = {
  unreadOnly?: boolean
}

export type MarkSiteAnnouncementReadRequest = {
  request: ApiServiceRequest
  id: string | number
}

export type SiteAnnouncementsCapability = {
  fetch(
    request: ApiServiceRequest,
    options?: SiteAnnouncementsFetchOptions,
  ): Promise<Sub2ApiAnnouncementData[]>
  markRead(request: MarkSiteAnnouncementReadRequest): Promise<boolean>
}
```

This contract may reuse `Sub2ApiAnnouncementData` for the first slice because
only Sub2API implements this backend capability today. Product-level
normalization into `SiteAnnouncement` remains in
`src/services/siteAnnouncements/providers.ts`.

### 3. Registry Behavior

Add:

```ts
export function getSiteAdapter(siteType: AccountSiteType): SiteAdapter
```

Initial registry behavior:

- `SITE_TYPES.SUB2API` returns `sub2apiAdapter` with `siteAnnouncements`.
- One API / New API compatible account site types return `newApiAdapter` with
  `siteNotice`.
- Unknown account site type values use the same fallback as the current
  `getApiService` behavior: compatible site notice support through
  `newApiAdapter`.

The first compatible set should include:

- `one-api`
- `new-api`
- `Veloera`
- `one-hub`
- `done-hub`
- `v-api`
- `VoAPI`
- `Super-API`
- `Rix-Api`
- `neo-Api`
- `anyrouter`
- `wong-gongyi`
- `unknown`

AIHubMix should not receive `siteNotice` in this first slice unless current
behavior already routes it through the common provider. If the existing provider
selection treats AIHubMix as common, preserve that behavior through
`newApiAdapter` for compatibility and document it in the registry test. Do not
invent AIHubMix-specific announcement behavior in this slice.

### 4. Provider Integration

Update `src/services/siteAnnouncements/providers.ts` so provider Implementations
ask the Adapter registry for capabilities:

- `commonSiteAnnouncementProvider.fetch(...)` calls
  `getSiteAdapter(request.siteType).siteNotice?.fetch(...)`.
- If `siteNotice` is missing, it returns the same unsupported result shape that
  the current catch path returns.
- `sub2ApiSiteAnnouncementProvider.fetch(...)` calls
  `getSiteAdapter(SITE_TYPES.SUB2API).siteAnnouncements?.fetch(...)`.
- If `siteAnnouncements` is missing for Sub2API, it returns an error result
  with a local implementation error message.
- `sub2ApiSiteAnnouncementProvider.markRead(...)` calls
  `siteAnnouncements.markRead({ request: request.apiRequest, id })`.

Keep all product-level normalization where it is today:

- provider keys
- timestamp parsing
- text normalization
- fingerprinting
- filtering empty records
- partial mark-read failure logging
- full-batch failure propagation

This preserves Locality: backend protocol calls move behind the Adapter Seam,
while product announcement presentation stays inside the existing
`siteAnnouncements` Module.

### 5. Remove Old Placeholders From `common`

After provider integration, remove these from
`src/services/apiService/common/index.ts`:

- `fetchSub2ApiAnnouncements`
- `markSub2ApiAnnouncementRead`
- the now-unused `Sub2ApiAnnouncementData` import

Do not remove the real Sub2API functions. They remain the backend
Implementation wrapped by the new Sub2API Adapter.

Do not modify `src/services/apiService/index.ts` for this slice unless TypeScript
or tests reveal an import/export issue directly caused by deleting the common
placeholders.

## Module Responsibilities

`apiAdapters` owns backend capability Interfaces and Adapter Implementations for
this migrated slice.

`apiService` remains the old compatibility facade and transport/helper layer for
unmigrated functionality.

`siteAnnouncements` owns product-level announcement aggregation:

- choosing the provider for a site type
- normalizing backend payloads to `SiteAnnouncement`
- deriving statuses
- managing local read-state fallback through its existing scheduler/storage
  Modules

This split is the main source of Leverage: feature callers interact with one
product Module, while backend-specific details are concentrated at the Adapter
Seam.

## Error Handling

Provider result behavior should stay compatible:

- common notice fetch success with blank or missing notice returns success with
  an empty `announcements` array
- common notice unsupported or missing capability returns unsupported with an
  empty `announcements` array
- Sub2API fetch failure returns error with an empty `announcements` array
- Sub2API mark-read partial failures are logged and do not fail the whole batch
- Sub2API mark-read full-batch failures throw the first error or a safe wrapped
  error, matching existing behavior

Adapter capabilities should not translate product statuses. They should either
return backend data or throw backend-level errors. Product statuses stay in the
provider Module.

## Telemetry Decision

Telemetry decision: none.

This slice is an internal architecture migration. It should preserve existing
user-visible behavior and does not add a new user action, setting, background
flow, or product funnel. If a future slice changes announcement visibility,
notification delivery, read-state sync, or user recovery actions, make a new
telemetry decision in that feature-level spec.

## Testing Strategy

Add focused unit tests for the new Seam:

- registry returns a Sub2API Adapter with `siteAnnouncements`
- registry returns a New API family Adapter with `siteNotice`
- registry preserves the current fallback behavior for unknown or compatible
  account site types
- Sub2API Adapter delegates fetch to `fetchSub2ApiAnnouncements` with
  `unreadOnly`
- Sub2API Adapter delegates mark-read to `markSub2ApiAnnouncementRead`
- New API Adapter delegates site notice fetch to `fetchSiteNotice`

Update existing provider tests:

- mock `~/services/apiAdapters/registry` instead of `~/services/apiService`
- common provider uses `siteNotice.fetch`
- missing common `siteNotice` capability returns unsupported
- Sub2API provider uses `siteAnnouncements.fetch`
- missing Sub2API `siteAnnouncements` capability returns an error result
- mark-read calls `siteAnnouncements.markRead`
- existing normalization, fallback timestamp, empty-record filtering, partial
  failure, full failure, no-id skip, and title-only tests continue to pass

Update old `apiService` tests only if deleting the common placeholders changes
the mocked common export surface. Do not add tests that assert Sub2API
announcement helpers still exist on `getApiService(...)`.

E2E decision: no Playwright E2E for this slice. The risk is Module routing and
provider behavior, both covered by Vitest. No browser entrypoint, storage,
notification, or UI behavior should change.

## Validation Plan

Focused validation:

```powershell
pnpm vitest run tests/services/siteAnnouncements/providers.test.ts tests/services/apiService/sub2api/index.test.ts tests/services/apiService/common/index.test.ts tests/services/apiService/index.test.ts
```

Related validation:

```powershell
pnpm vitest related --run src/services/apiAdapters/registry.ts src/services/siteAnnouncements/providers.ts src/services/apiService/common/index.ts
```

Commit gate:

```powershell
pnpm run validate:staged
```

Run `pnpm run validate:push` before pushing or opening a PR if the
implementation introduces broad export wiring, shared type changes used outside
this slice, or dependency graph changes that make `compile` / `knip` risk
material.

## Rollout

1. Add the Adapter contracts and registry with tests.
2. Add New API family `siteNotice` and Sub2API `siteAnnouncements` Adapters with
   delegation tests.
3. Update `siteAnnouncements/providers.ts` to call `getSiteAdapter(...)`.
4. Remove Sub2API announcement placeholders from `common`.
5. Run focused tests and inspect the diff for accidental broader migration.
6. Commit the narrow architecture slice.

## Follow-Up, Not In Scope For This Spec

Later slices may migrate other concrete capabilities when there is a real
caller benefit:

- `modelCatalog` for runtime model discovery, especially Sub2API `/v1/models`
- `modelPricing` for pricing metadata
- `redemption` for redeem-code flows
- account identity and key management if the existing flat Interface continues
  to leak backend protocol differences

Each later slice should prove the Seam is real with at least two Adapters or a
caller that benefits from capability presence. Do not grow `apiAdapters` into a
second flat `apiService` Interface.
