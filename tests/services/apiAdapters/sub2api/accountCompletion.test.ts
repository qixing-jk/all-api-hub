import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  AUTO_DETECT_FAILURE_REASONS,
  type AutoDetectFailureReason,
} from "~/constants/autoDetect"
import { SITE_TYPES } from "~/constants/siteType"
import { AutoDetectCompletionError } from "~/services/accounts/autoDetectCompletion/types"
import type { AccountCompletionHelpers } from "~/services/apiAdapters/contracts/accountCompletion"
import { sub2ApiAccountCompletion } from "~/services/apiAdapters/sub2api/accountCompletion"
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

const currentTabFetchContext = {
  kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
  tabId: 123,
  origin: "https://sub2.example.com",
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

describe("sub2ApiAccountCompletion", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("uses detected access-token data and disables check-in", async () => {
    const sub2apiAuth = {
      refreshToken: "refresh-token",
      tokenExpiresAt: 1999999999999,
    }
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "  Sub2 Portal  ",
      price: 7.2,
    })
    mockExtractDefaultExchangeRate.mockReturnValueOnce(7.2)

    const result = await sub2ApiAccountCompletion.complete(
      {
        url: "https://sub2.example.com",
        requestedAuthType: AuthTypeEnum.AccessToken,
        detected: {
          userId: "12",
          user: {
            id: 12,
            username: "  ",
          },
          siteType: SITE_TYPES.SUB2API,
          accessToken: "  jwt-token  ",
          sub2apiAuth,
        },
        context: {
          fetchContext: currentTabFetchContext,
        },
      },
      helpers,
    )

    expect(mockFetchUserInfo).not.toHaveBeenCalled()
    expect(mockGetOrCreateAccessToken).not.toHaveBeenCalled()
    expect(mockFetchSupportCheckIn).not.toHaveBeenCalled()
    expect(mockFetchSiteStatus).toHaveBeenCalledWith({
      baseUrl: "https://sub2.example.com",
      fetchContext: currentTabFetchContext,
      auth: {
        authType: AuthTypeEnum.AccessToken,
      },
    })
    expect(mockExtractDefaultExchangeRate).toHaveBeenCalledWith({
      system_name: "  Sub2 Portal  ",
      price: 7.2,
    })
    expect(createInitialCheckInConfig).toHaveBeenCalledWith({
      enableDetection: false,
      autoCheckInEnabled: false,
    })
    expect(result).toEqual({
      username: "",
      siteName: "Sub2 Portal",
      accessToken: "jwt-token",
      userId: "12",
      exchangeRate: 7.2,
      authType: AuthTypeEnum.AccessToken,
      sub2apiAuth,
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

  it("classifies missing detected access token", async () => {
    await expect(
      sub2ApiAccountCompletion.complete(
        {
          url: "https://sub2.example.com",
          requestedAuthType: AuthTypeEnum.AccessToken,
          detected: {
            userId: "12",
            siteType: SITE_TYPES.SUB2API,
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
    expect(mockFetchSiteStatus).not.toHaveBeenCalled()
  })

  it("classifies site status fetch failures", async () => {
    const siteStatusError = new Error("site status unavailable")
    mockFetchSiteStatus.mockRejectedValueOnce(siteStatusError)

    await expect(
      sub2ApiAccountCompletion.complete(
        {
          url: "https://sub2.example.com",
          requestedAuthType: AuthTypeEnum.AccessToken,
          detected: {
            userId: "12",
            siteType: SITE_TYPES.SUB2API,
            accessToken: "jwt-token",
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
    expect(mockExtractDefaultExchangeRate).not.toHaveBeenCalled()
  })
})
