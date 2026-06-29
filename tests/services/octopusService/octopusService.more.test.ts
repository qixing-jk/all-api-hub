import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ChannelType } from "~/constants"
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

const passedOctopusConfig = {
  baseUrl: "https://passed-octopus.example.com",
  username: "passed-octo-user",
  password: "passed-octo-pass",
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
      data: { id: 1 },
      message: "created",
    })
    mockUpdateChannelApi.mockResolvedValue({
      success: true,
      data: { id: 1 },
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

  it("maps shared channel types to Octopus outbound types and normalizes Octopus base URLs", async () => {
    const {
      buildOctopusBaseUrl,
      mapChannelTypeToOctopusOutboundType,
      mapOctopusOutboundTypeToChannelType,
    } = await import("~/services/managedSites/providers/octopus")

    expect(buildOctopusBaseUrl("https://api.example.com///")).toBe(
      "https://api.example.com/v1",
    )
    expect(buildOctopusBaseUrl("https://api.example.com/v1")).toBe(
      "https://api.example.com/v1",
    )
    expect(mapChannelTypeToOctopusOutboundType(ChannelType.Anthropic)).toBe(
      OctopusOutboundType.Anthropic,
    )
    expect(mapChannelTypeToOctopusOutboundType(ChannelType.Gemini)).toBe(
      OctopusOutboundType.Gemini,
    )
    expect(mapChannelTypeToOctopusOutboundType(ChannelType.VolcEngine)).toBe(
      OctopusOutboundType.Volcengine,
    )
    expect(mapChannelTypeToOctopusOutboundType(99, true)).toBe(
      OctopusOutboundType.OpenAIChat,
    )
    expect(
      mapOctopusOutboundTypeToChannelType(OctopusOutboundType.OpenAIEmbedding),
    ).toBe(ChannelType.OpenAI)
  })

  it("creates and updates Octopus channels using mapped request payloads", async () => {
    const { createChannel, updateChannel } = await import(
      "~/services/managedSites/providers/octopus"
    )

    const created = await createChannel(passedOctopusConfig, {
      mode: "single",
      channel: {
        name: " Octopus Channel ",
        type: OctopusOutboundType.Gemini,
        key: "octo-key",
        base_url: "https://proxy.example.com/v1",
        models: "gemini-2.5-pro",
        groups: ["default"],
        priority: 0,
        weight: 0,
        status: 1,
      },
    } as any)

    expect(created.success).toBe(true)
    expect(mockCreateChannelApi).toHaveBeenCalledWith(
      {
        baseUrl: "https://passed-octopus.example.com",
        username: "passed-octo-user",
        password: "passed-octo-pass",
      },
      {
        name: " Octopus Channel ",
        type: OctopusOutboundType.Gemini,
        enabled: true,
        base_urls: [{ url: "https://proxy.example.com/v1" }],
        keys: [{ enabled: true, channel_key: "octo-key" }],
        model: "gemini-2.5-pro",
        auto_sync: true,
        auto_group: 0,
      },
    )

    const updated = await updateChannel(passedOctopusConfig, {
      id: 12,
      name: "Updated Octopus Channel",
      type: OctopusOutboundType.Anthropic,
      status: 2,
      base_url: "https://proxy.example.com/v1",
      models: "claude-3.7-sonnet",
    } as any)

    expect(updated.success).toBe(true)
    expect(mockUpdateChannelApi).toHaveBeenCalledWith(
      {
        baseUrl: "https://passed-octopus.example.com",
        username: "passed-octo-user",
        password: "passed-octo-pass",
      },
      {
        id: 12,
        name: "Updated Octopus Channel",
        type: OctopusOutboundType.Anthropic,
        enabled: false,
        base_urls: [{ url: "https://proxy.example.com/v1" }],
        model: "claude-3.7-sonnet",
      },
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
    const { checkValidOctopusConfig, getOctopusConfig, searchChannel } =
      await import("~/services/managedSites/providers/octopus")

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
    mockSearchChannels.mockRejectedValueOnce(new Error("search failed"))
    await expect(
      searchChannel(passedOctopusConfig, "proxy"),
    ).resolves.toBeNull()
  })

  it("converts Octopus channels to managed-site data and searches channels through the provider config", async () => {
    const { fetchAvailableModels, octopusChannelToManagedSite, searchChannel } =
      await import("~/services/managedSites/providers/octopus")
    const account = buildDisplaySiteData({
      baseUrl: "https://proxy.example.com",
    })
    const token = buildApiToken({
      key: "octo-key",
      name: "Primary Token",
    })
    const apiChannel: OctopusChannel = {
      id: 15,
      name: "Octopus API Channel",
      type: OctopusOutboundType.OpenAIResponse,
      enabled: false,
      base_urls: [],
      keys: [],
      model: "",
      proxy: false,
      auto_sync: false,
      auto_group: OctopusAutoGroupType.None,
    }

    mockSearchChannels.mockResolvedValueOnce([apiChannel])

    const converted = octopusChannelToManagedSite(apiChannel)
    const result = await searchChannel(passedOctopusConfig, "octopus")
    const models = await fetchAvailableModels(account, token)

    expect(converted).toMatchObject({
      id: 15,
      type: OctopusOutboundType.OpenAIResponse,
      base_url: "",
      key: "",
      models: "",
      status: 2,
      _octopusData: apiChannel,
    })
    expect(result).toEqual({
      items: [expect.objectContaining({ id: 15, status: 2 })],
      total: 1,
      type_counts: {},
    })
    expect(mockSearchChannels).toHaveBeenCalledWith(
      {
        baseUrl: "https://passed-octopus.example.com",
        username: "passed-octo-user",
        password: "passed-octo-pass",
      },
      "octopus",
    )
    expect(models).toEqual(["gpt-4o-mini"])
    expect(mockFetchManagedSiteAvailableModels).toHaveBeenCalledWith(
      account,
      token,
      {
        includeAccountFallback: false,
      },
    )
  })

  it("returns provider error messages when Octopus create, update, or delete operations throw", async () => {
    const { createChannel, deleteChannel, updateChannel } = await import(
      "~/services/managedSites/providers/octopus"
    )

    mockCreateChannelApi.mockRejectedValueOnce(new Error("create exploded"))
    const createResult = await createChannel(passedOctopusConfig, {
      mode: "single",
      channel: {},
    } as any)

    mockUpdateChannelApi.mockRejectedValueOnce(new Error("update exploded"))
    const updateResult = await updateChannel(passedOctopusConfig, {
      id: 9,
      status: 1,
    } as any)

    mockDeleteChannelApi.mockRejectedValueOnce(new Error("delete exploded"))
    const deleteResult = await deleteChannel(passedOctopusConfig, 9)

    expect(createResult).toEqual({
      success: false,
      data: null,
      message: "create exploded",
    })
    expect(updateResult).toEqual({
      success: false,
      data: null,
      message: "update exploded",
    })
    expect(deleteResult).toEqual({
      success: false,
      data: null,
      message: "delete exploded",
    })
  })
})
