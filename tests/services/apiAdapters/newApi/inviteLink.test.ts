import { beforeEach, describe, expect, it, vi } from "vitest"

import { createNewApiInviteLink } from "~/services/apiAdapters/newApi/inviteLink"
import { AuthTypeEnum } from "~/types"

const { mockFetchInviteLink } = vi.hoisted(() => ({
  mockFetchInviteLink: vi.fn(),
}))

vi.mock("~/services/apiService/newApiFamily/default/inviteLink", () => ({
  defaultInviteLinkImplementation: {
    fetchInviteLink: mockFetchInviteLink,
  },
}))

const request = {
  baseUrl: "https://invite.example.invalid",
  accountId: "account-1",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: "user-1",
    accessToken: "access-token",
  },
}

describe("createNewApiInviteLink", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("delegates invite-link loading through the New API-family implementation", async () => {
    mockFetchInviteLink.mockResolvedValueOnce(
      "https://invite.example.invalid/register?aff=invite-code",
    )

    const inviteLink = createNewApiInviteLink()

    await expect(
      inviteLink.fetchInviteLink({
        request,
      }),
    ).resolves.toBe("https://invite.example.invalid/register?aff=invite-code")

    expect(mockFetchInviteLink).toHaveBeenCalledOnce()
    expect(mockFetchInviteLink).toHaveBeenCalledWith(request)
  })
})
