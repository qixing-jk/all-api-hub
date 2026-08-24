import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  AUTO_DETECT_FAILURE_REASONS,
  type AutoDetectFailureReason,
} from "~/constants/autoDetect"
import { SITE_TYPES } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import { AutoDetectCompletionError } from "~/services/accounts/autoDetectCompletion/types"
import { NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND } from "~/services/accountSiteOnboarding/contracts"
import type { AccountCompletionHelpers } from "~/services/apiAdapters/contracts/accountCompletion"
import { createNewApiAccountCompletion } from "~/services/apiAdapters/newApi/accountCompletion"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { API_SERVICE_FETCH_CONTEXT_KINDS } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"

import {
  createAccountCompletionCheckInConfigMock,
  createCheckInConfig,
} from "../checkInFixtures"

const {
  mockCreateNewApiAccountBootstrap,
  mockExtractDefaultExchangeRate,
  mockFetchCheckInSupport,
  mockFetchSiteStatus,
  mockFetchUserInfo,
  mockGetOrCreateAccessToken,
} = vi.hoisted(() => ({
  mockCreateNewApiAccountBootstrap: vi.fn(),
  mockExtractDefaultExchangeRate: vi.fn(),
  mockFetchCheckInSupport: vi.fn(),
  mockFetchSiteStatus: vi.fn(),
  mockFetchUserInfo: vi.fn(),
  mockGetOrCreateAccessToken: vi.fn(),
}))

vi.mock("~/services/apiAdapters/newApi/accountBootstrap", () => ({
  createNewApiAccountBootstrap: mockCreateNewApiAccountBootstrap,
}))

const newApiAccountCompletion = createNewApiAccountCompletion(
  SITE_TYPES.NEW_API,
)

const currentTabFetchContext = {
  kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
  tabId: 123,
  origin: "https://new.example.com",
}

const createServiceRequest = vi.fn(
  ({
    baseUrl,
    auth,
    context,
  }: Parameters<AccountCompletionHelpers["createServiceRequest"]>[0]) => ({
    baseUrl,
    auth,
    ...(context.fetchContext ? { fetchContext: context.fetchContext } : {}),
  }),
)

const fetchSiteName = vi.fn(async (siteStatus) =>
  typeof siteStatus?.system_name === "string" && siteStatus.system_name.trim()
    ? siteStatus.system_name.trim()
    : "Example API",
)

const createCompletionError = vi.fn(
  (reason: AutoDetectFailureReason, cause: unknown) =>
    new AutoDetectCompletionError(reason, cause),
)

const trimString = vi.fn((value: unknown) =>
  typeof value === "string" ? value.trim() : "",
)

const createInitialCheckInConfig = createAccountCompletionCheckInConfigMock(
  SITE_TYPES.NEW_API,
  {
    automaticExecutionEnabled: true,
    isCheckedInToday: false,
  },
)

const handleCheckInSupportFetchFailure = vi.fn(() => false as const)

const helpers = {
  createServiceRequest,
  fetchSiteName,
  createCompletionError,
  trimString,
  createInitialCheckInConfig,
  handleCheckInSupportFetchFailure,
} satisfies AccountCompletionHelpers

describe("newApiAccountCompletion", () => {
  beforeEach(() => {
    mockCreateNewApiAccountBootstrap.mockReset()
    mockExtractDefaultExchangeRate.mockReset()
    mockFetchCheckInSupport.mockReset()
    mockFetchSiteStatus.mockReset()
    mockFetchUserInfo.mockReset()
    mockGetOrCreateAccessToken.mockReset()
    createServiceRequest.mockClear()
    fetchSiteName.mockClear()
    createCompletionError.mockClear()
    trimString.mockClear()
    createInitialCheckInConfig.mockClear()
    handleCheckInSupportFetchFailure.mockClear()
    mockCreateNewApiAccountBootstrap.mockReturnValue({
      extractDefaultExchangeRate: mockExtractDefaultExchangeRate,
      fetchCheckInSupport: mockFetchCheckInSupport,
      fetchSiteStatus: mockFetchSiteStatus,
      fetchUserInfo: mockFetchUserInfo,
      getOrCreateAccessToken: mockGetOrCreateAccessToken,
      resolveRoutePath: vi.fn(),
    })
  })

  it("completes access-token accounts with cookie token fetch and site status check-in config", async () => {
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "  token-user  ",
      access_token: "  generated-token  ",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "  Token Portal  ",
      checkin_enabled: true,
      price: 6.8,
    })
    mockExtractDefaultExchangeRate.mockReturnValueOnce(6.8)

    const result = await newApiAccountCompletion.complete(
      {
        url: "https://new.example.com",
        requestedAuthType: AuthTypeEnum.AccessToken,
        detected: {
          userId: "7",
          siteType: SITE_TYPES.NEW_API,
        },
        context: {
          fetchContext: currentTabFetchContext,
        },
      },
      helpers,
    )

    expect(mockCreateNewApiAccountBootstrap).toHaveBeenCalledWith(
      SITE_TYPES.NEW_API,
    )
    expect(mockGetOrCreateAccessToken).toHaveBeenCalledWith({
      baseUrl: "https://new.example.com",
      fetchContext: currentTabFetchContext,
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "7",
      },
    })
    expect(mockFetchSiteStatus).toHaveBeenCalledWith({
      baseUrl: "https://new.example.com",
      fetchContext: currentTabFetchContext,
      auth: {
        authType: AuthTypeEnum.AccessToken,
      },
    })
    expect(mockFetchCheckInSupport).not.toHaveBeenCalled()
    expect(mockExtractDefaultExchangeRate).toHaveBeenCalledWith({
      system_name: "  Token Portal  ",
      checkin_enabled: true,
      price: 6.8,
    })
    expect(createInitialCheckInConfig).toHaveBeenCalledWith({
      supported: true,
    })
    expect(result).toEqual({
      username: "token-user",
      siteName: "Token Portal",
      accessToken: "generated-token",
      userId: "7",
      exchangeRate: 6.8,
      authType: AuthTypeEnum.AccessToken,
      checkIn: {
        ...createCheckInConfig(SITE_TYPES.NEW_API, {
          isCheckedInToday: false,
        }),
        customCheckIn: {
          url: "",
          redeemUrl: "",
          openRedeemWithCheckIn: true,
          isCheckedInToday: false,
        },
      },
    })
  })

  it("uses the rc22 dashboard bearer to get or create the persisted PAT", async () => {
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "  rc22-user  ",
      access_token: "  management-pat  ",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "  rc22 portal  ",
      checkin_enabled: false,
    })
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    const result = await newApiAccountCompletion.complete(
      {
        url: "https://panel.example.invalid/settings",
        requestedAuthType: AuthTypeEnum.Cookie,
        detected: {
          userId: "42",
          siteType: SITE_TYPES.NEW_API,
          transientAuth: {
            kind: NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND,
            token: "dashboard-jwt",
            expiresAt: 4_102_444_800,
            sessionId: "session-example",
            origin: "https://panel.example.invalid",
          },
        },
        context: {
          fetchContext: currentTabFetchContext,
        },
      },
      helpers,
    )

    expect(mockCreateNewApiAccountBootstrap).toHaveBeenCalledWith(
      SITE_TYPES.NEW_API,
      {
        accessTokenCreationPolicy: {
          currentTabTransport: "disabled",
          tempWindowFallback: { statusCodes: [], codes: [] },
        },
      },
    )
    expect(mockGetOrCreateAccessToken).toHaveBeenCalledWith({
      baseUrl: "https://panel.example.invalid/settings",
      fetchContext: currentTabFetchContext,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "dashboard-jwt",
      },
    })
    expect(mockFetchUserInfo).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      username: "rc22-user",
      accessToken: "management-pat",
      authType: AuthTypeEnum.AccessToken,
    })
    expect(result).not.toHaveProperty("transientAuth")
    expect(JSON.stringify(result)).not.toContain("dashboard-jwt")
  })

  it.each([
    [
      "expired",
      {
        expiresAt: 1,
        origin: "https://panel.example.invalid",
      },
    ],
    [
      "bound to another origin",
      {
        expiresAt: 4_102_444_800,
        origin: "https://other.example.invalid",
      },
    ],
  ])(
    "rejects %s rc22 dashboard auth before token bootstrap",
    async (_case, transientAuthOverrides) => {
      await expect(
        newApiAccountCompletion.complete(
          {
            url: "https://panel.example.invalid",
            requestedAuthType: AuthTypeEnum.Cookie,
            detected: {
              userId: "42",
              siteType: SITE_TYPES.NEW_API,
              transientAuth: {
                kind: NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND,
                token: "dashboard-jwt",
                sessionId: "session-example",
                ...transientAuthOverrides,
              },
            },
            context: {},
          },
          helpers,
        ),
      ).rejects.toMatchObject({
        reason: AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
      })

      expect(mockGetOrCreateAccessToken).not.toHaveBeenCalled()
      expect(mockFetchUserInfo).not.toHaveBeenCalled()
      expect(mockFetchSiteStatus).not.toHaveBeenCalled()
    },
  )

  it("rejects rc22 dashboard auth that expires within the completion margin", async () => {
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(2_000_000_000_000)
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "rc22-user",
      access_token: "management-pat",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "rc22 portal",
      checkin_enabled: false,
    })

    try {
      await expect(
        newApiAccountCompletion.complete(
          {
            url: "https://panel.example.invalid",
            requestedAuthType: AuthTypeEnum.Cookie,
            detected: {
              userId: "42",
              siteType: SITE_TYPES.NEW_API,
              transientAuth: {
                kind: NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND,
                token: "dashboard-jwt",
                expiresAt: 2_000_000_030,
                sessionId: "session-example",
                origin: "https://panel.example.invalid",
              },
            },
            context: {},
          },
          helpers,
        ),
      ).rejects.toMatchObject({
        reason: AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
      })
    } finally {
      dateNowSpy.mockRestore()
    }

    expect(mockGetOrCreateAccessToken).not.toHaveBeenCalled()
    expect(mockFetchSiteStatus).not.toHaveBeenCalled()
  })

  it("sanitizes rc22 bootstrap failures before creating the completion error", async () => {
    const dashboardToken = "dashboard-jwt-sensitive-example"
    const reflectedMessage = `upstream reflected ${dashboardToken}`
    mockGetOrCreateAccessToken.mockRejectedValueOnce(
      new ApiError(
        reflectedMessage,
        503,
        "/api/user/token",
        API_ERROR_CODES.HTTP_OTHER,
      ),
    )
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "rc22 portal",
      checkin_enabled: false,
    })

    const error = await newApiAccountCompletion
      .complete(
        {
          url: "https://panel.example.invalid",
          requestedAuthType: AuthTypeEnum.Cookie,
          detected: {
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
          context: {},
        },
        helpers,
      )
      .catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(AutoDetectCompletionError)
    const completionError = error as AutoDetectCompletionError
    expect(completionError).toMatchObject({
      reason: AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
      message: "New API dashboard authentication could not be exchanged",
      cause: {
        name: "ApiError",
        message: "New API dashboard authentication could not be exchanged",
        statusCode: 503,
        endpoint: "/api/user/token",
        code: API_ERROR_CODES.HTTP_OTHER,
      },
    })
    expect(completionError.cause).toBeInstanceOf(Error)
    expect(String(completionError.cause)).not.toContain(dashboardToken)
    expect(String(completionError.cause)).not.toContain(reflectedMessage)
  })

  it("classifies an invalid rc22 target URL without retaining parser details", async () => {
    const error = await newApiAccountCompletion
      .complete(
        {
          url: "not a valid URL",
          requestedAuthType: AuthTypeEnum.Cookie,
          detected: {
            userId: "42",
            siteType: SITE_TYPES.NEW_API,
            transientAuth: {
              kind: NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND,
              token: "dashboard-jwt",
              expiresAt: 4_102_444_800,
              sessionId: "session-example",
              origin: "https://panel.example.invalid",
            },
          },
          context: {},
        },
        helpers,
      )
      .catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(AutoDetectCompletionError)
    const completionError = error as AutoDetectCompletionError
    expect(completionError).toMatchObject({
      reason: AUTO_DETECT_FAILURE_REASONS.UnexpectedException,
      message: "New API dashboard authentication is invalid",
      cause: {
        message: "New API dashboard authentication is invalid",
      },
    })
    expect(String(completionError.cause)).not.toContain("not a valid URL")
    expect(mockGetOrCreateAccessToken).not.toHaveBeenCalled()
    expect(mockFetchSiteStatus).not.toHaveBeenCalled()
  })

  it("ignores dashboard transient auth for other New API-family variants", async () => {
    mockFetchUserInfo.mockResolvedValueOnce({
      username: "legacy-family-user",
      access_token: "legacy-visible-token",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "Legacy Family Portal",
      checkin_enabled: false,
    })
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    const result = await createNewApiAccountCompletion(
      SITE_TYPES.VELOERA,
    ).complete(
      {
        url: "https://family.example.invalid",
        requestedAuthType: AuthTypeEnum.Cookie,
        detected: {
          userId: "43",
          siteType: SITE_TYPES.VELOERA,
          transientAuth: {
            kind: NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND,
            token: "dashboard-jwt",
            expiresAt: 4_102_444_800,
            sessionId: "session-example",
            origin: "https://family.example.invalid",
          },
        },
        context: {},
      },
      helpers,
    )

    expect(mockFetchUserInfo).toHaveBeenCalledWith({
      baseUrl: "https://family.example.invalid",
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "43",
      },
    })
    expect(mockGetOrCreateAccessToken).not.toHaveBeenCalled()
    expect(result.authType).toBe(AuthTypeEnum.Cookie)
  })

  it("completes cookie accounts with support probing and default exchange rate", async () => {
    mockFetchUserInfo.mockResolvedValueOnce({
      username: "  cookie-user  ",
      access_token: "  cookie-visible-token  ",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "Cookie Portal",
    })
    mockFetchCheckInSupport.mockResolvedValueOnce(true)
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    const result = await newApiAccountCompletion.complete(
      {
        url: "https://cookie.example.com",
        requestedAuthType: AuthTypeEnum.Cookie,
        detected: {
          userId: "8",
          siteType: SITE_TYPES.NEW_API,
        },
        context: {},
      },
      helpers,
    )

    expect(mockFetchUserInfo).toHaveBeenCalledWith({
      baseUrl: "https://cookie.example.com",
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "8",
      },
    })
    expect(mockGetOrCreateAccessToken).not.toHaveBeenCalled()
    expect(mockFetchSiteStatus).toHaveBeenCalledWith({
      baseUrl: "https://cookie.example.com",
      auth: {
        authType: AuthTypeEnum.Cookie,
      },
    })
    expect(mockFetchCheckInSupport).toHaveBeenCalledWith({
      baseUrl: "https://cookie.example.com",
      auth: {
        authType: AuthTypeEnum.None,
      },
    })
    expect(result).toMatchObject({
      username: "cookie-user",
      siteName: "Cookie Portal",
      accessToken: "cookie-visible-token",
      userId: "8",
      exchangeRate: UI_CONSTANTS.EXCHANGE_RATE.DEFAULT,
      authType: AuthTypeEnum.Cookie,
      checkIn: expect.objectContaining({
        automaticExecutionEnabled: true,
        selection: expect.objectContaining({
          methodId: "new-api:daily-checkin",
        }),
      }),
    })
  })

  it.each([
    ["", "  Example Account  ", "Example Account"],
    ["  primary-user  ", "Fallback Account", "primary-user"],
  ])(
    "resolves ModelFlare username %j before display name %j",
    async (username, displayName, expectedUsername) => {
      mockFetchUserInfo.mockResolvedValueOnce({
        username,
        access_token: "",
        user: {
          id: 8,
          username,
          access_token: null,
          display_name: displayName,
          email: "owner@example.invalid",
        },
      })
      mockFetchSiteStatus.mockResolvedValueOnce({
        system_name: "Example Portal",
        checkin_enabled: false,
        price: 1,
      })
      mockExtractDefaultExchangeRate.mockReturnValueOnce(1)

      const result = await createNewApiAccountCompletion(
        SITE_TYPES.MODELFLARE,
      ).complete(
        {
          url: "https://portal.example.invalid/dashboard/overview",
          requestedAuthType: AuthTypeEnum.Cookie,
          detected: {
            userId: "8",
            siteType: SITE_TYPES.MODELFLARE,
          },
          context: {},
        },
        helpers,
      )

      expect(result).toMatchObject({
        username: expectedUsername,
        accessToken: "",
        authType: AuthTypeEnum.Cookie,
      })
      expect(mockGetOrCreateAccessToken).not.toHaveBeenCalled()
    },
  )

  it("classifies missing access token for access-token completion", async () => {
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "token-user",
      access_token: "  ",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "Broken Portal",
      checkin_enabled: false,
    })
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    await expect(
      newApiAccountCompletion.complete(
        {
          url: "https://broken.example.com",
          requestedAuthType: AuthTypeEnum.AccessToken,
          detected: {
            userId: "9",
            siteType: SITE_TYPES.NEW_API,
          },
          context: {},
        },
        helpers,
      ),
    ).rejects.toMatchObject({
      reason: AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
    })
    expect(createCompletionError).toHaveBeenCalledWith(
      AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
      expect.any(Error),
    )
  })

  it("does not fetch token info for unsupported auth and classifies missing username", async () => {
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "None Auth Portal",
      checkin_enabled: false,
    })
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    await expect(
      newApiAccountCompletion.complete(
        {
          url: "https://none.example.com",
          requestedAuthType: AuthTypeEnum.None,
          detected: {
            userId: "10",
            siteType: SITE_TYPES.NEW_API,
          },
          context: {},
        },
        helpers,
      ),
    ).rejects.toMatchObject({
      reason: AUTO_DETECT_FAILURE_REASONS.UsernameMissing,
    })

    expect(mockFetchUserInfo).not.toHaveBeenCalled()
    expect(mockGetOrCreateAccessToken).not.toHaveBeenCalled()
    expect(createCompletionError).toHaveBeenCalledWith(
      AUTO_DETECT_FAILURE_REASONS.UsernameMissing,
      expect.any(Error),
    )
  })

  it("classifies missing username for cookie completion", async () => {
    mockFetchUserInfo.mockResolvedValueOnce({
      username: "  ",
      access_token: "cookie-token",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "Missing Username Portal",
      checkin_enabled: false,
    })
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    await expect(
      newApiAccountCompletion.complete(
        {
          url: "https://missing-user.example.com",
          requestedAuthType: AuthTypeEnum.Cookie,
          detected: {
            userId: "11",
            siteType: SITE_TYPES.NEW_API,
          },
          context: {},
        },
        helpers,
      ),
    ).rejects.toMatchObject({
      reason: AUTO_DETECT_FAILURE_REASONS.UsernameMissing,
    })

    expect(createCompletionError).toHaveBeenCalledWith(
      AUTO_DETECT_FAILURE_REASONS.UsernameMissing,
      expect.any(Error),
    )
  })

  it("classifies site status fetch failures", async () => {
    const siteStatusError = new Error("site status unavailable")
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "token-user",
      access_token: "generated-token",
    })
    mockFetchSiteStatus.mockRejectedValueOnce(siteStatusError)

    await expect(
      newApiAccountCompletion.complete(
        {
          url: "https://status-failure.example.com",
          requestedAuthType: AuthTypeEnum.AccessToken,
          detected: {
            userId: "12",
            siteType: SITE_TYPES.NEW_API,
          },
          context: {},
        },
        helpers,
      ),
    ).rejects.toMatchObject({
      reason: AUTO_DETECT_FAILURE_REASONS.SiteStatusFetchFailed,
      cause: siteStatusError,
    })

    expect(createCompletionError).toHaveBeenCalledWith(
      AUTO_DETECT_FAILURE_REASONS.SiteStatusFetchFailed,
      siteStatusError,
    )
    expect(mockFetchCheckInSupport).not.toHaveBeenCalled()
  })

  it("falls back to disabled check-in detection when support probing fails", async () => {
    const supportError = new Error("support probe unavailable")
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "token-user",
      access_token: "generated-token",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "Token Portal",
    })
    mockFetchCheckInSupport.mockRejectedValueOnce(supportError)
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    const result = await newApiAccountCompletion.complete(
      {
        url: "https://support-failure.example.com",
        requestedAuthType: AuthTypeEnum.AccessToken,
        detected: {
          userId: "13",
          siteType: SITE_TYPES.NEW_API,
        },
        context: {},
      },
      helpers,
    )

    expect(handleCheckInSupportFetchFailure).toHaveBeenCalledWith(supportError)
    expect(createInitialCheckInConfig).toHaveBeenCalledWith({
      supported: false,
    })
    expect(result.checkIn.selection).not.toHaveProperty("methodId")
  })
})
