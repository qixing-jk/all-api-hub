import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { aihubmixAccountData } from "~/services/apiAdapters/aihubmix/accountData"
import { createNewApiAccountData } from "~/services/apiAdapters/newApi/accountData"
import { sub2ApiAccountData } from "~/services/apiAdapters/sub2api/accountData"
import type { AccountData } from "~/services/apiService/common/type"
import { AuthTypeEnum } from "~/types"

const {
  mockAihubmixFetchAccountData,
  mockFetchAccountData,
  mockGetApiService,
  mockSub2ApiFetchAccountData,
} = vi.hoisted(() => ({
  mockAihubmixFetchAccountData: vi.fn(),
  mockFetchAccountData: vi.fn(),
  mockGetApiService: vi.fn(),
  mockSub2ApiFetchAccountData: vi.fn(),
}))

vi.mock("~/services/apiService", () => ({
  getApiService: mockGetApiService,
}))

vi.mock("~/services/apiService/sub2api", () => ({
  fetchAccountData: mockSub2ApiFetchAccountData,
}))

vi.mock("~/services/apiService/aihubmix", () => ({
  fetchAccountData: mockAihubmixFetchAccountData,
}))

const request = {
  baseUrl: "https://api.example.invalid",
  accountId: "account-1",
  checkIn: {
    enableDetection: true,
    autoCheckInEnabled: true,
    siteStatus: {
      isCheckedInToday: false,
    },
  },
  includeTodayCashflow: false,
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: "user-1",
    accessToken: "account-token",
  },
}

const accountData: AccountData = {
  quota: 123,
  today_prompt_tokens: 1,
  today_completion_tokens: 2,
  today_quota_consumption: 3,
  today_requests_count: 4,
  today_income: 5,
  checkIn: request.checkIn,
}

const disabledCheckInAccountData: AccountData = {
  quota: 9800,
  today_prompt_tokens: 0,
  today_completion_tokens: 0,
  today_quota_consumption: 0,
  today_requests_count: 0,
  today_income: 0,
  checkIn: {
    enableDetection: false,
    siteStatus: {
      isCheckedInToday: undefined,
    },
  },
}

describe("apiAdapter accountData", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetApiService.mockReturnValue({
      fetchAccountData: mockFetchAccountData,
    })
  })

  it("delegates New API-family account data through the site-specific apiService", async () => {
    mockFetchAccountData.mockResolvedValueOnce(accountData)

    const accountDataCapability = createNewApiAccountData(SITE_TYPES.ONE_HUB)

    expect(mockGetApiService).not.toHaveBeenCalled()

    await expect(accountDataCapability.fetchData(request)).resolves.toBe(
      accountData,
    )

    expect(mockGetApiService).toHaveBeenCalledOnce()
    expect(mockGetApiService).toHaveBeenCalledWith(SITE_TYPES.ONE_HUB)
    expect(mockFetchAccountData).toHaveBeenCalledOnce()
    expect(mockFetchAccountData).toHaveBeenCalledWith(request)
  })

  it("delegates Sub2API account data without reshaping disabled check-in or zeroed stats", async () => {
    mockSub2ApiFetchAccountData.mockResolvedValueOnce(
      disabledCheckInAccountData,
    )

    await expect(sub2ApiAccountData.fetchData(request)).resolves.toBe(
      disabledCheckInAccountData,
    )

    expect(mockGetApiService).not.toHaveBeenCalled()
    expect(mockSub2ApiFetchAccountData).toHaveBeenCalledOnce()
    expect(mockSub2ApiFetchAccountData).toHaveBeenCalledWith(request)
  })

  it("delegates AIHubMix account data without reshaping disabled check-in or zeroed fields", async () => {
    mockAihubmixFetchAccountData.mockResolvedValueOnce(
      disabledCheckInAccountData,
    )

    await expect(aihubmixAccountData.fetchData(request)).resolves.toBe(
      disabledCheckInAccountData,
    )

    expect(mockGetApiService).not.toHaveBeenCalled()
    expect(mockAihubmixFetchAccountData).toHaveBeenCalledOnce()
    expect(mockAihubmixFetchAccountData).toHaveBeenCalledWith(request)
  })
})
