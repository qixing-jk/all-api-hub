import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import type { AccountData } from "~/services/accounts/accountDataModel"
import { aihubmixAccountData } from "~/services/apiAdapters/aihubmix/accountData"
import { createNewApiAccountData } from "~/services/apiAdapters/newApi/accountData"
import { sub2ApiAccountData } from "~/services/apiAdapters/sub2api/accountData"
import { AuthTypeEnum } from "~/types"

const {
  mockAihubmixFetchAccountData,
  mockDoneHubFetchAccountData,
  mockFetchAccountData,
  mockGetApiService,
  mockSub2ApiFetchAccountData,
} = vi.hoisted(() => ({
  mockAihubmixFetchAccountData: vi.fn(),
  mockDoneHubFetchAccountData: vi.fn(),
  mockFetchAccountData: vi.fn(),
  mockGetApiService: vi.fn(),
  mockSub2ApiFetchAccountData: vi.fn(),
}))

vi.mock("~/services/apiService", () => ({
  getApiService: mockGetApiService,
}))

vi.mock("~/services/apiService/newApiFamily/default/accountData", () => ({
  defaultAccountDataImplementation: {
    fetchAccountData: mockFetchAccountData,
  },
}))

vi.mock("~/services/apiService/newApiFamily/variants/doneHub", () => ({
  fetchAccountData: mockDoneHubFetchAccountData,
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
  })

  it("delegates New API-family account data through the family implementation", async () => {
    mockFetchAccountData.mockResolvedValueOnce(accountData)

    const accountDataCapability = createNewApiAccountData(SITE_TYPES.NEW_API)

    expect(mockGetApiService).not.toHaveBeenCalled()

    await expect(accountDataCapability.fetchData(request)).resolves.toBe(
      accountData,
    )

    expect(mockFetchAccountData).toHaveBeenCalledOnce()
    expect(mockFetchAccountData).toHaveBeenCalledWith(request)
    expect(mockGetApiService).not.toHaveBeenCalled()
  })

  it("delegates New API-family site-specific account data through adapter overrides", async () => {
    mockDoneHubFetchAccountData.mockResolvedValueOnce(accountData)

    const accountDataCapability = createNewApiAccountData(SITE_TYPES.DONE_HUB)

    await expect(accountDataCapability.fetchData(request)).resolves.toBe(
      accountData,
    )

    expect(mockDoneHubFetchAccountData).toHaveBeenCalledWith(request)
    expect(mockFetchAccountData).not.toHaveBeenCalled()
    expect(mockGetApiService).not.toHaveBeenCalled()
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
