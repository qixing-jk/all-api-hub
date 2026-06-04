import { describe, expect, it } from "vitest"

import { getUsagePercentShare } from "~/features/OptionsOverview/components/usageSnapshotMath"

describe("usage snapshot math helpers", () => {
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
})
