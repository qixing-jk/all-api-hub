import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  OctopusAutoGroupType,
  OctopusOutboundType,
  type OctopusChannel,
} from "~/types/octopus"

const mockGetPreferences = vi.fn()

vi.mock("~/services/userPreferences", () => ({
  userPreferences: {
    getPreferences: mockGetPreferences,
  },
}))

const mockListChannels = vi.fn()

vi.mock("~/services/apiService/octopus", () => ({
  listChannels: mockListChannels,
  searchChannels: vi.fn(),
  createChannel: vi.fn(),
  updateChannel: vi.fn(),
  deleteChannel: vi.fn(),
  fetchRemoteModels: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    loading: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
}))

describe("octopusService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("findMatchingChannel", () => {
    it("should refine match by key when keys are available", async () => {
      const { findMatchingChannel } = await import(
        "~/services/managedSites/providers/octopusService"
      )

      mockGetPreferences.mockResolvedValueOnce({
        octopus: {
          baseUrl: "https://octopus.example.com",
          username: "user",
          password: "pass",
        },
      })

      const channels: OctopusChannel[] = [
        {
          id: 1,
          name: "Channel A",
          type: OctopusOutboundType.OpenAIChat,
          enabled: true,
          base_urls: [{ url: "https://api.example.com/v1" }],
          keys: [{ enabled: true, channel_key: "sk-key-a" }],
          model: "gpt-4",
          proxy: false,
          auto_sync: true,
          auto_group: OctopusAutoGroupType.None,
        },
        {
          id: 2,
          name: "Channel B",
          type: OctopusOutboundType.OpenAIChat,
          enabled: true,
          base_urls: [{ url: "https://api.example.com/v1" }],
          keys: [{ enabled: true, channel_key: "sk-key-b" }],
          model: "gpt-4",
          proxy: false,
          auto_sync: true,
          auto_group: OctopusAutoGroupType.None,
        },
      ]

      mockListChannels.mockResolvedValueOnce(channels)

      const result = await findMatchingChannel(
        "https://octopus.example.com",
        "",
        "",
        "https://api.example.com",
        ["gpt-4"],
        "sk-key-b",
      )

      expect(result?.id).toBe(2)
    })

    it("should return null when key mismatches", async () => {
      const { findMatchingChannel } = await import(
        "~/services/managedSites/providers/octopusService"
      )

      mockGetPreferences.mockResolvedValueOnce({
        octopus: {
          baseUrl: "https://octopus.example.com",
          username: "user",
          password: "pass",
        },
      })

      mockListChannels.mockResolvedValueOnce([
        {
          id: 1,
          name: "Channel A",
          type: OctopusOutboundType.OpenAIChat,
          enabled: true,
          base_urls: [{ url: "https://api.example.com/v1" }],
          keys: [{ enabled: true, channel_key: "sk-key-a" }],
          model: "gpt-4",
          proxy: false,
          auto_sync: true,
          auto_group: OctopusAutoGroupType.None,
        } satisfies OctopusChannel,
      ])

      const result = await findMatchingChannel(
        "https://octopus.example.com",
        "",
        "",
        "https://api.example.com",
        ["gpt-4"],
        "sk-key-b",
      )

      expect(result).toBeNull()
    })
  })
})
