import { http, HttpResponse } from "msw"
import { expect, it, onTestFinished, vi } from "vitest"

import {
  aggregateBalances,
  BALANCE_PURPOSES,
} from "~/services/accounts/metrics/balanceProjection"
import { getDisplayConsumptionProjection } from "~/services/accounts/metrics/consumptionProjection"
import { OBSERVATION_STATUSES } from "~/services/amounts/financialConstants"
import { fetchVoApiV2AccountData } from "~/services/apiService/voapiV2/accountData"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { buildFinancialHistoryActivity } from "~/services/history/dailyBalanceHistory/activity"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

it.each([
  {
    basic: "1.000000000000000017",
    bound: "2",
    status: OBSERVATION_STATUSES.Known,
    value: "3.000000000000000017",
  },
  {
    basic: "9".repeat(256),
    bound: "1",
    status: "unavailable",
    value: undefined,
  },
])(
  "preserves wallet and exact derived consumption without legacy sum failures ($status)",
  async ({ basic, bound, status, value }) => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(2026, 10, 19, 12))
    onTestFinished(() => {
      vi.useRealTimers()
    })
    server.use(
      http.get("https://voapi.example.invalid/api/user/info", () =>
        HttpResponse.json({
          code: 0,
          data: { id: 1, basicBalance: 2, bindBalance: 10 },
        }),
      ),
      http.get("https://voapi.example.invalid/api/dash/statistics", () =>
        HttpResponse.json({
          code: 0,
          data: {
            d: { usedBasicBalance: basic, usedBindBalance: bound, requests: 1 },
          },
        }),
      ),
    )
    const result = await fetchVoApiV2AccountData({
      directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
      baseUrl: "https://voapi.example.invalid",
      accountId: "a",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: "1",
        accessToken: "fixture",
      },
      checkIn: buildCheckInConfig(),
    })
    expect(result.balance?.positions[0]?.amount).toMatchObject({
      status: "known",
      value: "2",
    })
    expect(result.settledConsumption).toHaveLength(1)
    expect(result.settledConsumption?.[0]?.amount).toMatchObject({
      status,
      ...(value ? { value } : {}),
      source: {
        amountInputs: { usedBasicBalance: basic, usedBindBalance: bound },
      },
    })
    const projection = getDisplayConsumptionProjection([
      { id: "a", settledConsumption: result.settledConsumption },
    ])
    expect(projection.groups.map((group) => group.amount.value)).toEqual(
      value ? [value] : [],
    )
    expect(result.today_quota_consumption).toBeUndefined()
    expect(result.todayStatsAvailability?.consumption.status).toBe(
      value ? "complete" : "unavailable",
    )
    const history = buildFinancialHistoryActivity({
      store: {
        schemaVersion: 4,
        referenceSnapshotsByAccountId: {},
        financialSnapshotsByAccountId: {
          a: [
            {
              source: "refresh",
              settledConsumption: result.settledConsumption,
            },
          ],
        },
      },
      accountIds: ["a"],
      dayKeys: ["2026-11-19"],
      asOf: Date.now(),
    })
    expect(history.map(({ total }) => total)).toEqual(value ? [value] : [])
  },
)

it("keeps VoAPI v2 basic and bound USD funds independent", async () => {
  server.use(
    http.get("https://voapi.example.invalid/api/user/info", () =>
      HttpResponse.json({
        code: 0,
        data: { id: 1, basicBalance: "-2.000001", bindBalance: "10.000009" },
      }),
    ),
  )
  const result = await fetchVoApiV2AccountData({
    directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
    baseUrl: "https://voapi.example.invalid",
    accountId: "voapi-1",
    auth: {
      authType: AuthTypeEnum.AccessToken,
      userId: "1",
      accessToken: "fixture",
    },
    checkIn: buildCheckInConfig(),
    includeTodayCashflow: false,
  })
  expect(result).not.toHaveProperty("quota")
  expect(
    aggregateBalances([result.balance!], BALANCE_PURPOSES.Available),
  ).toMatchObject({
    amounts: [{ asset: { kind: "currency", code: "USD" }, value: "8.000008" }],
    conflictCount: 0,
  })
  expect(result.balance?.positions).toEqual([
    expect.objectContaining({
      id: "basicBalance",
      asset: { kind: "currency", code: "USD" },
      amount: expect.objectContaining({ status: "known", value: "-2.000001" }),
    }),
    expect.objectContaining({
      id: "bindBalance",
      asset: { kind: "currency", code: "USD" },
      amount: expect.objectContaining({ status: "known", value: "10.000009" }),
      scope: expect.objectContaining({ models: { kind: "unknown" } }),
    }),
  ])
})

it("preserves VoAPI v2 partial consumption parts and the queried local interval", async () => {
  let queriedStart = 0
  let queriedEnd = 0
  server.use(
    http.get("https://voapi.example.invalid/api/user/info", () =>
      HttpResponse.json({
        code: 0,
        data: { id: 1, basicBalance: 2, bindBalance: 10 },
      }),
    ),
    http.get(
      "https://voapi.example.invalid/api/dash/statistics",
      ({ request }) => {
        queriedStart = Number(new URL(request.url).searchParams.get("s"))
        queriedEnd = Number(new URL(request.url).searchParams.get("e"))
        return HttpResponse.json({
          code: 0,
          data: {
            d: {
              usedBasicBalance: "0.000000000000000017",
              usedBindBalance: null,
              requests: 2,
            },
          },
        })
      },
    ),
  )
  const result = await fetchVoApiV2AccountData({
    directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
    baseUrl: "https://voapi.example.invalid",
    auth: {
      authType: AuthTypeEnum.AccessToken,
      userId: "1",
      accessToken: "fixture",
    },
    checkIn: buildCheckInConfig(),
  })
  expect(result.settledConsumption).toHaveLength(1)
  expect(result.settledConsumption?.[0]).toMatchObject({
    amount: { status: "known", value: "0.000000000000000017" },
    asset: { kind: "currency", code: "USD" },
    window: { start: queriedStart, end: queriedEnd + 1 },
    coverage: "partial",
  })
  expect(result.settledConsumption?.[0]?.amount.source.amountInputs).toEqual({
    usedBasicBalance: "0.000000000000000017",
  })
  expect(result.todayStatsAvailability?.consumption.status).toBe("unavailable")
})
