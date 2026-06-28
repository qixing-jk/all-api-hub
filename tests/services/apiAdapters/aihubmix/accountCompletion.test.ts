import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  AUTO_DETECT_FAILURE_REASONS,
  type AutoDetectFailureReason,
} from "~/constants/autoDetect"
import { SITE_TYPES } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import { AutoDetectCompletionError } from "~/services/accounts/autoDetectCompletion/types"
import { aihubmixAccountCompletion } from "~/services/apiAdapters/aihubmix/accountCompletion"
import type { AccountCompletionHelpers } from "~/services/apiAdapters/contracts/accountCompletion"
import { API_SERVICE_FETCH_CONTEXT_KINDS } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"

const {
  mockExtractDefaultExchangeRate,
  mockFetchSiteStatus,
  mockFetchSupportCheckIn,
  mockFetchUserInfo,
  mockGetOrCreateAccessToken,
} = vi.hoisted(() => ({
  mockExtractDefaultExchangeRate: vi.fn(),
  mockFetchSiteStatus: vi.fn(),
  mockFetchSupportCheckIn: vi.fn(),
  mockFetchUserInfo: vi.fn(),
  mockGetOrCreateAccessToken: vi.fn(),
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

const currentTabFetchContext = {
  kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
  tabId: 123,
  origin: "https://aihubmix.com",
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

describe("aihubmixAccountCompletion", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("uses detected access-token data and probes status with Cookie auth", async () => {
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "AIHubMix",
      checkin_enabled: false,
    })
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    const result = await aihubmixAccountCompletion.complete(
      {
        url: "https://aihubmix.com",
        requestedAuthType: AuthTypeEnum.AccessToken,
        detected: {
          userId: "11",
          user: {
            id: 11,
            username: "  aihubmix-user  ",
          },
          siteType: SITE_TYPES.AIHUBMIX,
          accessToken: "  detected-console-token  ",
        },
        context: {
          fetchContext: currentTabFetchContext,
        },
      },
      helpers,
    )

    expect(mockGetOrCreateAccessToken).not.toHaveBeenCalled()
    expect(mockFetchSiteStatus).toHaveBeenCalledWith({
      baseUrl: "https://aihubmix.com",
      fetchContext: currentTabFetchContext,
      auth: {
        authType: AuthTypeEnum.Cookie,
      },
    })
    expect(mockFetchSupportCheckIn).not.toHaveBeenCalled()
    expect(createInitialCheckInConfig).toHaveBeenCalledWith({
      enableDetection: false,
      autoCheckInEnabled: true,
    })
    expect(result).toEqual({
      username: "aihubmix-user",
      siteName: "AIHubMix",
      accessToken: "detected-console-token",
      userId: "11",
      exchangeRate: UI_CONSTANTS.EXCHANGE_RATE.DEFAULT,
      authType: AuthTypeEnum.AccessToken,
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

  it("falls back to getOrCreateAccessToken when detected token data is absent", async () => {
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "  generated-aihubmix-user  ",
      access_token: "  generated-aihubmix-token  ",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "AIHubMix",
    })
    mockFetchSupportCheckIn.mockResolvedValueOnce(true)
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    const result = await aihubmixAccountCompletion.complete(
      {
        url: "https://aihubmix.com",
        requestedAuthType: AuthTypeEnum.AccessToken,
        detected: {
          userId: "12",
          siteType: SITE_TYPES.AIHUBMIX,
        },
        context: {},
      },
      helpers,
    )

    expect(mockGetOrCreateAccessToken).toHaveBeenCalledWith({
      baseUrl: "https://aihubmix.com",
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "12",
      },
    })
    expect(mockFetchSiteStatus).toHaveBeenCalledWith({
      baseUrl: "https://aihubmix.com",
      auth: {
        authType: AuthTypeEnum.Cookie,
      },
    })
    expect(mockFetchSupportCheckIn).toHaveBeenCalledWith({
      baseUrl: "https://aihubmix.com",
      auth: {
        authType: AuthTypeEnum.None,
      },
    })
    expect(result).toMatchObject({
      username: "generated-aihubmix-user",
      accessToken: "generated-aihubmix-token",
      userId: "12",
      exchangeRate: UI_CONSTANTS.EXCHANGE_RATE.DEFAULT,
      authType: AuthTypeEnum.AccessToken,
      checkIn: expect.objectContaining({
        enableDetection: true,
        autoCheckInEnabled: true,
      }),
    })
  })

  it("classifies missing detected username and token as missing access token", async () => {
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "AIHubMix",
      checkin_enabled: false,
    })
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    await expect(
      aihubmixAccountCompletion.complete(
        {
          url: "https://aihubmix.com",
          requestedAuthType: AuthTypeEnum.AccessToken,
          detected: {
            userId: "13",
            user: {
              id: 13,
              username: "  ",
            },
            siteType: SITE_TYPES.AIHUBMIX,
            accessToken: "  ",
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

  it("classifies generated token fetch failures", async () => {
    const tokenError = new Error("token unavailable")
    mockGetOrCreateAccessToken.mockRejectedValueOnce(tokenError)

    await expect(
      aihubmixAccountCompletion.complete(
        {
          url: "https://aihubmix.com",
          requestedAuthType: AuthTypeEnum.AccessToken,
          detected: {
            userId: "14",
            siteType: SITE_TYPES.AIHUBMIX,
          },
          context: {},
        },
        helpers,
      ),
    ).rejects.toMatchObject({
      reason: AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
      cause: tokenError,
    })

    expect(createCompletionError).toHaveBeenCalledWith(
      AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
      tokenError,
    )
    expect(mockFetchSiteStatus).not.toHaveBeenCalled()
  })

  it("classifies site status fetch failures", async () => {
    const siteStatusError = new Error("site status unavailable")
    mockFetchSiteStatus.mockRejectedValueOnce(siteStatusError)

    await expect(
      aihubmixAccountCompletion.complete(
        {
          url: "https://aihubmix.com",
          requestedAuthType: AuthTypeEnum.AccessToken,
          detected: {
            userId: "15",
            user: {
              id: 15,
              username: "aihubmix-user",
            },
            siteType: SITE_TYPES.AIHUBMIX,
            accessToken: "detected-token",
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
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "AIHubMix",
    })
    mockFetchSupportCheckIn.mockRejectedValueOnce(supportError)
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    const result = await aihubmixAccountCompletion.complete(
      {
        url: "https://aihubmix.com",
        requestedAuthType: AuthTypeEnum.AccessToken,
        detected: {
          userId: "16",
          user: {
            id: 16,
            username: "aihubmix-user",
          },
          siteType: SITE_TYPES.AIHUBMIX,
          accessToken: "detected-token",
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

  it("classifies missing generated access token when username is present", async () => {
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "aihubmix-user",
      access_token: "  ",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "AIHubMix",
      checkin_enabled: false,
    })
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    await expect(
      aihubmixAccountCompletion.complete(
        {
          url: "https://aihubmix.com",
          requestedAuthType: AuthTypeEnum.AccessToken,
          detected: {
            userId: "17",
            siteType: SITE_TYPES.AIHUBMIX,
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

  it("classifies invalid generated token payloads as missing access token", async () => {
    mockGetOrCreateAccessToken.mockResolvedValueOnce(null)
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "AIHubMix",
      checkin_enabled: false,
    })
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    await expect(
      aihubmixAccountCompletion.complete(
        {
          url: "https://aihubmix.com",
          requestedAuthType: AuthTypeEnum.AccessToken,
          detected: {
            userId: "18",
            siteType: SITE_TYPES.AIHUBMIX,
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

  it("classifies missing generated username when access token is present", async () => {
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "  ",
      access_token: "generated-aihubmix-token",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "AIHubMix",
      checkin_enabled: false,
    })
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    await expect(
      aihubmixAccountCompletion.complete(
        {
          url: "https://aihubmix.com",
          requestedAuthType: AuthTypeEnum.AccessToken,
          detected: {
            userId: "19",
            siteType: SITE_TYPES.AIHUBMIX,
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
})
