import { beforeEach, describe, expect, it, vi } from "vitest"

import { createNewApiRedemption } from "~/services/apiAdapters/newApi/redemption"
import { AuthTypeEnum } from "~/types"

const { mockRedeemCode } = vi.hoisted(() => ({
  mockRedeemCode: vi.fn(),
}))

vi.mock("~/services/apiService/newApiFamily/default/redemption", () => ({
  defaultRedemptionImplementation: {
    redeemCode: mockRedeemCode,
  },
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

describe("createNewApiRedemption", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("delegates code redemption through the New API-family implementation", async () => {
    mockRedeemCode.mockResolvedValueOnce(500)

    const redemption = createNewApiRedemption()

    await expect(
      redemption.redeem({
        request,
        code: "example-code",
      }),
    ).resolves.toBe(500)

    expect(mockRedeemCode).toHaveBeenCalledOnce()
    expect(mockRedeemCode).toHaveBeenCalledWith(request, "example-code")
  })
})
