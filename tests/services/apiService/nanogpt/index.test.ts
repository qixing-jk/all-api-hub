import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it } from "vitest"

import { QUOTA_PER_USD } from "~/constants/money"
import {
  fetchAccountData,
  fetchNanoGptBalance,
  fetchNanoGptSubscription,
  fetchNanoGptUsage,
  fetchUserInfo,
} from "~/services/apiService/nanogpt"
import {
  parseNanoGptBalance,
  parseNanoGptSubscription,
  parseNanoGptUsageAggregate,
} from "~/services/apiService/nanogpt/parsing"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

const API_ORIGIN = "https://api.nano-gpt.com"
const CONSOLE_ORIGIN = "https://nano-gpt.com"
const DEPOSIT_ADDRESS = "nano_fixture_deposit_address"

const tokenRequest = {
  baseUrl: CONSOLE_ORIGIN,
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "sk-nano-fixture",
  },
}

const balanceBody = {
  usd_balance: "129.46956147",
  nano_balance: "26.71801147",
  nanoDepositAddress: DEPOSIT_ADDRESS,
}

beforeEach(() => server.resetHandlers())

it.each([
  [true, "active"],
  [true, "grace"],
  [false, "grace"],
  [false, "inactive"],
] as const)(
  "preserves subscription lifecycle %s %s without inventing quota",
  async (active, state) => {
    server.use(
      http.post(`${API_ORIGIN}/api/check-balance`, () =>
        HttpResponse.json(balanceBody),
      ),
      http.get(`${API_ORIGIN}/api/v1/usage`, () =>
        HttpResponse.json({
          totals: { requests: 0, totalTokens: 0, costUsd: 0 },
        }),
      ),
      http.get(`${API_ORIGIN}/api/subscription/v1/usage`, () =>
        HttpResponse.json({
          active,
          state,
          dailyInputTokens: null,
          weeklyInputTokens: null,
        }),
      ),
    )
    const data = await fetchAccountData({
      ...tokenRequest,
      checkIn: buildCheckInConfig(),
    })
    expect(data.subscription).toMatchObject({ isActive: active, status: state })
    expect(data.subscription?.remainingTokens).toBeUndefined()
  },
)

it.each(["2.5", "0", undefined, "invalid"])(
  "keeps USD separate from optional XNO %s",
  async (nanoBalance) => {
    server.use(
      http.post(`${API_ORIGIN}/api/check-balance`, () =>
        HttpResponse.json({
          ...balanceBody,
          usd_balance: "0",
          nano_balance: nanoBalance,
        }),
      ),
      http.get(`${API_ORIGIN}/api/v1/usage`, () =>
        HttpResponse.json({
          totals: { requests: 0, totalTokens: 0, costUsd: 0 },
        }),
      ),
      http.get(`${API_ORIGIN}/api/subscription/v1/usage`, () =>
        HttpResponse.json({ active: false }),
      ),
    )
    const data = await fetchAccountData({
      ...tokenRequest,
      checkIn: buildCheckInConfig(),
    })
    expect(data.quota).toBe(0)
    if (nanoBalance === "2.5" || nanoBalance === "0") {
      expect(data.nativeBalance).toEqual({
        unit: "USD_XNO",
        total: 0,
        nanoBalance: nanoBalance === "2.5" ? 2.5 : 0,
      })
    } else {
      expect(data.nativeBalance).toBeUndefined()
    }
  },
)

describe("NanoGPT response parsing", () => {
  it("reads documented string amounts and the deposit address", () => {
    expect(parseNanoGptBalance(balanceBody, "endpoint")).toEqual({
      usdBalance: 129.46956147,
      nanoBalance: 26.71801147,
      depositAddress: DEPOSIT_ADDRESS,
    })
  })

  it("rejects a missing amount instead of inventing zero", () => {
    expect(() =>
      parseNanoGptBalance({ nanoDepositAddress: DEPOSIT_ADDRESS }, "endpoint"),
    ).toThrow(/Invalid NanoGPT response/)
    expect(() =>
      parseNanoGptBalance({ usd_balance: "n/a" }, "endpoint"),
    ).toThrow(/Invalid NanoGPT response/)
  })

  it("requires the deposit address that identity checks compare", () => {
    expect(() => parseNanoGptBalance({ usd_balance: "1" }, "endpoint")).toThrow(
      /Invalid NanoGPT response/,
    )
  })

  it("prefers net cost and falls back to the gross charge", () => {
    expect(
      parseNanoGptUsageAggregate(
        {
          totals: {
            requests: 3,
            totalTokens: 100,
            costUsd: 0.5,
            netCostUsd: 0.25,
          },
        },
        "endpoint",
      ),
    ).toEqual({ requests: 3, totalTokens: 100, costUsd: 0.25 })
    expect(
      parseNanoGptUsageAggregate(
        { totals: { requests: 3, totalTokens: 100, costUsd: 0.5 } },
        "endpoint",
      ),
    ).toEqual({ requests: 3, totalTokens: 100, costUsd: 0.5 })
  })

  it("keeps null subscription counters unknown rather than full", () => {
    expect(
      parseNanoGptSubscription(
        {
          active: true,
          state: "active",
          dailyInputTokens: { used: null, remaining: null, resetAt: null },
        },
        "endpoint",
      ),
    ).toEqual({ active: true, state: "active" })
  })

  it("keeps the weekly quota even when the daily one is unconfigured", () => {
    // Live contract (probe-20): the weekly window is always present and the
    // daily one may be null, so dropping weekly would report no allowance.
    expect(
      parseNanoGptSubscription(
        {
          active: true,
          limits: { weeklyInputTokens: 60_000_000, dailyInputTokens: null },
          dailyInputTokens: null,
          weeklyInputTokens: {
            used: 0,
            remaining: 60_000_000,
            percentUsed: 0,
            resetAt: 1_792_972_800_000,
          },
        },
        "endpoint",
      ),
    ).toEqual({
      active: true,
      weeklyInputTokens: {
        used: 0,
        remaining: 60_000_000,
        resetAt: "2026-10-26T00:00:00.000Z",
      },
    })
  })

  it("projects quota reset instants and drops unusable ones", () => {
    expect(
      parseNanoGptSubscription(
        {
          active: true,
          dailyInputTokens: {
            used: 100,
            remaining: 900,
            resetAt: 1_790_000_000_000,
          },
        },
        "endpoint",
      ).dailyInputTokens,
    ).toEqual({
      used: 100,
      remaining: 900,
      resetAt: "2026-09-21T14:13:20.000Z",
    })
    expect(
      parseNanoGptSubscription(
        {
          active: true,
          dailyInputTokens: { used: 100, remaining: 900, resetAt: 0 },
        },
        "endpoint",
      ).dailyInputTokens,
    ).toEqual({ used: 100, remaining: 900 })
  })
})

describe("NanoGPT account reads", () => {
  it("requires an inference key rather than the console session", async () => {
    await expect(
      fetchUserInfo({
        baseUrl: CONSOLE_ORIGIN,
        auth: { authType: AuthTypeEnum.Cookie },
      }),
    ).rejects.toMatchObject({ code: "FEATURE_UNSUPPORTED" })
  })

  it("sends the key to the direct API host and verifies the saved identity", async () => {
    let seenAuthorization: string | null = null
    let seenUrl = ""
    server.use(
      http.post(`${API_ORIGIN}/api/check-balance`, ({ request }) => {
        seenAuthorization = request.headers.get("Authorization")
        seenUrl = request.url
        return HttpResponse.json(balanceBody)
      }),
    )

    await expect(
      fetchUserInfo({ ...tokenRequest, auth: { ...tokenRequest.auth } }),
    ).resolves.toMatchObject({ id: DEPOSIT_ADDRESS })
    expect(seenUrl).toBe(`${API_ORIGIN}/api/check-balance`)
    expect(seenAuthorization).toBe("Bearer sk-nano-fixture")

    await expect(
      fetchUserInfo({
        ...tokenRequest,
        auth: { ...tokenRequest.auth, userId: DEPOSIT_ADDRESS },
      }),
    ).resolves.toMatchObject({ id: DEPOSIT_ADDRESS })

    await expect(
      fetchUserInfo({
        ...tokenRequest,
        auth: { ...tokenRequest.auth, userId: "nano_other_account" },
      }),
    ).rejects.toMatchObject({ code: "ACCOUNT_IDENTITY_MISMATCH" })
  })

  it("surfaces the provider's error envelope for a rejected key", async () => {
    server.use(
      http.post(`${API_ORIGIN}/api/check-balance`, () =>
        HttpResponse.json(
          {
            error: {
              code: "invalid_api_key",
              message: "Invalid API key",
              request_id: "req-1",
            },
          },
          { status: 401 },
        ),
      ),
    )

    await expect(fetchNanoGptBalance(tokenRequest)).rejects.toMatchObject({
      statusCode: 401,
      code: "HTTP_401",
      upstreamCode: "invalid_api_key",
      message: "Invalid API key",
    })
  })

  it("maps the key-scoped aggregate into a rolling-window summary", async () => {
    server.use(
      http.get(`${API_ORIGIN}/api/v1/usage`, () =>
        HttpResponse.json({
          object: "usage",
          totals: {
            requests: 1284,
            costUsd: 42.18,
            refundedUsd: 1.25,
            netCostUsd: 40.93,
            totalTokens: 1_691_356,
          },
        }),
      ),
    )

    await expect(fetchNanoGptUsage(tokenRequest)).resolves.toEqual({
      requests: 1284,
      totalTokens: 1_691_356,
      costUsd: 40.93,
    })
  })

  it("reads subscription quotas with the same key", async () => {
    server.use(
      http.get(`${API_ORIGIN}/api/subscription/v1/usage`, () =>
        HttpResponse.json({
          active: true,
          state: "active",
          dailyInputTokens: {
            used: 1000,
            remaining: 9000,
            resetAt: 1_790_000_000_000,
          },
        }),
      ),
    )

    await expect(fetchNanoGptSubscription(tokenRequest)).resolves.toMatchObject(
      {
        active: true,
        dailyInputTokens: { remaining: 9000 },
      },
    )
  })

  it("builds account data from balance, usage and an active subscription", async () => {
    server.use(
      http.post(`${API_ORIGIN}/api/check-balance`, () =>
        HttpResponse.json(balanceBody),
      ),
      http.get(`${API_ORIGIN}/api/v1/usage`, () =>
        HttpResponse.json({
          object: "usage",
          totals: { requests: 4, totalTokens: 2048, netCostUsd: 0.5 },
        }),
      ),
      http.get(`${API_ORIGIN}/api/subscription/v1/usage`, () =>
        HttpResponse.json({
          active: true,
          dailyInputTokens: {
            used: 10,
            remaining: 90,
            resetAt: 1_790_000_000_000,
          },
        }),
      ),
    )

    const data = await fetchAccountData({
      ...tokenRequest,
      checkIn: buildCheckInConfig(),
    })

    expect(data.quota).toBe(Math.round(129.46956147 * QUOTA_PER_USD))
    expect(data.usage).toEqual({
      scope: "rolling_window",
      totalRequests: 4,
      totalTokens: 2048,
      totalCost: 0.5,
    })
    expect(data.subscription).toEqual({
      isActive: true,
      status: "active",
      billingType: "tokens",
      remainingTokens: 90,
      period: "day",
      periodResetTime: "2026-09-21T14:13:20.000Z",
    })
    expect(data.todayStatsAvailability).toMatchObject({
      consumption: { status: "unavailable", reason: "unsupported" },
      income: { status: "unavailable", reason: "unsupported" },
    })
  })

  it("keeps balance and usage when the subscription read fails", async () => {
    server.use(
      http.post(`${API_ORIGIN}/api/check-balance`, () =>
        HttpResponse.json(balanceBody),
      ),
      http.get(`${API_ORIGIN}/api/v1/usage`, () =>
        HttpResponse.json({
          object: "usage",
          totals: { requests: 1, totalTokens: 10, costUsd: 0.01 },
        }),
      ),
      http.get(`${API_ORIGIN}/api/subscription/v1/usage`, () =>
        HttpResponse.json(
          { error: { message: "boom", type: "internal" } },
          { status: 500 },
        ),
      ),
    )

    const data = await fetchAccountData({
      ...tokenRequest,
      checkIn: buildCheckInConfig(),
    })

    expect(data.quota).toBeGreaterThan(0)
    expect(data.nativeBalance).toMatchObject({
      unit: "USD_XNO",
      total: 129.46956147,
      nanoBalance: 26.71801147,
    })
    expect(data.subscription).toEqual({ status: "unavailable" })
  })

  it("reports a weekly-only active allowance instead of no allowance", async () => {
    server.use(
      http.post(`${API_ORIGIN}/api/check-balance`, () =>
        HttpResponse.json(balanceBody),
      ),
      http.get(`${API_ORIGIN}/api/v1/usage`, () =>
        HttpResponse.json({
          object: "usage",
          totals: { requests: 1, totalTokens: 10, costUsd: 0 },
        }),
      ),
      http.get(`${API_ORIGIN}/api/subscription/v1/usage`, () =>
        HttpResponse.json({
          active: true,
          state: "active",
          dailyInputTokens: null,
          weeklyInputTokens: {
            used: 1000,
            remaining: 59_999_000,
            resetAt: 1_792_972_800_000,
          },
        }),
      ),
    )

    const data = await fetchAccountData({
      ...tokenRequest,
      checkIn: buildCheckInConfig(),
    })

    expect(data.subscription).toEqual({
      isActive: true,
      status: "active",
      billingType: "tokens",
      remainingTokens: 59_999_000,
      period: "week",
      periodResetTime: "2026-10-26T00:00:00.000Z",
    })
  })

  it("does not turn an inactive subscription into a full allowance", async () => {
    server.use(
      http.post(`${API_ORIGIN}/api/check-balance`, () =>
        HttpResponse.json(balanceBody),
      ),
      http.get(`${API_ORIGIN}/api/v1/usage`, () =>
        HttpResponse.json({
          object: "usage",
          totals: { requests: 1, totalTokens: 10, costUsd: 0 },
        }),
      ),
      http.get(`${API_ORIGIN}/api/subscription/v1/usage`, () =>
        HttpResponse.json({ active: false, state: "inactive" }),
      ),
    )

    const data = await fetchAccountData({
      ...tokenRequest,
      checkIn: buildCheckInConfig(),
    })

    expect(data.subscription).toEqual({ isActive: false, status: "inactive" })
  })
})

describe("NanoGPT transport", () => {
  it("never sends browser cookies with the saved key", async () => {
    let credentials: RequestCredentials | undefined
    let authorization: string | null = null
    server.use(
      http.post(`${API_ORIGIN}/api/check-balance`, ({ request }) => {
        credentials = request.credentials
        authorization = request.headers.get("Authorization")
        return HttpResponse.json(balanceBody)
      }),
    )

    await fetchNanoGptBalance(tokenRequest)

    // The key is the only credential; an ambient cookie session must never be
    // attached to an inference request.
    expect(credentials).toBe("omit")
    expect(authorization).toBe("Bearer sk-nano-fixture")
  })
})

it("treats an empty form identity as unspecified, not as a different account", async () => {
  server.use(
    http.post(`${API_ORIGIN}/api/check-balance`, () =>
      HttpResponse.json(balanceBody),
    ),
  )
  await expect(
    fetchNanoGptBalance({
      ...tokenRequest,
      auth: { ...tokenRequest.auth, userId: "" },
    }),
  ).resolves.toMatchObject({ depositAddress: DEPOSIT_ADDRESS })
})

it("refreshes management-only subscription without presenting unavailable cash as zero", async () => {
  server.use(
    http.get(`${CONSOLE_ORIGIN}/api/management/v1/subscription/usage`, () =>
      HttpResponse.json({
        active: true,
        dailyInputTokens: { used: 1, remaining: 500, resetAt: 1893456000000 },
      }),
    ),
  )
  const data = await fetchAccountData({
    ...tokenRequest,
    auth: { ...tokenRequest.auth, accessToken: "sk-nano-mgmt-fixture" },
    checkIn: buildCheckInConfig(),
  })
  expect(data).toMatchObject({
    balanceUnavailable: true,
    subscription: { isActive: true, status: "active", remainingTokens: 500 },
  })
  expect(data.usage).toBeUndefined()
})
