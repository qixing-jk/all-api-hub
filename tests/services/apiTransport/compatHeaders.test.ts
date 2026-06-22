import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { getAccountSiteCompatUserIdHeaderRules } from "~/services/accountSiteOnboarding/metadata"
import { buildCompatUserIdHeaders } from "~/services/apiTransport/compatHeaders"

describe("compat user-id headers", () => {
  it("includes the V-API X-Api-User compatibility header", () => {
    expect(buildCompatUserIdHeaders(123)).toMatchObject({
      "X-Api-User": "123",
    })
  })

  it("keeps the broad User-id compatibility header in request fan-out", () => {
    expect(buildCompatUserIdHeaders(123)).toMatchObject({
      "User-id": "123",
    })
  })

  it("uses X-Api-User as a V-API detection signal", () => {
    expect(getAccountSiteCompatUserIdHeaderRules()).toContainEqual({
      headerName: "X-Api-User",
      siteType: SITE_TYPES.V_API,
    })
  })

  it("keeps the generic User-id header out of detection rules", () => {
    expect(getAccountSiteCompatUserIdHeaderRules()).not.toContainEqual({
      headerName: "User-id",
      siteType: SITE_TYPES.NEW_API,
    })
  })

  it("derives error-header detection signals from onboarding metadata", () => {
    expect(getAccountSiteCompatUserIdHeaderRules()).toContainEqual({
      headerName: "New-API-User",
      siteType: SITE_TYPES.NEW_API,
    })
    expect(getAccountSiteCompatUserIdHeaderRules()).toContainEqual({
      headerName: "X-Api-User",
      siteType: SITE_TYPES.V_API,
    })
    expect(
      getAccountSiteCompatUserIdHeaderRules().map((rule) => rule.headerName),
    ).toEqual(
      expect.arrayContaining([
        "New-API-User",
        "Veloera-User",
        "X-Api-User",
        "voapi-user",
        "Rix-Api-User",
        "neo-api-user",
      ]),
    )
  })
})
