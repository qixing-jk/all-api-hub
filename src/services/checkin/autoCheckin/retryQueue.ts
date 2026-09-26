import type {
  AutoCheckinRetryState,
  CheckinAccountResult,
} from "~/types/autoCheckin"

import { isRetryableCheckinResult } from "./resultPolicy"

/**
 * Today's automatic-retry bookkeeping, and the only place its transitions are
 * decided.
 *
 * The unit of the attempt budget is the local day, not one run: a run that
 * produces a result may admit or drop accounts from the work list, but it must
 * not hand back attempts an account already spent today. An account that used
 * up `maxAttemptsPerDay` therefore stays out of the work list for the rest of
 * the day, and its count survives the work list becoming empty.
 *
 * `undefined` means there is nothing left to remember for today.
 */
const toTodayLedger = (
  current: AutoCheckinRetryState | undefined,
  today: string,
): AutoCheckinRetryState | undefined =>
  current?.day === today ? current : undefined

/** Returns the day's ledger, or nothing when it holds neither work nor counts. */
const toLedgerOrNothing = (input: {
  day: string
  pendingAccountIds: string[]
  attemptsByAccount: Record<string, number>
}): AutoCheckinRetryState | undefined =>
  input.pendingAccountIds.length === 0 &&
  Object.keys(input.attemptsByAccount).length === 0
    ? undefined
    : {
        day: input.day,
        pendingAccountIds: input.pendingAccountIds,
        attemptsByAccount: input.attemptsByAccount,
      }

/** Drops the work list entries whose account already spent the day's budget. */
const withoutExhausted = (
  pendingAccountIds: readonly string[],
  attemptsByAccount: Record<string, number>,
  maxAttempts: number,
): string[] =>
  pendingAccountIds.filter(
    (accountId) => (attemptsByAccount[accountId] ?? 1) < maxAttempts,
  )

/**
 * Today's ledger after an ordinary run — daily, manual, or single-account —
 * produced `results`.
 *
 * A retryable result joins the work list. Its first admission today starts the
 * count at 1, and a count that is already higher stays where it is.
 */
export function mergeRunResults(input: {
  today: string
  enabled: boolean
  maxAttempts: number
  current: AutoCheckinRetryState | undefined
  results: Record<string, CheckinAccountResult>
  /** A daily run rebuilds the work list from its own results. */
  replacePendingWithResults: boolean
}): AutoCheckinRetryState | undefined {
  if (!input.enabled) return undefined

  const current = toTodayLedger(input.current, input.today)
  const attemptsByAccount = { ...(current?.attemptsByAccount ?? {}) }
  const pending = new Set(
    input.replacePendingWithResults ? [] : current?.pendingAccountIds ?? [],
  )

  for (const [accountId, result] of Object.entries(input.results)) {
    if (!isRetryableCheckinResult(result)) {
      pending.delete(accountId)
      continue
    }
    attemptsByAccount[accountId] ??= 1
    if (attemptsByAccount[accountId] < input.maxAttempts) pending.add(accountId)
    else pending.delete(accountId)
  }

  return toLedgerOrNothing({
    day: input.today,
    pendingAccountIds: [...pending],
    attemptsByAccount,
  })
}

/**
 * Today's ledger after the automatic retry run produced `results`, of which
 * `attemptedAccountIds` actually spent an attempt.
 *
 * An entry whose account this run has no result for — a manual retry or a
 * scoped manual run may have admitted it while this run was executing — keeps
 * its place; the work list is read inside the storage lock for exactly that
 * reason. An entry this run did answer for follows its result.
 */
export function mergeRetryRunOutcomes(input: {
  today: string
  maxAttempts: number
  current: AutoCheckinRetryState | undefined
  attemptedAccountIds: readonly string[]
  results: Record<string, CheckinAccountResult>
}): AutoCheckinRetryState | undefined {
  const current = toTodayLedger(input.current, input.today)
  const attemptsByAccount = { ...(current?.attemptsByAccount ?? {}) }
  const attempted = new Set(input.attemptedAccountIds)

  for (const accountId of attempted) {
    // A work-list entry with no recorded count is the initial attempt the older
    // payloads did not store, so one retry on top of it is attempt two.
    attemptsByAccount[accountId] = (attemptsByAccount[accountId] ?? 1) + 1
  }

  const pendingAccountIds = (current?.pendingAccountIds ?? []).filter(
    (accountId) => {
      const result = input.results[accountId]
      if (result !== undefined && !isRetryableCheckinResult(result)) {
        return false
      }
      return (attemptsByAccount[accountId] ?? 1) < input.maxAttempts
    },
  )

  return toLedgerOrNothing({
    day: input.today,
    pendingAccountIds,
    attemptsByAccount,
  })
}

/**
 * Today's ledger with accounts that already spent the budget taken out.
 *
 * Returns the same state when there is nothing to take out, so a caller that
 * writes the result back can skip a no-op storage write.
 */
export function pruneExhaustedPending(input: {
  state: AutoCheckinRetryState
  maxAttempts: number
}): AutoCheckinRetryState | undefined {
  const pendingAccountIds = withoutExhausted(
    input.state.pendingAccountIds,
    input.state.attemptsByAccount,
    input.maxAttempts,
  )
  const next = toLedgerOrNothing({
    day: input.state.day,
    pendingAccountIds,
    attemptsByAccount: input.state.attemptsByAccount,
  })
  if (!next) return undefined
  return pendingAccountIds.length === input.state.pendingAccountIds.length
    ? input.state
    : next
}
