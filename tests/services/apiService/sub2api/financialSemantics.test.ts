import { http, HttpResponse } from "msw"
import { expect, it } from "vitest"

import { ACCOUNT_USAGE_SCOPES } from "~/constants/accountUsage"
import { fetchAccountData } from "~/services/apiService/sub2api/account/accountData"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

it("preserves signed exact Sub2API USD and its split reporting origin", async () => {
  server.use(
    http.get("https://api.ai-router.dev/api/v1/auth/me", () =>
      HttpResponse.json({
        code: 0,
        message: "ok",
        data: { id: 1, username: "fixture", balance: "-2.0000000000000001" },
      }),
    ),
  )
  const result = await fetchAccountData({
    directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
    baseUrl: "https://ai-router.dev",
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
    amount: { status: "known", value: "-2.0000000000000001" },
    scope: { authority: "https://api.ai-router.dev" },
  })
})

it("retains Sub2API server-period USD usage without inventing a local day", async () => {
  server.use(
    http.get("https://sub.example.invalid/api/v1/auth/me", () =>
      HttpResponse.json({
        code: 0,
        message: "ok",
        data: { id: 1, balance: 3 },
      }),
    ),
    http.get("https://sub.example.invalid/api/v1/usage/stats", () =>
      HttpResponse.json({
        code: 0,
        message: "ok",
        data: {
          total_actual_cost: "0.000000000000000017",
          total_requests: 2,
          total_input_tokens: 3,
          total_output_tokens: 4,
        },
      }),
    ),
  )
  const result = await fetchAccountData({
    directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
    baseUrl: "https://sub.example.invalid",
    auth: {
      authType: AuthTypeEnum.AccessToken,
      userId: "1",
      accessToken: "fixture",
    },
    checkIn: buildCheckInConfig(),
  })
  expect(result.usage).toMatchObject({
    scope: ACCOUNT_USAGE_SCOPES.SiteToday,
    totalRequests: 2,
    totalTokens: 7,
    cost: {
      asset: { kind: "currency", code: "USD" },
      amount: { status: "known", value: "0.000000000000000017" },
    },
  })
  expect(result.usage?.cost).not.toHaveProperty("window")
  expect(result.todayStatsAvailability?.consumption).toMatchObject({
    status: "unavailable",
    reason: "wrong_period",
  })
})
