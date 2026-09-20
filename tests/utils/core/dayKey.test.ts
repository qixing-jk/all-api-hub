import { describe, expect, it } from "vitest"

import {
  addDaysToDayKey,
  formatDayKeyUtc,
  formatLocalDayKey,
  formatLocalMonthKey,
  formatUtcDayKey,
  getDayKeyFromUnixSeconds,
  parseDayKey,
  subtractDaysFromDayKey,
} from "~/utils/core/dayKey"

describe("local day and month keys", () => {
  it("formats local day keys from local calendar fields", () => {
    // Constructed with local fields, so the expectation holds in any timezone.
    expect(formatLocalDayKey(new Date(2026, 2, 5, 0, 30))).toBe("2026-03-05")
    expect(formatLocalDayKey(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31")
  })

  it("pads single-digit local months", () => {
    expect(formatLocalMonthKey(new Date(2026, 2, 5, 12, 0))).toBe("2026-03")
  })

  it("formats local month keys from local calendar fields instead of UTC", () => {
    // 2026-02-28T20:00Z: for UTC+4 and east the local month is already March,
    // so local vs UTC month strings differ there — a regression to UTC
    // formatting (toISOString) would flip this result in those timezones.
    const date = new Date(Date.UTC(2026, 1, 28, 20, 0))
    const expected = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
    expect(formatLocalMonthKey(date)).toBe(expected)
  })

  it("formats UTC day keys from UTC fields", () => {
    expect(formatUtcDayKey(new Date(Date.UTC(2026, 1, 7, 23, 30)))).toBe(
      "2026-02-07",
    )
  })
})

describe("day-key parsing and arithmetic", () => {
  it("parses valid day keys", () => {
    expect(parseDayKey("2026-02-07")).toEqual({
      year: 2026,
      month: 2,
      day: 7,
    })
  })

  it("rejects malformed and out-of-range day keys", () => {
    expect(parseDayKey("2026-2-7")).toBeNull()
    expect(parseDayKey("2026-13-01")).toBeNull()
    expect(parseDayKey("")).toBeNull()
    expect(parseDayKey("2026-02-31")).toBeNull()
  })

  it("adds and subtracts calendar days across month boundaries", () => {
    expect(addDaysToDayKey("2026-02-01", 1)).toBe("2026-02-02")
    expect(subtractDaysFromDayKey("2026-02-01", 1)).toBe("2026-01-31")
  })

  it("formats UTC day keys for calendar arithmetic", () => {
    expect(formatDayKeyUtc(new Date(Date.UTC(2026, 0, 1, 12, 0)))).toBe(
      "2026-01-01",
    )
  })
})

describe("getDayKeyFromUnixSeconds", () => {
  it("buckets by the requested timezone", () => {
    // 2026-02-07T00:00:00Z
    const unixSeconds = Date.UTC(2026, 1, 7, 0, 0, 0) / 1000
    expect(getDayKeyFromUnixSeconds(unixSeconds, "UTC")).toBe("2026-02-07")
    expect(getDayKeyFromUnixSeconds(unixSeconds, "Asia/Shanghai")).toBe(
      "2026-02-07",
    )
    expect(getDayKeyFromUnixSeconds(unixSeconds, "America/New_York")).toBe(
      "2026-02-06",
    )
  })

  it("defaults to the device-local timezone", () => {
    const nowUnixSeconds = Math.floor(Date.now() / 1000)
    expect(getDayKeyFromUnixSeconds(nowUnixSeconds)).toBe(formatLocalDayKey())
  })
})
