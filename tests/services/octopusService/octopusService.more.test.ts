import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  OctopusAutoGroupType,
  OctopusOutboundType,
  type OctopusChannel,
} from "~/types/octopus"
import {
  buildApiToken,
  buildDisplaySiteData,
} from "~~/tests/test-utils/factories"

const {
  mockGetPreferences,
  mockListChannels,
  mockSearchChannels,
  mockCreateChannelApi,
  mockUpdateChannelApi,
  mockDeleteChannelApi,
  mockFetchGroups,
  mockFetchOctopusAvailableModels,
  mockFetchTokenScopedModels,
  mockFetchManagedSiteAvailableModels,
} = vi.hoisted(() => ({
  mockGetPreferences: vi.fn(),
  mockListChannels: vi.fn(),
  mockSearchChannels: vi.fn(),
  mockCreateChannelApi: vi.fn(),
  mockUpdateChannelApi: vi.fn(),
  mockDeleteChannelApi: vi.fn(),
  mockFetchGroups: vi.fn(),
  mockFetchOctopusAvailableModels: vi.fn(),
  mockFetchTokenScopedModels: vi.fn(),
  mockFetchManagedSiteAvailableModels: vi.fn(),
}))

const octopusChannelFixture: OctopusChannel = {
  id: 1,
  name: " Octopus Channel ",
  type: OctopusOutboundType.Gemini,
  enabled: true,
  base_urls: [{ url: "https://proxy.example.com/v1" }],
  keys: [{ enabled: true, channel_key: "octo-key" }],
  model: "gemini-2.5-pro",
  proxy: false,
  auto_sync: true,
  auto_group: OctopusAutoGroupType.None,
}

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: {
    getPreferences: mockGetPreferences,
  },
}))

vi.mock("~/services/apiService/octopus", () => ({
  listChannels: mockListChannels,
  searchChannels: mockSearchChannels,
  createChannel: mockCreateChannelApi,
  updateChannel: mockUpdateChannelApi,
  deleteChannel: mockDeleteChannelApi,
  fetchGroups: mockFetchGroups,
  fetchAvailableModels: mockFetchOctopusAvailableModels,
  fetchRemoteModels: vi.fn(),
}))

vi.mock("~/services/managedSites/utils/fetchTokenScopedModels", () => ({
  fetchTokenScopedModels: mockFetchTokenScopedModels,
}))

vi.mock(
  "~/services/managedSites/utils/fetchManagedSiteAvailableModels",
  () => ({
    fetchManagedSiteAvailableModels: mockFetchManagedSiteAvailableModels,
  }),
)

describe("octopus additional flows", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    mockGetPreferences.mockResolvedValue({
      octopus: {
        baseUrl: "https://octopus.example.com",
        username: "octo-user",
        password: "octo-pass",
      },
    })
    mockCreateChannelApi.mockResolvedValue({
      success: true,
      data: octopusChannelFixture,
      message: "created",
    })
    mockUpdateChannelApi.mockResolvedValue({
      success: true,
      data: {
        ...octopusChannelFixture,
        name: "Updated Octopus Channel",
        enabled: false,
        model: "claude-3.7-sonnet",
      },
      message: "updated",
    })
    mockDeleteChannelApi.mockResolvedValue({
      success: true,
      data: null,
      message: "deleted",
    })
    mockFetchTokenScopedModels.mockResolvedValue({
      models: ["gpt-4o", "claude-3"],
      fetchFailed: false,
    })
    mockFetchManagedSiteAvailableModels.mockResolvedValue(["gpt-4o-mini"])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("normalizes Octopus base URLs", async () => {
    const { buildOctopusBaseUrl } = await import(
      "~/services/managedSites/providers/octopus"
    )

    expect(buildOctopusBaseUrl("https://api.example.com///")).toBe(
      "https://api.example.com/v1",
    )
    expect(buildOctopusBaseUrl("https://api.example.com/v1")).toBe(
      "https://api.example.com/v1",
    )
  })

  it("prepares Octopus channel form data with a normalized /v1 base URL", async () => {
    const { prepareChannelFormData } = await import(
      "~/services/managedSites/providers/octopus"
    )
    const account = buildDisplaySiteData({
      name: "Octopus Site",
      baseUrl: "https://proxy.example.com",
    })
    const token = buildApiToken({
      key: "octo-key",
      name: "Primary Token",
    })

    const result = await prepareChannelFormData(account, token)

    expect(result).toMatchObject({
      name: "Octopus Site | Primary Token (auto)",
      key: "octo-key",
      base_url: "https://proxy.example.com/v1",
      models: ["gpt-4o", "claude-3"],
      groups: ["default"],
      status: 1,
    })
  })

  it("uses the AIHubMix API origin before appending the Octopus /v1 suffix", async () => {
    const { prepareChannelFormData } = await import(
      "~/services/managedSites/providers/octopus"
    )
    const account = buildDisplaySiteData({
      siteType: SITE_TYPES.AIHUBMIX,
      name: "AIHubMix",
      baseUrl: "https://console.aihubmix.com",
    })
    const token = buildApiToken({
      key: "octo-aihubmix-key",
      name: "AIHubMix Token",
    })

    const result = await prepareChannelFormData(account, token)

    expect(mockFetchTokenScopedModels).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://aihubmix.com",
      }),
      token,
    )
    expect(result.base_url).toBe("https://aihubmix.com/v1")
  })

  it("marks Octopus model-prefill failures while keeping the normalized base URL", async () => {
    const { prepareChannelFormData } = await import(
      "~/services/managedSites/providers/octopus"
    )
    mockFetchTokenScopedModels.mockResolvedValueOnce({
      models: ["gpt-4o"],
      fetchFailed: true,
    })

    const result = await prepareChannelFormData(
      buildDisplaySiteData({ baseUrl: "https://proxy.example.com/" }),
      buildApiToken({ key: "octo-key" }),
    )

    expect(result.base_url).toBe("https://proxy.example.com/v1")
    expect(result.modelPrefillFetchFailed).toBe(true)
  })

  it("returns config helper fallbacks when Octopus preferences are missing or unreadable", async () => {
    const { checkValidOctopusConfig, getOctopusConfig } = await import(
      "~/services/managedSites/providers/octopus"
    )

    await expect(getOctopusConfig()).resolves.toEqual({
      baseUrl: "https://octopus.example.com",
      username: "octo-user",
      password: "octo-pass",
    })

    mockGetPreferences.mockResolvedValueOnce(null)
    await expect(checkValidOctopusConfig()).resolves.toBe(false)

    mockGetPreferences.mockResolvedValueOnce({
      octopus: {
        baseUrl: "",
        username: "",
        password: "",
      },
    })
    await expect(getOctopusConfig()).resolves.toBeNull()

    mockGetPreferences.mockRejectedValueOnce(
      new Error("preferences unavailable"),
    )
    await expect(checkValidOctopusConfig()).resolves.toBe(false)

    mockGetPreferences.mockRejectedValueOnce(
      new Error("preferences unavailable"),
    )
    await expect(getOctopusConfig()).resolves.toBeNull()

    mockGetPreferences.mockResolvedValueOnce({
      octopus: {
        baseUrl: "",
        username: "",
        password: "",
      },
    })
  })

  it("fetches models through the shared model resolver", async () => {
    const { fetchAvailableModels } = await import(
      "~/services/managedSites/providers/octopus"
    )
    const account = buildDisplaySiteData({
      baseUrl: "https://proxy.example.com",
    })
    const token = buildApiToken({
      key: "octo-key",
      name: "Primary Token",
    })
    const models = await fetchAvailableModels(account, token)
    expect(models).toEqual(["gpt-4o-mini"])
    expect(mockFetchManagedSiteAvailableModels).toHaveBeenCalledWith(
      account,
      token,
      {
        includeAccountFallback: false,
      },
    )
  })
})
