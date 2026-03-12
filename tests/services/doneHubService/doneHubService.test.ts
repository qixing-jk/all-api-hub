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
})
