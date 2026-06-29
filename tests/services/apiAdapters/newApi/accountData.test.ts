import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { createNewApiAccountData } from "~/services/apiAdapters/newApi/accountData"
import { AuthTypeEnum } from "~/types"

const {
  anyrouterFetchAccountData,
  mockFetchAccountData,
  doneHubFetchAccountData,
  veloeraFetchAccountData,
  wongFetchAccountData,
} = vi.hoisted(() => ({
  anyrouterFetchAccountData: vi.fn(),
  mockFetchAccountData: vi.fn(),
  doneHubFetchAccountData: vi.fn(),
  veloeraFetchAccountData: vi.fn(),
  wongFetchAccountData: vi.fn(),
}))

vi.mock("~/services/apiService/newApiFamily/default/accountData", () => ({
  defaultAccountDataImplementation: {
    fetchAccountData: mockFetchAccountData,
  },
}))

vi.mock("~/services/apiService/newApiFamily/variants/anyrouter", () => ({
  fetchAccountData: anyrouterFetchAccountData,
}))

vi.mock("~/services/apiService/newApiFamily/variants/doneHub", () => ({
  fetchAccountData: doneHubFetchAccountData,
}))

vi.mock("~/services/apiService/newApiFamily/variants/veloera", () => ({
  fetchAccountData: veloeraFetchAccountData,
}))

vi.mock("~/services/apiService/newApiFamily/variants/wong", () => ({
  fetchAccountData: wongFetchAccountData,
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
  })

  const accountData = {
    quota: 123,
    today_prompt_tokens: 1,
    today_completion_tokens: 2,
    today_quota_consumption: 3,
    today_requests_count: 4,
    today_income: 5,
    checkIn: request.checkIn,
  }

  it("delegates account-data loading through the default New API-family implementation", async () => {
    mockFetchAccountData.mockResolvedValueOnce(accountData)

    const capability = createNewApiAccountData(SITE_TYPES.NEW_API)

    await expect(capability.fetchData(request)).resolves.toBe(accountData)

    expect(mockFetchAccountData).toHaveBeenCalledWith(request)
  })

  it.each([
    [SITE_TYPES.ANYROUTER, anyrouterFetchAccountData],
    [SITE_TYPES.DONE_HUB, doneHubFetchAccountData],
    [SITE_TYPES.VELOERA, veloeraFetchAccountData],
    [SITE_TYPES.WONG_GONGYI, wongFetchAccountData],
  ])(
    "uses the adapter-level account-data override for %s",
    async (siteType, loader) => {
      loader.mockResolvedValueOnce(accountData)

      const capability = createNewApiAccountData(siteType)

      await expect(capability.fetchData(request)).resolves.toBe(accountData)

      expect(loader).toHaveBeenCalledWith(request)
      expect(mockFetchAccountData).not.toHaveBeenCalled()
    },
  )
})
