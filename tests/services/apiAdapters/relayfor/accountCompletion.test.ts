import { beforeEach, describe, expect, it, vi } from "vitest"

import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { SITE_TYPES } from "~/constants/siteType"
import { relayForAccountBootstrap } from "~/services/apiAdapters/relayfor/accountBootstrap"
import { relayForAccountCompletion } from "~/services/apiAdapters/relayfor/accountCompletion"
import { AuthTypeEnum } from "~/types"
import { createAccountCompletionHelpersMock } from "~~/tests/services/apiAdapters/checkInFixtures"

vi.mock("~/services/apiAdapters/relayfor/accountBootstrap", () => ({
  relayForAccountBootstrap: {
    fetchUserInfo: vi.fn(),
    loadBootstrapFacts: vi.fn(),
    fetchCheckInSupport: vi.fn(),
  },
}))

const { helpers, captureRecoveryData } = createAccountCompletionHelpersMock(
  SITE_TYPES.RELAYFOR,
  {
    automaticExecutionEnabled: true,
    isCheckedInToday: false,
  },
)

describe("relayForAccountCompletion", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("throws AccessTokenMissing when no candidate token exists", async () => {
    await expect(
      relayForAccountCompletion.complete(
        {
          url: "https://relayfor.xyz",
          requestedAuthType: AuthTypeEnum.AccessToken,
          detected: {
            userId: "1",
            user: {},
            siteType: SITE_TYPES.RELAYFOR,
          },
          context: {},
        },
        helpers,
      ),
    ).rejects.toMatchObject({
      reason: AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
    })
  })

  it("throws TokenFetchFailed when fetchUserInfo throws", async () => {
    vi.mocked(relayForAccountBootstrap.fetchUserInfo).mockRejectedValueOnce(
      new Error("Network error"),
    )

    await expect(
      relayForAccountCompletion.complete(
        {
          url: "https://relayfor.xyz",
          requestedAuthType: AuthTypeEnum.AccessToken,
          detected: {
            userId: "1",
            user: { username: "user" },
            accessToken: "token-123",
            siteType: SITE_TYPES.RELAYFOR,
          },
          context: {},
        },
        helpers,
      ),
    ).rejects.toMatchObject({
      reason: AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
    })
  })

  it("completes detection and returns verified account record", async () => {
    vi.mocked(relayForAccountBootstrap.fetchUserInfo).mockResolvedValueOnce({
      id: "10",
      username: "relayuser",
      access_token: "token-123",
    })
    vi.mocked(
      relayForAccountBootstrap.loadBootstrapFacts,
    ).mockResolvedValueOnce({
      displayName: "RelayFor",
      checkInSupported: true,
      defaultExchangeRate: 7.2,
    })
    vi.mocked(
      relayForAccountBootstrap.fetchCheckInSupport,
    ).mockResolvedValueOnce(true)

    const result = await relayForAccountCompletion.complete(
      {
        url: "https://relayfor.xyz",
        requestedAuthType: AuthTypeEnum.AccessToken,
        detected: {
          userId: "10",
          user: { username: "relayuser" },
          accessToken: "token-123",
          siteType: SITE_TYPES.RELAYFOR,
        },
        context: {},
      },
      helpers,
    )

    expect(result).toMatchObject({
      username: "relayuser",
      siteName: "RelayFor",
      accessToken: "token-123",
      userId: "10",
      exchangeRate: 7.2,
      authType: AuthTypeEnum.AccessToken,
    })
    expect(captureRecoveryData).toHaveBeenCalledWith({ exchangeRate: 7.2 })
  })
})
