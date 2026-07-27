# Account Site Product Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a service-layer account-site product profile so saved-account product semantics are centralized while existing account, Account Dialog, Key Management, and Model List behavior stays unchanged.

**Architecture:** Create `src/services/accounts/accountSiteProfile/` as the product-policy seam for account validation, identity extraction, URL canonicalization, supplemental auth, auth defaults, token-form policy, created-token secret handling, and Model List source-account policy. Keep onboarding metadata in `src/services/accountSiteOnboarding/`, backend facts in `SiteAdapter`, and UI workflow decisions in feature-local policy modules that read profile facts.

**Tech Stack:** TypeScript, React, Vitest, Testing Library, WXT fake browser test setup, pnpm.

**Spec:** `docs/superpowers/specs/2026-06-21-account-site-product-profile-design.md`

---

## File Structure

Create:

- `src/services/accounts/accountSiteProfile/contracts.ts`
  - Own exported profile constant maps and derived types.
- `src/services/accounts/accountSiteProfile/profiles.ts`
  - Own the default compatible profile plus Sub2API, AIHubMix, and AnyRouter overrides.
- `src/services/accounts/accountSiteProfile/registry.ts`
  - Resolve immutable profile snapshots for site types and URLs.
- `src/services/accounts/accountSiteProfile/auth.ts`
  - Resolve allowed/default auth type from profile auth rules.
- `src/services/accounts/accountSiteProfile/authSession.ts`
  - Resolve whether account API requests can carry a saved auth-session sidecar.
- `src/services/accounts/accountSiteProfile/identity.ts`
  - Resolve stored/current browser-session identity fields and identity matching.
- `src/services/accounts/accountSiteProfile/modelList.ts`
  - Resolve Model List source-account fallback/status/display policy.
- `src/services/accounts/accountSiteProfile/supplementalAuth.ts`
  - Normalize profile-permitted supplemental auth payloads.
- `src/services/accounts/accountSiteProfile/tokenForm.ts`
  - Resolve created-token secret handling and token-form network-limit policy.
- `src/services/accounts/accountSiteProfile/urls.ts`
  - Resolve recognized host aliases and storage/managed-channel/duplicate origins.
- `src/services/accounts/accountSiteProfile/contentSessionHint.ts`
  - Resolve content-session site-type hints from an origin plus known accounts.
- `src/services/accounts/accountSiteProfile/index.ts`
  - Re-export the public profile API.
- `tests/services/accounts/accountSiteProfile.test.ts`
  - Cover direct profile contract behavior and immutability.

Modify:

- `src/services/accounts/accountIdentity.ts`
- `tests/services/accounts/accountIdentity.test.ts`
- `src/services/accounts/utils/siteUrlNormalization.ts`
- `tests/services/accounts/siteUrlNormalization.test.ts`
- `src/services/accounts/accountOperations.ts`
- `tests/services/accountOperations.test.ts`
- `tests/services/accountOperations.validateAndSaveAccount.test.ts`
- `src/services/accounts/accountStorage.ts`
- `tests/services/accountStorage.test.ts`
- `src/services/accounts/utils/apiServiceRequest.ts`
- `tests/services/accounts/apiServiceRequest.test.ts`
- `src/features/AccountManagement/utils/accountAuthType.ts`
- `tests/features/AccountManagement/utils/accountAuthType.test.ts`
- `src/features/AccountManagement/sponsors/pendingAddAccountIntent.ts`
- `tests/features/AccountManagement/sponsors/pendingAddAccountIntent.test.ts`
- `src/features/AccountManagement/hooks/AccountDataContext.tsx`
- `tests/features/AccountManagement/hooks/AccountDataContext.currentTabDetection.test.tsx`
- `src/features/AccountManagement/components/AccountDialog/sitePolicy.ts`
- `tests/features/AccountManagement/components/AccountDialog/sitePolicy.test.ts`
- `src/features/AccountManagement/components/AccountDialog/AccountForm.tsx`
- `tests/features/AccountManagement/components/AccountDialogForm.test.tsx`
- `src/features/AccountManagement/components/AccountDialog/SiteInfoInput.tsx`
- `tests/features/AccountManagement/components/AccountDialogSiteInfoInput.test.tsx`
- `src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts`
- `tests/features/AccountManagement/hooks/useAccountDialog.currentTabDetection.test.tsx`
- `src/features/AccountManagement/components/AccountDialog/index.tsx`
- `src/features/KeyManagement/utils.ts`
- `tests/features/KeyManagement/utils.test.ts`
- `src/features/KeyManagement/utils/apiCredentialProfileSaveAction.tsx`
- `tests/features/KeyManagement/utils/apiCredentialProfileSaveAction.test.ts`
- `src/features/KeyManagement/components/TokenListItem/TokenHeader.tsx`
- `tests/entrypoints/options/pages/KeyManagement/TokenHeader.saveToApiProfiles.test.tsx`
- `src/features/KeyManagement/components/AddTokenDialog/hooks/useTokenForm.ts`
- `tests/entrypoints/options/pages/KeyManagement/AddTokenDialog.prefill.test.tsx`
- `src/features/KeyManagement/components/AddTokenDialog/TokenForm/AdvancedSettingsSection.tsx`
- `src/services/apiCredentialProfiles/modelCatalog.ts`
- `tests/services/apiCredentialProfiles/modelCatalog.test.ts`
- `src/features/ModelList/hooks/useModelData.ts`
- `tests/entrypoints/options/pages/ModelList/useModelData.test.tsx`
- `src/features/ModelList/components/StatusIndicator.tsx`
- `tests/entrypoints/options/pages/ModelList/StatusIndicator.test.tsx`
- `src/features/ModelList/aihubmixModelList.ts`
- `tests/features/ModelList/ModelList.test.tsx`

Do not modify:

- `src/services/apiAdapters/**`, except imports needed by existing callers.
- `src/services/accountSiteOnboarding/**`, except read-only consumption from the new hint helper.
- `src/constants/siteType.ts`
- `src/locales/**`
- telemetry event schemas or privacy allow-lists
- settings search definitions
- Playwright E2E tests by default

---

## Implementation Notes

This is behavior-preserving refactor work.

Keep these public helper names stable:

- `resolveStoredAccountUserIdentity(...)`
- `normalizeAccountSiteUrlForStorage(...)`
- `normalizeAccountSiteUrlForManagedChannel(...)`
- `normalizeAccountForManagedChannel(...)`
- `normalizeAccountSiteUrlForOriginKey(...)`
- `normalizeAccountSiteUrlForDuplicateCheck(...)`
- `isAIHubMixSiteUrl(...)`
- `isSameAccountSiteOrigin(...)`
- `resolveDefaultAccountAuthType(...)`
- `shouldShowOneTimeKeyDialogForCreatedToken(...)`
- `createDisplayAccountApiContext(...)`

The implementation may add profile-backed helpers behind these names, but existing callers should not be forced through a large rename.

Telemetry decision: reuse existing. This slice does not add user-visible actions or analytics fields.

Settings search decision: none. This slice does not add, rename, move, or remove settings UI.

E2E decision: no new Playwright E2E by default. The risk is deterministic policy mapping plus account/hook behavior that focused Vitest and Testing Library coverage can exercise.

---

### Task 1: Add Product Profile Contracts, Table, And Direct Tests

**Files:**

- Create `src/services/accounts/accountSiteProfile/contracts.ts`
- Create `src/services/accounts/accountSiteProfile/profiles.ts`
- Create `src/services/accounts/accountSiteProfile/registry.ts`
- Create `src/services/accounts/accountSiteProfile/index.ts`
- Create `tests/services/accounts/accountSiteProfile.test.ts`

- [ ] **Step 1: Write failing profile contract tests**

Create `tests/services/accounts/accountSiteProfile.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import {
  AIHUBMIX_API_ORIGIN,
  AIHUBMIX_WEB_ORIGIN,
  SITE_TYPES,
} from "~/constants/siteType"
import {
  ACCOUNT_SITE_AUTH_SESSION_REFRESH_LOCK_SCOPES,
  ACCOUNT_SITE_CREATED_TOKEN_SECRET_HANDLING,
  ACCOUNT_SITE_MODEL_LIST_DIRECT_PRICING,
  ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES,
  ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS,
  ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS,
  ACCOUNT_SITE_TOKEN_FORM_NETWORK_LIMIT_POLICIES,
  getAccountSiteProductProfile,
} from "~/services/accounts/accountSiteProfile"
import { AuthTypeEnum } from "~/types"

describe("accountSiteProfile", () => {
  it("resolves a default compatible profile for unmapped account sites", () => {
    const profile = getAccountSiteProductProfile(SITE_TYPES.NEW_API)

    expect(profile.siteType).toBe(SITE_TYPES.NEW_API)
    expect(profile.identity.usernameRequired).toBe(true)
    expect(profile.identity.storedUserIdentityFields).toEqual(["id"])
    expect(profile.auth.allowedAuthTypes).toEqual([
      AuthTypeEnum.AccessToken,
      AuthTypeEnum.Cookie,
    ])
    expect(profile.auth.defaultAuthType).toBe(AuthTypeEnum.AccessToken)
    expect(profile.auth.supportsCookieAuth).toBe(true)
    expect(profile.auth.supportsBuiltInCheckInDetection).toBe(true)
    expect(profile.supplementalAuth.kind).toBe(
      ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS.None,
    )
    expect(profile.authSession.decoratesAccountApiRequests).toBe(false)
    expect(profile.createdToken.secretHandling).toBe(
      ACCOUNT_SITE_CREATED_TOKEN_SECRET_HANDLING.ResponseKey,
    )
    expect(profile.tokenForm.networkLimitPolicy).toBe(
      ACCOUNT_SITE_TOKEN_FORM_NETWORK_LIMIT_POLICIES.IpList,
    )
    expect(profile.modelList.directPricing).toBe(
      ACCOUNT_SITE_MODEL_LIST_DIRECT_PRICING.Supported,
    )
    expect(profile.modelList.statusScope).toBe(
      ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Account,
    )
  })

  it("resolves Sub2API saved-account product rules", () => {
    const profile = getAccountSiteProductProfile(SITE_TYPES.SUB2API)

    expect(profile.identity.usernameRequired).toBe(false)
    expect(profile.auth.allowedAuthTypes).toEqual([AuthTypeEnum.AccessToken])
    expect(profile.auth.supportsCookieAuth).toBe(false)
    expect(profile.auth.supportsBuiltInCheckInDetection).toBe(false)
    expect(profile.supplementalAuth.kind).toBe(
      ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS.Sub2ApiRefreshToken,
    )
    expect(profile.authSession).toMatchObject({
      kind: ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS.Sub2ApiRefreshToken,
      decoratesAccountApiRequests: true,
      refreshLockScope: ACCOUNT_SITE_AUTH_SESSION_REFRESH_LOCK_SCOPES.Account,
    })
    expect(profile.modelList.directPricing).toBe(
      ACCOUNT_SITE_MODEL_LIST_DIRECT_PRICING.Unsupported,
    )
    expect(profile.modelList.tokenScopedCatalogFallback).toBe(
      ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS.RuntimeKey,
    )
    expect(profile.modelList.statusScope).toBe(
      ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Token,
    )
  })

  it("resolves AIHubMix identity, URL, key, token-form, and model-list rules", () => {
    const profile = getAccountSiteProductProfile(SITE_TYPES.AIHUBMIX)

    expect(profile.identity.storedUserIdentityFields).toEqual(["username"])
    expect(profile.urls.recognizedHostnames).toEqual([
      "aihubmix.com",
      "www.aihubmix.com",
      "console.aihubmix.com",
    ])
    expect(profile.urls.storageOrigin).toBe(AIHUBMIX_WEB_ORIGIN)
    expect(profile.urls.duplicateOrigin).toBe(AIHUBMIX_WEB_ORIGIN)
    expect(profile.urls.managedChannelOrigin).toBe(AIHUBMIX_API_ORIGIN)
    expect(profile.createdToken.secretHandling).toBe(
      ACCOUNT_SITE_CREATED_TOKEN_SECRET_HANDLING.OneTimeSecretDialog,
    )
    expect(profile.tokenForm.networkLimitPolicy).toBe(
      ACCOUNT_SITE_TOKEN_FORM_NETWORK_LIMIT_POLICIES.SubnetLimit,
    )
    expect(profile.auth.allowedAuthTypes).toEqual([AuthTypeEnum.AccessToken])
  })

  it("keeps AnyRouter cookie auth default as profile data", () => {
    const profile = getAccountSiteProductProfile(SITE_TYPES.ANYROUTER)

    expect(profile.auth.defaultAuthType).toBe(AuthTypeEnum.Cookie)
    expect(profile.auth.defaultAuthHostnames).toEqual(["anyrouter.top"])
  })

  it("returns defensive copies so callers cannot mutate source profiles", () => {
    const first = getAccountSiteProductProfile(SITE_TYPES.AIHUBMIX)
    const mutableHostnames = first.urls.recognizedHostnames as string[]
    mutableHostnames.push("mutated.example.invalid")

    const second = getAccountSiteProductProfile(SITE_TYPES.AIHUBMIX)
    expect(second.urls.recognizedHostnames).toEqual([
      "aihubmix.com",
      "www.aihubmix.com",
      "console.aihubmix.com",
    ])
  })
})
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
pnpm vitest run tests/services/accounts/accountSiteProfile.test.ts
```

Expected: FAIL with an import error for `~/services/accounts/accountSiteProfile`.

- [ ] **Step 3: Add `contracts.ts`**

Create `src/services/accounts/accountSiteProfile/contracts.ts`:

```ts
import type { AccountSiteType } from "~/constants/siteType"
import type { AuthTypeEnum } from "~/types"

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
  allowedAuthTypes: readonly AuthTypeEnum[]
  defaultAuthType: AuthTypeEnum
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
  supplementalAuth: {
    kind: AccountSiteSupplementalAuthKind
  }
  tokenForm: AccountSiteTokenFormProfile
  urls: AccountSiteUrlProfile
}
```

- [ ] **Step 4: Add `profiles.ts`**

Create `src/services/accounts/accountSiteProfile/profiles.ts`:

```ts
import {
  AIHUBMIX_API_ORIGIN,
  AIHUBMIX_HOSTNAMES,
  AIHUBMIX_WEB_ORIGIN,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"
import { AuthTypeEnum } from "~/types"

import {
  ACCOUNT_SITE_AUTH_SESSION_REFRESH_LOCK_SCOPES,
  ACCOUNT_SITE_CREATED_TOKEN_SECRET_HANDLING,
  ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS,
  ACCOUNT_SITE_MODEL_LIST_DIRECT_PRICING,
  ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES,
  ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES,
  ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS,
  ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS,
  ACCOUNT_SITE_TOKEN_FORM_NETWORK_LIMIT_POLICIES,
  type AccountSiteProductProfile,
} from "./contracts"

export const DEFAULT_ACCOUNT_SITE_PRODUCT_PROFILE: AccountSiteProductProfile = {
  siteType: SITE_TYPES.UNKNOWN,
  auth: {
    allowedAuthTypes: [AuthTypeEnum.AccessToken, AuthTypeEnum.Cookie],
    defaultAuthType: AuthTypeEnum.AccessToken,
    defaultAuthHostnames: [],
    supportsCookieAuth: true,
    supportsBuiltInCheckInDetection: true,
  },
  authSession: {
    kind: ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS.None,
    decoratesAccountApiRequests: false,
    refreshLockScope: ACCOUNT_SITE_AUTH_SESSION_REFRESH_LOCK_SCOPES.None,
  },
  createdToken: {
    secretHandling: ACCOUNT_SITE_CREATED_TOKEN_SECRET_HANDLING.ResponseKey,
  },
  identity: {
    usernameRequired: true,
    storedUserIdentityFields: ["id"],
  },
  modelList: {
    directPricing: ACCOUNT_SITE_MODEL_LIST_DIRECT_PRICING.Supported,
    tokenScopedCatalogFallback:
      ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS.None,
    dashboardEstimateLoader:
      ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS.None,
    statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Account,
    displayCapabilitiesSource:
      ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Response,
  },
  supplementalAuth: {
    kind: ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS.None,
  },
  tokenForm: {
    networkLimitPolicy: ACCOUNT_SITE_TOKEN_FORM_NETWORK_LIMIT_POLICIES.IpList,
  },
  urls: {
    recognizedHostnames: [],
  },
}

export const ACCOUNT_SITE_PRODUCT_PROFILE_OVERRIDES: Partial<
  Record<AccountSiteType, Partial<AccountSiteProductProfile>>
> = {
  [SITE_TYPES.ANYROUTER]: {
    auth: {
      ...DEFAULT_ACCOUNT_SITE_PRODUCT_PROFILE.auth,
      defaultAuthType: AuthTypeEnum.Cookie,
      defaultAuthHostnames: ["anyrouter.top"],
    },
  },
  [SITE_TYPES.SUB2API]: {
    auth: {
      allowedAuthTypes: [AuthTypeEnum.AccessToken],
      defaultAuthType: AuthTypeEnum.AccessToken,
      defaultAuthHostnames: [],
      supportsCookieAuth: false,
      supportsBuiltInCheckInDetection: false,
    },
    authSession: {
      kind: ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS.Sub2ApiRefreshToken,
      decoratesAccountApiRequests: true,
      refreshLockScope: ACCOUNT_SITE_AUTH_SESSION_REFRESH_LOCK_SCOPES.Account,
    },
    identity: {
      usernameRequired: false,
      storedUserIdentityFields: ["id"],
    },
    modelList: {
      directPricing: ACCOUNT_SITE_MODEL_LIST_DIRECT_PRICING.Unsupported,
      tokenScopedCatalogFallback:
        ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS.RuntimeKey,
      dashboardEstimateLoader:
        ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS.Sub2Api,
      statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Token,
      displayCapabilitiesSource:
        ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Response,
    },
    supplementalAuth: {
      kind: ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS.Sub2ApiRefreshToken,
    },
  },
  [SITE_TYPES.AIHUBMIX]: {
    auth: {
      allowedAuthTypes: [AuthTypeEnum.AccessToken],
      defaultAuthType: AuthTypeEnum.AccessToken,
      defaultAuthHostnames: [],
      supportsCookieAuth: false,
      supportsBuiltInCheckInDetection: true,
    },
    createdToken: {
      secretHandling:
        ACCOUNT_SITE_CREATED_TOKEN_SECRET_HANDLING.OneTimeSecretDialog,
    },
    identity: {
      usernameRequired: true,
      storedUserIdentityFields: ["username"],
    },
    modelList: {
      directPricing: ACCOUNT_SITE_MODEL_LIST_DIRECT_PRICING.Supported,
      tokenScopedCatalogFallback:
        ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS.None,
      dashboardEstimateLoader:
        ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS.None,
      statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Account,
      displayCapabilitiesSource:
        ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Profile,
    },
    tokenForm: {
      networkLimitPolicy:
        ACCOUNT_SITE_TOKEN_FORM_NETWORK_LIMIT_POLICIES.SubnetLimit,
    },
    urls: {
      recognizedHostnames: AIHUBMIX_HOSTNAMES,
      storageOrigin: AIHUBMIX_WEB_ORIGIN,
      duplicateOrigin: AIHUBMIX_WEB_ORIGIN,
      managedChannelOrigin: AIHUBMIX_API_ORIGIN,
    },
  },
}
```

- [ ] **Step 5: Add `registry.ts` and `index.ts`**

Create `src/services/accounts/accountSiteProfile/registry.ts`:

```ts
import { type AccountSiteType } from "~/constants/siteType"

import type { AccountSiteProductProfile } from "./contracts"
import {
  ACCOUNT_SITE_PRODUCT_PROFILE_OVERRIDES,
  DEFAULT_ACCOUNT_SITE_PRODUCT_PROFILE,
} from "./profiles"

type DeepMutable<T> = {
  -readonly [P in keyof T]: T[P] extends readonly (infer U)[]
    ? U[]
    : T[P] extends object
      ? DeepMutable<T[P]>
      : T[P]
}

const cloneProfile = (
  profile: AccountSiteProductProfile,
): AccountSiteProductProfile => ({
  siteType: profile.siteType,
  auth: {
    ...profile.auth,
    allowedAuthTypes: [...profile.auth.allowedAuthTypes],
    defaultAuthHostnames: [...profile.auth.defaultAuthHostnames],
  },
  authSession: { ...profile.authSession },
  createdToken: { ...profile.createdToken },
  identity: {
    ...profile.identity,
    storedUserIdentityFields: [...profile.identity.storedUserIdentityFields],
  },
  modelList: { ...profile.modelList },
  supplementalAuth: { ...profile.supplementalAuth },
  tokenForm: { ...profile.tokenForm },
  urls: {
    ...profile.urls,
    recognizedHostnames: [...profile.urls.recognizedHostnames],
  },
})

const mergeProfile = (
  siteType: AccountSiteType,
  override: Partial<AccountSiteProductProfile> | undefined,
): AccountSiteProductProfile => {
  const merged: DeepMutable<AccountSiteProductProfile> = {
    ...cloneProfile(DEFAULT_ACCOUNT_SITE_PRODUCT_PROFILE),
    siteType,
    auth: {
      ...DEFAULT_ACCOUNT_SITE_PRODUCT_PROFILE.auth,
      ...override?.auth,
      allowedAuthTypes: [
        ...(override?.auth?.allowedAuthTypes ??
          DEFAULT_ACCOUNT_SITE_PRODUCT_PROFILE.auth.allowedAuthTypes),
      ],
      defaultAuthHostnames: [
        ...(override?.auth?.defaultAuthHostnames ??
          DEFAULT_ACCOUNT_SITE_PRODUCT_PROFILE.auth.defaultAuthHostnames),
      ],
    },
    authSession: {
      ...DEFAULT_ACCOUNT_SITE_PRODUCT_PROFILE.authSession,
      ...override?.authSession,
    },
    createdToken: {
      ...DEFAULT_ACCOUNT_SITE_PRODUCT_PROFILE.createdToken,
      ...override?.createdToken,
    },
    identity: {
      ...DEFAULT_ACCOUNT_SITE_PRODUCT_PROFILE.identity,
      ...override?.identity,
      storedUserIdentityFields: [
        ...(override?.identity?.storedUserIdentityFields ??
          DEFAULT_ACCOUNT_SITE_PRODUCT_PROFILE.identity
            .storedUserIdentityFields),
      ],
    },
    modelList: {
      ...DEFAULT_ACCOUNT_SITE_PRODUCT_PROFILE.modelList,
      ...override?.modelList,
    },
    supplementalAuth: {
      ...DEFAULT_ACCOUNT_SITE_PRODUCT_PROFILE.supplementalAuth,
      ...override?.supplementalAuth,
    },
    tokenForm: {
      ...DEFAULT_ACCOUNT_SITE_PRODUCT_PROFILE.tokenForm,
      ...override?.tokenForm,
    },
    urls: {
      ...DEFAULT_ACCOUNT_SITE_PRODUCT_PROFILE.urls,
      ...override?.urls,
      recognizedHostnames: [
        ...(override?.urls?.recognizedHostnames ??
          DEFAULT_ACCOUNT_SITE_PRODUCT_PROFILE.urls.recognizedHostnames),
      ],
    },
  }

  return merged
}

export function getAccountSiteProductProfile(
  siteType: AccountSiteType,
): AccountSiteProductProfile {
  return cloneProfile(
    mergeProfile(siteType, ACCOUNT_SITE_PRODUCT_PROFILE_OVERRIDES[siteType]),
  )
}
```

Create `src/services/accounts/accountSiteProfile/index.ts`:

```ts
export * from "./contracts"
export * from "./registry"
```

- [ ] **Step 6: Run focused profile tests**

Run:

```powershell
pnpm vitest run tests/services/accounts/accountSiteProfile.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add src/services/accounts/accountSiteProfile tests/services/accounts/accountSiteProfile.test.ts
git commit -m "refactor(account): add account site product profile"
```

---

### Task 2: Add URL And Auth Profile Helpers Behind Existing Public Names

**Files:**

- Create `src/services/accounts/accountSiteProfile/urls.ts`
- Create `src/services/accounts/accountSiteProfile/auth.ts`
- Modify `src/services/accounts/accountSiteProfile/index.ts`
- Modify `src/services/accounts/utils/siteUrlNormalization.ts`
- Modify `tests/services/accounts/siteUrlNormalization.test.ts`
- Modify `src/features/AccountManagement/utils/accountAuthType.ts`
- Modify `tests/features/AccountManagement/utils/accountAuthType.test.ts`

- [ ] **Step 1: Extend failing profile URL/auth tests**

Add these cases to `tests/services/accounts/accountSiteProfile.test.ts`:

```ts
import {
  getAccountSiteProductProfile,
  isAccountSiteProfileUrl,
  normalizeAccountSiteProfileUrlForDuplicateCheck,
  normalizeAccountSiteProfileUrlForManagedChannel,
  normalizeAccountSiteProfileUrlForOriginKey,
  normalizeAccountSiteProfileUrlForStorage,
  resolveAccountSiteDefaultAuthType,
} from "~/services/accounts/accountSiteProfile"
```

Add tests inside the existing `describe`:

```ts
  it("normalizes AIHubMix URLs through profile URL rules", () => {
    expect(
      normalizeAccountSiteProfileUrlForStorage({
        siteType: SITE_TYPES.AIHUBMIX,
        url: "https://aihubmix.com/statistics",
      }),
    ).toBe(AIHUBMIX_WEB_ORIGIN)
    expect(
      normalizeAccountSiteProfileUrlForManagedChannel({
        siteType: SITE_TYPES.AIHUBMIX,
        url: "https://console.aihubmix.com",
      }),
    ).toBe(AIHUBMIX_API_ORIGIN)
    expect(
      normalizeAccountSiteProfileUrlForOriginKey({
        url: "https://www.aihubmix.com/statistics",
      }),
    ).toBe(AIHUBMIX_WEB_ORIGIN.toLowerCase())
    expect(
      normalizeAccountSiteProfileUrlForDuplicateCheck({
        siteType: SITE_TYPES.AIHUBMIX,
        url: "",
      }),
    ).toBe(AIHUBMIX_WEB_ORIGIN.toLowerCase())
    expect(
      isAccountSiteProfileUrl(SITE_TYPES.AIHUBMIX, "console.aihubmix.com"),
    ).toBe(true)
  })

  it("preserves compatible URL trimming and origin behavior", () => {
    expect(
      normalizeAccountSiteProfileUrlForStorage({
        siteType: SITE_TYPES.NEW_API,
        url: " https://example.invalid/path ",
      }),
    ).toBe("https://example.invalid/path")
    expect(
      normalizeAccountSiteProfileUrlForManagedChannel({
        siteType: SITE_TYPES.NEW_API,
        url: " https://example.invalid/path ",
      }),
    ).toBe("https://example.invalid/path")
    expect(
      normalizeAccountSiteProfileUrlForOriginKey({
        siteType: SITE_TYPES.NEW_API,
        url: "https://example.invalid/path?tab=1",
      }),
    ).toBe("https://example.invalid")
  })

  it("resolves default auth type from profile host aliases", () => {
    expect(
      resolveAccountSiteDefaultAuthType({
        siteType: SITE_TYPES.ANYROUTER,
        url: "https://anyrouter.top/console",
      }),
    ).toBe(AuthTypeEnum.Cookie)
    expect(
      resolveAccountSiteDefaultAuthType({
        siteType: SITE_TYPES.NEW_API,
        url: "https://example.invalid",
      }),
    ).toBe(AuthTypeEnum.AccessToken)
  })
```

- [ ] **Step 2: Run the failing tests**

Run:

```powershell
pnpm vitest run tests/services/accounts/accountSiteProfile.test.ts
```

Expected: FAIL with missing exported helpers.

- [ ] **Step 3: Add `urls.ts`**

Create `src/services/accounts/accountSiteProfile/urls.ts`:

```ts
import {
  isAccountSiteType,
  type AccountSiteType,
  SITE_TYPES,
} from "~/constants/siteType"
import { sanitizeOriginUrl } from "~/utils/core/url"
import { normalizeUrlForOriginKey } from "~/utils/core/urlParsing"

import { getAccountSiteProductProfile } from "./registry"

const parseHttpUrl = (value: string): URL | null => {
  const trimmed = value.trim()
  if (!trimmed) return null

  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`

  try {
    const parsed = new URL(candidate)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed
      : null
  } catch {
    return null
  }
}

export function isAccountSiteProfileUrl(
  siteType: AccountSiteType,
  value: string,
): boolean {
  const parsed = parseHttpUrl(value)
  if (!parsed) return false

  const profile = getAccountSiteProductProfile(siteType)
  return profile.urls.recognizedHostnames.includes(
    parsed.hostname.toLowerCase(),
  )
}

function resolveProfileForUrl(params: {
  siteType?: AccountSiteType | string
  url: string
}) {
  if (isAccountSiteType(params.siteType)) {
    return getAccountSiteProductProfile(params.siteType)
  }

  if (isAccountSiteProfileUrl(SITE_TYPES.AIHUBMIX, params.url)) {
    return getAccountSiteProductProfile(SITE_TYPES.AIHUBMIX)
  }

  return null
}

export function normalizeAccountSiteProfileUrlForStorage(params: {
  siteType: AccountSiteType | string
  url: string
}): string {
  const profile = isAccountSiteType(params.siteType)
    ? getAccountSiteProductProfile(params.siteType)
    : null

  return profile?.urls.storageOrigin ?? params.url.trim()
}

export function normalizeAccountSiteProfileUrlForManagedChannel(params: {
  siteType?: AccountSiteType | string
  url: string
}): string {
  const profile = resolveProfileForUrl(params)
  return profile?.urls.managedChannelOrigin ?? params.url.trim()
}

export function normalizeAccountSiteProfileUrlForOriginKey(params: {
  siteType?: AccountSiteType | string
  url: string
}): string {
  const profile = resolveProfileForUrl(params)
  if (profile?.urls.duplicateOrigin) {
    return profile.urls.duplicateOrigin.toLowerCase()
  }

  return normalizeUrlForOriginKey(params.url, { lowerCase: true })
}

export function normalizeAccountSiteProfileUrlForDuplicateCheck(params: {
  siteType?: AccountSiteType | string
  url: string
}): string | undefined {
  const profile = resolveProfileForUrl(params)
  if (
    profile?.urls.duplicateOrigin &&
    (!params.url.trim() || isAccountSiteProfileUrl(profile.siteType, params.url))
  ) {
    return profile.urls.duplicateOrigin.toLowerCase()
  }

  if (profile?.urls.duplicateOrigin) {
    return profile.urls.duplicateOrigin.toLowerCase()
  }

  return sanitizeOriginUrl(params.url)?.toLowerCase()
}
```

- [ ] **Step 4: Add `auth.ts`**

Create `src/services/accounts/accountSiteProfile/auth.ts`:

```ts
import { isAccountSiteType, type AccountSiteType } from "~/constants/siteType"
import { AuthTypeEnum } from "~/types"

import { getAccountSiteProductProfile } from "./registry"

const getHostname = (value: string | null | undefined): string | null => {
  if (!value) return null

  try {
    return new URL(value).hostname.toLowerCase()
  } catch {
    return null
  }
}

export function resolveAccountSiteDefaultAuthType({
  siteType,
  url,
}: {
  siteType?: AccountSiteType | string
  url?: string | null
} = {}): AuthTypeEnum {
  const normalizedSiteType = isAccountSiteType(siteType) ? siteType : undefined
  const profile = normalizedSiteType
    ? getAccountSiteProductProfile(normalizedSiteType)
    : null
  const hostname = getHostname(url)

  if (
    hostname &&
    profile?.auth.defaultAuthHostnames.some(
      (knownHostname) => knownHostname.toLowerCase() === hostname,
    )
  ) {
    return profile.auth.defaultAuthType
  }

  return profile?.auth.defaultAuthType ?? AuthTypeEnum.AccessToken
}
```

- [ ] **Step 5: Re-export new helpers**

Modify `src/services/accounts/accountSiteProfile/index.ts`:

```ts
export * from "./auth"
export * from "./contracts"
export * from "./registry"
export * from "./urls"
```

- [ ] **Step 6: Route existing URL helpers through the profile**

In `src/services/accounts/utils/siteUrlNormalization.ts`, replace direct AIHubMix constants and local host parsing with profile helpers:

```ts
import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import {
  isAccountSiteProfileUrl,
  normalizeAccountSiteProfileUrlForDuplicateCheck,
  normalizeAccountSiteProfileUrlForManagedChannel,
  normalizeAccountSiteProfileUrlForOriginKey,
  normalizeAccountSiteProfileUrlForStorage,
} from "~/services/accounts/accountSiteProfile"

export function isAIHubMixSiteUrl(value: string): boolean {
  return isAccountSiteProfileUrl(SITE_TYPES.AIHUBMIX, value)
}

export function normalizeAccountSiteUrlForStorage(params: {
  siteType: AccountSiteType | string
  url: string
}): string {
  return normalizeAccountSiteProfileUrlForStorage(params)
}

export function normalizeAccountSiteUrlForManagedChannel(params: {
  siteType?: AccountSiteType | string
  url: string
}): string {
  return normalizeAccountSiteProfileUrlForManagedChannel(params)
}

export function normalizeAccountSiteUrlForOriginKey(params: {
  siteType?: AccountSiteType | string
  url: string
}): string {
  return normalizeAccountSiteProfileUrlForOriginKey(params)
}

export function normalizeAccountSiteUrlForDuplicateCheck(params: {
  siteType?: AccountSiteType | string
  url: string
}): string | undefined {
  return normalizeAccountSiteProfileUrlForDuplicateCheck(params)
}
```

Keep `normalizeAccountForManagedChannel(...)` and `isSameAccountSiteOrigin(...)` in this file with their existing bodies, but let them call the routed helpers above.

- [ ] **Step 7: Route account auth default through the profile**

Modify `src/features/AccountManagement/utils/accountAuthType.ts`:

```ts
import { SITE_TYPES } from "~/constants/siteType"
import { resolveAccountSiteDefaultAuthType } from "~/services/accounts/accountSiteProfile"
import { AuthTypeEnum } from "~/types"

const AUTH_TYPE_VALUES = new Set<string>(Object.values(AuthTypeEnum))

interface AccountAuthDefaultInput {
  siteType?: string | null
  siteUrl?: string | null
}

export function resolveDefaultAccountAuthType({
  siteType = SITE_TYPES.ANYROUTER,
  siteUrl,
}: AccountAuthDefaultInput = {}): AuthTypeEnum {
  return resolveAccountSiteDefaultAuthType({
    siteType,
    url: siteUrl,
  })
}
```

Leave `normalizeOptionalAccountAuthType(...)`, `normalizeAccountAuthTypeOrDefault(...)`, and `isAccountAuthType(...)` unchanged.

- [ ] **Step 8: Update account auth default tests**

In `tests/features/AccountManagement/utils/accountAuthType.test.ts`, keep existing AnyRouter expectations and add this explicit compatible fallback:

```ts
import { SITE_TYPES } from "~/constants/siteType"
```

```ts
  it("keeps compatible account sites on access-token auth by default", () => {
    expect(
      resolveDefaultAccountAuthType({
        siteType: SITE_TYPES.NEW_API,
        siteUrl: "https://example.invalid",
      }),
    ).toBe(AuthTypeEnum.AccessToken)
  })
```

- [ ] **Step 9: Run focused tests**

Run:

```powershell
pnpm vitest run tests/services/accounts/accountSiteProfile.test.ts tests/services/accounts/siteUrlNormalization.test.ts tests/features/AccountManagement/utils/accountAuthType.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

Run:

```powershell
git add src/services/accounts/accountSiteProfile src/services/accounts/utils/siteUrlNormalization.ts tests/services/accounts/accountSiteProfile.test.ts tests/services/accounts/siteUrlNormalization.test.ts src/features/AccountManagement/utils/accountAuthType.ts tests/features/AccountManagement/utils/accountAuthType.test.ts
git commit -m "refactor(account): route URL and auth defaults through product profiles"
```

---

### Task 3: Route Stored And Current User Identity Through Profile Helpers

**Files:**

- Create `src/services/accounts/accountSiteProfile/identity.ts`
- Modify `src/services/accounts/accountSiteProfile/index.ts`
- Modify `src/services/accounts/accountIdentity.ts`
- Modify `tests/services/accounts/accountIdentity.test.ts`
- Modify `src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts`
- Modify `tests/features/AccountManagement/hooks/useAccountDialog.currentTabDetection.test.tsx`
- Modify `src/features/AccountManagement/hooks/AccountDataContext.tsx`
- Modify `tests/features/AccountManagement/hooks/AccountDataContext.currentTabDetection.test.tsx`

- [ ] **Step 1: Add failing identity helper tests**

In `tests/services/accounts/accountSiteProfile.test.ts`, import:

```ts
import {
  doAccountSiteIdentitiesMatch,
  resolveAccountSiteUserIdentity,
} from "~/services/accounts/accountSiteProfile"
```

Add cases:

```ts
  it("resolves user identity from profile field order", () => {
    expect(
      resolveAccountSiteUserIdentity({
        siteType: SITE_TYPES.NEW_API,
        user: { id: 42, username: "compatible-user" },
      }),
    ).toBe("42")
    expect(
      resolveAccountSiteUserIdentity({
        siteType: SITE_TYPES.AIHUBMIX,
        user: { id: 42, username: "aihubmix-user" },
      }),
    ).toBe("aihubmix-user")
    expect(
      resolveAccountSiteUserIdentity({
        siteType: SITE_TYPES.AIHUBMIX,
        user: { id: 42 },
      }),
    ).toBeNull()
  })

  it("matches saved and current identities through the same profile rule", () => {
    expect(
      doAccountSiteIdentitiesMatch({
        siteType: SITE_TYPES.AIHUBMIX,
        savedUser: { username: "aihubmix-user" },
        currentUser: { username: "aihubmix-user" },
      }),
    ).toBe(true)
    expect(
      doAccountSiteIdentitiesMatch({
        siteType: SITE_TYPES.NEW_API,
        savedUser: { id: "42" },
        currentUser: { id: 42 },
      }),
    ).toBe(true)
  })
```

- [ ] **Step 2: Run the failing tests**

Run:

```powershell
pnpm vitest run tests/services/accounts/accountSiteProfile.test.ts
```

Expected: FAIL with missing identity helper exports.

- [ ] **Step 3: Add `identity.ts`**

Create `src/services/accounts/accountSiteProfile/identity.ts`:

```ts
import type { AccountSiteType } from "~/constants/siteType"
import type { AccountIdentity } from "~/types"

import { getAccountSiteProductProfile } from "./registry"

const normalizeIdentityValue = (value: unknown): AccountIdentity | null => {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value)
  }

  return null
}

export function resolveAccountSiteUserIdentity(params: {
  siteType: AccountSiteType
  user: unknown
}): AccountIdentity | null {
  if (!params.user || typeof params.user !== "object" || Array.isArray(params.user)) {
    return null
  }

  const userRecord = params.user as Record<string, unknown>
  const profile = getAccountSiteProductProfile(params.siteType)

  for (const field of profile.identity.storedUserIdentityFields) {
    const normalized = normalizeIdentityValue(userRecord[field])
    if (normalized) return normalized
  }

  return null
}

export function doAccountSiteIdentitiesMatch(params: {
  siteType: AccountSiteType
  savedUser: unknown
  currentUser: unknown
}): boolean {
  const savedIdentity = resolveAccountSiteUserIdentity({
    siteType: params.siteType,
    user: params.savedUser,
  })
  const currentIdentity = resolveAccountSiteUserIdentity({
    siteType: params.siteType,
    user: params.currentUser,
  })

  return Boolean(savedIdentity && currentIdentity && savedIdentity === currentIdentity)
}
```

- [ ] **Step 4: Re-export identity helpers**

Modify `src/services/accounts/accountSiteProfile/index.ts`:

```ts
export * from "./auth"
export * from "./contracts"
export * from "./identity"
export * from "./registry"
export * from "./urls"
```

- [ ] **Step 5: Route `accountIdentity.ts` through profile identity**

Modify `src/services/accounts/accountIdentity.ts` so `resolveStoredAccountUserIdentity(...)` becomes:

```ts
import { type AccountSiteType } from "~/constants/siteType"
import { resolveAccountSiteUserIdentity } from "~/services/accounts/accountSiteProfile"
import type { AccountIdentity } from "~/types"

type StoredAccountUserIdentity = {
  userId: AccountIdentity
  user: Record<string, unknown>
}

export function resolveStoredAccountUserIdentity(
  user: unknown,
  siteType: AccountSiteType,
): StoredAccountUserIdentity | null {
  if (!user || typeof user !== "object" || Array.isArray(user)) return null

  const userRecord = user as Record<string, unknown>
  const userId = resolveAccountSiteUserIdentity({
    siteType,
    user: userRecord,
  })

  if (!userId) return null

  return {
    userId,
    user: userRecord,
  }
}
```

Keep `normalizeAccountIdentity(...)` and `coerceAccountIdentity(...)` unchanged because callers use them for storage coercion.
This keeps the existing `resolveStoredAccountUserIdentity(...)` caller contract:
it still returns `StoredAccountUserIdentity | null` with `{ userId, user }` on
success. The change is limited to how `userId` is resolved for each
`AccountSiteType`; current spread-based consumers should continue to work, while
Task 10 grep checks catch any caller that needs the typed return shape.

- [ ] **Step 6: Route Account Dialog current-user matching through identity helper**

In `src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts`, import:

```ts
import { doAccountSiteIdentitiesMatch } from "~/services/accounts/accountSiteProfile"
```

Replace matching that compares `acc.account_info.id` to `currentUserId`:

```ts
const exactMatch = accounts.find((acc) =>
  doAccountSiteIdentitiesMatch({
    siteType: acc.site_type,
    savedUser: acc.account_info,
    currentUser: currentUserRecord,
  }),
)
```

Use the current user object returned by the content-session read. If the local scope only has `currentUserId`, create a small object at the call site:

```ts
const currentUserRecord = { id: currentUserId, username: currentUserId }
```

This temporary object preserves existing behavior for compatible sites and allows AIHubMix username matching when the content-session result carries username data.

- [ ] **Step 7: Route AccountDataContext matching through identity helper**

In `src/features/AccountManagement/hooks/AccountDataContext.tsx`, import:

```ts
import { doAccountSiteIdentitiesMatch } from "~/services/accounts/accountSiteProfile"
```

Replace:

```ts
normalizeAccountIdentity(account.account_info.id) === verifiedUserId
```

With:

```ts
doAccountSiteIdentitiesMatch({
  siteType: account.site_type,
  savedUser: account.account_info,
  currentUser: verifiedUser,
})
```

Use the full verified content-session user object when it is available. If the code path only has the normalized ID, pass `{ id: verifiedUserId, username: verifiedUserId }` and add a follow-up assertion in the test for AIHubMix when the full user object is present.

- [ ] **Step 8: Run focused tests**

Run:

```powershell
pnpm vitest run tests/services/accounts/accountSiteProfile.test.ts tests/services/accounts/accountIdentity.test.ts tests/features/AccountManagement/hooks/useAccountDialog.currentTabDetection.test.tsx tests/features/AccountManagement/hooks/AccountDataContext.currentTabDetection.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```powershell
git add src/services/accounts/accountSiteProfile src/services/accounts/accountIdentity.ts tests/services/accounts/accountSiteProfile.test.ts tests/services/accounts/accountIdentity.test.ts src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts tests/features/AccountManagement/hooks/useAccountDialog.currentTabDetection.test.tsx src/features/AccountManagement/hooks/AccountDataContext.tsx tests/features/AccountManagement/hooks/AccountDataContext.currentTabDetection.test.tsx
git commit -m "refactor(account): use profile-backed account identity"
```

---

### Task 4: Route Account Operations And Supplemental Auth Through Profile

**Files:**

- Create `src/services/accounts/accountSiteProfile/supplementalAuth.ts`
- Modify `src/services/accounts/accountSiteProfile/index.ts`
- Modify `src/services/accounts/accountOperations.ts`
- Modify `tests/services/accountOperations.test.ts`
- Modify `tests/services/accountOperations.validateAndSaveAccount.test.ts`

- [ ] **Step 1: Add failing supplemental-auth tests**

In `tests/services/accounts/accountSiteProfile.test.ts`, import:

```ts
import { normalizeAccountSiteSupplementalAuth } from "~/services/accounts/accountSiteProfile"
```

Add cases:

```ts
  it("normalizes supplemental auth only when the product profile permits it", () => {
    expect(
      normalizeAccountSiteSupplementalAuth({
        siteType: SITE_TYPES.SUB2API,
        sub2apiAuth: {
          refreshToken: " refresh-token ",
          tokenExpiresAt: 123,
        },
      }),
    ).toEqual({
      sub2apiAuth: {
        refreshToken: "refresh-token",
        tokenExpiresAt: 123,
      },
    })

    expect(
      normalizeAccountSiteSupplementalAuth({
        siteType: SITE_TYPES.NEW_API,
        sub2apiAuth: {
          refreshToken: " refresh-token ",
          tokenExpiresAt: 123,
        },
      }),
    ).toEqual({})

    expect(
      normalizeAccountSiteSupplementalAuth({
        siteType: SITE_TYPES.SUB2API,
        sub2apiAuth: {
          refreshToken: " ",
          tokenExpiresAt: Number.NaN,
        },
      }),
    ).toEqual({})
  })
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
pnpm vitest run tests/services/accounts/accountSiteProfile.test.ts
```

Expected: FAIL with missing `normalizeAccountSiteSupplementalAuth`.

- [ ] **Step 3: Add `supplementalAuth.ts`**

Create `src/services/accounts/accountSiteProfile/supplementalAuth.ts`:

```ts
import type { AccountSiteType } from "~/constants/siteType"
import type { Sub2ApiAuthConfig } from "~/types"

import { ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS } from "./contracts"
import { getAccountSiteProductProfile } from "./registry"

export type AccountSiteSupplementalAuthInput = {
  sub2apiAuth?: Sub2ApiAuthConfig
}

export type NormalizedAccountSiteSupplementalAuth = {
  sub2apiAuth?: Sub2ApiAuthConfig
}

export function normalizeAccountSiteSupplementalAuth(params: {
  siteType: AccountSiteType
} & AccountSiteSupplementalAuthInput): NormalizedAccountSiteSupplementalAuth {
  const profile = getAccountSiteProductProfile(params.siteType)

  if (
    profile.supplementalAuth.kind !==
    ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS.Sub2ApiRefreshToken
  ) {
    return {}
  }

  const refreshToken =
    typeof params.sub2apiAuth?.refreshToken === "string"
      ? params.sub2apiAuth.refreshToken.trim()
      : ""

  if (!refreshToken) return {}

  const tokenExpiresAtRaw = params.sub2apiAuth?.tokenExpiresAt
  const tokenExpiresAt =
    typeof tokenExpiresAtRaw === "number" &&
    Number.isFinite(tokenExpiresAtRaw) &&
    tokenExpiresAtRaw > 0
      ? tokenExpiresAtRaw
      : undefined

  return {
    sub2apiAuth: tokenExpiresAt
      ? { refreshToken, tokenExpiresAt }
      : { refreshToken },
  }
}
```

- [ ] **Step 4: Re-export supplemental auth helpers**

Modify `src/services/accounts/accountSiteProfile/index.ts`:

```ts
export * from "./auth"
export * from "./contracts"
export * from "./identity"
export * from "./registry"
export * from "./supplementalAuth"
export * from "./urls"
```

- [ ] **Step 5: Route username validation through the profile**

In `src/services/accounts/accountOperations.ts`, import:

```ts
import {
  getAccountSiteProductProfile,
  normalizeAccountSiteSupplementalAuth,
} from "~/services/accounts/accountSiteProfile"
```

Replace the username part of `isValidAccount(...)`:

```ts
const profile = getAccountSiteProductProfile(normalizedSiteType)

return (
  !!siteName.trim() &&
  (!profile.identity.usernameRequired || !!username.trim()) &&
  !!userId.trim() &&
  isValidExchangeRate(exchangeRate) &&
  (authType !== AuthTypeEnum.AccessToken || !!accessToken.trim()) &&
  (authType !== AuthTypeEnum.Cookie || !!cookieAuthSessionCookie?.trim())
)
```

- [ ] **Step 6: Route Sub2API auth normalization through the profile helper**

Replace private `normalizeSub2ApiAuthInput(...)` with:

```ts
function normalizeSub2ApiAuthInput(
  siteType: AccountSiteType,
  sub2apiAuth: Sub2ApiAuthConfig | undefined,
): Sub2ApiAuthConfig | undefined {
  return normalizeAccountSiteSupplementalAuth({
    siteType,
    sub2apiAuth,
  }).sub2apiAuth
}
```

Keep the private helper name for a smaller diff inside `validateAndSaveAccount(...)` and `validateAndUpdateAccount(...)`.

- [ ] **Step 7: Extend account operation tests**

In `tests/services/accountOperations.test.ts`, add or update `isValidAccount` coverage:

```ts
  it("allows empty usernames only for profile-permitted account sites", () => {
    expect(
      isValidAccount({
        siteName: "Example",
        username: "",
        userId: "user-id",
        siteType: SITE_TYPES.SUB2API,
        authType: AuthTypeEnum.AccessToken,
        accessToken: "access-token",
        exchangeRate: "7.2",
      }),
    ).toBe(true)

    expect(
      isValidAccount({
        siteName: "Example",
        username: "",
        userId: "user-id",
        siteType: SITE_TYPES.NEW_API,
        authType: AuthTypeEnum.AccessToken,
        accessToken: "access-token",
        exchangeRate: "7.2",
      }),
    ).toBe(false)
  })
```

In `tests/services/accountOperations.validateAndSaveAccount.test.ts`, keep the existing Sub2API `sub2apiAuth` save assertion and add:

```ts
  it("ignores Sub2API supplemental auth for non-Sub2API account sites", async () => {
    const addAccountSpy = vi.spyOn(accountStorage, "addAccount")

    const result = await validateAndSaveAccount(
      "https://example.invalid",
      "Example",
      "user@example.invalid",
      "access-token",
      "user-id",
      "7.2",
      "",
      [],
      CHECK_IN_DISABLED,
      SITE_TYPES.NEW_API,
      AuthTypeEnum.AccessToken,
      "",
      undefined,
      false,
      false,
      { refreshToken: " refresh-token " },
      { deferDataRefresh: true },
    )

    expect(result.success).toBe(true)
    expect(addAccountSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        sub2apiAuth: undefined,
      }),
    )
  })
```

- [ ] **Step 8: Run focused tests**

Run:

```powershell
pnpm vitest run tests/services/accounts/accountSiteProfile.test.ts tests/services/accountOperations.test.ts tests/services/accountOperations.validateAndSaveAccount.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```powershell
git add src/services/accounts/accountSiteProfile src/services/accounts/accountOperations.ts tests/services/accounts/accountSiteProfile.test.ts tests/services/accountOperations.test.ts tests/services/accountOperations.validateAndSaveAccount.test.ts
git commit -m "refactor(account): route validation and supplemental auth through profiles"
```

---

### Task 5: Route Account Storage And API Request Auth-Session Decisions Through Profile

**Files:**

- Create `src/services/accounts/accountSiteProfile/authSession.ts`
- Modify `src/services/accounts/accountSiteProfile/index.ts`
- Modify `src/services/accounts/accountStorage.ts`
- Modify `tests/services/accountStorage.test.ts`
- Modify `src/services/accounts/utils/apiServiceRequest.ts`
- Modify `tests/services/accounts/apiServiceRequest.test.ts`

- [ ] **Step 1: Add failing auth-session profile tests**

In `tests/services/accounts/accountSiteProfile.test.ts`, import:

```ts
import { shouldDecorateAccountApiRequestWithAuthSession } from "~/services/accounts/accountSiteProfile"
```

Add:

```ts
  it("allows account API request auth-session decoration only when profile permits it", () => {
    expect(
      shouldDecorateAccountApiRequestWithAuthSession(SITE_TYPES.SUB2API),
    ).toBe(true)
    expect(
      shouldDecorateAccountApiRequestWithAuthSession(SITE_TYPES.NEW_API),
    ).toBe(false)
  })
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
pnpm vitest run tests/services/accounts/accountSiteProfile.test.ts
```

Expected: FAIL with missing `shouldDecorateAccountApiRequestWithAuthSession`.

- [ ] **Step 3: Add `authSession.ts`**

Create `src/services/accounts/accountSiteProfile/authSession.ts`:

```ts
import type { AccountSiteType } from "~/constants/siteType"

import { getAccountSiteProductProfile } from "./registry"

export function shouldDecorateAccountApiRequestWithAuthSession(
  siteType: AccountSiteType,
): boolean {
  return getAccountSiteProductProfile(siteType).authSession
    .decoratesAccountApiRequests
}
```

Modify `src/services/accounts/accountSiteProfile/index.ts`:

```ts
export * from "./auth"
export * from "./authSession"
export * from "./contracts"
export * from "./identity"
export * from "./registry"
export * from "./supplementalAuth"
export * from "./urls"
```

- [ ] **Step 4: Route API request decoration through auth-session profile**

In `src/services/accounts/utils/apiServiceRequest.ts`, import:

```ts
import { shouldDecorateAccountApiRequestWithAuthSession } from "~/services/accounts/accountSiteProfile"
```

Replace:

```ts
if (account.siteType !== SITE_TYPES.SUB2API) {
  return request
}
```

With:

```ts
if (!shouldDecorateAccountApiRequestWithAuthSession(account.siteType)) {
  return request
}
```

Keep `accountSub2ApiAuthSession` and `Sub2ApiAuthSessionRequest` because the sidecar implementation is still Sub2API-specific.

- [ ] **Step 5: Route account storage duplicate/auth update decisions through existing profile helpers**

In `src/services/accounts/accountStorage.ts`, import:

```ts
import {
  normalizeAccountSiteSupplementalAuth,
  normalizeAccountSiteProfileUrlForOriginKey,
} from "~/services/accounts/accountSiteProfile"
```

Replace duplicate-origin logic that branches on AIHubMix with:

```ts
const accountOriginKey = normalizeAccountSiteProfileUrlForOriginKey({
  siteType: account.site_type,
  url: account.site_url,
})
```

Replace Sub2API auth-update persistence:

```ts
const normalizedSupplementalAuth = normalizeAccountSiteSupplementalAuth({
  siteType: account.site_type,
  sub2apiAuth: authUpdate.sub2apiAuth,
})
if (normalizedSupplementalAuth.sub2apiAuth) {
  updateData.sub2apiAuth = normalizedSupplementalAuth.sub2apiAuth
}
```

Do not change stored schema names. `sub2apiAuth` remains the persisted field.

- [ ] **Step 6: Keep tests behavior-focused**

In `tests/services/accountStorage.test.ts`, keep or add assertions that:

```ts
expect(
  await accountStorage.getAccountByBaseUrlAndUserId(
    "https://aihubmix.com/statistics",
    "aihubmix-user",
  ),
).toMatchObject({
  site_type: SITE_TYPES.AIHUBMIX,
})
```

Add an auth-update assertion in the existing update-auth-session describe block:

```ts
expect(updatedSub2ApiAccount?.sub2apiAuth).toEqual({
  refreshToken: "refresh-token",
})
expect(updatedNewApiAccount?.sub2apiAuth).toBeUndefined()
```

Use the existing storage setup helpers and account factories in the file.

- [ ] **Step 7: Run focused tests**

Run:

```powershell
pnpm vitest run tests/services/accounts/accountSiteProfile.test.ts tests/services/accounts/apiServiceRequest.test.ts tests/services/accountStorage.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```powershell
git add src/services/accounts/accountSiteProfile src/services/accounts/utils/apiServiceRequest.ts tests/services/accounts/apiServiceRequest.test.ts src/services/accounts/accountStorage.ts tests/services/accountStorage.test.ts tests/services/accounts/accountSiteProfile.test.ts
git commit -m "refactor(account): route storage auth-session policy through profiles"
```

---

### Task 6: Route Sponsor Prefill And Current-Tab Hint Selection Through Profile

**Files:**

- Create `src/services/accounts/accountSiteProfile/contentSessionHint.ts`
- Modify `src/services/accounts/accountSiteProfile/index.ts`
- Modify `src/features/AccountManagement/sponsors/pendingAddAccountIntent.ts`
- Modify `tests/features/AccountManagement/sponsors/pendingAddAccountIntent.test.ts`
- Modify `src/features/AccountManagement/hooks/AccountDataContext.tsx`
- Modify `tests/features/AccountManagement/hooks/AccountDataContext.currentTabDetection.test.tsx`

- [ ] **Step 1: Add failing hint/default tests**

In `tests/services/accounts/accountSiteProfile.test.ts`, import:

```ts
import { resolveAccountSiteContentSessionHintForOrigin } from "~/services/accounts/accountSiteProfile"
```

Add:

```ts
  it("selects content-session site-type hints from profile host aliases before account order", () => {
    expect(
      resolveAccountSiteContentSessionHintForOrigin({
        origin: "https://console.aihubmix.com",
        candidateAccounts: [
          { site_type: SITE_TYPES.NEW_API },
          { site_type: SITE_TYPES.AIHUBMIX },
        ],
      }),
    ).toBe(SITE_TYPES.AIHUBMIX)
    expect(
      resolveAccountSiteContentSessionHintForOrigin({
        origin: "https://example.invalid",
        candidateAccounts: [
          { site_type: SITE_TYPES.UNKNOWN },
          { site_type: SITE_TYPES.NEW_API },
        ],
      }),
    ).toBe(SITE_TYPES.NEW_API)
  })
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
pnpm vitest run tests/services/accounts/accountSiteProfile.test.ts
```

Expected: FAIL with missing content-session hint export.

- [ ] **Step 3: Add `contentSessionHint.ts`**

Create `src/services/accounts/accountSiteProfile/contentSessionHint.ts`:

```ts
import {
  isAccountSiteType,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"

import { isAccountSiteProfileUrl } from "./urls"

export function resolveAccountSiteContentSessionHintForOrigin(params: {
  origin: string
  candidateAccounts: readonly { site_type?: string }[]
}): AccountSiteType | undefined {
  const profileMatchedAccount = params.candidateAccounts.find(
    (account) =>
      isAccountSiteType(account.site_type) &&
      account.site_type !== SITE_TYPES.UNKNOWN &&
      isAccountSiteProfileUrl(account.site_type, params.origin),
  )

  if (profileMatchedAccount && isAccountSiteType(profileMatchedAccount.site_type)) {
    return profileMatchedAccount.site_type
  }

  return params.candidateAccounts.find(
    (account) =>
      isAccountSiteType(account.site_type) &&
      account.site_type !== SITE_TYPES.UNKNOWN,
  )?.site_type as AccountSiteType | undefined
}
```

Modify `src/services/accounts/accountSiteProfile/index.ts`:

```ts
export * from "./auth"
export * from "./authSession"
export * from "./contentSessionHint"
export * from "./contracts"
export * from "./identity"
export * from "./registry"
export * from "./supplementalAuth"
export * from "./urls"
```

- [ ] **Step 4: Normalize sponsor add-account prefill defaults through profile helpers**

In `src/features/AccountManagement/sponsors/pendingAddAccountIntent.ts`, import:

```ts
import {
  normalizeAccountSiteProfileUrlForStorage,
  resolveAccountSiteDefaultAuthType,
} from "~/services/accounts/accountSiteProfile"
```

Inside `normalizeAddAccountPrefill(...)`, after validating `siteType`, use:

```ts
const siteType = value.siteType
if (!isAccountSiteType(siteType) || siteType === SITE_TYPES.UNKNOWN) {
  return null
}

const siteUrl = normalizeAccountSiteProfileUrlForStorage({
  siteType,
  url: value.siteUrl,
})

const normalizedAuthType = normalizeOptionalAccountAuthType(value.authType)
if (normalizedAuthType === false) return null

return {
  sponsorId: value.sponsorId.trim(),
  siteName: value.siteName.trim(),
  siteType,
  siteUrl,
  authType:
    normalizedAuthType ??
    resolveAccountSiteDefaultAuthType({
      siteType,
      url: siteUrl,
    }),
}
```

Do not change `catalog.ts`; catalog validation stays shape-only and side-effect-free.

- [ ] **Step 5: Route current-tab hint selection through profile/onboarding helper**

In `src/features/AccountManagement/hooks/AccountDataContext.tsx`, import:

```ts
import { resolveAccountSiteContentSessionHintForOrigin } from "~/services/accounts/accountSiteProfile"
```

Replace:

```ts
const siteTypeForUserRead =
  originAccounts.find((account) => account.site_type !== SITE_TYPES.UNKNOWN)
    ?.site_type ?? originAccounts[0]?.site_type
```

With:

```ts
const siteTypeForUserRead =
  resolveAccountSiteContentSessionHintForOrigin({
    origin,
    candidateAccounts: originAccounts,
  }) ?? originAccounts[0]?.site_type
```

Keep browser messaging and state orchestration in the hook.

- [ ] **Step 6: Update focused tests**

In `tests/features/AccountManagement/sponsors/pendingAddAccountIntent.test.ts`, add:

```ts
  it("fills omitted auth type from product profile defaults", async () => {
    await setPendingSponsorAddAccountPrefill({
      sponsorId: "example-sponsor",
      siteName: "Example",
      siteType: SITE_TYPES.ANYROUTER,
      siteUrl: "https://anyrouter.top",
    })

    await expect(getAndClearPendingSponsorAddAccountPrefill()).resolves.toEqual(
      expect.objectContaining({
        authType: AuthTypeEnum.Cookie,
      }),
    )
  })
```

In `tests/features/AccountManagement/hooks/AccountDataContext.currentTabDetection.test.tsx`, add a scenario where `originAccounts` has a New API account before an AIHubMix account for `https://console.aihubmix.com`, and assert the content-script message receives `siteType: SITE_TYPES.AIHUBMIX`.

- [ ] **Step 7: Run focused tests**

Run:

```powershell
pnpm vitest run tests/services/accounts/accountSiteProfile.test.ts tests/features/AccountManagement/sponsors/pendingAddAccountIntent.test.ts tests/features/AccountManagement/hooks/AccountDataContext.currentTabDetection.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```powershell
git add src/services/accounts/accountSiteProfile tests/services/accounts/accountSiteProfile.test.ts src/features/AccountManagement/sponsors/pendingAddAccountIntent.ts tests/features/AccountManagement/sponsors/pendingAddAccountIntent.test.ts src/features/AccountManagement/hooks/AccountDataContext.tsx tests/features/AccountManagement/hooks/AccountDataContext.currentTabDetection.test.tsx
git commit -m "refactor(account): use profile defaults for sponsor and tab matching"
```

---

### Task 7: Bridge Account Dialog Policy And Rendered Controls To Profile Facts

**Files:**

- Modify `src/features/AccountManagement/components/AccountDialog/sitePolicy.ts`
- Modify `tests/features/AccountManagement/components/AccountDialog/sitePolicy.test.ts`
- Modify `src/features/AccountManagement/components/AccountDialog/AccountForm.tsx`
- Modify `tests/features/AccountManagement/components/AccountDialogForm.test.tsx`
- Modify `src/features/AccountManagement/components/AccountDialog/SiteInfoInput.tsx`
- Modify `tests/features/AccountManagement/components/AccountDialogSiteInfoInput.test.tsx`
- Modify `src/features/AccountManagement/components/AccountDialog/index.tsx`

- [ ] **Step 1: Add Account Dialog policy tests for profile-backed facts**

In `tests/features/AccountManagement/components/AccountDialog/sitePolicy.test.ts`, add:

```ts
  it("derives shared auth and supplemental-auth facts from product profiles", () => {
    const sub2apiPolicy = getAccountDialogSitePolicy(SITE_TYPES.SUB2API)
    expect(sub2apiPolicy.allowCookieAuthSession).toBe(false)
    expect(sub2apiPolicy.allowBuiltInCheckInDetection).toBe(false)
    expect(sub2apiPolicy.allowSub2ApiRefreshTokenState).toBe(true)

    const aihubmixPolicy = getAccountDialogSitePolicy(SITE_TYPES.AIHUBMIX)
    expect(aihubmixPolicy.allowCookieAuthSession).toBe(false)
    expect(aihubmixPolicy.allowSub2ApiRefreshTokenState).toBe(false)
    expect(aihubmixPolicy.deferSuccessForOneTimeKeyPostSaveFlow).toBe(true)
  })
```

- [ ] **Step 2: Run failing or confirming policy test**

Run:

```powershell
pnpm vitest run tests/features/AccountManagement/components/AccountDialog/sitePolicy.test.ts
```

Expected: PASS before implementation is acceptable if behavior already exists; the implementation still moves shared facts to profile reads.

- [ ] **Step 3: Read product profile in `sitePolicy.ts` without moving UI workflow flags**

In `src/features/AccountManagement/components/AccountDialog/sitePolicy.ts`, import:

```ts
import {
  ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS,
  getAccountSiteProductProfile,
} from "~/services/accounts/accountSiteProfile"
```

Update `getAccountDialogSitePolicy(...)`:

```ts
export function getAccountDialogSitePolicy(
  siteType: AccountSiteType,
): AccountDialogSitePolicy {
  const productProfile = getAccountSiteProductProfile(siteType)
  const workflowPolicy =
    ACCOUNT_DIALOG_SITE_POLICIES[siteType] ?? DEFAULT_ACCOUNT_DIALOG_SITE_POLICY

  return {
    ...workflowPolicy,
    allowCookieAuthSession: productProfile.auth.supportsCookieAuth,
    allowCookieAutoImport: productProfile.auth.supportsCookieAuth,
    allowBuiltInCheckInDetection:
      productProfile.auth.supportsBuiltInCheckInDetection,
    allowSub2ApiRefreshTokenState:
      productProfile.supplementalAuth.kind ===
      ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS.Sub2ApiRefreshToken,
  }
}
```

Keep `forceAccessTokenAuth`, `openSub2ApiTokenDialogPostSave`, and `deferSuccessForOneTimeKeyPostSaveFlow` in the feature-local table.

- [ ] **Step 4: Add a presentation policy prop to `AccountForm.tsx`**

In `src/features/AccountManagement/components/AccountDialog/AccountForm.tsx`, replace `const isSub2Api = siteType === SITE_TYPES.SUB2API` with a prop:

```ts
type AccountDialogPresentationPolicy = Pick<
  AccountDialogSitePolicy,
  | "forceAccessTokenAuth"
  | "allowCookieAuthSession"
  | "allowBuiltInCheckInDetection"
  | "allowSub2ApiRefreshTokenState"
>
```

Add to `AccountFormProps`:

```ts
sitePolicy: AccountDialogPresentationPolicy
```

Replace uses:

```ts
const isAuthTypeLocked = sitePolicy.forceAccessTokenAuth
const canUseCookieAuth = sitePolicy.allowCookieAuthSession
const canUseBuiltInCheckInDetection =
  sitePolicy.allowBuiltInCheckInDetection
const canUseSub2ApiRefreshToken =
  sitePolicy.allowSub2ApiRefreshTokenState
```

Then replace `isSub2Api` branches:

- description uses `isAuthTypeLocked`
- auth selector disabled uses `isDetected || isAuthTypeLocked`
- cookie option rendering uses `canUseCookieAuth`
- Sub2API refresh-token section rendering uses `canUseSub2ApiRefreshToken`
- built-in check-in control disabled state uses `!canUseBuiltInCheckInDetection`

- [ ] **Step 5: Add a presentation policy prop to `SiteInfoInput.tsx`**

In `src/features/AccountManagement/components/AccountDialog/SiteInfoInput.tsx`, add:

```ts
type SiteInfoInputPresentationPolicy = Pick<
  AccountDialogSitePolicy,
  | "forceAccessTokenAuth"
  | "allowCookieAuthSession"
  | "allowBuiltInCheckInDetection"
  | "allowSub2ApiRefreshTokenState"
>
```

Add `sitePolicy: SiteInfoInputPresentationPolicy` to the prop type that renders auth controls. Replace `isSub2Api` branches the same way as `AccountForm.tsx`.

- [ ] **Step 6: Pass `currentSitePolicy` from `index.tsx`**

In `src/features/AccountManagement/components/AccountDialog/index.tsx`, pass:

```tsx
sitePolicy={currentSitePolicy}
```

to both `SiteInfoInput` and `AccountForm`.

- [ ] **Step 7: Update component tests**

In `tests/features/AccountManagement/components/AccountDialogForm.test.tsx` and `tests/features/AccountManagement/components/AccountDialogSiteInfoInput.test.tsx`, import:

```ts
import { getAccountDialogSitePolicy } from "~/features/AccountManagement/components/AccountDialog/sitePolicy"
```

Update render helpers to pass:

```tsx
sitePolicy={getAccountDialogSitePolicy(overrides.siteType ?? SITE_TYPES.UNKNOWN)}
```

Keep existing visible assertions for Sub2API disabled cookie auth, refresh-token fields, and built-in check-in state.

- [ ] **Step 8: Run focused tests**

Run:

```powershell
pnpm vitest run tests/features/AccountManagement/components/AccountDialog/sitePolicy.test.ts tests/features/AccountManagement/components/AccountDialogForm.test.tsx tests/features/AccountManagement/components/AccountDialogSiteInfoInput.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```powershell
git add src/features/AccountManagement/components/AccountDialog/sitePolicy.ts tests/features/AccountManagement/components/AccountDialog/sitePolicy.test.ts src/features/AccountManagement/components/AccountDialog/AccountForm.tsx tests/features/AccountManagement/components/AccountDialogForm.test.tsx src/features/AccountManagement/components/AccountDialog/SiteInfoInput.tsx tests/features/AccountManagement/components/AccountDialogSiteInfoInput.test.tsx src/features/AccountManagement/components/AccountDialog/index.tsx
git commit -m "refactor(account): bridge dialog controls to product profiles"
```

---

### Task 8: Route Key Management Product Policy Through Profile

**Files:**

- Create `src/services/accounts/accountSiteProfile/tokenForm.ts`
- Modify `src/services/accounts/accountSiteProfile/index.ts`
- Modify `src/features/KeyManagement/utils.ts`
- Modify `tests/features/KeyManagement/utils.test.ts`
- Modify `src/features/KeyManagement/utils/apiCredentialProfileSaveAction.tsx`
- Modify `tests/features/KeyManagement/utils/apiCredentialProfileSaveAction.test.ts`
- Modify `src/features/KeyManagement/components/TokenListItem/TokenHeader.tsx`
- Modify `tests/entrypoints/options/pages/KeyManagement/TokenHeader.saveToApiProfiles.test.tsx`
- Modify `src/features/KeyManagement/components/AddTokenDialog/hooks/useTokenForm.ts`
- Modify `tests/entrypoints/options/pages/KeyManagement/AddTokenDialog.prefill.test.tsx`
- Modify `src/features/KeyManagement/components/AddTokenDialog/TokenForm/AdvancedSettingsSection.tsx`

- [ ] **Step 1: Add failing token policy tests**

In `tests/services/accounts/accountSiteProfile.test.ts`, import:

```ts
import {
  resolveAccountSiteCreatedTokenSecretHandling,
  resolveAccountSiteTokenFormNetworkLimitPolicy,
} from "~/services/accounts/accountSiteProfile"
```

Add:

```ts
  it("resolves token creation and token-form policy from source account profile", () => {
    expect(
      resolveAccountSiteCreatedTokenSecretHandling({
        siteType: SITE_TYPES.AIHUBMIX,
      }),
    ).toBe(ACCOUNT_SITE_CREATED_TOKEN_SECRET_HANDLING.OneTimeSecretDialog)
    expect(
      resolveAccountSiteCreatedTokenSecretHandling({
        siteType: SITE_TYPES.NEW_API,
      }),
    ).toBe(ACCOUNT_SITE_CREATED_TOKEN_SECRET_HANDLING.ResponseKey)
    expect(
      resolveAccountSiteTokenFormNetworkLimitPolicy({
        siteType: SITE_TYPES.AIHUBMIX,
      }),
    ).toBe(ACCOUNT_SITE_TOKEN_FORM_NETWORK_LIMIT_POLICIES.SubnetLimit)
  })
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
pnpm vitest run tests/services/accounts/accountSiteProfile.test.ts
```

Expected: FAIL with missing token policy exports.

- [ ] **Step 3: Add `tokenForm.ts`**

Create `src/services/accounts/accountSiteProfile/tokenForm.ts`:

```ts
import type { AccountSiteType } from "~/constants/siteType"

import type {
  AccountSiteCreatedTokenSecretHandling,
  AccountSiteTokenFormNetworkLimitPolicy,
} from "./contracts"
import { getAccountSiteProductProfile } from "./registry"

export function resolveAccountSiteCreatedTokenSecretHandling(account: {
  siteType: AccountSiteType
}): AccountSiteCreatedTokenSecretHandling {
  return getAccountSiteProductProfile(account.siteType).createdToken
    .secretHandling
}

export function resolveAccountSiteTokenFormNetworkLimitPolicy(account: {
  siteType: AccountSiteType
}): AccountSiteTokenFormNetworkLimitPolicy {
  return getAccountSiteProductProfile(account.siteType).tokenForm
    .networkLimitPolicy
}
```

Re-export from `index.ts`:

```ts
export * from "./tokenForm"
```

- [ ] **Step 4: Route one-time key dialog policy**

In `src/features/KeyManagement/utils.ts`, import:

```ts
import {
  ACCOUNT_SITE_CREATED_TOKEN_SECRET_HANDLING,
  resolveAccountSiteCreatedTokenSecretHandling,
} from "~/services/accounts/accountSiteProfile"
```

Replace:

```ts
export const shouldShowOneTimeKeyDialogForAccount = (
  account: Pick<DisplaySiteData, "siteType">,
) => account.siteType === SITE_TYPES.AIHUBMIX
```

With:

```ts
export const shouldShowOneTimeKeyDialogForAccount = (
  account: Pick<DisplaySiteData, "siteType">,
) =>
  resolveAccountSiteCreatedTokenSecretHandling(account) ===
  ACCOUNT_SITE_CREATED_TOKEN_SECRET_HANDLING.OneTimeSecretDialog
```

Keep `shouldShowOneTimeKeyDialogForCreatedToken(...)` unchanged except for using the routed helper.

- [ ] **Step 5: Route API credential profile save origins**

In `src/features/KeyManagement/utils/apiCredentialProfileSaveAction.tsx`, replace the AIHubMix branch with:

```ts
import { normalizeAccountSiteUrlForManagedChannel } from "~/services/accounts/utils/siteUrlNormalization"
```

Inside `createApiCredentialProfileFromToken(...)`:

```ts
baseUrl: normalizeAccountSiteUrlForManagedChannel({
  siteType,
  url: baseUrl,
}),
```

In `src/features/KeyManagement/components/TokenListItem/TokenHeader.tsx`, route row-level saves the same way:

```ts
baseUrl: normalizeAccountSiteUrlForManagedChannel({
  siteType: account.siteType,
  url: account.baseUrl,
}),
```

- [ ] **Step 6: Route token-form network-limit policy**

In `src/features/KeyManagement/components/AddTokenDialog/hooks/useTokenForm.ts`, import:

```ts
import {
  ACCOUNT_SITE_TOKEN_FORM_NETWORK_LIMIT_POLICIES,
  resolveAccountSiteTokenFormNetworkLimitPolicy,
} from "~/services/accounts/accountSiteProfile"
```

Replace:

```ts
const shouldValidateIpList = selectedAccount?.siteType !== SITE_TYPES.AIHUBMIX
```

With:

```ts
const shouldValidateIpList =
  !selectedAccount ||
  resolveAccountSiteTokenFormNetworkLimitPolicy(selectedAccount) ===
    ACCOUNT_SITE_TOKEN_FORM_NETWORK_LIMIT_POLICIES.IpList
```

In `AdvancedSettingsSection.tsx`, replace `currentSiteType?: AccountSiteType` with:

```ts
usesSubnetLimits?: boolean
```

Then pass:

```tsx
usesSubnetLimits={
  selectedAccount
    ? resolveAccountSiteTokenFormNetworkLimitPolicy(selectedAccount) ===
      ACCOUNT_SITE_TOKEN_FORM_NETWORK_LIMIT_POLICIES.SubnetLimit
    : false
}
```

from the parent component that already knows `selectedAccount` or `currentSiteType`.

- [ ] **Step 7: Update focused tests**

Keep existing AIHubMix visible behavior assertions and add:

```ts
expect(shouldShowOneTimeKeyDialogForAccount({ siteType: SITE_TYPES.AIHUBMIX })).toBe(true)
expect(shouldShowOneTimeKeyDialogForAccount({ siteType: SITE_TYPES.NEW_API })).toBe(false)
```

In profile-save tests, assert AIHubMix stores `https://aihubmix.com` and compatible sites keep the account base URL.

In Add Token tests, assert compatible sites validate comma-separated IPs and AIHubMix uses subnet-limit semantics without checking `SITE_TYPES.AIHUBMIX` in render code.

- [ ] **Step 8: Run focused tests**

Run:

```powershell
pnpm vitest run tests/services/accounts/accountSiteProfile.test.ts tests/features/KeyManagement/utils.test.ts tests/features/KeyManagement/utils/apiCredentialProfileSaveAction.test.ts tests/entrypoints/options/pages/KeyManagement/TokenHeader.saveToApiProfiles.test.tsx tests/entrypoints/options/pages/KeyManagement/AddTokenDialog.prefill.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```powershell
git add src/services/accounts/accountSiteProfile tests/services/accounts/accountSiteProfile.test.ts src/features/KeyManagement/utils.ts tests/features/KeyManagement/utils.test.ts src/features/KeyManagement/utils/apiCredentialProfileSaveAction.tsx tests/features/KeyManagement/utils/apiCredentialProfileSaveAction.test.ts src/features/KeyManagement/components/TokenListItem/TokenHeader.tsx tests/entrypoints/options/pages/KeyManagement/TokenHeader.saveToApiProfiles.test.tsx src/features/KeyManagement/components/AddTokenDialog/hooks/useTokenForm.ts tests/entrypoints/options/pages/KeyManagement/AddTokenDialog.prefill.test.tsx src/features/KeyManagement/components/AddTokenDialog/TokenForm/AdvancedSettingsSection.tsx
git commit -m "refactor(account): use product profiles for key management policy"
```

---

### Task 9: Route Model List Source-Account Policy Through Profile

**Files:**

- Create `src/services/accounts/accountSiteProfile/modelList.ts`
- Modify `src/services/accounts/accountSiteProfile/index.ts`
- Modify `src/services/apiCredentialProfiles/modelCatalog.ts`
- Modify `tests/services/apiCredentialProfiles/modelCatalog.test.ts`
- Modify `src/features/ModelList/hooks/useModelData.ts`
- Modify `tests/entrypoints/options/pages/ModelList/useModelData.test.tsx`
- Modify `src/features/ModelList/components/StatusIndicator.tsx`
- Modify `tests/entrypoints/options/pages/ModelList/StatusIndicator.test.tsx`
- Modify `src/features/ModelList/aihubmixModelList.ts`
- Modify `tests/features/ModelList/ModelList.test.tsx`

- [ ] **Step 1: Add failing model-list profile tests**

In `tests/services/accounts/accountSiteProfile.test.ts`, import:

```ts
import {
  getAccountSiteModelListProfile,
  shouldUseAccountSiteRuntimeKeyCatalogFallback,
} from "~/services/accounts/accountSiteProfile"
```

Add:

```ts
  it("resolves Model List source-account policy", () => {
    expect(
      shouldUseAccountSiteRuntimeKeyCatalogFallback({
        siteType: SITE_TYPES.SUB2API,
      }),
    ).toBe(true)
    expect(
      shouldUseAccountSiteRuntimeKeyCatalogFallback({
        siteType: SITE_TYPES.NEW_API,
      }),
    ).toBe(false)
    expect(getAccountSiteModelListProfile(SITE_TYPES.SUB2API)).toMatchObject({
      directPricing: ACCOUNT_SITE_MODEL_LIST_DIRECT_PRICING.Unsupported,
      statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Token,
    })
  })
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
pnpm vitest run tests/services/accounts/accountSiteProfile.test.ts
```

Expected: FAIL with missing Model List helper exports.

- [ ] **Step 3: Add `modelList.ts`**

Create `src/services/accounts/accountSiteProfile/modelList.ts`:

```ts
import type { AccountSiteType } from "~/constants/siteType"

import {
  ACCOUNT_SITE_MODEL_LIST_DIRECT_PRICING,
  ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS,
  type AccountSiteModelListProfile,
} from "./contracts"
import { getAccountSiteProductProfile } from "./registry"

export function getAccountSiteModelListProfile(
  siteType: AccountSiteType,
): AccountSiteModelListProfile {
  return { ...getAccountSiteProductProfile(siteType).modelList }
}

export function supportsAccountSiteDirectModelPricing(account: {
  siteType: AccountSiteType
}): boolean {
  return (
    getAccountSiteProductProfile(account.siteType).modelList.directPricing ===
    ACCOUNT_SITE_MODEL_LIST_DIRECT_PRICING.Supported
  )
}

export function shouldUseAccountSiteRuntimeKeyCatalogFallback(account: {
  siteType: AccountSiteType
}): boolean {
  return (
    getAccountSiteProductProfile(account.siteType).modelList
      .tokenScopedCatalogFallback ===
    ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS.RuntimeKey
  )
}
```

Re-export:

```ts
export * from "./modelList"
```

- [ ] **Step 4: Route API credential model catalog fallback through profile**

In `src/services/apiCredentialProfiles/modelCatalog.ts`, import:

```ts
import {
  supportsAccountSiteDirectModelPricing,
  shouldUseAccountSiteRuntimeKeyCatalogFallback,
} from "~/services/accounts/accountSiteProfile"
```

Replace direct pricing/fallback branches:

```ts
if (supportsAccountSiteDirectModelPricing(params.account)) {
  const adapter = getSiteAdapter(params.account.siteType)
  if (adapter.modelPricing) {
    return adapter.modelPricing.fetchPricing(createAccountModelPricingRequest(params))
  }
}

if (shouldUseAccountSiteRuntimeKeyCatalogFallback(params.account)) {
  const adapter = getSiteAdapter(params.account.siteType)
  if (!adapter.modelCatalog) {
    throw createMissingModelCatalogCapabilityError()
  }

  const runtimeModelIds = await adapter.modelCatalog.fetchModels({
    baseUrl: params.account.baseUrl,
    accountId: params.account.id,
    auth: {
      authType: AuthTypeEnum.AccessToken,
      apiKey: resolvedToken.key,
    },
  })
  const modelOnlyResponse = buildSub2ApiRuntimePricingResponse(runtimeModelIds)

  return await loadSub2ApiEstimatedPricingResponse({
    account: params.account,
    selectedToken: params.token,
    resolvedKey: resolvedToken.key,
    runtimeModelIds,
    fallbackResponse: modelOnlyResponse,
  })
}
```

Keep response metadata values such as `provider: SITE_TYPES.SUB2API` and `provider: SITE_TYPES.AIHUBMIX` when they describe the returned source payload. The plan targets decision branches, not meaningful source labels.

- [ ] **Step 5: Route `useModelData.ts` fallback and direct-pricing decisions**

In `src/features/ModelList/hooks/useModelData.ts`, import:

```ts
import {
  getAccountSiteModelListProfile,
  supportsAccountSiteDirectModelPricing,
  shouldUseAccountSiteRuntimeKeyCatalogFallback,
  ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES,
} from "~/services/accounts/accountSiteProfile"
```

Replace:

```ts
if (currentAccount.siteType !== SITE_TYPES.SUB2API) return
```

With:

```ts
if (!shouldUseAccountSiteRuntimeKeyCatalogFallback(currentAccount)) return
```

Replace unsupported direct-pricing suppression:

```ts
currentAccount.siteType === SITE_TYPES.SUB2API &&
isUnsupportedModelPricingError(query.error) &&
fallbackAvailable
```

With:

```ts
!supportsAccountSiteDirectModelPricing(currentAccount) &&
isUnsupportedModelPricingError(query.error) &&
fallbackAvailable
```

In all-accounts mode, replace:

```ts
if (account.siteType === SITE_TYPES.SUB2API) {
  return fetchSub2ApiAllAccountsFallbackPricingContexts(account)
}
```

With:

```ts
if (shouldUseAccountSiteRuntimeKeyCatalogFallback(account)) {
  return fetchSub2ApiAllAccountsFallbackPricingContexts(account)
}
```

Keep the fallback implementation name `fetchSub2ApiAllAccountsFallbackPricingContexts(...)` for now because the estimator is still Sub2API-specific.

- [ ] **Step 6: Route status-scope metadata to `StatusIndicator`**

Extend `AccountFallbackControls` in `useModelData.ts`:

```ts
statusScope: AccountSiteModelListStatusScope
```

When building `accountFallback`, set:

```ts
statusScope: getAccountSiteModelListProfile(currentAccount.siteType).statusScope,
```

In `src/features/ModelList/components/StatusIndicator.tsx`, replace direct Sub2API status scope logic:

```ts
const isKeyScopedStatus =
  accountFallback?.statusScope === ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Token
```

Use `isKeyScopedStatus` for the existing token-scoped labels and sections.

- [ ] **Step 7: Route AIHubMix display capability downgrade through profile-aware helper**

In `src/features/ModelList/aihubmixModelList.ts`, keep function names but drive the decision from profile metadata:

```ts
import {
  ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES,
  getAccountSiteModelListProfile,
} from "~/services/accounts/accountSiteProfile"

export function applyAihubmixModelListCapabilities<T extends PricingResponse>(
  pricing: T,
  account: Pick<DisplaySiteData, "siteType"> | null | undefined,
): T {
  const profile = account
    ? getAccountSiteModelListProfile(account.siteType)
    : null

  if (
    profile?.displayCapabilitiesSource !==
    ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Profile
  ) {
    return pricing
  }

  return applyCurrentAihubmixCapabilityDowngrade(pricing)
}
```

Keep the existing downgrade implementation in a private helper such as `applyCurrentAihubmixCapabilityDowngrade(...)`. Do not move adapter model fetching or pricing assembly into the profile.

- [ ] **Step 8: Update focused tests**

In `tests/services/apiCredentialProfiles/modelCatalog.test.ts`, keep Sub2API runtime-key fallback assertions and add that a compatible account without direct pricing support does not use the Sub2API fallback unless profile policy allows it.

In `tests/entrypoints/options/pages/ModelList/useModelData.test.tsx`, add or update cases for:

- Sub2API fallback availability uses `accountFallback.statusScope === "token"`.
- New API direct pricing failure does not show token fallback.

In `tests/entrypoints/options/pages/ModelList/StatusIndicator.test.tsx`, pass `accountFallback.statusScope` in fallback fixtures and assert token-scoped labels are driven by that value rather than `currentAccount.siteType`.

- [ ] **Step 9: Run focused tests**

Run:

```powershell
pnpm vitest run tests/services/accounts/accountSiteProfile.test.ts tests/services/apiCredentialProfiles/modelCatalog.test.ts tests/entrypoints/options/pages/ModelList/useModelData.test.tsx tests/entrypoints/options/pages/ModelList/StatusIndicator.test.tsx tests/features/ModelList/ModelList.test.tsx
```

Expected: PASS.

- [ ] **Step 10: Commit**

Run:

```powershell
git add src/services/accounts/accountSiteProfile tests/services/accounts/accountSiteProfile.test.ts src/services/apiCredentialProfiles/modelCatalog.ts tests/services/apiCredentialProfiles/modelCatalog.test.ts src/features/ModelList/hooks/useModelData.ts tests/entrypoints/options/pages/ModelList/useModelData.test.tsx src/features/ModelList/components/StatusIndicator.tsx tests/entrypoints/options/pages/ModelList/StatusIndicator.test.tsx src/features/ModelList/aihubmixModelList.ts tests/features/ModelList/ModelList.test.tsx
git commit -m "refactor(account): route model list source policy through profiles"
```

---

### Task 10: Migration Completeness Checks, Related Validation, And Handoff

**Files:**

- No new source files expected.
- Modify task-scoped files only if searches reveal a stale product-policy branch from this slice.

- [ ] **Step 1: Search for stale raw branches**

Run:

```powershell
rg "siteType === SITE_TYPES.AIHUBMIX|siteType === SITE_TYPES.SUB2API|siteType !== SITE_TYPES.AIHUBMIX|siteType !== SITE_TYPES.SUB2API|site_type === SITE_TYPES.AIHUBMIX|site_type === SITE_TYPES.SUB2API" src/services/accounts src/features/AccountManagement src/features/KeyManagement src/features/ModelList src/services/apiCredentialProfiles
rg "isSub2Api|anyrouter\\.top|AIHUBMIX_API_ORIGIN|AIHUBMIX_WEB_ORIGIN|AIHUBMIX_HOSTNAMES" src/services/accounts src/features/AccountManagement src/features/KeyManagement src/features/ModelList src/services/apiCredentialProfiles
rg "account_info\\.id|apiServiceRequest" src/services/accounts src/features/AccountManagement
rg "sub2apiAuth" src/services/accounts src/features/AccountManagement/components/AccountDialog
```

Classify each remaining hit.

Allowed remaining hits:

- persisted schema names such as `sub2apiAuth`
- response metadata providers such as `provider: SITE_TYPES.SUB2API`
- backend adapter calls where the implementation is still provider-specific
- content-session extractor ownership in `accountSiteOnboarding`
- migration code that preserves old stored data
- feature workflow names and copy keys such as Sub2API token dialog or AIHubMix one-time key dialog

Stale hits to fix:

- username-required checks outside profile helpers
- AIHubMix storage/duplicate/managed-channel origin branches outside profile helpers
- AnyRouter host default branch outside profile helpers
- Account Dialog rendered components branching directly on `SITE_TYPES.SUB2API`
- Key Management form validation branching directly on AIHubMix
- Model List fallback/status decisions branching directly on Sub2API

- [ ] **Step 2: Run focused regression command**

Run:

```powershell
pnpm vitest run tests/services/accounts/accountSiteProfile.test.ts tests/services/accounts/accountIdentity.test.ts tests/services/accounts/siteUrlNormalization.test.ts tests/services/accounts/apiServiceRequest.test.ts tests/services/accountOperations.test.ts tests/services/accountOperations.validateAndSaveAccount.test.ts tests/services/accountStorage.test.ts tests/features/AccountManagement/utils/accountAuthType.test.ts tests/features/AccountManagement/sponsors/pendingAddAccountIntent.test.ts tests/features/AccountManagement/components/AccountDialog/sitePolicy.test.ts tests/features/AccountManagement/components/AccountDialogForm.test.tsx tests/features/AccountManagement/components/AccountDialogSiteInfoInput.test.tsx tests/features/AccountManagement/hooks/AccountDataContext.currentTabDetection.test.tsx tests/features/KeyManagement/utils.test.ts tests/features/KeyManagement/utils/apiCredentialProfileSaveAction.test.ts tests/entrypoints/options/pages/KeyManagement/TokenHeader.saveToApiProfiles.test.tsx tests/entrypoints/options/pages/KeyManagement/AddTokenDialog.prefill.test.tsx tests/services/apiCredentialProfiles/modelCatalog.test.ts tests/entrypoints/options/pages/ModelList/useModelData.test.tsx tests/entrypoints/options/pages/ModelList/StatusIndicator.test.tsx tests/features/ModelList/ModelList.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run related validation**

Run:

```powershell
pnpm vitest related --run src/services/accounts/accountSiteProfile/index.ts src/services/accounts/accountIdentity.ts src/services/accounts/utils/siteUrlNormalization.ts src/services/accounts/utils/apiServiceRequest.ts src/services/accounts/accountOperations.ts src/services/accounts/accountStorage.ts src/features/AccountManagement/components/AccountDialog/sitePolicy.ts src/features/AccountManagement/components/AccountDialog/AccountForm.tsx src/features/AccountManagement/components/AccountDialog/SiteInfoInput.tsx src/features/AccountManagement/hooks/AccountDataContext.tsx src/features/AccountManagement/utils/accountAuthType.ts src/features/AccountManagement/sponsors/pendingAddAccountIntent.ts src/features/KeyManagement/utils.ts src/features/KeyManagement/utils/apiCredentialProfileSaveAction.tsx src/features/KeyManagement/components/TokenListItem/TokenHeader.tsx src/features/KeyManagement/components/AddTokenDialog/hooks/useTokenForm.ts src/features/KeyManagement/components/AddTokenDialog/TokenForm/AdvancedSettingsSection.tsx src/services/apiCredentialProfiles/modelCatalog.ts src/features/ModelList/hooks/useModelData.ts src/features/ModelList/components/StatusIndicator.tsx src/features/ModelList/aihubmixModelList.ts
```

Expected: PASS.

- [ ] **Step 4: Run commit gate**

Stage only task-scoped files, then run:

```powershell
pnpm run validate:staged
```

Expected: PASS.

- [ ] **Step 5: Run push gate before publishing**

Because this slice touches shared services, storage, feature hooks, and exported account-profile contracts, run:

```powershell
pnpm run validate:push
```

Expected: PASS.

- [ ] **Step 6: Inspect final diff**

Run:

```powershell
git diff --stat HEAD
git diff HEAD -- src/services/accounts/accountSiteProfile src/services/accounts/accountIdentity.ts src/services/accounts/utils/siteUrlNormalization.ts src/services/accounts/utils/apiServiceRequest.ts src/services/accounts/accountOperations.ts src/services/accounts/accountStorage.ts src/features/AccountManagement src/features/KeyManagement src/features/ModelList src/services/apiCredentialProfiles/modelCatalog.ts tests
```

Confirm:

- no adapter capability contract moved into product profile;
- no onboarding metadata moved out of `accountSiteOnboarding`;
- no locale, telemetry schema, settings search, or E2E files changed;
- public helper names stayed compatible;
- product-policy raw branches were routed through account-site product profile or feature-local policy objects;
- remaining concrete site-type references are provider implementations, schema names, response metadata, migration code, or feature workflow names.

- [ ] **Step 7: Final handoff**

Report:

- commits created;
- focused tests run;
- `pnpm vitest related --run ...`, `pnpm run validate:staged`, and `pnpm run validate:push` results;
- telemetry decision: reused existing;
- settings search decision: none;
- E2E decision: not added because focused unit/hook/component tests cover the risk;
- any residual raw site-type checks intentionally left behind and why.
