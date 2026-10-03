import { beforeEach, describe, expect, it, vi } from "vitest"

import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { SITE_TYPES } from "~/constants/siteType"
import { grsaiAccountBootstrap } from "~/services/apiAdapters/grsai/accountBootstrap"
import { grsaiAccountCompletion } from "~/services/apiAdapters/grsai/accountCompletion"
import { AuthTypeEnum } from "~/types"

import { createAccountCompletionHelpersMock } from "../checkInFixtures"

vi.mock("~/services/apiAdapters/grsai/accountBootstrap", () => ({
  grsaiAccountBootstrap: {
    fetchUserInfo: vi.fn(),
    loadBootstrapFacts: vi.fn(),
    fetchCheckInSupport: vi.fn(),
  },
}))

const request = {
  url: "https://grsai.com",
  requestedAuthType: AuthTypeEnum.AccessToken,
  detected: {
    userId: "account-id",
    user: {},
    siteType: SITE_TYPES.GRSAI,
    accessToken: "stored",
  },
  context: {},
}
const { helpers, captureRecoveryData } = createAccountCompletionHelpersMock(
  SITE_TYPES.GRSAI,
  { automaticExecutionEnabled: false, isCheckedInToday: false },
)

describe("Grsai account completion", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(grsaiAccountBootstrap.fetchUserInfo).mockResolvedValue({
      id: "account-id",
      username: "mail@example.invalid",
      access_token: "rotated",
    })
    vi.mocked(grsaiAccountBootstrap.loadBootstrapFacts).mockResolvedValue({
      displayName: "Grsai",
      defaultExchangeRate: 6.66,
    })
    vi.mocked(grsaiAccountBootstrap.fetchCheckInSupport).mockResolvedValue(
      false,
    )
  })

  it("saves verified identity, rotated session and exchange rate", async () => {
    const result = await grsaiAccountCompletion.complete(request, helpers)
    expect(result).toMatchObject({
      userId: "account-id",
      username: "mail@example.invalid",
      accessToken: "rotated",
      exchangeRate: 6.66,
      authType: AuthTypeEnum.AccessToken,
    })
    expect(captureRecoveryData).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "rotated" }),
    )
    expect(result.checkIn.automaticExecutionEnabled).toBe(false)
  })

  it("uses an existing token when detection has no token", async () => {
    await grsaiAccountCompletion.complete(
      {
        ...request,
        existingAccessToken: "existing",
        detected: { ...request.detected, accessToken: "" },
      },
      helpers,
    )
    expect(grsaiAccountBootstrap.fetchUserInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({ accessToken: "existing" }),
      }),
    )
  })

  it("reports a missing candidate token", async () => {
    await expect(
      grsaiAccountCompletion.complete(
        { ...request, detected: { ...request.detected, accessToken: "" } },
        helpers,
      ),
    ).rejects.toMatchObject({
      reason: AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
    })
    expect(grsaiAccountBootstrap.fetchUserInfo).not.toHaveBeenCalled()
  })

  it.each([
    ["", "rotated", AUTO_DETECT_FAILURE_REASONS.UsernameMissing],
    [
      "mail@example.invalid",
      "",
      AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
    ],
  ])(
    "reports incomplete verified identity %s / %s",
    async (username, access_token, reason) => {
      vi.mocked(grsaiAccountBootstrap.fetchUserInfo).mockResolvedValue({
        id: "id",
        username,
        access_token,
      })
      await expect(
        grsaiAccountCompletion.complete(request, helpers),
      ).rejects.toMatchObject({ reason })
    },
  )

  it("classifies identity request failures", async () => {
    vi.mocked(grsaiAccountBootstrap.fetchUserInfo).mockRejectedValue(
      new Error("offline"),
    )
    await expect(
      grsaiAccountCompletion.complete(request, helpers),
    ).rejects.toMatchObject({
      reason: AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
    })
  })

  it("retains recovered credentials when bootstrap facts fail", async () => {
    vi.mocked(grsaiAccountBootstrap.loadBootstrapFacts).mockRejectedValue(
      new Error("offline"),
    )
    await expect(
      grsaiAccountCompletion.complete(request, helpers),
    ).rejects.toMatchObject({
      reason: AUTO_DETECT_FAILURE_REASONS.SiteStatusFetchFailed,
    })
    expect(captureRecoveryData).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "rotated" }),
    )
  })
})
