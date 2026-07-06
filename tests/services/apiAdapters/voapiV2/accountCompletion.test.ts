import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  AUTO_DETECT_FAILURE_REASONS,
  type AutoDetectFailureReason,
} from "~/constants/autoDetect"
import { SITE_TYPES } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import { AutoDetectCompletionError } from "~/services/accounts/autoDetectCompletion/types"
import type { AccountCompletionHelpers } from "~/services/apiAdapters/contracts/accountCompletion"
import { voApiV2AccountCompletion } from "~/services/apiAdapters/voapiV2/accountCompletion"
import { fetchVoApiV2UserInfo } from "~/services/apiService/voapiV2"
import { API_SERVICE_FETCH_CONTEXT_KINDS } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"

vi.mock("~/services/apiService/voapiV2", () => ({
  fetchVoApiV2UserInfo: vi.fn(),
}))

const currentTabFetchContext = {
  kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
  tabId: 123,
  origin: "https://voapi.example.invalid",
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

const helpers = {
  createServiceRequest,
  fetchSiteName,
  createCompletionError,
  trimString,
  createInitialCheckInConfig,
  handleCheckInSupportFetchFailure: vi.fn(() => false as const),
} satisfies AccountCompletionHelpers

describe("voApiV2AccountCompletion", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("saves the dashboard JWT and enables daily auto check-in after auto-detect", async () => {
    vi.mocked(fetchVoApiV2UserInfo).mockResolvedValueOnce({
      id: 42,
      username: "api-owner",
      nickname: "API Owner",
    })

    const result = await voApiV2AccountCompletion.complete(
      {
        url: "https://voapi.example.invalid",
        requestedAuthType: AuthTypeEnum.AccessToken,
        detected: {
          userId: "42",
          user: {
            id: 42,
            username: "  dashboard-owner  ",
          },
          siteType: SITE_TYPES.VO_API_V2,
          accessToken: "  dashboard-jwt  ",
        },
        context: {
          fetchContext: currentTabFetchContext,
        },
      },
      helpers,
    )

    expect(fetchVoApiV2UserInfo).toHaveBeenCalledWith({
      baseUrl: "https://voapi.example.invalid",
      fetchContext: currentTabFetchContext,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "dashboard-jwt",
        userId: "42",
      },
    })
    expect(createInitialCheckInConfig).toHaveBeenCalledWith({
      enableDetection: true,
      autoCheckInEnabled: true,
    })
    expect(result).toEqual({
      username: "dashboard-owner",
      siteName: "VoAPI",
      accessToken: "dashboard-jwt",
      userId: "42",
      exchangeRate: UI_CONSTANTS.EXCHANGE_RATE.DEFAULT,
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

  it("classifies missing dashboard JWT as an access-token completion failure", async () => {
    await expect(
      voApiV2AccountCompletion.complete(
        {
          url: "https://voapi.example.invalid",
          requestedAuthType: AuthTypeEnum.AccessToken,
          detected: {
            userId: "42",
            siteType: SITE_TYPES.VO_API_V2,
          },
          context: {},
        },
        helpers,
      ),
    ).rejects.toMatchObject({
      reason: AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
    })
    expect(fetchVoApiV2UserInfo).not.toHaveBeenCalled()
  })
})
