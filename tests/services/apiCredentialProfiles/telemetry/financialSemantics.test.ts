import { describe, expect, it } from "vitest"

import { CURRENCIES } from "~/constants/money"
import {
  buildAllowanceSignals,
  getBalanceRunwayDays,
} from "~/features/ApiCredentialProfiles/allowance/apiCredentialAllowance"
import {
  ASSET_KINDS,
  FINANCIAL_COVERAGE,
} from "~/services/amounts/financialConstants"
import { coerceApiCredentialTelemetryCustomEndpoint } from "~/services/apiCredentialProfiles/telemetry/config"
import {
  normalizeTelemetryPatchToFacts,
  selectTelemetryBalances,
} from "~/services/apiCredentialProfiles/telemetry/facts"
import {
  mapCustomJson,
  parseDeepSeekBalance,
  parseKimiOpenPlatformBalance,
  parseKimiQuota,
  parseOpenAiBillingUsage,
} from "~/services/apiCredentialProfiles/telemetry/parsers"
import { coerceTelemetrySnapshot } from "~/services/apiCredentialProfiles/telemetry/snapshotCodec"
import {
  TELEMETRY_FINANCIAL_ROLES,
  TELEMETRY_FINANCIAL_SCOPES,
} from "~/types/apiCredentialProfiles"

describe("credential financial facts at the persistence and allowance boundary", () => {
  it("keeps the explicit XNO unit on custom usage observations through persistence", () => {
    const facts = normalizeTelemetryPatchToFacts(
      mapCustomJson(
        { cost: "0.125" },
        { todayCostUsd: "cost" },
        {
          asset: { kind: ASSET_KINDS.Crypto, id: "XNO" },
          role: TELEMETRY_FINANCIAL_ROLES.Available,
          scope: TELEMETRY_FINANCIAL_SCOPES.Unknown,
        },
      ),
      "customReadOnlyEndpoint",
      {
        profileId: "fixture",
        baseUrl: "https://fixture.example",
        observedAt: 1000,
      },
    )
    const restored = coerceTelemetrySnapshot({
      schemaVersion: 2,
      lastSyncTime: 1000,
      facts,
      attempts: [],
    })
    expect(restored?.facts?.usage?.todayCost).toMatchObject({
      value: "0.125",
      unit: { kind: "crypto", id: "XNO" },
    })
  })
  it("keeps documented wallet components as unavailable when a complete response omits their amounts", () => {
    const facts = normalizeTelemetryPatchToFacts(
      parseDeepSeekBalance({
        balance_infos: [
          {
            currency: CURRENCIES.USD,
            total_balance: "110",
            granted_balance: "invalid",
          },
        ],
      }),
      "deepSeekBalance",
      {
        profileId: "fixture",
        baseUrl: "https://fixture.example",
        observedAt: 1000,
      },
    )
    expect(facts.balanceSnapshot?.positions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          funding: "granted",
          amount: expect.objectContaining({ status: "unavailable" }),
        }),
        expect.objectContaining({
          funding: "purchased",
          amount: expect.objectContaining({ status: "unavailable" }),
        }),
      ]),
    )
    expect(facts.balanceSnapshot?.coverage).toBe("complete")
  })
  it("refuses malformed canonical facts instead of replacing them with empty or legacy data", () => {
    expect(() =>
      coerceTelemetrySnapshot({
        schemaVersion: 2,
        lastSyncTime: 1000,
        facts: 42,
        balanceUsd: 100,
      }),
    ).toThrow()
    expect(() =>
      coerceTelemetrySnapshot({
        schemaVersion: 999,
        lastSyncTime: 1000,
        facts: {},
      }),
    ).toThrow()
  })
  it("preserves negative and sub-unit Kimi Coding Plan booster balances with its own scale", () => {
    const facts = normalizeTelemetryPatchToFacts(
      parseKimiQuota({
        boosterWallet: {
          status: "STATUS_ENABLED",
          balance: { amountLeft: "-100000000.00000001" },
        },
      }),
      "kimiQuota",
      {
        profileId: "fixture",
        baseUrl: "https://fixture.example",
        observedAt: 1000,
      },
    )
    expect(facts.balanceSnapshot?.positions[0]?.amount).toMatchObject({
      value: "-1.0000000000000001",
      source: { adapter: "kimiQuota" },
    })
  })
  it("keeps components attached to their own source when retained collections use the same position IDs", () => {
    const context = {
      profileId: "same-profile",
      baseUrl: "https://gateway.example",
      observedAt: 1000,
    }
    const deepseek = normalizeTelemetryPatchToFacts(
      {
        balance: {
          amount: "110",
          currency: CURRENCIES.USD,
          grantedAmount: "10",
        },
      },
      "deepSeekBalance",
      context,
    ).balanceSnapshot!
    const billing = normalizeTelemetryPatchToFacts(
      { balance: { amount: "42", currency: CURRENCIES.USD } },
      "openaiBilling",
      context,
    ).balanceSnapshot!
    const balances = selectTelemetryBalances({
      balanceSnapshot: {
        ...billing,
        positions: [...billing.positions, ...deepseek.positions],
        coverage: FINANCIAL_COVERAGE.Partial,
      },
    })
    expect(
      balances.find(
        (balance) =>
          balance.position?.amount.source.adapter === "openaiBilling",
      )?.components,
    ).toEqual([])
    expect(
      balances.find(
        (balance) =>
          balance.position?.amount.source.adapter === "deepSeekBalance",
      )?.components,
    ).toHaveLength(2)
  })
  it("preserves explicit custom mapping asset, budget role and scope without treating old USD-named paths as proof", () => {
    const config = coerceApiCredentialTelemetryCustomEndpoint({
      endpoint: "/usage",
      jsonPaths: { balanceUsd: "left" },
      financialMapping: {
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
        role: "budget-remaining",
        scope: "credential",
      },
    })!
    const facts = normalizeTelemetryPatchToFacts(
      mapCustomJson(
        { left: "12.00000000000000001" },
        config.jsonPaths,
        config.financialMapping,
      ),
      "customReadOnlyEndpoint",
      {
        profileId: "custom",
        baseUrl: "https://custom.example",
        observedAt: 123,
      },
    )
    expect(facts.budgets?.[0]).toMatchObject({
      asset: { kind: "currency", code: "CNY" },
      remaining: { value: "12.00000000000000001", source: { kind: "manual" } },
      scope: { keys: { kind: "restricted", ids: ["custom"] } },
    })
    const legacy = normalizeTelemetryPatchToFacts(
      mapCustomJson({ left: 12 }, { balanceUsd: "left" }),
      "customReadOnlyEndpoint",
      {
        profileId: "fixture",
        baseUrl: "https://fixture.example",
        observedAt: 1000,
      },
    )
    expect(legacy.balanceSnapshot?.positions[0]).toMatchObject({
      asset: { kind: "unknown" },
      amount: { source: { kind: "legacy" }, value: "12" },
      cashClassification: "unknown",
    })
  })
  it("does not extrapolate a full day from an unqualified today's spend counter", () => {
    expect(
      getBalanceRunwayDays(
        {
          amount: 30,
          unit: { kind: "money", currency: "USD", decimalPlaces: 2 },
          semantics: "provider-wallet",
        },
        {
          value: 3,
          unit: { kind: "money", currency: "USD", decimalPlaces: 2 },
        },
      ),
    ).toBeUndefined()
  })
  it("represents a billing hard limit minus usage as a budget, separately from a direct reported balance", () => {
    const facts = normalizeTelemetryPatchToFacts(
      parseOpenAiBillingUsage(
        { hard_limit_usd: "100" },
        { total_usage: "3000" },
      ),
      "openaiBilling",
      {
        profileId: "fixture",
        baseUrl: "https://fixture.example",
        observedAt: 1000,
      },
    )
    expect(facts.budgets?.[0]).toMatchObject({
      asset: { kind: "currency", code: "USD" },
      limit: { value: "100" },
      used: { value: "30" },
      remaining: { value: "70" },
    })
    expect(facts.balanceSnapshot).toBeUndefined()
    expect(facts.balances).toBeUndefined()
    const direct = normalizeTelemetryPatchToFacts(
      parseOpenAiBillingUsage({ balance: "42.00000000000000001" }, {}),
      "openaiBilling",
      {
        profileId: "fixture",
        baseUrl: "https://fixture.example",
        observedAt: 1000,
      },
    )
    expect(direct.balanceSnapshot?.positions[0]).toMatchObject({
      role: "available",
      cashClassification: "unknown",
      amount: { value: "42.00000000000000001" },
    })
    expect(direct.budgets).toBeUndefined()
  })
  it("alerts for a known nearly depleted budget without inventing a ratio for an unknown limit", () => {
    const facts = normalizeTelemetryPatchToFacts(
      parseOpenAiBillingUsage({ hard_limit_usd: 100 }, { used_usd: 90 }),
      "openaiBilling",
      {
        profileId: "fixture",
        baseUrl: "https://fixture.example",
        observedAt: 1000,
      },
    )
    expect(buildAllowanceSignals(facts)[0]).toMatchObject({
      level: "critical",
      amount: 10,
    })
    const remainingOnly = normalizeTelemetryPatchToFacts(
      {
        budget: {
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
          remaining: "20",
        },
      },
      "openaiBilling",
      {
        profileId: "fixture",
        baseUrl: "https://fixture.example",
        observedAt: 1000,
      },
    )
    expect(buildAllowanceSignals(remainingOnly)[0]).toMatchObject({
      level: "unknown",
      amount: 20,
    })
  })
  it.each([CURRENCIES.CNY, CURRENCIES.USD] as const)(
    "keeps Kimi inference %s authoritative totals unscaled and preserves reported cash",
    (currency) => {
      const facts = normalizeTelemetryPatchToFacts(
        parseKimiOpenPlatformBalance(
          {
            status: true,
            code: 0,
            data: {
              available_balance: "21.000000000000001",
              cash_balance: "12",
              voucher_balance: "5",
            },
          },
          currency,
        ),
        "kimiOpenPlatformBalance",
        {
          profileId: "kimi",
          baseUrl: "https://api.moonshot.ai",
          observedAt: 2000,
        },
      )
      const restored = coerceTelemetrySnapshot({
        schemaVersion: 2,
        lastSyncTime: 2000,
        facts,
        attempts: [],
      })
      expect(restored?.facts?.balanceSnapshot?.positions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            amount: expect.objectContaining({ value: "21.000000000000001" }),
            asset: { kind: "currency", code: currency },
          }),
          expect.objectContaining({
            cashClassification: "reported-cash",
            amount: expect.objectContaining({ value: "12" }),
          }),
          expect.objectContaining({
            instrument: "voucher",
            amount: expect.objectContaining({ value: "5" }),
          }),
        ]),
      )
    },
  )
  it("preserves DeepSeek's exact native available total and its gift and top-up components without classifying them as cash", () => {
    const facts = normalizeTelemetryPatchToFacts(
      parseDeepSeekBalance({
        is_available: true,
        balance_infos: [
          {
            currency: CURRENCIES.CNY,
            total_balance: "110.000000000000000001",
            granted_balance: "10",
            topped_up_balance: "100",
          },
        ],
      }),
      "deepSeekBalance",
      {
        profileId: "credential",
        baseUrl: "https://api.deepseek.com",
        observedAt: 1000,
      },
    )
    expect(facts.balanceSnapshot?.positions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "available",
          cashClassification: "unknown",
          asset: { kind: "currency", code: "CNY" },
          amount: expect.objectContaining({
            value: "110.000000000000000001",
            observedAt: 1000,
          }),
        }),
        expect.objectContaining({
          funding: "granted",
          relation: "component",
          amount: expect.objectContaining({ value: "10" }),
        }),
        expect.objectContaining({
          funding: "purchased",
          relation: "component",
          amount: expect.objectContaining({ value: "100" }),
        }),
      ]),
    )
    expect(facts.balances).toBeUndefined()
    expect(
      normalizeTelemetryPatchToFacts(
        parseDeepSeekBalance({ balance_infos: [] }),
        "deepSeekBalance",
        {
          profileId: "fixture",
          baseUrl: "https://fixture.example",
          observedAt: 1000,
        },
      ).balanceSnapshot?.positions ?? [],
    ).toEqual([])
  })
  it("retains remaining-only capacity through storage without suggesting a full plan", () => {
    const facts = normalizeTelemetryPatchToFacts(
      parseKimiQuota({ usage: { remaining: 20 } }),
      "kimiQuota",
      {
        profileId: "fixture",
        baseUrl: "https://fixture.example",
        observedAt: 1000,
      },
    )
    const restored = coerceTelemetrySnapshot({
      lastSyncTime: 1000,
      facts,
      attempts: [],
    })
    expect(restored?.facts?.quota?.windows[0]).toMatchObject({ remaining: 20 })
    expect(buildAllowanceSignals(restored?.facts)[0]).toMatchObject({
      level: "unknown",
      remaining: 20,
    })
    expect(restored?.facts?.quota?.windows[0]?.remainingPercent).toBeUndefined()
  })
})
