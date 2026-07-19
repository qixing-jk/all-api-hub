import { describe, expect, it } from "vitest"

import { getUsagePercentShare } from "~/features/OptionsOverview/components/usageSnapshotMath"
import { ACCOUNT_TODAY_METRIC_STATUSES } from "~/types/accountTodayStats"

describe("usage snapshot math helpers", () => {
  const completeCoverage = {
    status: ACCOUNT_TODAY_METRIC_STATUSES.Complete,
    completeCount: 1,
    partialCount: 0,
    eligibleCount: 1,
    legacyUnclassifiedCount: 0,
  } as const

  it("calculates rounded percent shares", () => {
    expect(getUsagePercentShare(25, 100)).toBe(25)
    expect(getUsagePercentShare(1, 3)).toBe(33)
    expect(getUsagePercentShare(2, 3)).toBe(67)
  })

  it("bounds shares to the 0-100 range", () => {
    expect(getUsagePercentShare(150, 100)).toBe(100)
    expect(getUsagePercentShare(-10, 100)).toBe(0)
  })

  it("returns zero for invalid totals or non-finite values", () => {
    expect(getUsagePercentShare(10, 0)).toBe(0)
    expect(getUsagePercentShare(10, -1)).toBe(0)
    expect(getUsagePercentShare(Number.POSITIVE_INFINITY, 100)).toBe(0)
    expect(getUsagePercentShare(10, Number.NaN)).toBe(0)
  })

  it("returns no share when today's numerator has no contributors", () => {
    expect(
      getUsagePercentShare(999, 1000, {
        todayCoverage: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          completeCount: 0,
          partialCount: 0,
          eligibleCount: 2,
          legacyUnclassifiedCount: 0,
        },
      }),
    ).toBeNull()
  })

  it("returns no share when the seven-day denominator dataset is absent", () => {
    expect(
      getUsagePercentShare(10, 0, {
        todayCoverage: completeCoverage,
        hasTotalData: false,
      }),
    ).toBeNull()
  })
})
