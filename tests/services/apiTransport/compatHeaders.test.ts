import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { getAccountSiteCompatUserIdHeaderRules } from "~/services/accountSiteOnboarding/metadata"
import {
  buildCompatUserIdHeaders,
  COMPAT_USER_ID_ERROR_HEADER_TO_SITE_TYPE,
} from "~/services/apiTransport/compatHeaders"

describe("compat user-id headers", () => {
  it("includes the V-API X-Api-User compatibility header", () => {
    expect(buildCompatUserIdHeaders(123)).toMatchObject({
      "X-Api-User": "123",
    })
  })

  it("uses X-Api-User as a V-API detection signal", () => {
    expect(COMPAT_USER_ID_ERROR_HEADER_TO_SITE_TYPE["X-Api-User"]).toBe(
      SITE_TYPES.V_API,
    )
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
      Object.fromEntries(
        getAccountSiteCompatUserIdHeaderRules().map(
          ({ headerName, siteType }) => [headerName, siteType],
        ),
      ),
    ).toEqual(COMPAT_USER_ID_ERROR_HEADER_TO_SITE_TYPE)
  })
})
