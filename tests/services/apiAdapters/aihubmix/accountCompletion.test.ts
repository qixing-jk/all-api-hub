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
import { API_SERVICE_FETCH_CONTEXT_KINDS } from "~/services/apiService/common/type"
import { AuthTypeEnum } from "~/types"

const {
  mockExtractDefaultExchangeRate,
  mockFetchSiteStatus,
  mockFetchSupportCheckIn,
  mockGetApiService,
  mockGetOrCreateAccessToken,
} = vi.hoisted(() => ({
  mockExtractDefaultExchangeRate: vi.fn(),
  mockFetchSiteStatus: vi.fn(),
  mockFetchSupportCheckIn: vi.fn(),
  mockGetApiService: vi.fn(),
  mockGetOrCreateAccessToken: vi.fn(),
}))

vi.mock("~/services/apiService", () => ({
  getApiService: mockGetApiService,
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
    mockGetApiService.mockReturnValue({
      extractDefaultExchangeRate: mockExtractDefaultExchangeRate,
      fetchSiteStatus: mockFetchSiteStatus,
      fetchSupportCheckIn: mockFetchSupportCheckIn,
      getOrCreateAccessToken: mockGetOrCreateAccessToken,
    })
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

    expect(mockGetApiService).toHaveBeenCalledWith(SITE_TYPES.AIHUBMIX)
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
})
