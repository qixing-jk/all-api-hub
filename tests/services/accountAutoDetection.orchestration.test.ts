import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import {
  AUTO_DETECT_ERROR_CODES,
  AUTO_DETECT_FETCH_CONTEXT_KINDS,
  AUTO_DETECT_STRATEGIES,
} from "~/constants/autoDetect"
import { SITE_TYPES } from "~/constants/siteType"
import {
  AUTO_DETECT_FAILURE_REASONS,
  AutoDetectErrorType,
} from "~/services/accounts/utils/autoDetectUtils"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"

const {
  accountAutoDetectionMocks,
  accountAutoDetectionModuleMocks,
  loadAccountAutoDetection,
  resetAccountAutoDetectionMocks,
  serializeLoggerCalls,
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
  loggerMock,
  mockAutoDetectSmart,
  mockExtractDefaultExchangeRate,
  mockFetchSiteStatus,
  mockFetchSupportCheckIn,
  mockGetOrCreateAccessToken,
  mockOpenRouterPageAction,
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
      recoveryData: {
        siteType: SITE_TYPES.OPENROUTER,
        authType: AuthTypeEnum.AccessToken,
      },
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
        methodKnowledge: { methods: {} },
        selection: { mode: "automatic" },
      }),
    })
    expect(mockSendRuntimeMessage).toHaveBeenCalledWith({
      action: expect.any(String),
      url: "https://tracked.example.com",
    })
    expect(mockFetchSiteStatus).toHaveBeenCalledTimes(1)
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
