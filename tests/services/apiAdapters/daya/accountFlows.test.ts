import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { ACCOUNT_BOOTSTRAP_ROUTE_KINDS } from "~/services/apiAdapters/contracts/accountBootstrap"
import { dayaCapabilities } from "~/services/apiAdapters/daya"
import { fetchAccountData } from "~/services/apiService/daya"
import { fetchDayaUserInfo } from "~/services/apiService/daya/identity"
import { performDayaCheckIn } from "~/services/apiService/daya/rewards"
import { fetchDayaData } from "~/services/apiService/daya/transport"
import { dayaProvider } from "~/services/checkin/autoCheckin/providers/daya"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { server } from "~~/tests/msw/server"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

const origin = "https://api.dayaai.com"
const request = {
  baseUrl: origin,
  auth: { authType: AuthTypeEnum.Cookie, userId: "615" },
}
const envelope = (data: unknown) => ({ code: 0, message: "success", data })
const identity = { id: 615, username: "daya-user", balance: 4 }
const account = () =>
  buildSiteAccount({
    site_url: origin,
    site_type: SITE_TYPES.DAYA,
    authType: AuthTypeEnum.Cookie,
    account_info: {
      ...buildSiteAccount().account_info,
      id: "615",
      username: "daya-user",
    },
  })
const context = {
  tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
  protectionBypassExecution: userCommandExecution(
    PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
  ),
}

describe("Daya account workflows", () => {
  beforeEach(() => {
    installCookieTransport("daya_sid", "api.dayaai.com")
    server.use(
      http.get(`${origin}/api/v1/auth/me`, () =>
        HttpResponse.json(envelope(identity)),
      ),
      http.get(`${origin}/api/v1/rewards/overview`, () =>
        HttpResponse.json(envelope({ daily_check_in: { claimable: true } })),
      ),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it("requires Firefox interception permission even with an explicitly saved Cookie", async () => {
    vi.stubEnv("BROWSER", "firefox")
    vi.mocked(browser.permissions.contains).mockResolvedValue(false)
    await expect(
      fetchDayaData(
        { ...request, cookieAuthSessionCookie: "daya_sid=saved-session" },
        "/api/v1/auth/me",
      ),
    ).rejects.toMatchObject({ code: "COOKIE_PERMISSION_REQUIRED" })
  })

  it("uses the saved console Cookie in Firefox after interception permission is granted", async () => {
    vi.stubEnv("BROWSER", "firefox")
    await expect(
      fetchDayaUserInfo({
        ...request,
        cookieAuthSessionCookie: "daya_sid=saved-session",
      }),
    ).resolves.toMatchObject({ id: "615", username: "daya-user" })
  })

  it("marks malformed dashboard amounts unavailable without inventing zero usage", async () => {
    server.use(
      http.get(`${origin}/api/v1/usage/dashboard/stats`, () =>
        HttpResponse.json(envelope({ today_input_tokens: "100" })),
      ),
    )
    const result = await fetchAccountData({
      ...request,
      checkIn: account().checkIn,
    })
    expect(result.todayStatsAvailability?.consumption).toEqual({
      status: "unavailable",
      reason: "invalid_payload",
    })
  })

  it("discovers the daily grant using read-only authoritative status", async () => {
    await expect(
      dayaProvider.detect!({ request, observedAt: 50 }),
    ).resolves.toMatchObject({
      detection: { outcome: "matched" },
      status: { today: "not_checked" },
    })
  })

  it("normalizes bootstrap identity and exposes Cookie-only onboarding facts and routes", async () => {
    const bootstrap = dayaCapabilities.account!.bootstrap!
    await expect(fetchDayaUserInfo(request)).resolves.toEqual({
      id: "615",
      username: "daya-user",
      access_token: null,
    })
    await expect(
      bootstrap.getOrCreateAccessToken(request),
    ).rejects.toMatchObject({ code: "FEATURE_UNSUPPORTED" })
    const facts = await bootstrap.loadBootstrapFacts(request)
    expect(facts).toEqual({ displayName: "Daya API", checkInSupported: true })
    await expect(bootstrap.fetchCheckInSupport(request, facts)).resolves.toBe(
      true,
    )
    await expect(
      bootstrap.resolveRoutePath(
        { baseUrl: origin, siteType: SITE_TYPES.DAYA },
        ACCOUNT_BOOTSTRAP_ROUTE_KINDS.Login,
      ),
    ).resolves.toBe("/login")
  })

  it("completes a detected Cookie account with recovery data from verified identity", async () => {
    const captureRecoveryData = vi.fn()
    const checkIn = account().checkIn
    const result = await dayaCapabilities.account!.completion!.complete(
      {
        url: origin,
        requestedAuthType: AuthTypeEnum.Cookie,
        detected: { userId: "615", siteType: SITE_TYPES.DAYA },
        context: {},
      },
      {
        createServiceRequest: ({ baseUrl, auth }) => ({ baseUrl, auth }),
        captureRecoveryData,
        createInitialCheckInConfig: () => checkIn,
        fetchSiteName: async () => "Daya API",
        trimString: (value) => String(value ?? "").trim(),
        handleCheckInSupportFetchFailure: () => false,
        createCompletionError: vi.fn(),
      },
    )
    expect(result).toMatchObject({
      userId: "615",
      username: "daya-user",
      authType: AuthTypeEnum.Cookie,
      accessToken: "",
      checkIn,
    })
    expect(captureRecoveryData).toHaveBeenCalledWith({
      userId: "615",
      username: "daya-user",
      authType: AuthTypeEnum.Cookie,
    })
  })

  it("returns failed refresh health after the session expires", async () => {
    server.use(
      http.get(
        `${origin}/api/v1/auth/me`,
        () => new HttpResponse(null, { status: 401 }),
      ),
    )
    await expect(
      dayaCapabilities.account!.refresh!.refreshAccount({
        ...request,
        includeTodayCashflow: false,
        checkIn: account().checkIn,
      }),
    ).resolves.toMatchObject({
      success: false,
      healthStatus: { status: expect.any(String) },
    })
  })

  it("filters unreadable notices without losing valid account announcements", async () => {
    const good = {
      id: 7,
      title: "  Maintenance  ",
      content: "Scheduled",
      created_at: "2026-10-21T00:00:00Z",
    }
    server.use(
      http.get(`${origin}/api/v1/announcements`, () =>
        HttpResponse.json(
          envelope([
            good,
            null,
            { ...good, id: " " },
            { ...good, title: "" },
            { ...good, content: null },
            { ...good, created_at: "bad" },
          ]),
        ),
      ),
    )
    await expect(
      dayaCapabilities.site!.announcements!.fetch(request),
    ).resolves.toEqual([
      {
        id: "7",
        title: "Maintenance",
        content: "Scheduled",
        createdAt: Date.parse(good.created_at),
      },
    ])
    server.use(
      http.get(`${origin}/api/v1/announcements`, () =>
        HttpResponse.json(envelope({ items: [] })),
      ),
    )
    await expect(
      dayaCapabilities.site!.announcements!.fetch(request),
    ).rejects.toThrow("Invalid Daya API response")
  })

  it.each([
    [null, "Invalid Daya API response"],
    [{ code: 0 }, "Invalid Daya API response"],
    [{ code: 3, data: null, message: "denied" }, "denied"],
    [{ code: 3, data: null, message: null }, "Daya API request failed"],
  ])(
    "rejects malformed or failed console envelopes (%j)",
    async (body, message) => {
      server.use(
        http.get(`${origin}/api/v1/announcements`, () =>
          HttpResponse.json(body),
        ),
      )
      await expect(
        fetchDayaData(request, "/api/v1/announcements"),
      ).rejects.toThrow(message as string)
    },
  )

  it.each([401, 403])(
    "does not turn dashboard authorization failure %s into stale balance success",
    async (status) => {
      server.use(
        http.get(
          `${origin}/api/v1/usage/dashboard/stats`,
          () => new HttpResponse(null, { status }),
        ),
      )
      await expect(
        fetchAccountData({ ...request, checkIn: account().checkIn }),
      ).rejects.toMatchObject({ statusCode: status })
    },
  )

  it("does not mutate check-in when the logged-in identity changed", async () => {
    const post = vi.fn(() => HttpResponse.json(envelope({})))
    server.use(
      http.get(`${origin}/api/v1/auth/me`, () =>
        HttpResponse.json(envelope({ ...identity, id: 999 })),
      ),
      http.post(`${origin}/api/v1/rewards/check-in`, post),
    )
    await expect(performDayaCheckIn(request)).rejects.toMatchObject({
      code: "ACCOUNT_IDENTITY_MISMATCH",
    })
    expect(post).not.toHaveBeenCalled()
  })

  it("rejects malformed daily-grant data", async () => {
    server.use(
      http.get(`${origin}/api/v1/rewards/overview`, () =>
        HttpResponse.json(envelope({ daily_check_in: { claimable: "yes" } })),
      ),
    )
    await expect(performDayaCheckIn(request)).rejects.toThrow(
      "Invalid Daya API response",
    )
  })

  it("reports unknown status without credentials or after a failed read", async () => {
    await expect(
      dayaProvider.getStatus!({ observedAt: 50 }),
    ).resolves.toBeUndefined()
    server.use(
      http.get(
        `${origin}/api/v1/rewards/overview`,
        () => new HttpResponse(null, { status: 503 }),
      ),
    )
    await expect(
      dayaProvider.getStatus!({ account: account(), observedAt: 50 }),
    ).resolves.toMatchObject({ outcome: "unknown", attemptedAt: 50 })
  })

  it.each([true, false])(
    "maps native claimable=%s into check-in status and execution results",
    async (claimable) => {
      const post = vi.fn(() => HttpResponse.json(envelope({ amount: 0.5 })))
      server.use(
        http.get(`${origin}/api/v1/rewards/overview`, () =>
          HttpResponse.json(envelope({ daily_check_in: { claimable } })),
        ),
        http.post(`${origin}/api/v1/rewards/check-in`, post),
      )
      expect(dayaProvider.getReadiness(account())).toEqual({ ready: true })
      expect(
        dayaProvider.getReadiness({
          ...account(),
          authType: AuthTypeEnum.AccessToken,
        }),
      ).toMatchObject({ ready: false })
      await expect(
        dayaProvider.getStatus!({ account: account(), observedAt: 50 }),
      ).resolves.toMatchObject({ today: claimable ? "not_checked" : "checked" })
      const result = await dayaProvider.checkIn(account(), context)
      expect(result.status).toBe(claimable ? "success" : "already_checked")
      expect(post).toHaveBeenCalledTimes(claimable ? 1 : 0)
    },
  )

  it("maps a rejected check-in into a provider failure result", async () => {
    server.use(
      http.post(`${origin}/api/v1/rewards/check-in`, () =>
        HttpResponse.json({ code: 1, data: null, message: "cannot claim" }),
      ),
    )
    await expect(
      dayaProvider.checkIn(account(), context),
    ).resolves.toMatchObject({ status: "failed" })
  })
})
