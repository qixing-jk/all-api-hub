import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { createRedemptionImplementation } from "~/services/apiService/newApiFamily/redemption"
import { AuthTypeEnum } from "~/types"

const { commonRedeemCode } = vi.hoisted(() => ({
  commonRedeemCode: vi.fn(),
}))

vi.mock("~/services/apiService/common", () => ({
  redeemCode: commonRedeemCode,
}))

const request = {
  baseUrl: "https://redeem.example.invalid",
  accountId: "account-1",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: "user-1",
    accessToken: "access-token",
  },
}

describe("newApiFamily redemption", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("uses common-compatible code redemption by default for New API-family sites", async () => {
    commonRedeemCode.mockResolvedValueOnce(500)

    const redemption = createRedemptionImplementation(SITE_TYPES.VELOERA)

    await expect(redemption.redeemCode(request, "example-code")).resolves.toBe(
      500,
    )

    expect(commonRedeemCode).toHaveBeenCalledOnce()
    expect(commonRedeemCode).toHaveBeenCalledWith(request, "example-code")
  })
})
