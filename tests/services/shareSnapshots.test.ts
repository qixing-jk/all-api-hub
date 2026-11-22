import { describe, expect, it, vi } from "vitest"

import {
  ACCOUNT_CASHFLOW_METRICS,
  ACCOUNT_USAGE_SCOPES,
} from "~/constants/accountUsage"
import { CURRENCIES, CURRENCY_DISPLAY_MODES } from "~/constants/money"
import {
  accountBalanceScope,
  accountBalanceSnapshot,
} from "~/services/accounts/balanceSnapshot"
import {
  getDisplayConsumptionProjection,
  getDisplayIncomeProjection,
} from "~/services/accounts/metrics/consumptionProjection"
import { balancePosition, observeAmount } from "~/services/amounts/balance"
import { budgetConstraint } from "~/services/amounts/budgets"
import {
  ASSET_KINDS,
  BALANCE_CASH_CLASSIFICATIONS,
  BALANCE_RELATIONS,
  BALANCE_VALIDITY_KINDS,
  BUDGET_LIMIT_STATES,
  BUDGET_WINDOW_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  OBSERVATION_STATUSES,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import {
  buildAccountShareSnapshotPayload,
  buildOverviewShareSnapshotPayload,
  generateShareSnapshotCaption,
} from "~/services/sharing/shareSnapshots"
import {
  accountShareBalanceSummary,
  formatOverviewShareBalance,
  getShareBalanceDisplayAmounts,
  shareBalanceLines,
  shareBalanceTitle,
} from "~/services/sharing/shareSnapshots/balanceSummary"
import {
  getShareNetAmount,
  publicConsumptionSummary,
  publicSiteDayUsage,
  shareConsumptionLines,
  shareSiteDayLines,
} from "~/services/sharing/shareSnapshots/consumptionSummary"
import {
  SHARE_BALANCE_PURPOSES,
  type ShareBalanceSummary,
} from "~/services/sharing/shareSnapshots/types"
import {
  createShareSnapshotSeed,
  formatAsOfTimestamp,
  formatCurrencyAmount,
  formatSignedCurrencyAmount,
  redactShareSecrets,
  relativeLuminanceFromRgb,
} from "~/services/sharing/shareSnapshots/utils"
import type { AccountUsageSummary } from "~/types"
import { buildPeriodIncome } from "~~/tests/test-utils/financialPeriod"

describe("public native financial sharing boundaries", () => {
  const source = {
    adapter: "private-provider",
    operation: "private-operation",
    contractVersion: "1",
    kind: EVIDENCE_KINDS.Reported,
  } as const

  it("retains supplied partial allowance coverage even without displayable plans", () => {
    const scope = accountBalanceScope({ baseUrl: "https://allowances.example" })
    const snapshot = accountBalanceSnapshot(
      scope,
      [
        balancePosition({
          id: "wallet",
          scope,
          source,
          asset: { kind: "currency", code: "USD" },
          value: "20",
          observedAt: 100,
        }),
      ],
      100,
      FINANCIAL_COVERAGE.Complete,
    )
    const allowances = {
      schemaVersion: 1 as const,
      subject: scope.subject,
      capturedAt: 100,
      entries: [],
      coverage: FINANCIAL_COVERAGE.Partial,
    }
    const summary = accountShareBalanceSummary(snapshot, allowances, 100)
    expect(summary.entries[0]?.amount?.value).toBe("20")
    expect(summary.coverage).toBe(FINANCIAL_COVERAGE.Partial)
    expect(shareBalanceLines(summary)).toContain(
      "shareSnapshots:financial.partial",
    )
  })

  it.each(["disabled", "expired", "reset", "unreadable", "future"] as const)(
    "keeps an ineligible %s allowance out of shared entries without hiding its coverage gap",
    (state) => {
      const scope = accountBalanceScope({
        baseUrl: "https://allowances.example",
      })
      const constraint = budgetConstraint({
        scope,
        source,
        observedAt: 100,
        asset: { kind: "currency", code: "USD" },
        remaining: 10,
        limitState: BUDGET_LIMIT_STATES.Finite,
      })
      if (state === "disabled")
        constraint.enabled = {
          status: "known",
          value: false,
          source,
          observedAt: 100,
        }
      if (state === "reset")
        constraint.window = {
          kind: BUDGET_WINDOW_KINDS.Periodic,
          period: "day",
          resetsAt: 100,
        }
      if (state === "unreadable")
        constraint.remaining = observeAmount(undefined, source, 100)
      const allowances = {
        schemaVersion: 1 as const,
        subject: scope.subject,
        capturedAt: 100,
        coverage: FINANCIAL_COVERAGE.Partial,
        entries: [
          {
            id: "plan",
            collectionKey: "plans",
            identityKind: "upstream" as const,
            constraint,
            ...(state === "future"
              ? { reportedTiming: { startsAt: new Date(101).toISOString() } }
              : {}),
            validity:
              state === "expired"
                ? { kind: BALANCE_VALIDITY_KINDS.Expires, at: 100 }
                : { kind: BALANCE_VALIDITY_KINDS.NoExpiry },
          },
        ],
      }
      const snapshot = accountBalanceSnapshot(
        scope,
        [
          balancePosition({
            id: "wallet",
            scope,
            asset: { kind: "currency", code: "USD" },
            value: "20",
            source,
            observedAt: 100,
          }),
        ],
        100,
        FINANCIAL_COVERAGE.Complete,
      )
      const summary = accountShareBalanceSummary(snapshot, allowances, 100)
      expect(summary.entries).toHaveLength(1)
      expect(summary.entries[0]?.amount?.value).toBe("20")
      expect(summary.coverage).toBe(FINANCIAL_COVERAGE.Partial)
      if (state === "future")
        expect(
          accountShareBalanceSummary(snapshot, allowances, 101).entries,
        ).toHaveLength(2)
    },
  )

  it("keeps provider billing dates and intervals in the public caption while omitting private scope", () => {
    const usage = {
      scope: ACCOUNT_USAGE_SCOPES.SiteToday,
      reportedDay: "2026-11-18",
      totalTokens: 3,
      cost: {
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
        amount: observeAmount("2", source, 100),
        scope: accountBalanceScope({
          baseUrl: "https://private.example",
          accountId: "private-account",
        }),
        window: { start: 0, end: 100, timeZone: "UTC" },
      },
    }
    const readings = publicSiteDayUsage([usage])
    expect(readings[0]).toMatchObject({
      reportedDay: "2026-11-18",
      window: { start: 0, end: 100, timeZone: "UTC" },
      tokens: 3,
    })
    const caption = shareSiteDayLines(readings, "en-US").join("\n")
    expect(caption).toContain("2026-11-18")
    expect(caption).toContain("UTC")
    expect(caption).not.toContain("private-account")
    expect(caption).not.toContain("private.example")
  })

  it.each([CURRENCIES.CNY, CURRENCY_DISPLAY_MODES.Original])(
    "uses the account's retained-income conversion for %s captions",
    (currencyDisplay) => {
      const fact = buildPeriodIncome("retained", "2")
      fact.amount = {
        source: fact.amount.source,
        value: "2",
        observedAt: Date.now(),
        status: OBSERVATION_STATUSES.Stale,
        reason: "offline",
      }
      const income = getDisplayIncomeProjection([
        { id: "retained", reportedIncome: [fact] },
      ])
      const payload = buildAccountShareSnapshotPayload({
        siteName: "Retained income",
        currencyType: CURRENCIES.CNY,
        currencyDisplay,
        exchangeRate: 14,
        includeTodayCashflow: true,
        income,
      })
      const caption = generateShareSnapshotCaption(payload)
      expect(caption).toMatch(
        currencyDisplay === CURRENCIES.CNY ? /CNY\s28\b/ : /USD\s2\b/,
      )
      expect(caption).toContain("account:financial.lastKnown")
    },
  )

  it.each([-1, Infinity, NaN])(
    "omits invalid provider counters (%s) while preserving a usable cost",
    (invalidCount) => {
      const usage: AccountUsageSummary = {
        scope: ACCOUNT_USAGE_SCOPES.SiteToday,
        totalRequests: invalidCount,
        totalTokens: invalidCount,
        cost: {
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
          amount: observeAmount("2", source, 100),
        },
      }
      const readings = publicSiteDayUsage([usage])
      expect(readings).toEqual([
        {
          cost: {
            asset: { kind: ASSET_KINDS.Currency, code: "USD" },
            value: "2",
          },
          observedAt: 100,
          lastKnown: true,
        },
      ])
      expect(JSON.stringify(readings)).not.toContain("private-provider")
    },
  )

  it("omits empty and unrelated provider readings while keeping zero counters without inventing a cost", () => {
    expect(
      publicSiteDayUsage([
        { scope: ACCOUNT_USAGE_SCOPES.CurrentPeriod },
        { scope: ACCOUNT_USAGE_SCOPES.SiteToday },
        {
          scope: ACCOUNT_USAGE_SCOPES.SiteToday,
          totalRequests: 0,
          totalTokens: 0,
        },
      ]),
    ).toEqual([{ requests: 0, tokens: 0, lastKnown: true }])
  })

  it("shares counters for an unknown cost asset without exporting its amount", () => {
    const readings = publicSiteDayUsage([
      {
        scope: ACCOUNT_USAGE_SCOPES.SiteToday,
        observedAt: 100,
        totalRequests: 4,
        cost: {
          asset: { kind: ASSET_KINDS.Unknown },
          amount: observeAmount("99", source, 100),
        },
      },
    ])
    expect(readings).toEqual([
      { requests: 4, observedAt: 100, lastKnown: true },
    ])
    const caption = shareSiteDayLines(readings, "en-US").join("\n")
    expect(caption).toContain("4 usageAnalytics:summary.requests")
    expect(caption).not.toContain("99")
    expect(caption).toContain("account:financial.lastKnown")
    expect(shareSiteDayLines(undefined)).toEqual([])
  })

  it("uses the caller's rate for a plain provider reading and retains its original currency", () => {
    const readings = publicSiteDayUsage(
      [
        {
          scope: ACCOUNT_USAGE_SCOPES.SiteToday,
          cost: {
            asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
            amount: observeAmount("140", source, 100),
          },
        },
      ],
      CURRENCIES.USD,
      14,
    )
    expect(readings[0]).toMatchObject({
      cost: { value: "140", asset: { code: "CNY" } },
      displayCost: { value: "10", asset: { code: "USD" } },
    })
    const caption = shareSiteDayLines(readings, "en-US").join("\n")
    expect(caption).toMatch(/USD\s10\b/)
    expect(caption).toMatch(/CNY\s140\b/)
  })

  it.each(["crypto", "quota"] as const)(
    "keeps %s balances native when an overview supplies converted money",
    (kind) => {
      const native = {
        asset:
          kind === "crypto"
            ? { kind: ASSET_KINDS.Crypto, id: "XNO" as const }
            : {
                kind: ASSET_KINDS.Quota,
                id: "credits",
                label: "Credits",
                displayLabel: "Credits",
                displayScale: 1,
              },
        value: "12",
      } as const
      const summary: ShareBalanceSummary = {
        purpose: SHARE_BALANCE_PURPOSES.Available,
        entries: [],
        amounts: [native],
        convertedCurrencyTotals: { USD: "7" },
        coverage: FINANCIAL_COVERAGE.Complete,
      }
      expect(getShareBalanceDisplayAmounts(summary, CURRENCIES.USD)).toEqual([
        native,
      ])
      expect(shareBalanceLines(summary, "en-US", CURRENCIES.USD)[0]).toContain(
        kind === "crypto" ? "XNO" : "Credits",
      )
      expect(
        shareBalanceLines(summary, "en-US", CURRENCIES.USD)[0],
      ).not.toContain("$7")
    },
  )

  it("keeps an original CNY subtotal beside its independently recorded USD conversion", () => {
    const summary: ShareBalanceSummary = {
      purpose: SHARE_BALANCE_PURPOSES.Prepaid,
      entries: [],
      amounts: [
        { asset: { kind: ASSET_KINDS.Currency, code: "CNY" }, value: "140" },
      ],
      cnyInUsd: "10",
      coverage: FINANCIAL_COVERAGE.Partial,
      includedCount: 1,
      eligibleCount: 2,
      manualCount: 1,
    }
    const lines = shareBalanceLines(summary, "en-US", CURRENCIES.USD)
    expect(lines[0]).toContain("$10.00")
    expect(lines[0]).toContain("¥140.00")
    expect(lines).toContain("shareSnapshots:financial.partial")
    expect(lines).toContain("account:financial.manualContribution")
    expect(shareBalanceTitle(summary)).toBe("account:financial.prepaidTotal")
    expect(shareBalanceTitle()).toBe("shareSnapshots:labels.balance")
  })

  it("combines a verified USD/CNY overview subtotal once and retains both native amounts in the caption", () => {
    const summary: ShareBalanceSummary = {
      purpose: SHARE_BALANCE_PURPOSES.Available,
      entries: [],
      amounts: [
        { asset: { kind: ASSET_KINDS.Currency, code: "USD" }, value: "2" },
        { asset: { kind: ASSET_KINDS.Currency, code: "CNY" }, value: "14" },
      ],
      convertedCurrencyTotals: { USD: "4" },
      coverage: FINANCIAL_COVERAGE.Complete,
    }
    expect(getShareBalanceDisplayAmounts(summary, CURRENCIES.USD)).toEqual([
      { asset: { kind: ASSET_KINDS.Currency, code: "USD" }, value: "4" },
    ])
    const caption = shareBalanceLines(summary, "en-US", CURRENCIES.USD)[0]
    expect(caption).toContain("$4.00")
    expect(caption).toContain("$2.00")
    expect(caption).toContain("¥14.00")
  })

  it.each([CURRENCIES.CNY, CURRENCY_DISPLAY_MODES.Original])(
    "keeps a portfolio's saved reference separate from spendable money in %s mode",
    (currencyDisplay) => {
      const payload = buildOverviewShareSnapshotPayload({
        currencyType: CURRENCIES.CNY,
        currencyDisplay,
        enabledAccountCount: 1,
        includeTodayCashflow: false,
        portfolio: {
          amounts: [],
          includedCount: 0,
          eligibleCount: 1,
          duplicateCount: 0,
          potentialDuplicateCount: 0,
          conflictCount: 0,
          manualCount: 0,
          coverage: FINANCIAL_COVERAGE.Partial,
          referenceUsd: { USD: "2", CNY: "28" },
          lastKnownCount: 1,
        },
      })
      expect(payload.balanceSummary?.amounts).toEqual([])
      expect(payload.balanceSummary?.referenceAmount).toEqual({
        asset: {
          kind: "currency",
          code: currencyDisplay === CURRENCIES.CNY ? "CNY" : "USD",
        },
        value: currencyDisplay === CURRENCIES.CNY ? "28" : "2",
      })
      expect(generateShareSnapshotCaption(payload)).toContain(
        "account:financial.lastKnown",
      )
    },
  )

  it.each([
    { kind: ASSET_KINDS.Crypto, id: "XNO" },
    {
      kind: ASSET_KINDS.Quota,
      id: "credits",
      label: "Credits",
      displayLabel: "Credits",
      displayScale: 1,
    },
    { kind: ASSET_KINDS.Unknown },
  ] as const)(
    "labels an unavailable $kind balance without publishing a monetary value",
    (asset) => {
      const scope = accountBalanceScope({ baseUrl: "https://private.example" })
      const summary = accountShareBalanceSummary(
        accountBalanceSnapshot(
          scope,
          [
            balancePosition({
              id: "wallet",
              scope,
              asset,
              source,
              value: undefined,
              observedAt: 100,
            }),
          ],
          100,
        ),
      )
      const caption = shareBalanceLines(summary, "en-US").join("\n")
      expect(summary.entries[0]?.amount).toBeUndefined()
      expect(caption).toContain("shareSnapshots:financial.unavailable")
      if (asset.kind === ASSET_KINDS.Crypto) expect(caption).toContain("XNO")
      if (asset.kind === ASSET_KINDS.Quota) expect(caption).toContain("Credits")
      expect(caption).not.toContain("private.example")
      expect(caption).not.toContain("USD")
    },
  )

  it("keeps old reference income readable without inventing an observation timestamp", () => {
    const coverage = {
      status: "unavailable" as const,
      completeCount: 0,
      partialCount: 0,
      eligibleCount: 1,
      legacyUnclassifiedCount: 1,
    }
    const summary = publicConsumptionSummary({
      groups: [],
      nativeCoverage: coverage,
      references: [
        {
          accountId: "private-reference",
          amount: { USD: 2, CNY: 14 },
          lastKnown: false,
        },
      ],
    })
    expect(summary.references).toEqual([
      { amount: { USD: 2, CNY: 14 }, lastKnown: false },
    ])
    const lines = shareConsumptionLines(
      summary,
      "en-US",
      ACCOUNT_CASHFLOW_METRICS.Income,
      CURRENCIES.CNY,
    )
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(
      /^account:financial.reportedIncome: account:financial.legacy · CNY\s14$/,
    )
  })
})

describe("shareSnapshots", () => {
  it.each(["asset", "overflow"] as const)(
    "omits net cashflow for %s while preserving independent groups",
    (scenario) => {
      const coverage = {
        status: "complete" as const,
        completeCount: 1,
        partialCount: 0,
        eligibleCount: 1,
        legacyUnclassifiedCount: 0,
      }
      const summary = (code: string, value: string) =>
        publicConsumptionSummary({
          nativeCoverage: coverage,
          groups: [
            {
              amount: { asset: { kind: "currency", code }, value },
              coverage,
              window: { start: 100, end: 200, timeZone: "UTC" },
            },
          ],
        })
      const income = summary(
        "USD",
        scenario === "asset" ? "10" : "9".repeat(256),
      )
      const spending = summary(
        scenario === "asset" ? "CNY" : "USD",
        scenario === "asset" ? "3" : `-${"9".repeat(256)}`,
      )
      expect(getShareNetAmount(income, spending)).toBeUndefined()
      expect(income.groups).toHaveLength(1)
      expect(spending.groups).toHaveLength(1)
    },
  )
  it("preserves unknown asset classification without exporting a usable monetary amount", () => {
    const scope = accountBalanceScope({ baseUrl: "https://unknown.invalid" })
    const payload = buildAccountShareSnapshotPayload({
      siteName: "Unknown",
      currencyType: "USD",
      includeTodayCashflow: false,
      balanceSnapshot: accountBalanceSnapshot(
        scope,
        [
          balancePosition({
            id: "unknown",
            scope,
            asset: { kind: "unknown" },
            value: "7",
            observedAt: 100,
            source: {
              adapter: "fixture",
              operation: "wallet",
              contractVersion: "1",
              kind: "reported",
            },
          }),
        ],
        100,
        "unknown",
      ),
    })
    expect(payload.balanceSummary?.entries).toMatchObject([
      { asset: { kind: "unknown" }, amount: undefined },
    ])
    expect(generateShareSnapshotCaption(payload)).toContain(
      "shareSnapshots:financial.unavailable",
    )
  })
  it("keeps a ledger whose validity differs from its summary mirror", () => {
    const scope = accountBalanceScope({ baseUrl: "https://mirror.invalid" })
    const source = {
      adapter: "fixture",
      operation: "balance",
      contractVersion: "1",
      kind: "reported",
    } as const
    const ledger = balancePosition({
      id: "ledger",
      role: "ledger",
      scope,
      source,
      observedAt: 100,
      asset: { kind: "currency", code: "USD" },
      value: "20",
      validity: { kind: "no-expiry" },
    })
    const mirror = {
      ...ledger,
      id: "summary",
      role: "available" as const,
      parentId: "ledger",
      relation: "summary" as const,
      validity: { kind: "expires" as const, at: 1000 },
    }
    expect(
      accountShareBalanceSummary(
        accountBalanceSnapshot(scope, [ledger, mirror], 100, "complete"),
      ).entries,
    ).toHaveLength(2)
  })

  it("keeps the native unit when the portfolio has no usable display conversion", () => {
    expect(
      formatOverviewShareBalance(
        { asset: { kind: "currency", code: "USD" }, value: "1" },
        { purpose: "available", entries: [], coverage: "complete" },
        "en",
        "CNY",
      ),
    ).toBe("$1.00")
  })
  it("shares unlimited plans and their reported timing without inventing a numeric amount", () => {
    const scope = accountBalanceScope({ baseUrl: "https://share.invalid" })
    const at = Date.now()
    const payload = buildAccountShareSnapshotPayload({
      siteName: "Plans",
      currencyType: "USD",
      includeTodayCashflow: false,
      balanceSnapshot: accountBalanceSnapshot(scope, [], at, "complete"),
      allowances: {
        schemaVersion: 1,
        subject: scope.subject,
        capturedAt: at,
        coverage: "partial",
        entries: [
          {
            id: "unlimited",
            collectionKey: "plans",
            identityKind: "upstream",
            validity: { kind: "unknown" },
            reportedTiming: { expiresAt: "2027-01-04" },
            constraint: budgetConstraint({
              scope,
              asset: { kind: "currency", code: "USD" },
              source: {
                adapter: "fixture",
                operation: "plans",
                contractVersion: "1",
                kind: "reported",
              },
              observedAt: at,
              limitState: "unlimited",
              enabled: true,
            }),
          },
        ],
      },
    })
    expect(payload.balanceSummary?.entries).toMatchObject([
      {
        amount: undefined,
        unlimited: true,
        reportedTiming: { expiresAt: "2027-01-04" },
      },
    ])
    expect(payload.balanceSummary?.coverage).toBe("partial")
    expect(generateShareSnapshotCaption(payload)).toContain(
      "keyManagement:dialog.unlimitedQuota",
    )
  })
  it("shares retained native income separately from current totals", () => {
    const fact = buildPeriodIncome("private-id", "5")
    fact.amount = {
      ...fact.amount,
      status: "stale",
      reason: "refresh-failed",
    } as typeof fact.amount
    const projection = getDisplayIncomeProjection([
      { id: "private-id", reportedIncome: [fact] },
    ])
    expect(projection.groups).toEqual([])
    const publicSummary = publicConsumptionSummary(projection)
    expect(
      shareConsumptionLines(
        publicSummary,
        "en",
        ACCOUNT_CASHFLOW_METRICS.Income,
      ).join(" "),
    ).toMatch(/USD\s5/)
    expect(JSON.stringify(publicSummary)).not.toContain("private-id")
  })
  it("omits net cashflow when a native projection is partial despite a complete USD group", () => {
    const coverage = {
      status: "complete" as const,
      completeCount: 1,
      partialCount: 0,
      eligibleCount: 1,
      legacyUnclassifiedCount: 0,
    }
    const summary = (value: string) =>
      publicConsumptionSummary({
        nativeCoverage: coverage,
        groups: [
          {
            amount: {
              asset: { kind: "currency", code: CURRENCIES.USD },
              value,
            },
            coverage,
            window: { start: 1000, end: 2000, timeZone: "UTC" },
          },
        ],
      })
    const income = summary("10")
    const spending = summary("3")
    spending.nativeCoverage.status = "partial"
    expect(getShareNetAmount(income, spending)).toBeUndefined()
    expect(shareConsumptionLines(spending, "en").join(" ")).toMatch(
      /USD\s3(?:\s|$)/,
    )
    spending.nativeCoverage.status = "complete"
    expect(getShareNetAmount(income, spending)).toMatchObject({ value: "7" })
  })

  it.each([
    "partial",
    "pending",
    "unknown",
    "different-window",
    "quota",
    "missing-conversion",
    "overflow",
  ] as const)(
    "keeps independent public cashflow groups when the converted total has %s evidence",
    (scenario) => {
      const coverage = {
        status: "complete" as const,
        completeCount: 2,
        partialCount: 0,
        eligibleCount: 2,
        legacyUnclassifiedCount: 0,
      }
      const window = { start: 1000, end: 2000, timeZone: "UTC" }
      const summary = publicConsumptionSummary({
        nativeCoverage: coverage,
        groups: [
          {
            amount: {
              asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
              value: "1",
            },
            cnyValue: "7",
            coverage: { ...coverage },
            window,
          },
          {
            amount: {
              asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
              value: "14",
            },
            usdValue: "1",
            coverage: { ...coverage },
            window: { ...window },
          },
        ],
      })
      const second = summary.groups[1]!
      if (scenario === "partial") {
        summary.nativeCoverage.status = "partial"
        summary.nativeCoverage.completeCount = 1
        summary.nativeCoverage.partialCount = 1
        second.coverage.status = "partial"
        second.coverage.partialCount = 1
      } else if (scenario === "pending") {
        summary.nativeCoverage.legacyUnclassifiedCount = 1
      } else if (scenario === "unknown") {
        second.coverage.status = "unavailable"
      } else if (scenario === "different-window") {
        second.window.end = 3000
      } else if (scenario === "quota") {
        second.amount.asset = {
          kind: ASSET_KINDS.Quota,
          id: "credits",
          label: "Credits",
          displayScale: 1,
          displayLabel: "Credits",
        }
      } else if (scenario === "missing-conversion") {
        delete second.usdValue
      } else {
        summary.groups[0]!.amount.value = "9".repeat(256)
        second.usdValue = "9".repeat(256)
      }
      const lines = shareConsumptionLines(
        summary,
        "en",
        ACCOUNT_CASHFLOW_METRICS.Consumption,
        CURRENCIES.USD,
      )
      expect(lines.filter((line) => /USD|CNY|Credits/.test(line))).toHaveLength(
        2,
      )
      expect(getShareNetAmount(summary, summary, "USD")).toBeUndefined()
      expect(summary.groups).toHaveLength(2)
    },
  )
  it.each([
    [CURRENCIES.USD, /USD\s2\b/, /USD\s4\b/, "2"],
    [CURRENCIES.CNY, /CNY\s21\b/, /CNY\s42\b/, "21"],
  ] as const)(
    "shares one complete %s cashflow total across accounts whose native currencies differ",
    (currency, cost, received, net) => {
      vi.useFakeTimers({ toFake: ["Date"] })
      vi.setSystemTime(new Date("2026-11-21T12:00:00.000Z"))
      try {
        const now = Date.now()
        const start = new Date(now)
        start.setHours(0, 0, 0, 0)
        const window = {
          start: start.getTime(),
          end: now,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }
        const sites = ([CURRENCIES.USD, CURRENCIES.CNY] as const).map(
          (code) => {
            const scope = accountBalanceScope(
              { accountId: code, baseUrl: "https://mixed-net.example" },
              { walletId: code },
            )
            scope.projects =
              scope.keys =
              scope.models =
              scope.groups =
                { kind: "all" }
            const amount = (value: string) => ({
              status: OBSERVATION_STATUSES.Known,
              value,
              observedAt: now,
              source: {
                kind: EVIDENCE_KINDS.Reported,
                adapter: "fixture",
                operation: "daily",
                contractVersion: "1",
              },
            })
            return {
              id: code,
              disabled: false,
              excludeFromTodayIncome: false,
              exchangeRate: code === CURRENCIES.USD ? 7 : 14,
              todayStatsAvailability: {
                consumption: { status: "complete" as const },
                income: { status: "complete" as const },
                requests: { status: "complete" as const },
                tokens: { status: "complete" as const },
              },
              settledConsumption: [
                {
                  asset: { kind: ASSET_KINDS.Currency, code },
                  scope,
                  amount: amount(code === CURRENCIES.USD ? "1" : "14"),
                  window,
                  coverage: "complete" as const,
                  settlement: "settled" as const,
                },
              ],
              reportedIncome: [
                {
                  asset: { kind: ASSET_KINDS.Currency, code },
                  scope,
                  amount: amount(code === CURRENCIES.USD ? "2" : "28"),
                  window,
                  coverage: "complete" as const,
                  classification: "grant" as const,
                },
              ],
            }
          },
        )
        const income = getDisplayIncomeProjection(sites)
        const consumption = getDisplayConsumptionProjection(sites)
        expect(income.nativeCoverage).toMatchObject({
          status: "complete",
          completeCount: 2,
          eligibleCount: 2,
        })
        const payload = buildOverviewShareSnapshotPayload({
          currencyType: currency,
          currencyDisplay: currency,
          enabledAccountCount: 2,
          includeTodayCashflow: true,
          income,
          consumption,
        })
        expect(payload.todayNetAmount).toEqual({
          asset: { kind: ASSET_KINDS.Currency, code: currency },
          value: net,
        })
        const costLines = shareConsumptionLines(
          payload.consumptionSummary,
          "en",
          ACCOUNT_CASHFLOW_METRICS.Consumption,
          currency,
        )
        const incomeLines = shareConsumptionLines(
          payload.incomeSummary,
          "en",
          ACCOUNT_CASHFLOW_METRICS.Income,
          currency,
        )
        expect(costLines[0]).toMatch(cost)
        expect(incomeLines[0]).toMatch(received)
        expect(costLines.join("\n")).not.toContain(
          "todayMetricAvailability.partial",
        )
        expect(incomeLines.join("\n")).not.toContain(
          "todayMetricAvailability.partial",
        )
        expect(
          costLines.filter(
            (line) => line.includes(":") && /USD|CNY/.test(line),
          ),
        ).toHaveLength(1)
        expect(
          incomeLines.filter(
            (line) => line.includes(":") && /USD|CNY/.test(line),
          ),
        ).toHaveLength(1)
        const caption = generateShareSnapshotCaption(payload)
        expect(caption).toMatch(/CNY\s14\b/)
        expect(caption).toMatch(/CNY\s28\b/)
        expect(payload.consumptionSummary?.groups).toHaveLength(2)
        expect(payload.incomeSummary?.groups).toHaveLength(2)
        const original = shareConsumptionLines(payload.consumptionSummary, "en")
        expect(original.filter((line) => /USD|CNY/.test(line))).toHaveLength(2)
      } finally {
        vi.useRealTimers()
      }
    },
  )
  it("shares overview provider-day costs at each contributing account rate without exposing it", () => {
    const now = Date.now()
    const usage = {
      scope: ACCOUNT_USAGE_SCOPES.SiteToday,
      observedAt: now,
      cost: {
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
        amount: {
          status: OBSERVATION_STATUSES.Known,
          value: "140",
          observedAt: now,
          source: {
            kind: EVIDENCE_KINDS.Reported,
            adapter: "fixture",
            operation: "daily",
            contractVersion: "1",
          },
        },
      },
    } as const
    const payload = buildOverviewShareSnapshotPayload({
      currencyType: CURRENCIES.USD,
      currencyDisplay: CURRENCIES.USD,
      enabledAccountCount: 1,
      includeTodayCashflow: true,
      siteDayUsage: [
        { usage, observedAt: now, lastKnown: false, exchangeRate: 14 },
      ],
    })
    expect(generateShareSnapshotCaption(payload)).toMatch(/USD\s10\b/)
    expect(generateShareSnapshotCaption(payload)).toMatch(/CNY\s140\b/)
    expect(payload.siteDayUsage?.[0]).not.toHaveProperty("exchangeRate")
  })
  it("shares provider-day costs in the active display currency while retaining original facts", () => {
    const usage = {
      scope: ACCOUNT_USAGE_SCOPES.SiteToday,
      observedAt: Date.now(),
      totalRequests: 4,
      cost: {
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
        amount: {
          status: OBSERVATION_STATUSES.Known,
          value: "2",
          observedAt: Date.now(),
          source: {
            kind: EVIDENCE_KINDS.Reported,
            adapter: "fixture",
            operation: "daily",
            contractVersion: "1",
          },
        },
      },
    } as const
    const common = {
      siteName: "Site day",
      includeTodayCashflow: true,
      currencyType: CURRENCIES.CNY,
      exchangeRate: 14,
      siteDayUsage: [usage],
    }
    const converted = buildAccountShareSnapshotPayload({
      ...common,
      currencyDisplay: CURRENCIES.CNY,
    })
    expect(generateShareSnapshotCaption(converted)).toMatch(/CNY\s28\b/)
    expect(generateShareSnapshotCaption(converted)).toMatch(/USD\s2\b/)
    expect(converted.siteDayUsage?.[0]?.cost).toEqual({
      asset: { kind: ASSET_KINDS.Currency, code: "USD" },
      value: "2",
    })
    const original = buildAccountShareSnapshotPayload({
      ...common,
      currencyDisplay: CURRENCY_DISPLAY_MODES.Original,
    })
    expect(generateShareSnapshotCaption(original)).toMatch(/USD\s2\b/)
    expect(generateShareSnapshotCaption(original)).not.toMatch(/CNY\s28\b/)
  })
  it("keeps net cashflow available for complete same-window converted monetary groups", () => {
    const coverage = {
      status: "complete" as const,
      completeCount: 1,
      partialCount: 0,
      eligibleCount: 1,
      legacyUnclassifiedCount: 0,
    }
    const window = { start: 1000, end: 2000, timeZone: "UTC" }
    const group = (
      code: string,
      value: string,
      converted: { usdValue?: string; cnyValue?: string } = {},
    ) => ({
      amount: { asset: { kind: ASSET_KINDS.Currency, code }, value },
      coverage,
      window,
      ...converted,
    })
    const base = {
      siteName: "Mixed money",
      includeTodayCashflow: true,
      income: {
        nativeCoverage: coverage,
        groups: [
          group(CURRENCIES.USD, "2", { cnyValue: "28" }),
          group(CURRENCIES.CNY, "140", { usdValue: "10" }),
        ],
      },
      consumption: {
        nativeCoverage: coverage,
        groups: [group(CURRENCIES.USD, "1", { cnyValue: "14" })],
      },
    }
    expect(
      buildAccountShareSnapshotPayload({
        ...base,
        currencyType: "USD",
        currencyDisplay: "USD",
      }).todayNetAmount,
    ).toEqual({
      asset: { kind: ASSET_KINDS.Currency, code: "USD" },
      value: "11",
    })
    expect(
      buildAccountShareSnapshotPayload({
        ...base,
        currencyType: "CNY",
        currencyDisplay: "CNY",
      }).todayNetAmount,
    ).toEqual({
      asset: { kind: ASSET_KINDS.Currency, code: "CNY" },
      value: "154",
    })
    expect(
      buildAccountShareSnapshotPayload({
        ...base,
        currencyType: "CNY",
        currencyDisplay: "original",
      }).todayNetAmount,
    ).toBeUndefined()
  })
  it("shares the same combined monetary overview as the selected display currency", () => {
    const payload = buildOverviewShareSnapshotPayload({
      currencyType: CURRENCIES.USD,
      currencyDisplay: CURRENCIES.USD,
      enabledAccountCount: 2,
      includeTodayCashflow: false,
      portfolio: {
        amounts: [
          {
            asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
            value: "2",
          },
          {
            asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
            value: "140",
          },
        ],
        cnyInUsd: "10",
        usdInCny: "28",
        convertedCurrencyTotals: { USD: "12", CNY: "168" },
        coverage: FINANCIAL_COVERAGE.Complete,
        includedCount: 2,
        eligibleCount: 2,
        duplicateCount: 0,
        potentialDuplicateCount: 0,
        manualCount: 0,
        conflictCount: 0,
      },
    })
    const caption = generateShareSnapshotCaption(payload)
    expect(caption).toContain("$12.00")
    expect(caption).toContain("$2.00")
    expect(caption).toContain("¥140.00")
  })
  it("shares a yuan overview using the contributing account rate rather than a default rate", () => {
    const payload = buildOverviewShareSnapshotPayload({
      currencyType: CURRENCIES.USD,
      enabledAccountCount: 1,
      includeTodayCashflow: false,
      portfolio: {
        amounts: [
          {
            asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
            value: "140",
          },
        ],
        cnyInUsd: "10",
        coverage: FINANCIAL_COVERAGE.Complete,
        includedCount: 1,
        eligibleCount: 1,
        duplicateCount: 0,
        potentialDuplicateCount: 0,
        manualCount: 0,
        conflictCount: 0,
      },
    })
    const caption = generateShareSnapshotCaption(payload)
    expect(caption).toContain("$10.00")
    expect(caption).not.toContain("$19.44")
    expect(caption).toContain("¥140.00")
  })
  it("shares yuan cashflow in dollars using its contributing account conversion", () => {
    const coverage = {
      status: "complete" as const,
      completeCount: 1,
      partialCount: 0,
      eligibleCount: 1,
      legacyUnclassifiedCount: 0,
    }
    const summary = publicConsumptionSummary({
      groups: [
        {
          amount: {
            asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
            value: "140",
          },
          usdValue: "10",
          window: { start: 1000, end: 2000, timeZone: "UTC" },
          coverage,
        },
      ],
      nativeCoverage: coverage,
    })
    const caption = shareConsumptionLines(
      summary,
      "en-US",
      ACCOUNT_CASHFLOW_METRICS.Income,
      CURRENCIES.USD,
    ).join("\n")
    expect(caption).toMatch(/USD\s10\b/)
    expect(caption).toMatch(/CNY\s140\b/)
  })
  it("shares original account currency after a converted currency was selected", () => {
    const now = Date.now()
    const scope = accountBalanceScope({
      accountId: "original-account",
      baseUrl: "https://original-sharing.example",
    })
    const payload = buildAccountShareSnapshotPayload({
      currencyType: CURRENCIES.CNY,
      currencyDisplay: CURRENCY_DISPLAY_MODES.Original,
      exchangeRate: 7,
      siteName: "Original account",
      includeTodayCashflow: false,
      balanceSnapshot: accountBalanceSnapshot(
        scope,
        [
          balancePosition({
            id: "available",
            scope,
            value: "2",
            asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
            observedAt: now,
            source: {
              kind: EVIDENCE_KINDS.Reported,
              adapter: "fixture",
              operation: "balance",
              contractVersion: "1",
            },
          }),
        ],
        now,
        FINANCIAL_COVERAGE.Complete,
      ),
    })
    const caption = generateShareSnapshotCaption(payload)
    expect(caption).toContain("$2.00")
    expect(caption).not.toContain("¥14.00")
  })
  it("keeps a partial provider-day cost qualified in the public caption", () => {
    const payload = buildAccountShareSnapshotPayload({
      siteName: "Example",
      currencyType: CURRENCIES.USD,
      includeTodayCashflow: true,
      siteDayUsage: [
        {
          scope: ACCOUNT_USAGE_SCOPES.SiteToday,
          cost: {
            asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
            coverage: FINANCIAL_COVERAGE.Partial,
            amount: {
              status: OBSERVATION_STATUSES.Known,
              value: "3.5",
              observedAt: 1000,
              source: {
                kind: EVIDENCE_KINDS.Reported,
                adapter: "private-adapter",
                operation: "private-path",
                contractVersion: "1",
              },
            },
          },
        },
      ],
    })
    expect(generateShareSnapshotCaption(payload)).toContain(
      "account:todayMetricAvailability.partial",
    )
    expect(JSON.stringify(payload)).not.toContain("private-adapter")
  })

  it("keeps explicitly reported reset timing in the full account caption without sharing restriction IDs", () => {
    const now = Date.now()
    const scope = accountBalanceScope({
      baseUrl: "https://sharing.example",
      accountId: "private-account",
    })
    const snapshot = accountBalanceSnapshot(
      scope,
      [
        balancePosition({
          id: "legacy-plan",
          scope,
          value: "20",
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
          source: {
            kind: EVIDENCE_KINDS.Legacy,
            adapter: "legacy",
            operation: "stored-account",
            contractVersion: "1",
          },
          observedAt: now,
          reportedTiming: { resetsAt: "2099-12-30T00:00:00Z" },
        }),
      ],
      now,
      "unknown",
    )
    const payload = buildAccountShareSnapshotPayload({
      siteName: "Example",
      currencyType: CURRENCIES.USD,
      balanceSnapshot: snapshot,
      includeTodayCashflow: false,
    })
    expect(generateShareSnapshotCaption(payload)).toContain(
      "2099-12-30T00:00:00Z",
    )
    expect(JSON.stringify(payload)).not.toContain("private-account")
  })
  it("shares a purchased allowance when the provider has no separate wallet", () => {
    const at = Date.now()
    const scope = accountBalanceScope({
      baseUrl: "https://share-balance.invalid",
    })
    const payload = buildAccountShareSnapshotPayload({
      siteName: "FoxCode",
      currencyType: CURRENCIES.USD,
      includeTodayCashflow: false,
      allowances: {
        schemaVersion: 1,
        capturedAt: at,
        subject: scope.subject,
        coverage: FINANCIAL_COVERAGE.Complete,
        entries: [
          {
            id: "private-plan-id",
            collectionKey: "active-plans",
            identityKind: "upstream",
            validity: {
              kind: BALANCE_VALIDITY_KINDS.Expires,
              at: at + 86400_000,
            },
            constraint: budgetConstraint({
              scope,
              source: {
                adapter: "foxcode",
                operation: "plans",
                contractVersion: "1",
                kind: EVIDENCE_KINDS.Reported,
              },
              asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
              limitState: BUDGET_LIMIT_STATES.Finite,
              limit: "10",
              remaining: "8",
              window: { kind: BUDGET_WINDOW_KINDS.Lifetime },
              enabled: true,
              observedAt: at,
            }),
          },
          {
            id: "old-daily-plan",
            collectionKey: "active-plans",
            identityKind: "upstream",
            validity: {
              kind: BALANCE_VALIDITY_KINDS.Expires,
              at: at + 86400_000,
            },
            constraint: budgetConstraint({
              scope,
              source: {
                adapter: "foxcode",
                operation: "plans",
                contractVersion: "1",
                kind: EVIDENCE_KINDS.Reported,
              },
              asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
              limitState: BUDGET_LIMIT_STATES.Finite,
              remaining: "99",
              window: {
                kind: BUDGET_WINDOW_KINDS.Periodic,
                period: "day",
                resetsAt: at - 1,
              },
              enabled: true,
              observedAt: at - 1000,
            }),
          },
        ],
      },
    })
    expect(payload.balanceSummary?.entries).toMatchObject([
      { role: "allowance", amount: { value: "8" } },
    ])
    expect(generateShareSnapshotCaption(payload)).toContain("8")
    expect(JSON.stringify(payload)).not.toContain("private-plan-id")
  })
  it("shares the selected USD display currency and account rate while retaining native CNY", () => {
    const scope = accountBalanceScope({
      baseUrl: "https://share-balance.invalid",
    })
    const source = {
      adapter: "fixture",
      operation: "balance",
      contractVersion: "1",
      kind: EVIDENCE_KINDS.Reported,
    } as const
    const snapshot = accountBalanceSnapshot(
      scope,
      [
        balancePosition({
          id: "usd",
          scope,
          source,
          observedAt: 100,
          value: "10",
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
        }),
        balancePosition({
          id: "cny",
          scope,
          source,
          observedAt: 100,
          value: "8",
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
        }),
      ],
      100,
      "complete",
    )
    const caption = generateShareSnapshotCaption(
      buildAccountShareSnapshotPayload({
        currencyType: CURRENCIES.CNY,
        exchangeRate: 7,
        siteName: "Display parity",
        balanceSnapshot: snapshot,
        includeTodayCashflow: false,
      }),
    )
    expect(caption).toContain("¥70.00")
    expect(caption).toContain("¥8.00")
  })
  it.each(Object.values(ACCOUNT_CASHFLOW_METRICS))(
    "prefixes partial %s before amounts so line truncation preserves uncertainty",
    (metric) => {
      const coverage = {
        status: "partial" as const,
        completeCount: 1,
        partialCount: 1,
        eligibleCount: 3,
        legacyUnclassifiedCount: 0,
      }
      const lines = shareConsumptionLines(
        {
          groups: [
            {
              amount: {
                asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
                value: "12",
              },
              window: { start: 1, end: 2, timeZone: "UTC" },
              coverage,
            },
          ],
          nativeCoverage: coverage,
        },
        "en",
        metric,
      )
      expect(lines[0]).toMatch(/^account:todayMetricAvailability.partial/)
      expect(lines[0]).toContain("12")
    },
  )
  it.each(Object.values(ACCOUNT_CASHFLOW_METRICS))(
    "shares exact native %s intervals independently from legacy cashflow and private IDs",
    (metric) => {
      const window = {
        start: 1700000000000,
        end: 1700000001000,
        timeZone: "UTC",
      }
      const coverage = {
        status: "complete" as const,
        completeCount: 1,
        partialCount: 0,
        eligibleCount: 1,
        legacyUnclassifiedCount: 0,
      }
      const consumption = {
        groups: [
          {
            amount: {
              asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
              value: "1.000000000000000017",
            },
            window,
            coverage,
            privateId: "private-account",
          },
        ],
        nativeCoverage: coverage,
      }
      const payload = buildOverviewShareSnapshotPayload({
        currencyType: CURRENCIES.USD,
        enabledAccountCount: 1,
        includeTodayCashflow: true,
        todayIncome: 7,
        todayOutcome: 999,
        [metric]: consumption,
      })
      expect(
        payload[
          metric === ACCOUNT_CASHFLOW_METRICS.Income
            ? "incomeSummary"
            : "consumptionSummary"
        ]?.groups[0]?.amount.value,
      ).toBe("1.000000000000000017")
      expect(payload).not.toHaveProperty("todayOutcome")
      expect(payload).not.toHaveProperty("todayNet")
      expect(JSON.stringify(payload)).not.toContain("private-account")
      const caption = generateShareSnapshotCaption(payload)
      expect(caption).toContain("1.000000000000000017")
      expect(caption).toContain("CNY")
      expect(caption).toContain("UTC")
      expect(caption).not.toContain("999")
    },
  )
  it.each([true, false])(
    "shares a net amount only for matching complete native periods (%s)",
    (samePeriod) => {
      const coverage = {
        status: "complete" as const,
        completeCount: 1,
        partialCount: 0,
        eligibleCount: 1,
        legacyUnclassifiedCount: 0,
      }
      const summary = (value: string, end: number) => ({
        groups: [
          {
            amount: {
              asset: { kind: "currency" as const, code: CURRENCIES.USD },
              value,
            },
            window: { start: 1, end, timeZone: "UTC" },
            coverage,
          },
        ],
        nativeCoverage: coverage,
      })
      const payload = buildOverviewShareSnapshotPayload({
        currencyType: CURRENCIES.USD,
        enabledAccountCount: 1,
        includeTodayCashflow: true,
        income: summary("2.50", 3),
        consumption: summary("1.75", samePeriod ? 3 : 2),
      })
      expect(payload.todayNetAmount?.value).toBe(
        samePeriod ? "0.75" : undefined,
      )
      if (samePeriod)
        expect(generateShareSnapshotCaption(payload)).toContain("0.75")
    },
  )
  it("shares native account facts, unknown components and observation times without using legacy USD", () => {
    const scope = accountBalanceScope({
      baseUrl: "https://platform.kimi.com",
      accountId: "secret-local-account",
      auth: { authType: "access_token" },
    } as never)
    const source = {
      adapter: "kimi",
      operation: "console/account",
      contractVersion: "2",
      kind: EVIDENCE_KINDS.Reported,
    } as const
    const known = balancePosition({
      id: "available",
      scope,
      source,
      observedAt: 1700000000000,
      asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
      value: "8",
    })
    const unavailable = balancePosition({
      id: "voucher",
      scope,
      source,
      observedAt: 1700000000000,
      asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
      value: undefined,
      parentId: "available",
      relation: BALANCE_RELATIONS.Component,
    })
    const payload = buildAccountShareSnapshotPayload({
      currencyType: CURRENCIES.USD,
      siteName: "Kimi",
      balance: 999,
      balanceSnapshot: accountBalanceSnapshot(
        scope,
        [known, unavailable],
        1700000000000,
        FINANCIAL_COVERAGE.Complete,
      ),
      includeTodayCashflow: false,
    })
    const caption = generateShareSnapshotCaption(payload)
    expect(caption).toContain("CNY")
    expect(caption).not.toContain("999")
    expect(caption).toContain("shareSnapshots:financial.unavailable")
    expect(JSON.stringify(payload)).not.toContain("secret-local-account")
    expect(payload.balanceSummary?.entries[0]).toMatchObject({
      amount: { value: "8", asset: { kind: "currency", code: "CNY" } },
      observedAt: 1700000000000,
    })
  })
  it("shares native overview subtotals with coverage and no invented USD", () => {
    const payload = buildOverviewShareSnapshotPayload({
      currencyType: CURRENCIES.USD,
      enabledAccountCount: 4,
      totalBalance: 999,
      portfolio: {
        amounts: [
          {
            value: "12",
            asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
          },
          {
            value: "2000",
            asset: {
              kind: ASSET_KINDS.Quota,
              id: "emrank:tokens",
              label: "Tokens",
              displayLabel: "Tokens",
              displayScale: 1,
            },
          },
        ],
        includedCount: 2,
        eligibleCount: 4,
        coverage: FINANCIAL_COVERAGE.Partial,
        conflictCount: 1,
        duplicateCount: 1,
        potentialDuplicateCount: 1,
        manualCount: 1,
      },
      includeTodayCashflow: false,
    })
    const caption = generateShareSnapshotCaption(payload)
    expect(caption).toContain("¥12.00")
    expect(caption).toContain("Tokens")
    expect(caption).not.toContain("999")
    expect(caption).toContain("account:financial.availableTotal")
    expect(caption).toContain("shareSnapshots:financial.partial")
    expect(caption).toContain("account:financial.conflicts")
    expect(payload.balanceSummary).toMatchObject({
      includedCount: 2,
      eligibleCount: 4,
      duplicateCount: 1,
      potentialDuplicateCount: 1,
      manualCount: 1,
    })
  })

  it("keeps stale observations, incomplete coverage and public windows without private identifiers", () => {
    const scope = accountBalanceScope({
      baseUrl: "https://example.com",
      accountId: "private-account",
      auth: { authType: "access_token" },
    } as never)
    scope.walletId = "private-wallet"
    scope.organizationId = "private-org"
    scope.models = {
      kind: SCOPE_SELECTION_KINDS.Restricted,
      ids: ["private-model"],
    }
    const source = {
      adapter: "kimi",
      operation: "inference/balance",
      contractVersion: "2",
      kind: EVIDENCE_KINDS.Reported,
    } as const
    const position = balancePosition({
      id: "private-position",
      scope,
      source,
      observedAt: 1700000000000,
      asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
      value: "10",
    })
    position.amount = {
      status: OBSERVATION_STATUSES.Stale,
      value: "10",
      source,
      observedAt: 1700000000000,
      reason: "private-server-error",
    }
    position.window = {
      start: 1699920000000,
      end: 1700006400000,
      timeZone: "Asia/Shanghai",
    }
    const payload = buildAccountShareSnapshotPayload({
      currencyType: CURRENCIES.USD,
      siteName: "Kimi",
      originUrl:
        "https://user:private-password@example.com/path?token=private-token",
      balanceSnapshot: accountBalanceSnapshot(
        scope,
        [position],
        1700000001000,
        FINANCIAL_COVERAGE.Complete,
      ),
      includeTodayCashflow: false,
    })
    expect(payload.balanceSummary?.coverage).toBe("partial")
    expect(payload.balanceSummary?.entries[0]).toMatchObject({
      status: "stale",
      observedAt: 1700000000000,
      window: {
        start: 1699920000000,
        end: 1700006400000,
        timeZone: "Asia/Shanghai",
      },
    })
    const caption = generateShareSnapshotCaption(payload)
    expect(caption).toContain("account:financial.lastKnown")
    expect(caption).toContain("account:financial.restricted")
    expect(caption).not.toContain("account:financial.scopeUnknown")
    expect(caption).not.toContain("kimi/inference/balance@2")
    expect(caption).not.toContain("account:financial.unknownNature")
    expect(JSON.stringify(payload)).not.toContain("private-")
    expect(payload.originUrl).toBe("https://example.com")
  })

  it("shows finite legacy input as a reference with unknown coverage", () => {
    for (const balance of [0, 123, Number.NaN]) {
      const payload = buildAccountShareSnapshotPayload({
        currencyType: CURRENCIES.USD,
        siteName: "Old account",
        balance,
        includeTodayCashflow: false,
      })
      expect(payload.balance).toBeUndefined()
      expect(payload.balanceSummary).toMatchObject({
        coverage: "unknown",
        entries: [],
      })
      expect(generateShareSnapshotCaption(payload)).toContain(
        Number.isFinite(balance)
          ? "account:financial.lastKnown"
          : "shareSnapshots:financial.unavailable",
      )
    }
  })

  it("shows a missing amount's known native asset instead of hiding its unit", () => {
    const scope = accountBalanceScope({
      baseUrl: "https://example.com",
      auth: { authType: "access_token" },
    } as never)
    const position = balancePosition({
      id: "cash",
      scope,
      source: {
        adapter: "test",
        operation: "wallet",
        contractVersion: "2",
        kind: EVIDENCE_KINDS.Reported,
      },
      observedAt: 1,
      asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
      value: undefined,
      cashClassification: BALANCE_CASH_CLASSIFICATIONS.ReportedCash,
    })
    const payload = buildAccountShareSnapshotPayload({
      currencyType: CURRENCIES.USD,
      siteName: "Example",
      balanceSnapshot: accountBalanceSnapshot(
        scope,
        [position],
        1,
        FINANCIAL_COVERAGE.Partial,
      ),
      includeTodayCashflow: false,
    })
    expect(generateShareSnapshotCaption(payload)).toContain("CNY")
    expect(generateShareSnapshotCaption(payload)).toContain(
      "account:financial.cash",
    )
  })

  describe("createShareSnapshotSeed", () => {
    it("returns a uint32 seed compatible with mulberry32", () => {
      const seed = createShareSnapshotSeed()
      const UINT32_MAX = 0xffffffff

      expect(Number.isInteger(seed)).toBe(true)
      expect(seed).toBeGreaterThanOrEqual(0)
      expect(seed).toBeLessThanOrEqual(UINT32_MAX)
      expect(seed >>> 0).toBe(seed)
    })

    it("falls back to Math.random when crypto.getRandomValues is unavailable", () => {
      const originalCrypto = globalThis.crypto

      Object.defineProperty(globalThis, "crypto", {
        value: undefined,
        configurable: true,
      })

      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5)

      try {
        expect(createShareSnapshotSeed()).toBe(2147483648)
      } finally {
        randomSpy.mockRestore()
        Object.defineProperty(globalThis, "crypto", {
          value: originalCrypto,
          configurable: true,
        })
      }
    })
  })

  describe("redactShareSecrets", () => {
    it("redacts Bearer tokens", () => {
      expect(redactShareSecrets("Authorization: Bearer abc.def")).toBe(
        "Authorization: Bearer [REDACTED]",
      )
    })

    it("redacts JWT-like tokens", () => {
      const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaaaa.bbbbb"
      expect(redactShareSecrets(`token=${jwt}`)).toBe("token=[REDACTED_JWT]")
    })
  })

  describe("formatting helpers", () => {
    it("preserves negative signs for account balances and explicit signs for cashflow values", () => {
      expect(formatCurrencyAmount(-12.34, "USD")).toBe("-$12.34")
      expect(formatSignedCurrencyAmount(12.34, "USD")).toBe("+$12.34")
      expect(formatSignedCurrencyAmount(-12.34, "USD")).toBe("-$12.34")
    })

    it("falls back to the current time when formatting an invalid as-of timestamp", () => {
      vi.useFakeTimers()
      try {
        vi.setSystemTime(new Date("2026-02-10T12:34:56.000Z"))

        expect(formatAsOfTimestamp(0, "en-US")).toBe(
          new Date(Date.now()).toLocaleString("en-US"),
        )
      } finally {
        vi.useRealTimers()
      }
    })

    it("uses the runtime locale when no explicit locale is provided", () => {
      const timestamp = Date.parse("2026-02-10T12:34:56.000Z")
      expect(formatAsOfTimestamp(timestamp)).toBe(
        new Date(timestamp).toLocaleString(),
      )
    })

    it("computes luminance for both dark and bright RGB ranges", () => {
      const dark = relativeLuminanceFromRgb({ r: 10, g: 10, b: 10 })
      const bright = relativeLuminanceFromRgb({ r: 255, g: 255, b: 255 })

      expect(dark).toBeGreaterThanOrEqual(0)
      expect(bright).toBeLessThanOrEqual(1)
      expect(bright).toBeGreaterThan(dark)
    })
  })

  describe("buildOverviewShareSnapshotPayload", () => {
    it("omits today cashflow fields when disabled", () => {
      const payload = buildOverviewShareSnapshotPayload({
        currencyType: CURRENCIES.USD,
        enabledAccountCount: 3,
        totalBalance: 12.34,
        includeTodayCashflow: false,
        todayIncome: 1,
        todayOutcome: 2,
      })

      expect(payload.kind).toBe("overview")
      expect(payload.todayIncome).toBeUndefined()
      expect(payload.todayOutcome).toBeUndefined()
      expect(payload.todayNet).toBeUndefined()
    })

    it("computes today net when enabled", () => {
      const payload = buildOverviewShareSnapshotPayload({
        currencyType: CURRENCIES.USD,
        enabledAccountCount: 2,
        totalBalance: 99,
        includeTodayCashflow: true,
        todayIncome: 5,
        todayOutcome: 3,
        asOf: 1700000000000,
        backgroundSeed: 123,
      })

      expect(payload.todayNet).toBe(2)
      expect(payload.asOf).toBe(1700000000000)
      expect(payload.backgroundSeed).toBe(123)
    })

    it("omits the entire cashflow bundle when finite inputs overflow the derived net", () => {
      const payload = buildOverviewShareSnapshotPayload({
        currencyType: CURRENCIES.USD,
        enabledAccountCount: 1,
        totalBalance: 99,
        includeTodayCashflow: true,
        todayIncome: Number.MAX_VALUE,
        todayOutcome: -Number.MAX_VALUE,
      })

      expect(payload.todayIncome).toBeUndefined()
      expect(payload.todayOutcome).toBeUndefined()
      expect(payload.todayNet).toBeUndefined()
    })

    it("falls back to export time when asOf is missing", () => {
      vi.useFakeTimers()
      try {
        vi.setSystemTime(new Date("2026-02-10T12:00:00.000Z"))

        const payload = buildOverviewShareSnapshotPayload({
          currencyType: CURRENCIES.USD,
          enabledAccountCount: 1,
          totalBalance: 1,
          includeTodayCashflow: false,
        })

        expect(payload.asOf).toBe(Date.now())
      } finally {
        vi.useRealTimers()
      }
    })

    it("normalizes invalid numeric inputs before exposing overview payload data", () => {
      vi.useFakeTimers()
      try {
        vi.setSystemTime(new Date("2026-02-10T12:00:00.000Z"))

        const payload = buildOverviewShareSnapshotPayload({
          currencyType: CURRENCIES.USD,
          enabledAccountCount: -3.8,
          totalBalance: Number.NaN,
          includeTodayCashflow: true,
          todayIncome: Number.NaN,
          todayOutcome: undefined,
          asOf: 0,
          backgroundSeed: 0,
        })

        expect(payload.enabledAccountCount).toBe(0)
        expect(payload.totalBalance).toBeUndefined()
        expect(payload.balanceSummary?.coverage).toBe("unknown")
        expect(payload.todayIncome).toBeUndefined()
        expect(payload.todayOutcome).toBeUndefined()
        expect(payload.todayNet).toBeUndefined()
        expect(payload.asOf).toBe(Date.now())
        expect(Number.isInteger(payload.backgroundSeed)).toBe(true)
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe("buildAccountShareSnapshotPayload", () => {
    it("trims safe display fields and drops blank origin URLs", () => {
      vi.useFakeTimers()
      try {
        vi.setSystemTime(new Date("2026-02-10T12:00:00.000Z"))

        const payload = buildAccountShareSnapshotPayload({
          currencyType: CURRENCIES.USD,
          siteName: "  Example Site  ",
          originUrl: "   ",
          balance: Number.NaN,
          includeTodayCashflow: false,
          asOf: -1,
          backgroundSeed: Number.NaN,
        })

        expect(payload.siteName).toBe("Example Site")
        expect(payload.originUrl).toBeUndefined()
        expect(payload.balance).toBeUndefined()
        expect(payload.balanceSummary?.coverage).toBe("unknown")
        expect(payload.asOf).toBe(Date.now())
        expect(Number.isInteger(payload.backgroundSeed)).toBe(true)
      } finally {
        vi.useRealTimers()
      }
    })

    it.each([
      { todayIncome: undefined, todayOutcome: 2, label: "missing income" },
      { todayIncome: 1, todayOutcome: undefined, label: "missing outcome" },
      { todayIncome: Number.NaN, todayOutcome: 2, label: "nonfinite income" },
      {
        todayIncome: 1,
        todayOutcome: Number.POSITIVE_INFINITY,
        label: "nonfinite outcome",
      },
      {
        todayIncome: Number.MAX_VALUE,
        todayOutcome: -Number.MAX_VALUE,
        label: "overflowing derived net",
      },
    ])("omits the entire cashflow bundle for $label", (cashflow) => {
      const payload = buildAccountShareSnapshotPayload({
        currencyType: CURRENCIES.USD,
        siteName: "Example Site",
        balance: 10,
        includeTodayCashflow: true,
        todayIncome: cashflow.todayIncome,
        todayOutcome: cashflow.todayOutcome,
      })

      expect(payload.todayIncome).toBeUndefined()
      expect(payload.todayOutcome).toBeUndefined()
      expect(payload.todayNet).toBeUndefined()
    })
  })

  describe("generateShareSnapshotCaption", () => {
    it("generates an overview caption without per-account identifiers", () => {
      const payload = buildOverviewShareSnapshotPayload({
        currencyType: CURRENCIES.USD,
        enabledAccountCount: 7,
        totalBalance: 123.45,
        includeTodayCashflow: false,
        asOf: 1700000000000,
        backgroundSeed: 1,
      })

      const caption = generateShareSnapshotCaption(payload)

      expect(caption).toContain("All API Hub")
      expect(caption).toContain("shareSnapshots:labels.overview")
      expect(caption).toContain("account:financial.availableTotal")
      expect(caption).toContain("shareSnapshots:labels.accounts: 7")
      expect(caption).toContain("shareSnapshots:labels.asOf")
      expect(caption).not.toContain("shareSnapshots:labels.snapshot")
      expect(caption).not.toContain("https://")
    })

    it("includes today cashflow line only when present", () => {
      const payload = buildAccountShareSnapshotPayload({
        currencyType: CURRENCIES.USD,
        siteName: "Example Site",
        originUrl: "https://example.com",
        balance: 12.34,
        includeTodayCashflow: true,
        todayIncome: 2,
        todayOutcome: 1,
        asOf: 1700000000000,
        backgroundSeed: 1,
      })

      const caption = generateShareSnapshotCaption(payload)

      expect(caption).toContain("Example Site")
      expect(caption).toContain("https://example.com")
      expect(caption).toContain("shareSnapshots:labels.balance")
      expect(caption).toContain("shareSnapshots:labels.today")
      expect(caption).toContain("shareSnapshots:labels.income")
      expect(caption).toContain("shareSnapshots:labels.outcome")
      expect(caption).toContain("shareSnapshots:labels.net")
      expect(caption).toContain("shareSnapshots:labels.asOf")
    })

    it("omits the origin line when the account payload does not include a safe origin URL", () => {
      const payload = buildAccountShareSnapshotPayload({
        currencyType: CURRENCIES.USD,
        siteName: "Example Site",
        originUrl: "   ",
        balance: 12.34,
        includeTodayCashflow: false,
        asOf: 1700000000000,
        backgroundSeed: 1,
      })

      const caption = generateShareSnapshotCaption(payload)

      expect(caption).toContain("All API Hub")
      expect(caption).toContain("Example Site")
      expect(caption).not.toContain("https://")
      expect(caption).toContain("account:financial.lastKnown")
      expect(caption).toContain("$12.34")
      expect(caption).toContain("shareSnapshots:financial.unknown")
    })
  })
})
it("shares a known provider-day cost independently of unavailable local-day totals", () => {
  const usage = {
    scope: "site_today" as const,
    totalRequests: 4,
    cost: {
      asset: { kind: "currency" as const, code: CURRENCIES.USD },
      amount: {
        status: "known" as const,
        value: "3.5",
        observedAt: 100,
        source: {
          kind: "reported" as const,
          adapter: "fixture",
          operation: "daily",
          contractVersion: "1",
        },
      },
    },
  }
  const payload = buildOverviewShareSnapshotPayload({
    currencyType: CURRENCIES.USD,
    enabledAccountCount: 1,
    includeTodayCashflow: true,
    siteDayUsage: [usage],
    asOf: 100,
  })
  expect(payload.siteDayUsage?.[0]?.cost?.value).toBe("3.5")
  expect(generateShareSnapshotCaption(payload)).toContain("3.5")
  expect(JSON.stringify(payload.siteDayUsage)).not.toContain("operation")
  expect(
    buildOverviewShareSnapshotPayload({
      currencyType: "USD",
      enabledAccountCount: 1,
      includeTodayCashflow: false,
      siteDayUsage: [usage],
    }).siteDayUsage,
  ).toBeUndefined()
})
