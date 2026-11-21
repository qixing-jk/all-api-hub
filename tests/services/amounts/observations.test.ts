import { describe, expect, it } from "vitest"

import {
  isKnownOrStaleObservation,
  type Observed,
} from "~/services/amounts/balance"
import {
  EVIDENCE_KINDS,
  FINANCIAL_OBSERVATION_REASONS,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"

const source = {
  adapter: "fixture",
  operation: "balance",
  contractVersion: "1",
  kind: EVIDENCE_KINDS.Reported,
}

describe("known or stale observations", () => {
  it.each([OBSERVATION_STATUSES.Known, OBSERVATION_STATUSES.Stale])(
    "retains zero, false and the original observation clock for %s",
    (status) => {
      const value: Observed<string> =
        status === OBSERVATION_STATUSES.Known
          ? { status, value: "0", source, observedAt: 123 }
          : {
              status,
              value: "0",
              source,
              observedAt: 123,
              reason: FINANCIAL_OBSERVATION_REASONS.RefreshUnavailable,
            }
      expect(isKnownOrStaleObservation(value)).toBe(true)
      if (isKnownOrStaleObservation(value)) {
        expect(value.value).toBe("0")
        expect(value.observedAt).toBe(123)
      }
      expect(isKnownOrStaleObservation({ ...value, value: false })).toBe(true)
    },
  )

  it.each([
    OBSERVATION_STATUSES.Unknown,
    OBSERVATION_STATUSES.Unsupported,
    OBSERVATION_STATUSES.Unavailable,
  ])(
    "keeps %s unavailable even when malformed input carries a value",
    (status) => {
      expect(isKnownOrStaleObservation({ status, value: "0" })).toBe(false)
    },
  )

  it("accepts known nonnumeric budget states while rejecting absent observations", () => {
    expect(
      isKnownOrStaleObservation({
        status: OBSERVATION_STATUSES.Known,
        source,
        observedAt: 123,
      }),
    ).toBe(true)
    expect(isKnownOrStaleObservation(undefined)).toBe(false)
    expect(isKnownOrStaleObservation(null)).toBe(false)
  })
})
