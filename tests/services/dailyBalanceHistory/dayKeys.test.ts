import { describe, expect, it } from "vitest"

import {
  addDaysToDayKey,
  computeRetentionCutoffDayKey,
  getDayKeyFromUnixSeconds,
  listDayKeysInRange,
  subtractDaysFromDayKey,
} from "~/services/history/dailyBalanceHistory/dayKeys"

describe("dailyBalanceHistory dayKeys", () => {
  it("returns [] when start or end is an invalid calendar day", () => {
    expect(
      listDayKeysInRange({
        startDayKey: "2026-02-31",
        endDayKey: "2026-03-01",
      }),
    ).toEqual([])
    expect(
      listDayKeysInRange({
        startDayKey: "2026-03-01",
        endDayKey: "2026-02-31",
      }),
    ).toEqual([])
  })

  it("returns a dense inclusive range for valid inputs", () => {
    expect(
      listDayKeysInRange({
        startDayKey: "2026-01-30",
        endDayKey: "2026-02-01",
      }),
    ).toEqual(["2026-01-30", "2026-01-31", "2026-02-01"])
  })

  it("supports day-key arithmetic helpers", () => {
    expect(addDaysToDayKey("2026-02-01", 1)).toBe("2026-02-02")
    expect(subtractDaysFromDayKey("2026-02-01", 1)).toBe("2026-01-31")
  })

  it("formats local day keys from unix seconds (timezone aware)", () => {
    // 2026-02-07T00:00:00Z
    const unixSeconds = Date.UTC(2026, 1, 7, 0, 0, 0) / 1000
    expect(getDayKeyFromUnixSeconds(unixSeconds, "UTC")).toBe("2026-02-07")
  })

  it("computes retention cutoff day key", () => {
    // Today: 2026-02-07 in UTC
    const nowUnixSeconds = Date.UTC(2026, 1, 7, 12, 0, 0) / 1000
    expect(
      computeRetentionCutoffDayKey({
        retentionDays: 3,
        nowUnixSeconds,
        timeZone: "UTC",
      }),
    ).toBe("2026-02-05")
  })
})
