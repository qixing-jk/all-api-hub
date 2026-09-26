import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { RIGHTCODE_DISPLAY_NAME } from "~/services/accountSiteDefinitions/identifiers"
import { rightCodeAccountBootstrap } from "~/services/apiAdapters/rightcode/accountBootstrap"
import * as rightcodeApiService from "~/services/apiService/rightcode"
import { AuthTypeEnum } from "~/types"

vi.mock("~/services/apiService/rightcode", () => ({
  fetchRightCodePublicConfigs: vi.fn(),
  fetchSupportCheckIn: vi.fn(() => false),
  fetchUserInfo: vi.fn(),
  getOrCreateAccessToken: vi.fn(),
}))

const request = {
  baseUrl: "https://www.right.codes",
  auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
}

describe("rightCodeAccountBootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("delegates fetchUserInfo and getOrCreateAccessToken", async () => {
    vi.mocked(rightcodeApiService.fetchUserInfo).mockResolvedValueOnce({
      id: "7",
      username: "user",
      access_token: "token",
    })
    vi.mocked(rightcodeApiService.getOrCreateAccessToken).mockResolvedValueOnce(
      {
        username: "user",
        access_token: "token",
      },
    )

    await expect(
      rightCodeAccountBootstrap.fetchUserInfo(request),
    ).resolves.toEqual({
      id: "7",
      username: "user",
      access_token: "token",
    })
    await expect(
      rightCodeAccountBootstrap.getOrCreateAccessToken(request),
    ).resolves.toEqual({ username: "user", access_token: "token" })
  })

  it("loads bootstrap facts and parses default exchange rate from public configs", async () => {
    vi.mocked(
      rightcodeApiService.fetchRightCodePublicConfigs,
    ).mockResolvedValueOnce({
      "public.balance.price": "7.35",
    })

    const facts = await rightCodeAccountBootstrap.loadBootstrapFacts(request)
    expect(facts).toEqual({
      displayName: RIGHTCODE_DISPLAY_NAME,
      checkInSupported: false,
      defaultExchangeRate: 7.35,
    })

    // If config fetch fails, falls back gracefully without exchange rate
    vi.mocked(
      rightcodeApiService.fetchRightCodePublicConfigs,
    ).mockRejectedValueOnce(new Error("network error"))
    const fallbackFacts =
      await rightCodeAccountBootstrap.loadBootstrapFacts(request)
    expect(fallbackFacts).toEqual({
      displayName: RIGHTCODE_DISPLAY_NAME,
      checkInSupported: false,
    })
  })

  it("returns false for check-in support", async () => {
    vi.mocked(rightcodeApiService.fetchSupportCheckIn).mockResolvedValueOnce(
      false,
    )
    const result = await rightCodeAccountBootstrap.fetchCheckInSupport(
      request,
      {},
    )
    expect(result).toBe(false)
  })

  it("resolves static route paths for RightCode", async () => {
    const route = await rightCodeAccountBootstrap.resolveRoutePath(
      {
        siteType: SITE_TYPES.RIGHT_CODE,
        baseUrl: "https://www.right.codes",
      },
      "usage",
    )
    expect(route).toBe("/use-logs")
  })
})
