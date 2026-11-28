import { http, HttpResponse } from "msw"
import { afterEach, expect, it, vi } from "vitest"

import { QUOTA_PER_USD } from "~/constants/money"
import { accountPresentation } from "~/services/accounts/accountStorage/accountPresentation"
import { calculateAccountStats } from "~/services/accounts/accountStorage/accountStatistics"
import { normalizeSiteAccount } from "~/services/accounts/editing/accountDefaults"
import { fetchAccountData } from "~/services/apiService/pmplan"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { createCheckInConfig } from "~~/tests/services/apiAdapters/checkInFixtures"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

afterEach(() => vi.restoreAllMocks())
const request = {
  directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
  baseUrl: "https://plan.pmcat.top",
  auth: {
    authType: AuthTypeEnum.Cookie,
    userId: "661",
    cookie: "pmplan_session=saved",
  },
  checkIn: createCheckInConfig("unknown"),
}
const snapshot = () => ({
  user: { id: 661, username: "sample" },
  plan: { name: "Lite" },
  usage: {
    h5_used: 250000,
    h5_limit: 1000000,
    weekly_used: 500000,
    weekly_limit: 2000000,
    monthly_used: 1000000,
    monthly_limit: 5000000,
    requests_30d: 12,
    tokens_30d: 450,
  },
  checkin: { today: "2026-01-01" },
  daily_usage: [
    { day: "12-31", requests: 9, cost_micro: 500000 },
    { day: "01-01", requests: 3, cost_micro: 125000 },
  ],
  recent_usage: [
    {
      model: "agnes-2.5-flash",
      total_tokens: 42,
      cost_micro: 125000,
      status: 200,
      created_at: "2026-01-01T00:01:00Z",
      error_code: null,
    },
  ],
})
const useSnapshot = (value: Record<string, unknown>) => {
  installCookieTransport("pmplan_session", "plan.pmcat.top")
  server.use(
    http.get("https://plan.pmcat.top/api/me", () => HttpResponse.json(value)),
  )
}
it("preserves each overlapping window's used and maximum amounts", async () => {
  useSnapshot(snapshot())
  const data = await fetchAccountData(request)
  expect(data.nativeBalance).toBeUndefined()
  expect(data.quota).toBeUndefined()
  expect(data.balance?.positions ?? []).toEqual([])
  expect(data.allowances).toMatchObject({
    coverage: "complete",
    entries: [
      {
        id: "h5",
        constraint: {
          remaining: { value: "0.75", source: { kind: "derived" } },
          used: { value: "0.25" },
          limit: { value: "1" },
          window: { kind: "rolling", period: "5h" },
        },
      },
      {
        id: "weekly",
        constraint: {
          remaining: { value: "1.5" },
          used: { value: "0.5" },
          limit: { value: "2" },
          window: { kind: "rolling", period: "week" },
        },
      },
      {
        id: "monthly",
        constraint: {
          remaining: { value: "4" },
          used: { value: "1" },
          limit: { value: "5" },
          window: { kind: "rolling", period: "month" },
        },
      },
    ],
  })
})
it("presents the tightest finite allowance before larger and unlimited windows", async () => {
  const body = snapshot()
  useSnapshot({
    ...body,
    usage: { ...body.usage, h5_limit: null, monthly_limit: 1100000 },
  })
  const result = await fetchAccountData(request)
  expect(result.allowances?.entries.map((entry) => entry.id)).toEqual([
    "monthly",
    "weekly",
    "h5",
  ])
  expect(result.allowances?.entries[0]?.constraint.remaining).toMatchObject({
    value: "0.1",
  })
})
it("preserves native allowances and site-day costs through storage without adding them to cash totals", async () => {
  useSnapshot(snapshot())
  const data = await fetchAccountData(request)
  const account = buildSiteAccount({
    site_type: "pmplan",
    site_url: request.baseUrl,
  })
  account.account_info = {
    ...account.account_info,
    ...data,
    quota: 123_000_000,
  }
  const saved = normalizeSiteAccount(account)
  const displayed = accountPresentation.convertToDisplayData(saved)
  expect(displayed.allowances?.entries[0]?.constraint.remaining).toMatchObject({
    value: "0.75",
  })
  expect(displayed.usageObservations?.[0]).toMatchObject({
    scope: "site_today",
    reportedDay: "2026-01-01",
    cost: { amount: { value: "0.125" } },
  })
  expect(saved.account_info.quota).toBeUndefined()
  const totals = calculateAccountStats([saved])
  expect(totals.total_quota).toBe(0)
  expect(totals.today_total_consumption).toBe(0)
})
it("maps the native server day's requests and cost separately from rolling and token statistics", async () => {
  useSnapshot(snapshot())
  const data = await fetchAccountData(request)
  expect(data.today_requests_count).toBe(3)
  expect(data.today_quota_consumption).toBe(0.125 * QUOTA_PER_USD)
  expect(data.todayStatsAvailability).toMatchObject({
    consumption: { status: "unavailable", reason: "wrong_period" },
    requests: { status: "unavailable", reason: "wrong_period" },
    tokens: { status: "unavailable", reason: "unsupported" },
    income: { status: "unavailable", reason: "unsupported" },
  })
  expect(data.usage).toMatchObject({
    scope: "rolling_window",
    totalRequests: 12,
    totalTokens: 450,
  })
  expect(data.usage?.cost).toBeUndefined()
  expect(data.usageObservations).toMatchObject([
    {
      scope: "site_today",
      reportedDay: "2026-01-01",
      totalRequests: 3,
      cost: { amount: { value: "0.125" } },
    },
  ])
  expect(data.recentUsageRecords).toEqual([
    {
      requestTime: "2026-01-01T00:01:00Z",
      model: "agnes-2.5-flash",
      totalTokens: 42,
      cost: 0.125,
      status: "200",
    },
  ])
})
it("keeps malformed daily cost unavailable without discarding valid daily requests or the allowance", async () => {
  const data = snapshot()
  data.daily_usage[1]!.cost_micro = -1
  useSnapshot(data)
  const result = await fetchAccountData(request)
  expect(result.today_requests_count).toBe(3)
  expect(result.todayStatsAvailability).toMatchObject({
    consumption: { status: "unavailable", reason: "invalid_payload" },
    requests: { status: "unavailable", reason: "wrong_period" },
  })
  expect(result.allowances?.entries[0]?.constraint.remaining).toMatchObject({
    value: "0.75",
  })
})
it.each(["missing", "duplicated"])(
  "does not claim a %s server-day aggregate as zero usage",
  async (kind) => {
    const daily =
      kind === "missing"
        ? []
        : [snapshot().daily_usage[1], snapshot().daily_usage[1]]
    useSnapshot({ ...snapshot(), daily_usage: daily })
    expect(
      (await fetchAccountData(request)).todayStatsAvailability,
    ).toMatchObject({
      consumption: { status: "unavailable", reason: "invalid_payload" },
      requests: { status: "unavailable", reason: "invalid_payload" },
    })
  },
)
it("respects a refresh that defers today statistics", async () => {
  useSnapshot(snapshot())
  const data = await fetchAccountData({
    ...request,
    includeTodayCashflow: false,
  })
  expect(data.today_requests_count).toBe(0)
  expect(data.todayStatsAvailability).toMatchObject({
    consumption: { status: "unavailable", reason: "not_collected" },
    requests: { status: "unavailable", reason: "not_collected" },
  })
})
it("retains an explicit unlimited summary when no native rolling cap is finite", async () => {
  const data = snapshot()
  useSnapshot({
    ...data,
    usage: {
      ...data.usage,
      h5_limit: null,
      weekly_limit: null,
      monthly_limit: null,
    },
  })
  const result = await fetchAccountData(request)
  expect(result.allowances?.entries).toHaveLength(3)
  for (const entry of result.allowances!.entries) {
    expect(entry.constraint.limitState).toBe("unlimited")
    expect(entry.constraint.remaining).not.toHaveProperty("value")
  }
})
