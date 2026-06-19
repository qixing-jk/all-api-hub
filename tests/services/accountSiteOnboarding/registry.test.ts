import { describe, expect, it } from "vitest"

import {
  ACCOUNT_SITE_DOMAIN_RULES,
  ACCOUNT_SITE_TITLE_RULES,
  AIHUBMIX_HOSTNAMES,
  AIHUBMIX_LOGIN_PATH,
  SITE_TYPES,
} from "~/constants/siteType"
import {
  getAccountSiteCompatUserIdHeaderRules,
  getAccountSiteDomainRules,
  getAccountSiteOnboardingDefinition,
  getAccountSiteRouteOverrides,
  getAccountSiteTitleRules,
  getContentSessionExtractors,
} from "~/services/accountSiteOnboarding/registry"

describe("account site onboarding registry", () => {
  it("projects account site title rules from metadata", () => {
    const titleRuleNames = getAccountSiteTitleRules().map((rule) => rule.name)

    expect(titleRuleNames).toEqual(
      ACCOUNT_SITE_TITLE_RULES.map((rule) => rule.name),
    )
    expect(titleRuleNames.slice(0, 2)).toEqual([
      SITE_TYPES.ONE_API,
      SITE_TYPES.NEW_API,
    ])
    expect(titleRuleNames).toContain(SITE_TYPES.SUB2API)
    expect(titleRuleNames).toContain(SITE_TYPES.AIHUBMIX)
  })

  it("projects account site domain rules from metadata", () => {
    expect(getAccountSiteDomainRules()).toEqual(ACCOUNT_SITE_DOMAIN_RULES)
    expect(getAccountSiteDomainRules()).toContainEqual({
      name: SITE_TYPES.AIHUBMIX,
      hostnames: [...AIHUBMIX_HOSTNAMES],
    })
  })

  it("projects compat user-id header fallback rules from metadata", () => {
    expect(getAccountSiteCompatUserIdHeaderRules()).toEqual(
      expect.arrayContaining([
        { siteType: SITE_TYPES.NEW_API, headerName: "New-API-User" },
        { siteType: SITE_TYPES.V_API, headerName: "X-Api-User" },
      ]),
    )
  })

  it("returns account site route overrides from metadata", () => {
    expect(getAccountSiteRouteOverrides(SITE_TYPES.AIHUBMIX)).toMatchObject({
      loginPath: AIHUBMIX_LOGIN_PATH,
      usagePath: "/statistics",
      redeemPath: "/topup",
    })
  })

  it("returns route override copies instead of mutable metadata objects", () => {
    const firstRoutes = getAccountSiteRouteOverrides(SITE_TYPES.AIHUBMIX)
    firstRoutes.loginPath = "/mutated"

    expect(getAccountSiteRouteOverrides(SITE_TYPES.AIHUBMIX).loginPath).toBe(
      AIHUBMIX_LOGIN_PATH,
    )
  })

  it("returns onboarding definition copies instead of mutable metadata objects", () => {
    const firstDefinition = getAccountSiteOnboardingDefinition(
      SITE_TYPES.AIHUBMIX,
    )

    firstDefinition!.routes!.loginPath = "/mutated"

    expect(
      getAccountSiteOnboardingDefinition(SITE_TYPES.AIHUBMIX)?.routes
        ?.loginPath,
    ).toBe(AIHUBMIX_LOGIN_PATH)
  })

  it("returns domain rule hostname array copies", () => {
    const firstRule = getAccountSiteDomainRules().find(
      (rule) => rule.name === SITE_TYPES.AIHUBMIX,
    )

    ;(firstRule!.hostnames as string[]).push("mutated.example.invalid")

    expect(
      getAccountSiteDomainRules()
        .find((rule) => rule.name === SITE_TYPES.AIHUBMIX)
        ?.hostnames.includes("mutated.example.invalid"),
    ).toBe(false)
  })

  it("returns onboarding definition detection array copies", () => {
    const firstDefinition = getAccountSiteOnboardingDefinition(
      SITE_TYPES.AIHUBMIX,
    )

    ;(firstDefinition!.detection!.hostnames as string[]).push(
      "mutated.example.invalid",
    )
    ;(firstDefinition!.detection!.titlePatterns as RegExp[]).push(/mutated/i)

    const nextDefinition = getAccountSiteOnboardingDefinition(
      SITE_TYPES.AIHUBMIX,
    )

    expect(
      nextDefinition?.detection?.hostnames?.includes("mutated.example.invalid"),
    ).toBe(false)
    expect(nextDefinition?.detection?.titlePatterns).toHaveLength(1)
  })

  it("returns content session extractors in onboarding order", () => {
    expect(
      getContentSessionExtractors().map((extractor) => extractor.id),
    ).toEqual(["sub2api", "compatible-user"])
  })
})
