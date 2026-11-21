import { describe, expect, it } from "vitest"

import { CURRENCIES } from "~/constants/money"
import { accountPresentation } from "~/services/accounts/accountStorage/accountPresentation"
import {
  getDisplayConsumptionProjection,
  getDisplayIncomeProjection,
} from "~/services/accounts/metrics/consumptionProjection"
import {
  buildAccountShareSnapshotPayload,
  generateShareSnapshotCaption,
} from "~/services/sharing/shareSnapshots"
import { buildCompleteTodayStatsAvailability } from "~~/tests/test-utils/accountTodayStats"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

describe("saved release cashflow presentation", () => {
  it("preserves the release's USD and configured CNY conversion as references before refresh", () => {
    const site = buildSiteAccount({
      last_sync_time: Date.now(),
      exchange_rate: 7,
      account_info: {
        ...buildSiteAccount().account_info,
        today_quota_consumption: 1_625_000,
        today_income: 1_250_000,
        todayStatsAvailability: buildCompleteTodayStatsAvailability(),
      },
    })
    const displayed = accountPresentation.convertToDisplayData(site)
    expect(displayed.todayConsumption).toEqual({ USD: 3.25, CNY: 22.75 })
    expect(displayed.todayIncome).toEqual({ USD: 2.5, CNY: 17.5 })
    expect(displayed.consumptionProjection?.groups).toEqual([])
    expect(displayed.incomeProjection?.groups).toEqual([])
    expect(displayed.consumptionProjection?.nativeCoverage.status).toBe(
      "unavailable",
    )
    expect(displayed.incomeProjection?.nativeCoverage.status).toBe(
      "unavailable",
    )
  })
  it("shares readable reference consumption and income without inventing a native net amount", () => {
    const site = accountPresentation.convertToDisplayData(
      buildSiteAccount({
        last_sync_time: Date.now(),
        account_info: {
          ...buildSiteAccount().account_info,
          today_quota_consumption: 1_625_000,
          today_income: 1_250_000,
          todayStatsAvailability: buildCompleteTodayStatsAvailability(),
        },
      }),
    )
    const payload = buildAccountShareSnapshotPayload({
      siteName: site.name,
      currencyType: CURRENCIES.USD,
      includeTodayCashflow: true,
      consumption: getDisplayConsumptionProjection([site]),
      income: getDisplayIncomeProjection([site]),
    })
    const caption = generateShareSnapshotCaption(payload)
    expect(caption).toContain("3.25")
    expect(caption).toContain("2.5")
    expect(caption).toContain("account:financial.legacy")
    expect(payload.todayNetAmount).toBeUndefined()
    expect(JSON.stringify(payload)).not.toContain(site.id)
  })
  it("retains signed release values as last-known references when their observation time is absent", () => {
    const displayed = accountPresentation.convertToDisplayData(
      buildSiteAccount({
        last_sync_time: 0,
        account_info: {
          ...buildSiteAccount().account_info,
          today_quota_consumption: -125_000,
          today_income: -250_000,
          todayStatsAvailability: buildCompleteTodayStatsAvailability(),
        },
      }),
    )
    expect(displayed.referenceConsumption).toMatchObject({
      amount: { USD: -0.25 },
      lastKnown: true,
    })
    expect(displayed.referenceIncome).toMatchObject({
      amount: { USD: -0.5 },
      lastKnown: true,
    })
    expect(displayed.referenceConsumption?.observedAt).toBeUndefined()
    expect(displayed.consumptionProjection?.groups).toEqual([])
  })
})
