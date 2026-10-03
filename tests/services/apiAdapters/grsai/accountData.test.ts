import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_BROWSER_SESSION_SOURCES,
  resolveAccountBrowserSession,
} from "~/services/accountBrowserSession"
import {
  fetchAccountData,
  fetchGrsaiModels,
  fetchUserInfo,
  refreshAccountData,
} from "~/services/apiService/grsai"
import { GRSAI_ENDPOINTS } from "~/services/apiService/grsai/constants"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
  AuthTypeEnum,
  SiteHealthStatus,
} from "~/types"
import { server } from "~~/tests/msw/server"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

import { GRSAI_SIGNATURE_MATERIAL } from "../../apiService/grsai/signatureFixture"

vi.mock("~/services/accountBrowserSession", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("~/services/accountBrowserSession")
  >()),
  resolveAccountBrowserSession: vi.fn(),
}))

const CONSOLE = "https://eb.grsaiapi.com"
const STORED_TOKEN = "session-token"
const RESYNCED_TOKEN = "resynced-session-token"
const ACCOUNT_ID = "6aba891720c8e541cff9d0e3"
const ACCOUNT_EMAIL = "example@example.invalid"

const request = {
  baseUrl: "https://grsai.com",
  accountId: "account-example",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: STORED_TOKEN,
    userId: ACCOUNT_ID,
  },
  checkIn: buildCheckInConfig(),
  includeTodayCashflow: true,
}

/** How many `getConfig` exchanges the adapter dispatched. */
let configRequests = 0

const configHandler = (isAuth: boolean, token = "rotated-token") =>
  http.post(`${CONSOLE}${GRSAI_ENDPOINTS.config}`, () => {
    configRequests += 1
    return HttpResponse.json({
      code: 0,
      msg: "success",
      data: { ...GRSAI_SIGNATURE_MATERIAL, token, isAuth },
    })
  })

/** Authenticates by the token the exchange was opened with. */
const liveTokenConfigHandler = (liveTokens: readonly string[]) =>
  http.post(`${CONSOLE}${GRSAI_ENDPOINTS.config}`, async ({ request: req }) => {
    configRequests += 1
    const { token } = (await req.json()) as { token?: string }
    return HttpResponse.json({
      code: 0,
      msg: "success",
      data: {
        ...GRSAI_SIGNATURE_MATERIAL,
        token: token ?? "",
        isAuth: liveTokens.includes(token ?? ""),
      },
    })
  })

const dashboardHandler = () =>
  http.post(`${CONSOLE}${GRSAI_ENDPOINTS.dashboard}`, () =>
    HttpResponse.json({
      code: 0,
      msg: "success",
      data: { credits: 5000, todayConsumed: 1332, totalConsumed: 400_000 },
    }),
  )

const userInfoHandler = (identity: string = ACCOUNT_ID) =>
  http.post(`${CONSOLE}${GRSAI_ENDPOINTS.userInfo}`, () =>
    HttpResponse.json({
      code: 0,
      msg: "success",
      data: { id: identity, mail: ACCOUNT_EMAIL, credits: 5000 },
    }),
  )

const browserSession = (overrides: Record<string, unknown> = {}) =>
  ({
    siteType: SITE_TYPES.GRSAI,
    userId: ACCOUNT_ID,
    user: { username: ACCOUNT_EMAIL },
    accessToken: RESYNCED_TOKEN,
    source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    ...overrides,
  }) as never

/** Builds the JWT shape the console stores, stamped with the given expiry. */
const sessionJwt = (expSeconds: number): string =>
  [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(JSON.stringify({ exp: expSeconds, iss: "session" })).toString(
      "base64url",
    ),
    "signature",
  ].join(".")

describe("grsai account data", () => {
  beforeEach(() => {
    server.resetHandlers()
    vi.resetAllMocks()
    configRequests = 0
    server.use(configHandler(true), dashboardHandler(), userInfoHandler())
  })

  it("normalizes credits into product quota units", async () => {
    const data = await fetchAccountData(request)

    // The deployment sells one US dollar for 66,600 credits; the product's
    // quota scale is 500,000 points per dollar.
    expect(data.quota).toBe(37_538)
    expect(data.today_quota_consumption).toBe(10_000)
  })

  it("classifies the metrics the deployment actually exposes", async () => {
    const data = await fetchAccountData(request)

    expect(data.todayStatsAvailability).toEqual({
      consumption: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
      requests: {
        status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
        reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
      },
      tokens: {
        status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
        reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
      },
      income: {
        status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
        reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
      },
    })
    expect(data.today_requests_count).toBe(0)
    expect(data.today_completion_tokens).toBe(0)
    // The deployment exposes no lifetime request or token series, and the
    // product renders whatever summary it is given, so none is reported.
    expect(data.usage).toBeUndefined()
  })

  it("skips today's consumption when the caller opts out", async () => {
    const data = await fetchAccountData({
      ...request,
      includeTodayCashflow: false,
    })

    expect(data.today_quota_consumption).toBe(0)
    expect(data.todayStatsAvailability?.consumption).toEqual({
      status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
      reason: ACCOUNT_TODAY_METRIC_REASONS.NotCollected,
    })
  })

  it("reports the freshly issued session token for persistence", async () => {
    const result = await refreshAccountData(request)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.authUpdate).toEqual({ accessToken: "rotated-token" })
      expect(result.healthStatus.status).toBe(SiteHealthStatus.Healthy)
    }
  })

  it("fails the refresh when the console no longer recognises the token", async () => {
    server.use(configHandler(false, "guest-token"))
    vi.mocked(resolveAccountBrowserSession).mockResolvedValueOnce(null)

    const result = await refreshAccountData(request)

    expect(result.success).toBe(false)
  })

  it("surfaces an unusable catalog payload instead of inventing models", async () => {
    server.use(
      http.post(`${CONSOLE}${GRSAI_ENDPOINTS.modelList}`, () =>
        HttpResponse.json({ code: 0, msg: "success", data: { list: null } }),
      ),
    )

    await expect(fetchGrsaiModels(request)).rejects.toThrowError()
  })

  describe("session recovery", () => {
    it.each([undefined, "", "   "])(
      "refuses recovery without a saved account identity: %j",
      async (userId) => {
        vi.mocked(resolveAccountBrowserSession).mockResolvedValueOnce(
          browserSession() as never,
        )
        const result = await refreshAccountData({
          ...request,
          auth: { ...request.auth, userId },
        })
        expect(result.success).toBe(false)
        expect(result).not.toHaveProperty("authUpdate")
        expect(resolveAccountBrowserSession).not.toHaveBeenCalled()
      },
    )
    it("reports the original failure when browser session recovery throws", async () => {
      vi.mocked(resolveAccountBrowserSession).mockRejectedValueOnce(
        new Error("browser unavailable"),
      )
      const result = await refreshAccountData(request)
      expect(result.success).toBe(false)
      expect(result).not.toHaveProperty("authUpdate")
    })

    it("rejects a resolver result for another account even if its filter was bypassed", async () => {
      vi.mocked(resolveAccountBrowserSession).mockResolvedValueOnce(
        browserSession({ userId: "someone-else" }) as never,
      )
      const result = await refreshAccountData(request)
      expect(result.success).toBe(false)
      expect(result).not.toHaveProperty("authUpdate")
    })

    it("reports a network failure without attempting browser recovery", async () => {
      server.use(
        http.post(
          `${CONSOLE}${GRSAI_ENDPOINTS.config}`,
          () => new HttpResponse(null, { status: 503 }),
        ),
      )
      const result = await refreshAccountData(request)
      expect(result.success).toBe(false)
      expect(resolveAccountBrowserSession).not.toHaveBeenCalled()
    })
    beforeEach(() => {
      // Only the token the browser is holding still authenticates.
      server.use(
        liveTokenConfigHandler([RESYNCED_TOKEN]),
        dashboardHandler(),
        userInfoHandler(),
      )
    })

    it("replaces a dead session with the browser's session and persists it", async () => {
      vi.mocked(resolveAccountBrowserSession).mockResolvedValueOnce(
        browserSession() as never,
      )

      const result = await refreshAccountData(request)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.authUpdate).toEqual({
          accessToken: RESYNCED_TOKEN,
          userId: ACCOUNT_ID,
          username: ACCOUNT_EMAIL,
        })
        expect(result.data.quota).toBe(37_538)
      }
      expect(resolveAccountBrowserSession).toHaveBeenCalledWith(
        expect.objectContaining({ siteType: SITE_TYPES.GRSAI }),
      )
    })

    it("refuses a browser session belonging to another account", async () => {
      vi.mocked(resolveAccountBrowserSession).mockImplementationOnce(
        async (options) => {
          const foreign = browserSession({ userId: "someone-else" })
          return options.isUsableSession?.(foreign) ? foreign : null
        },
      )

      const result = await refreshAccountData(request)

      expect(result.success).toBe(false)
    })

    it("refuses a replacement the console attributes to another account", async () => {
      // The resolver vouches for the right id, but the console answers as a
      // different user: the stored credential must not be overwritten.
      vi.mocked(resolveAccountBrowserSession).mockResolvedValueOnce(
        browserSession() as never,
      )
      server.use(userInfoHandler("someone-else"))

      const result = await refreshAccountData(request)

      expect(result.success).toBe(false)
    })

    it("reports failure when the browser holds nothing usable", async () => {
      vi.mocked(resolveAccountBrowserSession).mockResolvedValueOnce(null)

      const result = await refreshAccountData(request)

      expect(result.success).toBe(false)
    })

    it("reports failure when the replacement does not authenticate either", async () => {
      vi.mocked(resolveAccountBrowserSession).mockResolvedValueOnce(
        browserSession() as never,
      )
      server.use(
        liveTokenConfigHandler([]),
        dashboardHandler(),
        userInfoHandler(),
      )

      const result = await refreshAccountData(request)

      expect(result.success).toBe(false)
    })

    it("recovers when the saved token is the user-info page's open-API token", async () => {
      // The console labels that token as an API credential, so pasting it is a
      // natural mistake. It can never authenticate, but the browser may still
      // hold the real console session, so recovery is attempted for it too.
      vi.mocked(resolveAccountBrowserSession).mockResolvedValueOnce(
        browserSession() as never,
      )

      const result = await refreshAccountData({
        ...request,
        auth: {
          ...request.auth,
          accessToken: "b59cb510dc1c4171898fc733bbb2d174",
        },
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.authUpdate).toMatchObject({
          accessToken: RESYNCED_TOKEN,
        })
      }
    })

    it("recognizes the user-info token without dispatching it", async () => {
      // With nothing usable in the browser the shape is rejected up front: the
      // token can never authenticate, so no doomed exchange is sent for it.
      vi.mocked(resolveAccountBrowserSession).mockResolvedValueOnce(null)
      configRequests = 0

      const result = await refreshAccountData({
        ...request,
        auth: {
          ...request.auth,
          accessToken: "b59cb510dc1c4171898fc733bbb2d174",
        },
      })

      expect(result.success).toBe(false)
      expect(configRequests).toBe(0)
    })

    it("distinguishes a token past its own expiry from one the console refused", async () => {
      // The refresh result only carries a generic health status, so the
      // diagnosis is asserted where it is raised.
      const errorMessageFor = async (expSeconds: number) => {
        const error = await fetchUserInfo({
          ...request,
          auth: { ...request.auth, accessToken: sessionJwt(expSeconds) },
        }).catch((caught: unknown) => caught)
        return (error as Error).message
      }

      const nowSeconds = Math.floor(Date.now() / 1000)
      const expired = await errorMessageFor(nowSeconds - 60)
      const refused = await errorMessageFor(nowSeconds + 60 * 60)

      // Both are refused by the console; the console's ~30-day session window
      // running out is a different thing for the user to act on.
      expect(expired).not.toBe(refused)
    })
  })
})
