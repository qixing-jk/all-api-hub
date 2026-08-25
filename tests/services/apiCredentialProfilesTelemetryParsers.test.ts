import { describe, expect, it } from "vitest"

import {
  mapCustomJson,
  parseDeepSeekBalance,
  parseGlmQuota,
  parseOpenAiBillingUsage,
  parseOpenCodeGoUsage,
} from "~/services/apiCredentialProfiles/telemetryParsers"

describe("api credential telemetry parsers", () => {
  it("normalizes provider balances without inventing a balance for invalid rows", () => {
    expect(
      parseDeepSeekBalance({
        is_available: true,
        balance_infos: [
          {
            currency: "USD",
            total_balance: "12.5",
            granted_balance: "2",
            topped_up_balance: "10.5",
          },
          { currency: "USD", total_balance: "not-a-number" },
        ],
      }),
    ).toEqual({
      balances: [
        {
          amount: 12.5,
          currency: "USD",
          grantedAmount: 2,
          toppedUpAmount: 10.5,
          isAvailable: true,
        },
      ],
    })
  })

  it("maps GLM-style limits to remaining-capacity windows", () => {
    const result = parseGlmQuota({
      success: true,
      data: {
        limits: [
          {
            type: "TOKENS_LIMIT",
            unit: 3,
            number: 5,
            usage: 100,
            currentValue: 25,
          },
          {
            type: "CREDIT_LIMIT",
            unit: 6,
            usage: 200,
            currentValue: 50,
          },
        ],
      },
    })

    expect(result.quota?.windows).toEqual([
      expect.objectContaining({
        type: "fiveHour",
        used: 25,
        remaining: 75,
        percentRemaining: 75,
      }),
      expect.objectContaining({
        type: "weekly",
        used: 50,
        remaining: 150,
        percentRemaining: 75,
      }),
    ])
  })

  it("converts OpenCode used percentages into remaining percentages", () => {
    expect(
      parseOpenCodeGoUsage({
        usage: {
          rolling: { status: "ok", percent: 25 },
          weekly: { status: "ok", percent: 80 },
          monthly: { status: "paused", percent: 10 },
        },
      }),
    ).toEqual({
      quota: {
        windows: [
          expect.objectContaining({ type: "fiveHour", percentRemaining: 75 }),
          expect.objectContaining({ type: "weekly", percentRemaining: 20 }),
        ],
      },
    })
  })

  it("does not expose a huge OpenAI-compatible hard limit as spendable balance", () => {
    expect(
      parseOpenAiBillingUsage(
        { hard_limit_usd: 1_000_000_000 },
        { total_usage: 1234 },
      ),
    ).toEqual({ totalUsedUsd: 12.34 })
  })

  it("maps custom nested paths and preserves explicit zero token values", () => {
    expect(
      mapCustomJson(
        {
          account: { balance: 0 },
          usage: { prompt: 0, completion: 4 },
        },
        {
          balanceUsd: "account.balance",
          todayPromptTokens: "usage.prompt",
          todayCompletionTokens: "usage.completion",
        },
      ),
    ).toEqual({
      balanceUsd: 0,
      todayTokens: { upload: 0, download: 4 },
    })
  })
})
