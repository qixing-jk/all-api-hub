import { describe, expect, it } from "vitest"

import {
  mapCustomJson,
  mapTodayTokenUsage,
  parseDeepSeekBalance,
  parseGlmQuota,
  parseKimiQuota,
  parseOpenAiBillingUsage,
  parseOpenCodeGoUsage,
} from "~/services/apiCredentialProfiles/telemetry/parsers"

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
      availability: true,
      balanceCoverage: "partial",
      balances: [
        {
          amount: "12.5",
          currency: "USD",
          grantedAmount: "2",
          toppedUpAmount: "10.5",
          isAvailable: true,
        },
        { amount: undefined, currency: "USD", isAvailable: true },
      ],
    })
  })

  it("preserves unknown currencies and does not invent a wallet for empty balance responses", () => {
    expect(
      parseDeepSeekBalance({
        is_available: false,
        balance_infos: [{ total_balance: "3.5" }],
      }),
    ).toEqual({
      availability: false,
      balanceCoverage: "partial",
      balances: [
        expect.objectContaining({
          amount: "3.5",
          currency: "",
          isAvailable: false,
        }),
      ],
    })
    expect(
      parseDeepSeekBalance({ is_available: true, balance_infos: [] }),
    ).toEqual({
      availability: true,
      balances: [],
      balanceCoverage: "complete",
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

  it("keeps the total and percentage unknown when only remaining capacity is reported", () => {
    const result = parseKimiQuota({
      usage: {
        limit: undefined,
        used: undefined,
        remaining: 7500,
        resetTime: "2026-04-19T00:00:00.000Z",
      },
    })

    expect(result.quota?.windows).toEqual([
      expect.objectContaining({
        type: "weekly",
        remaining: 7500,
      }),
    ])
    expect(result.quota?.windows[0]).not.toHaveProperty("limit")
    expect(result.quota?.windows[0]).not.toHaveProperty("used")
    expect(result.quota?.windows[0]).not.toHaveProperty("percentRemaining")
  })

  it("adopts slot types when GLM fallback windows fill five-hour and weekly", () => {
    const result = parseGlmQuota({
      success: true,
      data: {
        limits: [
          {
            type: "TOKENS_LIMIT",
            unit: 9,
            number: 1,
            usage: 100,
            currentValue: 10,
            remaining: 90,
          },
          {
            type: "TOKENS_LIMIT",
            unit: 9,
            number: 2,
            usage: 200,
            currentValue: 50,
            remaining: 150,
          },
        ],
      },
    })

    expect(result.quota?.windows).toEqual([
      expect.objectContaining({ type: "fiveHour", remaining: 90 }),
      expect.objectContaining({ type: "weekly", remaining: 150 }),
    ])
  })

  it("ignores malformed GLM rows and preserves monthly percentage windows", () => {
    expect(parseGlmQuota({ success: false, data: {} })).toEqual({})
    expect(parseGlmQuota({ success: true, data: { limits: {} } })).toEqual({})
    expect(
      parseGlmQuota({
        success: true,
        data: {
          level: " pro ",
          limits: [
            { type: "UNKNOWN_LIMIT", usage: 10 },
            { type: "TOKENS_LIMIT" },
            {
              type: "TIME_LIMIT",
              percentage: 25,
              nextResetTime: 1_800_000_000,
            },
          ],
        },
      }),
    ).toEqual({
      quota: {
        membershipLevel: "pro",
        windows: [
          expect.objectContaining({
            type: "monthly",
            unit: "percent",
            percentRemaining: 75,
            resetTime: 1_800_000_000_000,
          }),
        ],
      },
    })
  })

  it("preserves provider-valued GLM monthly windows", () => {
    expect(
      parseGlmQuota({
        success: true,
        data: {
          limits: [
            {
              type: "TIME_LIMIT",
              usage: 20,
              currentValue: 5,
              remaining: 15,
            },
          ],
        },
      }).quota?.windows,
    ).toEqual([
      expect.objectContaining({
        type: "monthly",
        unit: "provider",
        percentRemaining: 75,
      }),
    ])
  })

  it("does not expose a huge OpenAI-compatible hard limit as spendable balance", () => {
    expect(
      parseOpenAiBillingUsage(
        { hard_limit_usd: 1_000_000_000 },
        { total_usage: 1234 },
      ),
    ).toEqual({
      budget: { asset: { kind: "currency", code: "USD" }, used: "12.34" },
    })
  })

  it("prefers explicit OpenAI balance and derives ordinary subscription balance", () => {
    expect(parseOpenAiBillingUsage({ balance: 4.25 }, {})).toEqual({
      balance: { amount: "4.25", currency: "USD" },
    })
    expect(
      parseOpenAiBillingUsage({ hard_limit_usd: 20 }, { used_usd: 7.5 }),
    ).toEqual({
      budget: {
        asset: { kind: "currency", code: "USD" },
        limit: "20",
        used: "7.5",
        remaining: "12.5",
        remainingDerived: true,
      },
    })
  })

  it("drops Kimi responses without usable quota or booster balance", () => {
    expect(
      parseKimiQuota({ usage: {}, boosterWallet: { status: "VALID" } }),
    ).toEqual({})
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
      balanceUsd: "0",
      todayTokens: { upload: 0, download: 4 },
    })
  })

  it("maps every configured custom value and leaves invalid paths undefined", () => {
    expect(
      mapCustomJson(
        {
          values: {
            cost: "1.5",
            requests: 3,
            used: 4,
            granted: 10,
            available: 6,
            expires: 1_800_000_000,
          },
        },
        {
          balanceUsd: "missing.balance",
          todayCostUsd: "values.cost",
          todayRequests: "values.requests",
          totalUsedUsd: "values.used",
          totalGrantedUsd: "values.granted",
          totalAvailableUsd: "values.available",
          expiresAt: "values.expires",
        },
      ),
    ).toEqual({
      balanceUsd: undefined,
      todayCostUsd: "1.5",
      todayRequests: 3,
      totalUsedUsd: "4",
      totalGrantedUsd: "10",
      totalAvailableUsd: "6",
      expiresAt: 1_800_000_000_000,
    })
  })

  it("maps a custom total token path without relabeling it as upload", () => {
    expect(
      mapCustomJson(
        { usage: { total: 12 } },
        { todayTotalTokens: "usage.total" },
      ),
    ).toEqual({ todayTokens: { total: 12 } })
  })

  it("preserves a provider total when split token counters are unavailable", () => {
    expect(mapTodayTokenUsage({ total: 12 })).toEqual({ total: 12 })
  })
})
