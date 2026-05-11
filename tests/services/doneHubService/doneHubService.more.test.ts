import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  buildApiToken,
  buildDisplaySiteData,
  buildManagedSiteChannel,
  buildSiteAccount,
} from "~~/tests/test-utils/factories"

const mockToast = {
  loading: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}

const {
  mockEnsureAccountApiToken,
  mockConvertToDisplayData,
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
  mockEnsureAccountApiToken: vi.fn(),
  mockConvertToDisplayData: vi.fn(),
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

vi.mock("react-hot-toast", () => ({
  default: mockToast,
}))

vi.mock("~/services/accounts/accountOperations", () => ({
  ensureAccountApiToken: mockEnsureAccountApiToken,
}))

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    convertToDisplayData: mockConvertToDisplayData,
  },
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

  it("returns validation errors immediately when DoneHub config is incomplete", async () => {
    const { autoConfigToDoneHub } = await import(
      "~/services/managedSites/providers/doneHubService"
    )
    mockGetPreferences.mockResolvedValueOnce({
      doneHub: {
        baseUrl: "",
        adminToken: "",
        userId: "",
      },
    })

    const result = await autoConfigToDoneHub(buildSiteAccount(), "toast-1")

    expect(result.success).toBe(false)
    expect(result.message).toContain(
      "messages:errors.validation.doneHubBaseUrlRequired",
    )
    expect(result.message).toContain(
      "messages:errors.validation.doneHubAdminTokenRequired",
    )
    expect(result.message).toContain(
      "messages:errors.validation.doneHubUserIdRequired",
    )
    expect(mockEnsureAccountApiToken).not.toHaveBeenCalled()
  })

  it("returns a numeric validation error immediately when the DoneHub admin user ID is invalid", async () => {
    const { autoConfigToDoneHub } = await import(
      "~/services/managedSites/providers/doneHubService"
    )
    mockGetPreferences.mockResolvedValueOnce({
      doneHub: {
        baseUrl: "https://done-hub.example.com",
        adminToken: "done-hub-token",
        userId: "abc",
      },
    })

    const result = await autoConfigToDoneHub(buildSiteAccount(), "toast-1b")

    expect(result.success).toBe(false)
    expect(result.message).toContain("messages:errors.validation.userIdNumeric")
    expect(mockEnsureAccountApiToken).not.toHaveBeenCalled()
  })

  it("retries transient network failures and then imports successfully", async () => {
    vi.useFakeTimers()

    const { autoConfigToDoneHub } = await import(
      "~/services/managedSites/providers/doneHubService"
    )
    const account = buildSiteAccount({ site_url: "https://proxy.example.com" })
    const displaySiteData = buildDisplaySiteData({
      name: "Imported Site",
      baseUrl: "https://proxy.example.com",
    })
    const apiToken = buildApiToken({
      key: "done-hub-key",
      name: "Imported Token",
    })

    mockConvertToDisplayData.mockReturnValue(displaySiteData)
    mockEnsureAccountApiToken
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce(apiToken)

    const promise = autoConfigToDoneHub(account, "toast-2")
    await vi.runAllTimersAsync()
    const result = await promise

    expect(mockEnsureAccountApiToken).toHaveBeenCalledTimes(2)
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
        channel: expect.objectContaining({
          name: "Imported Site | Imported Token (auto)",
          key: "done-hub-key",
        }),
      }),
    )
    expect(mockToast.error).toHaveBeenCalledWith("network unavailable", {
      id: "toast-2",
    })
    expect(mockToast.loading).toHaveBeenCalledWith(
      "messages:accountOperations.retrying",
      { id: "toast-2" },
    )
    expect(mockToast.success).toHaveBeenCalledWith(
      "messages:donehub.importSuccess",
      { id: "toast-2" },
    )
    expect(result).toEqual({
      success: true,
      message: "messages:donehub.importSuccess",
      data: { token: apiToken },
    })
  })

  it("stops before creation when a matching DoneHub channel already exists", async () => {
    const { autoConfigToDoneHub } = await import(
      "~/services/managedSites/providers/doneHubService"
    )
    const displaySiteData = buildDisplaySiteData({
      name: "Duplicate Site",
      baseUrl: "https://proxy.example.com",
    })
    const apiToken = buildApiToken({
      key: "done-hub-key",
      name: "Imported Token",
    })

    mockConvertToDisplayData.mockReturnValue(displaySiteData)
    mockEnsureAccountApiToken.mockResolvedValueOnce(apiToken)
    mockSearchChannel.mockResolvedValueOnce({
      items: [
        buildManagedSiteChannel({
          id: 22,
          name: "Existing DoneHub Channel",
          base_url: "https://proxy.example.com",
          models: "gpt-4o,gpt-4.1",
          key: "done-hub-key",
        }),
      ],
      total: 1,
      type_counts: {},
    })

    const result = await autoConfigToDoneHub(buildSiteAccount(), "toast-3")

    expect(result.success).toBe(false)
    expect(mockCreateChannel).not.toHaveBeenCalled()
    expect(result.message).toContain("messages:donehub.channelExists")
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
      "https://done-hub.example.com",
      "done-hub-token",
      "100",
      "proxy",
    )
    await createChannel(
      "https://done-hub.example.com",
      "done-hub-token",
      "100",
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
      "https://done-hub.example.com",
      "done-hub-token",
      "100",
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
      "https://done-hub.example.com",
      "done-hub-token",
      "100",
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
        "https://done-hub.example.com",
        "done-hub-token",
        "100",
        42,
      ),
    ).rejects.toThrow("done_hub_channel_key_missing")
  })

  it("skips key-detail fetches for channels without ids and ignores detail fetch failures", async () => {
    const { findMatchingChannel } = await import(
      "~/services/managedSites/providers/doneHubService"
    )

    mockSearchChannel.mockResolvedValueOnce({
      items: [
        buildManagedSiteChannel({
          id: undefined as any,
          name: "No Id Channel",
          base_url: "https://proxy.example.com",
          models: "gpt-4o",
          key: "",
        }),
        buildManagedSiteChannel({
          id: 22,
          name: "Broken Detail Channel",
          base_url: "https://proxy.example.com",
          models: "gpt-4o",
          key: "",
        }),
      ],
      total: 2,
      type_counts: {},
    })
    mockFetchDoneHubChannel.mockRejectedValueOnce(
      Object.assign(new Error("detail request failed"), { code: "ECONNRESET" }),
    )

    const result = await findMatchingChannel(
      "https://done-hub.example.com",
      "done-hub-token",
      "100",
      "https://proxy.example.com",
      ["gpt-4o"],
      "target-key",
    )

    expect(result).toBeNull()
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

  it("returns the provider failure message when Done Hub channel creation is rejected", async () => {
    const { autoConfigToDoneHub } = await import(
      "~/services/managedSites/providers/doneHubService"
    )
    const displaySiteData = buildDisplaySiteData({
      name: "Imported Site",
      baseUrl: "https://proxy.example.com",
    })
    const apiToken = buildApiToken({
      key: "done-hub-key",
      name: "Imported Token",
    })

    mockConvertToDisplayData.mockReturnValue(displaySiteData)
    mockEnsureAccountApiToken.mockResolvedValueOnce(apiToken)
    mockCreateChannel.mockResolvedValueOnce({
      success: false,
      message: "done hub rejected channel",
    })

    const result = await autoConfigToDoneHub(buildSiteAccount(), "toast-6")

    expect(result).toEqual({
      success: false,
      message: "done hub rejected channel",
    })
    expect(mockToast.error).toHaveBeenCalledWith("done hub rejected channel", {
      id: "toast-6",
    })
    expect(mockToast.success).not.toHaveBeenCalled()
  })
})
