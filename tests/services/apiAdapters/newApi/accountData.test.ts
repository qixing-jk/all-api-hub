import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { createNewApiAccountData } from "~/services/apiAdapters/newApi/accountData"
import { LAOZHANG_TODAY_LOG_QUERY_CONFIG } from "~/services/apiService/newApiFamily/variants/laozhang"
import { AuthTypeEnum } from "~/types"

import { createCheckInConfig } from "../checkInFixtures"

const {
  anyrouterFetchAccountData,
  mockFetchAccountData,
  doneHubFetchAccountData,
  veloeraFetchAccountData,
  wongFetchAccountData,
  rixFetchAccountData,
} = vi.hoisted(() => ({
  anyrouterFetchAccountData: vi.fn(),
  mockFetchAccountData: vi.fn(),
  doneHubFetchAccountData: vi.fn(),
  veloeraFetchAccountData: vi.fn(),
  wongFetchAccountData: vi.fn(),
  rixFetchAccountData: vi.fn(),
}))

vi.mock("~/services/apiService/newApiFamily/default/accountData", () => ({
  fetchAccountData: mockFetchAccountData,
  defaultAccountDataImplementation: {
    fetchAccountData: mockFetchAccountData,
  },
}))

vi.mock("~/services/apiService/newApiFamily/variants/anyrouter", () => ({
  fetchAccountData: anyrouterFetchAccountData,
  refreshAccountData: vi.fn(),
  fetchSupportCheckIn: vi.fn(),
}))

vi.mock("~/services/apiService/newApiFamily/variants/doneHub", () => ({
  fetchAccountData: doneHubFetchAccountData,
  refreshAccountData: vi.fn(),
}))

vi.mock("~/services/apiService/newApiFamily/variants/veloera", () => ({
  fetchAccountData: veloeraFetchAccountData,
  refreshAccountData: vi.fn(),
  fetchSupportCheckIn: vi.fn(),
}))

vi.mock("~/services/apiService/newApiFamily/variants/wong", () => ({
  fetchAccountData: wongFetchAccountData,
  refreshAccountData: vi.fn(),
  fetchSupportCheckIn: vi.fn(),
}))

vi.mock("~/services/apiService/newApiFamily/variants/rixApi", () => ({
  fetchAccountData: rixFetchAccountData,
  refreshAccountData: vi.fn(),
}))

const request = {
  baseUrl: "https://data.example.invalid",
  accountId: "account-1",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: "user-1",
    accessToken: "access-token",
  },
  siteType: SITE_TYPES.NEW_API,
  checkIn: createCheckInConfig(SITE_TYPES.NEW_API, {
    isCheckedInToday: false,
  }),
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
    [SITE_TYPES.RIX_API, rixFetchAccountData],
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

  it("uses LaoZhang's log dialect while preserving the account request", async () => {
    mockFetchAccountData.mockResolvedValueOnce(accountData)

    await expect(
      createNewApiAccountData(SITE_TYPES.LAOZHANG).fetchData(request),
    ).resolves.toBe(accountData)
    expect(mockFetchAccountData).toHaveBeenCalledWith(
      request,
      LAOZHANG_TODAY_LOG_QUERY_CONFIG,
    )
  })
})
