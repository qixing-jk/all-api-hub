import { afterEach, describe, expect, it, vi } from "vitest"

import * as apiCommon from "~/services/apiService/common"
import { AuthTypeEnum, type CheckInConfig } from "~/types"

vi.mock("i18next", () => ({
  t: (key: string) => key,
  default: { t: (key: string) => key }
}))

const BASE_URL = "https://api.example.com"
const USER_ID = 42
const TOKEN = "token-42"
const AUTH_TYPE = AuthTypeEnum.AccessToken

const defaultUsage = {
  today_quota_consumption: 12,
  today_prompt_tokens: 6,
  today_completion_tokens: 3,
  today_requests_count: 2
}

const defaultIncome = {
  today_income: 8
}

afterEach(() => {
  vi.restoreAllMocks()
})

function setupCommonMocks() {
  vi.spyOn(apiCommon, "fetchAccountQuota").mockResolvedValue(1000)
  vi.spyOn(apiCommon, "fetchTodayUsage").mockResolvedValue(defaultUsage)
  vi.spyOn(apiCommon, "fetchTodayIncome").mockResolvedValue(defaultIncome)
  const checkInSpy = vi.spyOn(apiCommon, "fetchCheckInStatus")

  return { checkInSpy }
}

describe("fetchAccountData", () => {
  it("skips check-in status lookup when detection is disabled", async () => {
    const { checkInSpy } = setupCommonMocks()
    const checkInConfig: CheckInConfig = {
      enableDetection: false,
      isCheckedInToday: false,
      openRedeemWithCheckIn: true
    }

    const result = await apiCommon.fetchAccountData(
      BASE_URL,
      USER_ID,
      TOKEN,
      checkInConfig,
      AUTH_TYPE
    )

    expect(checkInSpy).not.toHaveBeenCalled()
    expect(result.quota).toBe(1000)
    expect(result.today_quota_consumption).toBe(
      defaultUsage.today_quota_consumption
    )
    expect(result.today_income).toBe(defaultIncome.today_income)
    expect(result.checkIn.enableDetection).toBe(false)
    expect(result.checkIn.isCheckedInToday).toBe(false)
  })

  it("invokes check-in status lookup when detection is enabled", async () => {
    const { checkInSpy } = setupCommonMocks()
    checkInSpy.mockResolvedValueOnce(true)

    const checkInConfig: CheckInConfig = {
      enableDetection: true,
      isCheckedInToday: false,
      openRedeemWithCheckIn: true
    }

    const result = await apiCommon.fetchAccountData(
      BASE_URL,
      USER_ID,
      TOKEN,
      checkInConfig,
      AUTH_TYPE
    )

    expect(checkInSpy).toHaveBeenCalledWith(BASE_URL, USER_ID, TOKEN, AUTH_TYPE)
    expect(result.checkIn.isCheckedInToday).toBe(false)
  })

  it("marks the account as checked in when remote status returns false", async () => {
    const { checkInSpy } = setupCommonMocks()
    checkInSpy.mockResolvedValueOnce(false)

    const checkInConfig: CheckInConfig = {
      enableDetection: true,
      isCheckedInToday: false,
      openRedeemWithCheckIn: true
    }

    const result = await apiCommon.fetchAccountData(
      BASE_URL,
      USER_ID,
      TOKEN,
      checkInConfig,
      AUTH_TYPE
    )

    expect(result.checkIn.isCheckedInToday).toBe(true)
  })

  it("respects custom check-in URLs and preserves related fields", async () => {
    const { checkInSpy } = setupCommonMocks()
    const checkInConfig: CheckInConfig = {
      enableDetection: true,
      isCheckedInToday: true,
      customCheckInUrl: "https://custom-checkin",
      customRedeemUrl: "https://custom-redeem",
      lastCheckInDate: "2024-10-01",
      openRedeemWithCheckIn: false
    }

    const result = await apiCommon.fetchAccountData(
      BASE_URL,
      USER_ID,
      TOKEN,
      checkInConfig,
      AUTH_TYPE
    )

    expect(checkInSpy).not.toHaveBeenCalled()
    expect(result.checkIn.customCheckInUrl).toBe("https://custom-checkin")
    expect(result.checkIn.customRedeemUrl).toBe("https://custom-redeem")
    expect(result.checkIn.openRedeemWithCheckIn).toBe(false)
    expect(result.checkIn.lastCheckInDate).toBe("2024-10-01")
    expect(result.checkIn.isCheckedInToday).toBe(false)
  })
})
