import { describe, expect, it, vi } from "vitest"

import { sub2ApiInviteLink } from "~/services/apiAdapters/sub2api/inviteLink"
import { AuthTypeEnum } from "~/types"

const { fetchInviteLinkMock } = vi.hoisted(() => ({
  fetchInviteLinkMock: vi.fn(),
}))

vi.mock("~/services/apiService/sub2api", () => ({
  fetchInviteLink: fetchInviteLinkMock,
}))

describe("sub2ApiInviteLink", () => {
  it("delegates invite-link loading to the Sub2API service", async () => {
    fetchInviteLinkMock.mockResolvedValueOnce(
      "https://sub2.example.invalid/register?aff=invite-code",
    )
    const request = {
      baseUrl: "https://sub2.example.invalid",
      accountId: "account-1",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "dashboard-jwt",
      },
    }

    await expect(sub2ApiInviteLink.fetchInviteLink({ request })).resolves.toBe(
      "https://sub2.example.invalid/register?aff=invite-code",
    )
    expect(fetchInviteLinkMock).toHaveBeenCalledOnce()
    expect(fetchInviteLinkMock).toHaveBeenCalledWith(request)
  })
})
