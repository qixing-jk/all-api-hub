import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { createNewApiAccountData } from "~/services/apiAdapters/newApi/accountData"
import { AuthTypeEnum } from "~/types"

const {
  mockCreateAccountDataImplementation,
  mockFetchAccountData,
  mockGetApiService,
} = vi.hoisted(() => ({
  mockCreateAccountDataImplementation: vi.fn(),
  mockFetchAccountData: vi.fn(),
  mockGetApiService: vi.fn(() => {
    throw new Error("legacy apiService facade should not be used")
  }),
}))

vi.mock("~/services/apiService/newApiFamily", () => ({
  accountData: {
    createAccountDataImplementation: mockCreateAccountDataImplementation,
  },
}))

vi.mock("~/services/apiService", () => ({
  getApiService: mockGetApiService,
}))

const request = {
  baseUrl: "https://data.example.invalid",
  accountId: "account-1",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: "user-1",
    accessToken: "access-token",
  },
  checkIn: {
    enableDetection: true,
    autoCheckInEnabled: true,
    siteStatus: {
      isCheckedInToday: false,
    },
  },
  includeTodayCashflow: false,
}

describe("createNewApiAccountData", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateAccountDataImplementation.mockReturnValue({
      fetchAccountData: mockFetchAccountData,
    })
  })

  it("delegates account-data loading through the New API-family implementation", async () => {
    const accountData = {
      quota: 123,
      today_prompt_tokens: 1,
      today_completion_tokens: 2,
      today_quota_consumption: 3,
      today_requests_count: 4,
      today_income: 5,
      checkIn: request.checkIn,
    }
    mockFetchAccountData.mockResolvedValueOnce(accountData)

    const capability = createNewApiAccountData(SITE_TYPES.DONE_HUB)

    await expect(capability.fetchData(request)).resolves.toBe(accountData)

    expect(mockCreateAccountDataImplementation).toHaveBeenCalledWith(
      SITE_TYPES.DONE_HUB,
    )
    expect(mockFetchAccountData).toHaveBeenCalledWith(request)
    expect(mockGetApiService).not.toHaveBeenCalled()
  })
})
