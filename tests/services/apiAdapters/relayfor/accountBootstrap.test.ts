import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { ACCOUNT_BOOTSTRAP_ROUTE_KINDS } from "~/services/apiAdapters/contracts/accountBootstrap"
import { relayForAccountBootstrap } from "~/services/apiAdapters/relayfor/accountBootstrap"
import { fetchRelayForUserInfo } from "~/services/apiService/relayfor"
import { AuthTypeEnum } from "~/types"

vi.mock("~/services/apiService/relayfor", () => ({
  fetchRelayForUserInfo: vi.fn(),
}))

const request = {
  baseUrl: "https://relayfor.xyz",
  auth: { authType: AuthTypeEnum.AccessToken, accessToken: "test-token" },
}

describe("relayForAccountBootstrap", () => {
  it("fetches user info and formats access token", async () => {
    vi.mocked(fetchRelayForUserInfo).mockResolvedValueOnce({
      id: 5,
      username: "alice",
      quota: 500000,
      role: 1,
    })

    const userInfo = await relayForAccountBootstrap.fetchUserInfo(request)
    expect(userInfo).toMatchObject({
      id: "5",
      username: "alice",
      access_token: "test-token",
    })
  })

  it("loads bootstrap facts declaring checkInSupported and display name", async () => {
    const facts = await relayForAccountBootstrap.loadBootstrapFacts(request)
    expect(facts).toEqual({
      displayName: "RelayFor",
      checkInSupported: true,
      defaultExchangeRate: 7.2,
    })
  })

  it("reports check-in support", async () => {
    const support = await relayForAccountBootstrap.fetchCheckInSupport(
      request,
      {} as never,
    )
    expect(support).toBe(true)
  })

  it("resolves static route paths", async () => {
    const path = await relayForAccountBootstrap.resolveRoutePath(
      { baseUrl: "https://relayfor.xyz", siteType: SITE_TYPES.RELAYFOR },
      ACCOUNT_BOOTSTRAP_ROUTE_KINDS.Usage,
    )
    expect(path).toBe("/console/#usage")

    const checkInPath = await relayForAccountBootstrap.resolveRoutePath(
      { baseUrl: "https://relayfor.xyz", siteType: SITE_TYPES.RELAYFOR },
      ACCOUNT_BOOTSTRAP_ROUTE_KINDS.CheckIn,
    )
    expect(checkInPath).toBe("/console/#overview")
  })
})
