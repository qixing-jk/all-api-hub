import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest"

import { ACCOUNT_USAGE_SCOPES } from "~/constants/accountUsage"
import { CURRENCIES, CURRENCY_DISPLAY_MODES } from "~/constants/money"
import enAccount from "~/locales/en/account.json"
import {
  accountBalanceScope,
  accountBalanceSnapshot,
} from "~/services/accounts/balanceSnapshot"
import {
  getDisplayConsumptionProjection,
  getDisplayIncomeProjection,
} from "~/services/accounts/metrics/consumptionProjection"
import { balancePosition, staleObservation } from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  BALANCE_RELATIONS,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_OBSERVATION_REASONS,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import {
  buildAccountShareSnapshotPayload,
  buildOverviewShareSnapshotPayload,
} from "~/services/sharing/shareSnapshots"
import { SHARE_SNAPSHOT_KINDS } from "~/services/sharing/shareSnapshots/constants"
import { drawShareSnapshotOverlay } from "~/services/sharing/shareSnapshots/shareSnapshotOverlay"
import type { ShareSnapshotOverlayLabels } from "~/services/sharing/shareSnapshots/shareSnapshotOverlay"
import type { ShareSnapshotPayload } from "~/services/sharing/shareSnapshots/types"
import i18n from "~/utils/i18n/core"
import {
  buildFinancialIncomeFact,
  buildFinancialPeriodFact,
} from "~~/tests/test-utils/accountTodayStats"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"

/**
 * Unit tests for the share snapshot canvas overlay renderer.
 * Focuses on the `showTodayCashflow` behavior: placeholders when absent and a
 * today-net subline when present.
 */
const LABELS: ShareSnapshotOverlayLabels = {
  overview: "Overview",
  totalBalance: "Total balance",
  balance: "Balance",
  accounts: "Accounts",
  site: "Site",
  asOf: "As of",
  today: "Today",
  income: "Income",
  outcome: "Outcome",
  net: "Net",
}

it("renders a saved account reference balance on the canvas", () => {
  const { ctx, fillTextCalls } = createMockContext()
  const payload = buildAccountShareSnapshotPayload({
    siteName: "Reference",
    currencyType: "USD",
    balance: 12.34,
    includeTodayCashflow: false,
  })
  drawShareSnapshotOverlay(ctx, {
    payload,
    width: 1200,
    height: 1200,
    locale: "en",
    labels: LABELS,
    watermarkText: "All API Hub",
  })
  expect(fillTextCalls.map((call) => call.text)).toContain("$12.34")
})

it("places mixed-freshness portfolio status below the native subtotals", () => {
  const { ctx, fillTextCalls } = createMockContext()
  drawShareSnapshotOverlay(ctx, {
    payload: {
      kind: "overview",
      enabledAccountCount: 2,
      currencyType: "USD",
      currencyDisplay: "original",
      asOf: 100,
      backgroundSeed: 1,
      balanceSummary: {
        purpose: "available",
        entries: [],
        coverage: "partial",
        lastKnownCount: 1,
        amounts: [
          { asset: { kind: "currency", code: "USD" }, value: "10" },
          { asset: { kind: "currency", code: "EUR" }, value: "2" },
        ],
      },
    },
    width: 1200,
    height: 1200,
    locale: "en",
    labels: LABELS,
    watermarkText: "All API Hub",
  })
  const usd = fillTextCalls.find((call) => call.text === "$10.00")!
  const note = fillTextCalls.find(
    (call) => call.text === "account:financial.lastKnown",
  )!
  expect(note.y).toBeGreaterThan(usd.y)
})

it("keeps the recorded CNY denomination on a legacy original-mode net", () => {
  const { ctx, fillTextCalls } = createMockContext()
  drawShareSnapshotOverlay(ctx, {
    payload: {
      kind: "account",
      siteName: "Legacy",
      currencyType: "CNY",
      currencyDisplay: "original",
      asOf: 100,
      backgroundSeed: 1,
      todayIncome: 20,
      todayOutcome: 5,
      todayNet: 15,
    },
    width: 1200,
    height: 1200,
    locale: "en",
    labels: LABELS,
    watermarkText: "All API Hub",
  })
  expect(
    fillTextCalls.some(
      (call) => call.text.includes("15.00") && call.text.includes("¥"),
    ),
  ).toBe(true)
})

it.each([
  [CURRENCIES.USD, /^USD\s2$/, /^USD\s4$/],
  [CURRENCIES.CNY, /^CNY\s21$/, /^CNY\s42$/],
] as const)(
  "renders one complete %s cashflow total on the public canvas",
  (currency, cost, received) => {
    const sites = ([CURRENCIES.USD, CURRENCIES.CNY] as const).map((code) =>
      buildDisplaySiteData({
        id: code,
        exchangeRate: code === CURRENCIES.USD ? 7 : 14,
        settledConsumption: [
          buildFinancialPeriodFact({
            accountId: code,
            value: code === CURRENCIES.USD ? "1" : "14",
            asset: { kind: ASSET_KINDS.Currency, code },
          }),
        ],
        reportedIncome: [
          buildFinancialIncomeFact({
            accountId: code,
            value: code === CURRENCIES.USD ? "2" : "28",
            asset: { kind: ASSET_KINDS.Currency, code },
          }),
        ],
      }),
    )
    const payload = buildOverviewShareSnapshotPayload({
      currencyType: currency,
      currencyDisplay: currency,
      enabledAccountCount: 2,
      includeTodayCashflow: true,
      consumption: getDisplayConsumptionProjection(sites),
      income: getDisplayIncomeProjection(sites),
    })
    const { ctx, fillTextCalls } = createMockContext()
    drawShareSnapshotOverlay(ctx, {
      width: 1200,
      height: 1200,
      locale: "en",
      watermarkText: "All API Hub",
      labels: LABELS,
      payload,
    })
    const texts = fillTextCalls.map(({ text }) => text)
    expect(texts.filter((text) => cost.test(text))).toHaveLength(1)
    expect(texts.filter((text) => received.test(text))).toHaveLength(1)
    expect(texts.join("\n")).not.toContain("todayMetricAvailability.partial")
    expect(texts.join("\n")).not.toContain(
      enAccount.todayMetricAvailability.partial,
    )
  },
)

it("renders the same combined converted balance as the overview", () => {
  const { ctx, fillTextCalls } = createMockContext()
  drawShareSnapshotOverlay(ctx, {
    width: 1200,
    height: 1200,
    locale: "en",
    watermarkText: "All API Hub",
    labels: LABELS,
    payload: {
      kind: SHARE_SNAPSHOT_KINDS.Overview,
      currencyType: CURRENCIES.USD,
      currencyDisplay: CURRENCIES.USD,
      enabledAccountCount: 2,
      asOf: Date.now(),
      backgroundSeed: 1,
      balanceSummary: {
        purpose: "available",
        entries: [],
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
      },
    },
  })
  expect(fillTextCalls.map(({ text }) => text)).toContain("$12.00")
})

it("renders original monetary units on the image after a converted preference", () => {
  const { ctx, fillTextCalls } = createMockContext()
  const scope = accountBalanceScope({
    accountId: "original-account",
    baseUrl: "https://original-sharing.example",
  })
  const now = Date.now()
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
  drawShareSnapshotOverlay(ctx, {
    width: 1200,
    height: 1200,
    locale: "en",
    watermarkText: "All API Hub",
    labels: LABELS,
    payload,
  })
  const text = fillTextCalls.map(({ text }) => text).join("\n")
  expect(text).toContain("$2.00")
  expect(text).not.toContain("¥14.00")
})

it.each([false, true])(
  "identifies purchased and granted balance components on the exported image with retained values %s",
  (lastKnown) => {
    i18n.addResourceBundle("en", "account", enAccount, true, true)
    onTestFinished(() => {
      i18n.removeResourceBundle("en", "account")
    })
    const { ctx, fillTextCalls } = createMockContext({
      measureText: (text) => ({ width: text.length * 15 }),
    })
    const scope = accountBalanceScope({
      baseUrl: "https://freemodel.dev",
      accountId: "account",
    })
    const common = {
      nature: "prepaid" as const,
      scope,
      asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
      observedAt: Date.now(),
      source: {
        adapter: "freemodel",
        operation: "/api/billing",
        contractVersion: "credit-cents/v1",
        kind: EVIDENCE_KINDS.Reported,
      },
    }
    const snapshot = accountBalanceSnapshot(
      scope,
      [
        balancePosition({ ...common, id: "available", value: "3" }),
        balancePosition({
          ...common,
          id: "purchased",
          value: "2",
          funding: "purchased",
          parentId: "available",
          relation: BALANCE_RELATIONS.Component,
        }),
        balancePosition({
          ...common,
          id: "signup-credit",
          value: "1",
          funding: "granted",
          parentId: "available",
          relation: BALANCE_RELATIONS.Component,
        }),
      ],
      Date.now(),
      FINANCIAL_COVERAGE.Complete,
    )
    const payload = buildAccountShareSnapshotPayload({
      siteName: "FreeModel",
      currencyType: CURRENCIES.USD,
      balanceSnapshot: lastKnown
        ? {
            ...snapshot,
            positions: snapshot.positions.map((position) => ({
              ...position,
              amount: staleObservation(
                position.amount,
                FINANCIAL_OBSERVATION_REASONS.RefreshUnavailable,
              ),
            })),
          }
        : snapshot,
      includeTodayCashflow: false,
    })
    drawShareSnapshotOverlay(ctx, {
      width: 1200,
      height: 1200,
      locale: "en",
      watermarkText: "All API Hub",
      labels: LABELS,
      payload,
    })
    const text = fillTextCalls.map(({ text }) => text).join("\n")
    expect(text).toContain("Purchased")
    expect(text).toContain("Granted")
    if (lastKnown) expect(text).toContain(enAccount.financial.lastKnown)
  },
)

it("keeps partial provider-day costs qualified in the exported image", () => {
  const { ctx, fillTextCalls } = createMockContext()
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
              adapter: "fixture",
              operation: "cost",
              contractVersion: "1",
            },
          },
        },
      },
    ],
  })
  const coverage = {
    status: "complete" as const,
    completeCount: 1,
    partialCount: 0,
    eligibleCount: 1,
    legacyUnclassifiedCount: 0,
  }
  drawShareSnapshotOverlay(ctx, {
    width: 1200,
    height: 1200,
    locale: "en",
    watermarkText: "All API Hub",
    labels: LABELS,
    payload: {
      ...payload,
      consumptionSummary: {
        groups: [
          {
            amount: {
              value: "0.12",
              asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
            },
            window: { start: 0, end: 1000, timeZone: "UTC" },
            coverage,
          },
        ],
        nativeCoverage: coverage,
      },
    },
  })
  expect(
    fillTextCalls.some((line) =>
      line.text.includes("account:todayMetricAvailability.partial"),
    ),
  ).toBe(true)
})

it("renders saved release cashflow amounts as references on the share image", () => {
  const { ctx, fillTextCalls } = createMockContext()
  const nativeCoverage = {
    status: "unavailable" as const,
    completeCount: 0,
    partialCount: 0,
    eligibleCount: 1,
    legacyUnclassifiedCount: 1,
  }
  drawShareSnapshotOverlay(ctx, {
    width: 1200,
    height: 1200,
    locale: "en",
    watermarkText: "All API Hub",
    labels: LABELS,
    payload: {
      kind: SHARE_SNAPSHOT_KINDS.Account,
      siteName: "Release",
      currencyType: CURRENCIES.USD,
      asOf: Date.now(),
      backgroundSeed: 1,
      consumptionSummary: {
        groups: [],
        nativeCoverage,
        references: [{ amount: { USD: 3.25, CNY: 22.75 }, lastKnown: true }],
      },
      incomeSummary: {
        groups: [],
        nativeCoverage,
        references: [{ amount: { USD: 2.5, CNY: 17.5 }, lastKnown: true }],
      },
    },
  })
  const text = fillTextCalls.map(({ text }) => text).join("\n")
  expect(text).toContain("3.25")
  expect(text).toContain("2.5")
  expect(text).toContain("account:financial.legacy")
})

it("shows provider-day request readings in the image when no monetary cost was reported", () => {
  const { ctx, fillTextCalls } = createMockContext()
  drawShareSnapshotOverlay(ctx, {
    width: 1200,
    height: 1200,
    locale: "en",
    watermarkText: "All API Hub",
    labels: LABELS,
    payload: {
      kind: SHARE_SNAPSHOT_KINDS.Overview,
      currencyType: CURRENCIES.USD,
      enabledAccountCount: 1,
      asOf: Date.now(),
      backgroundSeed: 1,
      siteDayUsage: [{ requests: 4, tokens: 123, lastKnown: true }],
    },
  })
  expect(fillTextCalls.map(({ text }) => text).join("\n")).toContain("123")
})

it("keeps a provider-day amount visible beside a local-day amount in the share image", () => {
  const { ctx, fillTextCalls } = createMockContext()
  const coverage = {
    status: "complete" as const,
    completeCount: 1,
    partialCount: 0,
    eligibleCount: 1,
    legacyUnclassifiedCount: 0,
  }
  drawShareSnapshotOverlay(ctx, {
    width: 1200,
    height: 1200,
    locale: "en",
    watermarkText: "All API Hub",
    labels: LABELS,
    payload: {
      kind: SHARE_SNAPSHOT_KINDS.Overview,
      currencyType: CURRENCIES.USD,
      enabledAccountCount: 2,
      asOf: Date.now(),
      backgroundSeed: 1,
      consumptionSummary: {
        nativeCoverage: coverage,
        groups: [
          {
            amount: {
              asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
              value: "1.23",
            },
            coverage,
            window: {
              start: 1700000000000,
              end: 1700000001000,
              timeZone: "UTC",
            },
          },
        ],
      },
      siteDayUsage: [
        {
          cost: {
            asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
            value: "43.21",
          },
          lastKnown: false,
        },
      ],
    },
  })
  const text = fillTextCalls.map(({ text }) => text).join("\n")
  expect(text).toContain("1.23")
  expect(text).toContain("43.21")
})

it("marks an old provider-day amount as last-known on the share image", () => {
  const { ctx, fillTextCalls } = createMockContext()
  drawShareSnapshotOverlay(ctx, {
    width: 1200,
    height: 1200,
    locale: "en",
    watermarkText: "All API Hub",
    labels: LABELS,
    payload: {
      kind: SHARE_SNAPSHOT_KINDS.Overview,
      currencyType: CURRENCIES.USD,
      enabledAccountCount: 1,
      asOf: Date.now(),
      backgroundSeed: 1,
      siteDayUsage: [
        {
          cost: {
            asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
            value: "2.5",
          },
          lastKnown: true,
          reportedDay: "2026-11-18",
        },
      ],
    },
  })
  expect(
    fillTextCalls.some(({ text }) =>
      text.includes("account:financial.lastKnown"),
    ),
  ).toBe(true)
})

const createMockContext = (options?: {
  getImageData?: CanvasRenderingContext2D["getImageData"]
  measureText?: (text: string, font: string) => { width: number }
}) => {
  const fillTextCalls: Array<{
    text: string
    x: number
    y: number
    fillStyle: string
    font: string
  }> = []

  const ctx = {
    font: "",
    textAlign: "left" as const,
    textBaseline: "top" as const,
    fillStyle: "",
    save: () => {},
    restore: () => {},
    measureText: (text: string) =>
      options?.measureText
        ? options.measureText(text, ctx.font)
        : { width: Math.max(0, text.length) * 10 },
    fillText: (text: string, x: number, y: number) => {
      fillTextCalls.push({
        text,
        x,
        y,
        fillStyle: ctx.fillStyle,
        font: ctx.font,
      })
    },
    getImageData:
      options?.getImageData ??
      (() => {
        throw new Error("Canvas readback not supported in unit test")
      }),
  }

  return { ctx: ctx as unknown as CanvasRenderingContext2D, fillTextCalls }
}

describe("shareSnapshotOverlay", () => {
  it("shows native asset and partial evidence while disclosing cropped digits and omitted groups", () => {
    const { ctx, fillTextCalls } = createMockContext()
    const coverage = {
      status: "partial" as const,
      completeCount: 0,
      partialCount: 1,
      eligibleCount: 2,
      legacyUnclassifiedCount: 0,
    }
    const window = { start: 1700000000000, end: 1700000001000, timeZone: "UTC" }
    drawShareSnapshotOverlay(ctx, {
      payload: {
        kind: SHARE_SNAPSHOT_KINDS.Overview,
        enabledAccountCount: 2,
        currencyType: CURRENCIES.USD,
        asOf: 1700000000000,
        backgroundSeed: 1,
        incomeSummary: {
          groups: [CURRENCIES.CNY, "EUR", "GBP"].map((code) => ({
            amount: {
              asset: { kind: ASSET_KINDS.Currency, code },
              value: "9".repeat(120),
            },
            coverage,
            window,
          })),
          nativeCoverage: coverage,
        },
      },
      width: 1200,
      height: 1200,
      locale: "en",
      watermarkText: "All API Hub",
      labels: LABELS,
    })
    const income = fillTextCalls.find((call) => call.text === "Income")!
    const tile = fillTextCalls.filter(
      (call) => call.x === income.x && call.y > income.y,
    )
    expect(
      tile.some(
        (call) => call.text.startsWith("CNY") && call.text.endsWith("…"),
      ),
    ).toBe(true)
    expect(
      tile.some((call) =>
        call.text.startsWith("account:todayMetricAvailability.partial"),
      ),
    ).toBe(true)
    expect(tile.some((call) => call.text.includes("GBP"))).toBe(false)
    expect(
      fillTextCalls.some(
        (call) => call.text === "shareSnapshots:financial.detailsInCaption",
      ),
    ).toBe(true)
    expect(fillTextCalls.every((call) => call.y < 1200)).toBe(true)
  })

  it.each(["account", "overview"] as const)(
    "renders independent native income and consumption in their own %s tiles",
    (kind) => {
      const coverage = {
        status: "partial" as const,
        completeCount: 1,
        partialCount: 1,
        eligibleCount: 3,
        legacyUnclassifiedCount: 0,
      }
      const window = {
        start: 1700000000000,
        end: 1700000001000,
        timeZone: "UTC",
      }
      const { ctx, fillTextCalls } = createMockContext()
      drawShareSnapshotOverlay(ctx, {
        payload: {
          kind,
          siteName: "Example",
          enabledAccountCount: 3,
          currencyType: CURRENCIES.USD,
          asOf: 1700000000000,
          backgroundSeed: 1,
          balanceSummary: {
            purpose: "prepaid",
            entries: [],
            amounts: [
              CURRENCIES.USD,
              CURRENCIES.CNY,
              "EUR",
              "GBP",
              "JPY",
              "CAD",
            ].map((code) => ({
              asset: { kind: ASSET_KINDS.Currency, code },
              value: "10",
            })),
            coverage: FINANCIAL_COVERAGE.Partial,
          },
          incomeSummary: {
            groups: [
              {
                amount: {
                  asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
                  value: "7.000000000000000017",
                },
                window,
                coverage,
              },
            ],
            nativeCoverage: coverage,
          },
          consumptionSummary: {
            groups: [
              {
                amount: {
                  asset: {
                    kind: ASSET_KINDS.Quota,
                    id: "quota",
                    label: "tokens",
                    displayLabel: "tokens",
                    displayScale: 1,
                  },
                  value: "17",
                },
                window,
                coverage,
              },
            ],
            nativeCoverage: coverage,
          },
        },
        width: 1200,
        height: 1200,
        locale: "en",
        watermarkText: "All API Hub",
        labels: LABELS,
      })
      const income = fillTextCalls.find((call) => call.text === "Income")!
      const consumption = fillTextCalls.find((call) => call.text === "Outcome")!
      const incomeTile = fillTextCalls.filter(
        (call) => call.x === income.x && call.y > income.y,
      )
      const consumptionTile = fillTextCalls.filter(
        (call) => call.x === consumption.x && call.y > consumption.y,
      )
      expect(
        incomeTile.some((call) =>
          /CNY\s*7\.000000000000000017/.test(call.text),
        ),
      ).toBe(true)
      expect(consumptionTile.some((call) => /17.*tokens/.test(call.text))).toBe(
        true,
      )
      expect(
        incomeTile.some((call) =>
          call.text.startsWith("account:todayMetricAvailability.partial"),
        ),
      ).toBe(true)
      expect(
        consumptionTile.some((call) =>
          call.text.startsWith("account:todayMetricAvailability.partial"),
        ),
      ).toBe(true)
      expect(
        [...incomeTile, ...consumptionTile].some((call) => call.text === "—"),
      ).toBe(false)
      expect(
        fillTextCalls.some((call) => call.text.includes("detailsInCaption")),
      ).toBe(true)
      expect(fillTextCalls.every((call) => call.y < 1200)).toBe(true)
    },
  )

  it.each(["consumptionSummary", "incomeSummary"] as const)(
    "keeps partial %s visible when interval details are truncated",
    (metric) => {
      const { ctx, fillTextCalls } = createMockContext()
      const coverage = {
        status: "partial" as const,
        completeCount: 1,
        partialCount: 1,
        eligibleCount: 3,
        legacyUnclassifiedCount: 0,
      }
      drawShareSnapshotOverlay(ctx, {
        payload: {
          kind: SHARE_SNAPSHOT_KINDS.Overview,
          currencyType: CURRENCIES.USD,
          enabledAccountCount: 3,
          asOf: 1700000000000,
          backgroundSeed: 1,
          balanceSummary: {
            purpose: "prepaid",
            entries: [],
            amounts: [
              {
                asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
                value: "10",
              },
              {
                asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
                value: "20",
              },
            ],
            coverage: FINANCIAL_COVERAGE.Partial,
            includedCount: 1,
            eligibleCount: 3,
          },
          [metric]: {
            groups: [
              {
                amount: {
                  asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
                  value: "12",
                },
                window: {
                  start: 1700000000000,
                  end: 1700000001000,
                  timeZone: "UTC",
                },
                coverage,
              },
            ],
            nativeCoverage: coverage,
          },
        },
        width: 1200,
        height: 1200,
        labels: LABELS,
        watermarkText: "All API Hub",
      })
      expect(
        fillTextCalls.some((call) =>
          call.text.startsWith("account:todayMetricAvailability.partial"),
        ),
      ).toBe(true)
      expect(
        fillTextCalls.some((call) => call.text.includes("detailsInCaption")),
      ).toBe(true)
    },
  )
  it("renders native amounts and coverage instead of a legacy converted balance", () => {
    const { ctx, fillTextCalls } = createMockContext()
    drawShareSnapshotOverlay(ctx, {
      payload: {
        kind: SHARE_SNAPSHOT_KINDS.Overview,
        currencyType: CURRENCIES.USD,
        currencyDisplay: CURRENCY_DISPLAY_MODES.Original,
        enabledAccountCount: 2,
        totalBalance: 999,
        asOf: 1700000000000,
        backgroundSeed: 1,
        balanceSummary: {
          purpose: "prepaid",
          entries: [],
          amounts: [
            {
              value: "8",
              asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
            },
            { value: "12", asset: { kind: ASSET_KINDS.Crypto, id: "XNO" } },
          ],
          coverage: FINANCIAL_COVERAGE.Partial,
          includedCount: 1,
          eligibleCount: 2,
        },
      },
      width: 1200,
      height: 1200,
      labels: LABELS,
      watermarkText: "All API Hub",
    })
    const texts = fillTextCalls.map((call) => call.text).join("\n")
    expect(texts).toContain("¥8.00")
    const amount = fillTextCalls.find((call) => call.text === "¥8.00")!
    const otherAsset = fillTextCalls.find((call) => call.text.includes("XNO"))!
    const dateLabel = fillTextCalls.find((call) => call.text === "As of")!
    const date = fillTextCalls.find(
      (call) => call.y > dateLabel.y && call.x === dateLabel.x,
    )!
    expect(amount.font).toBe(otherAsset.font)
    expect(otherAsset.x).toBeGreaterThan(amount.x)
    expect(otherAsset.y).toBe(amount.y)
    expect(Number.parseFloat(amount.font.split(" ")[1] ?? "")).toBeGreaterThan(
      Number.parseFloat(date.font.split(" ")[1] ?? ""),
    )
    expect(texts).toContain("XNO")
    expect(texts).toContain("shareSnapshots:financial.partial")
    expect(texts).not.toContain("999")
    expect(fillTextCalls.every((call) => call.y < 1200)).toBe(true)
  })

  it("groups matching wallet labels and keeps the last-known amount distinct", () => {
    const scope = accountBalanceScope({
      baseUrl: "https://example.com",
      auth: { authType: "access_token" },
    } as never)
    const source = {
      adapter: "provider",
      operation: "wallet/".repeat(30),
      contractVersion: "2",
      kind: EVIDENCE_KINDS.Reported,
    } as const
    const position = balancePosition({
      id: "balance",
      scope,
      source,
      observedAt: 1700000000000,
      asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
      value: "8",
    })
    position.amount = {
      status: OBSERVATION_STATUSES.Stale,
      source,
      value: "8",
      observedAt: 1700000000000,
      reason: "request failed",
    }
    const payload = buildAccountShareSnapshotPayload({
      currencyType: CURRENCIES.USD,
      currencyDisplay: CURRENCY_DISPLAY_MODES.Original,
      siteName: "Example",
      balanceSnapshot: accountBalanceSnapshot(
        scope,
        [
          balancePosition({
            id: "current-cny",
            scope,
            source,
            observedAt: 1700000000000,
            asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
            value: "10",
          }),
          balancePosition({
            id: "current-xno",
            scope,
            source,
            observedAt: 1700000000000,
            asset: { kind: ASSET_KINDS.Crypto, id: "XNO" },
            value: "3",
          }),
          position,
        ],
        1700000000000,
        FINANCIAL_COVERAGE.Partial,
      ),
      includeTodayCashflow: false,
    })
    const { ctx, fillTextCalls } = createMockContext()
    drawShareSnapshotOverlay(ctx, {
      payload,
      width: 1200,
      height: 1200,
      labels: LABELS,
      watermarkText: "All API Hub",
    })
    const texts = fillTextCalls.map((call) => call.text).join("\n")
    const matchingLabels = fillTextCalls.filter(
      (call) => call.text === "account:financial.available",
    )
    expect(matchingLabels).toHaveLength(1)
    const currentCny = fillTextCalls.find((call) => call.text === "¥10.00")!
    const xno = fillTextCalls.find((call) => call.text.includes("3 XNO"))!
    const staleAmount = fillTextCalls.find((call) => call.text === "¥8.00")!
    expect(currentCny.y).toBe(xno.y)
    expect(currentCny.x).toBeLessThan(xno.x)
    expect(staleAmount.y).toBeGreaterThan(xno.y)
    expect(texts).toContain("account:financial.lastKnown")
    expect(texts).toContain("shareSnapshots:financial.detailsInCaption")
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("renders placeholders and omits today net subline when today cashflow is absent", () => {
    const payload: ShareSnapshotPayload = {
      kind: SHARE_SNAPSHOT_KINDS.Account,
      currencyType: CURRENCIES.USD,
      siteName: "Example Site",
      balance: 12.34,
      asOf: 1700000000000,
      backgroundSeed: 1,
    }

    const { ctx, fillTextCalls } = createMockContext()

    drawShareSnapshotOverlay(ctx, {
      payload,
      width: 1200,
      height: 1200,
      locale: "en-US",
      watermarkText: "All API Hub",
      labels: LABELS,
    })

    const texts = fillTextCalls.map((call) => call.text)
    const year = String(new Date(payload.asOf).getFullYear())

    expect(texts.filter((text) => text === "—").length).toBeGreaterThanOrEqual(
      2,
    )
    expect(texts).toContain("All API Hub")
    expect(texts).toContain("As of")
    expect(texts.some((text) => text.includes(year))).toBe(true)
    expect(texts.some((text) => text.includes("Today"))).toBe(false)
  })

  it("renders today net subline when today cashflow values are present", () => {
    const payload: ShareSnapshotPayload = {
      kind: SHARE_SNAPSHOT_KINDS.Account,
      currencyType: CURRENCIES.USD,
      siteName: "Example Site",
      balance: 12.34,
      asOf: 1700000000000,
      backgroundSeed: 1,
      todayIncome: 2,
      todayOutcome: 1,
      todayNet: 1,
    }

    const { ctx, fillTextCalls } = createMockContext()

    drawShareSnapshotOverlay(ctx, {
      payload,
      width: 1200,
      height: 1200,
      locale: "en-US",
      watermarkText: "All API Hub",
      labels: LABELS,
    })

    const texts = fillTextCalls.map((call) => call.text)

    expect(texts.some((text) => text.includes("Today"))).toBe(true)
    expect(texts.some((text) => text === "—")).toBe(false)
  })

  it("renders overview-specific labels, falls back from invalid locale formatting, and uses dark text on bright backgrounds", () => {
    vi.spyOn(Date.prototype, "toLocaleDateString").mockImplementation(
      function mockToLocaleDateString(locales?: Intl.LocalesArgument) {
        if (locales === "bad-locale") {
          throw new RangeError("unsupported locale")
        }
        return "fallback-date"
      },
    )

    const payload: ShareSnapshotPayload = {
      kind: SHARE_SNAPSHOT_KINDS.Overview,
      currencyType: CURRENCIES.USD,
      enabledAccountCount: 7,
      totalBalance: 42.5,
      asOf: Number.NaN,
      backgroundSeed: 1,
      todayIncome: 3,
      todayOutcome: 1,
      todayNet: 2,
    }

    const { ctx, fillTextCalls } = createMockContext({
      getImageData: () =>
        ({
          data: new Uint8ClampedArray([255, 255, 255, 255]),
        }) as ImageData,
    })

    drawShareSnapshotOverlay(ctx, {
      payload,
      width: 1200,
      height: 1200,
      locale: "bad-locale",
      watermarkText: "All API Hub",
      labels: LABELS,
    })

    const texts = fillTextCalls.map((call) => call.text)
    const primaryHeroCall = fillTextCalls.find(
      (call) => call.text === "account:financial.legacy",
    )
    const accountsValueCall = fillTextCalls.find((call) => call.text === "7")

    expect(texts).toContain("Overview")
    expect(texts).toContain("Total balance")
    expect(texts).toContain("Accounts")
    expect(texts).toContain("fallback-date")
    expect(primaryHeroCall?.fillStyle).toBe("rgba(15, 23, 42, 0.78)")
    expect(accountsValueCall).toBeTruthy()
  })

  it("discloses omitted details when native asset lines exceed the canvas capacity", () => {
    const payload: ShareSnapshotPayload = {
      kind: SHARE_SNAPSHOT_KINDS.Overview,
      currencyType: CURRENCIES.USD,
      currencyDisplay: CURRENCY_DISPLAY_MODES.Original,
      enabledAccountCount: 8,
      asOf: 1700000000000,
      backgroundSeed: 1,
      balanceSummary: {
        purpose: "prepaid",
        entries: [],
        coverage: FINANCIAL_COVERAGE.Partial,
        amounts: [
          CURRENCIES.CNY,
          CURRENCIES.USD,
          "EUR",
          "GBP",
          "JPY",
          "CAD",
          "AUD",
          "VND",
        ].map((code) => ({
          asset: { kind: ASSET_KINDS.Currency, code },
          value: "12",
        })),
      },
    }
    const { ctx, fillTextCalls } = createMockContext()
    drawShareSnapshotOverlay(ctx, {
      payload,
      width: 1200,
      height: 1200,
      locale: "en-US",
      watermarkText: "All API Hub",
      labels: LABELS,
    })
    const texts = fillTextCalls.map((call) => call.text)
    expect(texts).toContain("shareSnapshots:financial.detailsInCaption")
    expect(texts.some((text) => text.includes("¥"))).toBe(true)
    expect(fillTextCalls.every((call) => call.y >= 0 && call.y < 1200)).toBe(
      true,
    )
  })
})
