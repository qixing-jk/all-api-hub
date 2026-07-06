import { describe, expect, it } from "vitest"

import {
  AIHUBMIX_API_ORIGIN,
  AIHUBMIX_WEB_ORIGIN,
  SITE_TYPES,
} from "~/constants/siteType"
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
  doAccountSiteIdentitiesMatch,
  getAccountSiteModelListProfile,
  getAccountSiteProductProfile,
  isAccountSiteProfileUrl,
  normalizeAccountSiteProfileUrlForDuplicateCheck,
  normalizeAccountSiteProfileUrlForManagedChannel,
  normalizeAccountSiteProfileUrlForOriginKey,
  normalizeAccountSiteProfileUrlForStorage,
  normalizeAccountSiteSupplementalAuth,
  resolveAccountSiteContentSessionHintForOrigin,
  resolveAccountSiteCreatedTokenSecretHandling,
  resolveAccountSiteDefaultAuthType,
  resolveAccountSiteTokenFormNetworkLimitPolicy,
  resolveAccountSiteUserIdentity,
  shouldDecorateAccountApiRequestWithAuthSession,
  shouldUseAccountSiteRuntimeKeyCatalogFallback,
} from "~/services/accounts/accountSiteProfile"
import * as accountSiteProfileApi from "~/services/accounts/accountSiteProfile"
import { AuthTypeEnum } from "~/types"

describe("accountSiteProfile", () => {
  it("resolves a default compatible profile for New API", () => {
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
    expect(profile.modelList.dashboardEstimateLoader).toBe(
      ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS.Sub2Api,
    )
    expect(profile.modelList.statusScope).toBe(
      ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Token,
    )
  })

  it("resolves VoAPI v2 saved-account product rules", () => {
    const profile = getAccountSiteProductProfile(SITE_TYPES.VO_API_V2)

    expect(profile.identity.usernameRequired).toBe(false)
    expect(profile.identity.storedUserIdentityFields).toEqual([
      "id",
      "username",
    ])
    expect(profile.auth.allowedAuthTypes).toEqual([AuthTypeEnum.AccessToken])
    expect(profile.auth.defaultAuthType).toBe(AuthTypeEnum.AccessToken)
    expect(profile.auth.supportsCookieAuth).toBe(false)
    expect(profile.auth.supportsBuiltInCheckInDetection).toBe(true)
    expect(profile.modelList.directPricing).toBe(
      ACCOUNT_SITE_MODEL_LIST_DIRECT_PRICING.Unsupported,
    )
    expect(profile.modelList.tokenScopedCatalogFallback).toBe(
      ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS.None,
    )
  })

  it("resolves site-specific overrides from account-site definitions", async () => {
    const { getAccountSiteProductProfileOverride } = await import(
      "~/services/accountSiteDefinitions"
    )

    expect(
      getAccountSiteProductProfileOverride(SITE_TYPES.SUB2API),
    ).toMatchObject({
      supplementalAuth: {
        kind: ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS.Sub2ApiRefreshToken,
      },
    })
    expect(getAccountSiteProductProfile(SITE_TYPES.SUB2API)).toMatchObject({
      supplementalAuth: {
        kind: ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS.Sub2ApiRefreshToken,
      },
      modelList: {
        tokenScopedCatalogFallback:
          ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS.RuntimeKey,
      },
    })
  })

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
    expect(profile.auth.supportsCookieAuth).toBe(false)
    expect(profile.auth.supportsBuiltInCheckInDetection).toBe(false)
    expect(profile.modelList.displayCapabilitiesSource).toBe(
      ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Profile,
    )
  })

  it("resolves token creation and form policy helpers", () => {
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
          refreshToken: "   ",
          tokenExpiresAt: Number.NaN,
        },
      }),
    ).toEqual({})
  })

  it("allows account API request auth-session decoration only when profile permits it", () => {
    expect(
      shouldDecorateAccountApiRequestWithAuthSession(SITE_TYPES.SUB2API),
    ).toBe(true)
    expect(
      shouldDecorateAccountApiRequestWithAuthSession(SITE_TYPES.NEW_API),
    ).toBe(false)
  })

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
        siteType: SITE_TYPES.NEW_API,
        savedUser: null,
        currentUser: { id: 42 },
      }),
    ).toBe(false)
    expect(
      doAccountSiteIdentitiesMatch({
        siteType: SITE_TYPES.AIHUBMIX,
        savedUser: {
          id: "aihubmix-stable-id",
          username: "Display Name",
        },
        currentUser: { username: "aihubmix-stable-id" },
      }),
    ).toBe(true)
    expect(
      doAccountSiteIdentitiesMatch({
        siteType: SITE_TYPES.AIHUBMIX,
        savedUser: {
          id: "aihubmix-stable-id",
          username: "Display Name",
        },
        currentUser: { username: "Display Name" },
      }),
    ).toBe(false)
    expect(
      doAccountSiteIdentitiesMatch({
        siteType: SITE_TYPES.NEW_API,
        savedUser: { id: "42" },
        currentUser: { id: 42 },
      }),
    ).toBe(true)
  })

  it("keeps AnyRouter cookie auth default as profile data", () => {
    const profile = getAccountSiteProductProfile(SITE_TYPES.ANYROUTER)

    expect(profile.auth.defaultAuthType).toBe(AuthTypeEnum.Cookie)
    expect(profile.auth.defaultAuthHostnames).toEqual(["anyrouter.top"])
  })

  it("uses profile hostnames to resolve default auth for account URLs", () => {
    expect(
      resolveAccountSiteDefaultAuthType({
        url: "https://anyrouter.top/console",
      }),
    ).toBe(AuthTypeEnum.Cookie)
    expect(
      resolveAccountSiteDefaultAuthType({
        url: "https://new.sharedchat.cc/list/#/vibe-code",
      }),
    ).toBe(AuthTypeEnum.Cookie)
    expect(
      resolveAccountSiteDefaultAuthType({
        url: "https://example.invalid",
      }),
    ).toBe(AuthTypeEnum.AccessToken)
  })

  it("normalizes AIHubMix URLs through profile URL rules", () => {
    expect(
      isAccountSiteProfileUrl(SITE_TYPES.AIHUBMIX, "ftp://aihubmix.com"),
    ).toBe(false)
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
    expect(
      normalizeAccountSiteProfileUrlForStorage({
        siteType: "future-site",
        url: " https://future.example.invalid/path ",
      }),
    ).toBe("https://future.example.invalid/path")
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
    expect(resolveAccountSiteDefaultAuthType()).toBe(AuthTypeEnum.AccessToken)
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

  it("returns defensive copies so callers cannot mutate source profiles", () => {
    const first = getAccountSiteProductProfile(SITE_TYPES.AIHUBMIX)
    const mutableHostnames = first.urls.recognizedHostnames as string[]
    mutableHostnames.push("mutated.example.invalid")

    const mutableAuthTypes = first.auth.allowedAuthTypes as AuthTypeEnum[]
    mutableAuthTypes.push(AuthTypeEnum.Cookie)

    const second = getAccountSiteProductProfile(SITE_TYPES.AIHUBMIX)
    expect(second.urls.recognizedHostnames).toEqual([
      "aihubmix.com",
      "www.aihubmix.com",
      "console.aihubmix.com",
    ])
    expect(second.auth.allowedAuthTypes).toEqual([AuthTypeEnum.AccessToken])
  })

  it("keeps mutable profile table internals out of the public barrel", () => {
    expect(accountSiteProfileApi).not.toHaveProperty(
      "DEFAULT_ACCOUNT_SITE_PRODUCT_PROFILE",
    )
    expect(accountSiteProfileApi).not.toHaveProperty(
      "ACCOUNT_SITE_PRODUCT_PROFILE_OVERRIDES",
    )
    expect(accountSiteProfileApi).not.toHaveProperty(
      "cloneAccountSiteProductProfile",
    )
    expect(accountSiteProfileApi).not.toHaveProperty(
      "mergeAccountSiteProductProfile",
    )
    expect(accountSiteProfileApi).toHaveProperty("getAccountSiteProductProfile")
    expect(accountSiteProfileApi).toHaveProperty(
      "ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS",
    )
  })
})
