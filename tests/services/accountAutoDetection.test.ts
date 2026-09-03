import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  AUTO_DETECT_ERROR_CODES,
  AUTO_DETECT_FETCH_CONTEXT_KINDS,
  AUTO_DETECT_STRATEGIES,
} from "~/constants/autoDetect"
import { SITE_TYPES } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import { autoDetectAccount } from "~/services/accounts/accountAutoDetection"
import {
  AUTO_DETECT_FAILURE_REASONS,
  AutoDetectErrorType,
} from "~/services/accounts/utils/autoDetectUtils"
import { NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND } from "~/services/accountSiteOnboarding/contracts"
import { API_SERVICE_FETCH_CONTEXT_KINDS } from "~/services/apiTransport/type"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"

const {
  mockAutoDetectSmart,
  mockSendRuntimeMessage,
  mockFetchSiteStatus,
  mockFetchSupportCheckIn,
  mockExtractDefaultExchangeRate,
  mockFetchUserInfo,
  mockFetchSharedChatUserInfo,
  mockCreateNewApiAccountBootstrap,
  mockGetOrCreateAccessToken,
  mockOpenRouterPageAction,
  loggerMock,
  otherLoggerMock,
} = vi.hoisted(() => ({
  mockAutoDetectSmart: vi.fn(),
  mockSendRuntimeMessage: vi.fn(),
  mockFetchSiteStatus: vi.fn(),
  mockFetchSupportCheckIn: vi.fn(),
  mockExtractDefaultExchangeRate: vi.fn(),
  mockFetchUserInfo: vi.fn(),
  mockFetchSharedChatUserInfo: vi.fn(),
  mockCreateNewApiAccountBootstrap: vi.fn(),
  mockGetOrCreateAccessToken: vi.fn(),
  mockOpenRouterPageAction: vi.fn(),
  loggerMock: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  otherLoggerMock: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

vi.mock("~/services/siteDetection/autoDetectService", () => ({
  autoDetectSmart: mockAutoDetectSmart,
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: (scope: string) =>
    scope === "AccountOperations" ? loggerMock : otherLoggerMock,
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    sendRuntimeMessage: mockSendRuntimeMessage,
  }
})

function snapshotOwnProperties(
  value: unknown,
  seen = new WeakSet<object>(),
): unknown {
  if (!value || typeof value !== "object") return value
  if (seen.has(value)) return "[Circular]"
  seen.add(value)

  return Object.fromEntries(
    Reflect.ownKeys(value).map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      const propertyValue =
        descriptor && "value" in descriptor
          ? snapshotOwnProperties(descriptor.value, seen)
          : "[Accessor]"
      return [String(key), propertyValue]
    }),
  )
}

vi.mock("~/services/apiAdapters/openrouter/managementKeyActionClient", () => ({
  tempWindowOpenRouterManagementKeyAction: mockOpenRouterPageAction,
  cancelTempWindowOpenRouterManagementKeyAction: vi.fn(),
}))

vi.mock("~/services/apiAdapters/newApi/accountBootstrap", () => ({
  createNewApiAccountBootstrap: mockCreateNewApiAccountBootstrap,
}))

vi.mock("~/services/apiAdapters/sub2api/accountBootstrap", () => ({
  sub2ApiAccountBootstrap: {
    fetchUserInfo: mockFetchUserInfo,
    getOrCreateAccessToken: mockGetOrCreateAccessToken,
    fetchSiteStatus: mockFetchSiteStatus,
    extractDefaultExchangeRate: mockExtractDefaultExchangeRate,
    fetchCheckInSupport: mockFetchSupportCheckIn,
    resolveRoutePath: vi.fn(),
  },
}))

vi.mock("~/services/apiAdapters/aihubmix/accountBootstrap", () => ({
  aihubmixAccountBootstrap: {
    fetchUserInfo: mockFetchUserInfo,
    getOrCreateAccessToken: mockGetOrCreateAccessToken,
    fetchSiteStatus: mockFetchSiteStatus,
    extractDefaultExchangeRate: mockExtractDefaultExchangeRate,
    fetchCheckInSupport: mockFetchSupportCheckIn,
    resolveRoutePath: vi.fn(),
  },
}))

vi.mock("~/services/apiService/sharedchat", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/apiService/sharedchat")>()

  return {
    ...actual,
    fetchUserInfo: mockFetchSharedChatUserInfo,
  }
})

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

const unknownNewApiCheckInDiscovery = () => ({
  lastFullDiscoveryAt: expect.any(Number),
  methods: {
    "new-api:daily-checkin": {
      detection: {
        outcome: "unknown",
        reason: "network",
        attemptedAt: expect.any(Number),
      },
    },
  },
})

const serializeLoggerCalls = () =>
  JSON.stringify(
    [loggerMock, otherLoggerMock].flatMap((logger) =>
      [logger.debug, logger.error, logger.info, logger.warn].flatMap((method) =>
        method.mock.calls.map((args) =>
          args.map((value) =>
            value instanceof Error
              ? {
                  name: value.name,
                  message: value.message,
                  stack: value.stack,
                }
              : value,
          ),
        ),
      ),
    ),
  )

describe("accountAutoDetection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAutoDetectSmart.mockReset()
    mockSendRuntimeMessage.mockReset()
    mockFetchSiteStatus.mockReset()
    mockFetchSupportCheckIn.mockReset()
    mockExtractDefaultExchangeRate.mockReset()
    mockFetchUserInfo.mockReset()
    mockFetchSharedChatUserInfo.mockReset()
    mockCreateNewApiAccountBootstrap.mockReset()
    mockGetOrCreateAccessToken.mockReset()
    mockOpenRouterPageAction.mockReset()
    mockCreateNewApiAccountBootstrap.mockReturnValue({
      fetchUserInfo: mockFetchUserInfo,
      getOrCreateAccessToken: mockGetOrCreateAccessToken,
      fetchSiteStatus: mockFetchSiteStatus,
      extractDefaultExchangeRate: mockExtractDefaultExchangeRate,
      fetchCheckInSupport: mockFetchSupportCheckIn,
      resolveRoutePath: vi.fn(),
    })
  })

  it("keeps generic auto-detect detected-only when a legacy caller passes provider options", async () => {
    const privateError = "openrouter-detected-only-private-sentinel"
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: false,
      error: privateError,
    })

    const callWithLegacyOptions = autoDetectAccount as unknown as (
      url: string,
      authType: AuthTypeEnum,
      options: {
        requestId: string
        allowOpenRouterBootstrap: boolean
        tempWindowRequestSource: (typeof TEMP_WINDOW_REQUEST_SOURCES)[keyof typeof TEMP_WINDOW_REQUEST_SOURCES]
      },
    ) => ReturnType<typeof autoDetectAccount>
    const result = await callWithLegacyOptions(
      "https://openrouter.ai",
      AuthTypeEnum.AccessToken,
      {
        requestId: "openrouter-request-placeholder",
        allowOpenRouterBootstrap: true,
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Options,
      },
    )

    expect(result).toMatchObject({
      kind: "detected",
      success: false,
      message: "messages:openrouter.managementKeyRequired",
    })
    expect(mockAutoDetectSmart).toHaveBeenCalledOnce()
    expect(mockOpenRouterPageAction).not.toHaveBeenCalled()
  })

  it("keeps canonical OpenRouter detection read-only without explicit bootstrap permission", async () => {
    const privateError = "openrouter-read-only-detection-private-sentinel"
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: false,
      error: privateError,
    })

    const result = await autoDetectAccount(
      "https://openrouter.ai",
      AuthTypeEnum.AccessToken,
    )

    expect(result).toMatchObject({
      kind: "detected",
      success: false,
      message: "messages:openrouter.managementKeyRequired",
      detailedError: {
        type: AutoDetectErrorType.UNKNOWN,
        message: "messages:openrouter.managementKeyRequired",
      },
      autoDetectFailureReason: AUTO_DETECT_FAILURE_REASONS.UserDataMissing,
    })
    expect(JSON.stringify(result)).not.toContain(privateError)
    expect(mockAutoDetectSmart).toHaveBeenCalledTimes(1)
    expect(mockOpenRouterPageAction).not.toHaveBeenCalled()
  })

  it("sanitizes canonical OpenRouter cookie-interceptor tracking failures", async () => {
    const privateUrl = "https://openrouter.ai/private-path?secret=canary"
    const privateError = "openrouter-cookie-interceptor-private-sentinel"
    mockSendRuntimeMessage.mockRejectedValueOnce(new Error(privateError))
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: false,
      error: "No logged-in account data",
    })

    await autoDetectAccount(privateUrl, AuthTypeEnum.AccessToken)

    expect(loggerMock.warn).toHaveBeenCalledWith(
      "Failed to track cookie interceptor url",
      {
        siteType: SITE_TYPES.OPENROUTER,
        status: "tracking_failed",
      },
    )
    const serializedLogs = serializeLoggerCalls()
    expect(serializedLogs).not.toContain(privateUrl)
    expect(serializedLogs).not.toContain(privateError)
  })

  it("sanitizes canonical OpenRouter auto-detect exceptions", async () => {
    const privateError = "openrouter-auto-detect-private-sentinel"
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockRejectedValueOnce(new Error(privateError))

    const result = await autoDetectAccount(
      "https://openrouter.ai",
      AuthTypeEnum.AccessToken,
    )

    expect(result).toMatchObject({
      kind: "detected",
      success: false,
      message: "messages:openrouter.managementKeyRequired",
      detailedError: {
        type: AutoDetectErrorType.UNKNOWN,
        message: "messages:openrouter.managementKeyRequired",
      },
      autoDetectFailureReason: AUTO_DETECT_FAILURE_REASONS.UnexpectedException,
    })
    expect(loggerMock.error).toHaveBeenCalledWith(
      "OpenRouter account detection failed",
      {
        siteType: SITE_TYPES.OPENROUTER,
        status: "failed",
        reason: AUTO_DETECT_FAILURE_REASONS.UnexpectedException,
      },
    )
    expect(serializeLoggerCalls()).not.toContain(privateError)
    expect(JSON.stringify(result)).not.toContain(privateError)
  })

  it("preserves ordinary cookie and auto-detect failure diagnostics", async () => {
    const privateUrl = "https://ordinary.example.invalid/private-path"
    const trackingError = "ordinary-cookie-tracking-sentinel"
    const detectionError = "ordinary-auto-detect-sentinel"
    mockSendRuntimeMessage.mockRejectedValueOnce(new Error(trackingError))
    mockAutoDetectSmart.mockRejectedValueOnce(new Error(detectionError))

    const result = await autoDetectAccount(privateUrl, AuthTypeEnum.AccessToken)

    expect(loggerMock.warn).toHaveBeenCalledWith(
      "Failed to track cookie interceptor url",
      {
        url: privateUrl,
        error: trackingError,
      },
    )
    expect(loggerMock.error).toHaveBeenCalledWith(
      "messages:autodetect.failed",
      expect.objectContaining({ message: detectionError }),
    )
    expect(result).toMatchObject({
      kind: "detected",
      success: false,
      message: "accountDialog:messages.autoDetectFailed",
      detailedError: {
        type: AutoDetectErrorType.UNKNOWN,
        message: "messages:autodetect.failed",
      },
      autoDetectFailureReason: AUTO_DETECT_FAILURE_REASONS.UnexpectedException,
    })
    const serializedLogs = serializeLoggerCalls()
    expect(serializedLogs).toContain(privateUrl)
    expect(serializedLogs).toContain(trackingError)
    expect(serializedLogs).toContain(detectionError)
  })

  it("does not bootstrap an alternate-port OpenRouter URL", async () => {
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: false,
      error: "No logged-in account data",
    })

    try {
      const result = await autoDetectAccount(
        "https://openrouter.ai:8443/settings/management-keys",
        AuthTypeEnum.AccessToken,
      )

      expect(result).toMatchObject({ kind: "detected", success: false })
      expect(mockAutoDetectSmart).toHaveBeenCalledTimes(1)
      expect(mockOpenRouterPageAction).not.toHaveBeenCalled()
    } finally {
      mockAutoDetectSmart.mockReset()
    }
  })

  it("does not bootstrap a blob URL that inherits the OpenRouter origin", async () => {
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: false,
      error: "No logged-in account data",
    })

    try {
      const result = await autoDetectAccount(
        "blob:https://openrouter.ai/openrouter-object-placeholder",
        AuthTypeEnum.AccessToken,
      )

      expect(result).toMatchObject({ kind: "detected", success: false })
      expect(mockAutoDetectSmart).toHaveBeenCalledTimes(1)
      expect(mockOpenRouterPageAction).not.toHaveBeenCalled()
    } finally {
      mockAutoDetectSmart.mockReset()
    }
  })

  it("returns a validation error when the URL is blank", async () => {
    const result = await autoDetectAccount("   ", AuthTypeEnum.AccessToken)

    expect(result).toEqual({
      kind: "detected",
      success: false,
      message: "messages:errors.validation.urlRequired",
    })
    expect(mockAutoDetectSmart).not.toHaveBeenCalled()
  })

  it("forwards the onboarding execution to smart detection", async () => {
    const protectionBypassExecution = userCommandExecution(
      PROTECTION_BYPASS_USER_COMMANDS.DetectAccount,
    )
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: false,
      error: "not detected",
    })

    await autoDetectAccount(
      "https://example.invalid",
      AuthTypeEnum.AccessToken,
      protectionBypassExecution,
    )

    expect(mockAutoDetectSmart).toHaveBeenCalledWith(
      "https://example.invalid",
      protectionBypassExecution,
    )
  })

  it("uses the trimmed URL throughout successful detection completion", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "1",
        user: { id: 1, username: "user" },
        siteType: SITE_TYPES.SUB2API,
        accessToken: "access-token-placeholder",
      },
    })
    mockFetchSiteStatus.mockResolvedValueOnce(null)
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    const result = await autoDetectAccount(
      "  https://sub2.example.com  ",
      AuthTypeEnum.AccessToken,
    )

    expect(result.success).toBe(true)
    expect(mockAutoDetectSmart).toHaveBeenCalledWith(
      "https://sub2.example.com",
      undefined,
    )
    expect(mockFetchSiteStatus).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "https://sub2.example.com" }),
    )
  })

  it("returns Sub2API result with default exchange rate and empty username", async () => {
    const protectionBypassExecution = userCommandExecution(
      PROTECTION_BYPASS_USER_COMMANDS.DetectAccount,
    )
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

    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "Example Portal",
      checkin_enabled: false,
    })
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    const result = await autoDetectAccount(
      "https://sub2.example.com",
      AuthTypeEnum.Cookie,
      protectionBypassExecution,
    )

    expect(result.success).toBe(true)
    expect(result.data?.siteType).toBe(SITE_TYPES.SUB2API)
    expect(result.data?.username).toBe("")
    expect(result.data?.siteName).toBe("Example Portal")
    expect(result.data?.accessToken).toBe("jwt-token")
    expect(result.data?.exchangeRate).toBe(UI_CONSTANTS.EXCHANGE_RATE.DEFAULT)
    expect(mockFetchSiteStatus).toHaveBeenCalledTimes(1)
    expect(
      mockFetchSiteStatus.mock.calls[0]?.[0].protectionBypassExecution,
    ).toEqual(protectionBypassExecution)
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

  it("completes SharedChat cookie auto-detect with frontend getme data", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "shared-user-id",
        user: {
          id: "shared-user-id",
          name: "Shared User",
          userToken: "shared-user-token",
        },
        siteType: SITE_TYPES.SHAREDCHAT,
        accessToken: "shared-user-token",
        fetchContext: currentTabFetchContext("https://new.sharedchat.cc"),
      },
    })
    mockFetchSharedChatUserInfo.mockResolvedValueOnce({
      id: "shared-user-id",
      username: "Shared User",
      access_token: "shared-user-token",
      user: {
        id: "shared-user-id",
        name: "Shared User",
        userToken: "shared-user-token",
      },
    })

    const result = await autoDetectAccount(
      "https://new.sharedchat.cc",
      AuthTypeEnum.Cookie,
    )

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      siteType: SITE_TYPES.SHAREDCHAT,
      username: "Shared User",
      accessToken: "shared-user-token",
      userId: "shared-user-id",
      authType: AuthTypeEnum.Cookie,
      exchangeRate: UI_CONSTANTS.EXCHANGE_RATE.DEFAULT,
      checkIn: {
        automaticExecutionEnabled: false,
        methodKnowledge: { methods: {} },
        selection: { mode: "automatic" },
      },
    })
    expect(mockFetchSharedChatUserInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://new.sharedchat.cc",
        auth: expect.objectContaining({
          authType: AuthTypeEnum.Cookie,
          userId: "shared-user-id",
        }),
        fetchContext: currentTabFetchContext("https://new.sharedchat.cc"),
      }),
    )
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
        automaticExecutionEnabled: true,
        methodKnowledge: unknownNewApiCheckInDiscovery(),
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

  it("returns only the management PAT from rc22 dashboard completion", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "42",
        siteType: SITE_TYPES.NEW_API,
        transientAuth: {
          kind: NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND,
          token: "dashboard-jwt",
          expiresAt: 4_102_444_800,
          sessionId: "session-example",
          origin: "https://panel.example.invalid",
        },
        fetchContext: currentTabFetchContext("https://panel.example.invalid"),
      },
    })
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "rc22-user",
      access_token: "management-pat",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "rc22 portal",
      checkin_enabled: false,
    })
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    const result = await autoDetectAccount(
      "https://panel.example.invalid",
      AuthTypeEnum.Cookie,
    )

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      accessToken: "management-pat",
      authType: AuthTypeEnum.AccessToken,
    })
    expect(result.data).not.toHaveProperty("transientAuth")
    expect(JSON.stringify(result.data)).not.toContain("dashboard-jwt")
  })

  it("does not expose or log reflected rc22 dashboard credentials", async () => {
    const dashboardToken = "dashboard-jwt-sensitive-example"
    const reflectedMessage = `upstream reflected ${dashboardToken}`
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "42",
        siteType: SITE_TYPES.NEW_API,
        transientAuth: {
          kind: NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND,
          token: dashboardToken,
          expiresAt: 4_102_444_800,
          sessionId: "session-example",
          origin: "https://panel.example.invalid",
        },
      },
    })
    mockGetOrCreateAccessToken.mockRejectedValueOnce(
      new Error(reflectedMessage),
    )
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "rc22 portal",
      checkin_enabled: false,
    })

    const result = await autoDetectAccount(
      "https://panel.example.invalid",
      AuthTypeEnum.Cookie,
    )

    expect(result).toMatchObject({
      success: false,
      autoDetectFailureReason: AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
      detailedError: expect.objectContaining({
        type: AutoDetectErrorType.UNKNOWN,
      }),
    })
    expect(JSON.stringify(result)).not.toContain(dashboardToken)
    expect(JSON.stringify(result)).not.toContain(reflectedMessage)
    expect(loggerMock.error).toHaveBeenCalledTimes(1)
    const [logMessage, logError] = loggerMock.error.mock.calls[0]
    expect(String(logMessage)).not.toContain(dashboardToken)
    expect(String(logMessage)).not.toContain(reflectedMessage)
    expect(logError).toMatchObject({
      message: "New API dashboard authentication could not be exchanged",
      cause: {
        message: "New API dashboard authentication could not be exchanged",
      },
    })
    const serializedLogError = JSON.stringify(snapshotOwnProperties(logError))
    expect(serializedLogError).not.toContain(dashboardToken)
    expect(serializedLogError).not.toContain(reflectedMessage)
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
        methodKnowledge: unknownNewApiCheckInDiscovery(),
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
        automaticExecutionEnabled: true,
        selection: expect.objectContaining({
          methodId: "new-api:daily-checkin",
        }),
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
        automaticExecutionEnabled: true,
        selection: expect.objectContaining({
          methodId: "anyrouter:daily-checkin",
        }),
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
        automaticExecutionEnabled: true,
        selection: expect.objectContaining({
          methodId: "wong-gongyi:daily-checkin",
        }),
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
        automaticExecutionEnabled: true,
        methodKnowledge: unknownNewApiCheckInDiscovery(),
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
