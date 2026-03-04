import { describe, expect, it } from "vitest"

import { listDayKeysInRange } from "~/entrypoints/options/pages/UsageAnalytics/dayKeys"

describe("UsageAnalytics dayKeys", () => {
  it("returns [] when start or end is an invalid calendar day", () => {
    expect(listDayKeysInRange("2026-02-31", "2026-03-01")).toEqual([])
    expect(listDayKeysInRange("2026-03-01", "2026-02-31")).toEqual([])
  })

  it("returns a dense inclusive range for valid inputs", () => {
    expect(listDayKeysInRange("2026-01-30", "2026-02-01")).toEqual([
      "2026-01-30",
      "2026-01-31",
      "2026-02-01",
    ])
  })
})
