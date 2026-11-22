import { http, HttpResponse } from "msw"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ACCOUNT_USAGE_SCOPES } from "~/constants/accountUsage"
import { QUOTA_PER_USD } from "~/constants/money"
import { rightCodeAccountData } from "~/services/apiAdapters/rightcode/account/accountData"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
  AuthTypeEnum,
} from "~/types"
import { formatLocalDayKey } from "~/utils/core/dayKey"
import { server } from "~~/tests/msw/server"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

const baseUrl = "https://right-code.example.invalid"

const createRequest = (
  overrides: Partial<{ includeTodayCashflow: boolean }> = {},
) => ({
  directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
  baseUrl,
  accountId: "account-example",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "account-token",
  },
  checkIn: buildCheckInConfig(),
  ...overrides,
})

const statsRequestUrls: URL[] = []

const useWorkingDeployment = () => {
  server.use(
    http.get(`${baseUrl}/auth/me`, () =>
      HttpResponse.json({
        id: 7,
        username: "example-user",
        user_token: "account-token",
        balance: 12.5,
        invite_code: "invite-example",
      }),
    ),
    http.get(`${baseUrl}/use-log/stats/overall`, () =>
      HttpResponse.json({
        total_requests: 40,
        total_tokens: 500,
        total_cost: 3,
        period_days: 0,
        note: "统计范围为全部历史",
      }),
    ),
    http.get(`${baseUrl}/use-log/stats`, ({ request }) => {
      statsRequestUrls.push(new URL(request.url))
      return HttpResponse.json({
        total_requests: 4,
        total_tokens: 50,
        total_cost: 0.4,
        start_date: "2026-09-24T00:00",
        end_date: "2026-09-24T00:00",
      })
    }),
    http.get(`${baseUrl}/subscriptions/list`, () =>
      HttpResponse.json({
        subscriptions: [
          {
            item_id: 2,
            name: "Codex 月卡",
            remaining_quota: 6.5,
            total_quota: 10,
            reset_today: false,
            expired_at: "2027-01-01T00:00:00",
          },
        ],
        total: 1,
      }),
    ),
    http.get(`${baseUrl}/subscriptions/summary/total`, () =>
      HttpResponse.json({
        total_quota: 10,
        used_quota: 3.5,
        remaining_quota: 6.5,
        active_subscription_count: 1,
      }),
    ),
  )
}

describe("rightCodeAccountData", () => {
  afterEach(() => {
    statsRequestUrls.length = 0
    vi.useRealTimers()
  })

  it("retains individual subscription pools, daily availability and unknown zone-less expiry", async () => {
    useWorkingDeployment()
    server.use(
      http.get(`${baseUrl}/subscriptions/list`, () =>
        HttpResponse.json({
          subscriptions: [
            {
              item_id: 2,
              name: "Plan A",
              remaining_quota: "6.500000000000000017",
              total_quota: "10",
              available_today_quota: "2",
              available_prefixes: ["/claude"],
              expired_at: "2027-01-01T00:00:00",
            },
            {
              item_id: 3,
              name: "Plan B",
              remaining_quota: "9",
              total_quota: "20",
              expired_at: "2027-02-01T00:00:00Z",
            },
          ],
          total: 2,
        }),
      ),
    )
    const data = await rightCodeAccountData.fetchData(createRequest())
    expect(data).not.toHaveProperty("subscription")
    expect(data.allowances?.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "2:total",
          label: "Plan A",
          validity: { kind: "unknown" },
          reportedTiming: { expiresAt: "2027-01-01T00:00:00" },
          constraint: expect.objectContaining({
            asset: { kind: "currency", code: "USD" },
            remaining: expect.objectContaining({
              value: "6.500000000000000017",
            }),
          }),
        }),
        expect.objectContaining({
          id: "2:day",
          constraint: expect.objectContaining({
            remaining: expect.objectContaining({ value: "2" }),
            window: { kind: "unknown", period: "day" },
          }),
        }),
        expect.objectContaining({
          id: "3:total",
          validity: { kind: "expires", at: Date.parse("2027-02-01T00:00:00Z") },
        }),
      ]),
    )
  })

  it("keeps zone-less queried usage separate from lifetime and out of global today totals", async () => {
    useWorkingDeployment()
    const data = await rightCodeAccountData.fetchData(createRequest())
    expect(data.todayStatsAvailability?.consumption).toEqual({
      status: "unavailable",
      reason: "wrong_period",
    })
    expect(data.usageObservations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: ACCOUNT_USAGE_SCOPES.Lifetime,
          cost: expect.objectContaining({
            amount: expect.objectContaining({ value: "3" }),
          }),
        }),
        expect.objectContaining({
          scope: ACCOUNT_USAGE_SCOPES.SiteToday,
          cost: expect.objectContaining({
            amount: expect.objectContaining({ value: "0.4" }),
            scope: expect.objectContaining({ authority: baseUrl }),
          }),
        }),
      ]),
    )
  })

  it("preserves the wallet when lifetime usage fails", async () => {
    useWorkingDeployment()
    server.use(
      http.get(`${baseUrl}/use-log/stats/overall`, () =>
        HttpResponse.json({ message: "failed" }, { status: 500 }),
      ),
    )
    const data = await rightCodeAccountData.fetchData(createRequest())
    expect(data.balance?.positions[0]?.amount).toMatchObject({
      status: "known",
      value: "12.5",
    })
    expect(data.usage?.cost?.amount).toMatchObject({ status: "unavailable" })
    expect(data.usage?.totalRequests).toBeUndefined()
  })

  it("keeps valid plans when another subscription has no stable identity", async () => {
    useWorkingDeployment()
    server.use(
      http.get(`${baseUrl}/subscriptions/list`, () =>
        HttpResponse.json({
          subscriptions: [
            null,
            { name: "missing id", remaining_quota: "3" },
            { item_id: 2, name: "Valid", remaining_quota: "4" },
          ],
          total: 3,
        }),
      ),
    )
    const data = await rightCodeAccountData.fetchData(createRequest())
    expect(data.balance?.positions[0]?.amount).toMatchObject({
      status: "known",
      value: "12.5",
    })
    expect(
      data.allowances?.entries.filter(
        (entry) => entry.collectionKey === "subscriptions",
      ),
    ).toMatchObject([{ id: "2:total", label: "Valid" }])
    expect(data.allowanceRefreshParts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          collectionKey: "subscriptions",
          enumeration: "partial",
        }),
      ]),
    )
  })

  it("maps the wallet balance, lifetime usage and today's activity", async () => {
    useWorkingDeployment()

    const data = await rightCodeAccountData.fetchData(createRequest())

    expect(data).not.toHaveProperty("quota")
    expect(data.balance?.positions[0]).toMatchObject({
      asset: { kind: "currency", code: "USD" },
      amount: { status: "known", value: "12.5" },
    })
    expect(data.today_quota_consumption).toBe(Math.round(0.4 * QUOTA_PER_USD))
    // The deployment reports one token total per period, carried on the completion side.
    expect(data.today_prompt_tokens).toBe(0)
    expect(data.today_completion_tokens).toBe(50)
    expect(data.today_requests_count).toBe(4)
    expect(data.today_income).toBe(0)
    expect(data.usage).toMatchObject({
      scope: ACCOUNT_USAGE_SCOPES.Lifetime,
      totalRequests: 40,
      totalTokens: 500,
      cost: {
        asset: { kind: "currency", code: "USD" },
        amount: { status: "known", value: "3" },
      },
    })
    expect(data.checkIn).toEqual(createRequest().checkIn)
  })

  it("classifies collected metrics and leaves income unsupported", async () => {
    useWorkingDeployment()

    const data = await rightCodeAccountData.fetchData(createRequest())

    expect(data.todayStatsAvailability).toEqual({
      consumption: {
        status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
        reason: ACCOUNT_TODAY_METRIC_REASONS.WrongPeriod,
      },
      requests: {
        status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
        reason: ACCOUNT_TODAY_METRIC_REASONS.WrongPeriod,
      },
      tokens: {
        status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
        reason: ACCOUNT_TODAY_METRIC_REASONS.WrongPeriod,
      },
      income: {
        status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
        reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
      },
    })
  })

  it("asks the stats endpoint for today explicitly instead of its 7-day default", async () => {
    useWorkingDeployment()

    await rightCodeAccountData.fetchData(createRequest())

    const today = formatLocalDayKey()
    expect(statsRequestUrls).toHaveLength(1)
    expect(atIndex(statsRequestUrls, 0).searchParams.get("start_date")).toBe(
      today,
    )
    expect(atIndex(statsRequestUrls, 0).searchParams.get("end_date")).toBe(
      today,
    )
  })

  it("maps the subscription pool without inventing amounts", async () => {
    useWorkingDeployment()

    const data = await rightCodeAccountData.fetchData(createRequest())

    expect(data.allowances?.entries).toMatchObject([
      {
        id: "2:total",
        label: "Codex 月卡",
        validity: { kind: "unknown" },
        constraint: {
          limit: { value: "10" },
          remaining: { value: "6.5" },
          used: { status: "unknown" },
        },
      },
      {
        id: "summary",
        constraint: {
          limit: { value: "10" },
          used: { value: "3.5" },
          remaining: { value: "6.5" },
        },
      },
    ])
  })

  it("skips today's activity without failing the refresh when asked to", async () => {
    useWorkingDeployment()

    const data = await rightCodeAccountData.fetchData(
      createRequest({ includeTodayCashflow: false }),
    )

    expect(statsRequestUrls).toHaveLength(0)
    expect(data.balance?.positions[0]?.amount).toMatchObject({
      status: "known",
      value: "12.5",
    })
    expect(data.today_quota_consumption).toBe(0)
    expect(data.today_completion_tokens).toBe(0)
    expect(data.today_requests_count).toBe(0)
    expect(data.todayStatsAvailability?.consumption).toEqual({
      status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
      reason: ACCOUNT_TODAY_METRIC_REASONS.NotCollected,
    })
  })

  it("keeps the wallet balance when the optional subscription endpoints fail", async () => {
    useWorkingDeployment()
    server.use(
      http.get(`${baseUrl}/subscriptions/list`, () =>
        HttpResponse.json({ message: "unavailable" }, { status: 500 }),
      ),
      http.get(`${baseUrl}/subscriptions/summary/total`, () =>
        HttpResponse.json({ message: "unavailable" }, { status: 500 }),
      ),
    )

    const data = await rightCodeAccountData.fetchData(createRequest())

    expect(data.balance?.positions[0]?.amount).toMatchObject({
      status: "known",
      value: "12.5",
    })
    expect(data.subscription).toBeUndefined()
  })

  it("reports a failed today read instead of a zeroed complete metric", async () => {
    useWorkingDeployment()
    server.use(
      http.get(`${baseUrl}/use-log/stats`, () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    )

    const data = await rightCodeAccountData.fetchData(createRequest())

    expect(data.today_quota_consumption).toBe(0)
    expect(data.todayStatsAvailability?.consumption).toEqual({
      status: "unavailable",
      reason: ACCOUNT_TODAY_METRIC_REASONS.RequestFailed,
    })
    expect(data.balance?.positions[0]?.amount).toMatchObject({
      status: "known",
      value: "12.5",
    })
  })

  it("rejects a payload that is not the account record", async () => {
    useWorkingDeployment()
    server.use(
      http.get(`${baseUrl}/auth/me`, () =>
        HttpResponse.json({ success: true, data: { quota: 1 } }),
      ),
    )

    await expect(
      rightCodeAccountData.fetchData(createRequest()),
    ).rejects.toThrow()
  })
})
