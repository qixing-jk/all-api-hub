import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import {
  AUTO_DETECT_FETCH_CONTEXT_KINDS,
  AUTO_DETECT_STRATEGIES,
} from "~/constants/autoDetect"
import { SITE_TYPES } from "~/constants/siteType"
import { AUTO_DETECT_FAILURE_REASONS } from "~/services/accounts/utils/autoDetectUtils"
import { API_SERVICE_FETCH_CONTEXT_KINDS } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"

const {
  accountAutoDetectionMocks,
  accountAutoDetectionModuleMocks,
  browserFetchContext,
  currentTabFetchContext,
  incognitoCurrentTabFetchContext,
  loadAccountAutoDetection,
  resetAccountAutoDetectionMocks,
} = await vi.hoisted(async () => import("./accountAutoDetectionTestSupport"))

vi.mock(
  "~/services/siteDetection/autoDetectService",
  accountAutoDetectionModuleMocks.autoDetectService,
)
vi.mock("~/utils/core/logger", accountAutoDetectionModuleMocks.logger)
vi.mock(
  "~/utils/browser/browserApi",
  accountAutoDetectionModuleMocks.browserApi,
)
vi.mock(
  "~/services/apiAdapters/openrouter/managementKeyActionClient",
  accountAutoDetectionModuleMocks.openRouterManagementKeyActionClient,
)
vi.mock(
  "~/services/apiAdapters/newApi/accountBootstrap",
  accountAutoDetectionModuleMocks.newApiAccountBootstrap,
)
vi.mock(
  "~/services/apiAdapters/sub2api/accountBootstrap",
  accountAutoDetectionModuleMocks.sub2ApiAccountBootstrap,
)
vi.mock(
  "~/services/apiAdapters/aihubmix/accountBootstrap",
  accountAutoDetectionModuleMocks.aihubmixAccountBootstrap,
)
vi.mock(
  "~/services/apiService/sharedchat",
  accountAutoDetectionModuleMocks.sharedChat,
)
vi.mock(
  "~/services/checkin/autoCheckin/discovery",
  accountAutoDetectionModuleMocks.checkInDiscovery,
)

const {
  mockAutoDetectSmart,
  mockExtractDefaultExchangeRate,
  mockFetchSiteStatus,
  mockFetchSupportCheckIn,
  mockFetchUserInfo,
  mockGetOrCreateAccessToken,
  mockSendRuntimeMessage,
} = accountAutoDetectionMocks

let autoDetectAccount: typeof import("~/services/accounts/accountAutoDetection").autoDetectAccount

beforeAll(async () => {
  const accountAutoDetection = await loadAccountAutoDetection()
  autoDetectAccount = accountAutoDetection.autoDetectAccount
})

describe("accountAutoDetection", () => {
  beforeEach(() => {
    resetAccountAutoDetectionMocks()
  })

  it("preserves privacy-safe auto-detect metadata in success responses", async () => {
    const autoDetectContext = {
      strategy: AUTO_DETECT_STRATEGIES.CurrentTab,
      fetchContextKind: AUTO_DETECT_FETCH_CONTEXT_KINDS.CurrentTab,
      incognitoContextUsed: true,
      currentTabMatched: true,
    }
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      autoDetectContext,
      data: {
        userId: "7",
        siteType: SITE_TYPES.NEW_API,
        fetchContext: incognitoCurrentTabFetchContext(
          "https://status.example.com",
        ),
      },
    })
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "detected-user",
      access_token: "detected-token",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "Detected Portal",
      checkin_enabled: false,
    })
    mockExtractDefaultExchangeRate.mockReturnValueOnce(7)

    const result = await autoDetectAccount(
      "https://status.example.com",
      AuthTypeEnum.AccessToken,
    )

    expect(result.success).toBe(true)
    expect(result.data?.autoDetectContext).toEqual({
      ...autoDetectContext,
      siteType: SITE_TYPES.NEW_API,
    })
  })

  it("preserves privacy-safe auto-detect metadata in failure responses", async () => {
    const autoDetectContext = {
      strategy: AUTO_DETECT_STRATEGIES.BackgroundTempContext,
      siteType: SITE_TYPES.NEW_API,
      fetchContextKind: AUTO_DETECT_FETCH_CONTEXT_KINDS.BrowserContext,
      incognitoContextUsed: false,
      currentTabMatched: false,
    }
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: false,
      error: "messages:operations.detection.getUserIdFailed",
      autoDetectContext,
    })

    const result = await autoDetectAccount(
      "https://status.example.com",
      AuthTypeEnum.AccessToken,
    )

    expect(result.success).toBe(false)
    expect(result.autoDetectContext).toEqual(autoDetectContext)
  })

  it("passes current-tab context to service requests during auto-detect completion", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "7",
        siteType: SITE_TYPES.NEW_API,
        fetchContext: currentTabFetchContext("https://status.example.com"),
      },
    })
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "content-status-user",
      access_token: "content-status-token",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "Content Status Portal",
      price: 7.4,
      checkin_enabled: true,
    })
    mockExtractDefaultExchangeRate.mockReturnValueOnce(7.4)

    const result = await autoDetectAccount(
      "https://status.example.com",
      AuthTypeEnum.AccessToken,
    )

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      username: "content-status-user",
      siteName: "Content Status Portal",
      exchangeRate: 7.4,
      checkIn: expect.objectContaining({
        automaticExecutionEnabled: true,
        selection: expect.objectContaining({
          methodId: "new-api:daily-checkin",
        }),
      }),
    })
    expect(mockGetOrCreateAccessToken).toHaveBeenCalledWith({
      baseUrl: "https://status.example.com",
      fetchContext: currentTabFetchContext("https://status.example.com"),
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "7",
      },
    })
    expect(mockFetchSiteStatus).toHaveBeenCalledWith({
      baseUrl: "https://status.example.com",
      fetchContext: currentTabFetchContext("https://status.example.com"),
      auth: {
        authType: AuthTypeEnum.AccessToken,
      },
    })
    expect(mockFetchSupportCheckIn).not.toHaveBeenCalled()
    expect(mockExtractDefaultExchangeRate).toHaveBeenCalledWith({
      system_name: "Content Status Portal",
      price: 7.4,
      checkin_enabled: true,
    })
  })

  it("passes browser-context auto-detect data through service requests", async () => {
    const fetchContext = browserFetchContext()
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "8",
        siteType: SITE_TYPES.NEW_API,
        fetchContext,
      },
    })
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "browser-context-user",
      access_token: "browser-context-token",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "Browser Context Portal",
      checkin_enabled: true,
    })
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    const result = await autoDetectAccount(
      "https://browser-context.example.com",
      AuthTypeEnum.AccessToken,
    )

    expect(result.success).toBe(true)
    expect(result.data?.fetchContext).toEqual(fetchContext)
    expect(mockGetOrCreateAccessToken).toHaveBeenCalledWith({
      baseUrl: "https://browser-context.example.com",
      fetchContext,
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "8",
      },
    })
    expect(mockFetchSiteStatus).toHaveBeenCalledWith({
      baseUrl: "https://browser-context.example.com",
      fetchContext,
      auth: {
        authType: AuthTypeEnum.AccessToken,
      },
    })
  })

  it("drops malformed current-tab fetch context before service requests", async () => {
    const malformedFetchContext = {
      kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
      tabId: "not-a-number",
      origin: "https://malformed.example.com",
      cookieStoreId: "",
    }
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "8",
        siteType: SITE_TYPES.NEW_API,
        fetchContext: malformedFetchContext,
      },
    })
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "malformed-context-user",
      access_token: "malformed-context-token",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "Malformed Context Portal",
      checkin_enabled: true,
    })
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    const result = await autoDetectAccount(
      "https://malformed.example.com",
      AuthTypeEnum.AccessToken,
    )

    expect(result.success).toBe(true)
    expect(result.data).not.toHaveProperty("fetchContext")
    expect(mockGetOrCreateAccessToken).toHaveBeenCalledWith({
      baseUrl: "https://malformed.example.com",
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "8",
      },
    })
    expect(mockFetchSiteStatus).toHaveBeenCalledWith({
      baseUrl: "https://malformed.example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
      },
    })
  })

  it("keeps legacy browser-profile context without current-tab kind", async () => {
    const legacyFetchContext = {
      incognito: true,
      cookieStoreId: "legacy-container",
    }
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "8",
        siteType: SITE_TYPES.NEW_API,
        fetchContext: legacyFetchContext,
      },
    })
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "legacy-context-user",
      access_token: "legacy-context-token",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "Legacy Context Portal",
      checkin_enabled: true,
    })
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    const result = await autoDetectAccount(
      "https://legacy-context.example.com",
      AuthTypeEnum.AccessToken,
    )

    expect(result.success).toBe(true)
    expect(result.data?.fetchContext).toEqual(legacyFetchContext)
    expect(mockGetOrCreateAccessToken).toHaveBeenCalledWith({
      baseUrl: "https://legacy-context.example.com",
      fetchContext: legacyFetchContext,
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "8",
      },
    })
  })

  it("returns current-tab fetch context for dialog cookie-store follow-up work", async () => {
    const fetchContext = incognitoCurrentTabFetchContext(
      "https://status.example.com",
    )
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "7",
        siteType: SITE_TYPES.NEW_API,
        fetchContext,
      },
    })
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "content-status-user",
      access_token: "content-status-token",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "Content Status Portal",
      checkin_enabled: true,
    })
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    const result = await autoDetectAccount(
      "https://status.example.com",
      AuthTypeEnum.AccessToken,
    )

    expect(result.success).toBe(true)
    expect(result.data?.fetchContext).toEqual(fetchContext)
  })

  it("uses service-layer check-in support when current-tab site status has no check-in flag", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "7",
        siteType: SITE_TYPES.NEW_API,
        fetchContext: currentTabFetchContext("https://status.example.com"),
      },
    })
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "status-fallback-user",
      access_token: "status-fallback-token",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "Service Status Portal",
      price: 6.9,
    })
    mockFetchSupportCheckIn.mockResolvedValueOnce(false)
    mockExtractDefaultExchangeRate.mockReturnValueOnce(6.9)

    const result = await autoDetectAccount(
      "https://status.example.com",
      AuthTypeEnum.AccessToken,
    )

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      username: "status-fallback-user",
      siteName: "Service Status Portal",
      exchangeRate: 6.9,
      checkIn: expect.objectContaining({
        automaticExecutionEnabled: true,
        methodKnowledge: { methods: {} },
        selection: { mode: "automatic" },
      }),
    })
    expect(mockFetchSiteStatus).toHaveBeenCalledWith({
      baseUrl: "https://status.example.com",
      fetchContext: currentTabFetchContext("https://status.example.com"),
      auth: {
        authType: AuthTypeEnum.AccessToken,
      },
    })
    expect(mockFetchSupportCheckIn).toHaveBeenCalledWith({
      baseUrl: "https://status.example.com",
      fetchContext: currentTabFetchContext("https://status.example.com"),
      auth: {
        authType: AuthTypeEnum.None,
      },
    })
  })

  it("passes current-tab context to New API cookie-auth auto-detect completion", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "7",
        siteType: SITE_TYPES.NEW_API,
        fetchContext: currentTabFetchContext("https://cookie.example.com"),
      },
    })
    mockFetchUserInfo.mockResolvedValueOnce({
      username: "incognito-cookie-user",
      access_token: "",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      billing_mode: "quota",
      system_name: "Incognito Portal",
      checkin_enabled: true,
    })
    mockExtractDefaultExchangeRate.mockReturnValueOnce(6.6)

    const result = await autoDetectAccount(
      "https://cookie.example.com",
      AuthTypeEnum.Cookie,
    )

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      username: "incognito-cookie-user",
      siteName: "Incognito Portal",
      authType: AuthTypeEnum.Cookie,
    })
    expect(mockFetchUserInfo).toHaveBeenCalledWith({
      baseUrl: "https://cookie.example.com",
      fetchContext: currentTabFetchContext("https://cookie.example.com"),
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "7",
      },
    })
    expect(mockFetchSiteStatus).toHaveBeenCalledWith({
      baseUrl: "https://cookie.example.com",
      fetchContext: currentTabFetchContext("https://cookie.example.com"),
      auth: {
        authType: AuthTypeEnum.Cookie,
      },
    })
    expect(mockFetchSupportCheckIn).not.toHaveBeenCalled()
  })

  it("passes current-tab context to New API access-token auto-detect completion", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "7",
        siteType: SITE_TYPES.NEW_API,
        fetchContext: currentTabFetchContext("https://cookie.example.com"),
      },
    })
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "incognito-token-user",
      access_token: "incognito-created-token",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      billing_mode: "quota",
      system_name: "Incognito Token Portal",
      checkin_enabled: true,
    })
    mockExtractDefaultExchangeRate.mockReturnValueOnce(6.6)

    const result = await autoDetectAccount(
      "https://cookie.example.com",
      AuthTypeEnum.AccessToken,
    )

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      username: "incognito-token-user",
      accessToken: "incognito-created-token",
      authType: AuthTypeEnum.AccessToken,
    })
    expect(mockGetOrCreateAccessToken).toHaveBeenCalledWith({
      baseUrl: "https://cookie.example.com",
      fetchContext: currentTabFetchContext("https://cookie.example.com"),
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "7",
      },
    })
    expect(mockFetchSiteStatus).toHaveBeenCalledWith({
      baseUrl: "https://cookie.example.com",
      fetchContext: currentTabFetchContext("https://cookie.example.com"),
      auth: {
        authType: AuthTypeEnum.AccessToken,
      },
    })
    expect(mockFetchSupportCheckIn).not.toHaveBeenCalled()
  })

  it("lets the service layer handle New API current-tab token fallback", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "7",
        siteType: SITE_TYPES.NEW_API,
        fetchContext: currentTabFetchContext("https://cookie.example.com"),
      },
    })
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "fallback-user",
      access_token: "fallback-token",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "Fallback Portal",
      checkin_enabled: false,
    })
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    const result = await autoDetectAccount(
      "https://cookie.example.com",
      AuthTypeEnum.AccessToken,
    )

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      username: "fallback-user",
      accessToken: "fallback-token",
    })
    expect(mockGetOrCreateAccessToken).toHaveBeenCalledWith({
      baseUrl: "https://cookie.example.com",
      fetchContext: currentTabFetchContext("https://cookie.example.com"),
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "7",
      },
    })
    expect(mockFetchSupportCheckIn).not.toHaveBeenCalled()
  })

  it("passes current-tab context to Veloera access-token auto-detect completion", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "7",
        siteType: SITE_TYPES.VELOERA,
        fetchContext: currentTabFetchContext("https://veloera.example.com"),
      },
    })
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "veloera-user",
      access_token: "veloera-token",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "Veloera Portal",
      checkin_enabled: false,
    })
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    const result = await autoDetectAccount(
      "https://veloera.example.com",
      AuthTypeEnum.AccessToken,
    )

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      username: "veloera-user",
      accessToken: "veloera-token",
      siteType: SITE_TYPES.VELOERA,
    })
    expect(mockGetOrCreateAccessToken).toHaveBeenCalledWith({
      baseUrl: "https://veloera.example.com",
      fetchContext: currentTabFetchContext("https://veloera.example.com"),
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "7",
      },
    })
    expect(mockFetchSiteStatus).toHaveBeenCalledWith({
      baseUrl: "https://veloera.example.com",
      fetchContext: currentTabFetchContext("https://veloera.example.com"),
      auth: {
        authType: AuthTypeEnum.AccessToken,
      },
    })
    expect(mockFetchSupportCheckIn).not.toHaveBeenCalled()
  })

  it("uses final hinted site type in metadata when completion validation fails", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      autoDetectContext: {
        strategy: AUTO_DETECT_STRATEGIES.CurrentTab,
        siteType: SITE_TYPES.NEW_API,
        fetchContextKind: AUTO_DETECT_FETCH_CONTEXT_KINDS.CurrentTab,
        incognitoContextUsed: false,
        currentTabMatched: true,
      },
      data: {
        userId: "12",
        user: { id: 12 },
        siteType: SITE_TYPES.VELOERA,
        fetchContext: currentTabFetchContext("https://veloera.example.com"),
      },
    })
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "",
      access_token: "veloera-token",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "Veloera",
    })
    mockFetchSupportCheckIn.mockResolvedValueOnce(false)
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    const result = await autoDetectAccount(
      "https://veloera.example.com",
      AuthTypeEnum.AccessToken,
    )

    expect(result).toMatchObject({
      success: false,
      autoDetectFailureReason: AUTO_DETECT_FAILURE_REASONS.UsernameMissing,
      autoDetectContext: expect.objectContaining({
        siteType: SITE_TYPES.VELOERA,
      }),
    })
  })
})
