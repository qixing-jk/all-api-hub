import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { ACCOUNT_USAGE_SCOPES } from "~/constants/accountUsage"
import { CURRENCIES } from "~/constants/money"
import { accountReportingScope } from "~/services/accounts/balanceSnapshot"
import {
  collectAccountMetricContributors,
  createEmptyAccountTodayStatsCoverage,
  createUnavailableTodayStatsAvailability,
  getSiteDayReadings,
  getSiteDayUsages,
  isAccountTodayMetricLegacyUnclassified,
  normalizeAccountTodayMetricAvailability,
  normalizeAccountTodayStatsAvailability,
} from "~/services/accounts/metrics/accountTodayStats"
import { observeAmount } from "~/services/amounts/balance"
import { EVIDENCE_KINDS } from "~/services/amounts/financialConstants"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
  type AccountTodayMetricReason,
} from "~/types/accountTodayStats"
import { getDayKeyFromUnixSeconds } from "~/utils/core/dayKey"

const previousTimeZone = process.env.TZ
beforeAll(() => {
  process.env.TZ = "UTC"
})
afterAll(() => {
  if (previousTimeZone === undefined) delete process.env.TZ
  else process.env.TZ = previousTimeZone
})

const PARTIAL_REASONS = new Set<AccountTodayMetricReason>([
  ACCOUNT_TODAY_METRIC_REASONS.SourcePartial,
  ACCOUNT_TODAY_METRIC_REASONS.PageLimit,
  ACCOUNT_TODAY_METRIC_REASONS.RequestFailed,
])

const UNAVAILABLE_REASONS = new Set<AccountTodayMetricReason>([
  ACCOUNT_TODAY_METRIC_REASONS.LegacyUnclassified,
  ACCOUNT_TODAY_METRIC_REASONS.NotCollected,
  ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
  ACCOUNT_TODAY_METRIC_REASONS.WrongPeriod,
  ACCOUNT_TODAY_METRIC_REASONS.RequestFailed,
  ACCOUNT_TODAY_METRIC_REASONS.InvalidPayload,
])

const ALL_REASONS = Object.values(ACCOUNT_TODAY_METRIC_REASONS)
const LEGACY_UNAVAILABLE = {
  status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
  reason: ACCOUNT_TODAY_METRIC_REASONS.LegacyUnclassified,
} as const
const PROFILE_FALLBACK = {
  consumption: {
    status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
    reason: ACCOUNT_TODAY_METRIC_REASONS.WrongPeriod,
  },
  requests: {
    status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
    reason: ACCOUNT_TODAY_METRIC_REASONS.WrongPeriod,
  },
  tokens: {
    status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
    reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
  },
  income: {
    status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
    reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
  },
} as const

describe("accountTodayStats", () => {
  it.each(["scope", "source", "amount"] as const)(
    "retains a distinct provider-day cost with the same window (%s)",
    (difference) => {
      const start = new Date(2026, 10, 19).getTime()
      const now = new Date(2026, 10, 19, 12).getTime()
      const source = {
        adapter: "fixture",
        operation: "cost",
        contractVersion: "1",
        kind: EVIDENCE_KINDS.Reported,
      }
      const fact = {
        asset: { kind: "currency", code: CURRENCIES.USD } as const,
        amount: observeAmount("12", source, now),
        scope: accountReportingScope({
          baseUrl: "https://cost.example",
          accountId: "account",
        }),
        window: {
          start,
          end: now + 1,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        settlement: "settled" as const,
        coverage: "complete" as const,
      }
      const cost = {
        asset: fact.asset,
        amount: fact.amount,
        scope: structuredClone(fact.scope),
        window: fact.window,
      }
      if (difference === "scope")
        cost.scope.keys = { kind: "restricted", ids: ["key-1"] }
      if (difference === "source")
        cost.amount = observeAmount(
          "12",
          { ...source, operation: "other-cost" },
          now,
        )
      if (difference === "amount") cost.amount = observeAmount("3", source, now)
      const reading = getSiteDayUsages(
        {
          usage: { scope: "today", totalRequests: 4, cost },
          settledConsumption: [fact],
        },
        now,
      )[0]
      expect(reading?.cost?.amount).toMatchObject({
        status: "known",
        value: difference === "amount" ? "3" : "12",
      })
    },
  )

  it.each([
    { label: "weekly", start: Date.UTC(2026, 10, 13) },
    { label: "intraday", start: Date.UTC(2026, 10, 19, 23) },
  ])(
    "keeps a $label settlement out of daily provider readings",
    ({ start }) => {
      const end = Date.UTC(2026, 10, 20)
      const fact = {
        asset: { kind: "currency", code: CURRENCIES.USD } as const,
        scope: accountReportingScope({ baseUrl: "https://provider.example" }),
        amount: observeAmount(
          "12",
          {
            adapter: "provider",
            operation: "settlement",
            contractVersion: "1",
            kind: "reported",
          },
          end,
        ),
        window: { start, end, timeZone: "UTC" },
        settlement: "settled" as const,
        coverage: "complete" as const,
      }
      expect(getSiteDayReadings({ settledConsumption: [fact] }, end)).toEqual(
        [],
      )
    },
  )
  it("retains partial cost coverage in the provider-day reading", () => {
    const observedAt = new Date(2026, 10, 19, 0, 0, 1).getTime()
    const timeZone = "Etc/GMT-14"
    const providerDay = getDayKeyFromUnixSeconds(observedAt / 1000, timeZone)
    const fact = {
      scope: accountReportingScope({
        baseUrl: "https://site.example",
        accountId: "partial",
      }),
      asset: { kind: "currency" as const, code: CURRENCIES.USD },
      amount: observeAmount(
        "2.5",
        {
          kind: EVIDENCE_KINDS.Reported,
          adapter: "fixture",
          operation: "cost",
          contractVersion: "1",
        },
        observedAt,
      ),
      window: {
        start: Date.parse(`${providerDay}T00:00:00+14:00`),
        end: observedAt,
        timeZone,
      },
      settlement: "settled" as const,
      coverage: "partial" as const,
    }
    expect(
      getSiteDayReadings({ settledConsumption: [fact] }, observedAt + 1000)[0]
        ?.usage.cost,
    ).toMatchObject({ coverage: "partial" })
  })

  it("suppresses an already projected local cost without dropping its provider-day counters", () => {
    const start = new Date(2026, 10, 19).getTime()
    const now = new Date(2026, 10, 19, 12).getTime()
    const fact = {
      asset: { kind: "currency" as const, code: CURRENCIES.USD },
      amount: observeAmount(
        "1.75",
        {
          adapter: "daya",
          operation: "today",
          contractVersion: "1",
          kind: EVIDENCE_KINDS.Reported,
        },
        now,
      ),
      scope: accountReportingScope({
        baseUrl: "https://daya.example",
        accountId: "daya",
      }),
      window: {
        start,
        end: now + 1,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      coverage: "complete" as const,
      settlement: "settled" as const,
    }
    const usage = {
      scope: "today" as const,
      totalRequests: 4,
      totalTokens: 330,
      cost: {
        asset: fact.asset,
        amount: fact.amount,
        scope: fact.scope,
        window: fact.window,
      },
    }
    const reading = getSiteDayUsages(
      { usage, settledConsumption: [fact] },
      now,
    )[0]
    expect(reading).toMatchObject({ totalRequests: 4, totalTokens: 330 })
    expect(reading?.cost).toBeUndefined()
  })
  it("preserves provider-day requests and tokens when only the cost is unavailable", () => {
    const usage = {
      scope: "today" as const,
      totalRequests: 4,
      totalTokens: 330,
      cost: {
        asset: { kind: "currency" as const, code: CURRENCIES.USD },
        amount: observeAmount(
          undefined,
          {
            adapter: "daya",
            operation: "dashboard",
            contractVersion: "1",
            kind: EVIDENCE_KINDS.Reported,
          },
          Date.now(),
        ),
      },
    }
    expect(getSiteDayUsages({ usage })[0]).toMatchObject({
      scope: ACCOUNT_USAGE_SCOPES.SiteToday,
      totalRequests: 4,
      totalTokens: 330,
    })
  })
  it("preserves the original provider day and marks yesterday's known amount as last-known", () => {
    const now = new Date(2026, 10, 1, 23, 30).getTime()
    const previous = new Date(now)
    const yesterday = previous.setDate(previous.getDate() - 1)
    const usage = {
      scope: "site_today" as const,
      reportedDay: "2026-11-18",
      totalRequests: 4,
      cost: {
        asset: { kind: "currency" as const, code: CURRENCIES.USD },
        amount: observeAmount(
          "2.5",
          {
            adapter: "fixture",
            operation: "daily",
            contractVersion: "1",
            kind: EVIDENCE_KINDS.Reported,
          },
          yesterday,
        ),
      },
    }
    expect(getSiteDayReadings({ usage }, now)).toEqual([
      {
        usage,
        observedAt: yesterday,
        costObservedAt: yesterday,
        countersObservedAt: undefined,
        lastKnown: true,
      },
    ])
  })
  it("retains every provider-day asset alongside an already displayed local-day cost", () => {
    const start = new Date(2026, 10, 19)
    const now = start.getTime() + 1000
    const providerDay = getDayKeyFromUnixSeconds(now / 1000, "Etc/GMT-14")
    const providerStart = Date.parse(`${providerDay}T00:00:00+14:00`)
    const scope = accountReportingScope({
      baseUrl: "https://usage.example",
      accountId: "usage",
    })
    const source = {
      adapter: "fixture",
      operation: "daily",
      contractVersion: "1",
      kind: "reported" as const,
    }
    const fact = (code: string, value: string, offset: number) => ({
      asset: { kind: "currency" as const, code },
      scope,
      amount: observeAmount(value, source, now),
      window: {
        start: offset === 0 ? start.getTime() : providerStart,
        end: now + 1,
        timeZone:
          offset === 0
            ? Intl.DateTimeFormat().resolvedOptions().timeZone
            : "Etc/GMT-14",
      },
      settlement: "settled" as const,
      coverage: "complete" as const,
      cumulative: true as const,
    })
    const account = {
      settledConsumption: [
        fact(CURRENCIES.USD, "1.23", 0),
        fact("EUR", "12", -3600000),
        fact("JPY", "25", -3600000),
      ],
    }
    expect(
      getSiteDayUsages(account, now).map((usage) => usage.cost?.asset),
    ).toEqual([
      { kind: "currency", code: "EUR" },
      { kind: "currency", code: "JPY" },
    ])
  })
  it("keeps a known provider-day cost readable when its interval crosses the local day", () => {
    const start = new Date(2026, 10, 19)
    const now = start.getTime() + 1000
    const providerDay = getDayKeyFromUnixSeconds(now / 1000, "Etc/GMT-14")
    const providerStart = Date.parse(`${providerDay}T00:00:00+14:00`)
    const scope = accountReportingScope({
      baseUrl: "https://usage.example",
      accountId: "usage",
    })
    const fact = {
      asset: { kind: "currency" as const, code: CURRENCIES.USD },
      scope,
      amount: observeAmount(
        "2.5",
        {
          adapter: "fixture",
          operation: "daily",
          contractVersion: "1",
          kind: EVIDENCE_KINDS.Reported,
        },
        now,
      ),
      window: {
        start: providerStart,
        end: now + 1,
        timeZone: "Etc/GMT-14",
      },
      settlement: "settled" as const,
      coverage: "complete" as const,
      cumulative: true as const,
    }
    expect(
      getSiteDayUsages({ settledConsumption: [fact] }, now)[0]?.cost?.amount,
    ).toMatchObject({ status: "known", value: "2.5" })
  })
  it("creates independent unavailable availability groups for the supplied reason", () => {
    const first = createUnavailableTodayStatsAvailability(
      ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
    )
    const second = createUnavailableTodayStatsAvailability(
      ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
    )

    expect(first).toEqual({
      consumption: {
        status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
        reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
      },
      requests: {
        status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
        reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
      },
      tokens: {
        status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
        reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
      },
      income: {
        status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
        reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
      },
    })
    expect(first).not.toBe(second)
    expect(first.consumption).not.toBe(first.requests)
    expect(first.consumption).not.toBe(second.consumption)
  })

  it("creates fresh unavailable zero-count coverage for every today metric", () => {
    const first = createEmptyAccountTodayStatsCoverage()
    const second = createEmptyAccountTodayStatsCoverage()
    const expectedMetric = {
      status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
      completeCount: 0,
      partialCount: 0,
      eligibleCount: 0,
      legacyUnclassifiedCount: 0,
    }

    expect(first).toEqual({
      consumption: expectedMetric,
      requests: expectedMetric,
      tokens: expectedMetric,
      income: expectedMetric,
    })
    expect(first).not.toBe(second)
    expect(first.consumption).not.toBe(second.consumption)
    expect(first.consumption).not.toBe(first.requests)
  })

  describe("normalizeAccountTodayMetricAvailability", () => {
    it("normalizes a complete metric without retaining a supplied reason", () => {
      expect(
        normalizeAccountTodayMetricAvailability({
          status: ACCOUNT_TODAY_METRIC_STATUSES.Complete,
          reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
        }),
      ).toEqual({ status: ACCOUNT_TODAY_METRIC_STATUSES.Complete })
    })

    it.each(ALL_REASONS)(
      "enforces the strict partial matrix for %s",
      (reason) => {
        expect(
          normalizeAccountTodayMetricAvailability({
            status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
            reason,
          }),
        ).toEqual(
          PARTIAL_REASONS.has(reason)
            ? {
                status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
                reason,
              }
            : LEGACY_UNAVAILABLE,
        )
      },
    )

    it.each(ALL_REASONS)(
      "enforces the strict unavailable matrix for %s",
      (reason) => {
        expect(
          normalizeAccountTodayMetricAvailability({
            status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
            reason,
          }),
        ).toEqual(
          UNAVAILABLE_REASONS.has(reason)
            ? {
                status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
                reason,
              }
            : LEGACY_UNAVAILABLE,
        )
      },
    )

    it("fails malformed supplied values closed instead of using a policy fallback", () => {
      expect(
        normalizeAccountTodayMetricAvailability(
          {
            status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
            reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
          },
          {
            status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
            reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
          },
        ),
      ).toEqual(LEGACY_UNAVAILABLE)
    })

    it.each([
      ACCOUNT_TODAY_METRIC_STATUSES.Partial,
      ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
    ])("fails a reasonless %s metric closed", (status) => {
      expect(normalizeAccountTodayMetricAvailability({ status })).toEqual({
        status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
        reason: ACCOUNT_TODAY_METRIC_REASONS.LegacyUnclassified,
      })
    })

    it("clones a valid fallback when the metric is absent", () => {
      const fallback = {
        status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
        reason: ACCOUNT_TODAY_METRIC_REASONS.WrongPeriod,
      } as const

      const normalized = normalizeAccountTodayMetricAvailability(
        undefined,
        fallback,
      )

      expect(normalized).toEqual(fallback)
      expect(normalized).not.toBe(fallback)
    })

    it("fails an absent metric with a malformed fallback closed", () => {
      expect(
        normalizeAccountTodayMetricAvailability(undefined, {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
          reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
        }),
      ).toEqual(LEGACY_UNAVAILABLE)
    })
  })

  it("normalizes and clones every nested availability group independently", () => {
    const source = {
      consumption: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
      requests: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
      tokens: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
      income: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
    } as const

    const normalized = normalizeAccountTodayStatsAvailability(source)

    expect(normalized).toEqual(source)
    expect(normalized).not.toBe(source)
    expect(normalized.consumption).not.toBe(source.consumption)
    expect(normalized.requests).not.toBe(source.requests)
    expect(normalized.tokens).not.toBe(source.tokens)
    expect(normalized.income).not.toBe(source.income)
  })

  it.each([
    { label: "null", value: null },
    { label: "primitive", value: 0 },
    { label: "string", value: "malformed" },
    { label: "array", value: [] },
    { label: "date", value: new Date() },
  ])(
    "fails explicit malformed top-level availability closed for $label",
    ({ value }) => {
      expect(
        normalizeAccountTodayStatsAvailability(value, PROFILE_FALLBACK),
      ).toEqual({
        consumption: LEGACY_UNAVAILABLE,
        requests: LEGACY_UNAVAILABLE,
        tokens: LEGACY_UNAVAILABLE,
        income: LEGACY_UNAVAILABLE,
      })
    },
  )

  it("preserves valid explicit top-level availability", () => {
    const source = {
      consumption: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
      requests: {
        status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
        reason: ACCOUNT_TODAY_METRIC_REASONS.SourcePartial,
      },
      tokens: {
        status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
        reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
      },
      income: {
        status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
        reason: ACCOUNT_TODAY_METRIC_REASONS.WrongPeriod,
      },
    } as const

    expect(
      normalizeAccountTodayStatsAvailability(source, PROFILE_FALLBACK),
    ).toEqual(source)
  })

  it("uses and clones the fallback for an undefined top-level availability", () => {
    const normalized = normalizeAccountTodayStatsAvailability(
      undefined,
      PROFILE_FALLBACK,
    )

    expect(normalized).toEqual(PROFILE_FALLBACK)
    expect(normalized).not.toBe(PROFILE_FALLBACK)
    expect(normalized.consumption).not.toBe(PROFILE_FALLBACK.consumption)
    expect(normalized.requests).not.toBe(PROFILE_FALLBACK.requests)
    expect(normalized.tokens).not.toBe(PROFILE_FALLBACK.tokens)
    expect(normalized.income).not.toBe(PROFILE_FALLBACK.income)
  })

  it("fails non-plain nested metric values closed", () => {
    const metrics = ["consumption", "requests", "tokens", "income"] as const
    const malformedValues = [
      { label: "array", value: [] },
      { label: "date", value: new Date() },
      {
        label: "custom prototype",
        value: Object.assign(Object.create({}), {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
        }),
      },
    ]

    for (const metric of metrics) {
      for (const malformed of malformedValues) {
        const source: Record<(typeof metrics)[number], unknown> = {
          consumption: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
          requests: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
          tokens: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
          income: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
        }
        source[metric] = malformed.value

        const normalized = normalizeAccountTodayStatsAvailability(
          source,
          PROFILE_FALLBACK,
        )

        expect(normalized[metric], `${metric} ${malformed.label}`).toEqual(
          LEGACY_UNAVAILABLE,
        )
      }
    }
  })

  describe("collectAccountMetricContributors", () => {
    it("accepts readonly eligible contributors", () => {
      const eligible = [
        {
          value: 10,
          availability: {
            status: ACCOUNT_TODAY_METRIC_STATUSES.Complete,
          },
        },
      ] as const

      expect(
        collectAccountMetricContributors(
          eligible,
          (item) => item.value,
          (item) => item.availability,
        ),
      ).toMatchObject({ value: 10 })
    })

    it("sums contributors and separately counts legacy-unclassified metrics", () => {
      const result = collectAccountMetricContributors(
        [
          {
            value: 10,
            availability: {
              status: ACCOUNT_TODAY_METRIC_STATUSES.Complete,
            },
          },
          {
            value: 20,
            availability: {
              status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
              reason: ACCOUNT_TODAY_METRIC_REASONS.SourcePartial,
            },
          },
          {
            value: 999,
            availability: {
              status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
              reason: ACCOUNT_TODAY_METRIC_REASONS.LegacyUnclassified,
            },
          },
          {
            value: 999,
            availability: {
              status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
              reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
            },
          },
          {
            value: 999,
            availability: {
              status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
              reason: ACCOUNT_TODAY_METRIC_REASONS.WrongPeriod,
            },
          },
        ],
        (item) => item.value,
        (item) => item.availability,
      )

      expect(result).toEqual({
        value: 30,
        coverage: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
          completeCount: 1,
          partialCount: 1,
          eligibleCount: 5,
          legacyUnclassifiedCount: 1,
        },
      })
    })

    it("reports an empty eligible set as unavailable", () => {
      expect(
        collectAccountMetricContributors(
          [] as Array<{
            value: number
            availability: { status: "complete" }
          }>,
          (item) => item.value,
          (item) => item.availability,
        ),
      ).toEqual({
        value: 0,
        coverage: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          completeCount: 0,
          partialCount: 0,
          eligibleCount: 0,
          legacyUnclassifiedCount: 0,
        },
      })
    })
  })

  describe("isAccountTodayMetricLegacyUnclassified", () => {
    it("matches only unavailable legacy-unclassified metrics", () => {
      expect(isAccountTodayMetricLegacyUnclassified(LEGACY_UNAVAILABLE)).toBe(
        true,
      )
      expect(
        isAccountTodayMetricLegacyUnclassified({
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
        }),
      ).toBe(false)
      expect(
        isAccountTodayMetricLegacyUnclassified({
          status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
          reason: ACCOUNT_TODAY_METRIC_REASONS.RequestFailed,
        }),
      ).toBe(false)
    })
  })
})
it("preserves distinct counter readings that share the same provider cost", () => {
  const at = new Date(2026, 10, 19, 12).getTime()
  const cost = {
    asset: { kind: "currency" as const, code: "USD" },
    amount: observeAmount(
      "2",
      {
        adapter: "fixture",
        operation: "usage",
        contractVersion: "1",
        kind: "reported",
      },
      at,
    ),
  }
  const first = {
    scope: "site_today" as const,
    cost,
    totalRequests: 4,
    totalTokens: 20,
  }
  expect(
    getSiteDayUsages(
      { usage: first, usageObservations: [{ ...first, totalRequests: 9 }] },
      at,
    ).map((usage) => usage.totalRequests),
  ).toEqual([4, 9])
})

it("keeps the cost clock separate from newly refreshed counter timing", () => {
  const costAt = Date.parse("2026-11-18T23:50:00Z")
  const countersAt = Date.parse("2026-11-19T00:10:00Z")
  const reading = getSiteDayReadings(
    {
      usage: {
        scope: "site_today",
        observedAt: countersAt,
        totalRequests: 9,
        cost: {
          asset: { kind: "currency", code: "USD" },
          amount: {
            status: "stale",
            value: "2",
            reason: "refresh-failed",
            source: {
              adapter: "fixture",
              operation: "usage",
              contractVersion: "1",
              kind: "reported",
            },
            observedAt: costAt,
          },
        },
      },
    },
    countersAt,
  )[0]
  expect(reading).toMatchObject({
    observedAt: costAt,
    costObservedAt: costAt,
    countersObservedAt: countersAt,
    lastKnown: true,
  })
})
