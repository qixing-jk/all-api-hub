import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  REDEMPTION_ACCOUNT_SUPPORT_STATUSES,
  toRedemptionAccountCandidate,
} from "~/services/redemption/accountCandidate"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"

describe("toRedemptionAccountCandidate", () => {
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
