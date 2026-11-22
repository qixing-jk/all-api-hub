import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { acceptPeriodAmounts } from "~/services/accounts/refresh/periodAmountAcceptance"
import { fetchTodayIncome } from "~/services/apiService/newApiFamily/default/accountData"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { buildFinancialHistoryActivity } from "~/services/history/dailyBalanceHistory/activity"
import { dailyBalanceHistoryStorage } from "~/services/history/dailyBalanceHistory/storage"
import { LogType } from "~/services/history/usageHistory/usageLogModel"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

beforeEach(async () => {
  await browser.storage.local.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

it("keeps complete daily income in history after a later source fails, then accepts a newer complete reading", async () => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.mocked(browser.permissions.contains).mockResolvedValue(false)
  const start = new Date(2026, 10, 21).getTime()
  const end = new Date(2026, 10, 22).getTime()
  vi.setSystemTime(start + 3_600_000)
  let partial = false
  let topupQuota = 5_000_000
  server.use(
    http.get("https://income-review.invalid/api/log/self", ({ request }) => {
      const type = new URL(request.url).searchParams.get("type")
      if (partial && type === String(LogType.Topup))
        return HttpResponse.json(
          { success: false, message: "source unavailable" },
          { status: 500 },
        )
      const items =
        type === String(LogType.Topup)
          ? [{ quota: topupQuota }]
          : partial
            ? [{ quota: 1_000_000 }]
            : []
      return HttpResponse.json({
        success: true,
        data: { items, total: items.length },
      })
    }),
  )
  const request = {
    baseUrl: "https://income-review.invalid",
    accountId: "account",
    siteType: SITE_TYPES.NEW_API,
    directRequestReason: API_DIRECT_REQUEST_REASONS.CallerManaged,
    auth: {
      authType: AuthTypeEnum.AccessToken,
      userId: "1",
      accessToken: "fixture-token",
    },
    checkIn: buildCheckInConfig(),
  }
  const range = { start: start / 1000, end: end / 1000 - 1 }
  const first = await fetchTodayIncome(request, undefined, range)
  expect(first.reportedIncome?.[0]).toMatchObject({
    amount: { value: "10" },
    coverage: "complete",
  })
  await dailyBalanceHistoryStorage.appendFinancialSnapshot({
    accountId: "account",
    snapshot: { source: "refresh", reportedIncome: first.reportedIncome },
    retentionDays: 30,
  })
  vi.setSystemTime(start + 7_200_000)
  partial = true
  const second = await fetchTodayIncome(request, undefined, range)
  expect(second.reportedIncome?.[0]).toMatchObject({
    amount: { value: "2" },
    coverage: "partial",
  })
  await dailyBalanceHistoryStorage.appendFinancialSnapshot({
    accountId: "account",
    snapshot: {
      source: "refresh",
      reportedIncome: acceptPeriodAmounts(
        first.reportedIncome,
        second.reportedIncome,
      ),
    },
    retentionDays: 30,
  })
  const historyIncome = async () =>
    buildFinancialHistoryActivity({
      store: await dailyBalanceHistoryStorage.getStore(),
      accountIds: ["account"],
      dayKeys: ["2026-11-21"],
      asOf: Date.now(),
    }).find(({ kind }) => kind === "income")?.total
  expect(await historyIncome()).toBe("10")
  vi.setSystemTime(start + 10_800_000)
  partial = false
  topupQuota = 6_000_000
  const third = await fetchTodayIncome(request, undefined, range)
  await dailyBalanceHistoryStorage.appendFinancialSnapshot({
    accountId: "account",
    snapshot: { source: "refresh", reportedIncome: third.reportedIncome },
    retentionDays: 30,
  })
  expect(await historyIncome()).toBe("12")
})
