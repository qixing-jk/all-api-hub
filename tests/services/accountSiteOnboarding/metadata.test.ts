import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { getAccountSiteRouteMetadata } from "~/services/accountSiteOnboarding/metadata"

describe("account site route metadata", () => {
  it("resolves one site's routes without cloning other sites' detection rules", () => {
    // Pricing resolves these routes for each model/group. A single lookup must
    // not reconstruct the entire onboarding catalog and its RegExp matchers.
    const expressions = vi.spyOn(globalThis, "RegExp")
    let count: number
    let routes: ReturnType<typeof getAccountSiteRouteMetadata>
    try {
      routes = getAccountSiteRouteMetadata(SITE_TYPES.NEW_API)
      count = expressions.mock.calls.length
    } finally {
      expressions.mockRestore()
    }
    expect(routes.pricingPath).toBe("/pricing")
    expect(count).toBeLessThanOrEqual(1)

    routes.pricingPath = "/changed"
    expect(getAccountSiteRouteMetadata(SITE_TYPES.NEW_API).pricingPath).toBe(
      "/pricing",
    )
  })

  it.each([undefined, null, {}, "not-registered", SITE_TYPES.CLI_PROXY_API])(
    "preserves unknown-account routes for %s",
    (siteType) => {
      expect(getAccountSiteRouteMetadata(siteType)).toEqual(
        getAccountSiteRouteMetadata(SITE_TYPES.UNKNOWN),
      )
    },
  )
})
