import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  buildApiToken,
  buildDisplaySiteData,
  buildManagedSiteChannel,
} from "~~/tests/test-utils/factories"

const {
  mockSearchChannel,
  mockCreateChannel,
  mockUpdateChannel,
  mockDeleteChannel,
  mockFetchDoneHubChannel,
  mockGetPreferences,
  mockFetchTokenScopedModels,
  mockResolveDefaultChannelGroups,
  mockFetchManagedSiteAvailableModels,
} = vi.hoisted(() => ({
  mockSearchChannel: vi.fn(),
  mockCreateChannel: vi.fn(),
  mockUpdateChannel: vi.fn(),
  mockDeleteChannel: vi.fn(),
  mockFetchDoneHubChannel: vi.fn(),
  mockGetPreferences: vi.fn(),
  mockFetchTokenScopedModels: vi.fn(),
  mockResolveDefaultChannelGroups: vi.fn(),
  mockFetchManagedSiteAvailableModels: vi.fn(),
}))

vi.mock("~/services/apiService", () => ({
  getApiService: vi.fn(() => ({
    searchChannel: mockSearchChannel,
    createChannel: mockCreateChannel,
    updateChannel: mockUpdateChannel,
    deleteChannel: mockDeleteChannel,
  })),
}))

vi.mock("~/services/apiService/doneHub", () => ({
  searchChannel: (...args: unknown[]) => mockSearchChannel(...args),
  createChannel: (...args: unknown[]) => mockCreateChannel(...args),
  updateChannel: (...args: unknown[]) => mockUpdateChannel(...args),
  deleteChannel: (...args: unknown[]) => mockDeleteChannel(...args),
  fetchChannel: (...args: unknown[]) => mockFetchDoneHubChannel(...args),
}))

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: {
    getPreferences: mockGetPreferences,
  },
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

vi.mock("~/services/managedSites/providers/defaultChannelGroups", () => ({
  resolveDefaultChannelGroups: mockResolveDefaultChannelGroups,
}))

describe("doneHubService additional flows", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()

    mockGetPreferences.mockResolvedValue({
      doneHub: {
        baseUrl: "https://done-hub.example.com",
        adminToken: "done-hub-token",
        userId: "100",
      },
    })
    mockFetchTokenScopedModels.mockResolvedValue({
      models: ["gpt-4o", "gpt-4.1"],
      fetchFailed: false,
    })
    mockResolveDefaultChannelGroups.mockResolvedValue(["ops", "default"])
    mockFetchManagedSiteAvailableModels.mockResolvedValue(["gpt-4o-mini"])
    mockSearchChannel.mockResolvedValue({
      items: [],
      total: 0,
      type_counts: {},
    })
    mockCreateChannel.mockResolvedValue({
      success: true,
      message: "created",
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("prepares channel form data from token-scoped models and resolved default groups", async () => {
    const { prepareChannelFormData } = await import(
      "~/services/managedSites/providers/doneHubService"
    )
    const account = buildDisplaySiteData({
      name: "Done Hub Account",
      baseUrl: "https://proxy.example.com",
    })
    const token = buildApiToken({
      key: "done-hub-key",
      name: "Primary Token",
    })

    const result = await prepareChannelFormData(account, token)

    expect(mockFetchTokenScopedModels).toHaveBeenCalledWith(account, token)
    expect(mockResolveDefaultChannelGroups).toHaveBeenCalled()
    expect(result).toMatchObject({
      name: "Done Hub Account | Primary Token (auto)",
      key: "done-hub-key",
      base_url: "https://proxy.example.com",
      models: ["gpt-4o", "gpt-4.1"],
      groups: ["ops", "default"],
    })
    expect(result.modelPrefillFetchFailed).toBeUndefined()
  })

  it("uses the AIHubMix API origin for managed-site channel imports", async () => {
    const { prepareChannelFormData } = await import(
      "~/services/managedSites/providers/doneHubService"
    )
    const account = buildDisplaySiteData({
      siteType: SITE_TYPES.AIHUBMIX,
      baseUrl: "https://console.aihubmix.com",
    })
    const token = buildApiToken({
      key: "aihubmix-key",
      name: "AIHubMix Token",
    })

    const result = await prepareChannelFormData(account, token)

    expect(mockFetchTokenScopedModels).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://aihubmix.com",
      }),
      token,
    )
    expect(result.base_url).toBe("https://aihubmix.com")
  })

  it("marks model prefill failure and trims payload fields when building a channel payload", async () => {
    const { buildChannelPayload, prepareChannelFormData } = await import(
      "~/services/managedSites/providers/doneHubService"
    )

    mockFetchTokenScopedModels.mockResolvedValueOnce({
      models: ["gpt-4o"],
      fetchFailed: true,
    })
    mockResolveDefaultChannelGroups.mockResolvedValueOnce([])

    const formData = await prepareChannelFormData(
      buildDisplaySiteData(),
      buildApiToken(),
    )
    const payload = buildChannelPayload({
      ...formData,
      name: "  Imported Channel  ",
      key: "  secret-key  ",
      base_url: " https://proxy.example.com  ",
      groups: [],
      models: [" gpt-4o ", "gpt-4o", "claude-3"],
    })

    expect(formData.modelPrefillFetchFailed).toBe(true)
    expect(payload).toEqual({
      mode: "single",
      channel: expect.objectContaining({
        name: "Imported Channel",
        key: "secret-key",
        base_url: "https://proxy.example.com",
        models: "gpt-4o,claude-3",
        groups: ["default"],
      }),
    })
  })

  it("proxies search, create, update, delete, and available-model fetches with Done Hub auth", async () => {
    const {
      createChannel,
      deleteChannel,
      fetchAvailableModels,
      searchChannel,
      updateChannel,
    } = await import("~/services/managedSites/providers/doneHubService")
    const account = buildDisplaySiteData({
      baseUrl: "https://proxy.example.com",
    })
    const token = buildApiToken({
      key: "done-hub-key",
      name: "Primary Token",
    })

    await searchChannel(
      {
        baseUrl: "https://done-hub.example.com",
        adminToken: "done-hub-token",
        userId: "100",
      },
      "proxy",
    )
    await createChannel(
      {
        baseUrl: "https://done-hub.example.com",
        adminToken: "done-hub-token",
        userId: "100",
      },
      {
        mode: "single",
        channel: {
          name: "Done Hub Channel",
          type: 1,
          key: "done-hub-key",
          base_url: "https://proxy.example.com",
          models: "gpt-4o",
          groups: ["default"],
          priority: 0,
          weight: 0,
          status: 1,
        },
      } as any,
    )
    await updateChannel(
      {
        baseUrl: "https://done-hub.example.com",
        adminToken: "done-hub-token",
        userId: "100",
      },
      {
        id: 7,
        name: "Updated Channel",
        type: 1,
        key: "done-hub-key",
        base_url: "https://proxy.example.com",
        models: "gpt-4o",
        groups: ["default"],
        priority: 0,
        weight: 0,
        status: 1,
      } as any,
    )
    await deleteChannel(
      {
        baseUrl: "https://done-hub.example.com",
        adminToken: "done-hub-token",
        userId: "100",
      },
      7,
    )
    const models = await fetchAvailableModels(account, token)

    expect(mockSearchChannel).toHaveBeenCalledWith(
      {
        baseUrl: "https://done-hub.example.com",
        auth: {
          authType: "access_token",
          accessToken: "done-hub-token",
          userId: "100",
        },
      },
      "proxy",
    )
    expect(mockCreateChannel).toHaveBeenCalledWith(
      {
        baseUrl: "https://done-hub.example.com",
        auth: {
          authType: "access_token",
          accessToken: "done-hub-token",
          userId: "100",
        },
      },
      expect.objectContaining({
        channel: expect.objectContaining({ name: "Done Hub Channel" }),
      }),
    )
    expect(mockUpdateChannel).toHaveBeenCalledWith(
      {
        baseUrl: "https://done-hub.example.com",
        auth: {
          authType: "access_token",
          accessToken: "done-hub-token",
          userId: "100",
        },
      },
      expect.objectContaining({ id: 7, name: "Updated Channel" }),
    )
    expect(mockDeleteChannel).toHaveBeenCalledWith(
      {
        baseUrl: "https://done-hub.example.com",
        auth: {
          authType: "access_token",
          accessToken: "done-hub-token",
          userId: "100",
        },
      },
      7,
    )
    expect(models).toEqual(["gpt-4o-mini"])
    expect(mockFetchManagedSiteAvailableModels).toHaveBeenCalledWith(
      account,
      token,
    )
  })

  it("returns config helper fallbacks when preferences are missing or reading fails", async () => {
    const { checkValidDoneHubConfig, getDoneHubConfig } = await import(
      "~/services/managedSites/providers/doneHubService"
    )

    mockGetPreferences.mockResolvedValueOnce(null)
    await expect(checkValidDoneHubConfig()).resolves.toBe(false)

    mockGetPreferences.mockResolvedValueOnce({
      doneHub: {
        baseUrl: "",
        adminToken: "",
        userId: "",
      },
    })
    await expect(getDoneHubConfig()).resolves.toBeNull()

    mockGetPreferences.mockResolvedValueOnce({
      doneHub: {
        baseUrl: "https://done-hub.example.com",
        adminToken: "done-hub-token",
        userId: "abc",
      },
    })
    await expect(checkValidDoneHubConfig()).resolves.toBe(false)

    mockGetPreferences.mockResolvedValueOnce({
      doneHub: {
        baseUrl: "https://done-hub.example.com",
        adminToken: "done-hub-token",
        userId: "abc",
      },
    })
    await expect(getDoneHubConfig()).resolves.toBeNull()

    mockGetPreferences.mockRejectedValueOnce(
      new Error("preferences unavailable"),
    )
    await expect(checkValidDoneHubConfig()).resolves.toBe(false)

    mockGetPreferences.mockRejectedValueOnce(
      new Error("preferences unavailable"),
    )
    await expect(getDoneHubConfig()).resolves.toBeNull()
  })

  it("throws when the Done Hub channel detail payload does not contain a key", async () => {
    const { fetchChannelSecretKey } = await import(
      "~/services/managedSites/providers/doneHubService"
    )

    mockFetchDoneHubChannel.mockResolvedValueOnce({
      id: 42,
      key: "   ",
    })

    await expect(
      fetchChannelSecretKey(
        {
          baseUrl: "https://done-hub.example.com",
          adminToken: "done-hub-token",
          userId: "100",
        },
        42,
      ),
    ).rejects.toThrow("done_hub_channel_key_missing")
  })

  it("preserves channels without ids and maps detail fetch failures to unresolved hydration", async () => {
    const { hydrateComparableChannelKeys } = await import(
      "~/services/managedSites/providers/doneHubService"
    )
    const { MatchResolutionUnresolvedError } = await import(
      "~/services/managedSites/channelMatch"
    )

    const result = await hydrateComparableChannelKeys(
      {
        baseUrl: "https://done-hub.example.com",
        adminToken: "done-hub-token",
        userId: "100",
      },
      [
        buildManagedSiteChannel({
          id: undefined as any,
          name: "No Id Channel",
          base_url: "https://proxy.example.com",
          models: "gpt-4o",
          key: "",
        }),
      ],
    )

    expect(result).toEqual([
      expect.objectContaining({
        name: "No Id Channel",
      }),
    ])
    expect(mockFetchDoneHubChannel).not.toHaveBeenCalled()

    mockFetchDoneHubChannel.mockRejectedValueOnce(
      Object.assign(new Error("detail request failed"), { code: "ECONNRESET" }),
    )

    await expect(
      hydrateComparableChannelKeys(
        {
          baseUrl: "https://done-hub.example.com",
          adminToken: "done-hub-token",
          userId: "100",
        },
        [
          buildManagedSiteChannel({
            id: 22,
            name: "Broken Detail Channel",
            base_url: "https://proxy.example.com",
            models: "gpt-4o",
            key: "",
          }),
        ],
      ),
    ).rejects.toBeInstanceOf(MatchResolutionUnresolvedError)
    expect(mockFetchDoneHubChannel).toHaveBeenCalledTimes(1)
    expect(mockFetchDoneHubChannel).toHaveBeenCalledWith(
      {
        baseUrl: "https://done-hub.example.com",
        auth: {
          authType: "access_token",
          accessToken: "done-hub-token",
          userId: "100",
        },
      },
      22,
    )
  })
})
