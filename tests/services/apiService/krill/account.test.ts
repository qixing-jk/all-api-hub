import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { QUOTA_PER_USD } from "~/constants/money"
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
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

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
      expect(result.quota).toBe(12.5 * QUOTA_PER_USD)
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
  it.each([
    null,
    { subscriptions: null },
    { subscriptions: [{}], summary: null },
    {
      subscriptions: [{}],
      summary: { ...subscription.summary, subscription_end_at: 123 },
    },
  ])("rejects malformed subscription data: %j", async (data) => {
    useHappyPath()
    server.use(
      http.get(`${origin}/api/subscription`, () =>
        HttpResponse.json({
          success: true,
          data: data === null ? null : { ...subscription, ...data },
        }),
      ),
    )
    await expect(fetchAccountData(request as never)).rejects.toMatchObject({
      code: "JSON_PARSE_ERROR",
    })
  })
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
    { success: true, data: { ...user, credit_balance_usd: "-1" } },
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
        createServiceRequest: (input: unknown) => input,
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
      data: { quota: 12.5 * QUOTA_PER_USD },
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
    expect(result.quota).toBe(12.5 * QUOTA_PER_USD)
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
  it("uses the latest native plan expiry when multiple plans omit the summary expiry", async () => {
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
      (await fetchAccountData(request as never)).subscription?.expireTime,
    ).toBe("2026-10-21T00:00:00Z")
  })
})
