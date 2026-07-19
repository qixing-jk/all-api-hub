import { describe, expect, it } from "vitest"

import {
  collectAccountMetricContributors,
  createEmptyAccountTodayStatsCoverage,
  createUnavailableTodayStatsAvailability,
  isAccountTodayMetricLegacyUnclassified,
  normalizeAccountTodayMetricAvailability,
  normalizeAccountTodayStatsAvailability,
} from "~/services/accounts/accountTodayStats"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
  type AccountTodayMetricReason,
} from "~/types/accountTodayStats"

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
