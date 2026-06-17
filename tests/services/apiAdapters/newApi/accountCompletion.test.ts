import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  AUTO_DETECT_FAILURE_REASONS,
  type AutoDetectFailureReason,
} from "~/constants/autoDetect"
import { SITE_TYPES } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import { AutoDetectCompletionError } from "~/services/accounts/autoDetectCompletion/types"
import type { AccountCompletionHelpers } from "~/services/apiAdapters/contracts/accountCompletion"
import { newApiAccountCompletion } from "~/services/apiAdapters/newApi/accountCompletion"
import { API_SERVICE_FETCH_CONTEXT_KINDS } from "~/services/apiService/common/type"
import { AuthTypeEnum } from "~/types"

const {
  mockExtractDefaultExchangeRate,
  mockFetchSiteStatus,
  mockFetchSupportCheckIn,
  mockFetchUserInfo,
  mockGetApiService,
  mockGetOrCreateAccessToken,
} = vi.hoisted(() => ({
  mockExtractDefaultExchangeRate: vi.fn(),
  mockFetchSiteStatus: vi.fn(),
  mockFetchSupportCheckIn: vi.fn(),
  mockFetchUserInfo: vi.fn(),
  mockGetApiService: vi.fn(),
  mockGetOrCreateAccessToken: vi.fn(),
}))

vi.mock("~/services/apiService", () => ({
  getApiService: mockGetApiService,
}))

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

const createInitialCheckInConfig = vi.fn(
  ({ enableDetection, autoCheckInEnabled }) => ({
    enableDetection,
    autoCheckInEnabled,
    siteStatus: {
      isCheckedInToday: false,
    },
    customCheckIn: {
      url: "",
      redeemUrl: "",
      openRedeemWithCheckIn: true,
      isCheckedInToday: false,
    },
  }),
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
    vi.clearAllMocks()
    mockGetApiService.mockReturnValue({
      extractDefaultExchangeRate: mockExtractDefaultExchangeRate,
      fetchSiteStatus: mockFetchSiteStatus,
      fetchSupportCheckIn: mockFetchSupportCheckIn,
      fetchUserInfo: mockFetchUserInfo,
      getOrCreateAccessToken: mockGetOrCreateAccessToken,
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

    expect(mockGetApiService).toHaveBeenCalledWith(SITE_TYPES.NEW_API)
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
    expect(mockFetchSupportCheckIn).not.toHaveBeenCalled()
    expect(mockExtractDefaultExchangeRate).toHaveBeenCalledWith({
      system_name: "  Token Portal  ",
      checkin_enabled: true,
      price: 6.8,
    })
    expect(createInitialCheckInConfig).toHaveBeenCalledWith({
      enableDetection: true,
      autoCheckInEnabled: true,
    })
    expect(result).toEqual({
      username: "token-user",
      siteName: "Token Portal",
      accessToken: "generated-token",
      userId: "7",
      exchangeRate: 6.8,
      authType: AuthTypeEnum.AccessToken,
      checkIn: {
        enableDetection: true,
        autoCheckInEnabled: true,
        siteStatus: {
          isCheckedInToday: false,
        },
        customCheckIn: {
          url: "",
          redeemUrl: "",
          openRedeemWithCheckIn: true,
          isCheckedInToday: false,
        },
      },
    })
  })

  it("completes cookie accounts with support probing and default exchange rate", async () => {
    mockFetchUserInfo.mockResolvedValueOnce({
      username: "  cookie-user  ",
      access_token: "  cookie-visible-token  ",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "Cookie Portal",
    })
    mockFetchSupportCheckIn.mockResolvedValueOnce(true)
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
    expect(mockFetchSupportCheckIn).toHaveBeenCalledWith({
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
        enableDetection: true,
        autoCheckInEnabled: true,
      }),
    })
  })

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
    expect(mockFetchSupportCheckIn).not.toHaveBeenCalled()
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
    mockFetchSupportCheckIn.mockRejectedValueOnce(supportError)
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
      enableDetection: false,
      autoCheckInEnabled: true,
    })
    expect(result.checkIn.enableDetection).toBe(false)
  })
})
