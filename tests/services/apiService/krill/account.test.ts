import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { QUOTA_PER_USD } from "~/constants/money"
import { fetchAccountData } from "~/services/apiService/krill"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"

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
  afterEach(() => vi.restoreAllMocks())

  it("uses the newer subscription balance when usage changes it after the identity read", async () => {
    useHappyPath({ subscription: { credit_balance_usd: "12.400000" } })
    await expect(fetchAccountData(request as never)).resolves.toHaveProperty(
      "quota",
      12.4 * QUOTA_PER_USD,
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
      "subscription",
      expect.objectContaining({
        name: "Frozen plan",
        isActive: false,
        expireTime: "2026-10-21T00:00:00Z",
      }),
    )
  })

  it("maps the USD credit balance and the separate plan allowance into account data", async () => {
    useHappyPath()
    const data = await fetchAccountData(request as never)

    expect(data.quota).toBe(12.5 * QUOTA_PER_USD)
    expect(data.subscription).toMatchObject({
      name: "轻享周卡",
      amountLimit: 420 * QUOTA_PER_USD,
      usedAmount: 15.25 * QUOTA_PER_USD,
      remainingAmount: 404.75 * QUOTA_PER_USD,
      expireTime: "2026-10-21T00:00:00Z",
      isActive: true,
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
    await expect(fetchAccountData(request as never)).rejects.toMatchObject({
      code: "JSON_PARSE_ERROR",
    })
  })
})
