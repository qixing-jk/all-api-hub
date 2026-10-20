import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { QUOTA_PER_USD } from "~/constants/money"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { fetchAccountData, fetchUserInfo } from "~/services/apiService/foxcode"
import { fetchRecentUsage } from "~/services/apiService/foxcode/usage"
import * as permissions from "~/services/permissions/permissionManager"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"

import {
  createAccountCompletionHelpersMock,
  createCheckInConfig,
} from "../../apiAdapters/checkInFixtures"

const origin = "https://foxcode.rjj.cc"
const userId = "sample-cuid-account"
const request = {
  baseUrl: origin,
  auth: { authType: AuthTypeEnum.Cookie, userId },
}
const user = { id: userId, name: "Work", role: "USER", isActive: true }

describe("FoxCode console account contract", () => {
  beforeEach(async () => {
    const boundary = installCookieTransport()
    const cookie = (await browser.cookies.getAll({}))[0]!
    boundary.cookies.mockResolvedValue([
      { ...cookie, domain: "foxcode.rjj.cc", name: "auth_token" },
    ])
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it("exposes supported onboarding routes without advertising token or check-in support", async () => {
    const bootstrap = getSiteTypeCapabilities("foxcode").account!.bootstrap!
    const facts = await bootstrap.loadBootstrapFacts(request)
    expect(facts).toMatchObject({
      displayName: "FoxCode",
      checkInSupported: false,
    })
    expect(await bootstrap.fetchCheckInSupport(request, facts)).toBe(false)
    expect(
      await bootstrap.resolveRoutePath(
        { baseUrl: origin, siteType: "foxcode" },
        "login",
      ),
    ).toBe("/auth/login")
    await expect(
      bootstrap.getOrCreateAccessToken(request),
    ).rejects.toMatchObject({ code: "FEATURE_UNSUPPORTED" })
  })

  it("rejects invalid console envelopes", async () => {
    server.use(
      http.get(`${origin}/api/auth/me`, () =>
        HttpResponse.json({ success: false, message: "登录已过期" }),
      ),
    )
    await expect(fetchUserInfo(request)).rejects.toMatchObject({
      code: "BUSINESS_ERROR",
      message: "登录已过期",
    })
  })

  it("preserves a business rejection supplied through the error field", async () => {
    server.use(
      http.get(`${origin}/api/auth/me`, () =>
        HttpResponse.json({ success: false, error: "session refused" }),
      ),
    )
    await expect(fetchUserInfo(request)).rejects.toMatchObject({
      code: "BUSINESS_ERROR",
      message: "session refused",
    })
  })
  it("supplies a useful fallback for a rejection without a message", async () => {
    server.use(
      http.get(`${origin}/api/auth/me`, () =>
        HttpResponse.json({ success: false, error: {} }),
      ),
    )
    await expect(fetchUserInfo(request)).rejects.toMatchObject({
      code: "BUSINESS_ERROR",
      message: "FoxCode request failed",
    })
  })

  it.each([
    { records: {} },
    { records: [{ model: "example", createdAt: "invalid" }] },
  ])("rejects malformed native usage records", async (data) => {
    server.use(
      http.get(`${origin}/api/user/quota/usage`, () =>
        HttpResponse.json({ success: true, data }),
      ),
    )
    await expect(fetchRecentUsage(request)).rejects.toMatchObject({
      code: "JSON_PARSE_ERROR",
    })
  })

  it("uses the nearest expiry across active resetting plans", async () => {
    const plan = {
      plan: { name: "Daily", resetType: "DAILY", quotaLimit: 1000000 },
      quotaUsed: 0,
      quotaRemaining: 1000000,
    }
    server.use(
      http.get(`${origin}/api/auth/me`, () =>
        HttpResponse.json({ success: true, data: { user } }),
      ),
      http.get(`${origin}/api/user/dashboard`, () =>
        HttpResponse.json({
          success: true,
          data: {
            user,
            subscription: {
              active: [
                { ...plan, endDate: "2099-01-01T00:00:00Z" },
                { ...plan, endDate: "2098-01-01T00:00:00Z" },
              ],
            },
          },
        }),
      ),
    )
    expect(
      await fetchAccountData({
        ...request,
        checkIn: createCheckInConfig("foxcode"),
        includeTodayCashflow: false,
      }),
    ).toMatchObject({
      subscription: { expireTime: "2098-01-01T00:00:00Z", remainingAmount: 2 },
    })
  })

  it("keeps malformed usage unavailable and unknown token counts absent", async () => {
    server.use(
      http.get(`${origin}/api/auth/me`, () =>
        HttpResponse.json({ success: true, data: { user } }),
      ),
      http.get(`${origin}/api/user/dashboard`, () =>
        HttpResponse.json({
          success: true,
          data: { user, subscription: { active: [] } },
        }),
      ),
      http.get(`${origin}/api/user/quota/usage`, () =>
        HttpResponse.json({ success: true, data: { records: {} } }),
      ),
    )
    const accountRequest = {
      ...request,
      checkIn: createCheckInConfig("foxcode"),
      includeTodayCashflow: true,
    }
    expect(
      (await fetchAccountData(accountRequest)).recentUsageRecords,
    ).toBeUndefined()
    server.use(
      http.get(`${origin}/api/user/quota/usage`, () =>
        HttpResponse.json({
          success: true,
          data: {
            records: [
              {
                createdAt: "2026-10-12T00:00:00Z",
                model: "example",
                inputTokens: -1,
              },
            ],
          },
        }),
      ),
    )
    expect(
      (await fetchAccountData(accountRequest)).recentUsageRecords?.[0]
        ?.inputTokens,
    ).toBeUndefined()
  })

  it("requires Firefox Cookie permissions before a console read", async () => {
    vi.stubEnv("BROWSER", "firefox")
    vi.spyOn(permissions, "hasCookieInterceptorPermissions").mockResolvedValue(
      false,
    )
    await expect(fetchUserInfo(request)).rejects.toMatchObject({
      code: "COOKIE_PERMISSION_REQUIRED",
    })
  })

  it("uses the captured Cookie for Firefox console reads", async () => {
    vi.stubEnv("BROWSER", "firefox")
    vi.spyOn(permissions, "hasCookieInterceptorPermissions").mockResolvedValue(
      true,
    )
    server.use(
      http.get(`${origin}/api/auth/me`, ({ request }) => {
        expect(request.headers.get("cookie")).toContain(
          "auth_token=browser-account",
        )
        return HttpResponse.json({ success: true, data: { user } })
      }),
    )
    expect(await fetchUserInfo(request)).toMatchObject({ id: userId })
  })

  it.each([
    {},
    {
      announcements: [
        { id: "notice", title: "Bad", content: "", createdAt: "invalid" },
      ],
    },
  ])("rejects malformed announcement data", async (data) => {
    server.use(
      http.get(`${origin}/api/auth/me`, () =>
        HttpResponse.json({ success: true, data: { user } }),
      ),
      http.get(`${origin}/api/user/dashboard`, () =>
        HttpResponse.json({ success: true, data: { user, ...data } }),
      ),
    )
    await expect(
      getSiteTypeCapabilities("foxcode").account!.announcements!.fetch(request),
    ).rejects.toMatchObject({ code: "JSON_PARSE_ERROR" })
  })

  it.each([{ enabled: false }, { enabled: true, referralCode: " " }])(
    "does not invent an invitation when referral data is unavailable",
    async (data) => {
      server.use(
        http.get(`${origin}/api/auth/me`, () =>
          HttpResponse.json({ success: true, data: { user } }),
        ),
        http.get(`${origin}/api/user/referral`, () =>
          HttpResponse.json({ success: true, data }),
        ),
      )
      await expect(
        getSiteTypeCapabilities("foxcode").account!.inviteLink!.fetchInviteLink(
          { request },
        ),
      ).rejects.toThrow()
    },
  )

  it.each([
    { subscription: {} },
    { subscription: { active: [{ plan: {} }] } },
    {
      subscription: {
        active: [
          {
            plan: { name: "Credit", resetType: "NEVER", quotaLimit: -1 },
            endDate: "2099-01-01",
            quotaUsed: 0,
            quotaRemaining: 0,
          },
        ],
      },
    },
  ])(
    "does not display fabricated balances for malformed plans",
    async (data) => {
      server.use(
        http.get(`${origin}/api/auth/me`, () =>
          HttpResponse.json({ success: true, data: { user } }),
        ),
        http.get(`${origin}/api/user/dashboard`, () =>
          HttpResponse.json({ success: true, data: { user, ...data } }),
        ),
      )
      await expect(
        fetchAccountData({
          ...request,
          checkIn: createCheckInConfig("foxcode"),
          includeTodayCashflow: false,
        }),
      ).rejects.toMatchObject({ code: "JSON_PARSE_ERROR" })
    },
  )

  it("keeps a verified balance when optional usage is unavailable", async () => {
    server.use(
      http.get(`${origin}/api/auth/me`, () =>
        HttpResponse.json({ success: true, data: { user } }),
      ),
      http.get(`${origin}/api/user/dashboard`, () =>
        HttpResponse.json({
          success: true,
          data: { user, subscription: { active: [] } },
        }),
      ),
      http.get(`${origin}/api/user/quota/usage`, () =>
        HttpResponse.json({ success: true, data: { records: {} } }),
      ),
    )
    const account = getSiteTypeCapabilities("foxcode").account!
    const result = await account.refresh!.refreshAccount({
      ...request,
      checkIn: createCheckInConfig("foxcode"),
    })
    expect(result).toMatchObject({ success: true, data: { quota: 0 } })
    expect(result.data?.recentUsageRecords).toBeUndefined()
    server.use(
      http.get(
        `${origin}/api/auth/me`,
        () => new HttpResponse(null, { status: 401 }),
      ),
    )
    expect(
      await account.refresh!.refreshAccount({
        ...request,
        checkIn: createCheckInConfig("foxcode"),
      }),
    ).toMatchObject({ success: false })
  })

  it("rejects a console identity different from the saved account", async () => {
    server.use(
      http.get(`${origin}/api/auth/me`, () =>
        HttpResponse.json({
          success: true,
          data: { user: { ...user, id: "another-account" } },
        }),
      ),
    )
    await expect(fetchUserInfo(request)).rejects.toMatchObject({
      code: "ACCOUNT_IDENTITY_MISMATCH",
    })
  })

  it("rejects dashboard data for a different account", async () => {
    server.use(
      http.get(`${origin}/api/auth/me`, () =>
        HttpResponse.json({ success: true, data: { user } }),
      ),
      http.get(`${origin}/api/user/dashboard`, () =>
        HttpResponse.json({
          success: true,
          data: {
            user: { ...user, id: "another-account" },
            subscription: { active: [] },
          },
        }),
      ),
    )
    await expect(
      fetchAccountData({
        ...request,
        checkIn: createCheckInConfig("foxcode"),
        includeTodayCashflow: false,
      }),
    ).rejects.toMatchObject({ code: "ACCOUNT_IDENTITY_MISMATCH" })
  })

  it("propagates expired-session errors from optional usage reads", async () => {
    server.use(
      http.get(`${origin}/api/auth/me`, () =>
        HttpResponse.json({ success: true, data: { user } }),
      ),
      http.get(`${origin}/api/user/dashboard`, () =>
        HttpResponse.json({
          success: true,
          data: { user, subscription: { active: [] } },
        }),
      ),
      http.get(
        `${origin}/api/user/quota/usage`,
        () => new HttpResponse(null, { status: 401 }),
      ),
    )
    await expect(
      fetchAccountData({ ...request, checkIn: createCheckInConfig("foxcode") }),
    ).rejects.toMatchObject({ statusCode: 401 })
  })

  it("fails without dispatch when the console login Cookie is absent", async () => {
    const boundary = installCookieTransport()
    boundary.cookies.mockResolvedValue([])
    const read = vi.fn(() =>
      HttpResponse.json({ success: true, data: { user } }),
    )
    server.use(http.get(`${origin}/api/auth/me`, read))
    await expect(fetchUserInfo(request)).rejects.toMatchObject({
      statusCode: 401,
    })
    expect(read).not.toHaveBeenCalled()
  })

  it("uses the console cookie and preserves a verified string account identity", async () => {
    server.use(
      http.get(`${origin}/api/auth/me`, ({ request }) => {
        expect(request.headers.get("cookie")).toContain(
          "auth_token=browser-account",
        )
        expect(request.headers.has("authorization")).toBe(false)
        return HttpResponse.json({ success: true, data: { user } })
      }),
    )
    await expect(fetchUserInfo(request)).resolves.toEqual({
      id: userId,
      username: "Work",
      access_token: null,
    })
  })

  it("keeps purchased credit separate from resetting plan allowances and excludes expired history", async () => {
    server.use(
      http.get(`${origin}/api/auth/me`, () =>
        HttpResponse.json({ success: true, data: { user } }),
      ),
      http.get(`${origin}/api/user/dashboard`, () =>
        HttpResponse.json({
          success: true,
          data: {
            user,
            quota: { quotaRemaining: 9500000 },
            subscription: {
              active: [
                {
                  id: "credit",
                  plan: {
                    name: "Credit",
                    resetType: "NEVER",
                    quotaLimit: 10000000,
                  },
                  quotaUsed: 2000000,
                  quotaRemaining: 8000000,
                  status: "ACTIVE",
                  endDate: "2099-01-01T00:00:00Z",
                },
                {
                  id: "monthly",
                  plan: {
                    name: "Monthly",
                    resetType: "DAILY",
                    quotaLimit: 2000000,
                  },
                  quotaUsed: 500000,
                  quotaRemaining: 1500000,
                  status: "ACTIVE",
                  endDate: "2026-11-01T00:00:00Z",
                },
              ],
              history: [{ quotaRemaining: 5000000, status: "EXPIRED" }],
            },
          },
        }),
      ),
    )
    const data = await fetchAccountData({
      ...request,
      checkIn: createCheckInConfig("unknown"),
      includeTodayCashflow: false,
    })
    expect(data.quota).toBe(8 * QUOTA_PER_USD)
    expect(data.subscription).toMatchObject({
      name: "Monthly",
      amountLimit: 2,
      usedAmount: 0.5,
      remainingAmount: 1.5,
      period: "DAILY",
      expireTime: "2026-11-01T00:00:00Z",
      isActive: true,
    })
    expect(data.todayStatsAvailability?.consumption.status).toBe("unavailable")
    expect(data.usage).toBeUndefined()
  })

  it("completes normal FoxCode onboarding with the verified Cookie identity and no invented access token", async () => {
    server.use(
      http.get(`${origin}/api/auth/me`, () =>
        HttpResponse.json({ success: true, data: { user } }),
      ),
    )
    const { helpers, captureRecoveryData } = createAccountCompletionHelpersMock(
      "foxcode",
      { automaticExecutionEnabled: false },
    )
    const account = getSiteTypeCapabilities("foxcode").account!
    expect(
      await account.completion!.complete(
        {
          url: origin,
          requestedAuthType: AuthTypeEnum.Cookie,
          detected: { userId, user: {}, siteType: "foxcode" },
          context: {},
        },
        helpers,
      ),
    ).toMatchObject({
      userId,
      username: "Work",
      accessToken: "",
      authType: AuthTypeEnum.Cookie,
      siteName: "FoxCode",
    })
    expect(captureRecoveryData).toHaveBeenCalledWith({
      userId,
      username: "Work",
      authType: AuthTypeEnum.Cookie,
    })
    await expect(
      account.bootstrap!.getOrCreateAccessToken(request),
    ).rejects.toMatchObject({ code: "FEATURE_UNSUPPORTED" })
  })

  it("retrieves the native referral link with encoded code without claiming referral earnings", async () => {
    server.use(
      http.get(`${origin}/api/auth/me`, () =>
        HttpResponse.json({ success: true, data: { user } }),
      ),
      http.get(`${origin}/api/user/referral`, () =>
        HttpResponse.json({
          success: true,
          data: { enabled: true, referralCode: "a b&c" },
        }),
      ),
    )
    expect(
      await getSiteTypeCapabilities(
        "foxcode",
      ).account!.inviteLink!.fetchInviteLink({ request }),
    ).toBe(`${origin}/auth/register?aff=a%20b%26c`)
  })

  it("returns dashboard announcements with stable IDs and publication times without inventing read state", async () => {
    server.use(
      http.get(`${origin}/api/auth/me`, () =>
        HttpResponse.json({ success: true, data: { user } }),
      ),
      http.get(`${origin}/api/user/dashboard`, () =>
        HttpResponse.json({
          success: true,
          data: {
            user,
            announcements: [
              {
                id: "notice",
                title: "Route update",
                content: "New endpoint",
                createdAt: "2026-09-02T10:32:42.554Z",
                type: "WARNING",
              },
            ],
          },
        }),
      ),
    )
    expect(
      await getSiteTypeCapabilities("foxcode").account!.announcements!.fetch(
        request,
      ),
    ).toEqual([
      {
        id: "notice",
        title: "Route update",
        content: "New endpoint",
        createdAt: 1788345162554,
      },
    ])
  })

  it("loads recent native usage without treating per-call counts or channel quota as tokens or base spending", async () => {
    server.use(
      http.get(`${origin}/api/auth/me`, () =>
        HttpResponse.json({ success: true, data: { user } }),
      ),
      http.get(`${origin}/api/user/dashboard`, () =>
        HttpResponse.json({
          success: true,
          data: { user, subscription: { active: [] } },
        }),
      ),
      http.get(`${origin}/api/user/quota/usage`, () =>
        HttpResponse.json({
          success: true,
          data: {
            records: [
              {
                createdAt: "2026-10-12T00:00:00Z",
                model: "claude",
                inputTokens: 100,
                outputTokens: 50,
                cacheCreationInputTokens: 5,
                cacheReadInputTokens: 10,
                totalTokens: 165,
                quotaCost: 8000000,
                costDetails: {
                  breakdown: { baseCost: 1000000 },
                  pricing: { Times: false },
                },
              },
              {
                createdAt: "2026-10-12T01:00:00Z",
                model: "image",
                totalTokens: 3,
                quotaCost: 750000,
                costDetails: { pricing: { Times: true } },
              },
            ],
            pagination: { page: 1, pages: 1, hasMore: false },
          },
        }),
      ),
    )
    const data = await fetchAccountData({
      ...request,
      checkIn: createCheckInConfig("foxcode"),
    })
    expect(data.recentUsageRecords?.[0]).toMatchObject({
      model: "claude",
      inputTokens: 100,
      outputTokens: 50,
      cacheCreationTokens: 5,
      cacheReadTokens: 10,
      totalTokens: 165,
      cost: 1,
    })
    expect(data.recentUsageRecords?.[1]).toEqual({
      requestTime: "2026-10-12T01:00:00Z",
      model: "image",
    })
    expect(data.usage).toBeUndefined()
  })
})
