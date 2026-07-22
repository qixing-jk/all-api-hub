import { beforeEach, describe, expect, it, vi } from "vitest"

import { sharedChatInviteLink } from "~/services/apiAdapters/sharedchat/inviteLink"
import { AuthTypeEnum } from "~/types"

const { mockFetchInviteLink } = vi.hoisted(() => ({
  mockFetchInviteLink: vi.fn(),
}))

vi.mock("~/services/apiService/sharedchat", () => ({
  fetchInviteLink: mockFetchInviteLink,
}))

describe("sharedChatInviteLink", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("delegates invite-link loading to the SharedChat service", async () => {
    const abortController = new AbortController()
    const request = {
      baseUrl: "https://account.example.invalid",
      accountId: "account-1",
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "user-1",
        accessToken: "access-token",
        cookie: "session=placeholder",
      },
      abortSignal: abortController.signal,
    }
    const serviceResult =
      "https://account.example.invalid/register?aff=invite-code"
    mockFetchInviteLink.mockResolvedValueOnce(serviceResult)

    await expect(
      sharedChatInviteLink.fetchInviteLink({ request }),
    ).resolves.toBe(serviceResult)

    expect(mockFetchInviteLink).toHaveBeenCalledOnce()
    expect(mockFetchInviteLink).toHaveBeenCalledWith(request)
  })
})
