import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { QUOTA_PER_USD } from "~/constants/money"
import {
  fetchAccountData,
  fetchInviteLink,
} from "~/services/apiService/cubence"
import { fetchUserInfo } from "~/services/apiService/cubence/identity"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"

import { createCheckInConfig } from "../../apiAdapters/checkInFixtures"

const origin = "https://cubence.com"
const request = {
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
    await expect(fetchUserInfo(request)).resolves.toMatchObject({
      id: "7",
      username: "example",
      access_token: null,
    })
    await expect(fetchAccountData(accountRequest)).resolves.toMatchObject({
      quota: 12.5 * QUOTA_PER_USD,
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

  it.each([null, "12", NaN])(
    "rejects malformed balance %s instead of inventing zero",
    async (normal_balance) => {
      server.use(
        http.get(`${origin}/api/v1/auth/me`, () =>
          HttpResponse.json({ user: { ...user, normal_balance } }),
        ),
      )
      await expect(fetchAccountData(accountRequest)).rejects.toMatchObject({
        code: "JSON_PARSE_ERROR",
      })
    },
  )

  it("allows negative purchased balance", async () => {
    server.use(
      http.get(`${origin}/api/v1/auth/me`, () =>
        HttpResponse.json({ user: { ...user, normal_balance: -1000000 } }),
      ),
    )
    expect((await fetchAccountData(accountRequest)).quota).toBe(-QUOTA_PER_USD)
  })

  it("keeps balance when today usage fails and does not report a complete zero", async () => {
    server.use(
      http.get(`${origin}/api/v1/analytics/apikeys/hourly-usage`, () =>
        HttpResponse.json({ error: "unavailable" }, { status: 503 }),
      ),
    )
    await expect(fetchAccountData(accountRequest)).resolves.toMatchObject({
      quota: 12.5 * QUOTA_PER_USD,
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
