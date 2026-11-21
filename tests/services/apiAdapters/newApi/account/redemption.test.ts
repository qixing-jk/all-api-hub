import { beforeEach, describe, expect, it, vi } from "vitest"

import { createNewApiRedemption } from "~/services/apiAdapters/newApi/account/redemption"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
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
  directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
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

  it("reports the confirmed native USD grant without exposing internal quota units", async () => {
    mockRedeemCode.mockResolvedValueOnce(500)

    const redemption = createNewApiRedemption()

    await expect(
      redemption.redeem({
        request,
        code: "example-code",
      }),
    ).resolves.toMatchObject({
      awards: [
        {
          asset: { kind: "currency", code: "USD" },
          amount: {
            status: "known",
            value: "0.001",
            source: { adapter: "new-api", inputs: ["data"] },
          },
          scope: {
            subject: { kind: "account", accountId: "account-1" },
            authority: request.baseUrl,
          },
          fulfillment: "credited",
          target: "wallet",
          validity: { kind: "unknown" },
        },
      ],
    })

    expect(mockRedeemCode).toHaveBeenCalledOnce()
    expect(mockRedeemCode).toHaveBeenCalledWith(request, "example-code")
  })
})
