import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES,
  ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES,
} from "~/services/accounts/accountSiteProfile"
import {
  getAccountSiteReadinessExpectation,
  getAccountSiteTypeValues,
} from "~/services/accountSiteDefinitions"
import {
  MODEL_LIST_ACCOUNT_SOURCE_ROUTES,
  resolveModelListAccountSourceReadiness,
} from "~/services/modelList/accountSources/readiness"

describe("Model List readiness definition expectations", () => {
  it("resolves each expected account site route without throwing", () => {
    for (const siteType of getAccountSiteTypeValues()) {
      const expectation = getAccountSiteReadinessExpectation(siteType)
      const readiness = resolveModelListAccountSourceReadiness({ siteType })

      expect(readiness.route, `${siteType} readiness route`).toBe(
        expectation?.modelList?.expectedRoute,
      )
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
      resolveModelListAccountSourceReadiness({ siteType: SITE_TYPES.AIHUBMIX }),
    ).toMatchObject({
      route: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.DirectPricing,
      statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Account,
      displayCapabilitiesSource:
        ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Profile,
    })
  })
})
