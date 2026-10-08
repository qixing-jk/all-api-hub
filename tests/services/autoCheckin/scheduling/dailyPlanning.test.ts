// Install shared mocks before loading scheduler dependencies.
import "~~/tests/services/autoCheckin/schedulerTestHarness"

import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  calculateDeterministicCatchUpTrigger,
  calculateDeterministicTriggerForDay,
  calculateRandomTrigger,
  calculateRandomTriggerForDay,
  isMinutesWithinWindow,
  parseTimeToMinutes,
} from "~/services/checkin/autoCheckin/scheduling/dailyPlanning"

describe("scheduling/dailyPlanning", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  it("parses time strings and rejects invalid hour or minute values", () => {
    expect(parseTimeToMinutes("09:30")).toBe(570)
    expect(parseTimeToMinutes("24:00")).toBeNull()
    expect(parseTimeToMinutes("09:60")).toBeNull()
    expect(parseTimeToMinutes("nope")).toBeNull()
  })

  it("handles same-day and overnight windows correctly", () => {
    expect(isMinutesWithinWindow(600, 600, 600)).toBe(false)
    expect(isMinutesWithinWindow(570, 480, 600)).toBe(true)
    expect(isMinutesWithinWindow(60, 1320, 120)).toBe(true)
    expect(isMinutesWithinWindow(600, 1320, 120)).toBe(false)
  })

  it("rejects deterministic or random trigger plans when configuration is invalid", () => {
    const day = new Date("2026-01-23T00:00:00")

    expect(
      (calculateDeterministicTriggerForDay as any)(
        {
          windowStart: "08:00",
          windowEnd: "09:00",
          deterministicTime: "10:00",
        },
        day,
      ),
    ).toBeNull()

    expect(calculateRandomTriggerForDay("08:xx", "09:00", day)).toBeNull()
  })

  it("returns no deterministic catch-up trigger when the local day is already over", () => {
    vi.useFakeTimers()
    const now = new Date(2026, 0, 23, 23, 59, 59, 999)
    vi.setSystemTime(now)

    expect(calculateDeterministicCatchUpTrigger(now)).toBeNull()

    vi.useRealTimers()
  })

  it("uses the active overnight window after midnight instead of postponing to the next night", () => {
    const now = new Date(2026, 0, 24, 1, 0, 0, 0)
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0)

    const trigger = calculateRandomTrigger("23:00", "02:00", now)

    expect(trigger.toISOString()).toBe(now.toISOString())

    randomSpy.mockRestore()
  })
})
