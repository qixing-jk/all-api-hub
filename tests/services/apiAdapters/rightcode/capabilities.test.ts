import { describe, expect, it } from "vitest"

import { ACCOUNT_SITE_ADAPTER_FAMILIES, SITE_TYPES } from "~/constants/siteType"
import { rightCodeCapabilities } from "~/services/apiAdapters/rightcode"

describe("rightCodeCapabilities", () => {
  it("exports siteType, family, and account adapter capabilities", () => {
    expect(rightCodeCapabilities.siteType).toBe(SITE_TYPES.RIGHT_CODE)
    expect(rightCodeCapabilities.family).toBe(
      ACCOUNT_SITE_ADAPTER_FAMILIES.RightCode,
    )
    expect(rightCodeCapabilities.account.data).toBeDefined()
    expect(rightCodeCapabilities.account.bootstrap).toBeDefined()
    expect(rightCodeCapabilities.account.completion).toBeDefined()
    expect(rightCodeCapabilities.account.keyResourceManagement).toBeDefined()
    expect(rightCodeCapabilities.account.refresh).toBeDefined()
    expect(rightCodeCapabilities.account.modelPricing).toBeDefined()
    expect(rightCodeCapabilities.account.inviteLink).toBeDefined()
  })
})
