import { http, HttpResponse } from "msw"
import { expect, it } from "vitest"

import { ACCOUNT_USAGE_SCOPES } from "~/constants/accountUsage"
import { fetchAccountData } from "~/services/apiService/pmapi"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

it("keeps PM-API's observed quota divisor exact without producing a legacy balance", async () => {
  server.use(
    http.get("https://pm.example.invalid/api/me", () =>
      HttpResponse.json({
        success: true,
        data: { id: 1, username: "fixture", quota: "-1234567" },
      }),
    ),
  )
  const result = await fetchAccountData({
    directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
    baseUrl: "https://pm.example.invalid",
    accountId: "pm-1",
    auth: {
      authType: AuthTypeEnum.AccessToken,
      userId: "1",
      accessToken: "fixture",
    },
    checkIn: buildCheckInConfig(),
    includeTodayCashflow: false,
  })
  expect(result).not.toHaveProperty("quota")
  expect(result.balance?.positions[0]).toMatchObject({
    asset: { kind: "currency", code: "USD" },
    amount: { status: "known", value: "-2.469134" },
    scope: { authority: "https://pm.example.invalid" },
  })
})

it("keeps PM-API's server-day usage qualified as an unknown interval", async () => {
  server.use(
    http.get("https://pm.example.invalid/api/me", () =>
      HttpResponse.json({
        success: true,
        data: { id: 1, username: "fixture", quota: 123 },
      }),
    ),
    http.get("https://pm.example.invalid/api/me/stats", () =>
      HttpResponse.json({
        success: true,
        data: { today: { quota: 1_500_000, requests: 4, tokens: 10 } },
      }),
    ),
  )
  const result = await fetchAccountData({
    directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
    baseUrl: "https://pm.example.invalid",
    auth: {
      authType: AuthTypeEnum.AccessToken,
      userId: "1",
      accessToken: "fixture",
    },
    checkIn: buildCheckInConfig(),
  })
  expect(result.usage).toMatchObject({
    scope: ACCOUNT_USAGE_SCOPES.SiteToday,
    totalRequests: 4,
    cost: {
      asset: { kind: "currency", code: "USD" },
      amount: { status: "known", value: "3" },
    },
  })
  expect(result.usage?.cost).not.toHaveProperty("window")
  expect(result.todayStatsAvailability?.consumption).toMatchObject({
    status: "unavailable",
    reason: "wrong_period",
  })
})

it.each([true, false])(
  "isolates bounded normalization overflow from independent wallet and usage fields (%s)",
  async (overflowBalance) => {
    const tiny = "0." + "0".repeat(252) + "1"
    const origin = "https://pm.example.invalid"
    server.use(
      http.get(`${origin}/api/me`, () =>
        HttpResponse.json({
          success: true,
          data: {
            id: 1,
            username: "fixture",
            quota: overflowBalance ? tiny : 500000,
          },
        }),
      ),
      http.get(`${origin}/api/me/stats`, () =>
        HttpResponse.json({
          success: true,
          data: {
            today: {
              quota: overflowBalance ? 500000 : tiny,
              requests: 4,
              tokens: 10,
            },
          },
        }),
      ),
    )
    const result = await fetchAccountData({
      directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
      baseUrl: origin,
      accountId: "bounded",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: "1",
        accessToken: "fixture",
      },
      checkIn: buildCheckInConfig(),
      includeTodayCashflow: true,
    })
    expect(result.balance?.positions[0]?.amount).toMatchObject(
      overflowBalance
        ? { status: "unavailable" }
        : { status: "known", value: "1" },
    )
    expect(result.usage?.cost?.amount).toMatchObject(
      overflowBalance
        ? { status: "known", value: "1" }
        : { status: "unavailable" },
    )
  },
)
