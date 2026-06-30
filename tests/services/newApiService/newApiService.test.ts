import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS } from "~/services/managedSites/channelMatch"
import type { ApiToken, DisplaySiteData } from "~/types"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import type {
  ChannelFormData,
  CreateChannelPayload,
  UpdateChannelPayload,
} from "~/types/newApi"

// ============================================================================
// MOCKS
// ============================================================================

const { fetchNewApiChannelKeyMock } = vi.hoisted(() => ({
  fetchNewApiChannelKeyMock: vi.fn(),
}))

// Mock react-hot-toast
const mockToast = {
  loading: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}
vi.mock("react-hot-toast", () => ({
  default: mockToast,
}))

// Mock API service functions
const mockFetchApi = vi.fn()
const mockFetchApiData = vi.fn()
vi.mock("~/services/apiService/common/utils", () => ({
  fetchApi: mockFetchApi,
  fetchApiData: mockFetchApiData,
}))

// Mock ApiError
class MockApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ApiError"
  }
}
vi.mock("~/services/apiTransport/errors", () => ({
  ApiError: MockApiError,
}))

// Mock higher-level API service functions
const mockFetchAccountAvailableModels = vi.fn()
const mockFetchOpenAICompatibleModelIds = vi.fn()
const mockFetchSiteUserGroups = vi.fn()
const mockSearchChannel = vi.fn()
const mockCreateChannel = vi.fn()
const mockUpdateChannel = vi.fn()
const mockDeleteChannel = vi.fn()
vi.mock(
  "~/services/apiService/newApiFamily/default/keyManagement",
  async () => {
    const actual = await vi.importActual<
      typeof import("~/services/apiService/newApiFamily/default/keyManagement")
    >("~/services/apiService/newApiFamily/default/keyManagement")

    return {
      ...actual,
      fetchAccountAvailableModels: mockFetchAccountAvailableModels,
      fetchSiteUserGroups: mockFetchSiteUserGroups,
    }
  },
)

vi.mock("~/services/apiService/newApiFamily/channelManagement", async () => {
  const actual = await vi.importActual<
    typeof import("~/services/apiService/newApiFamily/channelManagement")
  >("~/services/apiService/newApiFamily/channelManagement")

  mockSearchChannel.mockImplementation(actual.searchChannel)
  mockCreateChannel.mockImplementation(actual.createChannel)
  mockUpdateChannel.mockImplementation(actual.updateChannel)
  mockDeleteChannel.mockImplementation(actual.deleteChannel)

  return {
    ...actual,
    searchChannel: mockSearchChannel,
    createChannel: mockCreateChannel,
    updateChannel: mockUpdateChannel,
    deleteChannel: mockDeleteChannel,
  }
})

vi.mock("~/services/aiApi/openaiCompatible", () => ({
  fetchOpenAICompatibleModelIds: mockFetchOpenAICompatibleModelIds,
}))

// Mock user preferences
const mockGetPreferences = vi.fn()
const mockSavePreferences = vi.fn()
vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: {
    getPreferences: mockGetPreferences,
    savePreferences: mockSavePreferences,
  },
}))

vi.mock(
  "~/services/managedSites/providers/newApiSession",
  async (importOriginal) => {
    const actual =
      (await importOriginal()) as typeof import("~/services/managedSites/providers/newApiSession")

    return {
      ...actual,
      fetchNewApiChannelKey: (...args: unknown[]) =>
        fetchNewApiChannelKeyMock(...args),
    }
  },
)

// ============================================================================
// FIXTURES
// ============================================================================

/**
 * Creates a mock DisplaySiteData object with sensible defaults for tests.
 */
function createMockDisplaySiteData(
  overrides?: Partial<DisplaySiteData>,
): DisplaySiteData {
  return {
    id: "site-1",
    icon: "🔑",
    name: "Test Site",
    username: "testuser",
    balance: { USD: 100, CNY: 0 },
    todayConsumption: { USD: 10, CNY: 0 },
    todayIncome: { USD: 0, CNY: 0 },
    todayTokens: { upload: 1000, download: 2000 },
    health: { status: SiteHealthStatus.Healthy },
    last_sync_time: Date.now(),
    siteType: SITE_TYPES.UNKNOWN,
    baseUrl: "https://api.example.com",
    token: "test-token-123",
    userId: "1",
    authType: AuthTypeEnum.AccessToken,
    checkIn: { enableDetection: false },
    ...overrides,
  }
}

/**
 * Creates a mock ApiToken instance representing a typical API key record.
 */
function createMockApiToken(overrides?: Partial<ApiToken>): ApiToken {
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

/**
 * Creates a UserPreferences object wired with New API configuration fields.
 */
function createMockUserPreferencesWithNewApi(overrides?: any) {
  return {
    themeMode: "auto" as const,
    language: "en",
    activeTab: "balance" as const,
    currencyType: "USD" as const,
    sortField: "name" as const,
    sortOrder: "asc" as const,
    accountAutoRefresh: {
      enabled: false,
      interval: 300000,
      minInterval: 60000,
      refreshOnOpen: true,
    },
    showHealthStatus: false,
    webdav: {
      enabled: false,
      url: "",
      username: "",
      password: "",
    },
    newApi: {
      baseUrl: "https://new-api.example.com",
      adminToken: "admin-token-123",
      userId: "123",
    },
    managedSiteModelSync: {
      enabled: false,
      interval: 3600000,
      concurrency: 5,
      maxRetries: 3,
      rateLimit: { requestsPerMinute: 60, burst: 10 },
      allowedModels: [],
      globalChannelModelFilters: [],
    },
    autoCheckin: { enabled: false },
    modelRedirect: { enabled: false, customMappings: [] },
    preferencesVersion: 7,
    ...overrides,
  }
}

/**
 * Creates a representative New API channel structure used in service tests.
 */
function createMockNewApiChannel(overrides?: any) {
  return {
    id: 1,
    type: 1,
    key: "",
    name: "Test Channel (auto)",
    base_url: "https://api.example.com",
    models: "gpt-4,gpt-3.5-turbo",
    status: 1,
    weight: 0,
    priority: 0,
    openai_organization: null,
    test_model: null,
    created_time: Math.floor(Date.now() / 1000),
    test_time: 0,
    response_time: 0,
    other: "",
    balance: 0,
    balance_updated_time: 0,
    group: "default",
    used_quota: 0,
    model_mapping: "",
    status_code_mapping: "",
    auto_ban: 0,
    other_info: "",
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
    setting: "",
    settings: "",
    ...overrides,
  }
}

/**
 * Wraps one or more New API channels into a list payload returned by search.
 */
function createMockNewApiChannelListData(channels?: any[]) {
  return {
    items: channels || [createMockNewApiChannel()],
    total: channels?.length || 1,
    type_counts: { 1: channels?.length || 1 },
  }
}

// ============================================================================
// TESTS
// ============================================================================

describe("newApiService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchNewApiChannelKeyMock.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ========================================================================
  // searchChannel
  // ========================================================================

  describe("searchChannel", () => {
    it("should return channel list data on success", async () => {
      const { searchChannel } = await import(
        "~/services/apiService/newApiFamily/channelManagement"
      )
      const mockChannelData = createMockNewApiChannelListData([
        createMockNewApiChannel({ id: 1, name: "Channel 1" }),
        createMockNewApiChannel({ id: 2, name: "Channel 2" }),
      ])

      mockFetchApiData.mockResolvedValueOnce(mockChannelData)

      const request = {
        baseUrl: "https://api.example.com",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "admin-token",
          userId: "user-123",
        },
      }
      const result = await searchChannel(
        request as any,
        "https://api.example.com",
      )

      expect(result).toEqual(mockChannelData)
      expect(mockFetchApiData).toHaveBeenCalledWith(request, {
        endpoint: "/api/channel/search?keyword=https%3A%2F%2Fapi.example.com",
      })
    })

    it("should return null when ApiError is thrown", async () => {
      const { searchChannel } = await import(
        "~/services/apiService/newApiFamily/channelManagement"
      )
      const error = new MockApiError("API request failed")

      mockFetchApiData.mockRejectedValueOnce(error)

      const request = {
        baseUrl: "https://api.example.com",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "admin-token",
          userId: "user-123",
        },
      }
      const result = await searchChannel(request as any, "keyword")

      expect(result).toBeNull()
    })

    it("should return null when other error is thrown", async () => {
      const { searchChannel } = await import(
        "~/services/apiService/newApiFamily/channelManagement"
      )
      const error = new Error("Network error")

      mockFetchApiData.mockRejectedValueOnce(error)

      const request = {
        baseUrl: "https://api.example.com",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "admin-token",
          userId: "user-123",
        },
      }
      const result = await searchChannel(request as any, "keyword")

      expect(result).toBeNull()
    })
  })

  // ========================================================================
  // createChannel
  // ========================================================================

  describe("createChannel", () => {
    it("should create channel successfully", async () => {
      const { createChannel } = await import(
        "~/services/apiService/newApiFamily/channelManagement"
      )
      const payload: CreateChannelPayload = {
        mode: "single",
        channel: {
          name: "Test Channel",
          type: 1,
          key: "sk-test",
          base_url: "https://api.example.com",
          models: "gpt-4",
          groups: ["default"],
          priority: 0,
          weight: 0,
          status: 1,
        },
      }

      mockFetchApi.mockResolvedValueOnce({ success: true })

      const request = {
        baseUrl: "https://api.example.com",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "admin-token",
          userId: "user-123",
        },
      }
      const result = await createChannel(request as any, payload)

      expect(result).toEqual({ success: true })
      expect(mockFetchApi).toHaveBeenCalledWith(
        request,
        expect.objectContaining({
          endpoint: "/api/channel/",
          options: expect.objectContaining({
            method: "POST",
            body: expect.stringContaining('"name":"Test Channel"'),
          }),
        }),
      )
    })

    it("should throw error when creation fails", async () => {
      const { createChannel } = await import(
        "~/services/apiService/newApiFamily/channelManagement"
      )
      const payload: CreateChannelPayload = {
        mode: "single",
        channel: {
          name: "Test",
          type: 1,
          key: "sk-test",
          base_url: "https://api.example.com",
          models: "gpt-4",
          groups: ["default"],
          priority: 0,
          weight: 0,
          status: 1,
        },
      }

      mockFetchApi.mockRejectedValueOnce(new Error("API error"))

      const request = {
        baseUrl: "https://api.example.com",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "admin-token",
          userId: "user-123",
        },
      }
      await expect(createChannel(request as any, payload)).rejects.toThrow(
        "创建渠道失败，请检查网络或 New API 配置。",
      )
    })

    it("should join groups in payload", async () => {
      const { createChannel } = await import(
        "~/services/apiService/newApiFamily/channelManagement"
      )
      const payload: CreateChannelPayload = {
        mode: "single",
        channel: {
          name: "Test",
          type: 1,
          key: "sk-test",
          base_url: "https://api.example.com",
          models: "gpt-4",
          groups: ["group1", "group2"],
          priority: 0,
          weight: 0,
          status: 1,
        },
      }

      mockFetchApi.mockResolvedValueOnce({ success: true })

      const request = {
        baseUrl: "https://api.example.com",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "admin-token",
          userId: "user-123",
        },
      }

      await createChannel(request as any, payload)

      const callArgs = mockFetchApi.mock.calls[0][1]
      const bodyObj = JSON.parse(callArgs.options.body)
      expect(bodyObj.channel.group).toBe("group1,group2")
    })
  })

  // ========================================================================
  // updateChannel
  // ========================================================================

  describe("updateChannel", () => {
    it("should update channel successfully", async () => {
      const { updateChannel } = await import(
        "~/services/apiService/newApiFamily/channelManagement"
      )
      const updateData = { id: 1, name: "Updated Name" }

      mockFetchApi.mockResolvedValueOnce({ success: true })

      const request = {
        baseUrl: "https://api.example.com",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "admin-token",
          userId: "user-123",
        },
      }

      const result = await updateChannel(request as any, updateData as any)

      expect(result).toEqual({ success: true })
      expect(mockFetchApi).toHaveBeenCalledWith(
        request,
        expect.objectContaining({
          endpoint: "/api/channel/",
          options: {
            method: "PUT",
            body: JSON.stringify(updateData),
          },
        }),
      )
    })

    it("should throw error when update fails", async () => {
      const { updateChannel } = await import(
        "~/services/apiService/newApiFamily/channelManagement"
      )

      mockFetchApi.mockRejectedValueOnce(new Error("API error"))

      const request = {
        baseUrl: "https://api.example.com",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "admin-token",
          userId: "user-123",
        },
      }

      await expect(
        updateChannel(
          request as any,
          {
            id: 1,
            name: "Updated",
          } as any,
        ),
      ).rejects.toThrow("更新渠道失败，请检查网络或 New API 配置。")
    })
  })

  // ========================================================================
  // hasValidNewApiConfig
  // ========================================================================

  describe("hasValidNewApiConfig", () => {
    it("should return true with valid config", async () => {
      const { hasValidNewApiConfig } = await import(
        "~/services/managedSites/providers/newApi"
      )
      const prefs = createMockUserPreferencesWithNewApi()

      expect(hasValidNewApiConfig(prefs)).toBe(true)
    })

    it("should return false when prefs is null", async () => {
      const { hasValidNewApiConfig } = await import(
        "~/services/managedSites/providers/newApi"
      )

      expect(hasValidNewApiConfig(null)).toBe(false)
    })

    it("should return false when managedSite is missing", async () => {
      const { hasValidNewApiConfig } = await import(
        "~/services/managedSites/providers/newApi"
      )
      const prefs = createMockUserPreferencesWithNewApi()
      delete prefs.newApi

      expect(hasValidNewApiConfig(prefs)).toBe(false)
    })

    it("should return false when required fields are missing", async () => {
      const { hasValidNewApiConfig } = await import(
        "~/services/managedSites/providers/newApi"
      )

      const cases = [
        { newApi: { adminToken: "token", userId: "123" } },
        { newApi: { baseUrl: "url", userId: "123" } },
        { newApi: { baseUrl: "url", adminToken: "token" } },
        { newApi: { baseUrl: "", adminToken: "token", userId: "123" } },
      ]

      for (const prefs of cases) {
        expect(
          hasValidNewApiConfig({
            ...createMockUserPreferencesWithNewApi(),
            ...prefs,
          }),
        ).toBe(false)
      }
    })

    it("should return false when the admin user ID is not numeric", async () => {
      const { hasValidNewApiConfig } = await import(
        "~/services/managedSites/providers/newApi"
      )

      expect(
        hasValidNewApiConfig(
          createMockUserPreferencesWithNewApi({
            newApi: {
              baseUrl: "https://new-api.example.com",
              adminToken: "admin-token-123",
              userId: "abc",
            },
          }),
        ),
      ).toBe(false)
    })
  })

  // ========================================================================
  // checkValidNewApiConfig
  // ========================================================================

  describe("checkValidNewApiConfig", () => {
    it("should return true with valid config", async () => {
      const { checkValidNewApiConfig } = await import(
        "~/services/managedSites/providers/newApi"
      )
      mockGetPreferences.mockResolvedValueOnce(
        createMockUserPreferencesWithNewApi(),
      )

      const result = await checkValidNewApiConfig()

      expect(result).toBe(true)
    })

    it("should return false with invalid config", async () => {
      const { checkValidNewApiConfig } = await import(
        "~/services/managedSites/providers/newApi"
      )
      mockGetPreferences.mockResolvedValueOnce(
        createMockUserPreferencesWithNewApi({
          newApi: { baseUrl: "", adminToken: "", userId: "" },
        }),
      )

      const result = await checkValidNewApiConfig()

      expect(result).toBe(false)
    })

    it("should return false when the stored admin user ID is not numeric", async () => {
      const { checkValidNewApiConfig } = await import(
        "~/services/managedSites/providers/newApi"
      )
      mockGetPreferences.mockResolvedValueOnce(
        createMockUserPreferencesWithNewApi({
          newApi: {
            baseUrl: "https://new-api.example.com",
            adminToken: "admin-token-123",
            userId: "abc",
          },
        }),
      )

      const result = await checkValidNewApiConfig()

      expect(result).toBe(false)
    })

    it("should return false when getPreferences throws error", async () => {
      const { checkValidNewApiConfig } = await import(
        "~/services/managedSites/providers/newApi"
      )
      mockGetPreferences.mockRejectedValueOnce(new Error("Storage error"))

      const result = await checkValidNewApiConfig()

      expect(result).toBe(false)
    })
  })

  // ========================================================================
  // getNewApiConfig
  // ========================================================================

  describe("getNewApiConfig", () => {
    it("should return config when valid", async () => {
      const { getNewApiConfig } = await import(
        "~/services/managedSites/providers/newApi"
      )
      mockGetPreferences.mockResolvedValueOnce(
        createMockUserPreferencesWithNewApi(),
      )

      const result = await getNewApiConfig()

      expect(result).toEqual({
        baseUrl: "https://new-api.example.com",
        adminToken: "admin-token-123",
        userId: "123",
      })
    })

    it("should return null when config is invalid", async () => {
      const { getNewApiConfig } = await import(
        "~/services/managedSites/providers/newApi"
      )
      mockGetPreferences.mockResolvedValueOnce(null)

      const result = await getNewApiConfig()

      expect(result).toBeNull()
    })

    it("should return null when getPreferences throws error", async () => {
      const { getNewApiConfig } = await import(
        "~/services/managedSites/providers/newApi"
      )
      mockGetPreferences.mockRejectedValueOnce(new Error("Storage error"))

      const result = await getNewApiConfig()

      expect(result).toBeNull()
    })
  })

  // ========================================================================
  // getNewApiLoginAssistConfig
  // ========================================================================

  describe("getNewApiLoginAssistConfig", () => {
    it("should return login-assist fields and default blank optional values", async () => {
      const { getNewApiLoginAssistConfig } = await import(
        "~/services/managedSites/providers/newApi"
      )

      mockGetPreferences.mockResolvedValueOnce(
        createMockUserPreferencesWithNewApi({
          newApi: {
            baseUrl: "https://new-api.example.com/admin",
            adminToken: "admin-token-123",
            userId: "user-123",
          },
        }),
      )

      await expect(getNewApiLoginAssistConfig()).resolves.toEqual({
        baseUrl: "https://new-api.example.com/admin",
        username: "",
        password: "",
        totpSecret: "",
      })
    })

    it("should return null when the configured base URL is missing", async () => {
      const { getNewApiLoginAssistConfig } = await import(
        "~/services/managedSites/providers/newApi"
      )

      mockGetPreferences.mockResolvedValueOnce(
        createMockUserPreferencesWithNewApi({
          newApi: {
            baseUrl: "",
            adminToken: "admin-token-123",
            userId: "user-123",
            username: "alice",
            password: "secret",
            totpSecret: "otp-secret",
          },
        }),
      )

      await expect(getNewApiLoginAssistConfig()).resolves.toBeNull()
    })

    it("should return null when reading login-assist config fails", async () => {
      const { getNewApiLoginAssistConfig } = await import(
        "~/services/managedSites/providers/newApi"
      )

      mockGetPreferences.mockRejectedValueOnce(new Error("Storage error"))

      await expect(getNewApiLoginAssistConfig()).resolves.toBeNull()
    })
  })

  // ========================================================================
  // fetchChannelSecretKey
  // ========================================================================

  describe("fetchChannelSecretKey", () => {
    it("should reuse login-assist credentials when the managed site shares the configured origin", async () => {
      const { fetchChannelSecretKey } = await import(
        "~/services/managedSites/providers/newApi"
      )
      const config = {
        baseUrl: "https://new-api.example.com/api/v1",
        adminToken: "ignored-admin-token",
        userId: "managed-user",
      }

      mockGetPreferences.mockResolvedValueOnce(
        createMockUserPreferencesWithNewApi({
          newApi: {
            baseUrl: "https://new-api.example.com/admin",
            adminToken: "admin-token-123",
            userId: "user-123",
            username: "alice",
            password: "secret",
            totpSecret: "otp-secret",
          },
        }),
      )
      fetchNewApiChannelKeyMock.mockResolvedValueOnce("resolved-secret")

      await expect(fetchChannelSecretKey(config, 99)).resolves.toBe(
        "resolved-secret",
      )

      expect(fetchNewApiChannelKeyMock).toHaveBeenCalledWith({
        baseUrl: "https://new-api.example.com/api/v1",
        userId: "managed-user",
        username: "alice",
        password: "secret",
        totpSecret: "otp-secret",
        channelId: 99,
      })
    })

    it("should avoid reusing login-assist credentials when the managed site origin differs", async () => {
      const { fetchChannelSecretKey } = await import(
        "~/services/managedSites/providers/newApi"
      )
      const config = {
        baseUrl: "https://other.example.com/api/v1",
        adminToken: "ignored-admin-token",
        userId: "managed-user",
      }

      mockGetPreferences.mockResolvedValueOnce(
        createMockUserPreferencesWithNewApi({
          newApi: {
            baseUrl: "https://new-api.example.com/admin",
            adminToken: "admin-token-123",
            userId: "user-123",
            username: "alice",
            password: "secret",
            totpSecret: "otp-secret",
          },
        }),
      )
      fetchNewApiChannelKeyMock.mockResolvedValueOnce("resolved-secret")

      await fetchChannelSecretKey(config, 100)

      expect(fetchNewApiChannelKeyMock).toHaveBeenCalledWith({
        baseUrl: "https://other.example.com/api/v1",
        userId: "managed-user",
        username: "",
        password: "",
        totpSecret: "",
        channelId: 100,
      })
    })
  })

  describe("hydrateComparableChannelKeys", () => {
    it("should preserve visible New API candidate keys without fetching", async () => {
      const { hydrateComparableChannelKeys } = await import(
        "~/services/managedSites/providers/newApi"
      )
      const config = {
        baseUrl: "https://new-api.example.com",
        adminToken: "admin-token",
        userId: "1",
      }

      mockGetPreferences.mockResolvedValueOnce(
        createMockUserPreferencesWithNewApi(),
      )

      const result = await hydrateComparableChannelKeys(config, [
        createMockNewApiChannel({
          id: 11,
          key: "sk-visible",
        }),
      ])

      expect(fetchNewApiChannelKeyMock).not.toHaveBeenCalled()
      expect(result).toEqual([
        expect.objectContaining({
          id: 11,
          key: "sk-visible",
        }),
      ])
    })

    it("should hydrate hidden New API candidate keys for comparison", async () => {
      const { hydrateComparableChannelKeys } = await import(
        "~/services/managedSites/providers/newApi"
      )
      const config = {
        baseUrl: "https://new-api.example.com",
        adminToken: "admin-token",
        userId: "1",
      }

      mockGetPreferences.mockResolvedValueOnce(
        createMockUserPreferencesWithNewApi(),
      )
      fetchNewApiChannelKeyMock.mockResolvedValueOnce("sk-revealed")

      const result = await hydrateComparableChannelKeys(config, [
        createMockNewApiChannel({
          id: 12,
          key: "",
          base_url: "https://api.example.com/v1",
          models: "gpt-4o",
        }),
      ])

      expect(result).toEqual([
        expect.objectContaining({
          id: 12,
          key: "sk-revealed",
        }),
      ])
    })

    it("should map New API verification requirements during hydration", async () => {
      const { hydrateComparableChannelKeys } = await import(
        "~/services/managedSites/providers/newApi"
      )
      const { MatchResolutionUnresolvedError } = await import(
        "~/services/managedSites/channelMatch"
      )
      const {
        NEW_API_CHANNEL_KEY_ERROR_KINDS,
        NewApiChannelKeyRequirementError,
      } = await import("~/services/managedSites/providers/newApiSession")
      const config = {
        baseUrl: "https://new-api.example.com",
        adminToken: "admin-token",
        userId: "1",
      }

      mockGetPreferences.mockResolvedValueOnce(
        createMockUserPreferencesWithNewApi(),
      )
      fetchNewApiChannelKeyMock.mockRejectedValueOnce(
        new NewApiChannelKeyRequirementError(
          NEW_API_CHANNEL_KEY_ERROR_KINDS.SECURE_VERIFICATION_REQUIRED,
        ),
      )

      await expect(
        hydrateComparableChannelKeys(config, [
          createMockNewApiChannel({ id: 13, key: "" }),
        ]),
      ).rejects.toMatchObject({
        name: MatchResolutionUnresolvedError.name,
        reason:
          MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.VERIFICATION_REQUIRED,
      })
    })

    it("should map unexpected New API hydration failures to unresolved key resolution", async () => {
      const { hydrateComparableChannelKeys } = await import(
        "~/services/managedSites/providers/newApi"
      )
      const { MatchResolutionUnresolvedError } = await import(
        "~/services/managedSites/channelMatch"
      )
      const config = {
        baseUrl: "https://new-api.example.com",
        adminToken: "admin-token",
        userId: "1",
      }

      mockGetPreferences.mockResolvedValueOnce(
        createMockUserPreferencesWithNewApi(),
      )
      fetchNewApiChannelKeyMock.mockRejectedValueOnce(
        new Error("backend unavailable"),
      )

      await expect(
        hydrateComparableChannelKeys(config, [
          createMockNewApiChannel({ id: 14, key: "" }),
        ]),
      ).rejects.toMatchObject({
        name: MatchResolutionUnresolvedError.name,
        reason:
          MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.KEY_RESOLUTION_FAILED,
      })
    })
  })

  // ========================================================================
  // fetchAvailableModels
  // ========================================================================

  describe("fetchAvailableModels", () => {
    it("should ignore token.models metadata and return live upstream models", async () => {
      const { fetchAvailableModels } = await import(
        "~/services/managedSites/providers/newApi"
      )
      const account = createMockDisplaySiteData()
      const token = createMockApiToken({ models: "declared-a,declared-b" })

      mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(["gpt-4o-mini"])

      const result = await fetchAvailableModels(account, token, {
        fetchAccountAvailableModels: mockFetchAccountAvailableModels,
      })

      expect(result).toEqual(["gpt-4o-mini"])
    })

    it("should return upstream models when the live probe succeeds", async () => {
      const { fetchAvailableModels } = await import(
        "~/services/managedSites/providers/newApi"
      )
      const account = createMockDisplaySiteData()
      const token = createMockApiToken({ models: "" })

      mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce([
        "gpt-4",
        "gpt-3.5-turbo",
      ])

      const result = await fetchAvailableModels(account, token, {
        fetchAccountAvailableModels: mockFetchAccountAvailableModels,
      })

      expect(result).toContain("gpt-4")
      expect(result).toContain("gpt-3.5-turbo")
    })

    it("should fallback to account available models", async () => {
      const { fetchAvailableModels } = await import(
        "~/services/managedSites/providers/newApi"
      )
      const account = createMockDisplaySiteData()
      const token = createMockApiToken({ models: "" })

      mockFetchOpenAICompatibleModelIds.mockRejectedValueOnce(
        new Error("Failed"),
      )
      mockFetchAccountAvailableModels.mockResolvedValueOnce(["claude-3-opus"])

      const result = await fetchAvailableModels(account, token, {
        fetchAccountAvailableModels: mockFetchAccountAvailableModels,
      })

      expect(result).toContain("claude-3-opus")
    })

    it("should merge and deduplicate models from multiple sources", async () => {
      const { fetchAvailableModels } = await import(
        "~/services/managedSites/providers/newApi"
      )
      const account = createMockDisplaySiteData()
      const token = createMockApiToken({ models: "declared-only-model" })

      mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce([
        "gpt-4",
        "gpt-4-turbo",
      ])
      mockFetchAccountAvailableModels.mockResolvedValueOnce(["gpt-4o", "gpt-4"])

      const result = await fetchAvailableModels(account, token, {
        fetchAccountAvailableModels: mockFetchAccountAvailableModels,
      })

      const uniqueModels = new Set(result)
      expect(uniqueModels.size).toBe(result.length) // No duplicates
      expect(result).toContain("gpt-4")
      expect(result).toContain("gpt-4-turbo")
      expect(result).toContain("gpt-4o")
      expect(result).not.toContain("declared-only-model")
    })

    it("should handle errors swallowing and continue", async () => {
      const { fetchAvailableModels } = await import(
        "~/services/managedSites/providers/newApi"
      )
      const account = createMockDisplaySiteData()
      const token = createMockApiToken({ models: "" })

      mockFetchOpenAICompatibleModelIds.mockRejectedValueOnce(
        new Error("Upstream failed"),
      )
      mockFetchAccountAvailableModels.mockRejectedValueOnce(
        new Error("Fallback failed"),
      )

      const result = await fetchAvailableModels(account, token)

      expect(result).toEqual([])
    })

    it("should normalize models returned by live sources", async () => {
      const { fetchAvailableModels } = await import(
        "~/services/managedSites/providers/newApi"
      )
      const account = createMockDisplaySiteData()
      const token = createMockApiToken({ models: "ignored-model" })

      mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce([
        "  gpt-4  ",
        "gpt-3.5-turbo",
        "",
        "gpt-4",
      ])

      const result = await fetchAvailableModels(account, token)

      expect(result).toEqual(["gpt-4", "gpt-3.5-turbo"])
    })
  })

  // ========================================================================
  // buildChannelName
  // ========================================================================

  describe("buildChannelName", () => {
    it("should build channel name with auto suffix", async () => {
      const { buildChannelName } = await import(
        "~/services/managedSites/providers/newApi"
      )
      const account = createMockDisplaySiteData({ name: "My Site" })
      const token = createMockApiToken({ name: "My Token" })

      const result = buildChannelName(account, token)

      expect(result).toBe("My Site | My Token (auto)")
    })

    it("should not add duplicate auto suffix", async () => {
      const { buildChannelName } = await import(
        "~/services/managedSites/providers/newApi"
      )
      const account = createMockDisplaySiteData({ name: "My Site" })
      const token = createMockApiToken({ name: "My Token (auto)" })

      const result = buildChannelName(account, token)

      expect(result).toBe("My Site | My Token (auto)")
      expect(result.match(/\(auto\)/g)).toHaveLength(1)
    })

    it("should trim whitespace", async () => {
      const { buildChannelName } = await import(
        "~/services/managedSites/providers/newApi"
      )
      const account = createMockDisplaySiteData()
      const token = createMockApiToken()

      const result = buildChannelName(account, token)

      expect(result).not.toMatch(/^\s/)
      expect(result).not.toMatch(/\s$/)
    })
  })

  // ========================================================================
  // prepareChannelFormData
  // ========================================================================

  describe("prepareChannelFormData", () => {
    it("should prefer the target site's default group", async () => {
      const { prepareChannelFormData } = await import(
        "~/services/managedSites/providers/newApi"
      )
      const account = createMockDisplaySiteData()
      const token = createMockApiToken({ group: "custom-group" })

      mockGetPreferences.mockResolvedValueOnce(
        createMockUserPreferencesWithNewApi(),
      )
      mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce([
        "gpt-4",
        "gpt-3.5-turbo",
      ])
      mockFetchSiteUserGroups.mockResolvedValueOnce(["default", "vip"])

      const result = await prepareChannelFormData(account, token)

      expect(result.name).toContain("(auto)")
      expect(result.models).toContain("gpt-4")
      expect(result.groups).toEqual(["default"])
      expect(result.key).toBe(token.key)
      expect(result.base_url).toBe(account.baseUrl)
    })

    it("should use adminToken for default group lookup", async () => {
      const { prepareChannelFormData } = await import(
        "~/services/managedSites/providers/newApi"
      )
      const account = createMockDisplaySiteData()
      const token = createMockApiToken()
      const prefs = createMockUserPreferencesWithNewApi()

      mockGetPreferences.mockResolvedValueOnce(prefs)
      mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(["gpt-4"])
      mockFetchSiteUserGroups.mockResolvedValueOnce(["default"])

      await prepareChannelFormData(account, token)

      expect(mockFetchSiteUserGroups).toHaveBeenCalledWith({
        baseUrl: prefs.newApi.baseUrl,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: prefs.newApi.adminToken,
          userId: prefs.newApi.userId,
        },
      })
    })

    it("should keep models empty when only token metadata exists and upstream loading fails", async () => {
      const { prepareChannelFormData } = await import(
        "~/services/managedSites/providers/newApi"
      )
      const account = createMockDisplaySiteData()
      const token = createMockApiToken({ models: "gpt-4o-mini,gpt-4o" })

      mockGetPreferences.mockResolvedValueOnce(
        createMockUserPreferencesWithNewApi(),
      )
      mockFetchOpenAICompatibleModelIds.mockRejectedValueOnce(
        new Error("Upstream failed"),
      )
      mockFetchSiteUserGroups.mockResolvedValueOnce(["default"])

      const result = await prepareChannelFormData(account, token)

      expect(result.models).toEqual([])
      expect(result.modelPrefillFetchFailed).toBe(true)
    })

    it("should use the AIHubMix API origin when preparing managed-site channel data", async () => {
      const { prepareChannelFormData } = await import(
        "~/services/managedSites/providers/newApi"
      )
      const account = createMockDisplaySiteData({
        siteType: SITE_TYPES.AIHUBMIX,
        baseUrl: "https://console.aihubmix.com",
      })
      const token = createMockApiToken()

      mockGetPreferences.mockResolvedValueOnce(
        createMockUserPreferencesWithNewApi(),
      )
      mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce([
        "gpt-aihubmix-mini",
      ])
      mockFetchSiteUserGroups.mockResolvedValueOnce(["default"])

      const result = await prepareChannelFormData(account, token)

      expect(mockFetchOpenAICompatibleModelIds).toHaveBeenCalledWith({
        baseUrl: "https://aihubmix.com",
        apiKey: token.key,
      })
      expect(result.base_url).toBe("https://aihubmix.com")
    })

    it("should keep models empty when only account-level fallback models exist", async () => {
      const { prepareChannelFormData } = await import(
        "~/services/managedSites/providers/newApi"
      )
      const account = createMockDisplaySiteData()
      const token = createMockApiToken({ models: "" })

      mockGetPreferences.mockResolvedValueOnce(
        createMockUserPreferencesWithNewApi(),
      )
      mockFetchOpenAICompatibleModelIds.mockRejectedValueOnce(
        new Error("Upstream failed"),
      )
      mockFetchSiteUserGroups.mockResolvedValueOnce(["default"])

      const result = await prepareChannelFormData(account, token)

      expect(result.models).toEqual([])
      expect(result.modelPrefillFetchFailed).toBe(true)
    })

    it("should use the first target group when default is unavailable", async () => {
      const { prepareChannelFormData } = await import(
        "~/services/managedSites/providers/newApi"
      )
      const account = createMockDisplaySiteData()
      const token = createMockApiToken({ group: "custom-group" })

      mockGetPreferences.mockResolvedValueOnce(
        createMockUserPreferencesWithNewApi(),
      )
      mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(["gpt-4"])
      mockFetchSiteUserGroups.mockResolvedValueOnce(["vip", "beta"])

      const result = await prepareChannelFormData(account, token)

      expect(result.groups).toEqual(["vip"])
    })

    it("should fall back to default groups when site config is unavailable", async () => {
      const { prepareChannelFormData } = await import(
        "~/services/managedSites/providers/newApi"
      )
      const account = createMockDisplaySiteData()
      const token = createMockApiToken({ group: "custom-group" })

      mockGetPreferences.mockResolvedValueOnce(
        createMockUserPreferencesWithNewApi({
          newApi: { baseUrl: "", adminToken: "", userId: "" },
        }),
      )
      mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(["gpt-4"])

      const result = await prepareChannelFormData(account, token)

      expect(result.groups).toEqual(["default"])
    })

    it("should set default values", async () => {
      const { prepareChannelFormData } = await import(
        "~/services/managedSites/providers/newApi"
      )
      const account = createMockDisplaySiteData()
      const token = createMockApiToken()

      mockGetPreferences.mockReset()
      mockFetchOpenAICompatibleModelIds.mockReset()
      mockFetchSiteUserGroups.mockReset()

      mockGetPreferences.mockResolvedValueOnce(
        createMockUserPreferencesWithNewApi(),
      )
      mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(["gpt-4"])
      mockFetchSiteUserGroups.mockResolvedValueOnce([])

      const result = await prepareChannelFormData(account, token)

      expect(result.type).toBe(1) // OpenAI
      expect(result.groups).toEqual(["default"])
      expect(result.priority).toBe(0)
      expect(result.weight).toBe(0)
      expect(result.status).toBe(1) // Enable
    })
  })

  describe("managed-site channel api delegation", () => {
    it("uses the New API site override for channel mutations", async () => {
      const { createChannel, deleteChannel, searchChannel, updateChannel } =
        await import("~/services/managedSites/providers/newApi")
      const config = {
        baseUrl: "https://new-api.example.com",
        adminToken: "admin-token",
        userId: "1",
      }
      const createChannelData: CreateChannelPayload = {
        mode: "single",
        channel: {
          name: "Test Channel",
          type: 1,
          key: "sk-test",
          base_url: "https://api.example.com",
          models: "gpt-4",
          groups: ["default"],
          status: 1,
        },
      }
      const updateChannelData: UpdateChannelPayload = {
        id: 7,
        name: "Updated Channel",
      }

      mockSearchChannel.mockResolvedValueOnce({ items: [] })
      mockCreateChannel.mockResolvedValueOnce({ success: true })
      mockUpdateChannel.mockResolvedValueOnce({ success: true })
      mockDeleteChannel.mockResolvedValueOnce({ success: true })

      await searchChannel(config, "test")
      await createChannel(config, createChannelData)
      await updateChannel(config, updateChannelData)
      await deleteChannel(config, 7)

      expect(mockSearchChannel).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: config.baseUrl,
          auth: {
            authType: AuthTypeEnum.AccessToken,
            accessToken: config.adminToken,
            userId: config.userId,
          },
        }),
        "test",
      )
      expect(mockCreateChannel).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: config.baseUrl,
          auth: {
            authType: AuthTypeEnum.AccessToken,
            accessToken: config.adminToken,
            userId: config.userId,
          },
        }),
        createChannelData,
      )
      expect(mockUpdateChannel).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: config.baseUrl,
          auth: {
            authType: AuthTypeEnum.AccessToken,
            accessToken: config.adminToken,
            userId: config.userId,
          },
        }),
        updateChannelData,
      )
      expect(mockDeleteChannel).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: config.baseUrl,
          auth: {
            authType: AuthTypeEnum.AccessToken,
            accessToken: config.adminToken,
            userId: config.userId,
          },
        }),
        7,
      )
    })
  })

  // ========================================================================
  // buildChannelPayload
  // ========================================================================

  describe("buildChannelPayload", () => {
    it("should build payload with trimmed values", async () => {
      const { buildChannelPayload } = await import(
        "~/services/managedSites/providers/newApi"
      )
      const formData: ChannelFormData = {
        name: "  Test Channel  ",
        type: 1,
        key: "  sk-test  ",
        base_url: "  https://api.example.com  ",
        models: ["gpt-4", "gpt-3.5-turbo"],
        groups: ["default"],
        priority: 0,
        weight: 0,
        status: 1,
      }

      const result = buildChannelPayload(formData)

      expect(result.channel.name).toBe("Test Channel")
      expect(result.channel.key).toBe("sk-test")
      expect(result.channel.base_url).toBe("https://api.example.com")
    })

    it("should join models as comma-separated string", async () => {
      const { buildChannelPayload } = await import(
        "~/services/managedSites/providers/newApi"
      )
      const formData: ChannelFormData = {
        name: "Test",
        type: 1,
        key: "sk-test",
        base_url: "https://api.example.com",
        models: ["gpt-4", "gpt-3.5-turbo", "claude-3"],
        groups: ["group1", "group2"],
        priority: 0,
        weight: 0,
        status: 1,
      }

      const result = buildChannelPayload(formData)

      expect(result.channel.models).toBe("gpt-4,gpt-3.5-turbo,claude-3")
      expect(result.channel.groups).toBeDefined()
      const groups = result.channel.groups!
      expect(groups).toEqual(["group1", "group2"])
    })

    it("should use default groups when empty", async () => {
      const { buildChannelPayload } = await import(
        "~/services/managedSites/providers/newApi"
      )
      const formData: ChannelFormData = {
        name: "Test",
        type: 1,
        key: "sk-test",
        base_url: "https://api.example.com",
        models: ["gpt-4"],
        groups: [],
        priority: 0,
        weight: 0,
        status: 1,
      }

      const result = buildChannelPayload(formData)

      expect(result.channel.groups).toBeDefined()
      const groups = result.channel.groups!
      expect(groups).toEqual(["default"])
    })

    it("should normalize and deduplicate groups", async () => {
      const { buildChannelPayload } = await import(
        "~/services/managedSites/providers/newApi"
      )
      const formData: ChannelFormData = {
        name: "Test",
        type: 1,
        key: "sk-test",
        base_url: "https://api.example.com",
        models: ["gpt-4"],
        groups: ["  group1  ", "group1", "  group2  "],
        priority: 0,
        weight: 0,
        status: 1,
      }

      const result = buildChannelPayload(formData)

      expect(result.channel.groups).toBeDefined()
      const groups = result.channel.groups!
      expect(groups).toContain("group1")
      expect(groups).toContain("group2")
      expect(groups.length).toBe(2)
    })

    it("should use specified mode or default", async () => {
      const { buildChannelPayload } = await import(
        "~/services/managedSites/providers/newApi"
      )
      const formData: ChannelFormData = {
        name: "Test",
        type: 1,
        key: "sk-test",
        base_url: "https://api.example.com",
        models: ["gpt-4"],
        groups: ["default"],
        priority: 0,
        weight: 0,
        status: 1,
      }

      const resultDefault = buildChannelPayload(formData)
      expect(resultDefault.mode).toBe("single")

      const resultBatch = buildChannelPayload(formData, "batch")
      expect(resultBatch.mode).toBe("batch")
    })
  })

  // ========================================================================
  // importToNewApi
  // ========================================================================

  describe("importToNewApi", () => {
    it("should return config missing message when config invalid", async () => {
      const { importToNewApi } = await import(
        "~/services/managedSites/providers/newApi"
      )
      const account = createMockDisplaySiteData()
      const token = createMockApiToken()

      mockGetPreferences.mockResolvedValueOnce(null)

      const result = await importToNewApi(account, token)

      expect(result.success).toBe(false)
      expect(result.message).toContain("messages:newapi.configMissing")
    })

    it("should return channel exists message when channel already exists", async () => {
      const { importToNewApi } = await import(
        "~/services/managedSites/providers/newApi"
      )
      const account = createMockDisplaySiteData()
      const token = createMockApiToken({ models: "gpt-4" })

      const existingChannel = createMockNewApiChannel({
        name: "Existing Channel",
        base_url: account.baseUrl,
        models: "gpt-4",
        key: "sk-test-key-123",
      })

      mockGetPreferences.mockResolvedValueOnce(
        createMockUserPreferencesWithNewApi(),
      )
      mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(["gpt-4"])
      mockSearchChannel.mockResolvedValueOnce(
        createMockNewApiChannelListData([existingChannel]),
      )

      const result = await importToNewApi(account, token)

      expect(result).toEqual({
        success: false,
        message: expect.stringContaining("channelExists"),
      })
      expect(mockSearchChannel).toHaveBeenCalledTimes(1)
      expect(mockCreateChannel).not.toHaveBeenCalled()
    })

    it("should import successfully when all conditions met", async () => {
      const { importToNewApi } = await import(
        "~/services/managedSites/providers/newApi"
      )
      const account = createMockDisplaySiteData()
      const token = createMockApiToken({ models: "gpt-4" })

      mockGetPreferences.mockResolvedValueOnce(
        createMockUserPreferencesWithNewApi(),
      )
      mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(["gpt-4"])
      mockSearchChannel.mockResolvedValueOnce(
        createMockNewApiChannelListData([]),
      )
      mockCreateChannel.mockResolvedValueOnce({ success: true })

      const result = await importToNewApi(account, token)

      expect(result.success).toBe(true)
      expect(result.message).toBeTruthy()
    })

    it("should match existing AIHubMix channels by API origin during direct import", async () => {
      const { importToNewApi } = await import(
        "~/services/managedSites/providers/newApi"
      )
      const account = createMockDisplaySiteData({
        siteType: SITE_TYPES.AIHUBMIX,
        baseUrl: "https://console.aihubmix.com",
      })
      const token = createMockApiToken({
        key: "sk-aihubmix-key",
        models: "gpt-aihubmix-mini",
      })

      const existingChannel = createMockNewApiChannel({
        name: "Existing AIHubMix Channel",
        base_url: "https://aihubmix.com",
        models: "gpt-aihubmix-mini",
        key: "sk-aihubmix-key",
      })

      mockGetPreferences.mockResolvedValueOnce(
        createMockUserPreferencesWithNewApi(),
      )
      mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce([
        "gpt-aihubmix-mini",
      ])
      mockSearchChannel.mockResolvedValueOnce(
        createMockNewApiChannelListData([existingChannel]),
      )

      const result = await importToNewApi(account, token)

      expect(result).toEqual({
        success: false,
        message: expect.stringContaining("channelExists"),
      })
      expect(mockSearchChannel).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: "https://new-api.example.com",
        }),
        "https://aihubmix.com",
      )
      expect(mockSearchChannel).toHaveBeenCalledTimes(1)
      expect(mockCreateChannel).not.toHaveBeenCalled()
    })

    it("should stop importing when duplicate resolution requires verification", async () => {
      const { importToNewApi } = await import(
        "~/services/managedSites/providers/newApi"
      )
      const {
        NEW_API_CHANNEL_KEY_ERROR_KINDS,
        NewApiChannelKeyRequirementError,
      } = await import("~/services/managedSites/providers/newApiSession")
      const account = createMockDisplaySiteData()
      const token = createMockApiToken({ models: "gpt-4" })

      const hiddenKeyChannel = createMockNewApiChannel({
        id: 3,
        base_url: account.baseUrl,
        models: "gpt-4",
        key: "",
      })

      mockGetPreferences.mockResolvedValueOnce(
        createMockUserPreferencesWithNewApi(),
      )
      mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(["gpt-4"])
      mockSearchChannel.mockResolvedValueOnce(
        createMockNewApiChannelListData([hiddenKeyChannel]),
      )
      fetchNewApiChannelKeyMock.mockRejectedValueOnce(
        new NewApiChannelKeyRequirementError(
          NEW_API_CHANNEL_KEY_ERROR_KINDS.SECURE_VERIFICATION_REQUIRED,
        ),
      )

      const result = await importToNewApi(account, token)

      expect(result).toEqual({
        success: false,
        message: expect.stringContaining("channelMatchUnresolved"),
      })
      expect(mockCreateChannel).not.toHaveBeenCalled()
    })

    it("should return import failure when hidden-key lookup fails unexpectedly during duplicate resolution", async () => {
      const { importToNewApi } = await import(
        "~/services/managedSites/providers/newApi"
      )
      const account = createMockDisplaySiteData()
      const token = createMockApiToken({ models: "gpt-4" })

      const hiddenKeyChannel = createMockNewApiChannel({
        id: 4,
        base_url: account.baseUrl,
        models: "gpt-4",
        key: "",
      })

      mockGetPreferences.mockResolvedValueOnce(
        createMockUserPreferencesWithNewApi(),
      )
      mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(["gpt-4"])
      mockSearchChannel.mockResolvedValueOnce(
        createMockNewApiChannelListData([hiddenKeyChannel]),
      )
      fetchNewApiChannelKeyMock.mockRejectedValueOnce(
        new Error("backend unavailable"),
      )

      const result = await importToNewApi(account, token)

      expect(result).toEqual({
        success: false,
        message: "key-resolution-failed",
      })
      expect(mockCreateChannel).not.toHaveBeenCalled()
    })

    it("should return create failure message when creation fails", async () => {
      const { importToNewApi } = await import(
        "~/services/managedSites/providers/newApi"
      )
      const account = createMockDisplaySiteData()
      const token = createMockApiToken({ models: "gpt-4" })

      mockGetPreferences.mockResolvedValueOnce(
        createMockUserPreferencesWithNewApi(),
      )
      mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(["gpt-4"])
      mockSearchChannel.mockResolvedValueOnce(
        createMockNewApiChannelListData([]),
      )
      mockCreateChannel.mockResolvedValueOnce({
        success: false,
        message: "create failed",
      })

      const result = await importToNewApi(account, token)

      expect(result.success).toBe(false)
      expect(result.message).toBe("create failed")
    })

    it("should handle thrown errors during import", async () => {
      const { importToNewApi } = await import(
        "~/services/managedSites/providers/newApi"
      )
      const account = createMockDisplaySiteData()
      const token = createMockApiToken()

      mockGetPreferences.mockRejectedValueOnce(new Error("Storage error"))

      const result = await importToNewApi(account, token)

      expect(result.success).toBe(false)
      expect(result.message).toBeTruthy()
    })
  })

  // ========================================================================
  // Helper Functions
  // ========================================================================

  describe("fetchAvailableModels metadata handling", () => {
    it("should not fall back to token.models when live sources are unavailable", async () => {
      const { fetchAvailableModels } = await import(
        "~/services/managedSites/providers/newApi"
      )
      const account = createMockDisplaySiteData()
      const token = createMockApiToken({
        models: "gpt-4, gpt-3.5-turbo , claude-3",
      })

      mockFetchOpenAICompatibleModelIds.mockRejectedValueOnce(
        new Error("Upstream failed"),
      )
      mockFetchAccountAvailableModels.mockResolvedValueOnce([])

      const result = await fetchAvailableModels(account, token)

      expect(result).toEqual([])
    })

    it("should handle empty models string", async () => {
      const { fetchAvailableModels } = await import(
        "~/services/managedSites/providers/newApi"
      )
      const account = createMockDisplaySiteData()
      const token = createMockApiToken({ models: "" })

      mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce([])
      mockFetchAccountAvailableModels.mockResolvedValueOnce([])

      const result = await fetchAvailableModels(account, token)

      expect(result).toEqual([])
    })
  })
})
