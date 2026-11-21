import { describe, expect, it } from "vitest"

import {
  buildAllowanceSignals,
  getBalanceRunwayDays,
} from "~/features/ApiCredentialProfiles/allowance/apiCredentialAllowance"
import {
  formatProviderBalance,
  formatTelemetryAmount,
} from "~/features/ApiCredentialProfiles/allowance/apiCredentialTelemetryFormatting"
import { projectCredentialFinancialStats } from "~/features/ApiCredentialProfiles/allowance/credentialFinancialStats"
import { acceptTelemetrySnapshot } from "~/services/apiCredentialProfiles/telemetry/acceptance"
import { coerceApiCredentialTelemetryCustomEndpoint } from "~/services/apiCredentialProfiles/telemetry/config"
import {
  normalizeTelemetryPatchToFacts,
  selectTelemetryBalances,
} from "~/services/apiCredentialProfiles/telemetry/facts"
import { hasTelemetryUsageData } from "~/services/apiCredentialProfiles/telemetry/modePlanner"
import {
  mapCustomJson,
  parseDeepSeekBalance,
  parseKimiOpenPlatformBalance,
  parseKimiQuota,
} from "~/services/apiCredentialProfiles/telemetry/parsers"
import { coerceTelemetrySnapshot } from "~/services/apiCredentialProfiles/telemetry/snapshotCodec"
import { SiteHealthStatus } from "~/types"
import type {
  ApiCredentialProfile,
  ApiCredentialTelemetrySnapshot,
} from "~/types/apiCredentialProfiles"
import { testI18n } from "~~/tests/test-utils/i18n"

const context = {
  profileId: "fixture",
  baseUrl: "https://fixture.example",
  observedAt: 1000,
}

describe("financial observations from partial provider responses", () => {
  it("preserves independently mapped grant and remaining counters with native units", () => {
    const facts = normalizeTelemetryPatchToFacts(
      mapCustomJson(
        { grant: "100", left: "70" },
        { totalGrantedUsd: "grant", totalAvailableUsd: "left" },
        {
          asset: { kind: "crypto", id: "XNO" },
          role: "available",
          scope: "credential",
        },
      ),
      "customReadOnlyEndpoint",
      context,
    )
    const stored = coerceTelemetrySnapshot({
      schemaVersion: 2,
      lastSyncTime: 1000,
      facts,
    })!
    expect(stored.facts?.usage?.totalGranted).toMatchObject({
      value: "100",
      unit: { kind: "crypto", id: "XNO" },
      observedAt: 1000,
    })
    expect(stored.facts?.usage?.totalAvailable).toMatchObject({
      value: "70",
      unit: { kind: "crypto", id: "XNO" },
      observedAt: 1000,
    })
    expect(stored.facts?.balanceSnapshot).toBeUndefined()
  })
  it("formats unknown and crypto spending with exact values and leaves invalid amounts unavailable", () => {
    expect(
      formatTelemetryAmount(
        { value: "25", unit: { kind: "unknown" } },
        testI18n.t,
      ),
    ).toBe("25")
    expect(
      formatTelemetryAmount(
        {
          value: "0.12345678901234567890123456789",
          unit: { kind: "crypto", id: "XNO" },
        },
        testI18n.t,
      ),
    ).toBe("0.12345678901234567890123456789 XNO")
    expect(
      formatTelemetryAmount(
        { value: "invalid", unit: { kind: "unknown" } },
        testI18n.t,
      ),
    ).toBe("apiCredentialProfiles:telemetry.notProvided")
  })
  it("discards malformed retained operands independently of fresh quota observations", () => {
    const stored = coerceTelemetrySnapshot({
      schemaVersion: 2,
      lastSyncTime: 2000,
      facts: {
        quota: {
          windows: [
            {
              type: "weekly",
              unit: { kind: "quota", code: "requests", label: "Requests" },
              remaining: 20,
              retainedAmounts: {
                limit: { status: "stale", value: 100, observedAt: 1000 },
                used: { status: "known", value: 70, observedAt: 1000 },
                remaining: null,
                remainingPercent: {
                  status: "stale",
                  value: 101,
                  observedAt: 1000,
                },
              },
            },
          ],
        },
      },
    })!
    expect(stored.facts?.quota?.windows[0]).toMatchObject({
      remaining: 20,
      retainedAmounts: { limit: { value: 100, observedAt: 1000 } },
    })
    expect(
      Object.keys(stored.facts!.quota!.windows[0]!.retainedAmounts!),
    ).toEqual(["limit"])
    expect(() =>
      coerceTelemetrySnapshot({
        schemaVersion: 2,
        lastSyncTime: 2000,
        facts: { budgets: [{}] },
      }),
    ).toThrow("Invalid canonical credential budgets")
  })
  it("keeps malformed legacy currency labels readable without rounding source decimals", () => {
    expect(
      formatTelemetryAmount(
        {
          value: "3.500000001",
          unit: { kind: "money", currency: "invalid", decimalPlaces: 2 },
        },
        testI18n.t,
      ),
    ).toBe("invalid 3.500000001")
  })
  it.each([
    { kind: "crypto", id: "XNO" } as const,
    {
      kind: "quota",
      id: "credits",
      label: "Credits",
      displayScale: 100,
      displayLabel: "Credits",
    } as const,
  ])(
    "estimates same-observation $kind runway without mixing unrelated units or unverified complete scopes",
    (asset) => {
      const facts = normalizeTelemetryPatchToFacts(
        mapCustomJson(
          { left: "30", cost: "3" },
          { balanceUsd: "left", todayCostUsd: "cost" },
          { asset, role: "available", scope: "credential" },
        ),
        "customReadOnlyEndpoint",
        { ...context, observedAt: Date.now() },
      )
      expect(buildAllowanceSignals(facts)[0]).toMatchObject({ runwayDays: 10 })
      const balance = selectTelemetryBalances(facts)[0]!
      const cost = facts.usage!.todayCost!
      expect(
        getBalanceRunwayDays(balance, {
          ...cost,
          unit: { kind: "money", currency: "CNY", decimalPlaces: 2 },
        }),
      ).toBeUndefined()
      expect(
        getBalanceRunwayDays(balance, {
          ...cost,
          coverage: "complete",
          window: {
            start: context.observedAt - 86400000,
            end: context.observedAt,
            timeZone: "UTC",
          },
        }),
      ).toBeUndefined()
    },
  )
  it("formats missing, unknown and invalid legacy units without inventing money", () => {
    const missing = { amount: NaN, semantics: "legacy" as const }
    for (const unit of [
      { kind: "money", currency: "USD", decimalPlaces: 2 } as const,
      { kind: "quota", code: "credits", label: "Credits" } as const,
      { kind: "crypto", id: "XNO" } as const,
      { kind: "unknown" } as const,
    ])
      expect(formatProviderBalance({ ...missing, unit }, testI18n.t)).toContain(
        "apiCredentialProfiles:telemetry.notProvided",
      )
    expect(
      formatProviderBalance(
        { ...missing, amount: 3.5, unit: { kind: "unknown" } },
        testI18n.t,
      ),
    ).toBe("3.5")
    expect(
      formatProviderBalance(
        {
          ...missing,
          amount: 3.5,
          unit: { kind: "money", currency: "invalid", decimalPlaces: 2 },
        },
        testI18n.t,
      ),
    ).toBe("invalid 3.50")
  })
  it("retains omitted quota amounts at their original time only within the same reset interval", () => {
    const build = (
      data: unknown,
      observedAt: number,
    ): ApiCredentialTelemetrySnapshot => ({
      health: { status: SiteHealthStatus.Healthy },
      lastSyncTime: observedAt,
      attempts: [],
      source: "kimiQuota",
      facts: normalizeTelemetryPatchToFacts(parseKimiQuota(data), "kimiQuota", {
        ...context,
        observedAt,
      }),
    })
    const original = build(
      {
        usage: { limit: 100, remaining: 30, resetTime: "2026-12-01T00:00:00Z" },
      },
      1000,
    )
    const partial = acceptTelemetrySnapshot(
      original,
      build(
        { usage: { remaining: 20, resetTime: "2026-12-01T00:00:00Z" } },
        2000,
      ),
    )
    const stored = coerceTelemetrySnapshot(partial)!
    expect(stored.facts?.quota?.windows[0]).toMatchObject({
      remaining: 20,
      retainedAmounts: {
        limit: { value: 100, status: "stale", observedAt: 1000 },
      },
    })
    expect(stored.facts?.quota?.windows[0]?.limit).toBeUndefined()
    expect(stored.facts?.quota?.windows[0]?.remainingPercent).toBeUndefined()
    const repeated = acceptTelemetrySnapshot(
      stored,
      build(
        { usage: { remaining: 15, resetTime: "2026-12-01T00:00:00Z" } },
        3000,
      ),
    )
    expect(
      repeated.facts?.quota?.windows[0]?.retainedAmounts?.limit?.observedAt,
    ).toBe(1000)
    const newInterval = acceptTelemetrySnapshot(
      repeated,
      build(
        { usage: { remaining: 10, resetTime: "2026-12-08T00:00:00Z" } },
        4000,
      ),
    )
    expect(
      newInterval.facts?.quota?.windows[0]?.retainedAmounts,
    ).toBeUndefined()
  })
  it("keeps newly observed unmapped custom spending unitless across persistence and summaries", () => {
    const facts = normalizeTelemetryPatchToFacts(
      mapCustomJson({ credits_used: "25" }, { todayCostUsd: "credits_used" }),
      "customReadOnlyEndpoint",
      context,
    )
    const stored = coerceTelemetrySnapshot({
      schemaVersion: 2,
      lastSyncTime: 1000,
      attempts: [],
      facts,
    })!
    expect(stored.facts?.usage?.todayCost).toMatchObject({
      value: "25",
      unit: { kind: "unknown" },
      source: { kind: "reported" },
    })
    const profile: ApiCredentialProfile = {
      id: "fixture",
      name: "fixture",
      apiType: "openai-compatible",
      apiKey: "synthetic",
      baseUrl: context.baseUrl,
      tagIds: [],
      notes: "",
      createdAt: 1,
      updatedAt: 1,
      telemetrySnapshot: {
        ...stored,
        health: { status: SiteHealthStatus.Healthy },
      },
    }
    expect(
      projectCredentialFinancialStats([{ ...profile, tagIds: [] }], 1000)
        .telemetryStats.reportedTodayCosts,
    ).toEqual([])
  })
  it("shows retained legacy balances until a usable native replacement arrives", () => {
    const previous: ApiCredentialTelemetrySnapshot = {
      health: { status: SiteHealthStatus.Healthy },
      lastSyncTime: 1000,
      attempts: [],
      facts: {
        balances: [
          {
            amount: 42,
            unit: { kind: "money", currency: "USD", decimalPlaces: 2 },
            semantics: "cash",
            observedAt: 1000,
          },
        ],
      },
    }
    const next: ApiCredentialTelemetrySnapshot = {
      health: { status: SiteHealthStatus.Healthy },
      lastSyncTime: 2000,
      attempts: [],
      source: "deepSeekBalance",
      facts: normalizeTelemetryPatchToFacts(
        parseDeepSeekBalance({ balance_infos: [{ currency: "USD" }] }),
        "deepSeekBalance",
        { ...context, observedAt: 2000 },
      ),
    }
    const retained = acceptTelemetrySnapshot(
      { ...previous, attempts: [] },
      next,
    )
    expect(selectTelemetryBalances(retained.facts)).toContainEqual(
      expect.objectContaining({
        amount: 42,
        status: "stale",
        observedAt: 1000,
      }),
    )
    const fresh = acceptTelemetrySnapshot(retained, {
      ...next,
      facts: normalizeTelemetryPatchToFacts(
        parseDeepSeekBalance({
          balance_infos: [{ currency: "USD", total_balance: "50" }],
        }),
        "deepSeekBalance",
        { ...context, observedAt: 3000 },
      ),
    })
    expect(selectTelemetryBalances(fresh.facts)).toHaveLength(1)
    expect(selectTelemetryBalances(fresh.facts)[0]?.amount).toBe(50)
  })
  it("keeps valid quota when a booster conversion exceeds the decimal bound", () => {
    const result = parseKimiQuota({
      usage: { limit: 100, remaining: 20 },
      boosterWallet: {
        status: "STATUS_ACTIVE",
        balance: { amountLeft: "0." + "0".repeat(253) + "1" },
      },
    })
    expect(result.quota?.windows[0]).toMatchObject({
      limit: 100,
      remaining: 20,
    })
    expect(result.balance).toBeUndefined()
    expect(
      parseKimiQuota({
        boosterWallet: {
          status: "STATUS_ACTIVE",
          balance: { amountLeft: "123456789" },
        },
      }).balance?.amount,
    ).toBe("1.23456789")
  })
  it("keeps over-limit quota operands through persistence", () => {
    const facts = normalizeTelemetryPatchToFacts(
      parseKimiQuota({ usage: { limit: 100, used: 110 } }),
      "kimiQuota",
      context,
    )
    const stored = coerceTelemetrySnapshot({
      schemaVersion: 2,
      lastSyncTime: 1000,
      attempts: [],
      facts,
    })
    expect(stored?.facts?.quota?.windows[0]).toMatchObject({
      limit: 100,
      used: 110,
      remaining: -10,
      remainingPercent: 0,
    })
  })
  it("omits a missing mapped balance without losing independent counters", () => {
    const mapping = {
      asset: { kind: "currency", code: "USD" },
      role: "available",
      scope: "credential",
    } as const
    const paths = {
      balanceUsd: "wallet.left",
      todayRequests: "requests",
      totalUsedUsd: "used",
    }
    const absent = mapCustomJson({}, paths, mapping)
    expect(absent.balance).toBeUndefined()
    expect(hasTelemetryUsageData(absent)).toBe(false)
    expect(
      mapCustomJson({ wallet: { left: "0" } }, paths, mapping).balance?.amount,
    ).toBe("0")
    expect(
      mapCustomJson({ requests: 4, used: "3" }, paths, mapping),
    ).toMatchObject({ todayRequests: 4, totalUsedUsd: "3" })
  })
  it("does not stop Auto on an empty budget container", () => {
    const asset = { kind: "currency", code: "USD" } as const
    expect(
      hasTelemetryUsageData({
        budget: { asset, limit: null, unlimited: false },
      }),
    ).toBe(false)
    for (const budget of [
      { asset, limit: "0" },
      { asset, used: "3" },
      { asset, remaining: "2" },
      { asset, unlimited: true },
    ]) {
      expect(hasTelemetryUsageData({ budget })).toBe(true)
    }
  })
  it("requires a real Kimi amount while accepting explicit zero and components", () => {
    expect(
      hasTelemetryUsageData(
        parseKimiOpenPlatformBalance(
          { status: true, code: 0, data: {} },
          "CNY",
        ),
      ),
    ).toBe(false)
    for (const data of [
      { available_balance: "0" },
      { cash_balance: "3" },
      { voucher_balance: "5" },
    ]) {
      expect(
        hasTelemetryUsageData(
          parseKimiOpenPlatformBalance({ status: true, code: 0, data }, "CNY"),
        ),
      ).toBe(true)
    }
  })
  it.each([
    { balance_infos: [{ total_balance: "120" }] },
    { balance_infos: [{ currency: "usd", total_balance: "120" }] },
    {
      balance_infos: [
        { currency: "USD", total_balance: "12" },
        { currency: "USD", total_balance: "13" },
      ],
    },
  ])(
    "marks unidentified or duplicate wallets as a partial enumeration",
    ({ balance_infos }) => {
      expect(parseDeepSeekBalance({ balance_infos }).balanceCoverage).toBe(
        "partial",
      )
    },
  )
  it("discards an unusable endpoint before validating its mapping", () => {
    expect(
      coerceApiCredentialTelemetryCustomEndpoint({
        endpoint: "",
        jsonPaths: {},
        financialMapping: null,
      }),
    ).toBeUndefined()
    expect(() =>
      coerceApiCredentialTelemetryCustomEndpoint({
        endpoint: "/usage",
        jsonPaths: { balanceUsd: "left" },
        financialMapping: null,
      }),
    ).toThrow()
  })
})
