import { http, HttpResponse } from "msw"
import { afterEach, expect, it, vi } from "vitest"

import { fetchPmplan, fetchUserInfo } from "~/services/apiService/pmplan"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"

afterEach(() => vi.restoreAllMocks())
it("accepts the persisted numeric identity without borrowing another account's Cookie", async () => {
  const { cookies } = installCookieTransport("pmplan_session", "plan.pmcat.top")
  server.use(
    http.get("https://plan.pmcat.top/api/me", ({ request }) => {
      expect(request.headers.get("cookie")).toBe("pmplan_session=saved")
      expect(request.headers.get("authorization")).toBeNull()
      return HttpResponse.json({ user: { id: 661, username: "sample" } })
    }),
  )
  await expect(
    fetchUserInfo({
      directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
      baseUrl: "https://plan.pmcat.top",
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: 661,
        cookie: "pmplan_session=saved",
        accessToken: "inference-key",
      },
    }),
  ).resolves.toMatchObject({ id: "661" })
  expect(cookies).not.toHaveBeenCalled()
})
it.each([
  "file:///tmp/pmplan",
  "https://user:password@plan.example",
  "invalid",
])(
  "rejects an invalid console URL before reading credentials: %s",
  async (baseUrl) => {
    const { cookies, fetch } = installCookieTransport(
      "pmplan_session",
      "plan.pmcat.top",
    )
    await expect(
      fetchUserInfo({
        directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
        baseUrl,
        auth: { authType: AuthTypeEnum.Cookie },
      }),
    ).rejects.toMatchObject({ code: "FEATURE_UNSUPPORTED" })
    expect(cookies).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  },
)
it("binds saved credentials and requests to a self-hosted deployment", async () => {
  const { cookies } = installCookieTransport(
    "pmplan_session",
    "custom-plan.example",
  )
  server.use(
    http.get("https://custom-plan.example/api/me", ({ request }) => {
      expect(request.headers.get("cookie")).toBe("pmplan_session=local")
      return HttpResponse.json({ user: { id: 12, username: "local" } })
    }),
  )
  await expect(
    fetchUserInfo({
      directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
      baseUrl: "https://custom-plan.example",
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "12",
        cookie: "pmplan_session=local",
      },
    }),
  ).resolves.toMatchObject({ id: "12" })
  expect(cookies).not.toHaveBeenCalled()
})
it.each(["https://plan.pmcat.top", "https://custom-plan.example"])(
  "reports an expired saved session at %s without borrowing the browser login",
  async (baseUrl) => {
    const { cookies } = installCookieTransport(
      "pmplan_session",
      new URL(baseUrl).hostname,
    )
    server.use(
      http.get(`${baseUrl}/api/me`, () =>
        HttpResponse.json({ error: "unauthorized" }, { status: 401 }),
      ),
    )
    await expect(
      fetchUserInfo({
        directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
        baseUrl,
        auth: {
          authType: AuthTypeEnum.Cookie,
          cookie: "pmplan_session=expired",
          userId: "661",
        },
      }),
    ).rejects.toMatchObject({ statusCode: 401 })
    expect(cookies).not.toHaveBeenCalled()
  },
)
it("reads the saved Cookie identity without using an inference bearer key", async () => {
  installCookieTransport("session", "plan.pmcat.top")
  server.use(
    http.get("https://plan.pmcat.top/api/me", ({ request }) => {
      expect(request.headers.get("cookie")).toBe("session=saved-account")
      expect(request.headers.get("authorization")).toBeNull()
      return HttpResponse.json({ user: { id: 661, username: "sample" } })
    }),
  )
  expect(
    await fetchUserInfo({
      directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
      baseUrl: "https://plan.pmcat.top",
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "661",
        cookie: "session=saved-account",
      },
    }),
  ).toEqual({ id: "661", username: "sample", access_token: null })
})

it("keeps overlapping rolling allowances separate from cash and today statistics", async () => {
  installCookieTransport("pmplan_session", "plan.pmcat.top")
  server.use(
    http.get("https://plan.pmcat.top/api/me", () =>
      HttpResponse.json({
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
      }),
    ),
  )
  const { fetchAccountData } = await import("~/services/apiService/pmplan")
  const { createCheckInConfig } =
    await import("../../apiAdapters/checkInFixtures")
  const data = await fetchAccountData({
    directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
    baseUrl: "https://plan.pmcat.top",
    auth: {
      authType: AuthTypeEnum.Cookie,
      userId: "661",
      cookie: "pmplan_session=saved",
    },
    checkIn: createCheckInConfig("unknown"),
  })
  expect(data.quota).toBeUndefined()
  expect(data.nativeBalance).toBeUndefined()
  expect(data.allowances).toMatchObject({
    entries: [
      { id: "h5", constraint: { remaining: { value: "0.75" } } },
      { id: "weekly", constraint: { remaining: { value: "1.5" } } },
      { id: "monthly", constraint: { remaining: { value: "4" } } },
    ],
  })
  expect(data.today_requests_count).toBe(0)
  expect(data.subscription).toMatchObject({ name: "Lite" })
})

it("offers verified Cookie bootstrap without issuing a console credential", async () => {
  const { getSiteTypeCapabilities } =
    await import("~/services/apiAdapters/registry")
  installCookieTransport("pmplan_session", "plan.pmcat.top")
  server.use(
    http.get("https://plan.pmcat.top/api/me", () =>
      HttpResponse.json({ user: { id: 661, username: "sample" } }),
    ),
  )
  const bootstrap = getSiteTypeCapabilities("pmplan").account?.bootstrap
  expect(bootstrap).toBeDefined()
  const request = {
    directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
    baseUrl: "https://plan.pmcat.top",
    auth: {
      authType: AuthTypeEnum.Cookie,
      userId: "661",
      cookie: "pmplan_session=saved",
    },
  }
  expect(await bootstrap!.fetchUserInfo(request)).toMatchObject({ id: "661" })
  await expect(
    bootstrap!.getOrCreateAccessToken(request),
  ).rejects.toMatchObject({ code: "FEATURE_UNSUPPORTED" })
})

it.each(["https://plan.pmcat.top", "https://custom-plan.example"])(
  "rejects a different live account at %s before accepting its dashboard",
  async (baseUrl) => {
    const { API_ERROR_CODES } = await import("~/services/apiTransport/errors")
    installCookieTransport("pmplan_session", new URL(baseUrl).hostname)
    server.use(
      http.get(`${baseUrl}/api/me`, () =>
        HttpResponse.json({ user: { id: 662, username: "other" } }),
      ),
    )
    await expect(
      fetchUserInfo({
        directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
        baseUrl,
        auth: {
          authType: AuthTypeEnum.Cookie,
          userId: "661",
          cookie: "pmplan_session=saved",
        },
      }),
    ).rejects.toMatchObject({ code: API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH })
  },
)

it.each([
  "https://other.example/api/keys",
  "//other.example/api/keys",
  "/api/../../keys",
])(
  "rejects an escaped deployment endpoint before credential access: %s",
  async (endpoint) => {
    const { cookies, fetch } = installCookieTransport(
      "pmplan_session",
      "custom-plan.example",
    )
    await expect(
      fetchPmplan(
        {
          directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
          baseUrl: "https://custom-plan.example",
          auth: { authType: AuthTypeEnum.Cookie, userId: "661" },
        },
        endpoint,
      ),
    ).rejects.toMatchObject({ code: "FEATURE_UNSUPPORTED" })
    expect(cookies).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  },
)

it("exposes 30-day usage with its rolling scope rather than as today usage", async () => {
  const { fetchAccountData } = await import("~/services/apiService/pmplan")
  const { createCheckInConfig } =
    await import("../../apiAdapters/checkInFixtures")
  installCookieTransport("pmplan_session", "plan.pmcat.top")
  server.use(
    http.get("https://plan.pmcat.top/api/me", () =>
      HttpResponse.json({
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
      }),
    ),
  )
  const data = await fetchAccountData({
    directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
    baseUrl: "https://plan.pmcat.top",
    auth: {
      authType: AuthTypeEnum.Cookie,
      userId: "661",
      cookie: "pmplan_session=saved",
    },
    checkIn: createCheckInConfig("unknown"),
  })
  expect(data.usage).toMatchObject({
    scope: "rolling_window",
    totalRequests: 12,
    totalTokens: 450,
  })
  expect(data.usage?.cost).toBeUndefined()
})

it("does not report identity reads as mutation dispatch", async () => {
  installCookieTransport("pmplan_session", "plan.pmcat.top")
  server.use(
    http.get("https://plan.pmcat.top/api/me", () =>
      HttpResponse.json({ user: { id: 661, username: "sample" } }),
    ),
  )
  const observer = { onDispatch: vi.fn(), onResponse: vi.fn() }
  await fetchUserInfo({
    directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
    baseUrl: "https://plan.pmcat.top",
    auth: {
      authType: AuthTypeEnum.Cookie,
      userId: "661",
      cookie: "pmplan_session=saved",
    },
    observer,
  })
  expect(observer.onDispatch).not.toHaveBeenCalled()
  expect(observer.onResponse).not.toHaveBeenCalled()
})
