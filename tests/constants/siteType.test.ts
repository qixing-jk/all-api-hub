import { describe, expect, it } from "vitest"

import {
  getAccountSiteApiRouter,
  isAccountSiteType,
  isManagedSiteType,
  SITE_TYPES,
} from "~/constants/siteType"

describe("siteType constants", () => {
  it("recognizes account site type values only", () => {
    expect(isAccountSiteType(SITE_TYPES.NEW_API)).toBe(true)
    expect(isAccountSiteType(SITE_TYPES.SUB2API)).toBe(true)
    expect(isAccountSiteType(SITE_TYPES.UNKNOWN)).toBe(true)
    expect(isAccountSiteType(SITE_TYPES.OCTOPUS)).toBe(false)
    expect(isAccountSiteType(SITE_TYPES.AXON_HUB)).toBe(false)
    expect(isAccountSiteType(SITE_TYPES.CLAUDE_CODE_HUB)).toBe(false)
    expect(isAccountSiteType("unsupported-site")).toBe(false)
    expect(isAccountSiteType(null)).toBe(false)
  })

  it("recognizes managed site type values only", () => {
    expect(isManagedSiteType(SITE_TYPES.NEW_API)).toBe(true)
    expect(isManagedSiteType(SITE_TYPES.OCTOPUS)).toBe(true)
    expect(isManagedSiteType(SITE_TYPES.AXON_HUB)).toBe(true)
    expect(isManagedSiteType(SITE_TYPES.CLAUDE_CODE_HUB)).toBe(true)
    expect(isManagedSiteType(SITE_TYPES.SUB2API)).toBe(false)
    expect(isManagedSiteType("toString")).toBe(false)
  })

  it("returns default routes for site types without overrides", () => {
    expect(getAccountSiteApiRouter(SITE_TYPES.UNKNOWN)).toMatchObject({
      usagePath: "/console/log",
      checkInPath: "/console/personal",
      redeemPath: "/console/topup",
      siteAnnouncementsPath: "/",
    })
  })
})
