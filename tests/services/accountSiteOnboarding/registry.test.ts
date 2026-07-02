import { describe, expect, it } from "vitest"

import {
  ACCOUNT_SITE_ADAPTER_FAMILIES,
  ACCOUNT_SITE_DOMAIN_RULES,
  ACCOUNT_SITE_TITLE_RULES,
  AIHUBMIX_HOSTNAMES,
  getAccountSiteApiRouter,
  SITE_TYPES,
} from "~/constants/siteType"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions"
import {
  getAccountSiteCompatUserIdHeaderRules,
  getAccountSiteDomainRules,
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

  it("matches hyphenated site titles through generated title rules", () => {
    const titleRules = getAccountSiteTitleRules()

    expect(
      titleRules
        .find((rule) => rule.name === SITE_TYPES.ONE_HUB)
        ?.regex.test("One Hub"),
    ).toBe(true)
    expect(
      titleRules
        .find((rule) => rule.name === SITE_TYPES.ONE_HUB)
        ?.regex.test("one_hub"),
    ).toBe(true)
  })

  it("returns title rule object copies", () => {
    const firstRule = getAccountSiteTitleRules().find(
      (rule) => rule.name === SITE_TYPES.SUB2API,
    )

    firstRule!.name = SITE_TYPES.UNKNOWN
    firstRule!.regex = /mutated/i

    const nextRule = getAccountSiteTitleRules().find(
      (rule) => rule.name === SITE_TYPES.SUB2API,
    )

    expect(nextRule?.name).toBe(SITE_TYPES.SUB2API)
    expect(nextRule?.regex.test(SITE_TYPES.SUB2API)).toBe(true)
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

  it("projects account site route overrides through the public router", () => {
    expect(getAccountSiteApiRouter(SITE_TYPES.AIHUBMIX)).toMatchObject({
      loginPath: "/sign-in",
      usagePath: "/statistics",
      redeemPath: "/topup",
    })
  })

  it("projects onboarding definitions from the account-site definition registry", () => {
    const aihubmixDefinition = getAccountSiteDefinition(SITE_TYPES.AIHUBMIX)

    expect(aihubmixDefinition).toMatchObject({
      siteType: SITE_TYPES.AIHUBMIX,
      adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.Aihubmix,
      onboarding: {
        routes: {
          loginPath: "/sign-in",
          usagePath: "/statistics",
          redeemPath: "/topup",
        },
      },
    })
    expect(aihubmixDefinition?.onboarding?.detection?.hostnames).toEqual([
      ...AIHUBMIX_HOSTNAMES,
    ])
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

  it("returns domain rule object copies", () => {
    const firstRule = getAccountSiteDomainRules().find(
      (rule) => rule.name === SITE_TYPES.AIHUBMIX,
    )

    firstRule!.name = SITE_TYPES.UNKNOWN

    expect(
      getAccountSiteDomainRules().find(
        (rule) => rule.name === SITE_TYPES.AIHUBMIX,
      )?.name,
    ).toBe(SITE_TYPES.AIHUBMIX)
  })

  it("returns onboarding definition detection array copies", () => {
    const firstDefinition = getAccountSiteDefinition(SITE_TYPES.AIHUBMIX)

    ;(firstDefinition!.onboarding!.detection!.hostnames as string[]).push(
      "mutated.example.invalid",
    )
    ;(firstDefinition!.onboarding!.detection!.titlePatterns as RegExp[]).push(
      /mutated/i,
    )

    const nextDefinition = getAccountSiteDefinition(SITE_TYPES.AIHUBMIX)

    expect(
      nextDefinition?.onboarding?.detection?.hostnames?.includes(
        "mutated.example.invalid",
      ),
    ).toBe(false)
    expect(nextDefinition?.onboarding?.detection?.titlePatterns).toHaveLength(1)
  })

  it("returns content session extractors in onboarding order", () => {
    expect(
      getContentSessionExtractors().map((extractor) => extractor.id),
    ).toEqual(["sub2api", "sharedchat", "compatible-user"])
  })

  it("returns default routes for site types without route metadata", () => {
    expect(getAccountSiteApiRouter(SITE_TYPES.UNKNOWN)).toMatchObject({
      loginPath: "/login",
      usagePath: "/console/log",
      redeemPath: "/console/topup",
    })
  })
})
