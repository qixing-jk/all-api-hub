import { describe, expect, it } from "vitest"

import { formatLatency } from "~/features/Verification/api/utils"

describe("formatLatency", () => {
  it("returns dash for non-positive or invalid latency", () => {
    expect(formatLatency(0)).toBe("-")
    expect(formatLatency(-10)).toBe("-")
    expect(formatLatency(null)).toBe("-")
    expect(formatLatency(undefined)).toBe("-")
    expect(formatLatency(NaN)).toBe("-")
  })

  it("formats milliseconds for latencies under 1000ms", () => {
    expect(formatLatency(15)).toBe("15ms")
    expect(formatLatency(350.4)).toBe("350ms")
    expect(formatLatency(999)).toBe("999ms")
  })

  it("formats fractional seconds for latencies between 1s and 10s", () => {
    expect(formatLatency(1000)).toBe("1s")
    expect(formatLatency(1050)).toBe("1.1s")
    expect(formatLatency(1200)).toBe("1.2s")
    expect(formatLatency(2500)).toBe("2.5s")
    expect(formatLatency(9800)).toBe("9.8s")
  })

  it("formats whole seconds for latencies 10s and above", () => {
    expect(formatLatency(10000)).toBe("10s")
    expect(formatLatency(12400)).toBe("12s")
    expect(formatLatency(60000)).toBe("60s")
  })
})
