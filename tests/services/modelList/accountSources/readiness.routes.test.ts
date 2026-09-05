import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS,
  ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES,
  ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES,
} from "~/services/accounts/accountSiteProfile"

const { getAccountSiteModelListProfileMock, getSiteTypeCapabilitiesMock } =
  vi.hoisted(() => ({
    getAccountSiteModelListProfileMock: vi.fn(),
    getSiteTypeCapabilitiesMock: vi.fn(),
  }))

vi.mock("~/services/accounts/accountSiteProfile", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/accounts/accountSiteProfile")
    >()

  return {
    ...actual,
    getAccountSiteModelListProfile: (...args: unknown[]) =>
      getAccountSiteModelListProfileMock(...args),
  }
})

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteTypeCapabilities: getSiteTypeCapabilitiesMock,
}))

describe("resolveModelListAccountSourceReadiness route fallbacks", () => {
  beforeEach(() => {
    getAccountSiteModelListProfileMock.mockReset()
    getSiteTypeCapabilitiesMock.mockReset()

    getAccountSiteModelListProfileMock.mockReturnValue({
      dashboardEstimateLoader:
        ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS.None,
      statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Account,
      displayCapabilitiesSource:
        ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Response,
    })
    getSiteTypeCapabilitiesMock.mockReturnValue({
      siteType: SITE_TYPES.NEW_API,
    })
  })

  it("returns no supported route when the registry exposes no account-backed source", async () => {
    const {
      MODEL_LIST_ACCOUNT_SOURCE_ROUTES,
      MODEL_LIST_ACCOUNT_SOURCE_UNSUPPORTED_REASONS,
      resolveModelListAccountSourceReadiness,
    } = await import("~/services/modelList/accountSources/readiness")

    expect(
      resolveModelListAccountSourceReadiness({
        siteType: SITE_TYPES.NEW_API,
      }),
    ).toEqual({
      route: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.Unsupported,
      reason: MODEL_LIST_ACCOUNT_SOURCE_UNSUPPORTED_REASONS.NoSupportedRoute,
      statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Account,
      displayCapabilitiesSource:
        ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Response,
    })
  })

  it("uses registry capability presence even when the product profile does not opt in", async () => {
    const fetchPricing = vi.fn()
    getSiteTypeCapabilitiesMock.mockReturnValue({
      siteType: SITE_TYPES.NEW_API,
      account: { modelPricing: { fetchPricing } },
    })

    const {
      MODEL_LIST_ACCOUNT_SOURCE_ROUTES,
      resolveModelListAccountSourceReadiness,
    } = await import("~/services/modelList/accountSources/readiness")

    expect(
      resolveModelListAccountSourceReadiness({ siteType: SITE_TYPES.NEW_API }),
    ).toMatchObject({
      route: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.DirectPricing,
      modelPricing: { fetchPricing },
    })
  })

  it("uses a stable capability precedence when multiple sources are registered", async () => {
    const modelPricing = { fetchPricing: vi.fn() }
    getSiteTypeCapabilitiesMock.mockReturnValue({
      siteType: SITE_TYPES.NEW_API,
      account: {
        modelPricing,
        providerModelCatalog: { fetchModels: vi.fn() },
        modelCatalog: { fetchModels: vi.fn() },
      },
    })

    const {
      MODEL_LIST_ACCOUNT_SOURCE_ROUTES,
      resolveModelListAccountSourceReadiness,
    } = await import("~/services/modelList/accountSources/readiness")

    expect(
      resolveModelListAccountSourceReadiness({ siteType: SITE_TYPES.NEW_API }),
    ).toMatchObject({
      route: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.DirectPricing,
      modelPricing,
    })
  })
})
