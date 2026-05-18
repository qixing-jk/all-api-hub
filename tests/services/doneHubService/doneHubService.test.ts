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

describe("doneHubService findMatchingChannel", () => {
  beforeEach(() => {
    mockFetchDoneHubChannel.mockReset()
    mockSearchChannel.mockReset()
  })

  it("fetches channel detail to compare the exact key when the list payload omits it", async () => {
    const { findMatchingChannel } = await import(
      "~/services/managedSites/providers/doneHubService"
    )

    mockSearchChannel.mockResolvedValueOnce({
      items: [
        buildManagedSiteChannel({
          id: 11,
          name: "Done Hub Channel 11",
          base_url: "https://api.example.com",
          models: "gpt-4o",
          key: "",
        }),
      ],
      total: 1,
      type_counts: {},
    })
    mockFetchDoneHubChannel.mockResolvedValueOnce(
      buildManagedSiteChannel({
        id: 11,
        name: "Done Hub Channel 11",
        base_url: "https://api.example.com",
        models: "gpt-4o",
        key: "test-token-key",
      }),
    )

    const result = await findMatchingChannel(
      "https://done-hub.example.com",
      "admin-token",
      "1",
      "https://api.example.com",
      ["gpt-4o"],
      "test-token-key",
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
      11,
    )
    expect(result).toMatchObject({
      id: 11,
      key: "test-token-key",
    })
  })

  it("returns the list candidate directly when key comparison is not requested", async () => {
    const { findMatchingChannel } = await import(
      "~/services/managedSites/providers/doneHubService"
    )

    mockSearchChannel.mockResolvedValueOnce({
      items: [
        buildManagedSiteChannel({
          id: 12,
          name: "Done Hub Channel 12",
          base_url: "https://api.example.com",
          models: "gpt-4o",
          key: "",
        }),
      ],
      total: 1,
      type_counts: {},
    })

    const result = await findMatchingChannel(
      "https://done-hub.example.com",
      "admin-token",
      "1",
      "https://api.example.com",
      ["gpt-4o"],
    )

    expect(mockFetchDoneHubChannel).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      id: 12,
      name: "Done Hub Channel 12",
    })
  })

  it("returns null when the detailed payload still does not match the key", async () => {
    const { findMatchingChannel } = await import(
      "~/services/managedSites/providers/doneHubService"
    )

    mockSearchChannel.mockResolvedValueOnce({
      items: [
        buildManagedSiteChannel({
          id: 13,
          name: "Done Hub Channel 13",
          base_url: "https://api.example.com",
          models: "gpt-4o",
          key: "",
        }),
      ],
      total: 1,
      type_counts: {},
    })
    mockFetchDoneHubChannel.mockResolvedValueOnce(
      buildManagedSiteChannel({
        id: 13,
        name: "Done Hub Channel 13",
        base_url: "https://api.example.com",
        models: "gpt-4o",
        key: "different-token-key",
      }),
    )

    const result = await findMatchingChannel(
      "https://done-hub.example.com",
      "admin-token",
      "1",
      "https://api.example.com",
      ["gpt-4o"],
      "target-token-key",
    )

    expect(result).toBeNull()
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
