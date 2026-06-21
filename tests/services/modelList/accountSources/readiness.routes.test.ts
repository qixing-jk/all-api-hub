import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS,
  ACCOUNT_SITE_MODEL_LIST_DIRECT_PRICING,
  ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES,
  ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES,
  ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS,
} from "~/services/accounts/accountSiteProfile"

const { getAccountSiteModelListProfileMock, getSiteAdapterMock } = vi.hoisted(
  () => ({
    getAccountSiteModelListProfileMock: vi.fn(),
    getSiteAdapterMock: vi.fn(),
  }),
)

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
  getSiteAdapter: getSiteAdapterMock,
}))

describe("resolveModelListAccountSourceReadiness route fallbacks", () => {
  beforeEach(() => {
    getAccountSiteModelListProfileMock.mockReset()
    getSiteAdapterMock.mockReset()

    getAccountSiteModelListProfileMock.mockReturnValue({
      directPricing: ACCOUNT_SITE_MODEL_LIST_DIRECT_PRICING.Unsupported,
      tokenScopedCatalogFallback:
        ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS.None,
      dashboardEstimateLoader:
        ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS.None,
      statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Account,
      displayCapabilitiesSource:
        ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Response,
    })
    getSiteAdapterMock.mockReturnValue({
      siteType: SITE_TYPES.NEW_API,
    })
  })

  it("returns no supported route when profile policy disables every account-backed source", async () => {
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
})
