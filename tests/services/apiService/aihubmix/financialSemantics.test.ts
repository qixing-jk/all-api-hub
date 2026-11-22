import { http, HttpResponse } from "msw"
import { expect, it } from "vitest"

import { ACCOUNT_USAGE_SCOPES } from "~/constants/accountUsage"
import { fetchAccountData } from "~/services/apiService/aihubmix"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

it("preserves AIHubMix native USD precision and the actual reporting origin", async () => {
  server.use(
    http.get("https://aihubmix.com/api/user/self", () =>
      HttpResponse.json({ success: true, data: { quota: "1234567" } }),
    ),
  )
  const result = await fetchAccountData({
    directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
    baseUrl: "https://console.aihubmix.com",
    accountId: "aihubmix-1",
    auth: { authType: AuthTypeEnum.AccessToken, accessToken: "fixture" },
    checkIn: buildCheckInConfig(),
  })
  expect(result).not.toHaveProperty("quota")
  expect(result.balance?.positions[0]).toMatchObject({
    asset: { kind: "currency", code: "USD" },
    amount: { status: "known", value: "2.469134" },
    scope: { authority: "https://aihubmix.com" },
  })
})

it("retains cumulative AIHubMix usage independently of today's unavailable counters", async () => {
  server.use(
    http.get("https://aihubmix.com/api/user/self", () =>
      HttpResponse.json({
        success: true,
        data: { quota: 500000, used_quota: "1234567.000000001" },
      }),
    ),
  )
  const result = await fetchAccountData({
    directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
    baseUrl: "https://aihubmix.com",
    auth: { authType: AuthTypeEnum.AccessToken, accessToken: "fixture" },
    checkIn: buildCheckInConfig(),
  })
  expect(result.usage).toMatchObject({
    scope: ACCOUNT_USAGE_SCOPES.Lifetime,
    cost: {
      asset: { kind: "currency", code: "USD" },
      amount: { status: "known", value: "2.469134000000002" },
    },
  })
  expect(result.today_quota_consumption).toBe(0)
})

it.each([true, false])(
  "isolates bounded normalization overflow from independent wallet and usage fields (%s)",
  async (overflowBalance) => {
    const tiny = "0." + "0".repeat(252) + "1"
    const origin = "https://aihubmix.com"
    server.use(
      http.get(`${origin}/api/user/self`, () =>
        HttpResponse.json({
          success: true,
          data: {
            quota: overflowBalance ? tiny : 500000,
            used_quota: overflowBalance ? 500000 : tiny,
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
