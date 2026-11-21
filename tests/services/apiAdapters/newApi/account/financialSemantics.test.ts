import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"

import { CURRENCIES } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import {
  aggregateBalances,
  BALANCE_PURPOSES,
  getDisplayBalancePortfolio,
  projectBalance,
} from "~/services/accounts/metrics/balanceProjection"
import { getDisplayIncomeProjection } from "~/services/accounts/metrics/consumptionProjection"
import {
  ASSET_KINDS,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import { createNewApiAccountData } from "~/services/apiAdapters/newApi/account/accountData"
import { newApiVariantRegistrations } from "~/services/apiAdapters/newApi/variantRegistration"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { estimateNetInflow } from "~/services/history/dailyBalanceHistory/netInflow"
import { buildFinancialHistorySeries } from "~/services/history/dailyBalanceHistory/selectors"
import { AuthTypeEnum } from "~/types"
import { formatAssetAmount } from "~/utils/core/money"
import { server } from "~~/tests/msw/server"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

const origin = "https://quota.example.invalid"
const request = {
  directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
  baseUrl: origin,
  accountId: "account-1",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: "1",
    accessToken: "test",
  },
  checkIn: buildCheckInConfig(),
  includeTodayCashflow: false,
}

describe("New API family financial contract", () => {
  it("includes reported account balances in the available total without inventing cash eligibility", async () => {
    server.use(
      http.get(`${origin}/api/user/self`, () =>
        HttpResponse.json({ success: true, data: { quota: 5000000 } }),
      ),
    )
    const result = await createNewApiAccountData(SITE_TYPES.NEW_API).fetchData(
      request,
    )
    expect(
      aggregateBalances([result.balance!], BALANCE_PURPOSES.Available),
    ).toMatchObject({
      amounts: [{ asset: { kind: "currency", code: "USD" }, value: "10" }],
      coverage: "partial",
      includedCount: 1,
    })
    expect(
      aggregateBalances([result.balance!], BALANCE_PURPOSES.Prepaid).amounts,
    ).toEqual([])
    expect(
      getDisplayBalancePortfolio([{ balanceSnapshot: result.balance }] as never)
        .amounts,
    ).toEqual([{ asset: { kind: "currency", code: "USD" }, value: "10" }])
    expect(
      projectBalance(result.balance!, BALANCE_PURPOSES.Available).amounts,
    ).toEqual([{ asset: { kind: "currency", code: "USD" }, value: "10" }])
  })
  it("displays the official default USD balance while preserving atomic quota", async () => {
    server.use(
      http.get(`${origin}/api/status`, () =>
        HttpResponse.json({
          success: true,
          data: {
            quota_per_unit: 500000,
            quota_display_type: CURRENCIES.USD,
            usd_exchange_rate: 7.3,
            price: 5,
          },
        }),
      ),
      http.get(`${origin}/api/user/self`, () =>
        HttpResponse.json({ success: true, data: { id: 1, quota: 5000000 } }),
      ),
    )
    const result = await createNewApiAccountData(SITE_TYPES.NEW_API).fetchData(
      request,
    )
    const position = result.balance!.positions[0]!
    expect(position.asset).toEqual({ kind: "currency", code: "USD" })
    expect(position.amount).toMatchObject({
      status: "known",
      value: "10",
      source: { amountInputs: { quota: "5000000" } },
    })
    expect(
      formatAssetAmount(
        { asset: position.asset as never, value: "10" },
        "en-US",
      ),
    ).toContain("10")
  })
  it.each(
    Object.keys(
      newApiVariantRegistrations,
    ) as (keyof typeof newApiVariantRegistrations)[],
  )("displays %s using its common monetary contract", async (siteType) => {
    server.use(
      http.get(`${origin}/api/user/self`, () =>
        HttpResponse.json({ success: true, data: { quota: 5000000 } }),
      ),
    )
    const result = await createNewApiAccountData(siteType).fetchData(request)
    const position = result.balance!.positions[0]!
    const value = siteType === SITE_TYPES.UNKNOWN ? "5000000" : "10"
    expect(position.amount).toMatchObject({ value })
    expect(
      formatAssetAmount({ asset: position.asset as never, value }, "en-US"),
    ).toBe(siteType === SITE_TYPES.UNKNOWN ? "5,000,000 quota" : "USD 10")
    expect(result.balanceRefreshParts?.[0]?.positions[0]?.asset).toEqual(
      position.asset,
    )
  })
  it("uses the same standard monetary unit for balance, consumption and credited income", async () => {
    server.use(
      http.get(`${origin}/api/user/self`, () =>
        HttpResponse.json({ success: true, data: { quota: 5000000 } }),
      ),
      http.get(`${origin}/api/log/self/stat`, () =>
        HttpResponse.json({ success: true, data: { quota: 500000 } }),
      ),
      http.get(`${origin}/api/log/self`, ({ request }) => {
        const items =
          new URL(request.url).searchParams.get("type") === "1"
            ? [{ quota: 2500000 }]
            : []
        return HttpResponse.json({
          success: true,
          data: { items, total: items.length },
        })
      }),
    )
    const result = await createNewApiAccountData(SITE_TYPES.NEW_API).fetchData({
      ...request,
      includeTodayCashflow: true,
    })
    expect(result.settledConsumption?.[0]).toMatchObject({
      asset: { kind: "currency", code: "USD" },
      amount: { value: "1", source: { amountInputs: { quota: "500000" } } },
    })
    expect(result.reportedIncome?.[0]).toMatchObject({
      asset: { kind: "currency", code: "USD" },
      amount: { value: "5", source: { amountInputs: { quota: "2500000" } } },
    })
  })

  it("estimates net inflow before the current billing day ends", async () => {
    server.use(
      http.get(`${origin}/api/user/self`, () =>
        HttpResponse.json({ success: true, data: { quota: 6000000 } }),
      ),
      http.get(`${origin}/api/log/self/stat`, () =>
        HttpResponse.json({ success: true, data: { quota: 500000 } }),
      ),
      http.get(`${origin}/api/log/self`, () =>
        HttpResponse.json({ success: true, data: { items: [], total: 0 } }),
      ),
    )
    const adapter = createNewApiAccountData(SITE_TYPES.NEW_API)
    try {
      vi.setSystemTime(new Date(2026, 10, 19, 12))
      const result = await adapter.fetchData({
        ...request,
        includeTodayCashflow: true,
      })
      const end = result.balance!.positions[0]!
      const start = structuredClone(end)
      if (start.amount.status !== OBSERVATION_STATUSES.Known)
        throw new Error("Expected a balance")
      start.amount.value = "10"
      start.amount.observedAt = new Date(2026, 10, 18, 23, 55).getTime()
      expect(
        estimateNetInflow({
          start,
          end,
          consumption: result.settledConsumption!,
          allowAccountBalance: true,
        }),
      ).toMatchObject({
        status: "available",
        amount: { value: "3" },
        partial: true,
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it("uses the midnight baseline after multiple daytime refreshes", async () => {
    let quota = 5_000_000
    let spend = 0
    server.use(
      http.get(`${origin}/api/user/self`, () =>
        HttpResponse.json({ success: true, data: { quota } }),
      ),
      http.get(`${origin}/api/log/self/stat`, () =>
        HttpResponse.json({ success: true, data: { quota: spend } }),
      ),
      http.get(`${origin}/api/log/self`, () =>
        HttpResponse.json({ success: true, data: { items: [], total: 0 } }),
      ),
    )
    const adapter = createNewApiAccountData(SITE_TYPES.NEW_API)
    const capture = async (date: Date) => {
      vi.setSystemTime(date)
      const data = await adapter.fetchData({
        ...request,
        includeTodayCashflow: true,
      })
      return {
        source: "refresh" as const,
        balance: data.balance,
        settledConsumption: data.settledConsumption,
      }
    }
    try {
      const night = await capture(new Date(2026, 10, 18, 23, 55))
      quota = 6_000_000
      spend = 500_000
      const noon = await capture(new Date(2026, 10, 19, 12))
      quota = 6_500_000
      spend = 1_000_000
      const afternoon = await capture(new Date(2026, 10, 19, 14))
      const { series } = buildFinancialHistorySeries({
        store: {
          schemaVersion: 4,
          referenceSnapshotsByAccountId: {},
          financialSnapshotsByAccountId: {
            "account-1": [night, noon, afternoon],
          },
        },
        accountIds: ["account-1"],
        startDayKey: "2026-11-19",
        endDayKey: "2026-11-19",
        asOf: Date.now(),
      })
      expect(series[0]?.observations.at(-1)?.netInflow).toMatchObject({
        status: "available",
        amount: { value: "5" },
      })
    } finally {
      vi.useRealTimers()
    }
  })
  it.each([true, false])(
    "keeps native credited quota separate from explicit currency text (%s)",
    async (ambiguous) => {
      server.use(
        http.get(`${origin}/api/user/self`, () =>
          HttpResponse.json({ success: true, data: { id: 1, quota: 50 } }),
        ),
        http.get(`${origin}/api/log/self/stat`, () =>
          HttpResponse.json({ success: true, data: { quota: 0 } }),
        ),
        http.get(`${origin}/api/log/self`, ({ request }) => {
          const type = new URL(request.url).searchParams.get("type")
          const items =
            type === "1"
              ? [{ quota: "17.000000000000017" }]
              : type === "4" && ambiguous
                ? [{ quota: 0, content: "$5 gift" }]
                : []
          return HttpResponse.json({
            success: true,
            data: { items, total: items.length },
          })
        }),
      )
      const result = await createNewApiAccountData(
        SITE_TYPES.UNKNOWN,
      ).fetchData({ ...request, includeTodayCashflow: true })
      const quotaIncome = result.reportedIncome?.filter(
        ({ asset }) => asset.kind === ASSET_KINDS.Quota,
      )
      expect(quotaIncome).toEqual([
        expect.objectContaining({
          asset: expect.objectContaining({ kind: "quota", label: "quota" }),
          amount: expect.objectContaining({
            status: "known",
            value: "17.000000000000017",
          }),
          classification: "unclassified",
          coverage: "complete",
          scope: expect.objectContaining({
            walletId: "user:1",
            projects: { kind: "all" },
          }),
        }),
      ])
      expect(
        result.reportedIncome?.filter(({ asset }) => asset.kind === "currency"),
      ).toEqual(
        ambiguous
          ? [
              expect.objectContaining({
                asset: { kind: "currency", code: "USD" },
                amount: expect.objectContaining({ value: "5" }),
              }),
            ]
          : [],
      )
      expect(result.todayStatsAvailability?.income.status).toBe("unavailable")
      expect(
        getDisplayIncomeProjection([
          { id: request.accountId, reportedIncome: result.reportedIncome },
        ]).groups.find(({ amount }) => amount.asset.kind === "quota")?.amount
          .value,
      ).toBe("17.000000000000017")
    },
  )
  it("preserves the deployment's exact native quota without assuming USD", async () => {
    server.use(
      http.get(`${origin}/api/user/self`, () =>
        HttpResponse.json({
          success: true,
          data: { id: 1, quota: "9007199254740993" },
        }),
      ),
    )
    const result = await createNewApiAccountData(SITE_TYPES.UNKNOWN).fetchData(
      request,
    )
    expect(result).not.toHaveProperty("quota")
    expect(result).not.toHaveProperty("nativeBalance")
    expect(result.balance?.positions).toEqual([
      expect.objectContaining({
        role: "available",
        nature: "unknown",
        asset: expect.objectContaining({ kind: "quota", label: "quota" }),
        amount: expect.objectContaining({
          status: "known",
          value: "9007199254740993",
        }),
        scope: expect.objectContaining({
          authority: origin,
          subject: { kind: "account", accountId: "account-1" },
        }),
      }),
    ])
    expect(result.balanceRefreshParts?.[0]?.enumeration).toBe("complete")
  })
  it.each(
    Object.keys(
      newApiVariantRegistrations,
    ) as (keyof typeof newApiVariantRegistrations)[],
  )("preserves signed %s balances in its standard unit", async (siteType) => {
    server.use(
      http.get(`${origin}/api/user/self`, () =>
        HttpResponse.json({ success: true, data: { quota: -17 } }),
      ),
    )
    const result = await createNewApiAccountData(siteType).fetchData(request)
    expect(result).not.toHaveProperty("quota")
    expect(result.balance?.positions[0]).toMatchObject({
      asset:
        siteType === SITE_TYPES.UNKNOWN
          ? { kind: "quota", label: "quota" }
          : { kind: "currency", code: "USD" },
      amount: {
        status: "known",
        value: siteType === SITE_TYPES.UNKNOWN ? "-17" : "-0.000034",
        source: { adapter: siteType },
      },
    })
  })
  it.each([undefined, null, "not-an-amount", Number.MAX_SAFE_INTEGER + 1])(
    "keeps unavailable native quota %s distinct from known zero",
    async (quota) => {
      server.use(
        http.get(`${origin}/api/user/self`, () =>
          HttpResponse.json({ success: true, data: { quota } }),
        ),
      )
      const result = await createNewApiAccountData(
        SITE_TYPES.NEW_API,
      ).fetchData(request)
      expect(result.balance?.positions[0]).toMatchObject({
        asset: { kind: "currency", code: "USD" },
        amount: { status: "unavailable" },
      })
      expect(result.balance?.coverage).toBe("partial")
    },
  )
  it("keeps queried native consumption exact and out of legacy USD totals", async () => {
    server.use(
      http.get(`${origin}/api/user/self`, () =>
        HttpResponse.json({ success: true, data: { quota: 123 } }),
      ),
      http.get(`${origin}/api/log/self/stat`, () =>
        HttpResponse.json({
          success: true,
          data: { quota: "0.000000000000000017" },
        }),
      ),
      http.get(`${origin}/api/log/self`, () =>
        HttpResponse.json({ success: true, data: { items: [], total: 0 } }),
      ),
    )
    const result = await createNewApiAccountData(SITE_TYPES.UNKNOWN).fetchData({
      ...request,
      includeTodayCashflow: true,
    })
    expect(result.settledConsumption?.[0]).toMatchObject({
      asset: { kind: "quota" },
      amount: { status: "known", value: "0.000000000000000017" },
      scope: { authority: origin },
      settlement: "settled",
      window: { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    })
    expect(result.todayStatsAvailability?.consumption.status).toBe(
      "unavailable",
    )
    expect(result.todayStatsAvailability?.income.status).toBe("unavailable")
  })

  it("keeps paginated native consumption exact when the lightweight statistics route fails", async () => {
    server.use(
      http.get(`${origin}/api/user/self`, () =>
        HttpResponse.json({ success: true, data: { quota: 123 } }),
      ),
      http.get(
        `${origin}/api/log/self/stat`,
        () => new HttpResponse(null, { status: 404 }),
      ),
      http.get(`${origin}/api/log/self`, ({ request }) =>
        HttpResponse.json({
          success: true,
          data: {
            items:
              new URL(request.url).searchParams.get("type") === "2"
                ? [
                    {
                      quota: "9007199254740993",
                      prompt_tokens: 1,
                      completion_tokens: 2,
                    },
                    {
                      quota: "0.000000000000000017",
                      prompt_tokens: 3,
                      completion_tokens: 4,
                    },
                  ]
                : [],
            total:
              new URL(request.url).searchParams.get("type") === "2" ? 2 : 0,
          },
        }),
      ),
    )
    const result = await createNewApiAccountData(SITE_TYPES.UNKNOWN).fetchData({
      ...request,
      includeTodayCashflow: true,
    })
    expect(result.settledConsumption?.[0]?.amount).toMatchObject({
      status: "known",
      value: "9007199254740993.000000000000000017",
    })
  })
})
