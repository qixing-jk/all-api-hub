import { describe, expect, it } from "vitest"

import {
  getSiteApiRouter,
  isManagedSiteType,
  isSiteType,
  SITE_TYPES,
} from "~/constants/siteType"

describe("siteType constants", () => {
  it("recognizes supported site type values only", () => {
    expect(isSiteType(SITE_TYPES.NEW_API)).toBe(true)
    expect(isSiteType(SITE_TYPES.UNKNOWN)).toBe(true)
    expect(isSiteType("unsupported-site")).toBe(false)
    expect(isSiteType(null)).toBe(false)
  })

  it("recognizes managed site type values only", () => {
    expect(isManagedSiteType(SITE_TYPES.NEW_API)).toBe(true)
    expect(isManagedSiteType(SITE_TYPES.CLAUDE_CODE_HUB)).toBe(true)
    expect(isManagedSiteType(SITE_TYPES.SUB2API)).toBe(false)
    expect(isManagedSiteType("toString")).toBe(false)
  })

  it("returns default routes for site types without overrides", () => {
    expect(getSiteApiRouter(SITE_TYPES.UNKNOWN)).toMatchObject({
      usagePath: "/console/log",
      checkInPath: "/console/personal",
      redeemPath: "/console/topup",
      siteAnnouncementsPath: "/",
    })
  })
})
