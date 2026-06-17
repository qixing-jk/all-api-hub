import { beforeEach, describe, expect, it, vi } from "vitest"

import { AUTO_DETECT_STRATEGIES } from "~/constants/autoDetect"
import { SITE_TYPES } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import {
  AutoDetectCompletionError,
  completeAutoDetectedAccount,
} from "~/services/accounts/autoDetectCompletion/completion"
import { AUTO_DETECT_FAILURE_REASONS } from "~/services/accounts/utils/autoDetectUtils"
import { API_SERVICE_FETCH_CONTEXT_KINDS } from "~/services/apiService/common/type"
import type { ApiServiceFetchContext } from "~/services/apiService/common/type"
import { AuthTypeEnum } from "~/types"

const {
  mockFetchSiteStatus,
  mockFetchSupportCheckIn,
  mockExtractDefaultExchangeRate,
  mockFetchUserInfo,
  mockGetOrCreateAccessToken,
} = vi.hoisted(() => ({
  mockFetchSiteStatus: vi.fn(),
  mockFetchSupportCheckIn: vi.fn(),
  mockExtractDefaultExchangeRate: vi.fn(),
  mockFetchUserInfo: vi.fn(),
  mockGetOrCreateAccessToken: vi.fn(),
}))

vi.mock("~/services/apiService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/services/apiService")>()
  return {
    ...actual,
    getApiService: vi.fn(() => ({
      fetchSiteStatus: mockFetchSiteStatus,
      fetchSupportCheckIn: mockFetchSupportCheckIn,
      extractDefaultExchangeRate: mockExtractDefaultExchangeRate,
      fetchUserInfo: mockFetchUserInfo,
      getOrCreateAccessToken: mockGetOrCreateAccessToken,
    })),
  }
})

const currentTabFetchContext = (origin: string) => ({
  kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
  tabId: 123,
  origin,
})

const browserFetchContext = () => ({
  kind: API_SERVICE_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT,
  cookieStoreId: "firefox-container-2",
})

describe("auto-detect completion", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("completes compatible access-token account data through the service layer", async () => {
    const fetchContext = currentTabFetchContext("https://status.example.com")
    const autoDetectContext = {
      strategy: AUTO_DETECT_STRATEGIES.CurrentTab,
      siteType: SITE_TYPES.NEW_API,
    }
    const siteStatus = {
      system_name: "Status Portal",
      checkin_enabled: true,
    }
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "  service-user  ",
      access_token: "  service-token  ",
    })
    mockFetchSiteStatus.mockResolvedValueOnce(siteStatus)
    mockExtractDefaultExchangeRate.mockReturnValueOnce(6.8)

    const result = await completeAutoDetectedAccount({
      url: "https://status.example.com",
      requestedAuthType: AuthTypeEnum.AccessToken,
      autoDetectContext,
      detected: {
        userId: "7",
        siteType: SITE_TYPES.NEW_API,
        fetchContext,
      },
    })

    expect(mockGetOrCreateAccessToken).toHaveBeenCalledWith({
      baseUrl: "https://status.example.com",
      fetchContext,
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "7",
      },
    })
    expect(mockFetchSiteStatus).toHaveBeenCalledWith({
      baseUrl: "https://status.example.com",
      fetchContext,
      auth: {
        authType: AuthTypeEnum.AccessToken,
      },
    })
    expect(mockFetchSupportCheckIn).not.toHaveBeenCalled()
    expect(mockExtractDefaultExchangeRate).toHaveBeenCalledWith(siteStatus)
    expect(result).toEqual({
      username: "service-user",
      siteName: "Status Portal",
      accessToken: "service-token",
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
      siteType: SITE_TYPES.NEW_API,
      fetchContext,
      autoDetectContext,
    })
  })

  it("uses detected Sub2API access-token data without user/token service completion", async () => {
    const fetchContext = currentTabFetchContext("https://sub2.example.com")
    const sub2apiAuth = {
      refreshToken: "refresh-token",
      tokenExpiresAt: 1999999999999,
    }
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "Runtime Portal",
    })
    mockFetchSupportCheckIn.mockResolvedValueOnce(true)
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    const result = await completeAutoDetectedAccount({
      url: "https://sub2.example.com",
      requestedAuthType: AuthTypeEnum.Cookie,
      detected: {
        userId: "12",
        user: { id: 12, username: "  " },
        siteType: SITE_TYPES.SUB2API,
        accessToken: "  jwt-token  ",
        sub2apiAuth,
        fetchContext,
      },
    })

    expect(mockFetchUserInfo).not.toHaveBeenCalled()
    expect(mockGetOrCreateAccessToken).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      username: "",
      siteName: "Runtime Portal",
      accessToken: "jwt-token",
      userId: "12",
      exchangeRate: UI_CONSTANTS.EXCHANGE_RATE.DEFAULT,
      authType: AuthTypeEnum.AccessToken,
      siteType: SITE_TYPES.SUB2API,
      sub2apiAuth,
      fetchContext,
      checkIn: {
        enableDetection: false,
        autoCheckInEnabled: false,
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

  it("uses detected AIHubMix access-token data and probes site status with Cookie auth", async () => {
    const fetchContext = currentTabFetchContext("https://aihubmix.com")
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "AIHubMix",
      checkin_enabled: false,
    })
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    const result = await completeAutoDetectedAccount({
      url: "https://aihubmix.com",
      requestedAuthType: AuthTypeEnum.Cookie,
      detected: {
        userId: "11",
        user: { id: 11, username: "  aihubmix-user  " },
        siteType: SITE_TYPES.AIHUBMIX,
        accessToken: "  detected-console-token  ",
        fetchContext,
      },
    })

    expect(mockFetchUserInfo).not.toHaveBeenCalled()
    expect(mockGetOrCreateAccessToken).not.toHaveBeenCalled()
    expect(mockFetchSiteStatus).toHaveBeenCalledWith({
      baseUrl: "https://aihubmix.com",
      fetchContext,
      auth: {
        authType: AuthTypeEnum.Cookie,
      },
    })
    expect(mockFetchSupportCheckIn).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      username: "aihubmix-user",
      accessToken: "detected-console-token",
      authType: AuthTypeEnum.AccessToken,
      siteType: SITE_TYPES.AIHUBMIX,
      fetchContext,
      checkIn: {
        enableDetection: false,
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

  it("drops malformed current-tab fetch context from service requests and result", async () => {
    const malformedFetchContext = {
      kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
      tabId: "not-a-number",
      origin: "https://malformed.example.com",
      cookieStoreId: "",
    } as unknown as ApiServiceFetchContext
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "malformed-context-user",
      access_token: "malformed-context-token",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "Malformed Context Portal",
      checkin_enabled: true,
    })
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    const result = await completeAutoDetectedAccount({
      url: "https://malformed.example.com",
      requestedAuthType: AuthTypeEnum.AccessToken,
      detected: {
        userId: "8",
        siteType: SITE_TYPES.NEW_API,
        fetchContext: malformedFetchContext,
      },
    })

    expect(result).not.toHaveProperty("fetchContext")
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

  it("retains browser fetch context in service requests and result", async () => {
    const fetchContext = browserFetchContext()
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "browser-context-user",
      access_token: "browser-context-token",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "Browser Context Portal",
      checkin_enabled: true,
    })
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    const result = await completeAutoDetectedAccount({
      url: "https://browser-context.example.com",
      requestedAuthType: AuthTypeEnum.AccessToken,
      detected: {
        userId: "9",
        siteType: SITE_TYPES.NEW_API,
        fetchContext,
      },
    })

    expect(result.fetchContext).toEqual(fetchContext)
    expect(mockGetOrCreateAccessToken).toHaveBeenCalledWith({
      baseUrl: "https://browser-context.example.com",
      fetchContext,
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "9",
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

  it("throws access-token missing when token completion returns no usable token", async () => {
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "missing-token-user",
      access_token: "  ",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "Missing Token Portal",
    })
    mockFetchSupportCheckIn.mockResolvedValueOnce(false)
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    await expect(
      completeAutoDetectedAccount({
        url: "https://token.example.com",
        requestedAuthType: AuthTypeEnum.AccessToken,
        detected: {
          userId: "5",
          siteType: SITE_TYPES.NEW_API,
        },
      }),
    ).rejects.toMatchObject({
      reason: AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
    })
  })

  it("throws completion error when site status fetch fails", async () => {
    const statusError = new Error("status failed")
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "status-user",
      access_token: "status-token",
    })
    mockFetchSiteStatus.mockRejectedValueOnce(statusError)

    const completionPromise = completeAutoDetectedAccount({
      url: "https://status.example.com",
      requestedAuthType: AuthTypeEnum.AccessToken,
      detected: {
        userId: "8",
        siteType: SITE_TYPES.NEW_API,
      },
    })

    await expect(completionPromise).rejects.toMatchObject({
      name: "AutoDetectCompletionError",
      reason: AUTO_DETECT_FAILURE_REASONS.SiteStatusFetchFailed,
      cause: statusError,
    })

    await expect(completionPromise).rejects.toBeInstanceOf(
      AutoDetectCompletionError,
    )
  })
})
