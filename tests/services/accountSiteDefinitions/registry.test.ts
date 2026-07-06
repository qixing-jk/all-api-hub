import { describe, expect, it } from "vitest"

import {
  getAccountSiteApiRouter,
  ACCOUNT_SITE_TYPE_VALUES as LEGACY_ACCOUNT_SITE_TYPE_VALUES,
  ACCOUNT_SITE_TYPES as LEGACY_ACCOUNT_SITE_TYPES,
  MANAGED_SITE_TYPES as LEGACY_MANAGED_SITE_TYPES,
} from "~/constants/siteType"
import { getAccountSiteProductProfile } from "~/services/accounts/accountSiteProfile"
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
} from "~/services/accounts/accountSiteProfile/contracts"
import {
  ACCOUNT_SITE_ADAPTER_FAMILIES,
  ACCOUNT_SITE_DEFINITION_SCOPES,
  ACCOUNT_SITE_MODEL_LIST_EXPECTED_ROUTES,
  ACCOUNT_SITE_TYPE_VALUES,
  ACCOUNT_SITE_TYPES,
  AIHUBMIX_API_ORIGIN,
  AIHUBMIX_HOSTNAMES,
  AIHUBMIX_WEB_ORIGIN,
  getAccountSiteDefinition,
  getAccountSiteDefinitions,
  getAccountSiteOnboardingDefinitions,
  getAccountSiteProductProfileOverride,
  getAccountSiteTypeValues,
  getManagedSiteTypeValues,
  MANAGED_SITE_TYPES,
  SHAREDCHAT_HOSTNAMES,
  SITE_TYPES,
  type AccountSiteDefinition,
  type AccountSiteType,
  type ManagedSiteType,
} from "~/services/accountSiteDefinitions"
import {
  ACCOUNT_SITE_TYPE_ORDER,
  MANAGED_SITE_TYPE_ORDER,
  SITE_TYPE_DEFINITIONS,
} from "~/services/accountSiteDefinitions/definitions"
import type { SiteType } from "~/services/accountSiteDefinitions/identifiers"
import { MODEL_LIST_ACCOUNT_SOURCE_ROUTES } from "~/services/modelList/accountSources/readiness"
import { AuthTypeEnum } from "~/types"

type ExpectExact<T, Expected> = [T] extends [Expected]
  ? [Expected] extends [T]
    ? true
    : never
  : never

type ExpectedAccountSiteType =
  | typeof SITE_TYPES.ONE_API
  | typeof SITE_TYPES.NEW_API
  | typeof SITE_TYPES.ANYROUTER
  | typeof SITE_TYPES.VELOERA
  | typeof SITE_TYPES.ONE_HUB
  | typeof SITE_TYPES.DONE_HUB
  | typeof SITE_TYPES.V_API
  | typeof SITE_TYPES.VO_API_V2
  | typeof SITE_TYPES.VO_API
  | typeof SITE_TYPES.SUPER_API
  | typeof SITE_TYPES.RIX_API
  | typeof SITE_TYPES.NEO_API
  | typeof SITE_TYPES.WONG_GONGYI
  | typeof SITE_TYPES.SUB2API
  | typeof SITE_TYPES.AIHUBMIX
  | typeof SITE_TYPES.SHAREDCHAT
  | typeof SITE_TYPES.UNKNOWN

type ExpectedManagedSiteType =
  | typeof SITE_TYPES.NEW_API
  | typeof SITE_TYPES.VELOERA
  | typeof SITE_TYPES.DONE_HUB
  | typeof SITE_TYPES.OCTOPUS
  | typeof SITE_TYPES.AXON_HUB
  | typeof SITE_TYPES.CLAUDE_CODE_HUB

const accountSiteTypeIsExact: ExpectExact<
  AccountSiteType,
  ExpectedAccountSiteType
> = true
const managedSiteTypeIsExact: ExpectExact<
  ManagedSiteType,
  ExpectedManagedSiteType
> = true
const accountSiteTypeDoesNotWidenToAllSiteTypes: SiteType extends AccountSiteType
  ? never
  : true = true
const managedSiteTypeDoesNotWidenToAllSiteTypes: SiteType extends ManagedSiteType
  ? never
  : true = true
const typeAssertions = [
  accountSiteTypeIsExact,
  managedSiteTypeIsExact,
  accountSiteTypeDoesNotWidenToAllSiteTypes,
  managedSiteTypeDoesNotWidenToAllSiteTypes,
] as const
const productProfileSiteTypeIsForbidden: "siteType" extends keyof NonNullable<
  AccountSiteDefinition["productProfile"]
>
  ? never
  : true = true

describe("account site definition registry", () => {
  it("keeps public site type aliases exact", () => {
    expect([...typeAssertions, productProfileSiteTypeIsForbidden]).toEqual([
      true,
      true,
      true,
      true,
      true,
    ])
  })

  it("keeps scoped definitions covered exactly once by order constants", () => {
    const accountScopedDefinitions = SITE_TYPE_DEFINITIONS.filter(
      (definition) =>
        definition.scopes.includes(ACCOUNT_SITE_DEFINITION_SCOPES.Account),
    )
    const managedScopedDefinitions = SITE_TYPE_DEFINITIONS.filter(
      (definition) =>
        definition.scopes.includes(ACCOUNT_SITE_DEFINITION_SCOPES.Managed),
    )

    expect(new Set(ACCOUNT_SITE_TYPE_ORDER).size).toBe(
      ACCOUNT_SITE_TYPE_ORDER.length,
    )
    expect(new Set(MANAGED_SITE_TYPE_ORDER).size).toBe(
      MANAGED_SITE_TYPE_ORDER.length,
    )
    expect([...ACCOUNT_SITE_TYPE_ORDER].sort()).toEqual(
      accountScopedDefinitions.map((definition) => definition.siteType).sort(),
    )
    expect([...MANAGED_SITE_TYPE_ORDER].sort()).toEqual(
      managedScopedDefinitions.map((definition) => definition.siteType).sort(),
    )
  })

  it("matches current legacy site-type surfaces", () => {
    expect(ACCOUNT_SITE_TYPES).toEqual(LEGACY_ACCOUNT_SITE_TYPES)
    expect(ACCOUNT_SITE_TYPE_VALUES).toEqual(LEGACY_ACCOUNT_SITE_TYPE_VALUES)
    expect(MANAGED_SITE_TYPES).toEqual(LEGACY_MANAGED_SITE_TYPES)
  })

  it("keeps the legacy constants facade aligned with definitions", async () => {
    const legacy = await import("~/constants/siteType")

    expect(legacy.SITE_TYPES).toBe(SITE_TYPES)
    expect(legacy.ACCOUNT_SITE_TYPES).toEqual(getAccountSiteTypeValues())
    expect(legacy.ACCOUNT_SITE_TYPE_VALUES).toEqual(getAccountSiteTypeValues())
    expect(legacy.MANAGED_SITE_TYPES).toEqual(getManagedSiteTypeValues())
    expect(legacy.isAccountSiteType(SITE_TYPES.AIHUBMIX)).toBe(true)
    expect(legacy.isAccountSiteType(SITE_TYPES.SHAREDCHAT)).toBe(true)
    expect(legacy.isAccountSiteType(SITE_TYPES.OCTOPUS)).toBe(false)
    expect(legacy.isManagedSiteType(SITE_TYPES.OCTOPUS)).toBe(true)
    expect(legacy.isManagedSiteType(SITE_TYPES.SUB2API)).toBe(false)
  })

  it("keeps the public route facade aligned with definition route metadata", () => {
    for (const siteType of ACCOUNT_SITE_TYPES) {
      const routes = getAccountSiteOnboardingDefinitions().find(
        (definition) => definition.siteType === siteType,
      )?.routes

      expect(getAccountSiteApiRouter(siteType)).toMatchObject(routes ?? {})
      expect(routes ?? {}).toEqual(
        getAccountSiteDefinition(siteType)?.onboarding?.routes ?? {},
      )
    }
  })

  it("matches current product-profile behavior for overridden sites", () => {
    const anyrouterOverride = getAccountSiteProductProfileOverride(
      SITE_TYPES.ANYROUTER,
    )
    const sub2apiOverride = getAccountSiteProductProfileOverride(
      SITE_TYPES.SUB2API,
    )
    const aihubmixOverride = getAccountSiteProductProfileOverride(
      SITE_TYPES.AIHUBMIX,
    )

    const anyrouterProfile = getAccountSiteProductProfile(SITE_TYPES.ANYROUTER)
    expect(anyrouterProfile.auth.defaultAuthType).toBe(
      anyrouterOverride?.auth?.defaultAuthType,
    )
    expect(anyrouterProfile.auth.defaultAuthHostnames).toEqual(
      anyrouterOverride?.auth?.defaultAuthHostnames,
    )
    expect(getAccountSiteProductProfile(SITE_TYPES.SUB2API)).toMatchObject({
      auth: sub2apiOverride?.auth,
      authSession: sub2apiOverride?.authSession,
      identity: sub2apiOverride?.identity,
      modelList: sub2apiOverride?.modelList,
      supplementalAuth: sub2apiOverride?.supplementalAuth,
    })
    expect(getAccountSiteProductProfile(SITE_TYPES.AIHUBMIX)).toMatchObject({
      auth: aihubmixOverride?.auth,
      createdToken: aihubmixOverride?.createdToken,
      identity: aihubmixOverride?.identity,
      modelList: aihubmixOverride?.modelList,
      tokenForm: aihubmixOverride?.tokenForm,
      urls: aihubmixOverride?.urls,
    })
  })

  it("projects account site types in the public order", () => {
    expect(getAccountSiteTypeValues()).toEqual(ACCOUNT_SITE_TYPES)
    expect(getAccountSiteTypeValues()).toEqual([
      SITE_TYPES.ONE_API,
      SITE_TYPES.NEW_API,
      SITE_TYPES.ANYROUTER,
      SITE_TYPES.VELOERA,
      SITE_TYPES.ONE_HUB,
      SITE_TYPES.DONE_HUB,
      SITE_TYPES.V_API,
      SITE_TYPES.VO_API_V2,
      SITE_TYPES.VO_API,
      SITE_TYPES.SUPER_API,
      SITE_TYPES.RIX_API,
      SITE_TYPES.NEO_API,
      SITE_TYPES.WONG_GONGYI,
      SITE_TYPES.SUB2API,
      SITE_TYPES.AIHUBMIX,
      SITE_TYPES.SHAREDCHAT,
      SITE_TYPES.UNKNOWN,
    ])
  })

  it("projects managed site types in the public order", () => {
    expect(getManagedSiteTypeValues()).toEqual(MANAGED_SITE_TYPES)
    expect(getManagedSiteTypeValues()).toEqual([
      SITE_TYPES.NEW_API,
      SITE_TYPES.VELOERA,
      SITE_TYPES.DONE_HUB,
      SITE_TYPES.OCTOPUS,
      SITE_TYPES.AXON_HUB,
      SITE_TYPES.CLAUDE_CODE_HUB,
    ])
  })

  it("defines every site type once", () => {
    const siteTypes = getAccountSiteDefinitions().map(
      (definition) => definition.siteType,
    )

    expect(new Set(siteTypes).size).toBe(siteTypes.length)
  })

  it("gives every account site account scope and an adapter family", () => {
    for (const definition of getAccountSiteDefinitions().filter((definition) =>
      definition.scopes.includes(ACCOUNT_SITE_DEFINITION_SCOPES.Account),
    )) {
      expect(definition.scopes).toContain(
        ACCOUNT_SITE_DEFINITION_SCOPES.Account,
      )
      expect(definition.adapterFamily).toBeTruthy()
    }
  })

  it("gives every managed site managed scope", () => {
    for (const siteType of MANAGED_SITE_TYPES) {
      expect(getAccountSiteDefinition(siteType)?.scopes).toContain(
        ACCOUNT_SITE_DEFINITION_SCOPES.Managed,
      )
    }
  })

  it("projects representative adapter families", () => {
    expect(getAccountSiteDefinition(SITE_TYPES.NEW_API)?.adapterFamily).toBe(
      ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    )
    expect(getAccountSiteDefinition(SITE_TYPES.SUB2API)?.adapterFamily).toBe(
      ACCOUNT_SITE_ADAPTER_FAMILIES.Sub2Api,
    )
    expect(getAccountSiteDefinition(SITE_TYPES.VO_API_V2)?.adapterFamily).toBe(
      ACCOUNT_SITE_ADAPTER_FAMILIES.VoApiV2,
    )
    expect(getAccountSiteDefinition(SITE_TYPES.AIHUBMIX)?.adapterFamily).toBe(
      ACCOUNT_SITE_ADAPTER_FAMILIES.Aihubmix,
    )
    expect(getAccountSiteDefinition(SITE_TYPES.SHAREDCHAT)?.adapterFamily).toBe(
      ACCOUNT_SITE_ADAPTER_FAMILIES.SharedChat,
    )
    expect(getAccountSiteDefinition(SITE_TYPES.OCTOPUS)?.adapterFamily).toBe(
      ACCOUNT_SITE_ADAPTER_FAMILIES.Unsupported,
    )
  })

  it("defines VoAPI v2 before old VoAPI with account-only policy", () => {
    const voApiV2 = getAccountSiteDefinition(SITE_TYPES.VO_API_V2)

    expect(voApiV2).toMatchObject({
      siteType: SITE_TYPES.VO_API_V2,
      adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.VoApiV2,
    })
    expect(voApiV2?.scopes).toEqual([ACCOUNT_SITE_DEFINITION_SCOPES.Account])
    expect(voApiV2?.onboarding?.routes).toMatchObject({
      usagePath: "/dash?_userMenuKey=dash",
      checkInPath: "/checkIn?_userMenuKey=checkIn",
      adminCredentialsPath: "/keys?_userMenuKey=keys",
    })
    expect(ACCOUNT_SITE_TYPE_ORDER.indexOf(SITE_TYPES.VO_API_V2)).toBeLessThan(
      ACCOUNT_SITE_TYPE_ORDER.indexOf(SITE_TYPES.VO_API),
    )
  })

  it("projects onboarding metadata", () => {
    const onboardingDefinitions = getAccountSiteOnboardingDefinitions()

    expect(
      onboardingDefinitions.map((definition) => definition.siteType),
    ).toEqual(ACCOUNT_SITE_TYPES)
    expect(
      onboardingDefinitions.find(
        (definition) => definition.siteType === SITE_TYPES.AIHUBMIX,
      )?.detection?.hostnames,
    ).toEqual(AIHUBMIX_HOSTNAMES)
    expect(
      onboardingDefinitions.find(
        (definition) => definition.siteType === SITE_TYPES.SHAREDCHAT,
      )?.detection?.hostnames,
    ).toEqual(SHAREDCHAT_HOSTNAMES)
    expect(
      onboardingDefinitions.find(
        (definition) => definition.siteType === SITE_TYPES.VO_API_V2,
      )?.routes,
    ).toMatchObject({
      usagePath: "/dash?_userMenuKey=dash",
      checkInPath: "/checkIn?_userMenuKey=checkIn",
      adminCredentialsPath: "/keys?_userMenuKey=keys",
    })
    expect(
      onboardingDefinitions.find(
        (definition) => definition.siteType === SITE_TYPES.SUB2API,
      )?.routes,
    ).toMatchObject({
      usagePath: "/usage",
      redeemPath: "/redeem",
      siteAnnouncementsPath: "/dashboard",
    })
  })

  it("returns defensive definition and projection copies", () => {
    const definition = getAccountSiteDefinition(SITE_TYPES.AIHUBMIX)
    const onboardingDefinition = getAccountSiteOnboardingDefinitions().find(
      (definition) => definition.siteType === SITE_TYPES.AIHUBMIX,
    )

    ;(definition!.onboarding!.detection!.hostnames as string[]).push(
      "mutated.example.invalid",
    )
    definition!.adapterFamily = ACCOUNT_SITE_ADAPTER_FAMILIES.Unsupported
    ;(onboardingDefinition!.detection!.hostnames as string[]).push(
      "mutated.example.invalid",
    )
    onboardingDefinition!.adapterFamily =
      ACCOUNT_SITE_ADAPTER_FAMILIES.Unsupported

    expect(
      getAccountSiteDefinition(SITE_TYPES.AIHUBMIX)?.onboarding?.detection
        ?.hostnames,
    ).not.toContain("mutated.example.invalid")
    expect(getAccountSiteDefinition(SITE_TYPES.AIHUBMIX)?.adapterFamily).toBe(
      ACCOUNT_SITE_ADAPTER_FAMILIES.Aihubmix,
    )
    expect(
      getAccountSiteOnboardingDefinitions().find(
        (definition) => definition.siteType === SITE_TYPES.AIHUBMIX,
      )?.detection?.hostnames,
    ).not.toContain("mutated.example.invalid")
    expect(
      getAccountSiteOnboardingDefinitions().find(
        (definition) => definition.siteType === SITE_TYPES.AIHUBMIX,
      )?.adapterFamily,
    ).toBe(ACCOUNT_SITE_ADAPTER_FAMILIES.Aihubmix)
  })

  it("returns defensive RegExp copies for onboarding detection", () => {
    const firstDefinition = getAccountSiteDefinition(SITE_TYPES.SUB2API)
    const secondDefinition = getAccountSiteDefinition(SITE_TYPES.SUB2API)
    const firstOnboardingDefinition =
      getAccountSiteOnboardingDefinitions().find(
        (definition) => definition.siteType === SITE_TYPES.SUB2API,
      )
    const secondOnboardingDefinition =
      getAccountSiteOnboardingDefinitions().find(
        (definition) => definition.siteType === SITE_TYPES.SUB2API,
      )

    expect(firstDefinition?.onboarding?.detection?.titlePatterns?.[0]).not.toBe(
      secondDefinition?.onboarding?.detection?.titlePatterns?.[0],
    )
    expect(firstOnboardingDefinition?.detection?.titlePatterns?.[0]).not.toBe(
      secondOnboardingDefinition?.detection?.titlePatterns?.[0],
    )
  })

  it("returns defensive product-profile override copies", () => {
    const aihubmixProfile = getAccountSiteProductProfileOverride(
      SITE_TYPES.AIHUBMIX,
    )
    const sub2apiProfile = getAccountSiteProductProfileOverride(
      SITE_TYPES.SUB2API,
    )

    ;(aihubmixProfile!.urls!.recognizedHostnames as string[]).push(
      "mutated.example.invalid",
    )
    ;(sub2apiProfile!.auth!.allowedAuthTypes as AuthTypeEnum[]).push(
      AuthTypeEnum.Cookie,
    )
    ;(sub2apiProfile!.identity!.storedUserIdentityFields as string[]).push(
      "mutated",
    )

    expect(
      getAccountSiteProductProfileOverride(SITE_TYPES.AIHUBMIX)?.urls
        ?.recognizedHostnames,
    ).not.toContain("mutated.example.invalid")
    expect(
      getAccountSiteProductProfileOverride(SITE_TYPES.SUB2API)?.auth
        ?.allowedAuthTypes,
    ).toEqual([AuthTypeEnum.AccessToken])
    expect(
      getAccountSiteProductProfileOverride(SITE_TYPES.SUB2API)?.identity
        ?.storedUserIdentityFields,
    ).toEqual(["id"])
  })

  it("returns defensive readiness expectation copies", () => {
    const readiness = getAccountSiteDefinition(SITE_TYPES.SUB2API)?.readiness

    readiness!.modelList!.expectedRoute =
      MODEL_LIST_ACCOUNT_SOURCE_ROUTES.Unsupported

    expect(
      getAccountSiteDefinition(SITE_TYPES.SUB2API)?.readiness?.modelList
        ?.expectedRoute,
    ).toBe(MODEL_LIST_ACCOUNT_SOURCE_ROUTES.TokenScopedRuntimeCatalog)
  })

  it("projects product-profile overrides", () => {
    expect(
      getAccountSiteProductProfileOverride(SITE_TYPES.ANYROUTER),
    ).toMatchObject({
      auth: {
        defaultAuthType: AuthTypeEnum.Cookie,
        defaultAuthHostnames: ["anyrouter.top"],
      },
    })
    expect(
      getAccountSiteProductProfileOverride(SITE_TYPES.SUB2API),
    ).toMatchObject({
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
    })
    expect(
      getAccountSiteProductProfileOverride(SITE_TYPES.AIHUBMIX),
    ).toMatchObject({
      auth: {
        allowedAuthTypes: [AuthTypeEnum.AccessToken],
        defaultAuthType: AuthTypeEnum.AccessToken,
        defaultAuthHostnames: [],
        supportsCookieAuth: false,
        supportsBuiltInCheckInDetection: false,
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
    })
  })

  it("projects model-list readiness expectations", () => {
    expect(
      getAccountSiteDefinition(SITE_TYPES.NEW_API)?.readiness?.modelList
        ?.expectedRoute,
    ).toBe(MODEL_LIST_ACCOUNT_SOURCE_ROUTES.DirectPricing)
    expect(
      getAccountSiteDefinition(SITE_TYPES.SUB2API)?.readiness?.modelList
        ?.expectedRoute,
    ).toBe(MODEL_LIST_ACCOUNT_SOURCE_ROUTES.TokenScopedRuntimeCatalog)
    expect(
      getAccountSiteDefinition(SITE_TYPES.AIHUBMIX)?.readiness?.modelList
        ?.expectedRoute,
    ).toBe(MODEL_LIST_ACCOUNT_SOURCE_ROUTES.DirectPricing)
    expect(
      getAccountSiteDefinition(SITE_TYPES.VO_API_V2)?.readiness?.modelList
        ?.expectedRoute,
    ).toBe(MODEL_LIST_ACCOUNT_SOURCE_ROUTES.Unsupported)
    expect(
      getAccountSiteDefinition(SITE_TYPES.SHAREDCHAT)?.readiness?.modelList
        ?.expectedRoute,
    ).toBe(MODEL_LIST_ACCOUNT_SOURCE_ROUTES.TokenScopedRuntimeCatalog)
  })

  it("keeps definition expectation route constants synchronized with runtime routes", () => {
    expect(ACCOUNT_SITE_MODEL_LIST_EXPECTED_ROUTES).toEqual({
      DirectPricing: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.DirectPricing,
      TokenScopedRuntimeCatalog:
        MODEL_LIST_ACCOUNT_SOURCE_ROUTES.TokenScopedRuntimeCatalog,
      Unsupported: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.Unsupported,
    })
  })
})
