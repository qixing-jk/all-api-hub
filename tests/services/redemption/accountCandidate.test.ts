import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { toRedemptionAccountCandidate } from "~/services/redemption/accountCandidate"
import { REDEMPTION_ACCOUNT_SUPPORT_STATUSES } from "~/services/redemption/contracts"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"

describe("toRedemptionAccountCandidate", () => {
  it("offers manual redemption only through a declared or configured redemption page", () => {
    const native = toRedemptionAccountCandidate(
      buildDisplaySiteData({
        siteType: SITE_TYPES.SUB2API,
        baseUrl: "https://manual.test",
      }),
    )
    expect(native.manualRedemptionUrl).toBe("https://manual.test/redeem")
    const checkIn = {
      ...buildDisplaySiteData().checkIn,
      customCheckIn: { url: "https://check-in.test" },
    }
    const noRoute = buildDisplaySiteData({
      siteType: SITE_TYPES.RIGHT_CODE,
      baseUrl: "https://right.test",
      checkIn,
    })
    expect(
      toRedemptionAccountCandidate(noRoute).manualRedemptionUrl,
    ).toBeUndefined()
    expect(
      toRedemptionAccountCandidate({
        ...noRoute,
        checkIn: {
          ...checkIn,
          customCheckIn: { redeemUrl: "https://right.test/activation" },
        },
      }).manualRedemptionUrl,
    ).toBe("https://right.test/activation")
    expect(
      toRedemptionAccountCandidate({
        ...noRoute,
        checkIn: {
          ...checkIn,
          customCheckIn: { redeemUrl: "javascript:alert(1)" },
        },
      }).manualRedemptionUrl,
    ).toBeUndefined()
  })
  it("marks accounts without a registered redemption capability as unsupported", () => {
    const account = buildDisplaySiteData({
      id: "unsupported-account",
      siteType: SITE_TYPES.OPENROUTER,
    })

    const candidate = toRedemptionAccountCandidate(account)

    expect(candidate.id).toBe(account.id)
    expect(candidate.automaticRedemptionSupport).toEqual({
      status: REDEMPTION_ACCOUNT_SUPPORT_STATUSES.Unsupported,
      reason: "capability-missing",
    })
  })
})
