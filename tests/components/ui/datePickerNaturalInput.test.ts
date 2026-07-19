import dayjs from "dayjs"
import { describe, expect, it } from "vitest"

import { parseNaturalDatePickerValue } from "~/components/ui/datePickerNaturalInput"

describe("parseNaturalDatePickerValue", () => {
  const referenceDate = new Date(2026, 6, 10, 12)

  it.each([
    ["2026-08-01", "2026-08-01"],
    ["7天后", "2026-07-17"],
    ["30 天后", "2026-08-09"],
    ["1年后", "2027-07-10"],
    ["明天", "2026-07-11"],
    ["下周", "2026-07-17"],
    ["下个月", "2026-08-10"],
    ["明年", "2027-07-10"],
    ["in 7 days", "2026-07-17"],
    ["20260801", "2026-08-01"],
    ["2026801", "2026-08-01"],
    ["202608", "2026-08-31"],
    ["20268", "2026-08-31"],
    ["0801", "2026-08-01"],
    ["801", "2026-08-01"],
    ["68", "2027-06-08"],
    ["701", "2027-07-01"],
  ])("parses %s as %s", (input, expected) => {
    expect(parseNaturalDatePickerValue(input, referenceDate)).toBe(expected)
  })

  it.each([
    "",
    "8",
    "2026",
    "202613",
    "20260229",
    "202607010",
    "202607-01-01",
    "not a date",
  ])("rejects %s", (input) => {
    expect(parseNaturalDatePickerValue(input, referenceDate)).toBeNull()
  })

  it("normalizes chrono results to local YYYY-MM-DD values", () => {
    expect(parseNaturalDatePickerValue("tomorrow", referenceDate)).toBe(
      dayjs(referenceDate).add(1, "day").format("YYYY-MM-DD"),
    )
  })
})
