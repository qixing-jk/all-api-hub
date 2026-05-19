import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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
  mockFetchVeloeraChannel,
  mockGetPreferences,
  mockFetchManagedSiteAvailableModels,
  mockFetchTokenScopedModels,
  mockResolveDefaultChannelGroups,
} = vi.hoisted(() => ({
  mockEnsureAccountApiToken: vi.fn(),
  mockConvertToDisplayData: vi.fn(),
  mockSearchChannel: vi.fn(),
  mockCreateChannel: vi.fn(),
  mockUpdateChannel: vi.fn(),
  mockDeleteChannel: vi.fn(),
  mockFetchVeloeraChannel: vi.fn(),
  mockGetPreferences: vi.fn(),
  mockFetchManagedSiteAvailableModels: vi.fn(),
  mockFetchTokenScopedModels: vi.fn(),
  mockResolveDefaultChannelGroups: vi.fn(),
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

vi.mock("~/services/apiService/veloera", () => ({
  fetchChannel: (...args: unknown[]) => mockFetchVeloeraChannel(...args),
}))

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: {
    getPreferences: mockGetPreferences,
  },
}))

vi.mock("~/services/managedSites/utils/fetchTokenScopedModels", () => ({
  fetchTokenScopedModels: mockFetchTokenScopedModels,
}))

vi.mock("~/services/managedSites/providers/defaultChannelGroups", () => ({
  resolveDefaultChannelGroups: mockResolveDefaultChannelGroups,
}))

vi.mock(
  "~/services/managedSites/utils/fetchManagedSiteAvailableModels",
  () => ({
    fetchManagedSiteAvailableModels: mockFetchManagedSiteAvailableModels,
  }),
)

describe("veloeraService additional flows", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()

    mockGetPreferences.mockResolvedValue({
      veloera: {
        baseUrl: "https://veloera.example.com",
        adminToken: "veloera-token",
        userId: "200",
      },
    })
    mockFetchTokenScopedModels.mockResolvedValue({
      models: ["gpt-4o"],
      fetchFailed: false,
    })
    mockFetchManagedSiteAvailableModels.mockResolvedValue(["gpt-4o-mini"])
    mockResolveDefaultChannelGroups.mockResolvedValue(["ops"])
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

  it("returns safe nullish results when Veloera config reads fail", async () => {
    const { checkValidVeloeraConfig, getVeloeraConfig } = await import(
      "~/services/managedSites/providers/veloera"
    )
    mockGetPreferences.mockRejectedValue(new Error("prefs unavailable"))

    await expect(checkValidVeloeraConfig()).resolves.toBe(false)
    await expect(getVeloeraConfig()).resolves.toBeNull()
  })

  it("treats non-numeric stored Veloera admin user IDs as invalid config", async () => {
    const { checkValidVeloeraConfig, getVeloeraConfig } = await import(
      "~/services/managedSites/providers/veloera"
    )
    mockGetPreferences.mockResolvedValueOnce({
      veloera: {
        baseUrl: "https://veloera.example.com",
        adminToken: "veloera-token",
        userId: "abc",
      },
    })

    await expect(checkValidVeloeraConfig()).resolves.toBe(false)

    mockGetPreferences.mockResolvedValueOnce({
      veloera: {
        baseUrl: "https://veloera.example.com",
        adminToken: "veloera-token",
        userId: "abc",
      },
    })
    await expect(getVeloeraConfig()).resolves.toBeNull()
  })

  it("uses token-model fallback, resolved groups, and model-prefill failure metadata", async () => {
    const { prepareChannelFormData } = await import(
      "~/services/managedSites/providers/veloera"
    )
    mockFetchTokenScopedModels.mockResolvedValueOnce({
      models: [],
      fetchFailed: true,
    })

    const token = buildApiToken({
      key: "veloera-key",
      name: "Primary Token",
      models: "gpt-4o,claude-3",
    })

    const result = await prepareChannelFormData(
      buildDisplaySiteData({
        name: "Veloera Site",
        baseUrl: "https://proxy.example.com",
      }),
      token,
    )

    expect(result).toMatchObject({
      name: "Veloera Site | Primary Token (auto)",
      key: "veloera-key",
      base_url: "https://proxy.example.com",
      models: ["gpt-4o", "claude-3"],
      groups: ["ops"],
      modelPrefillFetchFailed: true,
    })
  })

  it("trims payload fields and falls back to the default group when none is supplied", async () => {
    const { buildChannelPayload } = await import(
      "~/services/managedSites/providers/veloera"
    )

    const payload = buildChannelPayload({
      name: "  Imported Veloera Channel  ",
      type: 1,
      key: "  veloera-key  ",
      base_url: " https://proxy.example.com  ",
      models: ["gpt-4o", "gpt-4o", "claude-3"],
      groups: [],
      priority: 0,
      weight: 0,
      status: 1,
    } as any)

    expect(payload).toEqual({
      mode: "single",
      channel: expect.objectContaining({
        name: "Imported Veloera Channel",
        key: "veloera-key",
        base_url: "https://proxy.example.com",
        models: "gpt-4o,claude-3",
        groups: ["default"],
      }),
    })
  })

  it("returns validation errors immediately when Veloera config is incomplete", async () => {
    const { autoConfigToVeloera } = await import(
      "~/services/managedSites/providers/veloera"
    )
    mockGetPreferences.mockResolvedValueOnce({
      veloera: {
        baseUrl: "",
        adminToken: "",
        userId: "",
      },
    })

    const result = await autoConfigToVeloera(buildSiteAccount(), "toast-6")

    expect(result.success).toBe(false)
    expect(result.message).toContain(
      "messages:errors.validation.veloeraBaseUrlRequired",
    )
    expect(result.message).toContain(
      "messages:errors.validation.veloeraAdminTokenRequired",
    )
    expect(result.message).toContain(
      "messages:errors.validation.veloeraUserIdRequired",
    )
    expect(mockEnsureAccountApiToken).not.toHaveBeenCalled()
  })

  it("returns a numeric validation error immediately when the Veloera admin user ID is invalid", async () => {
    const { autoConfigToVeloera } = await import(
      "~/services/managedSites/providers/veloera"
    )
    mockGetPreferences.mockResolvedValueOnce({
      veloera: {
        baseUrl: "https://veloera.example.com",
        adminToken: "veloera-token",
        userId: "abc",
      },
    })

    const result = await autoConfigToVeloera(buildSiteAccount(), "toast-6b")

    expect(result.success).toBe(false)
    expect(result.message).toContain("messages:errors.validation.userIdNumeric")
    expect(mockEnsureAccountApiToken).not.toHaveBeenCalled()
  })

  it("retries transient Veloera import failures and then succeeds", async () => {
    vi.useFakeTimers()

    const { autoConfigToVeloera } = await import(
      "~/services/managedSites/providers/veloera"
    )
    const displaySiteData = buildDisplaySiteData({
      name: "Imported Veloera Site",
      baseUrl: "https://proxy.example.com",
    })
    const apiToken = buildApiToken({
      key: "veloera-key",
      name: "Imported Token",
    })

    mockConvertToDisplayData.mockReturnValue(displaySiteData)
    mockEnsureAccountApiToken
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockResolvedValueOnce(apiToken)

    const promise = autoConfigToVeloera(buildSiteAccount(), "toast-7")
    await vi.runAllTimersAsync()
    const result = await promise

    expect(mockEnsureAccountApiToken).toHaveBeenCalledTimes(2)
    expect(mockCreateChannel).toHaveBeenCalled()
    expect(mockToast.error).toHaveBeenCalledWith("Failed to fetch", {
      id: "toast-7",
    })
    expect(mockToast.loading).toHaveBeenCalledWith(
      "messages:accountOperations.retrying",
      { id: "toast-7" },
    )
    expect(mockToast.success).toHaveBeenCalledWith(
      "messages:veloera.importSuccess",
      { id: "toast-7" },
    )
    expect(result).toEqual({
      success: true,
      message: "messages:veloera.importSuccess",
      data: { token: apiToken },
    })
  })

  it("stops before creation when a matching Veloera channel already exists", async () => {
    const { autoConfigToVeloera } = await import(
      "~/services/managedSites/providers/veloera"
    )
    const displaySiteData = buildDisplaySiteData({
      name: "Existing Veloera Site",
      baseUrl: "https://proxy.example.com",
    })
    const apiToken = buildApiToken({
      key: "veloera-key",
      name: "Imported Token",
    })

    mockConvertToDisplayData.mockReturnValue(displaySiteData)
    mockEnsureAccountApiToken.mockResolvedValueOnce(apiToken)
    mockSearchChannel.mockResolvedValueOnce({
      items: [
        buildManagedSiteChannel({
          id: 55,
          name: "Existing Veloera Channel",
          base_url: "https://proxy.example.com",
          models: "gpt-4o",
          key: "veloera-key",
        }),
      ],
      total: 1,
      type_counts: {},
    })

    const result = await autoConfigToVeloera(buildSiteAccount(), "toast-8")

    expect(result).toEqual({
      success: false,
      message: expect.stringContaining("channelExists"),
    })
    expect(mockSearchChannel).toHaveBeenCalledTimes(1)
    expect(mockCreateChannel).not.toHaveBeenCalled()
  })

  it("proxies search, create, update, delete, and available-model fetches with Veloera auth", async () => {
    const {
      createChannel,
      deleteChannel,
      fetchAvailableModels,
      searchChannel,
      updateChannel,
    } = await import("~/services/managedSites/providers/veloera")
    const account = buildDisplaySiteData({
      baseUrl: "https://proxy.example.com",
    })
    const token = buildApiToken({
      key: "veloera-key",
      name: "Primary Token",
    })

    await searchChannel(
      {
        baseUrl: "https://veloera.example.com",
        adminToken: "veloera-token",
        userId: "200",
      },
      "proxy",
    )
    await createChannel(
      {
        baseUrl: "https://veloera.example.com",
        adminToken: "veloera-token",
        userId: "200",
      },
      {
        mode: "single",
        channel: {
          name: "Veloera Channel",
          type: 1,
          key: "veloera-key",
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
        baseUrl: "https://veloera.example.com",
        adminToken: "veloera-token",
        userId: "200",
      },
      {
        id: 7,
        name: "Updated Veloera Channel",
        type: 1,
        key: "veloera-key",
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
        baseUrl: "https://veloera.example.com",
        adminToken: "veloera-token",
        userId: "200",
      },
      7,
    )
    const models = await fetchAvailableModels(account, token)

    expect(mockSearchChannel).toHaveBeenCalledWith(
      {
        baseUrl: "https://veloera.example.com",
        auth: {
          authType: "access_token",
          accessToken: "veloera-token",
          userId: "200",
        },
      },
      "proxy",
    )
    expect(mockCreateChannel).toHaveBeenCalledWith(
      {
        baseUrl: "https://veloera.example.com",
        auth: {
          authType: "access_token",
          accessToken: "veloera-token",
          userId: "200",
        },
      },
      expect.objectContaining({
        channel: expect.objectContaining({ name: "Veloera Channel" }),
      }),
    )
    expect(mockUpdateChannel).toHaveBeenCalledWith(
      {
        baseUrl: "https://veloera.example.com",
        auth: {
          authType: "access_token",
          accessToken: "veloera-token",
          userId: "200",
        },
      },
      expect.objectContaining({ id: 7, name: "Updated Veloera Channel" }),
    )
    expect(mockDeleteChannel).toHaveBeenCalledWith(
      {
        baseUrl: "https://veloera.example.com",
        auth: {
          authType: "access_token",
          accessToken: "veloera-token",
          userId: "200",
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

  it("trims fetched Veloera channel keys and throws when the detail payload omits them", async () => {
    const { fetchChannelSecretKey } = await import(
      "~/services/managedSites/providers/veloera"
    )

    mockFetchVeloeraChannel.mockResolvedValueOnce({
      id: 42,
      key: "  veloera-secret  ",
    })
    await expect(
      fetchChannelSecretKey(
        {
          baseUrl: "https://veloera.example.com",
          adminToken: "veloera-token",
          userId: "200",
        },
        42,
      ),
    ).resolves.toBe("veloera-secret")

    mockFetchVeloeraChannel.mockResolvedValueOnce({
      id: 42,
      key: "   ",
    })
    await expect(
      fetchChannelSecretKey(
        {
          baseUrl: "https://veloera.example.com",
          adminToken: "veloera-token",
          userId: "200",
        },
        42,
      ),
    ).rejects.toThrow("veloera_channel_key_missing")
  })

  it("returns the provider failure message when Veloera channel creation is rejected", async () => {
    const { autoConfigToVeloera } = await import(
      "~/services/managedSites/providers/veloera"
    )
    const displaySiteData = buildDisplaySiteData({
      name: "Imported Veloera Site",
      baseUrl: "https://proxy.example.com",
    })
    const apiToken = buildApiToken({
      key: "veloera-key",
      name: "Imported Token",
    })

    mockConvertToDisplayData.mockReturnValue(displaySiteData)
    mockEnsureAccountApiToken.mockResolvedValueOnce(apiToken)
    mockCreateChannel.mockResolvedValueOnce({
      success: false,
      message: "veloera rejected channel",
    })

    const result = await autoConfigToVeloera(buildSiteAccount(), "toast-9")

    expect(result).toEqual({
      success: false,
      message: "veloera rejected channel",
    })
    expect(mockToast.error).toHaveBeenCalledWith("veloera rejected channel", {
      id: "toast-9",
    })
    expect(mockToast.success).not.toHaveBeenCalled()
  })
})
