import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { PRODUCT_ANALYTICS_MANAGED_SITE_TYPES } from "~/services/productAnalytics/events"
import { resolveProductAnalyticsManagedSiteType } from "~/services/productAnalytics/managedSite"

describe("product analytics managed-site helpers", () => {
  it.each([
    [SITE_TYPES.NEW_API, PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.NewApi],
    [SITE_TYPES.VELOERA, PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.Veloera],
    [SITE_TYPES.DONE_HUB, PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.DoneHub],
    [SITE_TYPES.OCTOPUS, PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.Octopus],
    [SITE_TYPES.AXON_HUB, PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.AxonHub],
    [
      SITE_TYPES.CLAUDE_CODE_HUB,
      PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.ClaudeCodeHub,
    ],
  ])("maps managed site type %s to analytics enum %s", (siteType, expected) => {
    expect(resolveProductAnalyticsManagedSiteType(siteType)).toBe(expected)
  })

  it.each([
    SITE_TYPES.ONE_API,
    SITE_TYPES.ONE_HUB,
    SITE_TYPES.SUB2API,
    SITE_TYPES.AIHUBMIX,
    SITE_TYPES.UNKNOWN,
    "private-fork",
    undefined,
  ])(
    "returns undefined for non-managed or unknown site type %s",
    (siteType) => {
      expect(resolveProductAnalyticsManagedSiteType(siteType)).toBeUndefined()
    },
  )
})
