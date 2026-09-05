import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES,
  ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES,
} from "~/services/accounts/accountSiteProfile"
import { getAccountSiteTypeValues } from "~/services/accountSiteDefinitions"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import {
  MODEL_LIST_ACCOUNT_SOURCE_ROUTES,
  resolveModelListAccountSourceReadiness,
} from "~/services/modelList/accountSources/readiness"

describe("Model List readiness capability routing", () => {
  it("derives every route from the registered capability object", () => {
    for (const siteType of getAccountSiteTypeValues()) {
      const capabilities = getSiteTypeCapabilities(siteType).account
      const readiness = resolveModelListAccountSourceReadiness({ siteType })

      if (capabilities?.modelPricing) {
        expect(readiness.route, `${siteType} direct pricing route`).toBe(
          MODEL_LIST_ACCOUNT_SOURCE_ROUTES.DirectPricing,
        )
      } else if (capabilities?.providerModelCatalog) {
        expect(readiness.route, `${siteType} provider catalog route`).toBe(
          MODEL_LIST_ACCOUNT_SOURCE_ROUTES.ProviderCatalog,
        )
      } else if (capabilities?.modelCatalog) {
        expect(readiness.route, `${siteType} runtime catalog route`).toBe(
          MODEL_LIST_ACCOUNT_SOURCE_ROUTES.TokenScopedRuntimeCatalog,
        )
      } else {
        expect(readiness.route, `${siteType} unsupported route`).toBe(
          MODEL_LIST_ACCOUNT_SOURCE_ROUTES.Unsupported,
        )
      }
    }
  })

  it("keeps representative account-site readiness semantics", () => {
    expect(
      resolveModelListAccountSourceReadiness({ siteType: SITE_TYPES.NEW_API }),
    ).toMatchObject({
      route: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.DirectPricing,
      statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Account,
      displayCapabilitiesSource:
        ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Response,
    })
    expect(
      resolveModelListAccountSourceReadiness({ siteType: SITE_TYPES.SUB2API }),
    ).toMatchObject({
      route: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.TokenScopedRuntimeCatalog,
      statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Token,
      displayCapabilitiesSource:
        ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Response,
    })
    expect(
      resolveModelListAccountSourceReadiness({
        siteType: SITE_TYPES.VO_API_V2,
      }),
    ).toMatchObject({
      route: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.Unsupported,
      statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Account,
      displayCapabilitiesSource:
        ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Response,
    })
    expect(
      resolveModelListAccountSourceReadiness({ siteType: SITE_TYPES.AIHUBMIX }),
    ).toMatchObject({
      route: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.DirectPricing,
      statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Account,
      displayCapabilitiesSource:
        ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Profile,
    })
  })
})
