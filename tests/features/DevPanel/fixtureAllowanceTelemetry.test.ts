import { describe, expect, it } from "vitest"

import {
  API_CREDENTIAL_ALLOWANCE_LEVELS,
  getPrimaryAllowanceSignal,
} from "~/features/ApiCredentialProfiles/allowance/apiCredentialAllowance"
import { DEV_ALLOWANCE_FIXTURES } from "~/features/DevPanel/fixtureAllowanceTelemetry"
import { coerceTelemetrySnapshot } from "~/services/apiCredentialProfiles/telemetry/snapshotCodec"

const NOW = Date.UTC(2026, 5, 1, 12, 0, 0)

describe("dev allowance fixtures", () => {
  it("covers every allowance state the dashboard renders", () => {
    const states = Object.fromEntries(
      DEV_ALLOWANCE_FIXTURES.map((fixture) => {
        const snapshot = fixture.buildSnapshot(NOW)
        return [
          fixture.id,
          snapshot
            ? getPrimaryAllowanceSignal(snapshot.facts)?.level ?? "none"
            : "no-telemetry",
        ]
      }),
    )

    expect(states).toEqual({
      "five-hour-critical": API_CREDENTIAL_ALLOWANCE_LEVELS.Critical,
      "monthly-healthy": API_CREDENTIAL_ALLOWANCE_LEVELS.Normal,
      "balance-runway-critical": API_CREDENTIAL_ALLOWANCE_LEVELS.Critical,
      "balance-without-spend": API_CREDENTIAL_ALLOWANCE_LEVELS.Unknown,
      "percent-window": API_CREDENTIAL_ALLOWANCE_LEVELS.Normal,
      "no-telemetry": "no-telemetry",
    })
  })

  it("keeps every seeded snapshot readable by the storage codec", () => {
    for (const fixture of DEV_ALLOWANCE_FIXTURES) {
      const snapshot = fixture.buildSnapshot(NOW)
      if (!snapshot) continue

      const coerced = coerceTelemetrySnapshot(snapshot)
      expect(coerced, fixture.id).toBeDefined()
      expect(coerced?.facts?.quota?.windows ?? [], fixture.id).toHaveLength(
        snapshot.facts?.quota?.windows?.length ?? 0,
      )
      expect(coerced?.facts?.balances ?? [], fixture.id).toHaveLength(
        snapshot.facts?.balances?.length ?? 0,
      )
    }
  })

  it("anchors reset times in the future so countdowns stay live", () => {
    for (const fixture of DEV_ALLOWANCE_FIXTURES) {
      const snapshot = fixture.buildSnapshot(NOW)
      for (const window of snapshot?.facts?.quota?.windows ?? []) {
        expect(window.resetTime, fixture.id).toBeGreaterThan(NOW)
      }
    }
  })

  it("estimates a runway only where today's spend is reported", () => {
    const runwaySignal = (id: string) => {
      const fixture = DEV_ALLOWANCE_FIXTURES.find((item) => item.id === id)!
      const signal = getPrimaryAllowanceSignal(
        fixture.buildSnapshot(NOW)?.facts,
      )
      return signal?.kind === "balance" ? signal.runwayDays : undefined
    }

    expect(runwaySignal("balance-runway-critical")).toBeCloseTo(2.5, 5)
    expect(runwaySignal("balance-without-spend")).toBeUndefined()
  })

  it("labels every fixture as inert local sample data", () => {
    for (const fixture of DEV_ALLOWANCE_FIXTURES) {
      expect(fixture.name, fixture.id).toMatch(/^Dev Allowance:/)
      expect(fixture.notes, fixture.id).toContain("Dev fixture")
    }
  })
})
