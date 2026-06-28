import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { createAccountDataImplementation } from "~/services/apiService/newApiFamily/accountData"
import { AuthTypeEnum } from "~/types"

const {
  anyrouterFetchAccountData,
  commonFetchAccountData,
  doneHubFetchAccountData,
  veloeraFetchAccountData,
  wongFetchAccountData,
} = vi.hoisted(() => ({
  anyrouterFetchAccountData: vi.fn(),
  commonFetchAccountData: vi.fn(),
  doneHubFetchAccountData: vi.fn(),
  veloeraFetchAccountData: vi.fn(),
  wongFetchAccountData: vi.fn(),
}))

vi.mock("~/services/apiService/common", () => ({
  fetchAccountData: commonFetchAccountData,
}))

vi.mock("~/services/apiService/anyrouter", () => ({
  fetchAccountData: anyrouterFetchAccountData,
}))

vi.mock("~/services/apiService/doneHub", () => ({
  fetchAccountData: doneHubFetchAccountData,
}))

vi.mock("~/services/apiService/veloera", () => ({
  fetchAccountData: veloeraFetchAccountData,
}))

vi.mock("~/services/apiService/wong", () => ({
  fetchAccountData: wongFetchAccountData,
}))

describe("newApiFamily accountData", () => {
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

  const accountData = {
    quota: 123,
    today_prompt_tokens: 1,
    today_completion_tokens: 2,
    today_quota_consumption: 3,
    today_requests_count: 4,
    today_income: 5,
    checkIn: request.checkIn,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("uses common-compatible account-data loading by default for New API", async () => {
    commonFetchAccountData.mockResolvedValueOnce(accountData)

    const implementation = createAccountDataImplementation(SITE_TYPES.NEW_API)

    await expect(implementation.fetchAccountData(request)).resolves.toBe(
      accountData,
    )

    expect(commonFetchAccountData).toHaveBeenCalledWith(request)
  })

  it.each([
    [SITE_TYPES.ANYROUTER, anyrouterFetchAccountData],
    [SITE_TYPES.DONE_HUB, doneHubFetchAccountData],
    [SITE_TYPES.VELOERA, veloeraFetchAccountData],
    [SITE_TYPES.WONG_GONGYI, wongFetchAccountData],
  ])(
    "uses the site-specific account-data loader for %s",
    async (siteType, loader) => {
      loader.mockResolvedValueOnce(accountData)

      const implementation = createAccountDataImplementation(siteType)

      await expect(implementation.fetchAccountData(request)).resolves.toBe(
        accountData,
      )

      expect(loader).toHaveBeenCalledWith(request)
      expect(commonFetchAccountData).not.toHaveBeenCalled()
    },
  )
})
