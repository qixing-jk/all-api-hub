import { http, HttpResponse } from "msw"
import { expect, it } from "vitest"

import { fetchAccountData } from "~/services/apiService/nanogpt"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

it("retains exact USD and XNO separately and both token quota windows", async () => {
  server.use(
    http.post("https://api.nano-gpt.com/api/check-balance", () =>
      HttpResponse.json({
        usd_balance: "2.000000000000000017",
        nano_balance: "0.123456789123456789",
        nanoDepositAddress: "nano_fixture",
      }),
    ),
    http.get("https://api.nano-gpt.com/api/v1/usage", () =>
      HttpResponse.json({
        totals: {
          requests: 2,
          totalTokens: 4,
          costUsd: "0.000000000000000017",
        },
      }),
    ),
    http.get("https://api.nano-gpt.com/api/subscription/v1/usage", () =>
      HttpResponse.json({
        active: true,
        dailyInputTokens: { used: 3, remaining: 7, resetAt: 1900000000000 },
        weeklyInputTokens: { used: 8, remaining: 92, resetAt: 1900100000000 },
      }),
    ),
  )
  const result = await fetchAccountData({
    directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
    baseUrl: "https://nano-gpt.com",
    accountId: "nano-test",
    auth: { authType: AuthTypeEnum.AccessToken, accessToken: "sk-fixture" },
    checkIn: buildCheckInConfig(),
  })
  expect(result).not.toHaveProperty("quota")
  expect(result).not.toHaveProperty("nativeBalance")
  expect(result.balance?.positions).toEqual([
    expect.objectContaining({
      asset: { kind: "currency", code: "USD" },
      amount: expect.objectContaining({
        status: "known",
        value: "2.000000000000000017",
      }),
    }),
    expect.objectContaining({
      asset: { kind: "crypto", id: "XNO" },
      amount: expect.objectContaining({
        status: "known",
        value: "0.123456789123456789",
      }),
    }),
  ])
  expect(result.allowances?.entries.map((entry) => entry.constraint)).toEqual([
    expect.objectContaining({
      remaining: expect.objectContaining({ value: "7" }),
      window: expect.objectContaining({ period: "day" }),
    }),
    expect.objectContaining({
      remaining: expect.objectContaining({ value: "92" }),
      window: expect.objectContaining({ period: "week" }),
    }),
  ])
  expect(result.usage?.cost).toMatchObject({
    asset: { kind: "currency", code: "USD" },
    amount: { value: "0.000000000000000017" },
  })
})

it("preserves balances when the independent usage read fails", async () => {
  server.use(
    http.post("https://api.nano-gpt.com/api/check-balance", () =>
      HttpResponse.json({
        usd_balance: "2",
        nano_balance: "0.1",
        nanoDepositAddress: "nano_fixture",
      }),
    ),
    http.get(
      "https://api.nano-gpt.com/api/v1/usage",
      () => new HttpResponse(null, { status: 503 }),
    ),
    http.get("https://api.nano-gpt.com/api/subscription/v1/usage", () =>
      HttpResponse.json({ active: false }),
    ),
  )
  const result = await fetchAccountData({
    directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
    baseUrl: "https://nano-gpt.com",
    auth: { authType: AuthTypeEnum.AccessToken, accessToken: "sk-fixture" },
    checkIn: buildCheckInConfig(),
  })
  expect(result.balance?.positions[0]?.amount).toMatchObject({
    status: "known",
    value: "2",
  })
  expect(result.usage?.cost?.amount.status).toBe("unavailable")
})
