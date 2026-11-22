import { z } from "zod"

import { assetIdentity } from "~/services/amounts/assets"
import {
  balancePositionSchema,
  usageScopeKey,
  usageScopeSchema,
  type BalancePosition,
  type BalanceRefreshPart,
  type EvidenceRef,
  type UsageScope,
} from "~/services/amounts/balance"
import { budgetConstraintSchema } from "~/services/amounts/budgets"
import {
  BALANCE_CASH_CLASSIFICATIONS,
  BALANCE_FUNDING,
  BALANCE_NATURES,
  BALANCE_ROLES,
  BUDGET_WINDOW_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_ENUMERATION,
  FINANCIAL_SUBJECT_KINDS,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"

export const ALLOWANCE_IDENTITY_KINDS = {
  Upstream: "upstream",
  SourceSlot: "source-slot",
  ObservationOnly: "observation-only",
} as const

/** A plan/window constraint is kept apart from wallets and never summed as funds. */
export const accountAllowanceEntrySchema = z.strictObject({
  id: z.string().min(1),
  identityKind: z.enum(ALLOWANCE_IDENTITY_KINDS),
  collectionKey: z.string().min(1),
  label: z.string().optional(),
  reportedTiming: z
    .strictObject({
      expiresAt: z.string().optional(),
      startsAt: z.string().optional(),
      resetsAt: z.string().optional(),
    })
    .optional(),
  validity: balancePositionSchema.shape.validity,
  constraint: budgetConstraintSchema,
})
export type AccountAllowanceEntry = z.infer<typeof accountAllowanceEntrySchema>

/** Present remaining allowance as its own amount with the provider's validity and window. */
export function projectAllowancePosition(
  entry: AccountAllowanceEntry,
): BalancePosition {
  const { constraint: budget } = entry
  const window = budget.window
  return {
    id: entry.id,
    collectionKey: entry.collectionKey,
    scope: budget.scope,
    role: BALANCE_ROLES.Allowance,
    nature: BALANCE_NATURES.Subscription,
    funding: BALANCE_FUNDING.Unknown,
    cashClassification: BALANCE_CASH_CLASSIFICATIONS.NotCash,
    asset: budget.asset,
    amount: budget.remaining,
    validity: entry.validity,
    ...(entry.reportedTiming ? { reportedTiming: entry.reportedTiming } : {}),
    ...((window.kind === BUDGET_WINDOW_KINDS.Rolling ||
      window.kind === BUDGET_WINDOW_KINDS.Periodic) &&
    window.observation
      ? { window: { ...window.observation, resetsAt: window.resetsAt } }
      : {}),
  }
}

/** A zone-less provider date is evidence, not an instant in the current user's timezone. */
export function parseAllowanceInstant(value: unknown): number | undefined {
  if (typeof value !== "string" || !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value))
    return undefined
  const instant = Date.parse(value)
  return Number.isFinite(instant) ? instant : undefined
}

/** Names are display metadata; identity includes the actual source and scope. */
export function accountAllowanceEntryKey(entry: AccountAllowanceEntry): string {
  const source = entry.constraint.stateObservation.source
  return JSON.stringify([
    usageScopeKey(entry.constraint.scope),
    assetIdentity(entry.constraint.asset),
    source.adapter,
    source.operation,
    source.contractVersion,
    entry.collectionKey,
    entry.id,
  ])
}

export const accountAllowanceSnapshotSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    subject: usageScopeSchema.shape.subject,
    capturedAt: z.number().finite(),
    entries: z.array(accountAllowanceEntrySchema),
    coverage: z.enum(FINANCIAL_COVERAGE),
  })
  .superRefine((snapshot, context) => {
    const ids = new Set<string>()
    for (const entry of snapshot.entries) {
      const id = accountAllowanceEntryKey(entry)
      if (ids.has(id))
        context.addIssue({
          code: "custom",
          message: "Duplicate allowance identity",
        })
      ids.add(id)
      if (
        JSON.stringify(entry.constraint.scope.subject) !==
        JSON.stringify(snapshot.subject)
      )
        context.addIssue({
          code: "custom",
          message: "Mismatched allowance subject",
        })
    }
  })
export type AccountAllowanceSnapshot = z.infer<
  typeof accountAllowanceSnapshotSchema
>
export type AccountAllowanceRefreshPart = {
  source: EvidenceRef
  collectionKey: string
  enumeration: BalanceRefreshPart["enumeration"]
  entries: AccountAllowanceEntry[]
}

/** Enumeration is supplied explicitly, including complete empty collections. */
export function accountAllowanceObservation(
  scope: UsageScope,
  parts: AccountAllowanceRefreshPart[],
  capturedAt: number,
): {
  allowances: AccountAllowanceSnapshot
  allowanceRefreshParts: AccountAllowanceRefreshPart[]
} {
  const entries = parts.flatMap((part) => part.entries)
  return {
    allowances: accountAllowanceSnapshotSchema.parse({
      schemaVersion: 1,
      subject: scope.subject,
      capturedAt,
      entries,
      coverage: !parts.length
        ? FINANCIAL_COVERAGE.Unknown
        : parts.every(
              (part) => part.enumeration === FINANCIAL_ENUMERATION.Complete,
            ) &&
            entries.every(
              (entry) =>
                entry.constraint.stateObservation.status ===
                OBSERVATION_STATUSES.Known,
            )
          ? FINANCIAL_COVERAGE.Complete
          : FINANCIAL_COVERAGE.Partial,
    }),
    allowanceRefreshParts: parts,
  }
}

/** Bind the saved record without altering upstream plan/window identity. */
export function bindAccountAllowances(
  snapshot: AccountAllowanceSnapshot,
  accountId: string,
): AccountAllowanceSnapshot {
  const subject = { kind: FINANCIAL_SUBJECT_KINDS.Account, accountId }
  return accountAllowanceSnapshotSchema.parse({
    ...snapshot,
    subject,
    entries: snapshot.entries.map((entry) => ({
      ...entry,
      constraint: {
        ...entry.constraint,
        scope: { ...entry.constraint.scope, subject },
      },
    })),
  })
}
