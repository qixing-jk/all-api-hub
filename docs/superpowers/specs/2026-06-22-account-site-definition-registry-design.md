# Account Site Definition Registry Design

Date: 2026-06-22

## Purpose

Make a brand-new account site type faster and safer to add by introducing one
account-site definition registry that owns the stable registration facts for an
account site type.

Recent slices already moved the high-risk behavior behind narrower seams:

- `src/services/accountSiteOnboarding/` owns detection metadata, route
  metadata, adapter-family projection, and content-session extractors.
- `src/services/apiAdapters/` owns backend protocol facts after a site type is
  known.
- `src/services/accounts/accountSiteProfile/` owns saved-account product rules.
- `src/services/modelList/accountSources/` owns Model List account-source
  readiness.

Those seams reduce runtime branching, but adding a new account site type still
requires editing several registration surfaces in the right order. This spec
adds a deeper account-site definition Module so a new site type can start from
one definition row, while existing consumers continue to use their local seams.

This spec also includes narrow definition-owned policy cleanup. A raw
`SITE_TYPES` branch is in scope only when a future account site type would add a
third branch for the same product decision. Backend adapter implementations,
managed-site runtime behavior, response-source metadata, and persisted schema
names remain out of scope.

## Current Context

The current checkout has these relevant modules:

- `src/services/accountSiteOnboarding/siteTypes.ts`
  - owns `SITE_TYPES`, `ACCOUNT_SITE_TYPES`, `ACCOUNT_SITE_TYPE_VALUES`, and
    `MANAGED_SITE_TYPES`;
  - this file is the current type-union source.
- `src/constants/siteType.ts`
  - re-exports the onboarding site-type constants;
  - exposes compatibility helpers such as `isAccountSiteType(...)`,
    `isManagedSiteType(...)`, `ACCOUNT_SITE_TITLE_RULES`,
    `ACCOUNT_SITE_DOMAIN_RULES`, and `getAccountSiteApiRouter(...)`.
- `src/services/accountSiteOnboarding/metadata.ts`
  - owns static onboarding metadata, title/domain detection rules, route
    overrides, compat user-id header detection, and adapter-family metadata.
- `src/services/accountSiteOnboarding/registry.ts`
  - projects onboarding metadata to detection, route, adapter-family, and
    content-session extractor callers.
- `src/services/apiAdapters/registry.ts`
  - resolves adapter family to a concrete `SiteAdapter`.
- `src/services/accounts/accountSiteProfile/profiles.ts`
  - owns default saved-account product profile data and overrides for special
    account site types such as Sub2API, AIHubMix, and AnyRouter.
- `src/services/modelList/accountSources/readiness.ts`
  - combines account-site product profile policy with adapter capabilities to
    resolve direct-pricing, token-scoped runtime-catalog, or unsupported Model
    List routes.

This split is mostly correct by responsibility:

- onboarding metadata chooses and prepares a site type;
- adapters describe backend behavior after a site type is known;
- product profiles describe saved-account product semantics;
- Model List readiness selects the account-source loading route;
- UI modules render feature-local workflow state.

The missing piece is registration locality. A new account site type still has
to know which files provide the source facts and which files are only
compatibility facades.

## Problem

Adding a new account site type still has a fixed edit tax:

1. Add the literal to `SITE_TYPES`.
2. Add it to `ACCOUNT_SITE_TYPES` if account workflows are supported.
3. Add it to `MANAGED_SITE_TYPES` if managed-site workflows are supported.
4. Add onboarding metadata for detection, route overrides, compat headers, and
   adapter family.
5. Add or select product profile policy.
6. Confirm the adapter-family projection resolves to the intended
   `SiteAdapter`.
7. Confirm Model List readiness receives the expected product profile and
   adapter capabilities.
8. Search feature code for raw product-policy `SITE_TYPES` branches that would
   need another case.

The current modules are not wrong individually, but the interface for adding a
site type is shallow. The caller has to understand too many separate registry
surfaces.

Deletion test: if `accountSiteOnboarding/metadata.ts`,
`accountSiteProfile/profiles.ts`, and the account/managed type arrays were
deleted as independent registration surfaces, the complexity should not
reappear as a checklist in a plan. It should reappear behind one account-site
definition interface, with projections feeding onboarding, product profile,
adapter-family, managed-site classification, and readiness tests.

## Goals

- Add an account-site definition Module that is the source of truth for stable
  account-site registration facts.
- Keep current public compatibility exports available from
  `src/constants/siteType.ts`.
- Derive account-site and managed-site membership from definitions.
- Derive onboarding metadata and adapter-family metadata from definitions.
- Derive product-profile overrides from definitions where the data belongs to
  stable account-site registration.
- Add completeness tests that fail when an account site type lacks required
  definition data.
- Add readiness expectation tests so a future account site can verify its
  default Model List route without reading UI hooks.
- Clean up definition-owned raw `SITE_TYPES` branches in Model List and Key
  Management product policy paths when they would otherwise grow a third site
  case.
- Preserve current behavior for New API-family compatible sites, Sub2API,
  AIHubMix, AnyRouter, and existing managed site types.

## Non-Goals

- Do not add a new account site type.
- Do not change external backend behavior, user-facing behavior, copy, locale
  keys, telemetry schema, settings search definitions, or Playwright E2E tests.
- Do not move backend protocol implementations out of `src/services/apiAdapters/`.
- Do not move managed-site provider implementations, channel CRUD, hosted-site
  settings, or managed-site model sync into the account-site definition
  registry.
- Do not move full Account Dialog workflow policy into the definition registry.
- Do not turn the definition registry into a second `SiteAdapter`.
- Do not remove compatibility exports such as `SITE_TYPES`,
  `ACCOUNT_SITE_TYPES`, `MANAGED_SITE_TYPES`, `getAccountSiteApiRouter(...)`,
  or `isAccountSiteType(...)`.
- Do not rename persisted schema fields such as `sub2apiAuth`.
- Do not remove response-source labels such as `provider:
  SITE_TYPES.AIHUBMIX` when they describe actual response metadata.
- Do not perform broad UI cleanup or rename feature workflow concepts that are
  still intentionally provider-specific.

## Approaches Considered

### Approach A: Keep Current Registries And Add A Checklist

The repo could document the edit checklist for adding a site type.

This is too shallow. It preserves the same failure mode: adding a new site type
still relies on a human remembering every surface. Tests would mostly assert
the checklist after the fact rather than giving one registration interface.

This should not be the next step.

### Approach B: Make `accountSiteOnboarding` Own Everything

The existing onboarding module could absorb product profiles, account/managed
classification, adapter families, and Model List expectations.

This gives locality, but the name and seam become misleading. Onboarding
facts are used before or during site-type detection. Product profile and Model
List policy are used after a site type is known. A larger onboarding module
would become a catch-all registry instead of a clear interface.

This should not be the next step.

### Approach C: Add A Dedicated Account-Site Definition Module

Create a definition Module that owns stable registration data and provides
projections to the existing seams. Onboarding, product profile, adapter
registry, and Model List readiness keep their current responsibilities, but
their static registration data comes from one definition source.

This is the recommended path. It improves locality for adding a site type
without flattening runtime behavior into one large module.

## Design

### 1. Add Account-Site Definition Contracts

Create:

```text
src/services/accountSiteDefinitions/
  contracts.ts
  definitions.ts
  registry.ts
  siteTypes.ts
  index.ts
```

The exact file split may be adjusted during implementation, but the public
interface should stay definition-focused.

Proposed contract shape:

```ts
export const ACCOUNT_SITE_CAPABILITY_SCOPES = {
  Account: "account",
  Managed: "managed",
} as const

export type AccountSiteCapabilityScope =
  (typeof ACCOUNT_SITE_CAPABILITY_SCOPES)[keyof typeof ACCOUNT_SITE_CAPABILITY_SCOPES]

export type AccountSiteDefinition = {
  siteType: AccountSiteType
  scopes: readonly AccountSiteCapabilityScope[]
  adapterFamily: AccountSiteAdapterFamily
  onboarding?: AccountSiteOnboardingMetadata
  productProfile?: Partial<AccountSiteProductProfile>
  readiness?: {
    modelList?: {
      expectedRoute?: ModelListAccountSourceRoute
    }
  }
}
```

Important interface rules:

- `siteType` remains a stable identifier, not an upstream deployment URL.
- `scopes` declares whether the site type participates in account workflows,
  managed-site workflows, or both.
- `adapterFamily` is stable registration data. Concrete backend behavior still
  lives in `SiteAdapter`.
- `onboarding` is detection, route, compat-header, and content-session
  metadata. It should not include backend request implementations.
- `productProfile` is only saved-account product policy data. It should not
  include UI workflow copy, modal behavior, or render state.
- `readiness.modelList.expectedRoute` is a test expectation, not runtime UI
  policy.

If implementation reveals import cycles between profile contracts and
definition data, prefer moving pure data-shape contracts upward into
`accountSiteDefinitions/contracts.ts` and leaving implementation helpers in
their current modules. Do not solve cycles by importing runtime registries into
low-level constants.

### 2. Make Definitions The Source For Site-Type Membership

Move the stable site-type constants and membership projections behind the
definition registry while keeping compatibility exports.

Target ownership:

- `src/services/accountSiteDefinitions/siteTypes.ts`
  - owns `SITE_TYPES`;
  - exports `AccountSiteType` and `ManagedSiteType` derived from definition
    projections where practical;
  - exposes account-site and managed-site value arrays.
- `src/services/accountSiteOnboarding/siteTypes.ts`
  - becomes a compatibility re-export or thin facade during migration.
- `src/constants/siteType.ts`
  - remains the public compatibility facade for existing imports.

The first implementation does not need to rename all imports. It should
centralize the data source and keep existing public paths working.

Completeness invariant:

- every value in `ACCOUNT_SITE_TYPES` resolves to exactly one account-site
  definition;
- every value in `MANAGED_SITE_TYPES` resolves to exactly one definition whose
  scopes include `Managed`;
- `SITE_TYPES.UNKNOWN` can remain a compatibility value, but tests should
  explicitly define whether it is included in account-site projections and why.

### 3. Derive Onboarding Metadata From Definitions

Update `src/services/accountSiteOnboarding/metadata.ts` and
`src/services/accountSiteOnboarding/registry.ts` so onboarding projections read
from account-site definitions.

Preserve existing projection helpers:

- `getAccountSiteMetadata(...)`
- `getAccountSiteTitleRuleMetadata()`
- `getAccountSiteDomainRuleMetadata()`
- `getAccountSiteCompatUserIdHeaderRules()`
- `getAccountSiteRouteOverrideMetadata(...)`
- `getAccountSiteAdapterFamilyMetadata(...)`
- `getAccountSiteAdapterFamily(...)`
- `getContentSessionExtractors()`

These helpers may remain in onboarding because callers already use them, but
their static source should be definition data.

Behavior to preserve:

- title rules still match existing names and custom patterns;
- domain rules still recognize AIHubMix hostnames;
- route overrides stay identical;
- compat user-id header detection keeps the current unambiguous header set;
- Sub2API content-session extraction remains before compatible fallback.

### 4. Derive Product Profile Overrides From Definitions

Update `src/services/accounts/accountSiteProfile/profiles.ts` and
`registry.ts` so product-profile overrides come from definitions or a
definition-owned projection.

The product profile module should still own merge behavior and helper
functions such as:

- `getAccountSiteProductProfile(...)`
- `resolveStoredAccountUserIdentity(...)`
- `normalizeAccountSiteUrlForStorage(...)`
- `resolveDefaultAccountAuthType(...)`
- `resolveAccountSiteTokenFormNetworkLimitPolicy(...)`
- `getAccountSiteModelListProfile(...)`

The definition registry should own static override data, not product-profile
runtime behavior.

Preserve current profile behavior:

- default compatible profile requires username, supports access-token and
  cookie auth, uses `id` identity, supports direct Model List pricing, and uses
  IP-list token limits;
- AnyRouter keeps cookie-auth default host policy;
- Sub2API keeps optional username, refresh-token supplemental auth, account
  API sidecar decoration, token-scoped Model List fallback, and token-scoped
  status;
- AIHubMix keeps username identity, recognized hostnames, split web/API
  origins, one-time created-token secret handling, subnet-limit token policy,
  and profile-sourced Model List display capability.

### 5. Keep Adapter Runtime Routing Narrow

Update `src/services/apiAdapters/registry.ts` only as needed to read adapter
family from the definition projection.

Allowed behavior:

- `NewApiFamily` still creates a New API-family adapter for compatible account
  site types;
- `Sub2Api` still returns `sub2ApiAdapter`;
- `Aihubmix` still returns `aihubmixAdapter`;
- unsupported families still produce a minimal unsupported adapter.

Do not add full adapter implementations to the definition registry. The
definition registry answers "which adapter family applies", not "how this
backend protocol works".

### 6. Add Model List Readiness Definition Expectations

Keep runtime readiness in:

```text
src/services/modelList/accountSources/readiness.ts
```

Add tests that compare definition expectations to actual readiness for current
account site types. This makes future site-type registration failures visible
before UI hooks are touched.

Examples:

- compatible New API-family account sites should resolve to direct pricing
  when their adapter family exposes `modelPricing`;
- Sub2API should resolve to token-scoped runtime catalog when `modelCatalog`
  exists;
- AIHubMix should resolve to direct pricing and profile-sourced display
  capability;
- unsupported or intentionally incomplete definitions should resolve to a
  typed unsupported route.

The expectation data should not drive runtime behavior directly. Runtime
readiness still combines product profile policy with adapter capabilities.

### 7. Clean Up Definition-Owned Raw Site-Type Branches

After the definition registry is in place, run a targeted cleanup for raw
`SITE_TYPES` branches that represent stable account-site product policy.

In scope:

- Model List account-source display or fallback branches that can be expressed
  through product profile or readiness metadata.
- Key Management source-account token-form, created-token secret, or profile
  export origin branches that can be expressed through product profile helpers.
- AnyRouter auth-default host branches that should be definition/profile data.
- Static account-site classification checks that can use
  `isAccountSiteType(...)`, `isManagedSiteType(...)`, or definition scopes.

Out of scope and allowed to remain:

- concrete adapter implementation code under `src/services/apiAdapters/**`;
- response-source metadata such as `provider: SITE_TYPES.SUB2API`;
- content-session extractor implementations where the extractor itself is
  provider-specific;
- persisted schema fields such as `sub2apiAuth`;
- managed-site runtime provider branches for Octopus, DoneHub, Veloera,
  AxonHub, and Claude Code Hub;
- feature-local Account Dialog workflow tables where the branch controls UI
  workflow rather than stable site registration;
- tests that assert provider-specific behavior.

Cleanup rule: if adding a new account site type would require adding a third
case to the branch for the same product decision, route it through definition
or product profile. If the branch describes a backend protocol implementation
or source metadata label, leave it where it is.

### 8. Keep Compatibility Facades During Migration

The implementation should not force a repo-wide import rewrite.

Compatibility paths that should keep working:

- `~/constants/siteType`
- `~/services/accountSiteOnboarding/siteTypes`
- `~/services/accountSiteOnboarding/registry`
- `~/services/accounts/accountSiteProfile`

The final diff may update imports in touched files when it reduces cycles or
clarifies ownership, but broad mechanical import churn is not the goal.

### 9. Add Definition Completeness Diagnostics

Add focused tests that make omissions obvious:

- every account site type has one definition;
- every definition has a declared adapter family;
- every account-scoped definition has onboarding metadata or an explicit reason
  it relies on default compatible detection;
- every account-scoped definition resolves a product profile;
- every account-scoped definition resolves Model List readiness without
  throwing;
- every managed-scoped definition appears in managed-site type projections;
- no site type appears in account or managed projections without a definition.

These tests should fail with readable assertion messages that identify the
missing site type and missing registration area.

## Error Handling

Definition lookup should be non-throwing for compatibility callers where the
current behavior falls back.

Recommended behavior:

- `getAccountSiteDefinition(siteType)` returns `undefined` for unmapped values;
- projection helpers may use default compatible behavior only where existing
  behavior already does so;
- completeness tests, not runtime fallback code, should enforce that known
  account site types are registered;
- runtime product helpers should preserve current fallback behavior for
  `SITE_TYPES.UNKNOWN` and invalid external values.

Do not introduce user-facing errors in this slice. Missing definition data is
a developer-time regression caught by tests.

## Telemetry Decision

Telemetry decision: none.

This is an internal registration refactor. It should not add analytics fields,
events, or settings snapshots.

Existing account save, auto-detect, Model List, and Key Management telemetry
should keep their current owners and payload shapes.

## Settings Search Decision

Settings search decision: none.

No settings UI, anchors, deep links, or search definitions change.

## E2E Decision

E2E decision: no new Playwright E2E by default.

The primary risk is deterministic registry projection and policy routing.
Vitest coverage can prove that directly. Add or update Playwright only if the
implementation changes browser message payloads, extension entrypoint imports,
navigation behavior, or cross-entrypoint workflows.

## Testing Strategy

Add definition tests:

- `tests/services/accountSiteDefinitions/registry.test.ts`
  - every account site type resolves one definition;
  - every managed site type resolves one managed-scoped definition;
  - no duplicate `siteType` values exist;
  - adapter-family projection matches current behavior for New API-family,
    Sub2API, and AIHubMix;
  - account and managed projections preserve current membership.

Update onboarding tests:

- `tests/services/accountSiteOnboarding/registry.test.ts`
  - title/domain/route/compat-header projections match existing behavior;
  - content-session extractor ordering remains Sub2API before compatible
    fallback.
- `tests/services/detectSiteType.test.ts`
  - existing domain, title, and compat-header detection behavior remains
    unchanged.

Update product profile tests:

- `tests/services/accounts/accountSiteProfile.test.ts`
  - default compatible, AnyRouter, Sub2API, and AIHubMix profiles remain
    unchanged;
  - profile overrides are sourced from definitions;
  - returned profiles remain defensive copies.

Update adapter registry tests:

- existing adapter registry coverage should prove adapter-family projection
  still returns New API-family adapters, Sub2API adapter, AIHubMix adapter, and
  unsupported fallback.

Add Model List readiness expectation tests:

- `tests/services/modelList/accountSources/readiness.test.ts`
  - readiness results match definition expectations for compatible direct
    pricing, Sub2API token-scoped runtime catalog, AIHubMix direct pricing, and
    unsupported capability cases.

Update feature policy tests only where implementation touches those paths:

- Model List display/fallback policy tests should assert profile/readiness
  consumption instead of raw site-type branching.
- Key Management token-form or profile-export tests should assert product
  profile helper behavior if those branches are cleaned up.

Focused validation:

```powershell
pnpm vitest run tests/services/accountSiteDefinitions/registry.test.ts tests/services/accountSiteOnboarding/registry.test.ts tests/services/detectSiteType.test.ts tests/services/accounts/accountSiteProfile.test.ts tests/services/modelList/accountSources/readiness.test.ts
```

Add changed feature-policy test files to the command when Task 7 cleanup
touches Model List or Key Management.

Related validation:

```powershell
pnpm vitest related --run src/services/accountSiteDefinitions/index.ts src/services/accountSiteOnboarding/registry.ts src/services/accountSiteOnboarding/metadata.ts src/services/accounts/accountSiteProfile/registry.ts src/services/accounts/accountSiteProfile/profiles.ts src/services/apiAdapters/registry.ts src/services/modelList/accountSources/readiness.ts
```

Commit gate:

```powershell
pnpm run validate:staged
```

Push gate before publishing:

```powershell
pnpm run validate:push
```

Run `validate:push` before opening or updating a PR because this slice touches
shared registration, exported constants, adapter routing, product profile data,
and readiness contracts.

## Migration Completeness Checks

Run:

```powershell
rg "ACCOUNT_SITE_TYPES|MANAGED_SITE_TYPES|SITE_TYPES =" src/services src/constants tests
rg "ACCOUNT_SITE_PRODUCT_PROFILE_OVERRIDES|DEFAULT_ACCOUNT_SITE_PRODUCT_PROFILE" src/services tests
rg "getAccountSiteAdapterFamilyMetadata|getAccountSiteRouteOverrideMetadata|getAccountSiteTitleRuleMetadata|getAccountSiteDomainRuleMetadata" src/services tests
rg "siteType === SITE_TYPES\\.|siteType !== SITE_TYPES\\.|currentSiteType === SITE_TYPES\\.|managedSiteType === SITE_TYPES\\." src/features src/services tests
rg "provider: SITE_TYPES\\.|sub2apiAuth|contentSession|apiAdapters" src/features src/services tests
```

Expected after implementation:

- account/managed type membership is derived from definitions or a
  definition-owned projection;
- onboarding metadata projections read definition data;
- product profile overrides read definition data or a definition-owned
  projection;
- adapter-family resolution reads definition data;
- Model List readiness tests can verify definition expectations;
- remaining raw site-type branches are classified as adapter protocol code,
  response metadata, content-session extractor internals, persisted schema,
  managed-site runtime branches, feature-local Account Dialog workflow policy,
  or provider-specific tests.

## Rollout

1. Add account-site definition contracts, site-type projections, and direct
   registry tests.
2. Move current site-type membership data behind the definition registry while
   preserving compatibility exports.
3. Route onboarding metadata projections through definitions.
4. Route adapter-family projection through definitions.
5. Route product-profile override data through definitions while preserving
   profile helper behavior.
6. Add Model List readiness expectation tests tied to definitions.
7. Run targeted raw `SITE_TYPES` searches and migrate only definition-owned
   product policy branches in Model List and Key Management.
8. Run focused tests after each migration group.
9. Run migration completeness searches and classify remaining hits.
10. Run related tests, `pnpm run validate:staged`, and `pnpm run validate:push`.
11. Inspect the final diff for broad import churn, unrelated UI cleanup,
    adapter implementation drift, and unexpected locale/telemetry/settings
    changes.

## Follow-Up, Not In Scope For This Spec

- Add a concrete new account site type using the definition registry as the
  first registration step.
- Add static import guardrails that prevent new product policy branches from
  importing raw `SITE_TYPES` in feature render modules.
- Revisit Account Dialog workflow policy once definition-owned product policy
  cleanup is complete.
- Consolidate managed-site provider registration only if a new managed site
  type exposes repeated registration friction comparable to account sites.
- Move additional profile contracts into account-site definitions only if
  implementation shows real import-cycle or ownership pressure.
- Add Playwright coverage for a real new-site tracer bullet if lower-level
  tests miss browser-runtime integration risk.

The intended seam split is: account-site definitions own stable registration,
onboarding projects detection and session-preparation facts, adapters own
backend protocol behavior, account-site product profiles own saved-account
semantics, Model List readiness resolves source-account routes, and UI modules
consume feature-local policy results.
