import { beforeEach, describe, expect, it, vi } from "vitest"

import { buildManagedSiteChannel } from "~~/tests/test-utils/factories"

const mockSearchChannel = vi.fn()
const mockFetchDoneHubChannel = vi.fn()

vi.mock("~/services/apiService", () => ({
  getApiService: vi.fn(() => ({
    searchChannel: mockSearchChannel,
  })),
}))

vi.mock("~/services/apiService/doneHub", () => ({
  fetchChannel: (...args: unknown[]) => mockFetchDoneHubChannel(...args),
}))

describe("doneHubService hydrateComparableChannelKeys", () => {
  beforeEach(() => {
    mockFetchDoneHubChannel.mockReset()
    mockSearchChannel.mockReset()
  })

  it("fetches the full channel key from channel detail", async () => {
    const { fetchChannelSecretKey } = await import(
      "~/services/managedSites/providers/doneHubService"
    )

    mockFetchDoneHubChannel.mockResolvedValueOnce(
      buildManagedSiteChannel({
        id: 21,
        key: "sk-done-hub-channel-key",
      }),
    )

    const result = await fetchChannelSecretKey(
      "https://done-hub.example.com",
      "admin-token",
      "1",
      21,
    )

    expect(mockFetchDoneHubChannel).toHaveBeenCalledWith(
      {
        baseUrl: "https://done-hub.example.com",
        auth: {
          authType: "access_token",
          accessToken: "admin-token",
          userId: "1",
        },
      },
      21,
    )
    expect(result).toBe("sk-done-hub-channel-key")
  })

  it("hydrates hidden keys only for provided Done Hub candidates while preserving candidate data", async () => {
    const { hydrateComparableChannelKeys } = await import(
      "~/services/managedSites/providers/doneHubService"
    )

    mockFetchDoneHubChannel.mockResolvedValueOnce(
      buildManagedSiteChannel({
        id: 20,
        base_url: "https://detail.example.com",
        key: "sk-detail",
        name: "Detailed Done Hub Channel",
        models: "detail-model",
      }),
    )

    const result = await hydrateComparableChannelKeys(
      "https://donehub.example.com",
      "admin-token",
      1,
      [
        buildManagedSiteChannel({
          id: 20,
          base_url: "https://candidate.example.com",
          key: "",
          name: "Candidate Done Hub Channel",
          models: "candidate-model",
        }),
        buildManagedSiteChannel({ id: 21, key: "sk-visible" }),
      ],
    )

    expect(mockFetchDoneHubChannel).toHaveBeenCalledTimes(1)
    expect(mockFetchDoneHubChannel).toHaveBeenCalledWith(expect.any(Object), 20)
    expect(result).toEqual([
      expect.objectContaining({
        id: 20,
        base_url: "https://candidate.example.com",
        key: "sk-detail",
        name: "Candidate Done Hub Channel",
        models: "candidate-model",
      }),
      expect.objectContaining({ id: 21, key: "sk-visible" }),
    ])
  })

  it("maps Done Hub detail payloads without usable keys to unresolved key resolution", async () => {
    const { hydrateComparableChannelKeys } = await import(
      "~/services/managedSites/providers/doneHubService"
    )
    const { MatchResolutionUnresolvedError } = await import(
      "~/services/managedSites/channelMatch"
    )

    mockFetchDoneHubChannel.mockResolvedValueOnce(
      buildManagedSiteChannel({
        id: 22,
        key: "   ",
      }),
    )

    await expect(
      hydrateComparableChannelKeys(
        "https://donehub.example.com",
        "admin-token",
        1,
        [buildManagedSiteChannel({ id: 22, key: "" })],
      ),
    ).rejects.toBeInstanceOf(MatchResolutionUnresolvedError)
  })
})
