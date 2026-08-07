import dayjs from "dayjs"
import { describe, expect, it } from "vitest"

import {
  isNoExpirationNaturalInput,
  parseNaturalDatePickerValue,
} from "~/components/ui/datePickerNaturalInput"

describe("parseNaturalDatePickerValue", () => {
  const referenceDate = new Date(2026, 6, 10, 12)

  it.each([
    ["2026-08-01", "2026-08-01"],
    ["2026/08/01", "2026-08-01"],
    ["7天后", "2026-07-17"],
    ["30 天后", "2026-08-09"],
    ["1年后", "2027-07-10"],
    ["明天", "2026-07-11"],
    ["下周", "2026-07-17"],
    ["下个月", "2026-08-10"],
    ["明年", "2027-07-10"],
    ["in 7 days", "2026-07-17"],
    ["amanhã", "2026-07-11"],
    ["daqui a 1 dia", "2026-07-11"],
    ["daqui a 7 dias", "2026-07-17"],
    ["morgen", "2026-07-11"],
    ["in 1 Tag", "2026-07-11"],
    ["in 7 Tagen", "2026-07-17"],
    ["nächste Woche", "2026-07-17"],
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
    "daqui a 0 dias",
    "daqui a 1 dias",
    "daqui a 2 dia",
    "daqui a 9007199254740991 dias",
    "daqui a 9007199254740992 dias",
    "daqui a 7",
    "in 1 Tagen",
    "in 7 Tag",
    "in 1000000000 Tagen",
    "in 9007199254740992 Tagen",
    "not a date",
  ])("rejects %s", (input) => {
    expect(parseNaturalDatePickerValue(input, referenceDate)).toBeNull()
  })

  it("normalizes chrono results to local YYYY-MM-DD values", () => {
    expect(parseNaturalDatePickerValue("tomorrow", referenceDate)).toBe(
      dayjs(referenceDate).add(1, "day").format("YYYY-MM-DD"),
    )
  })

  it("recognizes German no-expiration phrases", () => {
    expect(isNoExpirationNaturalInput("kein Ablauf")).toBe(true)
    expect(isNoExpirationNaturalInput("ohne Ablauf")).toBe(true)
    expect(isNoExpirationNaturalInput("unbegrenzt")).toBe(true)
  })
})
