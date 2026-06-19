import { describe, expect, it } from "vitest"

import {
  ACCOUNT_SITE_DOMAIN_RULES,
  AIHUBMIX_HOSTNAMES,
  getAccountSiteApiRouter,
  isAccountSiteType,
  isManagedSiteType,
  SITE_TYPES,
} from "~/constants/siteType"

describe("siteType constants", () => {
  it("recognizes account site type values only", () => {
    expect(isAccountSiteType(SITE_TYPES.NEW_API)).toBe(true)
    expect(isAccountSiteType(SITE_TYPES.V_API)).toBe(true)
    expect(isAccountSiteType(SITE_TYPES.SUB2API)).toBe(true)
    expect(isAccountSiteType(SITE_TYPES.AIHUBMIX)).toBe(true)
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
    expect(isManagedSiteType(SITE_TYPES.AIHUBMIX)).toBe(false)
    expect(isManagedSiteType("toString")).toBe(false)
  })

  it("returns default routes for site types without overrides", () => {
    expect(getAccountSiteApiRouter(SITE_TYPES.UNKNOWN)).toMatchObject({
      loginPath: "/login",
      usagePath: "/console/log",
      checkInPath: "/console/personal",
      redeemPath: "/console/topup",
      siteAnnouncementsPath: "/",
    })
  })

  it("returns panel routes for V-API account pages", () => {
    expect(getAccountSiteApiRouter(SITE_TYPES.V_API)).toMatchObject({
      loginPath: "/login",
      usagePath: "/panel/log",
      checkInPath: "/panel/profile",
      redeemPath: "/panel/topup",
      adminCredentialsPath: "/panel/profile",
      siteAnnouncementsPath: "/",
    })
  })

  it("returns default routes for AIHubMix account pages", () => {
    expect(getAccountSiteApiRouter(SITE_TYPES.AIHUBMIX)).toMatchObject({
      loginPath: "/sign-in",
      usagePath: "/statistics",
      checkInPath: "/",
      redeemPath: "/topup",
      adminCredentialsPath: "/",
      siteAnnouncementsPath: "/",
    })
  })

  it("returns Sub2API account page route overrides", () => {
    expect(getAccountSiteApiRouter(SITE_TYPES.SUB2API)).toMatchObject({
      usagePath: "/usage",
      redeemPath: "/redeem",
      siteAnnouncementsPath: "/dashboard",
    })
  })

  it("includes AIHubMix domain detection rules", () => {
    expect(ACCOUNT_SITE_DOMAIN_RULES).toContainEqual({
      name: SITE_TYPES.AIHUBMIX,
      hostnames: AIHUBMIX_HOSTNAMES,
    })
  })
})
