import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ACCOUNT_USAGE_SCOPES } from "~/constants/accountUsage"
import { QUOTA_PER_USD } from "~/constants/money"
import { getSiteDayReadings } from "~/services/accounts/metrics/accountTodayStats"
import { getDisplayConsumptionProjection } from "~/services/accounts/metrics/consumptionProjection"
import {
  fetchAccountData,
  fetchInviteLink,
} from "~/services/apiService/cubence"
import { fetchUserInfo } from "~/services/apiService/cubence/identity"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"

import { createCheckInConfig } from "../../apiAdapters/checkInFixtures"

const origin = "https://cubence.com"
const request = {
  directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
  baseUrl: origin,
  auth: { authType: AuthTypeEnum.Cookie, userId: 7 },
}
const accountRequest = { ...request, checkIn: createCheckInConfig("cubence") }
const user = {
  id: 7,
  username: "example",
  name: "Example",
  active: true,
  normal_balance: 12500000,
  charity_balance: 9000000,
}
const today = {
  code: 200,
  range: "today",
  window_start: "2026-10-09T00:00:00+08:00",
  as_of: "2026-10-09T14:00:00+08:00",
  summary: {
    cost: 1500000,
    calls: 4,
    tokens: 400,
    input_tokens: 200,
    output_tokens: 50,
    cache_read_tokens: 100,
    cache_creation_tokens: 25,
  },
}

describe("Cubence account protocol", () => {
  it("does not publish complete daily consumption at the exact provider midnight", async () => {
    vi.setSystemTime(new Date("2026-10-08T16:00:00Z"))
    const data = await fetchAccountData(accountRequest)
    expect(data.settledConsumption).toBeUndefined()
    expect(data.todayStatsAvailability?.consumption.status).toBe("unavailable")
    expect(data.todayStatsAvailability?.requests.status).toBe("complete")
    expect(data.balance?.positions[0]?.scope.walletId).toBe("7")
  })
  it("keeps provider-labelled daily amounts and counters visible when an exact observation boundary is omitted", async () => {
    server.use(
      http.get(`${origin}/api/v1/analytics/apikeys/hourly-usage`, () =>
        HttpResponse.json({ ...today, as_of: undefined }),
      ),
    )
    const data = await fetchAccountData(accountRequest)
    expect(getSiteDayReadings(data)).toMatchObject([
      {
        lastKnown: false,
        observedAt: Date.now(),
        usage: {
          scope: ACCOUNT_USAGE_SCOPES.SiteToday,
          totalRequests: 4,
          totalTokens: 400,
          cost: {
            asset: { kind: "currency", code: "USD" },
            amount: { status: "known", value: "1.5" },
          },
        },
      },
    ])
    expect(
      getDisplayConsumptionProjection([
        { id: "cubence", settledConsumption: data.settledConsumption },
      ]).groups,
    ).toEqual([])
  })
  it.each([undefined, null, -1, "4"])(
    "retains known cost and token counts independently of unavailable requests: %s",
    async (calls) => {
      server.use(
        http.get(`${origin}/api/v1/analytics/apikeys/hourly-usage`, () =>
          HttpResponse.json({ ...today, summary: { ...today.summary, calls } }),
        ),
      )
      const data = await fetchAccountData(accountRequest)
      expect(data.settledConsumption?.[0]?.amount).toMatchObject({
        status: "known",
        value: "1.5",
      })
      expect(data.todayStatsAvailability).toMatchObject({
        consumption: { status: "complete" },
        requests: { status: "unavailable", reason: "invalid_payload" },
        tokens: { status: "complete" },
      })
      expect(data.today_prompt_tokens).toBe(350)
      expect(data.today_completion_tokens).toBe(50)
    },
  )
  it.each([undefined, null, "invalid"])(
    "retains known requests and token counts independently of unavailable cost: %s",
    async (cost) => {
      server.use(
        http.get(`${origin}/api/v1/analytics/apikeys/hourly-usage`, () =>
          HttpResponse.json({ ...today, summary: { ...today.summary, cost } }),
        ),
      )
      const data = await fetchAccountData(accountRequest)
      expect(data.settledConsumption?.[0]?.amount.status).toBe("unavailable")
      expect(data.today_requests_count).toBe(4)
      expect(data.todayStatsAvailability).toMatchObject({
        consumption: { status: "unavailable", reason: "invalid_payload" },
        requests: { status: "complete" },
        tokens: { status: "complete" },
      })
    },
  )
  it.each([undefined, -1, "400"])(
    "retains billed cost and request counts independently of unavailable token fields: %s",
    async (tokens) => {
      server.use(
        http.get(`${origin}/api/v1/analytics/apikeys/hourly-usage`, () =>
          HttpResponse.json({
            ...today,
            summary: { cost: 1500000, calls: 4, tokens },
          }),
        ),
      )
      const data = await fetchAccountData(accountRequest)
      expect(data.settledConsumption?.[0]?.amount).toMatchObject({
        status: "known",
        value: "1.5",
      })
      expect(data.today_requests_count).toBe(4)
      expect(data.todayStatsAvailability).toMatchObject({
        consumption: { status: "complete" },
        requests: { status: "complete" },
        tokens: { status: "unavailable", reason: "invalid_payload" },
      })
    },
  )
  it("includes unfiltered billed costs in financial reporting while wallet restrictions remain unknown", async () => {
    const data = await fetchAccountData({
      ...accountRequest,
      accountId: "cubence-account",
    })
    expect(data.settledConsumption).toHaveLength(1)
    expect(data.settledConsumption?.[0]).toMatchObject({
      cumulative: true,
      asset: { kind: "currency", code: "USD" },
      amount: { status: "known", value: "1.5" },
      scope: {
        subject: { kind: "account", accountId: "cubence-account" },
        projects: { kind: "all" },
        keys: { kind: "all" },
        models: { kind: "all" },
        groups: { kind: "all" },
      },
    })
    expect(data.balance?.positions[0]?.scope.keys).toEqual({ kind: "unknown" })
  })
  it.each(["balance", "usage"])(
    "keeps independent facts when %s normalization exceeds decimal precision",
    async (field) => {
      const tiny = `0.${"0".repeat(252)}1`
      server.use(
        http.get(`${origin}/api/v1/auth/me`, () =>
          HttpResponse.json({
            user: {
              ...user,
              ...(field === "balance" ? { normal_balance: tiny } : {}),
            },
          }),
        ),
        http.get(`${origin}/api/v1/analytics/apikeys/hourly-usage`, () =>
          HttpResponse.json({
            ...today,
            summary: {
              ...today.summary,
              ...(field === "usage" ? { cost: tiny } : {}),
            },
          }),
        ),
      )
      const result = await fetchAccountData(accountRequest)
      expect(result.balance?.positions).toMatchObject([
        {
          id: "normal",
          labelKey: "normalBalance",
          amount:
            field === "balance"
              ? { status: "unavailable" }
              : { status: "known", value: "12.5" },
        },
        {
          id: "charity",
          labelKey: "charityBalance",
          amount: { status: "known", value: "9" },
        },
      ])
      expect(result.settledConsumption?.[0]?.amount).toMatchObject(
        field === "usage"
          ? { status: "unavailable" }
          : { status: "known", value: "1.5" },
      )
      expect(result.todayStatsAvailability?.requests).toMatchObject({
        status: "complete",
      })
      expect(result.today_requests_count).toBe(4)
    },
  )
  beforeEach(() => {
    installCookieTransport()
  })
  afterEach(() => vi.restoreAllMocks())
  afterEach(() => vi.useRealTimers())
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-09T06:00:00Z"))
    server.use(
      http.get(`${origin}/api/v1/auth/me`, () => HttpResponse.json({ user })),
      http.get(
        `${origin}/api/v1/analytics/apikeys/hourly-usage`,
        ({ request }) => {
          expect(new URL(request.url).searchParams.get("range")).toBe("today")
          expect(request.headers.has("authorization")).toBe(false)
          return HttpResponse.json(today)
        },
      ),
    )
  })

  it("verifies live identity and maps purchased USD microcredits without merging charity balance", async () => {
    const native = await fetchAccountData(accountRequest)
    expect(native.settledConsumption?.[0]).toMatchObject({
      asset: { kind: "currency", code: "USD" },
      amount: { value: "1.5" },
      window: {
        start: Date.parse(today.window_start),
        end: Date.parse(today.as_of),
        timeZone: "Asia/Shanghai",
      },
    })
    await expect(fetchUserInfo(request)).resolves.toMatchObject({
      id: "7",
      username: "example",
      access_token: null,
    })
    await expect(fetchAccountData(accountRequest)).resolves.toMatchObject({
      balance: {
        positions: [
          {
            id: "normal",
            asset: { kind: "currency", code: "USD" },
            amount: { value: "12.5" },
            funding: "purchased",
          },
          {
            id: "charity",
            asset: { kind: "currency", code: "USD" },
            amount: { value: "9" },
            funding: "granted",
            nature: "unknown",
          },
        ],
      },
      today_quota_consumption: 1.5 * QUOTA_PER_USD,
      today_requests_count: 4,
      today_prompt_tokens: 350,
      today_completion_tokens: 50,
      todayStatsAvailability: {
        consumption: { status: "complete" },
        requests: { status: "complete" },
        tokens: { status: "complete" },
        income: { status: "unavailable", reason: "unsupported" },
      },
    })
  })

  it.each([undefined, "2026-10-09T14:00:00", "2026-10-10T14:00:00+08:00"])(
    "keeps usage outside today's complete interval separate: %s",
    async (as_of) => {
      server.use(
        http.get(`${origin}/api/v1/analytics/apikeys/hourly-usage`, () =>
          HttpResponse.json({ ...today, as_of }),
        ),
      )
      const data = await fetchAccountData(accountRequest)
      expect(data.settledConsumption).toBeUndefined()
      expect(data.usage).toMatchObject({
        scope: ACCOUNT_USAGE_SCOPES.SiteToday,
        totalRequests: 4,
        totalTokens: 400,
        cost: {
          amount: { value: "1.5" },
          scope: {
            projects: { kind: "all" },
            keys: { kind: "all" },
            models: { kind: "all" },
            groups: { kind: "all" },
          },
        },
      })
      expect(data.today_quota_consumption).toBe(0)
      expect(data.todayStatsAvailability).toMatchObject({
        consumption: { status: "unavailable" },
        requests: { status: "unavailable" },
        tokens: { status: "unavailable" },
      })
    },
  )

  it("rejects another logged-in identity before fetching account data", async () => {
    server.use(
      http.get(`${origin}/api/v1/auth/me`, () =>
        HttpResponse.json({ user: { ...user, id: 8 } }),
      ),
    )
    await expect(fetchAccountData(accountRequest)).rejects.toMatchObject({
      code: "ACCOUNT_IDENTITY_MISMATCH",
    })
  })

  it.each([
    [null, undefined],
    ["12", "0.000012"],
    [NaN, undefined],
  ])(
    "retains exact or unavailable balance %s without inventing zero",
    async (normal_balance, expected) => {
      server.use(
        http.get(`${origin}/api/v1/auth/me`, () =>
          HttpResponse.json({ user: { ...user, normal_balance } }),
        ),
      )
      const amount = (await fetchAccountData(accountRequest)).balance
        ?.positions[0]?.amount
      expect(amount).toMatchObject(
        expected === undefined
          ? { status: "unavailable" }
          : { status: "known", value: expected },
      )
    },
  )

  it("allows negative purchased balance", async () => {
    server.use(
      http.get(`${origin}/api/v1/auth/me`, () =>
        HttpResponse.json({ user: { ...user, normal_balance: -1000000 } }),
      ),
    )
    expect(
      (await fetchAccountData(accountRequest)).balance?.positions[0]?.amount,
    ).toMatchObject({ value: "-1" })
  })

  it("keeps balance when today usage fails and does not report a complete zero", async () => {
    server.use(
      http.get(`${origin}/api/v1/analytics/apikeys/hourly-usage`, () =>
        HttpResponse.json({ error: "unavailable" }, { status: 503 }),
      ),
    )
    await expect(fetchAccountData(accountRequest)).resolves.toMatchObject({
      balance: {
        positions: expect.arrayContaining([
          expect.objectContaining({
            id: "normal",
            amount: expect.objectContaining({ value: "12.5" }),
          }),
        ]),
      },
      todayStatsAvailability: {
        consumption: { status: "unavailable", reason: "request_failed" },
      },
    })
  })

  it("rejects stale or wrong-day usage while retaining the balance", async () => {
    server.use(
      http.get(`${origin}/api/v1/analytics/apikeys/hourly-usage`, () =>
        HttpResponse.json({
          ...today,
          window_start: "2026-10-08T00:00:00+08:00",
        }),
      ),
    )
    expect(
      (await fetchAccountData(accountRequest)).todayStatsAvailability
        ?.consumption.status,
    ).toBe("unavailable")
  })

  it("skips today fetches when disabled", async () => {
    const fetchToday = vi.fn(() => HttpResponse.json(today))
    server.use(
      http.get(`${origin}/api/v1/analytics/apikeys/hourly-usage`, fetchToday),
    )
    await fetchAccountData({ ...accountRequest, includeTodayCashflow: false })
    expect(fetchToday).not.toHaveBeenCalled()
  })

  it.each([
    { ...request, baseUrl: "https://api.cubence.com" },
    { ...request, baseUrl: "http://cubence.com" },
    {
      ...request,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "not-a-console-token",
      },
    },
  ])(
    "never sends console credentials to unsupported origins/auth methods",
    async (input) => {
      await expect(fetchUserInfo(input)).rejects.toMatchObject({
        code: "FEATURE_UNSUPPORTED",
      })
    },
  )

  it("surfaces session expiry without silently changing authentication", async () => {
    server.use(
      http.get(`${origin}/api/v1/auth/me`, () =>
        HttpResponse.json({ error: "Unauthorized" }, { status: 401 }),
      ),
    )
    await expect(fetchUserInfo(request)).rejects.toMatchObject({
      statusCode: 401,
    })
  })

  it("builds the native invitation route from the authenticated code", async () => {
    server.use(
      http.get(`${origin}/api/v1/invite/my-code`, () =>
        HttpResponse.json({
          code: 0,
          data: { invite_code: "EXAMPLE" },
          message: "success",
        }),
      ),
    )
    await expect(fetchInviteLink(request)).resolves.toBe(
      "https://cubence.com/signup?code=EXAMPLE",
    )
  })
})
