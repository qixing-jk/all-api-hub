import { describe, expect, it, vi } from "vitest"

import { voApiV2InviteLink } from "~/services/apiAdapters/voapiV2/inviteLink"
import { fetchInviteLink } from "~/services/apiService/voapiV2"
import { AuthTypeEnum } from "~/types"

vi.mock("~/services/apiService/voapiV2", () => ({
  fetchInviteLink: vi.fn(),
}))

describe("voApiV2InviteLink", () => {
  it("delegates invite-link loading to the VoAPI v2 service", async () => {
    vi.mocked(fetchInviteLink).mockResolvedValueOnce(
      "https://invite.example.invalid/join?code=canonical",
    )
    const request = {
      baseUrl: "https://example.invalid",
      accountId: "account-1",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "example-dashboard-token",
      },
    }

    await expect(voApiV2InviteLink.fetchInviteLink({ request })).resolves.toBe(
      "https://invite.example.invalid/join?code=canonical",
    )
    expect(fetchInviteLink).toHaveBeenCalledOnce()
    expect(fetchInviteLink).toHaveBeenCalledWith(request)
  })
})
