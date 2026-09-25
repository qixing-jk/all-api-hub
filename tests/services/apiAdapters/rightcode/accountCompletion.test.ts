import { beforeEach, describe, expect, it, vi } from "vitest"

import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { SITE_TYPES } from "~/constants/siteType"
import { rightCodeAccountBootstrap } from "~/services/apiAdapters/rightcode/accountBootstrap"
import { rightCodeAccountCompletion } from "~/services/apiAdapters/rightcode/accountCompletion"
import { AuthTypeEnum } from "~/types"

import { createAccountCompletionHelpersMock } from "../checkInFixtures"

vi.mock("~/services/apiAdapters/rightcode/accountBootstrap", () => ({
  rightCodeAccountBootstrap: {
    fetchUserInfo: vi.fn(),
    loadBootstrapFacts: vi.fn(),
    fetchCheckInSupport: vi.fn(),
  },
}))

const { helpers, captureRecoveryData } = createAccountCompletionHelpersMock(
  SITE_TYPES.RIGHT_CODE,
  {
    automaticExecutionEnabled: false,
    isCheckedInToday: false,
  },
)

describe("rightCodeAccountCompletion", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("throws AccessTokenMissing when no candidate token exists", async () => {
    await expect(
      rightCodeAccountCompletion.complete(
        {
          url: "https://www.right.codes",
          requestedAuthType: AuthTypeEnum.AccessToken,
          detected: {
            userId: "1",
            user: {},
            siteType: SITE_TYPES.RIGHT_CODE,
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
    vi.mocked(rightCodeAccountBootstrap.fetchUserInfo).mockRejectedValueOnce(
      new Error("Network error"),
    )

    await expect(
      rightCodeAccountCompletion.complete(
        {
          url: "https://www.right.codes",
          requestedAuthType: AuthTypeEnum.AccessToken,
          detected: {
            userId: "1",
            user: { username: "user" },
            accessToken: "token-123",
            siteType: SITE_TYPES.RIGHT_CODE,
          },
          context: {},
        },
        helpers,
      ),
    ).rejects.toMatchObject({
      reason: AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
    })
  })

  it("throws UsernameMissing when username is empty", async () => {
    vi.mocked(rightCodeAccountBootstrap.fetchUserInfo).mockResolvedValueOnce({
      id: "7",
      username: "",
      access_token: "token-123",
    })

    await expect(
      rightCodeAccountCompletion.complete(
        {
          url: "https://www.right.codes",
          requestedAuthType: AuthTypeEnum.AccessToken,
          detected: {
            userId: "7",
            user: {},
            accessToken: "token-123",
            siteType: SITE_TYPES.RIGHT_CODE,
          },
          context: {},
        },
        helpers,
      ),
    ).rejects.toMatchObject({
      reason: AUTO_DETECT_FAILURE_REASONS.UsernameMissing,
    })
  })

  it("throws AccessTokenMissing when returned access token is empty", async () => {
    vi.mocked(rightCodeAccountBootstrap.fetchUserInfo).mockResolvedValueOnce({
      id: "7",
      username: "user",
      access_token: "",
    })

    await expect(
      rightCodeAccountCompletion.complete(
        {
          url: "https://www.right.codes",
          requestedAuthType: AuthTypeEnum.AccessToken,
          detected: {
            userId: "7",
            user: {},
            accessToken: "token-123",
            siteType: SITE_TYPES.RIGHT_CODE,
          },
          context: {},
        },
        helpers,
      ),
    ).rejects.toMatchObject({
      reason: AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
    })
  })

  it("throws SiteStatusFetchFailed when loadBootstrapFacts throws", async () => {
    vi.mocked(rightCodeAccountBootstrap.fetchUserInfo).mockResolvedValueOnce({
      id: "7",
      username: "user",
      access_token: "token-123",
    })
    vi.mocked(
      rightCodeAccountBootstrap.loadBootstrapFacts,
    ).mockRejectedValueOnce(new Error("config failed"))

    await expect(
      rightCodeAccountCompletion.complete(
        {
          url: "https://www.right.codes",
          requestedAuthType: AuthTypeEnum.AccessToken,
          detected: {
            userId: "7",
            user: {},
            accessToken: "token-123",
            siteType: SITE_TYPES.RIGHT_CODE,
          },
          context: {},
        },
        helpers,
      ),
    ).rejects.toMatchObject({
      reason: AUTO_DETECT_FAILURE_REASONS.SiteStatusFetchFailed,
    })
  })

  it("completes successfully and maps all fields", async () => {
    vi.mocked(rightCodeAccountBootstrap.fetchUserInfo).mockResolvedValueOnce({
      id: "7",
      username: "rc-user",
      access_token: "rc-token",
    })
    vi.mocked(
      rightCodeAccountBootstrap.loadBootstrapFacts,
    ).mockResolvedValueOnce({
      displayName: "Right Code",
      checkInSupported: false,
      defaultExchangeRate: 7.2,
    })
    vi.mocked(
      rightCodeAccountBootstrap.fetchCheckInSupport,
    ).mockResolvedValueOnce(false)

    const result = await rightCodeAccountCompletion.complete(
      {
        url: "https://www.right.codes",
        requestedAuthType: AuthTypeEnum.AccessToken,
        detected: {
          userId: "7",
          user: { username: "rc-user" },
          accessToken: "rc-token",
          siteType: SITE_TYPES.RIGHT_CODE,
        },
        context: {},
      },
      helpers,
    )

    expect(result).toMatchObject({
      username: "rc-user",
      accessToken: "rc-token",
      userId: "7",
      exchangeRate: 7.2,
      authType: AuthTypeEnum.AccessToken,
    })
    expect(captureRecoveryData).toHaveBeenCalled()
  })
})
