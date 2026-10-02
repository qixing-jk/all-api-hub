import { describe, expect, it } from "vitest"

import {
  API_CREDENTIAL_ALLOWANCE_LEVELS,
  buildAllowanceOverview,
  buildAllowanceSignals,
  formatRunwayDays,
  getAllowanceCountdown,
  getAllowanceCountdownDisplay,
  getBalanceAllowanceLevel,
  getBalanceRunwayDays,
  getPrimaryAllowanceSignal,
  getQuotaAllowanceLevel,
} from "~/features/ApiCredentialProfiles/utils/apiCredentialAllowance"
import { SiteHealthStatus } from "~/types"
import type {
  ApiCredentialProfile,
  ApiCredentialTelemetryBalanceFact,
  ApiCredentialTelemetryFacts,
  ApiCredentialTelemetryQuotaWindowFact,
} from "~/types/apiCredentialProfiles"

const usdMoney = { kind: "money", currency: "USD", decimalPlaces: 2 } as const
const quotaUnit = {
  kind: "quota",
  code: "provider-quota",
  label: "Provider quota",
} as const
const percentUnit = { kind: "percent" } as const

/** Builds a quota window fact with sane defaults for the fields under test. */
function buildWindow(
  overrides: Partial<ApiCredentialTelemetryQuotaWindowFact> = {},
): ApiCredentialTelemetryQuotaWindowFact {
  return {
    type: "fiveHour",
    unit: quotaUnit,
    remainingPercent: 75,
    ...overrides,
  }
}

/** Builds a money balance fact with sane defaults for the fields under test. */
function buildBalance(
  overrides: Partial<ApiCredentialTelemetryBalanceFact> = {},
): ApiCredentialTelemetryBalanceFact {
  return {
    amount: 30,
    unit: usdMoney,
    semantics: "cash",
    ...overrides,
  }
}

/** Builds the normalized facts container for the fields under test. */
function buildFacts(
  overrides: Partial<ApiCredentialTelemetryFacts> = {},
): ApiCredentialTelemetryFacts {
  return { ...overrides }
}

describe("getQuotaAllowanceLevel", () => {
  it("treats a comfortable window as normal", () => {
    expect(getQuotaAllowanceLevel(75)).toBe(
      API_CREDENTIAL_ALLOWANCE_LEVELS.Normal,
    )
  })

  it("flags a half-drained window as low but not critical", () => {
    expect(getQuotaAllowanceLevel(50)).toBe(
      API_CREDENTIAL_ALLOWANCE_LEVELS.Normal,
    )
    expect(getQuotaAllowanceLevel(49)).toBe(API_CREDENTIAL_ALLOWANCE_LEVELS.Low)
    expect(getQuotaAllowanceLevel(20)).toBe(API_CREDENTIAL_ALLOWANCE_LEVELS.Low)
  })

  it("flags a nearly drained window as critical", () => {
    expect(getQuotaAllowanceLevel(19)).toBe(
      API_CREDENTIAL_ALLOWANCE_LEVELS.Critical,
    )
    expect(getQuotaAllowanceLevel(0)).toBe(
      API_CREDENTIAL_ALLOWANCE_LEVELS.Critical,
    )
  })

  it("stays unknown without a usable percentage", () => {
    expect(getQuotaAllowanceLevel(Number.NaN)).toBe(
      API_CREDENTIAL_ALLOWANCE_LEVELS.Unknown,
    )
  })
})

describe("getBalanceRunwayDays", () => {
  it("divides the remaining balance by today's spend", () => {
    expect(
      getBalanceRunwayDays(buildBalance({ amount: 30 }), {
        value: 3,
        unit: usdMoney,
      }),
    ).toBe(10)
  })

  it("refuses to divide balances and spend in different units", () => {
    const quotaBalance = buildBalance({ amount: 30, unit: quotaUnit })
    expect(
      getBalanceRunwayDays(quotaBalance, { value: 3, unit: usdMoney }),
    ).toBeUndefined()
    expect(
      getBalanceRunwayDays(buildBalance({ amount: 30, unit: usdMoney }), {
        value: 3,
        unit: quotaUnit,
      }),
    ).toBeUndefined()
  })

  it("refuses to estimate a runway without a positive spend", () => {
    expect(
      getBalanceRunwayDays(buildBalance(), { value: 0, unit: usdMoney }),
    ).toBeUndefined()
    expect(getBalanceRunwayDays(buildBalance(), undefined)).toBeUndefined()
  })
})

describe("getBalanceAllowanceLevel", () => {
  it("treats a week or more of runway as normal", () => {
    expect(getBalanceAllowanceLevel(7)).toBe(
      API_CREDENTIAL_ALLOWANCE_LEVELS.Normal,
    )
    expect(getBalanceAllowanceLevel(30)).toBe(
      API_CREDENTIAL_ALLOWANCE_LEVELS.Normal,
    )
  })

  it("flags a few days of runway as low", () => {
    expect(getBalanceAllowanceLevel(6.9)).toBe(
      API_CREDENTIAL_ALLOWANCE_LEVELS.Low,
    )
    expect(getBalanceAllowanceLevel(3)).toBe(
      API_CREDENTIAL_ALLOWANCE_LEVELS.Low,
    )
  })

  it("flags under three days of runway as critical", () => {
    expect(getBalanceAllowanceLevel(2.9)).toBe(
      API_CREDENTIAL_ALLOWANCE_LEVELS.Critical,
    )
  })

  it("stays unknown without a runway", () => {
    expect(getBalanceAllowanceLevel(undefined)).toBe(
      API_CREDENTIAL_ALLOWANCE_LEVELS.Unknown,
    )
  })
})

describe("buildAllowanceSignals", () => {
  it("returns nothing without normalized facts", () => {
    expect(buildAllowanceSignals(undefined)).toEqual([])
    expect(buildAllowanceSignals(buildFacts())).toEqual([])
  })

  it("orders the most drained quota window first", () => {
    const signals = buildAllowanceSignals(
      buildFacts({
        quota: {
          windows: [
            buildWindow({ type: "fiveHour", remainingPercent: 75 }),
            buildWindow({ type: "weekly", remainingPercent: 15 }),
          ],
        },
      }),
    )

    expect(signals.map((signal) => signal.id)).toEqual([
      "quota:weekly:1",
      "quota:fiveHour:0",
    ])
    expect(signals[0]).toMatchObject({
      kind: "quota-window",
      level: API_CREDENTIAL_ALLOWANCE_LEVELS.Critical,
      remainingPercent: 15,
      windowType: "weekly",
    })
  })

  it("keeps a balance without a runway as an unknown-level signal", () => {
    const signals = buildAllowanceSignals(
      buildFacts({ balances: [buildBalance({ amount: 4 })] }),
    )

    expect(signals).toHaveLength(1)
    expect(signals[0]).toMatchObject({
      kind: "balance",
      level: API_CREDENTIAL_ALLOWANCE_LEVELS.Unknown,
      amount: 4,
    })
  })

  it("promotes a low balance runway above a healthy quota window", () => {
    const signals = buildAllowanceSignals(
      buildFacts({
        quota: { windows: [buildWindow({ remainingPercent: 90 })] },
        balances: [buildBalance({ amount: 5 })],
        usage: { todayCost: { value: 2, unit: usdMoney } },
      }),
    )

    expect(signals[0]).toMatchObject({
      kind: "balance",
      level: API_CREDENTIAL_ALLOWANCE_LEVELS.Critical,
      runwayDays: 2.5,
    })
  })

  it("keeps a comfortable quota window ahead of a long balance runway", () => {
    const signals = buildAllowanceSignals(
      buildFacts({
        quota: { windows: [buildWindow({ remainingPercent: 40 })] },
        balances: [buildBalance({ amount: 300 })],
        usage: { todayCost: { value: 1, unit: usdMoney } },
      }),
    )

    expect(signals[0]).toMatchObject({ kind: "quota-window" })
  })

  it("carries reset time and absolute amounts through to the signal", () => {
    const resetTime = 1_800_000_000_000
    const signals = buildAllowanceSignals(
      buildFacts({
        quota: {
          windows: [
            buildWindow({
              type: "monthly",
              unit: percentUnit,
              remainingPercent: 42,
              remaining: 42,
              resetTime,
            }),
          ],
        },
      }),
    )

    expect(signals[0]).toMatchObject({
      remainingPercent: 42,
      remaining: 42,
      resetTime,
    })
  })

  it("ignores non-finite percentages instead of ranking them", () => {
    const signals = buildAllowanceSignals(
      buildFacts({
        quota: { windows: [buildWindow({ remainingPercent: Number.NaN })] },
      }),
    )

    expect(signals[0]).toMatchObject({
      level: API_CREDENTIAL_ALLOWANCE_LEVELS.Unknown,
    })
  })
})

describe("getPrimaryAllowanceSignal", () => {
  it("returns the most urgent signal", () => {
    const primary = getPrimaryAllowanceSignal(
      buildFacts({
        quota: {
          windows: [
            buildWindow({ type: "fiveHour", remainingPercent: 80 }),
            buildWindow({ type: "weekly", remainingPercent: 10 }),
          ],
        },
      }),
    )

    expect(primary?.id).toBe("quota:weekly:1")
  })

  it("returns undefined when nothing is monitored", () => {
    expect(getPrimaryAllowanceSignal(undefined)).toBeUndefined()
  })
})

describe("getAllowanceCountdown", () => {
  const now = Date.UTC(2026, 0, 1, 12, 0, 0)

  it("splits the remaining time into days, hours, and minutes", () => {
    expect(
      getAllowanceCountdown(now + (2 * 60 + 14) * 60_000, now),
    ).toMatchObject({ days: 0, hours: 2, minutes: 14, isElapsed: false })
    expect(
      getAllowanceCountdown(now + (3 * 24 * 60 + 60) * 60_000, now),
    ).toMatchObject({ days: 3, hours: 1, minutes: 0, isElapsed: false })
  })

  it("marks a past reset time as elapsed", () => {
    expect(getAllowanceCountdown(now - 60_000, now)).toMatchObject({
      days: 0,
      hours: 0,
      minutes: 0,
      isElapsed: true,
    })
  })

  it("returns undefined without a usable reset time", () => {
    expect(getAllowanceCountdown(undefined, now)).toBeUndefined()
    expect(getAllowanceCountdown(Number.NaN, now)).toBeUndefined()
    expect(getAllowanceCountdown(0, now)).toBeUndefined()
  })
})

describe("getAllowanceCountdownDisplay", () => {
  /** Builds a countdown result through the public splitter. */
  function countdownIn(ms: number) {
    return getAllowanceCountdown(
      Date.UTC(2026, 0, 1, 12, 0, 0) + ms,
      Date.UTC(2026, 0, 1, 12, 0, 0),
    )!
  }

  it("keeps the two most significant units", () => {
    expect(
      getAllowanceCountdownDisplay(countdownIn(3 * 24 * 3_600_000 + 3_600_000)),
    ).toEqual({ key: "daysHours", values: { days: 3, hours: 1 } })
    expect(
      getAllowanceCountdownDisplay(countdownIn(2 * 3_600_000 + 14 * 60_000)),
    ).toEqual({ key: "hoursMinutes", values: { hours: 2, minutes: 14 } })
  })

  it("drops to minutes and below when that is all that is left", () => {
    expect(getAllowanceCountdownDisplay(countdownIn(25 * 60_000))).toEqual({
      key: "minutes",
      values: { minutes: 25 },
    })
    expect(getAllowanceCountdownDisplay(countdownIn(30_000))).toEqual({
      key: "imminent",
      values: {},
    })
  })

  it("reports an elapsed reset instead of a countdown", () => {
    expect(getAllowanceCountdownDisplay(countdownIn(-60_000))).toEqual({
      key: "elapsed",
      values: {},
    })
  })
})

describe("formatRunwayDays", () => {
  it("rounds down so a runway is never overstated", () => {
    expect(formatRunwayDays(2.9)).toBe(2)
    expect(formatRunwayDays(10)).toBe(10)
  })

  it("never reports a usable balance as zero days", () => {
    expect(formatRunwayDays(0.4)).toBe(1)
    expect(formatRunwayDays(0)).toBe(1)
  })
})

describe("buildAllowanceOverview", () => {
  /** Builds a minimal stored profile wrapping the supplied telemetry facts. */
  function buildProfile(
    id: string,
    name: string,
    facts?: ApiCredentialTelemetryFacts,
  ): ApiCredentialProfile {
    return {
      id,
      name,
      apiType: "openai-compatible",
      baseUrl: "https://example.com",
      apiKey: "sk-test",
      tagIds: [],
      notes: "",
      createdAt: 1,
      updatedAt: 1,
      ...(facts
        ? {
            telemetrySnapshot: {
              attempts: [],
              health: { status: SiteHealthStatus.Healthy },
              lastSyncTime: 1,
              facts,
            },
          }
        : {}),
    }
  }

  it("counts monitored profiles and surfaces the most urgent one", () => {
    const overview = buildAllowanceOverview([
      buildProfile("a", "Alpha", {
        quota: { windows: [buildWindow({ remainingPercent: 15 })] },
      }),
      buildProfile("b", "Beta", {
        balances: [buildBalance({ amount: 300 })],
        usage: { todayCost: { value: 1, unit: usdMoney } },
      }),
      buildProfile("c", "Gamma"),
    ])

    expect(overview).toMatchObject({
      totalCount: 3,
      monitoredCount: 2,
      criticalCount: 1,
      lowCount: 0,
    })
    expect(overview.mostUrgent).toMatchObject({
      profileId: "a",
      profileName: "Alpha",
    })
    expect(overview.mostUrgent?.signal.id).toBe("quota:fiveHour:0")
  })

  it("reports no most-urgent entry when nothing is monitored", () => {
    const overview = buildAllowanceOverview([buildProfile("c", "Gamma")])

    expect(overview).toMatchObject({ totalCount: 1, monitoredCount: 0 })
    expect(overview.mostUrgent).toBeUndefined()
  })

  it("counts a balance with an unknown runway as low-priority monitoring", () => {
    const overview = buildAllowanceOverview([
      buildProfile("a", "Alpha", { balances: [buildBalance()] }),
    ])

    expect(overview).toMatchObject({ monitoredCount: 1, criticalCount: 0 })
  })
})
