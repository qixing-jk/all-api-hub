import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import type { AccountData } from "~/services/accounts/accountDataModel"
import { aihubmixAccountData } from "~/services/apiAdapters/aihubmix/accountData"
import { createNewApiAccountData } from "~/services/apiAdapters/newApi/accountData"
import { sub2ApiAccountData } from "~/services/apiAdapters/sub2api/accountData"
import { voApiV2AccountData } from "~/services/apiAdapters/voapiV2/accountData"
import { AuthTypeEnum } from "~/types"

const {
  mockAihubmixFetchAccountData,
  mockDoneHubFetchAccountData,
  mockFetchAccountData,
  mockSub2ApiFetchAccountData,
  mockVoApiV2FetchAccountData,
} = vi.hoisted(() => ({
  mockAihubmixFetchAccountData: vi.fn(),
  mockDoneHubFetchAccountData: vi.fn(),
  mockFetchAccountData: vi.fn(),
  mockSub2ApiFetchAccountData: vi.fn(),
  mockVoApiV2FetchAccountData: vi.fn(),
}))

vi.mock("~/services/apiService/newApiFamily/default/accountData", () => ({
  defaultAccountDataImplementation: {
    fetchAccountData: mockFetchAccountData,
  },
}))

vi.mock("~/services/apiService/newApiFamily/variants/doneHub", () => ({
  fetchAccountData: mockDoneHubFetchAccountData,
  refreshAccountData: vi.fn(),
}))

vi.mock("~/services/apiService/sub2api", async (importOriginal) => ({
  ...(await importOriginal()),
  fetchAccountData: mockSub2ApiFetchAccountData,
}))

vi.mock("~/services/apiService/aihubmix", () => ({
  fetchAccountData: mockAihubmixFetchAccountData,
}))

vi.mock("~/services/apiService/voapiV2", () => ({
  fetchVoApiV2AccountData: mockVoApiV2FetchAccountData,
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

    await expect(accountDataCapability.fetchData(request)).resolves.toBe(
      accountData,
    )

    expect(mockFetchAccountData).toHaveBeenCalledOnce()
    expect(mockFetchAccountData).toHaveBeenCalledWith(request)
  })

  it("delegates New API-family site-specific account data through adapter overrides", async () => {
    mockDoneHubFetchAccountData.mockResolvedValueOnce(accountData)

    const accountDataCapability = createNewApiAccountData(SITE_TYPES.DONE_HUB)

    await expect(accountDataCapability.fetchData(request)).resolves.toBe(
      accountData,
    )

    expect(mockDoneHubFetchAccountData).toHaveBeenCalledWith(request)
    expect(mockFetchAccountData).not.toHaveBeenCalled()
  })

  it("delegates Sub2API account data without reshaping disabled check-in or zeroed stats", async () => {
    mockSub2ApiFetchAccountData.mockResolvedValueOnce(
      disabledCheckInAccountData,
    )

    await expect(sub2ApiAccountData.fetchData(request)).resolves.toBe(
      disabledCheckInAccountData,
    )

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

    expect(mockAihubmixFetchAccountData).toHaveBeenCalledOnce()
    expect(mockAihubmixFetchAccountData).toHaveBeenCalledWith(request)
  })

  it("delegates VoAPI v2 account data without reshaping the service result", async () => {
    mockVoApiV2FetchAccountData.mockResolvedValueOnce(accountData)

    await expect(voApiV2AccountData.fetchData(request)).resolves.toBe(
      accountData,
    )

    expect(mockVoApiV2FetchAccountData).toHaveBeenCalledOnce()
    expect(mockVoApiV2FetchAccountData).toHaveBeenCalledWith(request)
  })
})
