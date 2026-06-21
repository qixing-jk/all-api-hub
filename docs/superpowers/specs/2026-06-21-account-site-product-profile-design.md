# Account Site Product Profile Design

Date: 2026-06-21

## Purpose

Make brand-new account site types faster to add by concentrating non-managed
account-site product semantics in one account-site product profile Module.

Recent slices made the backend Adapter Seam deep enough for most account-site
capabilities:

- `src/services/accountSiteOnboarding/` owns detection metadata, route
  metadata, adapter-family metadata, and content-session extractors.
- `src/services/apiAdapters/` owns backend facts after a site type is known.
- `src/services/accounts/defaultTokenLifecycle/` owns reusable default-token
  orchestration.
- `src/features/AccountManagement/components/AccountDialog/sitePolicy.ts`
  owns Account Dialog UI and workflow policy.

The remaining high-friction path is account-site product behavior that does not
belong in backend adapters and is broader than one UI component. Examples
include whether a username is required, how a user object produces an account
identity, how a site URL is canonicalized for storage and duplicate checks,
which supplemental auth payload may be persisted, which auth modes/defaults are
available for a product, and which source-account policies Model List and Key
Management should apply.

This spec defines a product-profile seam for those account semantics. It does
not add a new site type and deliberately excludes managed-site provider,
channel CRUD, hosted-site settings, and model-sync behavior.

## Current Context

Current `main` already has account-site registration and adapter routing:

- `src/services/accountSiteOnboarding/siteTypes.ts` defines `SITE_TYPES`,
  `ACCOUNT_SITE_TYPES`, and `MANAGED_SITE_TYPES`.
- `src/services/accountSiteOnboarding/metadata.ts` defines static onboarding
  metadata, route overrides, and adapter families.
- `src/services/apiAdapters/registry.ts` resolves adapter families from
  onboarding metadata.

Several saved-account product rules are still scattered outside those seams:

- `src/services/accounts/accountOperations.ts`
  - `isValidAccount(...)` allows empty usernames only for Sub2API.
  - `normalizeSub2ApiAuthInput(...)` persists refresh-token auth only for
    Sub2API.
  - `validateAndSaveAccount(...)` and `validateAndUpdateAccount(...)` both
    repeat storage URL normalization, cookie auth shaping, supplemental auth
    shaping, account identity normalization, and account payload assembly.
- `src/services/accounts/accountIdentity.ts`
  - `resolveStoredAccountUserIdentity(...)` reads `username` for AIHubMix and
    `id` for other site types.
- `src/services/accounts/utils/siteUrlNormalization.ts`
  - AIHubMix uses a fixed web origin for saved-account UI navigation and
    duplicate checks.
  - AIHubMix uses a fixed API origin for managed-channel import/export.
  - AIHubMix hostnames are checked directly in multiple normalization helpers.
- `src/services/accounts/accountStorage.ts`
  - duplicate lookup and auth-session update paths still contain AIHubMix and
    Sub2API-specific persistence rules.
- `src/services/accounts/utils/apiServiceRequest.ts`
  - account API request decoration still checks Sub2API directly before
    attaching the saved auth-session sidecar.
- `src/features/KeyManagement/utils/apiCredentialProfileSaveAction.tsx`
  - AIHubMix profile save uses a fixed API origin.
- `src/features/AccountManagement/components/AccountDialog/sitePolicy.ts`
  - Account Dialog UI policy already centralizes dialog-local Sub2API and
    AIHubMix behavior, but it is intentionally feature-local.
- `src/features/AccountManagement/components/AccountDialog/AccountForm.tsx`
  and `src/features/AccountManagement/components/AccountDialog/SiteInfoInput.tsx`
  - rendered form components still compute `isSub2Api` directly for auth-mode
    visibility, cookie-auth permission copy, built-in check-in availability,
    and refresh-token fields.
- `src/features/AccountManagement/utils/accountAuthType.ts`
  - AnyRouter hostnames default to cookie auth through feature-local hostname
    checks instead of shared account-site auth policy.
- `src/features/AccountManagement/hooks/AccountDataContext.tsx`
  - current-tab account matching chooses a site type hint by taking the first
    non-unknown account in UI state before asking the content script for local
    user data.
- `src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts`
  and `src/features/AccountManagement/hooks/AccountDataContext.tsx`
  - verified/current form identity matching still compares against
    `account_info.id`, which is the same product identity rule as stored-user
    identity extraction.
- `src/features/AccountManagement/sponsors/catalog.ts` and
  `src/features/AccountManagement/sponsors/pendingAddAccountIntent.ts`
  - sponsor add-account intents validate generic site type, URL, and auth type,
    but do not normalize through product-profile URL/default-auth rules.
- `src/features/KeyManagement/utils.ts`,
  `src/features/KeyManagement/components/AddTokenDialog/hooks/useTokenForm.ts`,
  `src/features/KeyManagement/components/AddTokenDialog/TokenForm/AdvancedSettingsSection.tsx`,
  `src/features/ModelList/components/ModelKeyDialog/hooks/useModelKeyDialog.ts`,
  and `src/features/KeyManagement/utils/apiCredentialProfileSaveAction.tsx`
  - AIHubMix created-token one-time-secret handling, network-limit validation,
    and profile-origin decisions are still feature-side raw site-type branches.
- `src/services/apiCredentialProfiles/modelCatalog.ts`,
  `src/features/ModelList/hooks/useModelData.ts`,
  `src/features/ModelList/aihubmixModelList.ts`, and
  `src/features/ModelList/components/StatusIndicator.tsx`
  - Sub2API model-list token fallback and AIHubMix source/display capability
    downgrades are still concrete provider checks in service/UI code.

These branches are product behavior, not backend protocol facts:

- Username requirement is a saved-account validation rule.
- Stored user identity source is a product normalization rule over browser
  session data.
- Stored/current user identity matching should use the same product identity
  rule as extraction.
- URL canonicalization is a product rule for storage, duplicate detection, and
  cross-feature exports.
- Supplemental auth persistence decides what local account state may be saved.
- Auth-mode defaults, token-form constraints, created-token secret handling,
  and model-list fallback/display policy are source-account product rules.
- Account Dialog render components, Model List status components, and Key
  Management form components should consume feature-local policy objects, not
  branch directly on account-site constants.

They should not be moved onto `SiteAdapter`. Adapters should continue to answer
backend capability and policy questions after the site type is known.

## Problem

Adding a new non-compatible account site type can now implement backend
capabilities in one adapter family, but it still has to edit several product
modules before accounts behave correctly.

Current friction:

1. Account validation has a raw Sub2API exception for empty usernames.
2. Browser-session identity extraction and current-account identity matching
   still assume concrete user fields instead of sharing one profile-backed
   account identity rule.
3. URL canonicalization has raw AIHubMix checks spread across storage,
   duplicate detection, managed-channel normalization, and profile export.
4. Supplemental auth persistence and account API request decoration are
   Sub2API-specific and normalized in `accountOperations.ts`, while related
   update logic also appears in `accountStorage.ts`.
5. Account Dialog policy has correctly become feature-local, but rendered form
   components still know about Sub2API directly instead of receiving profile-
   backed dialog policy facts.
6. AnyRouter default auth and sponsor add-account prefill are separate
   feature-local URL/auth normalization paths.
7. Current-tab account matching chooses content-session read hints from UI
   account state instead of the account-site onboarding/profile boundary.
8. Key Management still branches on AIHubMix for created-token secret handling,
   IP/subnet validation, and API credential profile origin.
9. Model List still branches on Sub2API and AIHubMix for token-scoped fallback,
   direct-pricing support, status display, and source capability downgrades.
10. A future site with a fixed API origin, different web origin, optional
   username, alternate identity field, or supplemental auth state would add a
   third raw branch across the same modules.

Deletion test: if the raw Sub2API and AIHubMix checks were deleted from
`accountOperations.ts`, `accountIdentity.ts`, `siteUrlNormalization.ts`, the
relevant account-storage helpers, Account Dialog rendered components, Key
Management source-account UI helpers, and Model List source-account policy
helpers, the complexity should not reappear as new raw branches in those files.
It should reappear behind a small product profile Interface plus feature-local
policy adapters that account services and UI components can query.

## Goals

- Add a service-layer account-site product profile Module.
- Keep backend facts in `SiteAdapter` and account-detection facts in
  `accountSiteOnboarding`.
- Keep Account Dialog UI/workflow flags in the existing feature-local
  `sitePolicy.ts`, with read-only consumption of shared profile facts where
  needed so rendered components do not branch on concrete account site types.
- Centralize these saved-account product semantics:
  - whether an account username is required;
  - how a stored/current browser-session user object yields and matches a saved
    account identity;
  - which account URL should be saved for UI navigation;
  - which origin should be used for managed-channel exports;
  - which origin key should be used for duplicate-account comparison;
  - which hostnames are canonical aliases for one account site product;
  - which supplemental auth payload may be saved for the site type;
  - which saved auth-session sidecar may decorate account API requests;
  - which auth modes are available and which default auth mode applies for a
    known product host;
  - which created-token secret handling and token-form network-limit policy a
    source account uses;
  - which Model List fallback, status, direct-pricing, and source display
    policy a source account uses.
- Preserve current behavior for New API-family compatible sites, Sub2API, and
  AIHubMix.
- Make a future product-special account site add one profile row/helper instead
  of editing validation, identity, URL normalization, storage, Account Dialog,
  Key Management, Model List, and export paths independently.
- Add focused tests for the product profile Interface and migrated callers.

## Non-Goals

- Do not add a new account site type.
- Do not change public account behavior, user-facing copy, locale keys,
  telemetry schema, or settings search entries.
- Do not move Account Dialog UI policy into the shared product profile.
- Do not add UI flags such as dialog visibility, form labels, post-save dialog
  names, or toast behavior to the shared profile.
- Do not make React components import profile tables directly. UI components
  should receive feature-local policy objects derived by hooks/helpers.
- Do not change `SiteAdapter` or move backend token/model/account data
  behavior into the product profile.
- Do not move account-site detection metadata or content-session extractors out
  of `src/services/accountSiteOnboarding/`.
- Do not redesign stored account schema.
- Do not rename `sub2apiAuth` in the persisted account schema.
- Do not migrate managed-site provider registration, channel CRUD, model sync,
  hosted-site settings, or managed-site-specific availability checks.
- Do not move backend model fetch implementations, pricing response assembly,
  or model-sync provider behavior into this profile.
- Do not consolidate `SITE_TYPES` and account-site registration metadata in
  this slice.
- Do not add Playwright E2E coverage by default.

## Approaches Considered

### Approach A: Keep Product Branches Where They Are

This keeps the code small today, but preserves the exact new-site-type tax this
architecture work is trying to remove. A new site with one product-level
special case still has to touch validation, identity, URL normalization,
storage, and export code separately.

This should not be the next step.

### Approach B: Extend `SiteAdapter` With Product Flags

`SiteAdapter` could expose fields such as `allowEmptyUsername`,
`storageOrigin`, or `identityField`.

This blurs the seam. Those values are saved-account product rules and can be
consumed before or outside backend operations. Backend adapters should not own
feature export behavior, local duplicate-scan keys, or UI-facing account
validation.

This should not be the next step.

### Approach C: Add A Shared Product Profile Module

Create a service-layer profile Module that maps `AccountSiteType` to
saved-account product behavior. Account services consume it directly. Account
Dialog site policy may consume it for shared facts but keeps UI-specific
decisions local.

This is the recommended path. It gives callers Leverage through one Interface
while preserving Locality for product rules that do not belong in backend
adapters.

## Design

### 1. Add An Account-Site Product Profile Module

Create:

```text
src/services/accounts/accountSiteProfile/
  contracts.ts
  profiles.ts
  auth.ts
  authSession.ts
  identity.ts
  modelList.ts
  tokenForm.ts
  urls.ts
  supplementalAuth.ts
  index.ts
```

The file split can be adjusted during implementation, but the public Interface
should stay small and product-focused.

Even in this spec, example runtime values should avoid repeated bare string
unions. Use exported constant maps and derive types from those maps so the
follow-up plan and implementation have one canonical source per policy value.

Proposed contract:

```ts
export const ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS = {
  None: "none",
  Sub2ApiRefreshToken: "sub2api_refresh_token",
} as const

export type AccountSiteSupplementalAuthKind =
  (typeof ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS)[keyof typeof ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS]

export const ACCOUNT_SITE_AUTH_SESSION_REFRESH_LOCK_SCOPES = {
  None: "none",
  Account: "account",
} as const

export type AccountSiteAuthSessionRefreshLockScope =
  (typeof ACCOUNT_SITE_AUTH_SESSION_REFRESH_LOCK_SCOPES)[keyof typeof ACCOUNT_SITE_AUTH_SESSION_REFRESH_LOCK_SCOPES]

export const ACCOUNT_SITE_CREATED_TOKEN_SECRET_HANDLING = {
  ResponseKey: "response_key",
  OneTimeSecretDialog: "one_time_secret_dialog",
} as const

export type AccountSiteCreatedTokenSecretHandling =
  (typeof ACCOUNT_SITE_CREATED_TOKEN_SECRET_HANDLING)[keyof typeof ACCOUNT_SITE_CREATED_TOKEN_SECRET_HANDLING]

export const ACCOUNT_SITE_TOKEN_FORM_NETWORK_LIMIT_POLICIES = {
  IpList: "ip_list",
  SubnetLimit: "subnet_limit",
} as const

export type AccountSiteTokenFormNetworkLimitPolicy =
  (typeof ACCOUNT_SITE_TOKEN_FORM_NETWORK_LIMIT_POLICIES)[keyof typeof ACCOUNT_SITE_TOKEN_FORM_NETWORK_LIMIT_POLICIES]

export const ACCOUNT_SITE_MODEL_LIST_DIRECT_PRICING = {
  Supported: "supported",
  Unsupported: "unsupported",
} as const

export type AccountSiteModelListDirectPricing =
  (typeof ACCOUNT_SITE_MODEL_LIST_DIRECT_PRICING)[keyof typeof ACCOUNT_SITE_MODEL_LIST_DIRECT_PRICING]

export const ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS = {
  None: "none",
  RuntimeKey: "runtime_key",
} as const

export type AccountSiteModelListTokenScopedCatalogFallback =
  (typeof ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS)[keyof typeof ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS]

export const ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS = {
  None: "none",
  Sub2Api: "sub2api",
} as const

export type AccountSiteModelListDashboardEstimateLoader =
  (typeof ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS)[keyof typeof ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS]

export const ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES = {
  Account: "account",
  Token: "token",
} as const

export type AccountSiteModelListStatusScope =
  (typeof ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES)[keyof typeof ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES]

export const ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES = {
  Response: "response",
  Profile: "profile",
} as const

export type AccountSiteModelListDisplayCapabilitySource =
  (typeof ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES)[keyof typeof ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES]

export type AccountSiteUrlProfile = {
  recognizedHostnames: readonly string[]
  storageOrigin?: string
  managedChannelOrigin?: string
  duplicateOrigin?: string
}

export type AccountSiteIdentityProfile = {
  usernameRequired: boolean
  storedUserIdentityFields: readonly string[]
}

export type AccountSiteAuthProfile = {
  allowedAuthTypes: readonly AccountAuthType[]
  defaultAuthType: AccountAuthType
  defaultAuthHostnames: readonly string[]
  supportsCookieAuth: boolean
  supportsBuiltInCheckInDetection: boolean
}

export type AccountSiteAuthSessionProfile = {
  kind: AccountSiteSupplementalAuthKind
  decoratesAccountApiRequests: boolean
  refreshLockScope: AccountSiteAuthSessionRefreshLockScope
}

export type AccountSiteCreatedTokenProfile = {
  secretHandling: AccountSiteCreatedTokenSecretHandling
}

export type AccountSiteTokenFormProfile = {
  networkLimitPolicy: AccountSiteTokenFormNetworkLimitPolicy
}

export type AccountSiteModelListProfile = {
  directPricing: AccountSiteModelListDirectPricing
  tokenScopedCatalogFallback: AccountSiteModelListTokenScopedCatalogFallback
  dashboardEstimateLoader: AccountSiteModelListDashboardEstimateLoader
  statusScope: AccountSiteModelListStatusScope
  displayCapabilitiesSource: AccountSiteModelListDisplayCapabilitySource
}

export type AccountSiteProductProfile = {
  siteType: AccountSiteType
  auth: AccountSiteAuthProfile
  authSession: AccountSiteAuthSessionProfile
  createdToken: AccountSiteCreatedTokenProfile
  identity: AccountSiteIdentityProfile
  modelList: AccountSiteModelListProfile
  tokenForm: AccountSiteTokenFormProfile
  urls: AccountSiteUrlProfile
  supplementalAuth: {
    kind: AccountSiteSupplementalAuthKind
  }
}
```

Default compatible profile:

- username is required;
- access-token and cookie auth keep current compatible defaults;
- stored browser-session identity uses `id`;
- URLs are stored and compared from the caller-provided URL;
- no supplemental auth payload is accepted;
- created-token secrets are resolved from response keys;
- token form network limits use the current IP-list behavior;
- Model List supports direct pricing, does not use token-scoped runtime-key
  fallback, and derives display capabilities from normalized response data.

Sub2API profile:

- username is optional for saved-account validation;
- access-token auth remains forced through Account Dialog policy, but the
  shared profile records that cookie auth and built-in check-in detection are
  unavailable;
- stored browser-session identity uses `id`;
- URLs use caller-provided origins;
- supplemental auth kind is `sub2api_refresh_token`;
- auth-session sidecar may decorate account API requests and use account-scoped
  refresh locks;
- Model List direct pricing is unsupported, token-scoped runtime-key fallback is
  enabled, dashboard estimate loading uses the existing Sub2API estimator, and
  status is token-scoped.

AIHubMix profile:

- username is required;
- access-token auth is the default and cookie auth stays unavailable;
- built-in check-in detection remains available in the product profile, while
  AIHubMix adapter check-in execution/status remains unsupported;
- stored browser-session identity uses `username`;
- recognized hostnames come from `AIHUBMIX_HOSTNAMES`;
- saved-account storage and duplicate comparison use `AIHUBMIX_WEB_ORIGIN`;
- managed-channel export uses `AIHUBMIX_API_ORIGIN`;
- no supplemental auth payload is accepted;
- created-token secrets require the current one-time-secret dialog behavior;
- token form network limits use subnet-limit validation/copy;
- Model List display capabilities may be profile-derived when normalized
  response source metadata cannot express the AIHubMix downgrade cleanly.

### 2. Resolve Profiles Through One Function

Export:

```ts
export function getAccountSiteProductProfile(
  siteType: AccountSiteType,
): AccountSiteProductProfile
```

Callers should normalize or validate unknown values before calling the resolver.
Passing `SITE_TYPES.UNKNOWN` should return the default compatible profile with
`SITE_TYPES.UNKNOWN` as the effective site type.

The profile resolver should not call backend adapters, browser APIs, storage,
or i18n. It must remain pure.

### 3. Move Saved-Account Validation Rules Behind The Profile

Update `src/services/accounts/accountOperations.ts`.

Replace the raw username exception:

```ts
normalizedSiteType === SITE_TYPES.SUB2API || !!username.trim()
```

with a profile-backed helper:

```ts
isAccountUsernameValidForSite({
  profile,
  username,
})
```

Keep all current auth, access-token, cookie, user-id, and exchange-rate
validation behavior unchanged.

The helper should only decide username validity. It should not validate the
entire account form or return translated messages.

### 4. Move Supplemental Auth Normalization Behind The Profile

Replace `normalizeSub2ApiAuthInput(...)` in `accountOperations.ts` with a
profile-backed helper:

```ts
normalizeAccountSupplementalAuthForStorage({
  profile,
  sub2apiAuth,
})
```

Behavior to preserve:

- non-Sub2API sites return `undefined`;
- Sub2API requires a nonblank refresh token;
- finite positive `tokenExpiresAt` is retained;
- invalid expiration values are omitted;
- the persisted shape remains `sub2apiAuth`.

This slice should not rename the stored property. The product profile only
decides whether the existing supplemental auth shape is accepted for the site
type.

### 5. Move Stored User Identity Selection Behind The Profile

Update `src/services/accounts/accountIdentity.ts` and callers that compare
current or verified user data against saved account identity.

`resolveStoredAccountUserIdentity(...)` should use the profile's
`storedUserIdentityFields` in order instead of branching directly on AIHubMix.

Add a companion helper for matching current-session user data to saved account
identity:

```ts
doesAccountSiteUserIdentityMatch({
  profile,
  savedIdentity,
  user,
})
```

The helper should normalize candidate values through the same identity
normalization boundary as `resolveStoredAccountUserIdentity(...)`.

For existing sites:

- compatible and Sub2API profiles read `id`;
- AIHubMix reads `username`;
- missing or invalid values still return `null`;
- current-account matching in Account Dialog and AccountDataContext no longer
  assumes `account_info.id` directly.

Keep `normalizeAccountIdentity(...)` and `coerceAccountIdentity(...)` as the
string-normalization boundary.

### 6. Move URL Canonicalization Behind The Profile

Update `src/services/accounts/utils/siteUrlNormalization.ts`.

Keep the public helper names stable:

- `isAIHubMixSiteUrl(...)`
- `normalizeAccountSiteUrlForStorage(...)`
- `normalizeAccountSiteUrlForManagedChannel(...)`
- `normalizeAccountForManagedChannel(...)`
- `normalizeAccountSiteUrlForOriginKey(...)`
- `normalizeAccountSiteUrlForDuplicateCheck(...)`
- `isSameAccountSiteOrigin(...)`

Internally, route AIHubMix-specific decisions through generic profile helpers:

```ts
isAccountSiteUrlRecognizedByProfile(profile, url)
normalizeAccountSiteUrlForStorageProfile(profile, url)
normalizeAccountSiteUrlForManagedChannelProfile(profile, url)
normalizeAccountSiteUrlForDuplicateProfile(profile, url)
```

Keep `isAIHubMixSiteUrl(...)` as a compatibility wrapper because existing
tests and call sites may still use it. It should delegate to the AIHubMix
profile rather than own a separate hostname set.

Behavior to preserve:

- AIHubMix storage and duplicate-origin output remains
  `AIHUBMIX_WEB_ORIGIN.toLowerCase()` where currently lower-cased.
- AIHubMix managed-channel output remains `AIHUBMIX_API_ORIGIN`.
- Non-AIHubMix sites keep current trimming and `sanitizeOriginUrl(...)`
  behavior.
- Invalid or empty non-AIHubMix duplicate-check URLs still return `undefined`.

### 7. Route Account Storage Product Branches Through The Profile

Update `src/services/accounts/accountStorage.ts` only for product-profile
decisions proven by focused tests.

Candidate migrations:

- AIHubMix duplicate-account lookup should use the generic profile-backed
  origin-key helper instead of `isAIHubMixSiteUrl(...)` branching.
- auth-session update logic should use the supplemental auth profile to decide
  whether `sub2apiAuth` may be persisted.
- account API request decoration in
  `src/services/accounts/utils/apiServiceRequest.ts` should use the
  auth-session profile to decide whether a saved sidecar may decorate requests.
- helper names can remain AIHubMix/Sub2API-compatible when they are public or
  test-facing, but the control flow should route through profile helpers.

Do not broaden this slice into account-storage schema cleanup or timestamp
behavior.

### 8. Route Auth Defaults And Sponsor Prefill Through The Profile

Move auth-mode product defaults out of feature-local hostname checks.

Update `src/features/AccountManagement/utils/accountAuthType.ts` so AnyRouter
and future host aliases are resolved by a profile-backed helper such as:

```ts
resolveDefaultAccountAuthType({
  siteType,
  url,
})
```

Behavior to preserve:

- existing AnyRouter host aliases still default to cookie auth;
- sites without a product-specific auth default keep the current default;
- Account Dialog workflow rules may still force or disable a rendered auth
  option after the default is resolved.

Update sponsor pending-intent handling so add-account prefill is normalized
through the same profile helpers before it is stored or consumed:

- validate the site type against account-site types as today;
- normalize URL/origin according to profile URL rules where the intent is used
  to create account state;
- resolve default auth from profile auth rules when the sponsor payload omits
  auth type;
- keep sponsor catalog validation free of backend calls, storage reads, and UI
  imports.

### 9. Route Current-Tab Session Hints Through Onboarding/Profile

Update current-tab account matching in
`src/features/AccountManagement/hooks/AccountDataContext.tsx`.

The UI context should not pick a content-script user-data site type by taking
the first non-unknown account in local state. Instead, it should call a pure
or service-layer helper that combines account-site onboarding metadata and
profile host aliases:

```ts
resolveAccountSiteContentSessionHintForOrigin({
  origin,
  candidateAccounts,
})
```

Implementation constraints:

- keep content-session extractor ownership in `src/services/accountSiteOnboarding/`;
- keep browser messaging and account-state orchestration in the current hook;
- make the site-type hint selection testable without rendering Account Dialog;
- preserve the existing fallback when no account-site profile recognizes the
  origin.

### 10. Route Profile Export Origin Through The Profile

Update `src/features/KeyManagement/utils/apiCredentialProfileSaveAction.tsx`.

Replace:

```ts
siteType === SITE_TYPES.AIHUBMIX ? AIHUBMIX_API_ORIGIN : baseUrl
```

with the existing account URL normalization helper backed by the product
profile:

```ts
normalizeAccountSiteUrlForManagedChannel({ siteType, url: baseUrl })
```

Also use the same origin policy for row-level API credential profile save
paths, including `src/features/KeyManagement/components/TokenListItem/TokenHeader.tsx`
if that path still writes `account.baseUrl` directly.

This keeps profile export aligned with managed-channel import/export and avoids
multiple AIHubMix API-origin branches in UI code.

### 11. Route Key Management Source-Account Policy Through The Profile

Migrate source-account product policy in Key Management and adjacent Model List
token creation flows.

Created-token secret handling:

- replace raw AIHubMix checks in `src/features/KeyManagement/utils.ts` and
  `src/features/ModelList/components/ModelKeyDialog/hooks/useModelKeyDialog.ts`
  with a profile-backed helper such as
  `resolveCreatedTokenSecretHandling(account)`;
- align the helper with `tokenProvisioning.classifyCreatedToken(...)` so manual
  create flows and default-token lifecycle do not encode the same secret rule
  separately;
- keep dialog names, modal timing, and user-facing copy in feature code.

Token-form network limits:

- replace `selectedAccount?.siteType !== SITE_TYPES.AIHUBMIX` in
  `src/features/KeyManagement/components/AddTokenDialog/hooks/useTokenForm.ts`
  with `profile.tokenForm.networkLimitPolicy`;
- replace `currentSiteType === SITE_TYPES.AIHUBMIX` in
  `src/features/KeyManagement/components/AddTokenDialog/TokenForm/AdvancedSettingsSection.tsx`
  with a feature-local presentation prop derived from that policy;
- preserve current IP-list validation for compatible sites and subnet-limit
  behavior for AIHubMix.

### 12. Route Model List Source-Account Policy Through The Profile

Keep backend model fetching and adapter model/pricing facts where they are, but
move source-account product fallback decisions out of UI components and ad hoc
provider checks.

Update `src/services/apiCredentialProfiles/modelCatalog.ts` and
`src/features/ModelList/hooks/useModelData.ts` so these decisions are driven by
`profile.modelList`:

- whether direct pricing is supported for the source account;
- whether runtime-key catalog fallback is allowed;
- whether dashboard estimate loading should use the existing Sub2API estimator;
- whether status should be account-scoped or token-scoped.

Update `src/features/ModelList/components/StatusIndicator.tsx` so it receives
status-scope metadata rather than checking `currentAccount.siteType` directly.

For AIHubMix display downgrades, prefer normalized `model_list_source`
capability metadata when possible. If the response source cannot express the
product downgrade cleanly, derive the display capability from
`profile.modelList.displayCapabilitiesSource` in a service/hook helper, not in
render components.

Do not move `SiteAdapter.modelCatalog`, `SiteAdapter.modelPricing`, Sub2API
price-estimation implementation, or managed-site model-sync behavior into the
product profile.

### 13. Bridge Account Dialog Site Policy Carefully

The existing Account Dialog site policy remains feature-local because it owns
dialog-specific UI decisions.

During implementation, it should read shared profile facts when that removes
duplication without weakening the seam. Examples:

- `allowSub2ApiRefreshTokenState` may be derived from
  `profile.supplementalAuth.kind === Sub2ApiRefreshToken`.
- cookie-auth visibility and built-in check-in availability may be derived from
  `profile.auth`.
- `forceAccessTokenAuth` for AIHubMix and Sub2API may stay local if it remains
  an Account Dialog workflow rule, but rendered components should receive a
  policy result rather than compute `isSub2Api`.
- post-save dialog flags stay local.

Do not make the shared product profile import Account Dialog models or UI
types. Dependency direction is:

```text
Account Dialog sitePolicy -> accountSiteProfile
Account Dialog rendered components -> sitePolicy result
accountSiteProfile -> constants/types only
```

After migration, `AccountForm.tsx` and `SiteInfoInput.tsx` should not need raw
`SITE_TYPES.SUB2API` checks for auth controls, refresh-token fields, cookie
permission recommendations, or built-in check-in disabling.

### 14. Keep Registration Consolidation As Follow-Up

This slice should not make the product profile the source of truth for
`SITE_TYPES`, `ACCOUNT_SITE_TYPES`, onboarding metadata, or adapter family
selection.

However, the implementation should leave the profile table shaped so a later
registration-consolidation slice can either:

- attach product profile metadata to onboarding definitions, or
- validate that every account site type has an explicit profile.

For now, default compatible behavior is acceptable for site types without a
special profile.

## Error Handling

The product profile Module should be pure and non-throwing for ordinary unknown
or unmapped site types. Unknown values should use the default compatible
profile.

Existing runtime error handling remains where it is today:

- account validation still returns existing translated validation messages from
  `accountOperations.ts`;
- account data fetch failures still fall back to config-only saves;
- duplicate-account scans still tolerate invalid URLs;
- sponsor add-account intents that fail validation still use the existing
  rejected-intent flow;
- current-tab local-user matching still tolerates missing content-session data;
- profile export still uses existing save-action error handling;
- Key Management token forms still use existing validation messages and
  disabled-state behavior;
- Model List fallback failures still use existing partial-success/loading
  status behavior;
- storage update failures still return the existing storage failure paths.

Do not introduce new user-facing copy in this slice.

## Telemetry Decision

Telemetry decision: reuse existing.

This is an internal architecture refactor. It does not add a new user action,
setting, async flow, or analytics field. Existing account save, import, profile
save, and duplicate-warning telemetry should continue to emit from the same
call sites.

The product profile must not record raw URLs, hosts, usernames, IDs, tokens,
cookies, or backend messages.

## Settings Search Decision

Settings search decision: none.

The slice does not add, rename, move, or remove settings UI, anchors, or search
definitions.

## E2E Decision

E2E decision: no new Playwright E2E by default.

The main risk is deterministic product mapping and account payload
normalization. Focused unit and hook tests are the right layer. Add E2E only if
implementation changes browser permission behavior, content-script message
payloads, or cross-entrypoint account save flows beyond profile lookups.

## Testing Strategy

Add profile tests:

- `tests/services/accounts/accountSiteProfile.test.ts`
  - default compatible profile requires username and uses `id`;
  - Sub2API profile allows empty username and accepts refresh-token
    supplemental auth;
  - AIHubMix profile uses `username`, recognized hostnames, web storage origin,
    API managed-channel origin, and web duplicate origin;
  - profile auth defaults preserve AnyRouter cookie-auth behavior;
  - Sub2API model-list policy enables token-scoped fallback and disables direct
    pricing;
  - AIHubMix token-form policy uses subnet limits and one-time-secret handling;
  - unknown site type uses default compatible behavior;
  - profile objects returned to callers cannot mutate the source profile table.

Update identity tests:

- `tests/services/accounts/accountIdentity.test.ts`
  - compatible sites resolve `id`;
  - AIHubMix resolves `username`;
  - current/session user identity matching uses the same profile field order as
    stored identity extraction;
  - invalid or missing identity values return `null`;
  - fallback coercion behavior remains unchanged.

Update URL normalization tests:

- `tests/services/accounts/siteUrlNormalization.test.ts`
  - existing AIHubMix storage, managed-channel, origin-key, duplicate-check,
    and same-origin behavior remains unchanged;
  - non-AIHubMix trimming and invalid URL behavior remains unchanged;
  - `isAIHubMixSiteUrl(...)` still recognizes the existing hostname set.

Update account operation tests:

- `tests/services/accountOperations.test.ts` or the existing focused
  save/update suites should prove:
  - Sub2API empty username remains valid;
  - default compatible empty username remains invalid;
  - Sub2API refresh-token payload is normalized through the profile;
  - non-Sub2API supplemental auth input is ignored.

Update account storage tests where existing coverage already touches these
paths:

- AIHubMix duplicate lookup still treats console/API hostnames as one product
  origin.
- Sub2API auth update still persists only valid refresh-token state.
- Sub2API account API request decoration still includes saved sidecar auth only
  when the profile allows auth-session request decoration.

Update profile-save tests:

- `tests/features/KeyManagement/utils/apiCredentialProfileSaveAction.test.tsx`
  or adjacent coverage should assert AIHubMix profile export uses the
  profile-backed API origin.

Update Account Dialog policy/component tests:

- `sitePolicy` tests should prove profile auth/supplemental-auth facts are
  converted into the same dialog policy results as today.
- `AccountForm` and `SiteInfoInput` component tests, if touched, should assert
  rendered behavior through policy props rather than raw site-type branches.

Update auth-default and sponsor-intent tests:

- AnyRouter host aliases still default to cookie auth.
- Sponsor intents with omitted auth type receive the profile default.
- Sponsor intents with fixed-origin account sites normalize before being used
  to create account state.

Update current-tab matching tests:

- origin/site-type hint selection prefers profile/onboarding host recognition
  instead of the first non-unknown account in UI state.
- current-account identity comparison uses profile-backed identity matching
  rather than `account_info.id` directly.
- missing profile matches preserve the existing fallback.

Update Key Management token-form tests:

- compatible sites keep IP-list validation;
- AIHubMix keeps subnet-limit validation/copy;
- created-token one-time-secret handling is derived from the product policy.

Update Model List tests:

- Sub2API runtime-key catalog fallback still runs only when token-scoped policy
  allows it;
- direct-pricing suppression still applies for Sub2API source accounts;
- key-scoped status display is driven by source-account status metadata;
- AIHubMix source capability downgrades are derived from normalized response
  metadata or profile display policy, not render-time provider checks.

Focused validation:

```powershell
pnpm vitest run tests/services/accounts/accountSiteProfile.test.ts tests/services/accounts/accountIdentity.test.ts tests/services/accounts/siteUrlNormalization.test.ts tests/services/accountOperations.test.ts
```

Add account-storage, Account Dialog, sponsor-intent, current-tab matching, Key
Management, profile-save, and Model List focused test files to the command once
the implementation identifies the exact existing suites to update.

Related validation:

```powershell
pnpm vitest related --run src/services/accounts/accountSiteProfile/index.ts src/services/accounts/accountIdentity.ts src/services/accounts/utils/siteUrlNormalization.ts src/services/accounts/utils/apiServiceRequest.ts src/services/accounts/accountOperations.ts src/services/accounts/accountStorage.ts src/features/AccountManagement/components/AccountDialog/sitePolicy.ts src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts src/features/AccountManagement/hooks/AccountDataContext.tsx src/features/AccountManagement/utils/accountAuthType.ts src/features/AccountManagement/sponsors/pendingAddAccountIntent.ts src/features/KeyManagement/utils/apiCredentialProfileSaveAction.tsx src/features/KeyManagement/components/AddTokenDialog/hooks/useTokenForm.ts src/features/ModelList/hooks/useModelData.ts
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
shared account services, storage helpers, and feature export behavior.

## Migration Completeness Checks

Run these searches during implementation:

```powershell
rg "siteType === SITE_TYPES.AIHUBMIX|siteType === SITE_TYPES.SUB2API|siteType !== SITE_TYPES.AIHUBMIX|siteType !== SITE_TYPES.SUB2API|site_type === SITE_TYPES.AIHUBMIX|site_type === SITE_TYPES.SUB2API" src/services/accounts src/features/AccountManagement src/features/KeyManagement src/features/ModelList src/services/apiCredentialProfiles
rg "isSub2Api|anyrouter\\.top|AIHUBMIX_API_ORIGIN|AIHUBMIX_WEB_ORIGIN|AIHUBMIX_HOSTNAMES" src/services/accounts src/features/AccountManagement src/features/KeyManagement src/features/ModelList src/services/apiCredentialProfiles
rg "account_info\\.id|apiServiceRequest" src/services/accounts src/features/AccountManagement
rg "sub2apiAuth" src/services/accounts src/features/AccountManagement/components/AccountDialog
```

Expected after implementation:

- Raw AIHubMix URL/origin decisions in account services and profile export are
  routed through product-profile URL helpers.
- Raw Sub2API username and supplemental-auth decisions in account services are
  routed through product-profile helpers.
- Account API request decoration uses the auth-session profile instead of a raw
  Sub2API check.
- Current/saved account identity matching uses profile-backed identity helpers
  instead of directly comparing `account_info.id`.
- Account Dialog may still contain Sub2API/AIHubMix references through
  feature-local policy tables, hook workflow names, and persisted field names,
  but rendered form components should consume policy results.
- Key Management and Model List render components should not branch directly on
  AIHubMix/Sub2API for product policy once the relevant profile helper exists.
- AnyRouter hostnames should appear in a profile/auth-policy table rather than
  a one-off Account Dialog utility.
- `sub2apiAuth` may remain as the persisted schema field and in migration code.
- Backend adapters, onboarding metadata, managed-site code, and migration code
  may still reference concrete site types.

## Rollout

1. Add `accountSiteProfile` contracts, profile table, and direct tests.
2. Route stored-user identity selection through profile identity helpers.
3. Route URL canonicalization through profile URL helpers while keeping public
   helper names stable.
4. Route account validation and supplemental auth normalization in
   `accountOperations.ts` through the profile.
5. Route account-storage duplicate/auth update branches through profile helpers
   only where focused tests lock behavior down.
6. Route auth defaults, sponsor intent normalization, and current-tab
   content-session hint selection through profile/onboarding helpers.
7. Route API credential profile export origin through the profile-backed URL
   helper.
8. Route Key Management created-token and token-form network-limit policies
   through profile helpers.
9. Route Model List source-account fallback/status/display policies through
   profile helpers while keeping backend model fetches in adapters/services.
10. Bridge Account Dialog site policy to shared profile facts without moving UI
    policy into the shared module; rendered components should consume policy
    results.
11. Run focused tests after each migration group.
12. Run migration completeness searches.
13. Run related validation, `validate:staged`, and `validate:push`.
14. Inspect the final diff for scope drift before publishing.

## Follow-Up, Not In Scope For This Spec

- Consolidate account-site registration metadata across `SITE_TYPES`,
  onboarding metadata, adapter-family routing, and product profiles.
- Add a lint guard or test that every account site type resolves to an explicit
  product profile once registration consolidation is ready.
- Remove compatibility helper names such as `isAIHubMixSiteUrl(...)` only if
  no public or test-facing callers need them.
- Generalize persisted supplemental auth schema beyond `sub2apiAuth` if a
  future site type needs a different saved auth payload.
- Revisit managed-site provider and model-sync seams if the next new site type
  needs admin-managed support.
- Move model pricing assembly or dashboard estimate implementations only if a
  later slice proves they are backend facts rather than product fallback policy.
- Add static enforcement that feature render components cannot import concrete
  site-type constants for product policy decisions.

The key boundary is intentional: onboarding chooses a site type, adapters
describe backend behavior, product profile describes saved-account semantics,
and feature-local policies keep UI workflow decisions.
