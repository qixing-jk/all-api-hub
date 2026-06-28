import { beforeEach, describe, expect, it, vi } from "vitest"

import { API_ERROR_CODES, ApiError } from "~/services/apiService/common/errors"
import {
  defaultAccountRefreshImplementation,
  refreshAccountData,
  validateAccountConnection,
} from "~/services/apiService/newApiFamily/default/accountRefresh"
import {
  AuthTypeEnum,
  SiteHealthStatus,
  TEMP_WINDOW_HEALTH_STATUS_CODES,
} from "~/types"

const {
  commonDetermineHealthStatus,
  newApiFamilyFetchSupportCheckIn,
  newApiFamilyFetchAccountData,
  newApiFamilyFetchAccountQuota,
} = vi.hoisted(() => ({
  commonDetermineHealthStatus: vi.fn(),
  newApiFamilyFetchSupportCheckIn: vi.fn(),
  newApiFamilyFetchAccountData: vi.fn(),
  newApiFamilyFetchAccountQuota: vi.fn(),
}))

vi.mock("~/services/apiService/common", () => ({
  determineHealthStatus: commonDetermineHealthStatus,
}))

vi.mock("~/services/apiService/newApiFamily/default/accountData", () => ({
  fetchAccountData: newApiFamilyFetchAccountData,
  fetchAccountQuota: newApiFamilyFetchAccountQuota,
}))

vi.mock("~/services/apiService/newApiFamily/default/accountBootstrap", () => ({
  fetchSupportCheckIn: newApiFamilyFetchSupportCheckIn,
}))

describe("newApiFamily accountRefresh", () => {
  const supportRequest = {
    baseUrl: "https://refresh.example.invalid",
    auth: {
      authType: AuthTypeEnum.AccessToken,
      accessToken: "account-token",
    },
  }

  const refreshRequest = {
    ...supportRequest,
    accountId: "account-1",
    checkIn: {
      enableDetection: true,
      autoCheckInEnabled: true,
      siteStatus: {
        isCheckedInToday: false,
      },
    },
    includeTodayCashflow: false,
  }

  const refreshResult = {
    success: true,
    data: {
      quota: 123,
      today_prompt_tokens: 1,
      today_completion_tokens: 2,
      today_quota_consumption: 3,
      today_requests_count: 4,
      today_income: 5,
      checkIn: refreshRequest.checkIn,
    },
    healthStatus: {
      status: SiteHealthStatus.Healthy,
      message: "account:healthStatus.normal",
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    commonDetermineHealthStatus.mockReturnValue({
      status: SiteHealthStatus.Warning,
      message: "account:healthStatus.tempWindowDisabled",
      code: TEMP_WINDOW_HEALTH_STATUS_CODES.DISABLED,
    })
  })

  it("refreshAccountData wraps successful refreshes with a healthy status", async () => {
    newApiFamilyFetchAccountData.mockResolvedValueOnce(refreshResult.data)

    await expect(refreshAccountData(refreshRequest)).resolves.toEqual(
      refreshResult,
    )
  })

  it("refreshAccountData maps runtime failures through determineHealthStatus", async () => {
    const error = new ApiError(
      "fallback disabled",
      undefined,
      "/api/user/self",
      API_ERROR_CODES.TEMP_WINDOW_DISABLED,
    )
    newApiFamilyFetchAccountData.mockRejectedValueOnce(error)

    await expect(refreshAccountData(refreshRequest)).resolves.toEqual({
      success: false,
      healthStatus: {
        status: SiteHealthStatus.Warning,
        message: "account:healthStatus.tempWindowDisabled",
        code: TEMP_WINDOW_HEALTH_STATUS_CODES.DISABLED,
      },
    })
    expect(commonDetermineHealthStatus).toHaveBeenCalledWith(error)
  })

  it("validateAccountConnection reflects whether quota fetch succeeds", async () => {
    newApiFamilyFetchAccountQuota.mockResolvedValueOnce(1)
    await expect(validateAccountConnection(supportRequest)).resolves.toBe(true)

    newApiFamilyFetchAccountQuota.mockRejectedValueOnce(new Error("offline"))
    await expect(validateAccountConnection(supportRequest)).resolves.toBe(false)
  })

  it("uses New API-family refresh helpers by default for New API", async () => {
    newApiFamilyFetchSupportCheckIn.mockResolvedValueOnce(true)
    newApiFamilyFetchAccountData.mockResolvedValueOnce(refreshResult.data)

    const implementation = defaultAccountRefreshImplementation

    await expect(
      implementation.fetchSupportCheckIn(supportRequest),
    ).resolves.toBe(true)
    await expect(
      implementation.refreshAccountData(refreshRequest),
    ).resolves.toEqual(refreshResult)

    expect(newApiFamilyFetchSupportCheckIn).toHaveBeenCalledWith(supportRequest)
    expect(newApiFamilyFetchAccountData).toHaveBeenCalledWith(refreshRequest)
  })
})
