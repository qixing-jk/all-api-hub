import { http, HttpResponse } from "msw"
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from "vitest"

import { QUOTA_PER_USD } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import { accountMutations } from "~/services/accounts/accountStorage/accountMutations"
import { accountPresentation } from "~/services/accounts/accountStorage/accountPresentation"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { getDisplayConsumptionProjection } from "~/services/accounts/metrics/consumptionProjection"
import { buildAccountRefreshUpdate } from "~/services/accounts/refresh/accountRefreshUpdate"
import {
  FINANCIAL_ENUMERATION,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { fetchAccountData } from "~/services/apiService/krill"
import {
  readKrill,
  withKrillSession,
} from "~/services/apiService/krill/transport"
import * as permissions from "~/services/permissions/permissionManager"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"
import {
  buildCheckInConfig,
  buildSiteAccount,
} from "~~/tests/test-utils/factories"

const origin = "https://www.krill-code.com"
const user = {
  id: 47044,
  email: "kai@example.com",
  nickname: null,
  linux_do_email: null,
  role: "user",
  tos_accepted: true,
  enterprise_memberships: [],
  credit_balance_usd: "12.500000",
  totp_enabled: false,
  is_agent: false,
  agent_bound: false,
  has_dedicated_pricing: false,
}
const subscription = {
  subscriptions: [
    {
      id: 22,
      plan: { name: "轻享周卡" },
      status: "active",
      subscription_end_at: "2026-10-21T00:00:00Z",
    },
  ],
  summary: {
    total_daily_quota_usd: "420.000000",
    total_used_usd: "15.250000",
    total_remaining_usd: "404.750000",
    total_forwarded_remaining_usd: "0",
    entry_route_keys: [],
    subscription_end_at: "2026-10-21T00:00:00Z",
  },
  credit_balance_usd: "12.500000",
  welfare_balance_usd: "3.000000",
  request_count_quota: null,
  freeze_policy: { enabled: true, free_mode: false, can_freeze: false },
}
const stats = {
  total_requests: 7,
  success_requests: 6,
  failed_requests: 1,
  input_tokens: 1_000,
  output_tokens: 200,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
  reasoning_tokens: 0,
  total_tokens: 1_200,
  total_cost_usd: "1.750000",
  rpm: 0,
  peak_rpm: 0,
  tpm: 0,
  range_start: "2026-10-14T16:00:00Z",
  range_end: "2026-10-14T23:59:59Z",
  bucket_seconds: 3600,
  trend: [],
}
const request = {
  directRequestReason: "caller_managed" as const,
  baseUrl: origin,
  auth: { authType: AuthTypeEnum.Cookie, userId: user.id },
}

function useHappyPath(
  overrides: { subscription?: Record<string, unknown> } = {},
) {
  server.use(
    http.get(`${origin}/api/auth/me`, () =>
      HttpResponse.json({ success: true, code: 0, data: user }),
    ),
    http.get(`${origin}/api/subscription`, () =>
      HttpResponse.json({
        success: true,
        code: 0,
        data: { ...subscription, ...overrides.subscription },
      }),
    ),
    http.post(`${origin}/api/request-logs/stats`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>
      ;(globalThis as { __statsBody?: unknown }).__statsBody = body
      return HttpResponse.json({ success: true, code: 0, data: stats })
    }),
  )
}

describe("Krill AI account console", () => {
  it.each([
    {
      subscriptions: undefined,
      summary: undefined,
      enumeration: FINANCIAL_ENUMERATION.Unavailable,
      retainPlans: true,
    },
    {
      subscriptions: null,
      summary: undefined,
      enumeration: FINANCIAL_ENUMERATION.Unavailable,
      retainPlans: true,
    },
    {
      subscriptions: undefined,
      summary: { ...subscription.summary, total_remaining_usd: "333.25" },
      enumeration: FINANCIAL_ENUMERATION.Partial,
      retainPlans: true,
    },
    {
      subscriptions: null,
      summary: { ...subscription.summary, total_remaining_usd: "333.25" },
      enumeration: FINANCIAL_ENUMERATION.Partial,
      retainPlans: true,
    },
    {
      subscriptions: [],
      summary: undefined,
      enumeration: FINANCIAL_ENUMERATION.Complete,
      retainPlans: false,
    },
  ])(
    "persists independent wallet and daily cost while respecting subscription-list coverage: %j",
    async ({ subscriptions, summary, enumeration, retainPlans }) => {
      vi.useFakeTimers({ toFake: ["Date"] })
      vi.setSystemTime(new Date("2026-10-15T06:00:00Z"))
      useHappyPath()
      const previous = await fetchAccountData({
        ...request,
        includeTodayCashflow: false,
      } as never)
      const id = await accountMutations.addAccount(
        buildSiteAccount({
          site_type: SITE_TYPES.KRILL,
          site_url: origin,
          authType: AuthTypeEnum.Cookie,
          checkIn: buildCheckInConfig({ automaticExecutionEnabled: false }),
          account_info: {
            ...buildSiteAccount().account_info,
            id: String(user.id),
            username: user.email,
            access_token: "",
            balance: previous.balance,
            allowances: previous.allowances,
          },
        }),
      )
      onTestFinished(async () => {
        await accountMutations.deleteAccount(id)
      })
      const stored = (await accountQueries.getAccountById(id))!
      const generation = (await accountMutations.beginBalanceRefresh(
        id,
        stored,
      ))!
      useHappyPath({ subscription: { subscriptions, summary } })
      server.use(
        http.post(`${origin}/api/request-logs/stats`, () =>
          HttpResponse.json({
            success: true,
            data: { ...stats, total_cost_usd: "1.5" },
          }),
        ),
      )
      const refresh = await getSiteTypeCapabilities(
        "krill",
      ).account!.refresh!.refreshAccount({
        ...request,
        accountId: id,
        checkIn: stored.checkIn,
      } as never)
      expect(refresh.success).toBe(true)
      if (!refresh.success) throw new Error("Krill partial refresh failed")
      const data = refresh.data
      expect(data.allowanceRefreshParts?.[0]?.enumeration).toBe(enumeration)
      expect(
        await accountMutations.updateAccountFromRefresh(
          id,
          buildAccountRefreshUpdate(stored, refresh, false),
          undefined,
          stored,
          data,
          generation,
        ),
      ).not.toBeNull()
      const saved = (await accountQueries.getAccountById(id))!
      const display = accountPresentation.convertToDisplayData(saved)
      expect(display.balanceSnapshot?.positions[0]?.amount).toMatchObject({
        status: "known",
        value: "12.5",
      })
      expect(display.todayConsumption.USD).toBe(1.5)
      if (!retainPlans) {
        expect(saved.account_info.allowances?.entries).toEqual([])
        return
      }
      expect(
        saved.account_info.allowances?.entries.find(
          (entry) => entry.id === "22",
        )?.constraint.enabled,
      ).toMatchObject({ status: "stale", value: true })
      expect(
        saved.account_info.allowances?.entries.find(
          (entry) => entry.id === "summary",
        )?.constraint.remaining,
      ).toMatchObject({
        status: summary ? "known" : "stale",
        value: summary ? "333.25" : "404.75",
      })
    },
  )
  it.each([undefined, null, -1, "4"])(
    "retains known cost and token counts independently of unavailable requests: %s",
    async (total_requests) => {
      useHappyPath()
      server.use(
        http.post(`${origin}/api/request-logs/stats`, () =>
          HttpResponse.json({
            success: true,
            data: { ...stats, total_requests },
          }),
        ),
      )
      const data = await fetchAccountData(request as never)
      expect(data.settledConsumption?.[0]?.amount).toMatchObject({
        status: "known",
        value: "1.75",
      })
      expect(data.todayStatsAvailability).toMatchObject({
        consumption: { status: "complete" },
        requests: { status: "unavailable", reason: "invalid_payload" },
        tokens: { status: "complete" },
      })
      expect(data.today_prompt_tokens).toBe(1000)
      expect(data.today_completion_tokens).toBe(200)
    },
  )
  it.each([undefined, null, "invalid"])(
    "retains known requests and token counts independently of unavailable cost: %s",
    async (total_cost_usd) => {
      useHappyPath()
      server.use(
        http.post(`${origin}/api/request-logs/stats`, () =>
          HttpResponse.json({
            success: true,
            data: { ...stats, total_cost_usd },
          }),
        ),
      )
      const data = await fetchAccountData(request as never)
      expect(data.settledConsumption?.[0]?.amount.status).toBe("unavailable")
      expect(data.today_requests_count).toBe(7)
      expect(data.todayStatsAvailability).toMatchObject({
        consumption: { status: "unavailable", reason: "invalid_payload" },
        requests: { status: "complete" },
        tokens: { status: "complete" },
      })
    },
  )
  it.each([undefined, null, "-1"])(
    "refreshes the authoritative wallet without requiring unused identity money: %s",
    async (credit_balance_usd) => {
      useHappyPath()
      server.use(
        http.get(`${origin}/api/auth/me`, () =>
          HttpResponse.json({
            success: true,
            data: { ...user, credit_balance_usd },
          }),
        ),
      )
      const refresh = getSiteTypeCapabilities("krill").account!.refresh!
      expect(
        await refresh.refreshAccount({
          ...request,
          includeTodayCashflow: false,
        } as never),
      ).toMatchObject({
        success: true,
        data: {
          balance: {
            positions: [{ amount: { status: "known", value: "12.5" } }],
          },
        },
      })
    },
  )
  it.each([undefined, -1, "100"])(
    "retains billed costs and request counts independently of unavailable token fields: %s",
    async (input_tokens) => {
      useHappyPath()
      server.use(
        http.post(`${origin}/api/request-logs/stats`, () =>
          HttpResponse.json({
            success: true,
            data: { ...stats, input_tokens, total_requests: 4 },
          }),
        ),
      )
      const data = await fetchAccountData(request as never)
      expect(data.settledConsumption?.[0]?.amount).toMatchObject({
        status: "known",
        value: "1.75",
      })
      expect(data.today_requests_count).toBe(4)
      expect(data.todayStatsAvailability).toMatchObject({
        consumption: { status: "complete" },
        requests: { status: "complete" },
        tokens: { status: "unavailable", reason: "invalid_payload" },
      })
    },
  )
  it("preserves unfiltered billed cost coverage when the report omits its time window", async () => {
    useHappyPath()
    server.use(
      http.post(`${origin}/api/request-logs/stats`, () =>
        HttpResponse.json({
          success: true,
          data: { ...stats, range_start: null, range_end: null },
        }),
      ),
    )
    const data = await fetchAccountData(request as never)
    expect(data.settledConsumption).toBeUndefined()
    expect(data.usage?.cost).toMatchObject({
      amount: { status: "known", value: "1.75" },
      scope: {
        projects: { kind: "all" },
        keys: { kind: "all" },
        models: { kind: "all" },
        groups: { kind: "all" },
      },
    })
    expect(data.usage?.cost?.window).toBeUndefined()
  })
  it.each([
    {
      statuses: ["active"],
      expected: { status: OBSERVATION_STATUSES.Known, value: true },
    },
    {
      statuses: ["expired", "active"],
      expected: { status: OBSERVATION_STATUSES.Known, value: true },
    },
    {
      statuses: ["expired", "frozen"],
      expected: { status: OBSERVATION_STATUSES.Known, value: false },
    },
    { statuses: [undefined], expected: { status: "unknown" } },
    { statuses: ["expired", undefined], expected: { status: "unknown" } },
  ])(
    "reports aggregate activity from known plan rows without inventing an omitted summary expiry: $statuses",
    async ({ statuses, expected }) => {
      useHappyPath({
        subscription: {
          summary: { ...subscription.summary, subscription_end_at: null },
          subscriptions: statuses.map((status, id) => ({
            id,
            status,
            subscription_end_at: "2099-10-21T00:00:00Z",
          })),
        },
      })
      const data = await fetchAccountData({
        ...request,
        includeTodayCashflow: false,
      } as never)
      expect(data.allowances?.entries[0]).toMatchObject({
        validity: { kind: "unknown" },
        constraint: { enabled: expected },
      })
      expect(data.allowances?.entries[0]?.reportedTiming).toBeUndefined()
      expect(data.allowances?.entries[1]?.validity).toEqual({
        kind: "expires",
        at: Date.parse("2099-10-21T00:00:00Z"),
      })
    },
  )
  it.each([
    { status: "expired", expected: { status: "unknown" } },
    {
      status: "active",
      expected: { status: OBSERVATION_STATUSES.Known, value: true },
    },
  ])(
    "preserves incomplete plan enumeration when determining aggregate activity: $status",
    async ({ status, expected }) => {
      useHappyPath({
        subscription: { subscriptions: [{ id: 22, status }, null] },
      })
      const data = await fetchAccountData({
        ...request,
        includeTodayCashflow: false,
      } as never)
      expect(data.allowanceRefreshParts?.[0]?.enumeration).toBe("partial")
      expect(data.allowances?.entries[0]?.constraint.enabled).toMatchObject(
        expected,
      )
    },
  )
  it("preserves reported expiry and inactivity on the aggregate remaining allowance", async () => {
    useHappyPath({
      subscription: {
        subscriptions: [
          {
            id: 22,
            status: "expired",
            subscription_end_at: "2026-11-18T00:00:00Z",
          },
        ],
        summary: {
          ...subscription.summary,
          subscription_end_at: "2026-11-18T00:00:00Z",
        },
      },
    })
    const data = await fetchAccountData({
      ...request,
      includeTodayCashflow: false,
    } as never)
    expect(data.allowances?.entries[0]).toMatchObject({
      id: "summary",
      validity: { kind: "expires", at: Date.parse("2026-11-18T00:00:00Z") },
      reportedTiming: { expiresAt: "2026-11-18T00:00:00Z" },
      constraint: {
        remaining: { status: "known", value: "404.75" },
        enabled: { status: "known", value: false },
      },
    })
  })
  it("includes unfiltered billed costs in financial reporting while wallet restrictions remain unknown", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-15T06:00:00Z"))
    useHappyPath()
    const data = await fetchAccountData({
      ...request,
      accountId: "krill-account",
    } as never)
    expect(
      getDisplayConsumptionProjection([
        { id: "krill-account", settledConsumption: data.settledConsumption },
      ]).groups,
    ).toEqual([
      expect.objectContaining({
        amount: { asset: { kind: "currency", code: "USD" }, value: "1.75" },
      }),
    ])
    expect(data.settledConsumption?.[0]).toMatchObject({
      cumulative: true,
      scope: {
        projects: { kind: "all" },
        keys: { kind: "all" },
        models: { kind: "all" },
        groups: { kind: "all" },
      },
      window: {
        start: Date.parse("2026-10-14T16:00:00Z"),
        end: Date.parse("2026-10-15T00:00:00Z"),
        timeZone: "Asia/Shanghai",
      },
    })
    expect(data.balance?.positions[0]?.scope.keys).toEqual({ kind: "unknown" })
  })
  it("keeps the exact wallet and daily plan summary apart, preserving each plan expiry", async () => {
    useHappyPath({
      subscription: {
        credit_balance_usd: "12.000000000000000017",
        subscriptions: [
          {
            id: 22,
            plan: { name: "Plan A" },
            status: "active",
            subscription_end_at: "2099-10-21T00:00:00Z",
          },
          {
            id: 23,
            plan: { name: "Plan B" },
            status: "frozen",
            subscription_end_at: "2099-11-21T00:00:00Z",
          },
        ],
      },
    })
    const result = await fetchAccountData({
      ...request,
      includeTodayCashflow: false,
    } as never)
    expect(result).not.toHaveProperty("quota")
    expect(result.balance?.positions[0]).toMatchObject({
      asset: { kind: "currency", code: "USD" },
      amount: { value: "12.000000000000000017" },
    })
    expect(result.allowances?.entries).toEqual([
      expect.objectContaining({
        id: "summary",
        constraint: expect.objectContaining({
          remaining: expect.objectContaining({ value: "404.75" }),
          window: expect.objectContaining({ period: "day" }),
        }),
      }),
      expect.objectContaining({
        id: "22",
        validity: { kind: "expires", at: Date.parse("2099-10-21T00:00:00Z") },
        constraint: expect.objectContaining({
          remaining: expect.objectContaining({ status: "unknown" }),
          enabled: expect.objectContaining({ value: true }),
        }),
      }),
      expect.objectContaining({
        id: "23",
        constraint: expect.objectContaining({
          enabled: expect.objectContaining({ value: false }),
        }),
      }),
    ])
  })
  it("retries a failed reusable read within the operation and retains its successful result", async () => {
    let reads = 0
    server.use(
      http.get(`${origin}/api/auth/me`, () => {
        reads++
        return HttpResponse.json(
          reads === 1
            ? { success: false, message: "Temporarily unavailable" }
            : { success: true, data: user },
        )
      }),
    )
    await withKrillSession(request as never, async (scoped) => {
      await expect(readKrill(scoped, "/api/auth/me")).rejects.toThrow()
      const [a, b] = await Promise.all([
        readKrill(scoped, "/api/auth/me"),
        readKrill(scoped, "/api/auth/me"),
      ])
      expect(a.id).toBe(47044)
      expect(b).toEqual(a)
      expect(await readKrill(scoped, "/api/auth/me")).toEqual(a)
    })
    expect(reads).toBe(2)
  })
  let browserBoundary: ReturnType<typeof installCookieTransport>
  beforeEach(() => {
    browserBoundary = installCookieTransport()
    browserBoundary.cookies.mockResolvedValue([
      {
        name: "krill_jwt",
        value: "console-session",
        domain: "www.krill-code.com",
        path: "/",
        secure: true,
        httpOnly: false,
        hostOnly: true,
        session: false,
        sameSite: "lax",
        storeId: "0",
        firstPartyDomain: "",
        expirationDate: Date.now() / 1000 + 3600,
      },
    ])
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it("uses the newer subscription balance when usage changes it after the identity read", async () => {
    useHappyPath({ subscription: { credit_balance_usd: "12.400000" } })
    await expect(fetchAccountData(request as never)).resolves.toHaveProperty(
      "balance.positions.0.amount.value",
      "12.4",
    )
  })

  it("retains a frozen plan's native row expiry when the summary omits it", async () => {
    const { subscription_end_at: _expiry, ...summary } = subscription.summary
    useHappyPath({
      subscription: {
        summary,
        subscriptions: [
          {
            plan: { name: "Frozen plan" },
            status: "frozen",
            subscription_end_at: "2026-10-21T00:00:00Z",
          },
        ],
      },
    })
    await expect(fetchAccountData(request as never)).resolves.toHaveProperty(
      "allowances.entries.1",
      expect.objectContaining({
        label: "Frozen plan",
        constraint: expect.objectContaining({
          enabled: expect.objectContaining({ status: "known", value: false }),
        }),
        validity: { kind: "expires", at: Date.parse("2026-10-21T00:00:00Z") },
      }),
    )
  })

  it("maps the USD credit balance and the separate plan allowance into account data", async () => {
    useHappyPath()
    const data = await fetchAccountData(request as never)

    expect(data.balance?.positions[0]?.amount).toMatchObject({ value: "12.5" })
    expect(data.allowances?.entries[0]).toMatchObject({
      id: "summary",
      constraint: {
        limit: { value: "420" },
        used: { value: "15.25" },
        remaining: { value: "404.75" },
      },
    })
    expect(data.allowances?.entries[1]).toMatchObject({
      label: "轻享周卡",
      validity: { kind: "expires", at: Date.parse("2026-10-21T00:00:00Z") },
      constraint: { enabled: { status: "known", value: true } },
    })
  })

  it("sends the site's own Asia/Shanghai day window and maps today's usage", async () => {
    useHappyPath()
    const body = await fetchAccountData(request as never)

    expect((globalThis as { __statsBody?: unknown }).__statsBody).toMatchObject(
      {
        start_time: /\d{4}-\d{2}-\d{2}T00:00$/,
        end_time: /\d{4}-\d{2}-\d{2}T23:59:59$/,
      },
    )
    expect(body.today_quota_consumption).toBe(1.75 * QUOTA_PER_USD)
    expect(body.today_requests_count).toBe(7)
    expect(body.today_prompt_tokens).toBe(1_000)
    expect(body.today_completion_tokens).toBe(200)
    expect(body.todayStatsAvailability?.consumption.status).toBe("complete")
    expect(body.settledConsumption?.[0]).toMatchObject({
      asset: { kind: "currency", code: "USD" },
      amount: { value: "1.75" },
      window: {
        start: Date.parse(stats.range_start),
        end: Date.parse(stats.range_end) + 1000,
        timeZone: "Asia/Shanghai",
      },
    })
  })

  it("includes native cache creation and reads in today's input token total", async () => {
    useHappyPath()
    server.use(
      http.post(`${origin}/api/request-logs/stats`, () =>
        HttpResponse.json({
          success: true,
          data: {
            ...stats,
            cache_creation_input_tokens: 300,
            cache_read_input_tokens: 500,
          },
        }),
      ),
    )
    await expect(fetchAccountData(request as never)).resolves.toHaveProperty(
      "today_prompt_tokens",
      1800,
    )
  })

  it("rejects a saved account bound to a different console identity", async () => {
    useHappyPath()
    await expect(
      fetchAccountData({
        ...request,
        auth: { authType: AuthTypeEnum.Cookie, userId: 99999 },
      } as never),
    ).rejects.toMatchObject({ code: "ACCOUNT_IDENTITY_MISMATCH" })
  })

  it("refuses a non-Krill console origin instead of sending its Cookie elsewhere", async () => {
    useHappyPath()
    await expect(
      fetchAccountData({
        ...request,
        baseUrl: "https://evil.example.com",
      } as never),
    ).rejects.toMatchObject({ code: "FEATURE_UNSUPPORTED" })
  })

  it("does not turn an unreadable balance into zero", async () => {
    useHappyPath({ subscription: { credit_balance_usd: "not-a-number" } })
    await expect(fetchAccountData(request as never)).resolves.toMatchObject({
      balance: { positions: [{ amount: { status: "unavailable" } }] },
    })
  })
  it.each([
    [null],
    [{ ...stats, input_tokens: -1 }],
    [{ ...stats, input_tokens: "5" }],
  ])(
    "retains balance and marks malformed today stats unavailable: %j",
    async (data) => {
      useHappyPath()
      server.use(
        http.post(`${origin}/api/request-logs/stats`, () =>
          HttpResponse.json({ success: true, data }),
        ),
      )
      const result = await fetchAccountData(request as never)
      expect(result.balance?.positions[0]?.amount).toMatchObject({
        value: "12.5",
      })
      expect(result.todayStatsAvailability?.tokens).toMatchObject({
        status: "unavailable",
        reason: "invalid_payload",
      })
    },
  )
  it("retains balance on temporary stats failure", async () => {
    useHappyPath()
    server.use(
      http.post(`${origin}/api/request-logs/stats`, () =>
        HttpResponse.json({ success: false, message: "busy" }),
      ),
    )
    const result = await fetchAccountData(request as never)
    expect(result.todayStatsAvailability?.requests).toMatchObject({
      status: "unavailable",
      reason: "request_failed",
    })
  })
  it.each([401, 403])(
    "propagates stats authorization failure %s",
    async (status) => {
      useHappyPath()
      server.use(
        http.post(`${origin}/api/request-logs/stats`, () =>
          HttpResponse.json({ success: false }, { status }),
        ),
      )
      await expect(fetchAccountData(request as never)).rejects.toMatchObject({
        statusCode: status,
      })
    },
  )
  it.each([null, []])(
    "rejects malformed subscription response envelopes: %j",
    async (data) => {
      useHappyPath()
      server.use(
        http.get(`${origin}/api/subscription`, () =>
          HttpResponse.json({
            success: true,
            data,
          }),
        ),
      )
      await expect(fetchAccountData(request as never)).rejects.toMatchObject({
        code: "JSON_PARSE_ERROR",
      })
    },
  )
  it("does not invent a subscription when there are no plans", async () => {
    useHappyPath({ subscription: { subscriptions: [] } })
    expect(
      (
        await fetchAccountData({
          ...request,
          includeTodayCashflow: false,
        } as never)
      ).subscription,
    ).toBeUndefined()
  })
  it.each([
    { success: false, error: { message: "unauthorized" } },
    { success: false, code: 401 },
    { success: false },
    { data: {} },
    { success: true, data: null },
    { success: true, data: { ...user, email: "" } },
    { success: true, data: { ...user, id: 0 } },
  ])(
    "rejects invalid or unauthenticated identity envelopes: %j",
    async (body) => {
      server.use(
        http.get(`${origin}/api/auth/me`, () => HttpResponse.json(body)),
      )
      await expect(fetchAccountData(request as never)).rejects.toThrow()
    },
  )
  it("rejects a malformed escaped login credential before dispatch", async () => {
    browserBoundary.cookies.mockResolvedValue([
      {
        name: "krill_jwt",
        value: "%ZZ",
        domain: "www.krill-code.com",
        path: "/",
        secure: true,
      },
    ] as never)
    await expect(fetchAccountData(request as never)).rejects.toMatchObject({
      code: "JSON_PARSE_ERROR",
    })
  })

  it("bootstraps and completes cookie onboarding with verified recovery data", async () => {
    useHappyPath()
    const account = getSiteTypeCapabilities("krill").account!
    const bootstrap = account.bootstrap!
    await expect(
      bootstrap.getOrCreateAccessToken({} as never),
    ).rejects.toMatchObject({ code: "FEATURE_UNSUPPORTED" })
    expect(await bootstrap.loadBootstrapFacts!({} as never)).toMatchObject({
      checkInSupported: false,
    })
    expect(await bootstrap.fetchCheckInSupport!({} as never, {} as never)).toBe(
      false,
    )
    expect(
      await bootstrap.resolveRoutePath!(
        { siteType: "krill" } as never,
        "login",
      ),
    ).toBe("/login")
    const captureRecoveryData = vi.fn()
    const result = await account.completion!.complete(
      {
        url: origin,
        requestedAuthType: AuthTypeEnum.Cookie,
        detected: { userId: "47044" },
        context: {},
      } as never,
      {
        createServiceRequest: (input: Record<string, unknown>) => ({
          ...input,
          directRequestReason: "caller_managed",
        }),
        captureRecoveryData,
        createInitialCheckInConfig: () => ({ enableDetection: false }),
      } as never,
    )
    expect(result).toMatchObject({
      userId: "47044",
      username: "kai@example.com",
      authType: "cookie",
      accessToken: "",
    })
    expect(captureRecoveryData).toHaveBeenCalledWith({
      userId: "47044",
      username: "kai@example.com",
      authType: "cookie",
    })
  })
  it("reports healthy refreshes and classifies expired authentication", async () => {
    useHappyPath()
    const refresh = getSiteTypeCapabilities("krill").account!.refresh!
    expect(await refresh.refreshAccount(request as never)).toMatchObject({
      success: true,
      data: { balance: { positions: [{ amount: { value: "12.5" } }] } },
    })
    server.use(
      http.get(`${origin}/api/auth/me`, () =>
        HttpResponse.json({ success: false, code: 401 }),
      ),
    )
    expect(await refresh.refreshAccount(request as never)).toMatchObject({
      success: false,
    })
  })
  it("requires Firefox cookie interception permission", async () => {
    vi.stubEnv("BROWSER", "firefox")
    vi.spyOn(permissions, "hasCookieInterceptorPermissions").mockResolvedValue(
      false,
    )
    await expect(fetchAccountData(request as never)).rejects.toMatchObject({
      code: "COOKIE_PERMISSION_REQUIRED",
    })
  })
  it("uses the captured cookie for Firefox account requests", async () => {
    vi.stubEnv("BROWSER", "firefox")
    vi.spyOn(permissions, "hasCookieInterceptorPermissions").mockResolvedValue(
      true,
    )
    useHappyPath()
    const result = await fetchAccountData(request as never)
    expect(result.balance?.positions[0]?.amount).toMatchObject({
      value: "12.5",
    })
  })
  it("rejects a non-API endpoint before transport dispatch", async () => {
    await expect(readKrill(request as never, "/unsafe")).rejects.toMatchObject({
      code: "FEATURE_UNSUPPORTED",
    })
  })
  it("rejects an explicit cookie without the console login credential", async () => {
    await expect(
      fetchAccountData({
        ...request,
        auth: { ...request.auth, cookie: "other=value" },
      } as never),
    ).rejects.toMatchObject({ statusCode: 401 })
  })
  it("keeps each native plan expiry when multiple plans omit the summary expiry", async () => {
    useHappyPath({
      subscription: {
        summary: { ...subscription.summary, subscription_end_at: null },
        subscriptions: [
          {
            plan: { name: "A" },
            subscription_end_at: "2026-10-20T00:00:00Z",
            status: "active",
          },
          {
            plan: { name: "B" },
            subscription_end_at: "2026-10-21T00:00:00Z",
            status: "active",
          },
        ],
      },
    })
    expect(
      (await fetchAccountData(request as never)).allowances?.entries
        .slice(1)
        .map((entry) => entry.validity),
    ).toEqual([
      { kind: "expires", at: Date.parse("2026-10-20T00:00:00Z") },
      { kind: "expires", at: Date.parse("2026-10-21T00:00:00Z") },
    ])
  })
})
