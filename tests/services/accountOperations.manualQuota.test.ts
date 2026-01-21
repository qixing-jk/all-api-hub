import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it } from "vitest"

import { UI_CONSTANTS } from "~/constants/ui"
import {
  validateAndSaveAccount,
  validateAndUpdateAccount,
} from "~/services/accountOperations"
import { accountStorage } from "~/services/accountStorage"
import { server } from "~/tests/msw/server"
import { AuthTypeEnum, SiteHealthStatus, type CheckInConfig } from "~/types"

const CHECK_IN_DISABLED: CheckInConfig = {
  enableDetection: false,
  autoCheckInEnabled: true,
  siteStatus: { isCheckedInToday: false },
  customCheckIn: {
    url: "",
    redeemUrl: "",
    openRedeemWithCheckIn: true,
    isCheckedInToday: false,
  },
}

describe("accountOperations manual quota", () => {
  beforeEach(async () => {
    server.resetHandlers()
    await accountStorage.clearAllData()
  })

  it("persists user-provided balance when quota fetch fails (add + edit)", async () => {
    server.use(
      http.get("https://api.example.com/api/log/self", () => {
        return HttpResponse.json({
          success: true,
          message: "",
          data: {
            total: 0,
            items: [],
          },
        })
      }),
      http.get("https://api.example.com/api/user/self", () => {
        return HttpResponse.json(
          { success: false, message: "quota fetch failed" },
          { status: 500 },
        )
      }),
    )

    const manualBalanceUsd = "1.23"
    const expectedQuota = Math.round(
      Number.parseFloat(manualBalanceUsd) *
        UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR,
    )

    const createResult = await validateAndSaveAccount(
      "https://api.example.com",
      "Test Site",
      "tester",
      "test-token",
      "1",
      "7.0",
      "",
      [],
      CHECK_IN_DISABLED,
      "unknown",
      AuthTypeEnum.AccessToken,
      "",
      manualBalanceUsd,
    )

    expect(createResult.success).toBe(true)
    expect(createResult.accountId).toBeTruthy()
    if (!createResult.accountId) {
      throw new Error("Expected accountId to be defined")
    }
    const accountId = createResult.accountId

    const saved = await accountStorage.getAccountById(accountId)
    expect(saved).not.toBeNull()
    expect(saved?.health.status).toBe(SiteHealthStatus.Warning)
    expect(saved?.account_info.quota).toBe(expectedQuota)

    const display = accountStorage.convertToDisplayData(saved!)
    expect(display.balance.USD).toBeCloseTo(1.23, 6)
    expect(display.balance.CNY).toBeCloseTo(1.23 * 7.0, 6)

    const updatedResult = await validateAndUpdateAccount(
      accountId,
      "https://api.example.com",
      "Test Site Updated",
      "tester",
      "test-token",
      "1",
      "7.0",
      "",
      [],
      CHECK_IN_DISABLED,
      "unknown",
      AuthTypeEnum.AccessToken,
      "",
      "2",
    )

    expect(updatedResult.success).toBe(true)
    const updated = await accountStorage.getAccountById(accountId)
    expect(updated?.account_info.quota).toBe(
      2 * UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR,
    )
  })
})
