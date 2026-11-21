import { describe, expect, it } from "vitest"

import {
  balancePosition,
  balancePositionSchema,
  isKnownOrStaleObservation,
  observationWindowSchema,
  usageScopeKey,
  type Observed,
} from "~/services/amounts/balance"
import {
  BALANCE_NATURES,
  BALANCE_ROLES,
  EVIDENCE_KINDS,
  FINANCIAL_OBSERVATION_REASONS,
  FINANCIAL_SUBJECT_KINDS,
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

describe("financial scope and observation boundaries", () => {
  const scope = {
    subject: { kind: FINANCIAL_SUBJECT_KINDS.Credential, profileId: "key-a" },
    authority: "https://quota.example",
    projects: { kind: "unknown" },
    groups: { kind: "unknown" },
    keys: { kind: "unknown" },
    models: { kind: "unknown" },
  } as const

  it("matches the same restrictions across subjects only when ignoring ownership explicitly", () => {
    const another = {
      ...scope,
      subject: { ...scope.subject, profileId: "key-b" },
    }
    expect(usageScopeKey(scope)).not.toBe(usageScopeKey(another))
    expect(usageScopeKey(scope, false)).toBe(usageScopeKey(another, false))
    expect(usageScopeKey({ ...scope, routes: { kind: "all" } })).not.toBe(
      usageScopeKey({ ...scope, routes: { kind: "unknown" } }),
    )
  })

  it("rejects a credit limit classified as prepaid and a child position without a relationship", () => {
    const credit = balancePosition({
      id: "credit",
      scope,
      role: BALANCE_ROLES.CreditLimit,
      nature: BALANCE_NATURES.Credit,
      asset: { kind: "currency", code: "USD" },
      value: "100",
      source,
      observedAt: 1,
    })
    expect(balancePositionSchema.safeParse(credit).success).toBe(true)
    expect(
      balancePositionSchema.safeParse({
        ...credit,
        nature: BALANCE_NATURES.Prepaid,
      }).success,
    ).toBe(false)
    expect(
      balancePositionSchema.safeParse({ ...credit, parentId: "parent" })
        .success,
    ).toBe(false)
    const window = { start: 2, end: 1, timeZone: "UTC" }
    expect(observationWindowSchema.safeParse(window).success).toBe(false)
    expect(balancePositionSchema.safeParse({ ...credit, window }).success).toBe(
      false,
    )
  })
})
