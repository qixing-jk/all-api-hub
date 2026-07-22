import { beforeEach, describe, expect, it, vi } from "vitest"

import { aihubmixInviteLink } from "~/services/apiAdapters/aihubmix/inviteLink"
import { AuthTypeEnum } from "~/types"

const { mockFetchInviteLink } = vi.hoisted(() => ({
  mockFetchInviteLink: vi.fn(),
}))

vi.mock("~/services/apiService/aihubmix", () => ({
  fetchInviteLink: mockFetchInviteLink,
}))

describe("aihubmixInviteLink", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("delegates invite-link loading to the AIHubMix service", async () => {
    const abortController = new AbortController()
    const request = {
      baseUrl: "https://account.example.invalid",
      accountId: "account-1",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: "user-1",
        accessToken: "access-token",
      },
      abortSignal: abortController.signal,
    }
    const serviceResult =
      "https://account.example.invalid/register?aff=invite-code"
    mockFetchInviteLink.mockResolvedValueOnce(serviceResult)

    await expect(aihubmixInviteLink.fetchInviteLink({ request })).resolves.toBe(
      serviceResult,
    )

    expect(mockFetchInviteLink).toHaveBeenCalledOnce()
    expect(mockFetchInviteLink).toHaveBeenCalledWith(request)
  })
})
