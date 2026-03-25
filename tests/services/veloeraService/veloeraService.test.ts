import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ApiToken, DisplaySiteData } from "~/types"
import type { CreateChannelPayload, UpdateChannelPayload } from "~/types/newApi"

// ============================================================================
// MOCKS
// ============================================================================

const mockToast = {
  loading: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}

vi.mock("react-hot-toast", () => ({
  default: mockToast,
}))

const mockFetchAccountAvailableModels = vi.fn()
const mockFetchOpenAICompatibleModelIds = vi.fn()
const mockSearchChannel = vi.fn()
const mockCreateChannel = vi.fn()
const mockUpdateChannel = vi.fn()
const mockDeleteChannel = vi.fn()
const mockFetchVeloeraChannel = vi.fn()

vi.mock("~/services/apiService", () => ({
  getApiService: vi.fn(() => ({
    fetchAccountAvailableModels: mockFetchAccountAvailableModels,
    searchChannel: mockSearchChannel,
    createChannel: mockCreateChannel,
    updateChannel: mockUpdateChannel,
    deleteChannel: mockDeleteChannel,
  })),
}))

vi.mock("~/services/apiService/veloera", () => ({
  fetchChannel: (...args: unknown[]) => mockFetchVeloeraChannel(...args),
}))

vi.mock("~/services/apiService/openaiCompatible", () => ({
  fetchOpenAICompatibleModelIds: mockFetchOpenAICompatibleModelIds,
}))

const mockGetPreferences = vi.fn()
vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: {
    getPreferences: mockGetPreferences,
  },
}))

// ============================================================================
// FIXTURES
// ============================================================================

/**
 * Creates a minimal UserPreferences-like object wired with Veloera configuration.
 */
function createMockUserPreferencesWithVeloera(
  overrides?: Record<string, unknown>,
) {
  return {
    veloera: {
      baseUrl: "https://veloera.example.com",
      adminToken: "admin-token-123",
      userId: "user-123",
    },
    ...overrides,
  }
}

/**
 *
 */
function createMockDisplaySiteData(
  overrides: Partial<DisplaySiteData> = {},
): DisplaySiteData {
  return {
    id: "site-1",
    icon: "icon",
    name: "Test Site",
    username: "testuser",
    balance: { USD: 0, CNY: 0 },
    todayConsumption: { USD: 0, CNY: 0 },
    todayIncome: { USD: 0, CNY: 0 },
    todayTokens: { upload: 0, download: 0 },
    health: { status: "healthy" as any },
    last_sync_time: Date.now(),
    siteType: "veloera",
    baseUrl: "https://api.example.com",
    token: "access-token",
    userId: 1,
    authType: "access_token" as any,
    checkIn: { enableDetection: false },
    ...overrides,
  }
}

/**
 *
 */
function createMockApiToken(overrides: Partial<ApiToken> = {}): ApiToken {
  return {
    id: 1,
    user_id: 1,
    key: "sk-test-key-123",
    status: 1,
    name: "Test Token",
    created_time: Date.now() - 86400000,
    accessed_time: Date.now(),
    expired_time: Date.now() + 31536000000,
    remain_quota: 100,
    unlimited_quota: false,
    used_quota: 0,
    ...overrides,
  }
}

// ============================================================================
// TESTS
// ============================================================================

describe("veloeraService", () => {
  beforeEach(() => {
    mockFetchVeloeraChannel.mockReset()
    mockFetchOpenAICompatibleModelIds.mockReset()
    mockGetPreferences.mockReset()
  })

  describe("hasValidVeloeraConfig", () => {
    it("returns true with valid config", async () => {
      const { hasValidVeloeraConfig } = await import(
        "~/services/managedSites/providers/veloera"
      )

      expect(
        hasValidVeloeraConfig(
          createMockUserPreferencesWithVeloera() as unknown as Parameters<
            typeof hasValidVeloeraConfig
          >[0],
        ),
      ).toBe(true)
    })

    it("returns false when prefs is null", async () => {
      const { hasValidVeloeraConfig } = await import(
        "~/services/managedSites/providers/veloera"
      )

      expect(hasValidVeloeraConfig(null)).toBe(false)
    })

    it("returns false when required fields are missing", async () => {
      const { hasValidVeloeraConfig } = await import(
        "~/services/managedSites/providers/veloera"
      )

      const cases = [
        { veloera: { adminToken: "token", userId: "user" } },
        { veloera: { baseUrl: "url", userId: "user" } },
        { veloera: { baseUrl: "url", adminToken: "token" } },
        { veloera: { baseUrl: "", adminToken: "token", userId: "user" } },
      ]

      for (const prefs of cases) {
        expect(
          hasValidVeloeraConfig({
            ...createMockUserPreferencesWithVeloera(),
            ...prefs,
          } as unknown as Parameters<typeof hasValidVeloeraConfig>[0]),
        ).toBe(false)
      }
    })
  })

  describe("getVeloeraConfig", () => {
    it("returns config when preferences are valid", async () => {
      const { getVeloeraConfig } = await import(
        "~/services/managedSites/providers/veloera"
      )

      mockGetPreferences.mockResolvedValueOnce(
        createMockUserPreferencesWithVeloera(),
      )

      const result = await getVeloeraConfig()
      expect(result).toEqual({
        baseUrl: "https://veloera.example.com",
        token: "admin-token-123",
        userId: "user-123",
      })
    })

    it("returns null when preferences are invalid", async () => {
      const { getVeloeraConfig } = await import(
        "~/services/managedSites/providers/veloera"
      )

      mockGetPreferences.mockResolvedValueOnce(
        createMockUserPreferencesWithVeloera({
          veloera: { baseUrl: "", adminToken: "", userId: "" },
        }),
      )

      const result = await getVeloeraConfig()
      expect(result).toBeNull()
    })
  })

  describe("searchChannel/createChannel/updateChannel/deleteChannel", () => {
    it("passes VELOERA site hint to apiService wrappers", async () => {
      const { searchChannel, createChannel, updateChannel, deleteChannel } =
        await import("~/services/managedSites/providers/veloera")

      mockSearchChannel.mockResolvedValueOnce(null)
      await searchChannel("https://veloera.example.com", "token", "1", "k")
      expect(mockSearchChannel).toHaveBeenLastCalledWith(
        {
          baseUrl: "https://veloera.example.com",
          auth: {
            authType: "access_token",
            accessToken: "token",
            userId: "1",
          },
        },
        "k",
      )

      mockCreateChannel.mockResolvedValueOnce({ success: true, message: "ok" })
      const createPayload: CreateChannelPayload = {
        mode: "none" as unknown as CreateChannelPayload["mode"],
        channel: {
          name: "n",
          type: 1,
          key: "k",
          base_url: "https://upstream.example.com",
          models: "gpt-4",
          groups: ["default"],
          priority: 0,
          weight: 0,
          status: 1,
        },
      }
      await createChannel(
        "https://veloera.example.com",
        "token",
        "1",
        createPayload,
      )
      expect(mockCreateChannel).toHaveBeenLastCalledWith(
        {
          baseUrl: "https://veloera.example.com",
          auth: {
            authType: "access_token",
            accessToken: "token",
            userId: "1",
          },
        },
        createPayload,
      )

      mockUpdateChannel.mockResolvedValueOnce({ success: true, message: "ok" })
      const updatePayload: UpdateChannelPayload = {
        id: 1,
        name: "Updated Channel",
        key: "k",
        base_url: "https://upstream.example.com",
        models: "gpt-4",
        group: "default",
        groups: ["default"],
        priority: 0,
      }
      await updateChannel(
        "https://veloera.example.com",
        "token",
        "1",
        updatePayload,
      )
      expect(mockUpdateChannel).toHaveBeenLastCalledWith(
        {
          baseUrl: "https://veloera.example.com",
          auth: {
            authType: "access_token",
            accessToken: "token",
            userId: "1",
          },
        },
        updatePayload,
      )

      mockDeleteChannel.mockResolvedValueOnce({ success: true, message: "ok" })
      await deleteChannel("https://veloera.example.com", "token", "1", 1)
      expect(mockDeleteChannel).toHaveBeenLastCalledWith(
        {
          baseUrl: "https://veloera.example.com",
          auth: {
            authType: "access_token",
            accessToken: "token",
            userId: "1",
          },
        },
        1,
      )
    })
  })

  describe("fetchChannelSecretKey", () => {
    it("fetches the full channel key from channel detail", async () => {
      const { fetchChannelSecretKey } = await import(
        "~/services/managedSites/providers/veloera"
      )

      mockFetchVeloeraChannel.mockResolvedValueOnce({
        id: 88,
        key: "sk-veloera-channel-key",
      })

      const result = await fetchChannelSecretKey(
        "https://veloera.example.com",
        "token",
        "1",
        88,
      )

      expect(mockFetchVeloeraChannel).toHaveBeenCalledWith(
        {
          baseUrl: "https://veloera.example.com",
          auth: {
            authType: "access_token",
            accessToken: "token",
            userId: "1",
          },
        },
        88,
      )
      expect(result).toBe("sk-veloera-channel-key")
    })
  })

  describe("prepareChannelFormData", () => {
    it("falls back to token.models when the live model probe fails", async () => {
      const { prepareChannelFormData } = await import(
        "~/services/managedSites/providers/veloera"
      )
      const account = createMockDisplaySiteData()
      const token = createMockApiToken({ models: "gpt-4,gpt-3.5" })

      mockGetPreferences.mockResolvedValueOnce(
        createMockUserPreferencesWithVeloera(),
      )
      mockFetchOpenAICompatibleModelIds.mockRejectedValueOnce(
        new Error("Upstream failed"),
      )

      const result = await prepareChannelFormData(account, token)

      expect(result.models).toEqual(["gpt-4", "gpt-3.5"])
      expect(result.modelPrefillFetchFailed).toBe(true)
    })

    it("falls back to token.models when the live model probe returns empty", async () => {
      const { prepareChannelFormData } = await import(
        "~/services/managedSites/providers/veloera"
      )
      const account = createMockDisplaySiteData()
      const token = createMockApiToken({ models: "gpt-4o-mini,gpt-4o" })

      mockGetPreferences.mockResolvedValueOnce(
        createMockUserPreferencesWithVeloera(),
      )
      mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce([])

      const result = await prepareChannelFormData(account, token)

      expect(result.models).toEqual(["gpt-4o-mini", "gpt-4o"])
      expect(result.modelPrefillFetchFailed).toBeUndefined()
    })
  })
})
