import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it } from "vitest"

import { QUOTA_PER_USD } from "~/constants/money"
import { calculateAccountStats } from "~/services/accounts/accountStorage/accountStatistics"
import { getAccountBalanceSnapshots } from "~/services/accounts/balanceSnapshot"
import { validateAndSaveAccount } from "~/services/accounts/editing/accountCreation"
import { validateAndUpdateAccount } from "~/services/accounts/editing/accountUpdate"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import { server } from "~~/tests/msw/server"
import { accountStorageTestSurface as accountStorage } from "~~/tests/test-utils/accountStorageTestSurface"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

const CHECK_IN_DISABLED = buildCheckInConfig({
  customCheckIn: {
    url: "",
    redeemUrl: "",
    openRedeemWithCheckIn: true,
    isCheckedInToday: false,
  },
})

describe("accountPersistence manual quota", () => {
  beforeEach(async () => {
    server.resetHandlers()
    await accountStorage.clearAllData()
  })

  it.each([true, false])(
    "keeps unavailable reported observations independent when adding and removing a manual balance; deferred=%s",
    async (deferDataRefresh) => {
      server.use(
        http.get("https://api.example.com/**", () =>
          HttpResponse.json({}, { status: 500 }),
        ),
      )
      const input = {
        url: "https://api.example.com",
        siteName: "fixture",
        username: "fixture",
        accessToken: "fixture",
        userId: "1",
        exchangeRate: "7",
        notes: "",
        tagIds: [],
        checkInConfig: CHECK_IN_DISABLED,
        siteType: "unknown",
        authType: AuthTypeEnum.AccessToken,
        cookieAuthSessionCookie: "",
      }
      const created = await validateAndSaveAccount({
        ...input,
        options: { deferDataRefresh },
      })
      expect(created.success).toBe(true)
      const saved = await accountStorage.getAccountById(created.accountId!)
      expect(saved?.account_info.balance).toMatchObject({
        positions: [],
        coverage: "unknown",
      })
      expect(saved?.account_info).not.toHaveProperty("quota")
      const updated = await validateAndUpdateAccount({
        ...input,
        accountId: created.accountId!,
        manualBalanceUsd: "2",
        options: { deferDataRefresh },
      })
      expect(updated.success).toBe(true)
      const current = await accountStorage.getAccountById(created.accountId!)
      expect(
        getAccountBalanceSnapshots(current!).manual?.positions[0]?.amount,
      ).toMatchObject({
        status: "known",
        value: "2",
        source: { kind: "manual" },
      })
      expect(current?.account_info.balance).toMatchObject({
        positions: [],
        coverage: deferDataRefresh ? "unknown" : "partial",
      })
      expect(calculateAccountStats([current!]).total_quota).toBe(
        2 * QUOTA_PER_USD,
      )
      const removed = await validateAndUpdateAccount({
        ...input,
        accountId: created.accountId!,
        manualBalanceUsd: "",
        options: { deferDataRefresh },
      })
      expect(removed.success).toBe(true)
      const withoutManualBalance = (await accountStorage.getAccountById(
        created.accountId!,
      ))!
      expect(withoutManualBalance.manualBalanceUsd).toBe("")
      expect(
        getAccountBalanceSnapshots(withoutManualBalance).manual,
      ).toBeUndefined()
      expect(withoutManualBalance.account_info.balance).toMatchObject({
        positions: [],
        coverage: deferDataRefresh ? "unknown" : "partial",
      })
      expect(withoutManualBalance.account_info).not.toHaveProperty("quota")
      expect(calculateAccountStats([withoutManualBalance]).total_quota).toBe(0)
    },
  )

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

    const createResult = await validateAndSaveAccount({
      url: "https://api.example.com",
      siteName: "Test Site",
      username: "tester",
      accessToken: "test-token",
      userId: "1",
      exchangeRate: "7.0",
      notes: "",
      tagIds: [],
      checkInConfig: CHECK_IN_DISABLED,
      siteType: "unknown",
      authType: AuthTypeEnum.AccessToken,
      cookieAuthSessionCookie: "",
      manualBalanceUsd: manualBalanceUsd,
    })

    expect(createResult.success).toBe(true)
    expect(createResult.accountId).toBeTruthy()
    if (!createResult.accountId) {
      throw new Error("Expected accountId to be defined")
    }
    const accountId = createResult.accountId

    const saved = await accountStorage.getAccountById(accountId)
    expect(saved).not.toBeNull()
    expect(saved?.health.status).toBe(SiteHealthStatus.Warning)
    expect(saved?.manualBalanceUsd).toBe(manualBalanceUsd)
    expect(
      getAccountBalanceSnapshots(saved!).manual?.positions[0]?.amount,
    ).toMatchObject({
      status: "known",
      value: "1.23",
      source: { kind: "manual" },
    })
    expect(saved?.account_info).not.toHaveProperty("quota")

    const display = accountStorage.convertToDisplayData(saved!)
    expect(display.manualBalanceSnapshot).toEqual(
      getAccountBalanceSnapshots(saved!).manual,
    )
    expect(display.exchangeRate).toBe(7)

    const updatedResult = await validateAndUpdateAccount({
      accountId: accountId,
      url: "https://api.example.com",
      siteName: "Test Site Updated",
      username: "tester",
      accessToken: "test-token",
      userId: "1",
      exchangeRate: "7.0",
      notes: "",
      tagIds: [],
      checkInConfig: CHECK_IN_DISABLED,
      siteType: "unknown",
      authType: AuthTypeEnum.AccessToken,
      cookieAuthSessionCookie: "",
      manualBalanceUsd: "2",
    })

    expect(updatedResult.success).toBe(true)
    const updated = await accountStorage.getAccountById(accountId)
    expect(updated?.manualBalanceUsd).toBe("2")
    expect(
      getAccountBalanceSnapshots(updated!).manual?.positions[0]?.amount,
    ).toMatchObject({ status: "known", value: "2", source: { kind: "manual" } })
  })
})
