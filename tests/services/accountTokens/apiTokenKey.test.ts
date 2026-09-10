import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import * as definitions from "~/services/accountSiteDefinitions/registry"
import {
  formatOptionalSkPrefixSiteTokenAuthKey,
  formatOptionalSkPrefixSiteTokenComparableKey,
} from "~/services/accountTokens/apiTokenKey"

describe("registered token key semantics", () => {
  it.each([
    SITE_TYPES.ONE_API,
    SITE_TYPES.NEW_API,
    SITE_TYPES.APIYI,
    SITE_TYPES.MODELFLARE,
    SITE_TYPES.ANYROUTER,
    SITE_TYPES.VELOERA,
    SITE_TYPES.ONE_HUB,
    SITE_TYPES.DONE_HUB,
    SITE_TYPES.V_API,
    SITE_TYPES.VO_API,
    SITE_TYPES.SUPER_API,
    SITE_TYPES.RIX_API,
    SITE_TYPES.NEO_API,
    SITE_TYPES.WONG_GONGYI,
  ])("preserves optional-prefix auth and identity for %s", (siteType) => {
    expect(formatOptionalSkPrefixSiteTokenAuthKey(" raw ", siteType)).toBe(
      "sk-raw",
    )
    expect(formatOptionalSkPrefixSiteTokenAuthKey(" sk-raw ", siteType)).toBe(
      "sk-raw",
    )
    expect(
      formatOptionalSkPrefixSiteTokenComparableKey(" sk-raw ", siteType),
    ).toBe("raw")
  })

  it.each([
    SITE_TYPES.VO_API_V2,
    SITE_TYPES.SUB2API,
    SITE_TYPES.AIHUBMIX,
    SITE_TYPES.SHAREDCHAT,
    SITE_TYPES.OPENROUTER,
    SITE_TYPES.OCTOPUS,
    SITE_TYPES.AXON_HUB,
    SITE_TYPES.CLAUDE_CODE_HUB,
    SITE_TYPES.UNKNOWN,
    "unregistered-provider",
    "",
    undefined,
  ])("preserves opaque keys for %s", (siteType) => {
    expect(formatOptionalSkPrefixSiteTokenAuthKey(" raw ", siteType)).toBe(
      "raw",
    )
    expect(
      formatOptionalSkPrefixSiteTokenComparableKey(" sk-raw ", siteType),
    ).toBe("sk-raw")
  })

  it("takes semantics from registration independently of identity and adapter family", () => {
    const definition = definitions.getAccountSiteDefinition(SITE_TYPES.SUB2API)!
    const lookup = vi
      .spyOn(definitions, "getAccountSiteDefinition")
      .mockReturnValue({
        ...definition,
        tokenKey: { optionalSkPrefix: true },
      })
    try {
      expect(
        formatOptionalSkPrefixSiteTokenAuthKey("raw", "new-provider"),
      ).toBe("sk-raw")
      lookup.mockReturnValue({
        ...definition,
        tokenKey: { optionalSkPrefix: false },
      })
      expect(
        formatOptionalSkPrefixSiteTokenAuthKey("raw", SITE_TYPES.NEW_API),
      ).toBe("raw")
    } finally {
      lookup.mockRestore()
    }
  })

  it("does not expose mutable registry token policy", () => {
    const definition = definitions.getAccountSiteDefinition(SITE_TYPES.NEW_API)!
    definition.tokenKey!.optionalSkPrefix = false
    expect(
      formatOptionalSkPrefixSiteTokenAuthKey("raw", SITE_TYPES.NEW_API),
    ).toBe("sk-raw")
  })
})
