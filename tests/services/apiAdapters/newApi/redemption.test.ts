import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { createNewApiRedemption } from "~/services/apiAdapters/newApi/redemption"
import { AuthTypeEnum } from "~/types"

const {
  mockCreateRedemptionImplementation,
  mockGetApiService,
  mockRedeemCode,
} = vi.hoisted(() => ({
  mockCreateRedemptionImplementation: vi.fn(),
  mockGetApiService: vi.fn(() => {
    throw new Error("legacy apiService facade should not be used")
  }),
  mockRedeemCode: vi.fn(),
}))

vi.mock("~/services/apiService/newApiFamily", () => ({
  redemption: {
    createRedemptionImplementation: mockCreateRedemptionImplementation,
  },
}))

vi.mock("~/services/apiService", () => ({
  getApiService: mockGetApiService,
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
    mockCreateRedemptionImplementation.mockReturnValue({
      redeemCode: mockRedeemCode,
    })
  })

  it("delegates code redemption through the New API-family implementation", async () => {
    mockRedeemCode.mockResolvedValueOnce(500)

    const redemption = createNewApiRedemption(SITE_TYPES.VELOERA)

    await expect(
      redemption.redeem({
        request,
        code: "example-code",
      }),
    ).resolves.toBe(500)

    expect(mockCreateRedemptionImplementation).toHaveBeenCalledOnce()
    expect(mockCreateRedemptionImplementation).toHaveBeenCalledWith(
      SITE_TYPES.VELOERA,
    )
    expect(mockRedeemCode).toHaveBeenCalledOnce()
    expect(mockRedeemCode).toHaveBeenCalledWith(request, "example-code")
    expect(mockGetApiService).not.toHaveBeenCalled()
  })
})
