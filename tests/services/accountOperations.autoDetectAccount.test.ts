import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  AUTO_DETECT_ERROR_CODES,
  AUTO_DETECT_FETCH_CONTEXT_KINDS,
  AUTO_DETECT_STRATEGIES,
} from "~/constants/autoDetect"
import { SITE_TYPES } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import { autoDetectAccount } from "~/services/accounts/accountOperations"
import {
  AUTO_DETECT_FAILURE_REASONS,
  AutoDetectErrorType,
} from "~/services/accounts/utils/autoDetectUtils"
import { API_SERVICE_FETCH_CONTEXT_KINDS } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"

const {
  mockAutoDetectSmart,
  mockSendRuntimeMessage,
  mockFetchSiteStatus,
  mockFetchSupportCheckIn,
  mockExtractDefaultExchangeRate,
  mockFetchUserInfo,
  mockCreateNewApiAccountBootstrap,
  mockGetOrCreateAccessToken,
} = vi.hoisted(() => ({
  mockAutoDetectSmart: vi.fn(),
  mockSendRuntimeMessage: vi.fn(),
  mockFetchSiteStatus: vi.fn(),
  mockFetchSupportCheckIn: vi.fn(),
  mockExtractDefaultExchangeRate: vi.fn(),
  mockFetchUserInfo: vi.fn(),
  mockCreateNewApiAccountBootstrap: vi.fn(),
  mockGetOrCreateAccessToken: vi.fn(),
}))

vi.mock("~/services/siteDetection/autoDetectService", () => ({
  autoDetectSmart: mockAutoDetectSmart,
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    sendRuntimeMessage: mockSendRuntimeMessage,
  }
})

vi.mock("~/services/apiAdapters/newApi/accountBootstrap", () => ({
  createNewApiAccountBootstrap: mockCreateNewApiAccountBootstrap,
}))

vi.mock("~/services/apiAdapters/sub2api/accountBootstrap", () => ({
  sub2ApiAccountBootstrap: {
    extractDefaultExchangeRate: mockExtractDefaultExchangeRate,
    fetchCheckInSupport: mockFetchSupportCheckIn,
    fetchSiteStatus: mockFetchSiteStatus,
    fetchUserInfo: mockFetchUserInfo,
    getOrCreateAccessToken: mockGetOrCreateAccessToken,
    resolveRoutePath: vi.fn(),
  },
}))

vi.mock("~/services/apiAdapters/aihubmix/accountBootstrap", () => ({
  aihubmixAccountBootstrap: {
    extractDefaultExchangeRate: mockExtractDefaultExchangeRate,
    fetchCheckInSupport: mockFetchSupportCheckIn,
    fetchSiteStatus: mockFetchSiteStatus,
    fetchUserInfo: mockFetchUserInfo,
    getOrCreateAccessToken: mockGetOrCreateAccessToken,
    resolveRoutePath: vi.fn(),
  },
}))

const currentTabFetchContext = (origin: string) => ({
  kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
  tabId: 123,
  origin,
})

const incognitoCurrentTabFetchContext = (origin: string) => ({
  ...currentTabFetchContext(origin),
  incognito: true,
  cookieStoreId: "1-incognito",
})

const browserFetchContext = () => ({
  kind: API_SERVICE_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT,
  cookieStoreId: "firefox-container-2",
})

describe("accountOperations autoDetectAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateNewApiAccountBootstrap.mockReturnValue({
      extractDefaultExchangeRate: mockExtractDefaultExchangeRate,
      fetchCheckInSupport: mockFetchSupportCheckIn,
      fetchSiteStatus: mockFetchSiteStatus,
      fetchUserInfo: mockFetchUserInfo,
      getOrCreateAccessToken: mockGetOrCreateAccessToken,
      resolveRoutePath: vi.fn(),
    })
  })

  it("returns a validation error when the URL is blank", async () => {
    const result = await autoDetectAccount("   ", AuthTypeEnum.AccessToken)

    expect(result).toEqual({
      success: false,
      message: "messages:errors.validation.urlRequired",
    })
    expect(mockAutoDetectSmart).not.toHaveBeenCalled()
  })

  it("returns Sub2API result with default exchange rate and empty username", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "1",
        user: { id: 1, username: "" },
        siteType: SITE_TYPES.SUB2API,
        accessToken: "jwt-token",
        fetchContext: currentTabFetchContext("https://sub2.example.com"),
      },
    })

    mockFetchSiteStatus.mockResolvedValueOnce(null)
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    const result = await autoDetectAccount(
      "https://sub2.example.com",
      AuthTypeEnum.Cookie,
    )

    expect(result.success).toBe(true)
    expect(result.data?.siteType).toBe(SITE_TYPES.SUB2API)
    expect(result.data?.username).toBe("")
    expect(result.data?.accessToken).toBe("jwt-token")
    expect(result.data?.exchangeRate).toBe(UI_CONSTANTS.EXCHANGE_RATE.DEFAULT)
  })

  it("uses detected Sub2API access-token semantics during auto-detect completion", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "12",
        user: { id: 12, username: "alice" },
        siteType: SITE_TYPES.SUB2API,
        accessToken: "jwt-token",
        fetchContext: currentTabFetchContext("https://sub2.example.com"),
      },
    })
    mockFetchSiteStatus.mockResolvedValueOnce(null)
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    const result = await autoDetectAccount(
      "https://sub2.example.com",
      AuthTypeEnum.AccessToken,
    )

    expect(result.success).toBe(true)
    expect(mockGetOrCreateAccessToken).not.toHaveBeenCalled()
    expect(result.data).toMatchObject({
      siteType: SITE_TYPES.SUB2API,
      username: "alice",
      accessToken: "jwt-token",
      exchangeRate: UI_CONSTANTS.EXCHANGE_RATE.DEFAULT,
    })
  })

  it("continues detection when cookie-interceptor tracking fails", async () => {
    mockSendRuntimeMessage.mockRejectedValueOnce(new Error("track failed"))
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "9",
        siteType: "new-api",
      },
    })
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "tracked-user",
      access_token: "tracked-token",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      quota_per_unit: 42,
      system_name: "Tracked Portal",
    })
    mockFetchSupportCheckIn.mockResolvedValueOnce(undefined)
    mockExtractDefaultExchangeRate.mockReturnValueOnce(8.8)

    const result = await autoDetectAccount(
      "https://tracked.example.com",
      AuthTypeEnum.AccessToken,
    )

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      username: "tracked-user",
      siteName: "Tracked Portal",
      accessToken: "tracked-token",
      exchangeRate: 8.8,
      checkIn: expect.objectContaining({
        enableDetection: false,
      }),
    })
    expect(mockSendRuntimeMessage).toHaveBeenCalledWith({
      action: expect.any(String),
      url: "https://tracked.example.com",
    })
    expect(mockFetchSiteStatus).toHaveBeenCalledTimes(1)
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
        enableDetection: true,
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
        enableDetection: false,
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

  it("returns a get-user-id failure when detection succeeds without a user id", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "",
        siteType: "new-api",
      },
    })

    const result = await autoDetectAccount(
      "https://example.com",
      AuthTypeEnum.AccessToken,
    )

    expect(result).toMatchObject({
      success: false,
      message: "messages:operations.detection.getUserIdFailedDetailed",
      autoDetectFailureReason: AUTO_DETECT_FAILURE_REASONS.UserIdMissing,
      detailedError: expect.objectContaining({
        type: AutoDetectErrorType.INVALID_RESPONSE,
      }),
    })
  })

  it("returns the upstream detection failure reason when smart detection fails", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: false,
      error: "messages:autodetect.currentTabNeedsReload",
      errorCode: AUTO_DETECT_ERROR_CODES.CURRENT_TAB_CONTENT_SCRIPT_UNAVAILABLE,
    })

    const result = await autoDetectAccount(
      "https://example.com",
      AuthTypeEnum.AccessToken,
    )

    expect(result).toMatchObject({
      success: false,
      message: "messages:autodetect.currentTabNeedsReload",
      autoDetectFailureReason:
        AUTO_DETECT_FAILURE_REASONS.CurrentTabContentScriptUnavailable,
      detailedError: expect.objectContaining({
        type: AutoDetectErrorType.CURRENT_TAB_RELOAD_REQUIRED,
      }),
    })
  })

  it("returns the site-type detection failure reason when smart detection cannot classify the site", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: false,
      error: "private site type error",
      errorCode: AUTO_DETECT_ERROR_CODES.SITE_TYPE_DETECTION_FAILED,
    })

    const result = await autoDetectAccount(
      "https://unknown.example.com",
      AuthTypeEnum.AccessToken,
    )

    expect(result).toMatchObject({
      success: false,
      message: "messages:autodetect.notFound",
      autoDetectFailureReason:
        AUTO_DETECT_FAILURE_REASONS.SiteTypeDetectionFailed,
      detailedError: expect.objectContaining({
        type: AutoDetectErrorType.NOT_FOUND,
      }),
    })
  })

  it("uses the cookie-auth user-info flow when Cookie auth is selected", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "7",
        siteType: "new-api",
      },
    })
    mockFetchUserInfo.mockResolvedValueOnce({
      username: "cookie-user",
      access_token: "",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      billing_mode: "quota",
      system_name: "Cookie Portal",
    })
    mockFetchSupportCheckIn.mockResolvedValueOnce(true)
    mockExtractDefaultExchangeRate.mockReturnValueOnce(6.6)

    const result = await autoDetectAccount(
      "https://cookie.example.com",
      AuthTypeEnum.Cookie,
    )

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      username: "cookie-user",
      siteName: "Cookie Portal",
      exchangeRate: 6.6,
      checkIn: expect.objectContaining({
        enableDetection: true,
      }),
    })
    expect(mockFetchUserInfo).toHaveBeenCalledWith({
      baseUrl: "https://cookie.example.com",
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "7",
      },
    })
    expect(mockGetOrCreateAccessToken).not.toHaveBeenCalled()
    expect(mockFetchSiteStatus).toHaveBeenCalledTimes(1)
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

  it("passes current-tab context through AnyRouter auto-detect completion", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "7",
        siteType: SITE_TYPES.ANYROUTER,
        fetchContext: currentTabFetchContext("https://anyrouter.example.com"),
      },
    })
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "anyrouter-user",
      access_token: "anyrouter-token",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "AnyRouter Portal",
    })
    mockFetchSupportCheckIn.mockResolvedValueOnce(true)
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    const result = await autoDetectAccount(
      "https://anyrouter.example.com",
      AuthTypeEnum.AccessToken,
    )

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      username: "anyrouter-user",
      accessToken: "anyrouter-token",
      siteType: SITE_TYPES.ANYROUTER,
      checkIn: expect.objectContaining({
        enableDetection: true,
      }),
    })
    expect(mockGetOrCreateAccessToken).toHaveBeenCalledWith({
      baseUrl: "https://anyrouter.example.com",
      fetchContext: currentTabFetchContext("https://anyrouter.example.com"),
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "7",
      },
    })
    expect(mockFetchSupportCheckIn).toHaveBeenCalledWith({
      baseUrl: "https://anyrouter.example.com",
      fetchContext: currentTabFetchContext("https://anyrouter.example.com"),
      auth: {
        authType: AuthTypeEnum.None,
      },
    })
  })

  it("passes current-tab context through WONG auto-detect completion", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "7",
        siteType: SITE_TYPES.WONG_GONGYI,
        fetchContext: currentTabFetchContext("https://wong.example.com"),
      },
    })
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "wong-user",
      access_token: "wong-token",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "WONG公益站",
    })
    mockFetchSupportCheckIn.mockResolvedValueOnce(true)
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    const result = await autoDetectAccount(
      "https://wong.example.com",
      AuthTypeEnum.AccessToken,
    )

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      username: "wong-user",
      accessToken: "wong-token",
      siteType: SITE_TYPES.WONG_GONGYI,
      checkIn: expect.objectContaining({
        enableDetection: true,
      }),
    })
    expect(mockFetchSupportCheckIn).toHaveBeenCalledWith({
      baseUrl: "https://wong.example.com",
      fetchContext: currentTabFetchContext("https://wong.example.com"),
      auth: {
        authType: AuthTypeEnum.None,
      },
    })
  })

  it("uses the AIHubMix access token returned by auto-detect without an options-page cookie fallback", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "11",
        user: { id: 11, username: "aihubmix-user" },
        siteType: SITE_TYPES.AIHUBMIX,
        accessToken: "detected-console-token",
        fetchContext: currentTabFetchContext("https://aihubmix.com"),
      },
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "AIHubMix",
      checkin_enabled: false,
    })
    mockFetchSupportCheckIn.mockResolvedValueOnce(false)
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    const result = await autoDetectAccount(
      "https://aihubmix.com",
      AuthTypeEnum.Cookie,
    )

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      siteType: SITE_TYPES.AIHUBMIX,
      authType: AuthTypeEnum.AccessToken,
      username: "aihubmix-user",
      accessToken: "detected-console-token",
    })
    expect(mockGetOrCreateAccessToken).not.toHaveBeenCalled()
    expect(mockFetchUserInfo).not.toHaveBeenCalled()
    expect(mockFetchSiteStatus).toHaveBeenCalledWith({
      baseUrl: "https://aihubmix.com",
      fetchContext: currentTabFetchContext("https://aihubmix.com"),
      auth: {
        authType: AuthTypeEnum.Cookie,
      },
    })
  })

  it("fails AIHubMix auto-detect when the detected user has no username", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "11",
        user: { id: 11 },
        siteType: SITE_TYPES.AIHUBMIX,
        accessToken: "detected-console-token",
      },
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "AIHubMix",
    })
    mockFetchSupportCheckIn.mockResolvedValueOnce(false)
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    const result = await autoDetectAccount(
      "https://aihubmix.com",
      AuthTypeEnum.Cookie,
    )

    expect(result).toMatchObject({
      success: false,
      message: "messages:operations.detection.getUsernameFailedDetailed",
      autoDetectFailureReason: AUTO_DETECT_FAILURE_REASONS.UsernameMissing,
      detailedError: expect.objectContaining({
        type: AutoDetectErrorType.INVALID_RESPONSE,
      }),
    })
    expect(mockGetOrCreateAccessToken).not.toHaveBeenCalled()
    expect(mockFetchUserInfo).not.toHaveBeenCalled()
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

  it("fails AIHubMix auto-detect when token retrieval returns no token", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "11",
        user: { id: 11, username: "aihubmix-user" },
        siteType: SITE_TYPES.AIHUBMIX,
      },
    })
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "aihubmix-user",
      access_token: "",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({ system_name: "AIHubMix" })
    mockFetchSupportCheckIn.mockResolvedValueOnce(false)
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    const result = await autoDetectAccount(
      "https://aihubmix.com",
      AuthTypeEnum.Cookie,
    )

    expect(result).toMatchObject({
      success: false,
      message: "messages:operations.detection.getAccessTokenFailedDetailed",
      autoDetectFailureReason: AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
      detailedError: expect.objectContaining({
        type: AutoDetectErrorType.INVALID_RESPONSE,
      }),
    })
  })

  it("returns a get-info failure when access-token auth cannot obtain a usable token", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "5",
        siteType: "new-api",
      },
    })
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "missing-token-user",
      access_token: "",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "Missing Token Portal",
    })
    mockFetchSupportCheckIn.mockResolvedValueOnce(false)
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    const result = await autoDetectAccount(
      "https://token.example.com",
      AuthTypeEnum.AccessToken,
    )

    expect(result).toMatchObject({
      success: false,
      message: "messages:operations.detection.getAccessTokenFailedDetailed",
      autoDetectFailureReason: AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
      detailedError: expect.objectContaining({
        type: AutoDetectErrorType.INVALID_RESPONSE,
      }),
    })
  })

  it("classifies token creation exceptions during auto-detect completion", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "5",
        siteType: SITE_TYPES.NEW_API,
      },
    })
    mockGetOrCreateAccessToken.mockRejectedValueOnce(
      new Error("private token backend text"),
    )
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "Token Failure Portal",
    })
    mockFetchSupportCheckIn.mockResolvedValueOnce(false)

    const result = await autoDetectAccount(
      "https://token-failure.example.com",
      AuthTypeEnum.AccessToken,
    )

    expect(result).toMatchObject({
      success: false,
      autoDetectFailureReason: AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
      detailedError: expect.objectContaining({
        type: AutoDetectErrorType.UNKNOWN,
      }),
    })
  })

  it("continues auto-detect when check-in support probing fails", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "7",
        siteType: SITE_TYPES.NEW_API,
      },
    })
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "checkin-fallback-user",
      access_token: "checkin-fallback-token",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "Checkin Fallback Portal",
    })
    mockFetchSupportCheckIn.mockRejectedValueOnce(
      new Error("private check-in backend text"),
    )
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    const result = await autoDetectAccount(
      "https://checkin-fallback.example.com",
      AuthTypeEnum.AccessToken,
    )

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      username: "checkin-fallback-user",
      accessToken: "checkin-fallback-token",
      checkIn: expect.objectContaining({
        enableDetection: false,
      }),
    })
  })

  it("wraps unexpected auto-detect exceptions into a stable failure response", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockRejectedValueOnce(new Error("backend exploded"))

    const result = await autoDetectAccount(
      "https://broken.example.com",
      AuthTypeEnum.AccessToken,
    )

    expect(result).toMatchObject({
      success: false,
      message: "accountDialog:messages.autoDetectFailed",
      detailedError: expect.any(Object),
    })
  })

  it("maps current-tab content-script failures to a reload hint", async () => {
    const autoDetectContext = {
      strategy: AUTO_DETECT_STRATEGIES.CurrentTab,
      siteType: SITE_TYPES.NEW_API,
      fetchContextKind: AUTO_DETECT_FETCH_CONTEXT_KINDS.CurrentTab,
      incognitoContextUsed: true,
      currentTabMatched: true,
    }
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: false,
      error: "some generic failure",
      errorCode: AUTO_DETECT_ERROR_CODES.CURRENT_TAB_CONTENT_SCRIPT_UNAVAILABLE,
      autoDetectContext,
    })

    const result = await autoDetectAccount(
      "https://example.com",
      AuthTypeEnum.AccessToken,
    )

    expect(result.success).toBe(false)
    expect(result.detailedError).toMatchObject({
      type: "current_tab_reload_required",
      message: "messages:autodetect.currentTabNeedsReload",
      actionText: "accountDialog:actions.reloadCurrentPage",
    })
    expect(result.autoDetectContext).toEqual(autoDetectContext)
  })
})
