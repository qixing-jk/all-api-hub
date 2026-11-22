import {
  accountAllowanceEntryKey,
  accountAllowanceSnapshotSchema,
  bindAccountAllowances,
  type AccountAllowanceEntry,
  type AccountAllowanceRefreshPart,
  type AccountAllowanceSnapshot,
} from "~/services/accounts/allowances"
import {
  financialCollectionKey,
  isKnownOrStaleObservation,
} from "~/services/amounts/balance"
import {
  staleBudgetConstraint,
  type BudgetConstraint,
} from "~/services/amounts/budgets"
import {
  BUDGET_AMOUNT_FIELDS,
  BUDGET_LIMIT_STATES,
  BUDGET_OBSERVATION_FIELDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_ENUMERATION,
  FINANCIAL_SUBJECT_KINDS,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"

const collectionKey = (
  entry: Pick<AccountAllowanceEntry, "collectionKey" | "constraint">,
) => {
  const source = entry.constraint.stateObservation.source
  return financialCollectionKey(entry.collectionKey, source)
}
/** Preserve missing budget fields independently, without recomputing mixed-time amounts. */
export const retainUnknownBudgetFields = (
  previous: BudgetConstraint,
  next: BudgetConstraint,
): BudgetConstraint => {
  const stale = staleBudgetConstraint(previous)
  const result = { ...next }
  for (const field of BUDGET_OBSERVATION_FIELDS) {
    if (
      (field === BUDGET_AMOUNT_FIELDS.Limit ||
        field === BUDGET_AMOUNT_FIELDS.Remaining) &&
      (next.limitState === BUDGET_LIMIT_STATES.Unlimited ||
        next.limitState === BUDGET_LIMIT_STATES.Unconfigured)
    )
      continue
    if (!isKnownOrStaleObservation(next[field])) {
      // Observation fields share one discriminant; retain each value's own source and time.
      Object.assign(result, { [field]: stale[field] })
    }
  }
  if (!isKnownOrStaleObservation(next.stateObservation)) {
    result.limitState = stale.limitState
    result.stateObservation = stale.stateObservation
  }
  return result
}

/** Runs inside the admitted account refresh transaction, alongside balance acceptance. */
export function acceptAccountAllowances(
  previous: AccountAllowanceSnapshot | undefined,
  incoming: unknown,
  parts: AccountAllowanceRefreshPart[] | undefined,
  accountId: string,
  attempted: boolean,
  capturedAt: number,
): AccountAllowanceSnapshot | undefined {
  const snapshot =
    incoming === undefined
      ? undefined
      : bindAccountAllowances(
          accountAllowanceSnapshotSchema.parse(incoming),
          accountId,
        )
  if (!snapshot && !parts && !attempted) return previous
  if (!snapshot && !parts && !previous) return undefined
  for (const part of parts ?? []) {
    const key = financialCollectionKey(part.collectionKey, part.source)
    if (part.entries.some((entry) => collectionKey(entry) !== key))
      throw new Error("allowance_collection_mismatch")
  }
  const nextEntries = (
    parts
      ? parts
          .filter(
            (part) =>
              part.enumeration !== FINANCIAL_ENUMERATION.NotRequested &&
              part.enumeration !== FINANCIAL_ENUMERATION.Unavailable,
          )
          .flatMap((part) => part.entries)
      : (snapshot?.entries ?? [])
  ).map((entry) => ({
    ...entry,
    constraint: {
      ...entry.constraint,
      scope: {
        ...entry.constraint.scope,
        subject: { kind: FINANCIAL_SUBJECT_KINDS.Account, accountId },
      },
    },
  }))
  const oldEntries = new Map(
    (previous?.entries ?? []).map((entry) => [
      accountAllowanceEntryKey(entry),
      entry,
    ]),
  )
  const known = new Set(nextEntries.map(accountAllowanceEntryKey))
  const partByCollection = new Map(
    (parts ?? []).map((part) => [
      financialCollectionKey(part.collectionKey, part.source),
      part,
    ]),
  )
  const retained = (previous?.entries ?? []).flatMap((entry) => {
    if (known.has(accountAllowanceEntryKey(entry))) return []
    const part = partByCollection.get(collectionKey(entry))
    if (part?.enumeration === FINANCIAL_ENUMERATION.Complete) return []
    return [{ ...entry, constraint: staleBudgetConstraint(entry.constraint) }]
  })
  const entries = [
    ...nextEntries.map((entry) => {
      const old = oldEntries.get(accountAllowanceEntryKey(entry))
      const sameWindow =
        old &&
        JSON.stringify([
          old.constraint.window,
          old.validity,
          old.reportedTiming,
        ]) ===
          JSON.stringify([
            entry.constraint.window,
            entry.validity,
            entry.reportedTiming,
          ])
      return sameWindow
        ? {
            ...entry,
            constraint: retainUnknownBudgetFields(
              old.constraint,
              entry.constraint,
            ),
          }
        : entry
    }),
    ...retained,
  ]
  return accountAllowanceSnapshotSchema.parse({
    schemaVersion: 1,
    subject: { kind: FINANCIAL_SUBJECT_KINDS.Account, accountId },
    capturedAt,
    entries,
    coverage:
      parts?.length &&
      parts.every(
        (part) => part.enumeration === FINANCIAL_ENUMERATION.Complete,
      ) &&
      !retained.length &&
      entries.every(
        (entry) =>
          entry.constraint.stateObservation.status ===
          OBSERVATION_STATUSES.Known,
      )
        ? FINANCIAL_COVERAGE.Complete
        : FINANCIAL_COVERAGE.Partial,
  })
}
