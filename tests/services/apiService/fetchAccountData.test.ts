import { afterEach, describe, expect, it, vi } from "vitest"

import * as apiCommon from "~/services/apiService/common"
import * as apiUtils from "~/services/apiService/common/utils"
import { AuthTypeEnum, type CheckInConfig } from "~/types"

vi.mock("i18next", () => ({
  t: (key: string) => key,
  default: { t: (key: string) => key }
}))

const BASE_URL = "https://api.example.com"
const USER_ID = 42
const TOKEN = "token-42"
const AUTH_TYPE = AuthTypeEnum.AccessToken

afterEach(() => {
  vi.restoreAllMocks()
})

function mockFetchApiData({
  quota = 1000,
  canCheckIn
}: {
  quota?: number
  canCheckIn?: boolean
} = {}) {
  return vi
    .spyOn(apiUtils, "fetchApiData")
    .mockImplementation(async (params) => {
      const endpoint = params.endpoint

      if (endpoint.startsWith("/api/user/self")) {
        return { quota }
      }

      if (endpoint.startsWith("/api/user/check_in_status")) {
        return typeof canCheckIn === "boolean"
          ? { can_check_in: canCheckIn }
          : {}
      }

      if (endpoint.startsWith("/api/log/self")) {
        return { items: [], total: 0 }
      }

      return {}
    })
}

describe("fetchAccountData", () => {
  it("skips check-in status lookup when detection is disabled", async () => {
    const fetchApiMock = mockFetchApiData({ quota: 1000 })
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

    const checkInCalls = fetchApiMock.mock.calls.filter(([params]) =>
      (params as any).endpoint.includes("check_in_status")
    )

    expect(checkInCalls).toHaveLength(0)
    expect(result.quota).toBe(1000)
    expect(result.checkIn.enableDetection).toBe(false)
    expect(result.checkIn.isCheckedInToday).toBe(false)
  })

  it("invokes check-in status lookup when detection is enabled", async () => {
    const fetchApiMock = mockFetchApiData({ quota: 2000, canCheckIn: true })

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

    const checkInCalls = fetchApiMock.mock.calls.filter(([params]) =>
      (params as any).endpoint.includes("check_in_status")
    )

    expect(checkInCalls).toHaveLength(1)
    expect(result.quota).toBe(2000)
    expect(result.checkIn.isCheckedInToday).toBe(false)
  })

  it("marks the account as checked in when remote status returns false", async () => {
    const fetchApiMock = mockFetchApiData({ canCheckIn: false })

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

    const checkInCalls = fetchApiMock.mock.calls.filter(([params]) =>
      (params as any).endpoint.includes("check_in_status")
    )

    expect(checkInCalls).toHaveLength(1)
    expect(result.checkIn.isCheckedInToday).toBe(true)
  })

  it("respects custom check-in URLs and preserves related fields", async () => {
    const fetchApiMock = mockFetchApiData({ quota: 1500 })
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

    const checkInCalls = fetchApiMock.mock.calls.filter(([params]) =>
      (params as any).endpoint.includes("check_in_status")
    )

    expect(checkInCalls).toHaveLength(0)
    expect(result.quota).toBe(1500)
    expect(result.checkIn.customCheckInUrl).toBe("https://custom-checkin")
    expect(result.checkIn.customRedeemUrl).toBe("https://custom-redeem")
    expect(result.checkIn.openRedeemWithCheckIn).toBe(false)
    expect(result.checkIn.lastCheckInDate).toBe("2024-10-01")
    expect(result.checkIn.isCheckedInToday).toBe(false)
  })
})
