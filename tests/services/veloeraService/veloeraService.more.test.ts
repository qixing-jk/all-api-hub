import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  buildApiToken,
  buildDisplaySiteData,
} from "~~/tests/test-utils/factories"

const {
  mockSearchChannel,
  mockCreateChannel,
  mockUpdateChannel,
  mockDeleteChannel,
  mockFetchVeloeraChannel,
  mockFetchAccountAvailableModels,
  mockGetPreferences,
  mockFetchManagedSiteAvailableModels,
  mockFetchTokenScopedModels,
  mockResolveDefaultChannelGroups,
} = vi.hoisted(() => ({
  mockSearchChannel: vi.fn(),
  mockCreateChannel: vi.fn(),
  mockUpdateChannel: vi.fn(),
  mockDeleteChannel: vi.fn(),
  mockFetchVeloeraChannel: vi.fn(),
  mockFetchAccountAvailableModels: vi.fn(),
  mockGetPreferences: vi.fn(),
  mockFetchManagedSiteAvailableModels: vi.fn(),
  mockFetchTokenScopedModels: vi.fn(),
  mockResolveDefaultChannelGroups: vi.fn(),
}))

vi.mock("~/services/apiService/veloera", () => ({
  searchChannel: (...args: unknown[]) => mockSearchChannel(...args),
  createChannel: (...args: unknown[]) => mockCreateChannel(...args),
  updateChannel: (...args: unknown[]) => mockUpdateChannel(...args),
  deleteChannel: (...args: unknown[]) => mockDeleteChannel(...args),
  fetchChannel: (...args: unknown[]) => mockFetchVeloeraChannel(...args),
  fetchAccountAvailableModels: (...args: unknown[]) =>
    mockFetchAccountAvailableModels(...args),
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
})
