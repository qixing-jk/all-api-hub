import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
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

vi.mock("~/services/apiService/veloera", () => ({
  fetchAccountAvailableModels: (...args: unknown[]) =>
    mockFetchAccountAvailableModels(...args),
  searchChannel: (...args: unknown[]) => mockSearchChannel(...args),
  createChannel: (...args: unknown[]) => mockCreateChannel(...args),
  updateChannel: (...args: unknown[]) => mockUpdateChannel(...args),
  deleteChannel: (...args: unknown[]) => mockDeleteChannel(...args),
  fetchAccountData: vi.fn(),
  fetchChannel: (...args: unknown[]) => mockFetchVeloeraChannel(...args),
  refreshAccountData: vi.fn(),
}))

vi.mock("~/services/aiApi/openaiCompatible", () => ({
  fetchOpenAICompatibleModelIds: mockFetchOpenAICompatibleModelIds,
}))

const mockGetPreferences = vi.fn()
vi.mock("~/services/preferences/userPreferences", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/preferences/userPreferences")
    >()
  return {
    ...actual,
    userPreferences: {
      ...actual.userPreferences,
      getPreferences: mockGetPreferences,
    },
  }
})

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
      userId: "123",
    },
    ...overrides,
  }
}

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
    siteType: SITE_TYPES.VELOERA,
    baseUrl: "https://api.example.com",
    token: "access-token",
    userId: "1",
    authType: "access_token" as any,
    checkIn: { enableDetection: false },
    ...overrides,
  }
}

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

function createMockManagedSiteChannel(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    type: 1,
    key: "",
    name: "Test Channel",
    base_url: "https://example.com",
    models: "",
    status: 1,
    weight: 0,
    priority: 0,
    openai_organization: null,
    test_model: null,
    created_time: 1700000000,
    test_time: 0,
    response_time: 0,
    other: "",
    balance: 0,
    balance_updated_time: 0,
    group: "default",
    used_quota: 0,
    model_mapping: "{}",
    status_code_mapping: "{}",
    auto_ban: 0,
    other_info: "{}",
    tag: null,
    param_override: null,
    header_override: null,
    remark: null,
    channel_info: {
      is_multi_key: false,
      multi_key_size: 0,
      multi_key_status_list: null,
      multi_key_polling_index: 0,
      multi_key_mode: "",
    },
    setting: "{}",
    settings: "{}",
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
        { veloera: { adminToken: "token", userId: "123" } },
        { veloera: { baseUrl: "url", userId: "123" } },
        { veloera: { baseUrl: "url", adminToken: "token" } },
        { veloera: { baseUrl: "", adminToken: "token", userId: "123" } },
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
        adminToken: "admin-token-123",
        userId: "123",
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
    it("passes SITE_TYPES.VELOERA site hint to apiService wrappers", async () => {
      const { searchChannel, createChannel, updateChannel, deleteChannel } =
        await import("~/services/managedSites/providers/veloera")
      const config = {
        baseUrl: "https://veloera.example.com",
        adminToken: "token",
        userId: "1",
      }

      mockSearchChannel.mockResolvedValueOnce(null)
      await searchChannel(config, "k")
      expect(mockSearchChannel).toHaveBeenLastCalledWith(
        {
          baseUrl: config.baseUrl,
          auth: {
            authType: "access_token",
            accessToken: config.adminToken,
            userId: config.userId,
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
      await createChannel(config, createPayload)
      expect(mockCreateChannel).toHaveBeenLastCalledWith(
        {
          baseUrl: config.baseUrl,
          auth: {
            authType: "access_token",
            accessToken: config.adminToken,
            userId: config.userId,
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
      await updateChannel(config, updatePayload)
      expect(mockUpdateChannel).toHaveBeenLastCalledWith(
        {
          baseUrl: config.baseUrl,
          auth: {
            authType: "access_token",
            accessToken: config.adminToken,
            userId: config.userId,
          },
        },
        updatePayload,
      )

      mockDeleteChannel.mockResolvedValueOnce({ success: true, message: "ok" })
      await deleteChannel(config, 1)
      expect(mockDeleteChannel).toHaveBeenLastCalledWith(
        {
          baseUrl: config.baseUrl,
          auth: {
            authType: "access_token",
            accessToken: config.adminToken,
            userId: config.userId,
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
      const config = {
        baseUrl: "https://veloera.example.com",
        adminToken: "token",
        userId: "1",
      }

      mockFetchVeloeraChannel.mockResolvedValueOnce({
        id: 88,
        key: "sk-veloera-channel-key",
      })

      const result = await fetchChannelSecretKey(config, 88)

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

  describe("hydrateComparableChannelKeys", () => {
    it("preserves visible keys and hydrates hidden Veloera candidate ids", async () => {
      const { hydrateComparableChannelKeys } = await import(
        "~/services/managedSites/providers/veloera"
      )
      const config = {
        baseUrl: "https://veloera.example.com",
        adminToken: "admin-token",
        userId: "1",
      }

      mockFetchVeloeraChannel.mockResolvedValueOnce({
        id: 40,
        key: "sk-veloera-detail",
      })

      const result = await hydrateComparableChannelKeys(config, [
        createMockManagedSiteChannel({ id: 40, key: "" }) as any,
        createMockManagedSiteChannel({ id: 41, key: "sk-visible" }) as any,
      ])

      expect(mockFetchVeloeraChannel).toHaveBeenCalledTimes(1)
      expect(mockFetchVeloeraChannel).toHaveBeenCalledWith(
        expect.any(Object),
        40,
      )
      expect(result).toEqual([
        expect.objectContaining({ id: 40, key: "sk-veloera-detail" }),
        expect.objectContaining({ id: 41, key: "sk-visible" }),
      ])
    })

    it("maps Veloera hidden-key hydration failures to unresolved key resolution", async () => {
      const { hydrateComparableChannelKeys } = await import(
        "~/services/managedSites/providers/veloera"
      )
      const { MatchResolutionUnresolvedError } = await import(
        "~/services/managedSites/channelMatch"
      )
      const config = {
        baseUrl: "https://veloera.example.com",
        adminToken: "admin-token",
        userId: "1",
      }

      mockFetchVeloeraChannel.mockRejectedValueOnce(
        new Error("detail unavailable"),
      )

      await expect(
        hydrateComparableChannelKeys(config, [
          createMockManagedSiteChannel({ id: 42, key: "" }) as any,
        ]),
      ).rejects.toBeInstanceOf(MatchResolutionUnresolvedError)
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

    it("uses the AIHubMix API origin for managed-site channel imports", async () => {
      const { prepareChannelFormData } = await import(
        "~/services/managedSites/providers/veloera"
      )
      const account = createMockDisplaySiteData({
        siteType: SITE_TYPES.AIHUBMIX,
        baseUrl: "https://console.aihubmix.com",
      })
      const token = createMockApiToken({ models: "fallback-model" })

      mockGetPreferences.mockResolvedValueOnce(
        createMockUserPreferencesWithVeloera(),
      )
      mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce([
        "gpt-aihubmix-mini",
      ])

      const result = await prepareChannelFormData(account, token)

      expect(mockFetchOpenAICompatibleModelIds).toHaveBeenCalledWith({
        baseUrl: "https://aihubmix.com",
        apiKey: token.key,
      })
      expect(result.base_url).toBe("https://aihubmix.com")
    })
  })
})
