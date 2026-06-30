import { beforeEach, describe, expect, it, vi } from "vitest"

import { defaultRedemptionImplementation } from "~/services/apiService/newApiFamily/default/redemption"
import { AuthTypeEnum } from "~/types"

const { fetchApiDataMock, loggerErrorMock } = vi.hoisted(() => ({
  fetchApiDataMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}))

vi.mock("~/services/apiTransport/request", () => ({
  fetchApiData: fetchApiDataMock,
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => ({
    error: loggerErrorMock,
  }),
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

  it("redeems codes through the top-up endpoint", async () => {
    fetchApiDataMock.mockResolvedValueOnce(500)

    const redemption = defaultRedemptionImplementation

    await expect(redemption.redeemCode(request, "example-code")).resolves.toBe(
      500,
    )

    expect(fetchApiDataMock).toHaveBeenCalledWith(request, {
      endpoint: "/api/user/topup",
      options: {
        method: "POST",
        body: JSON.stringify({ key: "example-code" }),
      },
    })
  })

  it("rethrows redemption endpoint failures", async () => {
    const error = new Error("redeem unavailable")
    fetchApiDataMock.mockRejectedValueOnce(error)

    await expect(
      defaultRedemptionImplementation.redeemCode(request, "example-code"),
    ).rejects.toBe(error)
    expect(loggerErrorMock).toHaveBeenCalledWith("兑换码充值失败", error)
  })
})
