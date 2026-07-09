import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  buildInviteLink,
  defaultInviteLinkImplementation,
} from "~/services/apiService/newApiFamily/default/inviteLink"
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
  baseUrl: "https://invite.example.invalid/console/account",
  accountId: "account-1",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: "user-1",
    accessToken: "access-token",
  },
}

describe("newApiFamily inviteLink", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("builds invite links against the site origin register route", () => {
    expect(
      buildInviteLink("https://invite.example.invalid/console/account", "abc"),
    ).toBe("https://invite.example.invalid/register?aff=abc")
  })

  it("fetches affiliate codes through the user aff endpoint", async () => {
    fetchApiDataMock.mockResolvedValueOnce("invite-code")

    await expect(
      defaultInviteLinkImplementation.fetchInviteLink(request),
    ).resolves.toBe("https://invite.example.invalid/register?aff=invite-code")

    expect(fetchApiDataMock).toHaveBeenCalledWith(request, {
      endpoint: "/api/user/aff",
    })
  })

  it("rejects blank affiliate codes", async () => {
    fetchApiDataMock.mockResolvedValueOnce("   ")

    await expect(
      defaultInviteLinkImplementation.fetchInviteLink(request),
    ).rejects.toThrow("invite_link_code_missing")
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "获取邀请链接失败",
      expect.any(Error),
    )
  })
})
