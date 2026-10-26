import { beforeEach, describe, expect, it, vi } from "vitest"

import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { SITE_TYPES } from "~/constants/siteType"
import { requestyAccountBootstrap } from "~/services/apiAdapters/requesty/account/accountBootstrap"
import { requestyAccountCompletion } from "~/services/apiAdapters/requesty/account/accountCompletion"
import { AuthTypeEnum } from "~/types"
import { createAccountCompletionHelpersMock } from "~~/tests/services/apiAdapters/checkInFixtures"

vi.mock("~/services/apiAdapters/requesty/account/accountBootstrap", () => ({
  requestyAccountBootstrap: {
    fetchUserInfo: vi.fn(),
    loadBootstrapFacts: vi.fn(),
    fetchCheckInSupport: vi.fn(),
    getOrCreateAccessToken: vi.fn(),
    resolveRoutePath: vi.fn(),
  },
}))

const { helpers, captureRecoveryData, createServiceRequest } =
  createAccountCompletionHelpersMock(SITE_TYPES.REQUESTY, {
    automaticExecutionEnabled: false,
  })

const detected = {
  userId: "requesty:org",
  user: { username: "Engineering" },
  accessToken: "rqsty-manage-key",
  siteType: SITE_TYPES.REQUESTY,
}

/** Runs completion against the given bootstrap facts. */
function complete(overrides: Record<string, unknown> = {}) {
  return requestyAccountCompletion.complete(
    {
      url: "https://app.requesty.ai",
      requestedAuthType: AuthTypeEnum.AccessToken,
      detected,
      context: {},
      ...overrides,
    },
    helpers,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requestyAccountBootstrap.loadBootstrapFacts).mockResolvedValue({
    displayName: "Requesty",
    checkInSupported: false,
    defaultExchangeRate: 7.2,
  } as never)
})

describe("requestyAccountCompletion", () => {
  it("completes detection from the organization identity", async () => {
    vi.mocked(requestyAccountBootstrap.fetchUserInfo).mockResolvedValue({
      username: "Engineering",
      id: "requesty:org",
      access_token: "rqsty-manage-key",
    } as never)

    await expect(complete()).resolves.toMatchObject({
      username: "Engineering",
      siteName: "Requesty",
      accessToken: "rqsty-manage-key",
      userId: "requesty:org",
      exchangeRate: 7.2,
      authType: AuthTypeEnum.AccessToken,
    })
    expect(createServiceRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://app.requesty.ai",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "rqsty-manage-key",
        },
      }),
    )
    expect(captureRecoveryData).toHaveBeenCalledWith({
      username: "Engineering",
      accessToken: "rqsty-manage-key",
      authType: AuthTypeEnum.AccessToken,
    })
  })

  it("falls back to the existing credential when detection found none", async () => {
    vi.mocked(requestyAccountBootstrap.fetchUserInfo).mockResolvedValue({
      username: "Engineering",
      id: "requesty:org",
      access_token: "rqsty-existing",
    } as never)

    await complete({
      detected: { ...detected, accessToken: "" },
      existingAccessToken: "  rqsty-existing  ",
    })

    expect(createServiceRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({ accessToken: "rqsty-existing" }),
      }),
    )
  })

  it("refuses to complete without any management credential", async () => {
    await expect(
      complete({ detected: { ...detected, accessToken: "" } }),
    ).rejects.toMatchObject({
      reason: AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
    })
    expect(requestyAccountBootstrap.fetchUserInfo).not.toHaveBeenCalled()
  })

  it("reports an unreadable identity as a token failure", async () => {
    vi.mocked(requestyAccountBootstrap.fetchUserInfo).mockRejectedValue(
      new Error("401"),
    )

    await expect(complete()).rejects.toMatchObject({
      reason: AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
    })
  })

  it.each([
    [
      "an identity without an organization name",
      { username: "", id: "requesty:org", access_token: "rqsty-manage-key" },
      AUTO_DETECT_FAILURE_REASONS.UsernameMissing,
    ],
    [
      "an identity without a credential",
      { username: "Engineering", id: "requesty:org", access_token: "" },
      AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
    ],
  ])("rejects %s", async (_label, userInfo, reason) => {
    vi.mocked(requestyAccountBootstrap.fetchUserInfo).mockResolvedValue(
      userInfo as never,
    )

    await expect(
      complete({ detected: { ...detected, user: {} } }),
    ).rejects.toMatchObject({ reason })
    // Recovery data is captured before validation so the pasted key survives.
    expect(captureRecoveryData).toHaveBeenCalledWith(
      expect.objectContaining({ authType: AuthTypeEnum.AccessToken }),
    )
  })

  it("reports unreadable bootstrap facts without losing the identity", async () => {
    vi.mocked(requestyAccountBootstrap.fetchUserInfo).mockResolvedValue({
      username: "Engineering",
      id: "requesty:org",
      access_token: "rqsty-manage-key",
    } as never)
    vi.mocked(requestyAccountBootstrap.loadBootstrapFacts).mockRejectedValue(
      new Error("offline"),
    )

    await expect(complete()).rejects.toMatchObject({
      reason: AUTO_DETECT_FAILURE_REASONS.SiteStatusFetchFailed,
    })
    expect(captureRecoveryData).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "rqsty-manage-key" }),
    )
  })

  it("uses the detected display name when the organization has none", async () => {
    vi.mocked(requestyAccountBootstrap.fetchUserInfo).mockResolvedValue({
      username: "",
      id: "requesty:org",
      access_token: "rqsty-manage-key",
    } as never)

    await expect(complete()).resolves.toMatchObject({
      username: "Engineering",
    })
  })
})
