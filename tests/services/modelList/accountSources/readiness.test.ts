import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS,
  ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES,
  ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES,
} from "~/services/accounts/accountSiteProfile"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import {
  canLoadModelListAccountFallbackRuntimeKeys,
  MODEL_LIST_ACCOUNT_SOURCE_ROUTES,
  MODEL_LIST_ACCOUNT_SOURCE_UNSUPPORTED_REASONS,
  resolveModelListAccountSourceReadiness,
} from "~/services/modelList/accountSources/readiness"
import { AuthTypeEnum } from "~/types"

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteTypeCapabilities: vi.fn(),
}))

const modelPricing = {
  fetchPricing: vi.fn(),
}

const modelCatalog = {
  fetchModels: vi.fn(),
}

const runtimeKeyFallbackAccount = {
  id: "sharedchat-account",
  siteType: SITE_TYPES.SHAREDCHAT,
  baseUrl: "https://new.sharedchat.cc",
  authType: AuthTypeEnum.Cookie,
  userId: "user-1",
  token: "access-token",
  cookieAuthSessionCookie: "session=redacted",
}

describe("resolveModelListAccountSourceReadiness", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns direct pricing when profile policy and adapter capability both support it", () => {
    vi.mocked(getSiteTypeCapabilities).mockReturnValue({
      siteType: SITE_TYPES.NEW_API,
      account: {
        modelPricing,
      },
    } as any)

    expect(
      resolveModelListAccountSourceReadiness({
        siteType: SITE_TYPES.NEW_API,
      }),
    ).toEqual({
      route: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.DirectPricing,
      modelPricing,
      statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Account,
      displayCapabilitiesSource:
        ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Response,
    })
  })

  it("returns missing model-pricing capability for compatible accounts without modelPricing", () => {
    vi.mocked(getSiteTypeCapabilities).mockReturnValue({
      siteType: SITE_TYPES.NEW_API,
    } as any)

    expect(
      resolveModelListAccountSourceReadiness({
        siteType: SITE_TYPES.NEW_API,
      }),
    ).toEqual({
      route: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.Unsupported,
      reason:
        MODEL_LIST_ACCOUNT_SOURCE_UNSUPPORTED_REASONS.MissingModelPricingCapability,
      statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Account,
      displayCapabilitiesSource:
        ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Response,
    })
  })

  it("returns token-scoped runtime catalog when profile policy and adapter capability both support it", () => {
    vi.mocked(getSiteTypeCapabilities).mockReturnValue({
      siteType: SITE_TYPES.SUB2API,
      account: {
        modelCatalog,
      },
    } as any)

    expect(
      resolveModelListAccountSourceReadiness({
        siteType: SITE_TYPES.SUB2API,
      }),
    ).toEqual({
      route: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.TokenScopedRuntimeCatalog,
      modelCatalog,
      requiresTokenKeyResolution: false,
      dashboardEstimateLoader:
        ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS.Sub2Api,
      statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Token,
      displayCapabilitiesSource:
        ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Response,
    })
  })

  it("exposes whether model-list fallback can load account runtime keys", () => {
    vi.mocked(getSiteTypeCapabilities).mockReturnValue({
      siteType: SITE_TYPES.SHAREDCHAT,
      account: {
        modelCatalog,
        serviceCredential: {
          fetch: vi.fn(),
        },
      },
    } as any)

    expect(
      canLoadModelListAccountFallbackRuntimeKeys(runtimeKeyFallbackAccount),
    ).toBe(true)

    vi.mocked(getSiteTypeCapabilities).mockReturnValue({
      siteType: SITE_TYPES.SHAREDCHAT,
      account: {
        modelCatalog,
      },
    } as any)

    expect(
      canLoadModelListAccountFallbackRuntimeKeys(runtimeKeyFallbackAccount),
    ).toBe(false)
  })

  it("returns missing model-catalog capability for token-scoped profiles without modelCatalog", () => {
    vi.mocked(getSiteTypeCapabilities).mockReturnValue({
      siteType: SITE_TYPES.SUB2API,
    } as any)

    expect(
      resolveModelListAccountSourceReadiness({
        siteType: SITE_TYPES.SUB2API,
      }),
    ).toEqual({
      route: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.Unsupported,
      reason:
        MODEL_LIST_ACCOUNT_SOURCE_UNSUPPORTED_REASONS.MissingModelCatalogCapability,
      statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Token,
      displayCapabilitiesSource:
        ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Response,
    })
  })

  it("returns unsupported without throwing for an unmapped account site without adapter support", () => {
    vi.mocked(getSiteTypeCapabilities).mockReturnValue({
      siteType: SITE_TYPES.UNKNOWN,
    } as any)

    expect(() =>
      resolveModelListAccountSourceReadiness({
        siteType: SITE_TYPES.UNKNOWN,
      }),
    ).not.toThrow()
    expect(
      resolveModelListAccountSourceReadiness({
        siteType: SITE_TYPES.UNKNOWN,
      }),
    ).toMatchObject({
      route: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.Unsupported,
      reason:
        MODEL_LIST_ACCOUNT_SOURCE_UNSUPPORTED_REASONS.MissingModelPricingCapability,
    })
  })

  it("carries profile display capability source for AIHubMix", () => {
    vi.mocked(getSiteTypeCapabilities).mockReturnValue({
      siteType: SITE_TYPES.AIHUBMIX,
      account: {
        modelPricing,
      },
    } as any)

    expect(
      resolveModelListAccountSourceReadiness({
        siteType: SITE_TYPES.AIHUBMIX,
      }),
    ).toMatchObject({
      route: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.DirectPricing,
      statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Account,
      displayCapabilitiesSource:
        ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Profile,
    })
  })
})
