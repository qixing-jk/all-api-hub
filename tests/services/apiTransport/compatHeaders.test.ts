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

  it("supports the ModelFlare user-id header as family compatibility", () => {
    expect(buildCompatUserIdHeaders(123)).toMatchObject({
      "X-ModelFlare-User": "123",
    })
    expect(getAccountSiteCompatUserIdHeaderRules()).toContainEqual({
      headerName: "X-ModelFlare-User",
      siteType: SITE_TYPES.MODELFLARE,
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

  it("keeps the Rix-Api-User header for numeric account identities", () => {
    expect(buildCompatUserIdHeaders(25983)).toMatchObject({
      "Rix-Api-User": "25983",
    })
    expect(buildCompatUserIdHeaders("25983")).toMatchObject({
      "Rix-Api-User": "25983",
    })
  })

  it("omits the Rix-Api-User header for non-numeric account identities", () => {
    // Rix API validates this header as the account id on token-authenticated
    // requests: a non-numeric value is rejected with a format error and a
    // mismatched integer is rejected as another user's id. White-label
    // deployments that only expose `username` must therefore not send it, while
    // every other compatibility header keeps fanning out the identity.
    const headers = buildCompatUserIdHeaders("white-label-owner")

    expect(headers).not.toHaveProperty("Rix-Api-User")
    expect(headers).toMatchObject({
      "New-API-User": "white-label-owner",
      "User-id": "white-label-owner",
    })
  })
})
