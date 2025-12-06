import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ApiToken, DisplaySiteData, SiteAccount } from "~/types"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import type { ChannelFormData, CreateChannelPayload } from "~/types/newapi"

// ============================================================================
// MOCKS
// ============================================================================

// Mock i18next
vi.mock("i18next", () => ({
  t: vi.fn((key: string) => {
    // Always return the key so tests can check for it
    return key
  }),
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
vi.mock("~/services/apiService/common/errors", () => ({
  ApiError: MockApiError,
}))

// Mock higher-level API service functions
const mockFetchAccountAvailableModels = vi.fn()
const mockFetchUpstreamModelsNameList = vi.fn()
vi.mock("~/services/apiService", () => ({
  fetchAccountAvailableModels: mockFetchAccountAvailableModels,
  fetchUpstreamModelsNameList: mockFetchUpstreamModelsNameList,
}))

// Mock account storage
const mockAccountStorageConvertToDisplayData = vi.fn()
vi.mock("~/services/accountStorage", () => ({
  accountStorage: {
    convertToDisplayData: mockAccountStorageConvertToDisplayData,
  },
}))

// Mock account operations
const mockEnsureAccountApiToken = vi.fn()
vi.mock("~/services/accountOperations", () => ({
  ensureAccountApiToken: mockEnsureAccountApiToken,
}))

// Mock user preferences
const mockGetPreferences = vi.fn()
const mockSavePreferences = vi.fn()
vi.mock("~/services/userPreferences", () => ({
  userPreferences: {
    getPreferences: mockGetPreferences,
    savePreferences: mockSavePreferences,
  },
}))

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
    siteType: "openai",
    baseUrl: "https://api.example.com",
    token: "test-token-123",
    userId: 1,
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
      userId: "user-123",
    },
    newApiModelSync: {
      enabled: false,
      interval: 3600000,
      concurrency: 5,
      maxRetries: 3,
      rateLimit: { requestsPerMinute: 60, burst: 10 },
    },
    autoCheckin: { enabled: false },
    modelRedirect: { enabled: false, customMappings: [] },
    preferencesVersion: 5,
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

/**
 * Creates a mock SiteAccount entity for integration-style New API tests.
 */
function createMockSiteAccount(overrides?: Partial<SiteAccount>): SiteAccount {
  return {
    id: "account-1",
    site_name: "Test Site",
    site_url: "https://api.example.com",
    health: { status: SiteHealthStatus.Healthy },
    site_type: "openai",
    exchange_rate: 7.0,
    account_info: {
      id: 1,
      access_token: "token-123",
      username: "testuser",
      quota: 100,
      today_prompt_tokens: 1000,
      today_completion_tokens: 2000,
      today_quota_consumption: 10,
      today_requests_count: 5,
      today_income: 0,
    },
    last_sync_time: Date.now(),
    updated_at: Date.now(),
    created_at: Date.now() - 86400000,
    authType: AuthTypeEnum.AccessToken,
    checkIn: { enableDetection: false },
    ...overrides,
  }
}

// ============================================================================
// TESTS
// ============================================================================

describe("newApiService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
        "~/services/newApiService/newApiService"
      )
      const mockChannelData = createMockNewApiChannelListData([
        createMockNewApiChannel({ id: 1, name: "Channel 1" }),
        createMockNewApiChannel({ id: 2, name: "Channel 2" }),
      ])

      mockFetchApiData.mockResolvedValueOnce(mockChannelData)

      const result = await searchChannel(
        "https://api.example.com",
        "admin-token",
        "user-123",
        "https://api.example.com",
      )

      expect(result).toEqual(mockChannelData)
      expect(mockFetchApiData).toHaveBeenCalledWith({
        baseUrl: "https://api.example.com",
        endpoint: "/api/channel/search?keyword=https://api.example.com",
        userId: "user-123",
        token: "admin-token",
      })
    })

    it("should return null when ApiError is thrown", async () => {
      const { searchChannel } = await import(
        "~/services/newApiService/newApiService"
      )
      const error = new MockApiError("API request failed")

      mockFetchApiData.mockRejectedValueOnce(error)

      const result = await searchChannel(
        "https://api.example.com",
        "admin-token",
        "user-123",
        "keyword",
      )

      expect(result).toBeNull()
    })

    it("should return null when other error is thrown", async () => {
      const { searchChannel } = await import(
        "~/services/newApiService/newApiService"
      )
      const error = new Error("Network error")

      mockFetchApiData.mockRejectedValueOnce(error)

      const result = await searchChannel(
        "https://api.example.com",
        "admin-token",
        "user-123",
        "keyword",
      )

      expect(result).toBeNull()
    })
  })

  // ========================================================================
  // createChannel
  // ========================================================================

  describe("createChannel", () => {
    it("should create channel successfully", async () => {
      const { createChannel } = await import(
        "~/services/newApiService/newApiService"
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

      const result = await createChannel(
        "https://api.example.com",
        "admin-token",
        "user-123",
        payload,
      )

      expect(result).toEqual({ success: true })
      expect(mockFetchApi).toHaveBeenCalledWith({
        baseUrl: "https://api.example.com",
        endpoint: "/api/channel",
        userId: "user-123",
        token: "admin-token",
        options: {
          method: "POST",
          body: expect.stringContaining('"name":"Test Channel"'),
        },
      })
    })

    it("should throw error when creation fails", async () => {
      const { createChannel } = await import(
        "~/services/newApiService/newApiService"
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

      await expect(
        createChannel(
          "https://api.example.com",
          "admin-token",
          "user-123",
          payload,
        ),
      ).rejects.toThrow("创建渠道失败，请检查网络或 New API 配置。")
    })

    it("should join groups in payload", async () => {
      const { createChannel } = await import(
        "~/services/newApiService/newApiService"
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

      await createChannel(
        "https://api.example.com",
        "admin-token",
        "user-123",
        payload,
      )

      const callArgs = mockFetchApi.mock.calls[0][0]
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
        "~/services/newApiService/newApiService"
      )
      const updateData = { id: 1, name: "Updated Name" }

      mockFetchApi.mockResolvedValueOnce({ success: true })

      const result = await updateChannel(
        "https://api.example.com",
        "admin-token",
        "user-123",
        updateData,
      )

      expect(result).toEqual({ success: true })
      expect(mockFetchApi).toHaveBeenCalledWith({
        baseUrl: "https://api.example.com",
        endpoint: "/api/channel",
        userId: "user-123",
        token: "admin-token",
        options: {
          method: "PUT",
          body: JSON.stringify(updateData),
        },
      })
    })

    it("should throw error when update fails", async () => {
      const { updateChannel } = await import(
        "~/services/newApiService/newApiService"
      )

      mockFetchApi.mockRejectedValueOnce(new Error("API error"))

      await expect(
        updateChannel("https://api.example.com", "admin-token", "user-123", {
          id: 1,
          name: "Updated",
        }),
      ).rejects.toThrow("更新渠道失败，请检查网络或 New API 配置。")
    })
  })

  // ========================================================================
  // hasValidNewApiConfig
  // ========================================================================

  describe("hasValidNewApiConfig", () => {
    it("should return true with valid config", async () => {
      const { hasValidNewApiConfig } = await import(
        "~/services/newApiService/newApiService"
      )
      const prefs = createMockUserPreferencesWithNewApi()

      expect(hasValidNewApiConfig(prefs)).toBe(true)
    })

    it("should return false when prefs is null", async () => {
      const { hasValidNewApiConfig } = await import(
        "~/services/newApiService/newApiService"
      )

      expect(hasValidNewApiConfig(null)).toBe(false)
    })

    it("should return false when newApi is missing", async () => {
      const { hasValidNewApiConfig } = await import(
        "~/services/newApiService/newApiService"
      )
      const prefs = createMockUserPreferencesWithNewApi()
      delete prefs.newApi

      expect(hasValidNewApiConfig(prefs)).toBe(false)
    })

    it("should return false when required fields are missing", async () => {
      const { hasValidNewApiConfig } = await import(
        "~/services/newApiService/newApiService"
      )

      const cases = [
        { newApi: { adminToken: "token", userId: "user" } },
        { newApi: { baseUrl: "url", userId: "user" } },
        { newApi: { baseUrl: "url", adminToken: "token" } },
        { newApi: { baseUrl: "", adminToken: "token", userId: "user" } },
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
  })

  // ========================================================================
  // checkValidNewApiConfig
  // ========================================================================

  describe("checkValidNewApiConfig", () => {
    it("should return true with valid config", async () => {
      const { checkValidNewApiConfig } = await import(
        "~/services/newApiService/newApiService"
      )
      mockGetPreferences.mockResolvedValueOnce(
        createMockUserPreferencesWithNewApi(),
      )

      const result = await checkValidNewApiConfig()

      expect(result).toBe(true)
    })

    it("should return false with invalid config", async () => {
      const { checkValidNewApiConfig } = await import(
        "~/services/newApiService/newApiService"
      )
      mockGetPreferences.mockResolvedValueOnce(
        createMockUserPreferencesWithNewApi({
          newApi: { baseUrl: "", adminToken: "", userId: "" },
        }),
      )

      const result = await checkValidNewApiConfig()

      expect(result).toBe(false)
    })

    it("should return false when getPreferences throws error", async () => {
      const { checkValidNewApiConfig } = await import(
        "~/services/newApiService/newApiService"
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
        "~/services/newApiService/newApiService"
      )
      mockGetPreferences.mockResolvedValueOnce(
        createMockUserPreferencesWithNewApi(),
      )

      const result = await getNewApiConfig()

      expect(result).toEqual({
        baseUrl: "https://new-api.example.com",
        token: "admin-token-123",
        userId: "user-123",
      })
    })

    it("should return null when config is invalid", async () => {
      const { getNewApiConfig } = await import(
        "~/services/newApiService/newApiService"
      )
      mockGetPreferences.mockResolvedValueOnce(null)

      const result = await getNewApiConfig()

      expect(result).toBeNull()
    })

    it("should return null when getPreferences throws error", async () => {
      const { getNewApiConfig } = await import(
        "~/services/newApiService/newApiService"
      )
      mockGetPreferences.mockRejectedValueOnce(new Error("Storage error"))

      const result = await getNewApiConfig()

      expect(result).toBeNull()
    })
  })

  // ========================================================================
  // fetchAvailableModels
  // ========================================================================

  describe("fetchAvailableModels", () => {
    it("should return token models when available", async () => {
      const { fetchAvailableModels } = await import(
        "~/services/newApiService/newApiService"
      )
      const account = createMockDisplaySiteData()
      const token = createMockApiToken({ models: "gpt-4,gpt-3.5-turbo" })

      const result = await fetchAvailableModels(account, token)

      expect(result).toContain("gpt-4")
      expect(result).toContain("gpt-3.5-turbo")
    })

    it("should fallback to upstream models when token models empty", async () => {
      const { fetchAvailableModels } = await import(
        "~/services/newApiService/newApiService"
      )
      const account = createMockDisplaySiteData()
      const token = createMockApiToken({ models: "" })

      mockFetchUpstreamModelsNameList.mockResolvedValueOnce([
        "gpt-4",
        "gpt-3.5-turbo",
      ])

      const result = await fetchAvailableModels(account, token)

      expect(result).toContain("gpt-4")
      expect(result).toContain("gpt-3.5-turbo")
    })

    it("should fallback to account available models", async () => {
      const { fetchAvailableModels } = await import(
        "~/services/newApiService/newApiService"
      )
      const account = createMockDisplaySiteData()
      const token = createMockApiToken({ models: "" })

      mockFetchUpstreamModelsNameList.mockRejectedValueOnce(new Error("Failed"))
      mockFetchAccountAvailableModels.mockResolvedValueOnce(["claude-3-opus"])

      const result = await fetchAvailableModels(account, token)

      expect(result).toContain("claude-3-opus")
    })

    it("should merge and deduplicate models from multiple sources", async () => {
      const { fetchAvailableModels } = await import(
        "~/services/newApiService/newApiService"
      )
      const account = createMockDisplaySiteData()
      const token = createMockApiToken({ models: "gpt-4,gpt-3.5-turbo" })

      mockFetchUpstreamModelsNameList.mockResolvedValueOnce([
        "gpt-4",
        "gpt-4-turbo",
      ])
      mockFetchAccountAvailableModels.mockResolvedValueOnce([
        "gpt-3.5-turbo",
        "gpt-4",
      ])

      const result = await fetchAvailableModels(account, token)

      const uniqueModels = new Set(result)
      expect(uniqueModels.size).toBe(result.length) // No duplicates
      expect(result).toContain("gpt-4")
      expect(result).toContain("gpt-3.5-turbo")
      expect(result).toContain("gpt-4-turbo")
    })

    it("should handle errors swallowing and continue", async () => {
      const { fetchAvailableModels } = await import(
        "~/services/newApiService/newApiService"
      )
      const account = createMockDisplaySiteData()
      const token = createMockApiToken({ models: "" })

      mockFetchUpstreamModelsNameList.mockRejectedValueOnce(
        new Error("Upstream failed"),
      )
      mockFetchAccountAvailableModels.mockRejectedValueOnce(
        new Error("Fallback failed"),
      )

      const result = await fetchAvailableModels(account, token)

      expect(result).toEqual([])
    })

    it("should normalize models list", async () => {
      const { fetchAvailableModels } = await import(
        "~/services/newApiService/newApiService"
      )
      const account = createMockDisplaySiteData()
      const token = createMockApiToken({
        models: "  gpt-4  ,  gpt-3.5-turbo  , ",
      })

      const result = await fetchAvailableModels(account, token)

      expect(result).toContain("gpt-4")
      expect(result).toContain("gpt-3.5-turbo")
    })
  })

  // ========================================================================
  // buildChannelName
  // ========================================================================

  describe("buildChannelName", () => {
    it("should build channel name with auto suffix", async () => {
      const { buildChannelName } = await import(
        "~/services/newApiService/newApiService"
      )
      const account = createMockDisplaySiteData({ name: "My Site" })
      const token = createMockApiToken({ name: "My Token" })

      const result = buildChannelName(account, token)

      expect(result).toBe("My Site | My Token (auto)")
    })

    it("should not add duplicate auto suffix", async () => {
      const { buildChannelName } = await import(
        "~/services/newApiService/newApiService"
      )
      const account = createMockDisplaySiteData({ name: "My Site" })
      const token = createMockApiToken({ name: "My Token (auto)" })

      const result = buildChannelName(account, token)

      expect(result).toBe("My Site | My Token (auto)")
      expect(result.match(/\(auto\)/g)).toHaveLength(1)
    })

    it("should trim whitespace", async () => {
      const { buildChannelName } = await import(
        "~/services/newApiService/newApiService"
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
    it("should prepare form data successfully", async () => {
      const { prepareChannelFormData } = await import(
        "~/services/newApiService/newApiService"
      )
      const account = createMockDisplaySiteData()
      const token = createMockApiToken({ group: "custom-group" })

      mockFetchUpstreamModelsNameList.mockResolvedValueOnce([
        "gpt-4",
        "gpt-3.5-turbo",
      ])

      const result = await prepareChannelFormData(account, token)

      expect(result.name).toContain("(auto)")
      expect(result.models).toContain("gpt-4")
      expect(result.groups).toContain("custom-group")
      expect(result.key).toBe(token.key)
      expect(result.base_url).toBe(account.baseUrl)
    })

    it("should throw error when no models available", async () => {
      const { prepareChannelFormData } = await import(
        "~/services/newApiService/newApiService"
      )
      const account = createMockDisplaySiteData()
      const token = createMockApiToken()

      mockFetchUpstreamModelsNameList.mockResolvedValueOnce([])

      await expect(prepareChannelFormData(account, token)).rejects.toThrow()
    })

    it("should use default groups when token has no group", async () => {
      const { prepareChannelFormData } = await import(
        "~/services/newApiService/newApiService"
      )
      const account = createMockDisplaySiteData()
      const token = createMockApiToken({ group: undefined })

      mockFetchUpstreamModelsNameList.mockResolvedValueOnce(["gpt-4"])

      const result = await prepareChannelFormData(account, token)

      expect(result.groups).toEqual(["default"])
    })

    it("should set default values", async () => {
      const { prepareChannelFormData } = await import(
        "~/services/newApiService/newApiService"
      )
      const account = createMockDisplaySiteData()
      const token = createMockApiToken()

      mockFetchUpstreamModelsNameList.mockResolvedValueOnce(["gpt-4"])

      const result = await prepareChannelFormData(account, token)

      expect(result.type).toBe(1) // OpenAI
      expect(result.priority).toBe(0)
      expect(result.weight).toBe(0)
      expect(result.status).toBe(1) // Enable
    })
  })

  // ========================================================================
  // buildChannelPayload
  // ========================================================================

  describe("buildChannelPayload", () => {
    it("should build payload with trimmed values", async () => {
      const { buildChannelPayload } = await import(
        "~/services/newApiService/newApiService"
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
        "~/services/newApiService/newApiService"
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
        "~/services/newApiService/newApiService"
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
        "~/services/newApiService/newApiService"
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
        "~/services/newApiService/newApiService"
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
  // findMatchingChannel
  // ========================================================================

  describe("findMatchingChannel", () => {
    it("should find matching channel by base_url and models", async () => {
      const { findMatchingChannel } = await import(
        "~/services/newApiService/newApiService"
      )
      const matchingChannel = createMockNewApiChannel({
        base_url: "https://api.example.com",
        models: "gpt-4,gpt-3.5-turbo",
      })

      mockFetchApiData.mockResolvedValueOnce(
        createMockNewApiChannelListData([matchingChannel]),
      )

      const result = await findMatchingChannel(
        "https://new-api.example.com",
        "admin-token",
        "user-123",
        "https://api.example.com",
        ["gpt-4", "gpt-3.5-turbo"],
      )

      expect(result).toEqual(matchingChannel)
    })

    it("should return null when no matching channel found", async () => {
      const { findMatchingChannel } = await import(
        "~/services/newApiService/newApiService"
      )
      const differentChannel = createMockNewApiChannel({
        base_url: "https://different.example.com",
      })

      mockFetchApiData.mockResolvedValueOnce(
        createMockNewApiChannelListData([differentChannel]),
      )

      const result = await findMatchingChannel(
        "https://new-api.example.com",
        "admin-token",
        "user-123",
        "https://api.example.com",
        ["gpt-4"],
      )

      expect(result).toBeNull()
    })

    it("should return null when search returns null", async () => {
      const { findMatchingChannel } = await import(
        "~/services/newApiService/newApiService"
      )

      mockFetchApiData.mockResolvedValueOnce(null)

      const result = await findMatchingChannel(
        "https://new-api.example.com",
        "admin-token",
        "user-123",
        "https://api.example.com",
        ["gpt-4"],
      )

      expect(result).toBeNull()
    })

    it("should compare models correctly", async () => {
      const { findMatchingChannel } = await import(
        "~/services/newApiService/newApiService"
      )
      const channel1 = createMockNewApiChannel({
        base_url: "https://api.example.com",
        models: "gpt-4,gpt-3.5-turbo",
      })
      const channel2 = createMockNewApiChannel({
        id: 2,
        base_url: "https://api.example.com",
        models: "gpt-4",
      })

      mockFetchApiData.mockResolvedValueOnce(
        createMockNewApiChannelListData([channel1, channel2]),
      )

      const result = await findMatchingChannel(
        "https://new-api.example.com",
        "admin-token",
        "user-123",
        "https://api.example.com",
        ["gpt-4"],
      )

      expect(result?.id).toBe(2)
    })
  })

  // ========================================================================
  // importToNewApi
  // ========================================================================

  describe("importToNewApi", () => {
    it("should return config missing message when config invalid", async () => {
      const { importToNewApi } = await import(
        "~/services/newApiService/newApiService"
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
        "~/services/newApiService/newApiService"
      )
      const account = createMockDisplaySiteData()
      const token = createMockApiToken({ models: "gpt-4" })

      const existingChannel = createMockNewApiChannel({
        name: "Existing Channel",
        base_url: account.baseUrl,
        models: "gpt-4",
      })

      mockGetPreferences.mockResolvedValueOnce(
        createMockUserPreferencesWithNewApi(),
      )
      mockFetchUpstreamModelsNameList.mockResolvedValueOnce(["gpt-4"])
      mockFetchApiData.mockResolvedValueOnce(
        createMockNewApiChannelListData([existingChannel]),
      )

      const result = await importToNewApi(account, token)

      expect(result.success).toBe(false)
      // The i18next mock returns the key, but we need to check if the message indicates a channel exists
      expect(result.message).toBeTruthy()
    })

    it("should import successfully when all conditions met", async () => {
      const { importToNewApi } = await import(
        "~/services/newApiService/newApiService"
      )
      const account = createMockDisplaySiteData()
      const token = createMockApiToken({ models: "gpt-4" })

      mockGetPreferences.mockResolvedValueOnce(
        createMockUserPreferencesWithNewApi(),
      )
      mockFetchUpstreamModelsNameList.mockResolvedValueOnce(["gpt-4"])
      mockFetchApiData.mockResolvedValueOnce(
        createMockNewApiChannelListData([]),
      )
      mockFetchApi.mockResolvedValueOnce({ success: true })

      const result = await importToNewApi(account, token)

      expect(result.success).toBe(true)
      expect(result.message).toBeTruthy()
    })

    it("should return create failure message when creation fails", async () => {
      const { importToNewApi } = await import(
        "~/services/newApiService/newApiService"
      )
      const account = createMockDisplaySiteData()
      const token = createMockApiToken({ models: "gpt-4" })

      mockGetPreferences.mockResolvedValueOnce(
        createMockUserPreferencesWithNewApi(),
      )
      mockFetchUpstreamModelsNameList.mockResolvedValueOnce(["gpt-4"])
      mockFetchApiData.mockResolvedValueOnce(
        createMockNewApiChannelListData([]),
      )
      mockFetchApi.mockResolvedValueOnce({
        success: false,
        message: "Channel creation failed",
      })

      const result = await importToNewApi(account, token)

      expect(result.success).toBe(false)
      expect(result.message).toBe("Channel creation failed")
    })

    it("should handle thrown errors during import", async () => {
      const { importToNewApi } = await import(
        "~/services/newApiService/newApiService"
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
  // autoConfigToNewApi
  // ========================================================================

  describe("autoConfigToNewApi", () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it("should return config validation error when config invalid", async () => {
      const { autoConfigToNewApi } = await import(
        "~/services/newApiService/newApiService"
      )
      const account = createMockSiteAccount()

      mockGetPreferences.mockResolvedValueOnce(
        createMockUserPreferencesWithNewApi({
          newApi: { baseUrl: "", adminToken: "", userId: "" },
        }),
      )

      const result = await autoConfigToNewApi(account)

      expect(result.success).toBe(false)
      expect(result.message).toContain("messages:errors.validation")
    })

    it("should succeed on first attempt when all goes well", async () => {
      const { autoConfigToNewApi } = await import(
        "~/services/newApiService/newApiService"
      )
      const account = createMockSiteAccount()
      const token = createMockApiToken({ models: "gpt-4" })
      const displayData = createMockDisplaySiteData()

      // Use mockResolvedValue (not Once) to allow multiple calls within the flow
      mockGetPreferences.mockResolvedValue(
        createMockUserPreferencesWithNewApi(),
      )
      mockAccountStorageConvertToDisplayData.mockReturnValue(displayData)
      mockEnsureAccountApiToken.mockResolvedValue(token)
      mockFetchUpstreamModelsNameList.mockResolvedValue(["gpt-4"])
      mockFetchApiData.mockResolvedValue(createMockNewApiChannelListData([]))
      mockFetchApi.mockResolvedValue({ success: true })

      const result = await autoConfigToNewApi(account, "toast-id")

      expect(result.success).toBe(true)
      expect(mockToast.loading).toHaveBeenCalled()
      expect(mockToast.success).toHaveBeenCalled()
    })

    it("should retry on network error and eventually succeed", async () => {
      const { autoConfigToNewApi } = await import(
        "~/services/newApiService/newApiService"
      )
      const account = createMockSiteAccount()
      const token = createMockApiToken({ models: "gpt-4" })
      const displayData = createMockDisplaySiteData()

      mockGetPreferences.mockResolvedValue(
        createMockUserPreferencesWithNewApi(),
      )
      mockAccountStorageConvertToDisplayData.mockReturnValue(displayData)

      // First two attempts fail with network errors, third succeeds
      mockEnsureAccountApiToken
        .mockRejectedValueOnce(new Error("Failed to fetch"))
        .mockRejectedValueOnce(new Error("network error"))
        .mockResolvedValueOnce(token)

      mockFetchUpstreamModelsNameList.mockResolvedValue(["gpt-4"])
      mockFetchApiData.mockResolvedValue(createMockNewApiChannelListData([]))
      mockFetchApi.mockResolvedValue({ success: true })

      const resultPromise = autoConfigToNewApi(account, "toast-id")

      // Fast-forward through retry delays
      vi.advanceTimersByTime(1000) // First retry delay
      await vi.runAllTimersAsync()

      const result = await resultPromise

      expect(result.success).toBe(true)
      expect(mockEnsureAccountApiToken).toHaveBeenCalledTimes(3)
      expect(mockToast.error).toHaveBeenCalled()
    })

    it("should retry up to 3 times and fail after", async () => {
      const { autoConfigToNewApi } = await import(
        "~/services/newApiService/newApiService"
      )
      const account = createMockSiteAccount()
      const displayData = createMockDisplaySiteData()

      mockGetPreferences.mockResolvedValue(
        createMockUserPreferencesWithNewApi(),
      )
      mockAccountStorageConvertToDisplayData.mockReturnValue(displayData)
      // All attempts fail with network error
      mockEnsureAccountApiToken.mockRejectedValue(new Error("Failed to fetch"))

      const resultPromise = autoConfigToNewApi(account, "toast-id")

      // Fast-forward through all retry delays
      vi.advanceTimersByTime(1000) // Attempt 1 fails, delay 1s
      await vi.runAllTimersAsync()

      const result = await resultPromise

      expect(result.success).toBe(false)
      expect(mockEnsureAccountApiToken).toHaveBeenCalledTimes(3)
      expect(mockToast.error).toHaveBeenCalled()
    })

    it("should not retry on non-network errors", async () => {
      const { autoConfigToNewApi } = await import(
        "~/services/newApiService/newApiService"
      )
      const account = createMockSiteAccount()
      const displayData = createMockDisplaySiteData()

      mockGetPreferences.mockResolvedValue(
        createMockUserPreferencesWithNewApi(),
      )
      mockAccountStorageConvertToDisplayData.mockReturnValue(displayData)
      // Error that doesn't contain "network" or "Failed to fetch"
      mockEnsureAccountApiToken.mockRejectedValue(
        new Error("Invalid token error"),
      )

      const result = await autoConfigToNewApi(account, "toast-id")

      expect(result.success).toBe(false)
      expect(mockEnsureAccountApiToken).toHaveBeenCalledTimes(1)
      expect(result.message).toContain("Invalid token")
    })

    it("should update toast with retry message", async () => {
      const { autoConfigToNewApi } = await import(
        "~/services/newApiService/newApiService"
      )
      const account = createMockSiteAccount()
      const token = createMockApiToken({ models: "gpt-4" })
      const displayData = createMockDisplaySiteData()

      mockGetPreferences.mockResolvedValue(
        createMockUserPreferencesWithNewApi(),
      )
      mockAccountStorageConvertToDisplayData.mockReturnValue(displayData)
      mockEnsureAccountApiToken
        .mockRejectedValueOnce(new Error("network error"))
        .mockResolvedValueOnce(token)

      mockFetchUpstreamModelsNameList.mockResolvedValue(["gpt-4"])
      mockFetchApiData.mockResolvedValue(createMockNewApiChannelListData([]))
      mockFetchApi.mockResolvedValue({ success: true })

      const resultPromise = autoConfigToNewApi(account, "toast-id")

      vi.advanceTimersByTime(1000)
      await vi.runAllTimersAsync()

      const result = await resultPromise

      expect(result.success).toBe(true)
      // Should have shown error and then loading/retrying message
      expect(mockToast.error).toHaveBeenCalled()
    })

    it("should return aggregated error message on final failure", async () => {
      const { autoConfigToNewApi } = await import(
        "~/services/newApiService/newApiService"
      )
      const account = createMockSiteAccount()
      const displayData = createMockDisplaySiteData()

      mockGetPreferences.mockResolvedValue(
        createMockUserPreferencesWithNewApi(),
      )
      mockAccountStorageConvertToDisplayData.mockReturnValue(displayData)
      // Use network error so it retries all 3 times
      mockEnsureAccountApiToken.mockRejectedValue(
        new Error("Failed to fetch: network unreachable"),
      )

      const resultPromise = autoConfigToNewApi(account, "toast-id")

      vi.advanceTimersByTime(1000)
      await vi.runAllTimersAsync()

      const result = await resultPromise

      expect(result.success).toBe(false)
      expect(result.message).toBeTruthy()
    })
  })

  // ========================================================================
  // Helper Functions
  // ========================================================================

  describe("parseDelimitedList (via fetchAvailableModels)", () => {
    it("should parse comma-delimited string", async () => {
      const { fetchAvailableModels } = await import(
        "~/services/newApiService/newApiService"
      )
      const account = createMockDisplaySiteData()
      const token = createMockApiToken({
        models: "gpt-4, gpt-3.5-turbo , claude-3",
      })

      const result = await fetchAvailableModels(account, token)

      expect(result).toContain("gpt-4")
      expect(result).toContain("gpt-3.5-turbo")
      expect(result).toContain("claude-3")
    })

    it("should handle empty models string", async () => {
      const { fetchAvailableModels } = await import(
        "~/services/newApiService/newApiService"
      )
      const account = createMockDisplaySiteData()
      const token = createMockApiToken({ models: "" })

      mockFetchUpstreamModelsNameList.mockResolvedValueOnce([])
      mockFetchAccountAvailableModels.mockResolvedValueOnce([])

      const result = await fetchAvailableModels(account, token)

      expect(result).toEqual([])
    })
  })
})
