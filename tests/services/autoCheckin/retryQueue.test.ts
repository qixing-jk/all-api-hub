import { describe, expect, it } from "vitest"

import {
  mergeRetryRunOutcomes,
  mergeRunResults,
  pruneExhaustedPending,
} from "~/services/checkin/autoCheckin/retryQueue"
import type {
  AutoCheckinRetryState,
  CheckinAccountResult,
} from "~/types/autoCheckin"

const TODAY = "2026-09-24"

const retryableFailure = (accountId: string): CheckinAccountResult => ({
  accountId,
  accountName: accountId,
  status: "failed",
  reasonCode: "upstream_rejected",
  retryable: true,
  timestamp: 1,
})

const deadEndFailure = (accountId: string): CheckinAccountResult => ({
  accountId,
  accountName: accountId,
  status: "failed",
  reasonCode: "authentication_required",
  retryable: false,
  timestamp: 1,
})

const skipped = (accountId: string): CheckinAccountResult => ({
  accountId,
  accountName: accountId,
  status: "skipped",
  reasonCode: "method_unavailable",
  timestamp: 1,
})

const success = (accountId: string): CheckinAccountResult => ({
  accountId,
  accountName: accountId,
  status: "success",
  timestamp: 1,
})

const ledger = (
  pendingAccountIds: string[],
  attemptsByAccount: Record<string, number>,
  day = TODAY,
): AutoCheckinRetryState => ({ day, pendingAccountIds, attemptsByAccount })

describe("mergeRunResults", () => {
  it("admits a retryable result as the day's first attempt", () => {
    expect(
      mergeRunResults({
        today: TODAY,
        enabled: true,
        maxAttempts: 3,
        current: undefined,
        results: { a: retryableFailure("a") },
        replacePendingWithResults: true,
      }),
    ).toEqual(ledger(["a"], { a: 1 }))
  })

  it("does not restart the budget of an account that already spent it", () => {
    // The daily run, a manual rerun, or a single-account retry must not hand
    // back attempts the account already used today.
    expect(
      mergeRunResults({
        today: TODAY,
        enabled: true,
        maxAttempts: 3,
        current: ledger(["a"], { a: 3 }),
        results: { a: retryableFailure("a") },
        replacePendingWithResults: false,
      }),
    ).toEqual(ledger([], { a: 3 }))
  })

  it("keeps a higher count instead of resetting it", () => {
    expect(
      mergeRunResults({
        today: TODAY,
        enabled: true,
        maxAttempts: 3,
        current: ledger(["a"], { a: 2 }),
        results: { a: retryableFailure("a") },
        replacePendingWithResults: false,
      }),
    ).toEqual(ledger(["a"], { a: 2 }))
  })

  it("drops an account whose result is a dead end but keeps the count", () => {
    expect(
      mergeRunResults({
        today: TODAY,
        enabled: true,
        maxAttempts: 3,
        current: ledger(["a", "b"], { a: 1, b: 2 }),
        results: { a: deadEndFailure("a") },
        replacePendingWithResults: false,
      }),
    ).toEqual(ledger(["b"], { a: 1, b: 2 }))
  })

  it("replaces the work list with the run's own results for a daily run", () => {
    expect(
      mergeRunResults({
        today: TODAY,
        enabled: true,
        maxAttempts: 3,
        current: ledger(["stale"], { stale: 1 }),
        results: { a: success("a") },
        replacePendingWithResults: true,
      }),
    ).toEqual(ledger([], { stale: 1 }))
  })

  it("keeps other accounts pending for a scoped manual run", () => {
    expect(
      mergeRunResults({
        today: TODAY,
        enabled: true,
        maxAttempts: 3,
        current: ledger(["b"], { b: 1 }),
        results: { a: retryableFailure("a") },
        replacePendingWithResults: false,
      }),
    ).toEqual(ledger(["b", "a"], { b: 1, a: 1 }))
  })

  it("drops another day's ledger", () => {
    expect(
      mergeRunResults({
        today: TODAY,
        enabled: true,
        maxAttempts: 3,
        current: ledger(["a"], { a: 2 }, "2026-09-23"),
        results: { a: retryableFailure("a") },
        replacePendingWithResults: false,
      }),
    ).toEqual(ledger(["a"], { a: 1 }))
  })

  it("remembers nothing while retry is disabled", () => {
    expect(
      mergeRunResults({
        today: TODAY,
        enabled: false,
        maxAttempts: 3,
        current: ledger(["a"], { a: 1 }),
        results: { a: retryableFailure("a") },
        replacePendingWithResults: false,
      }),
    ).toBeUndefined()
  })

  it("keeps the day's counts after the work list empties", () => {
    expect(
      mergeRunResults({
        today: TODAY,
        enabled: true,
        maxAttempts: 3,
        current: ledger(["a"], { a: 3 }),
        results: { a: success("a") },
        replacePendingWithResults: false,
      }),
    ).toEqual(ledger([], { a: 3 }))
  })

  it("returns nothing when the run leaves no trace", () => {
    expect(
      mergeRunResults({
        today: TODAY,
        enabled: true,
        maxAttempts: 3,
        current: undefined,
        results: { a: success("a") },
        replacePendingWithResults: true,
      }),
    ).toBeUndefined()
  })
})

describe("mergeRetryRunOutcomes", () => {
  it("spends one attempt and keeps the account pending", () => {
    expect(
      mergeRetryRunOutcomes({
        today: TODAY,
        maxAttempts: 3,
        current: ledger(["a"], { a: 1 }),
        attemptedAccountIds: ["a"],
        results: { a: retryableFailure("a") },
      }),
    ).toEqual(ledger(["a"], { a: 2 }))
  })

  it("spends the last attempt and stops the account", () => {
    expect(
      mergeRetryRunOutcomes({
        today: TODAY,
        maxAttempts: 3,
        current: ledger(["a"], { a: 2 }),
        attemptedAccountIds: ["a"],
        results: { a: retryableFailure("a") },
      }),
    ).toEqual(ledger([], { a: 3 }))
  })

  it("keeps an account another run queued while this one was executing", () => {
    // A manual single-account retry or a scoped manual run can admit an account
    // mid-flight. This write must not revert it.
    expect(
      mergeRetryRunOutcomes({
        today: TODAY,
        maxAttempts: 3,
        current: ledger(["a", "b"], { a: 1, b: 1 }),
        attemptedAccountIds: ["a"],
        results: { a: success("a") },
      }),
    ).toEqual(ledger(["b"], { a: 2, b: 1 }))
  })

  it("counts an entry with no stored count as its initial attempt", () => {
    expect(
      mergeRetryRunOutcomes({
        today: TODAY,
        maxAttempts: 3,
        current: ledger(["a"], {}),
        attemptedAccountIds: ["a"],
        results: { a: retryableFailure("a") },
      }),
    ).toEqual(ledger(["a"], { a: 2 }))
  })

  it("drops an attempted account that answered with a dead end", () => {
    expect(
      mergeRetryRunOutcomes({
        today: TODAY,
        maxAttempts: 3,
        current: ledger(["a", "b"], { a: 1, b: 1 }),
        attemptedAccountIds: ["a"],
        results: { a: deadEndFailure("a") },
      }),
    ).toEqual(ledger(["b"], { a: 2, b: 1 }))
  })

  it("drops a queued account this run skipped before attempting it", () => {
    // A skipped account spends nothing, but the work list still loses it: the
    // run answered for it, and the answer was not retryable.
    expect(
      mergeRetryRunOutcomes({
        today: TODAY,
        maxAttempts: 3,
        current: ledger(["a", "b"], { a: 1, b: 1 }),
        attemptedAccountIds: [],
        results: { a: skipped("a") },
      }),
    ).toEqual(ledger(["b"], { a: 1, b: 1 }))
  })

  it("drops an entry that is already over budget without a result", () => {
    expect(
      mergeRetryRunOutcomes({
        today: TODAY,
        maxAttempts: 3,
        current: ledger(["a", "b"], { a: 3, b: 1 }),
        attemptedAccountIds: [],
        results: {},
      }),
    ).toEqual(ledger(["b"], { a: 3, b: 1 }))
  })

  it("keeps the day's counts after the last pending account settles", () => {
    expect(
      mergeRetryRunOutcomes({
        today: TODAY,
        maxAttempts: 3,
        current: ledger(["a"], { a: 1 }),
        attemptedAccountIds: ["a"],
        results: { a: success("a") },
      }),
    ).toEqual(ledger([], { a: 2 }))
    expect(
      mergeRetryRunOutcomes({
        today: TODAY,
        maxAttempts: 3,
        current: undefined,
        attemptedAccountIds: [],
        results: {},
      }),
    ).toBeUndefined()
  })
})

describe("pruneExhaustedPending", () => {
  it("removes accounts that spent the budget and keeps their counts", () => {
    expect(
      pruneExhaustedPending({
        state: ledger(["a", "b"], { a: 1, b: 3 }),
        maxAttempts: 3,
      }),
    ).toEqual(ledger(["a"], { a: 1, b: 3 }))
  })

  it("returns the state itself when nothing is exhausted", () => {
    const state = ledger(["a"], { a: 1 })

    expect(pruneExhaustedPending({ state, maxAttempts: 3 })).toBe(state)
  })

  it("returns nothing when neither work nor counts remain", () => {
    expect(
      pruneExhaustedPending({
        state: ledger([], {}),
        maxAttempts: 3,
      }),
    ).toBeUndefined()
  })
})
