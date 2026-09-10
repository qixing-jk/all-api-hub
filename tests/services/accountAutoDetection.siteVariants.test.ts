import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import { NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND } from "~/services/accountSiteOnboarding/contracts"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"

const {
  accountAutoDetectionMocks,
  accountAutoDetectionModuleMocks,
  currentTabFetchContext,
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
  mockFetchSharedChatUserInfo,
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
})
