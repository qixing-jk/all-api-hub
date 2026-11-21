import { z } from "zod"

import { assetSchema, type Asset } from "~/services/amounts/assets"
import {
  evidenceSchema,
  isKnownOrStaleObservation,
  observationWindowSchema,
  observeAmount,
  observedAmountSchema,
  observedValueSchema,
  usageScopeSchema,
  type EvidenceRef,
  type Observed,
  type UsageScope,
} from "~/services/amounts/balance"
import { parseDecimal } from "~/services/amounts/decimal"
import {
  BUDGET_ENFORCEMENT,
  BUDGET_LIMIT_STATES,
  BUDGET_PERIODS,
  BUDGET_WINDOW_KINDS,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"

const budgetStateObservationSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal(OBSERVATION_STATUSES.Known),
    source: evidenceSchema,
    observedAt: z.number().finite(),
  }),
  z.strictObject({
    status: z.literal(OBSERVATION_STATUSES.Stale),
    source: evidenceSchema,
    observedAt: z.number().finite(),
    reason: z.string(),
  }),
  ...(
    [OBSERVATION_STATUSES.Unknown, OBSERVATION_STATUSES.Unavailable] as const
  ).map((status) =>
    z.strictObject({
      status: z.literal(status),
      source: evidenceSchema,
      reason: z.string(),
    }),
  ),
])

const observedBooleanSchema = observedValueSchema(z.boolean())

/** Recurrence may be known while actual period boundaries and reset zone are not reported. */
const budgetWindowSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal(BUDGET_WINDOW_KINDS.Lifetime) }),
  z.strictObject({
    kind: z.literal(BUDGET_WINDOW_KINDS.Unknown),
    period: z.enum(BUDGET_PERIODS).optional(),
  }),
  z.strictObject({
    kind: z.literal(BUDGET_WINDOW_KINDS.Periodic),
    period: z.enum(BUDGET_PERIODS),
    timeZone: z.string().min(1).optional(),
    resetsAt: z.number().finite().optional(),
    observation: observationWindowSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal(BUDGET_WINDOW_KINDS.Rolling),
    period: z.enum(BUDGET_PERIODS),
    resetsAt: z.number().finite().optional(),
    observation: observationWindowSchema.optional(),
  }),
])
export type BudgetWindow = z.infer<typeof budgetWindowSchema>

/** A spending restriction is never a wallet position or an allocation of funds. */
export const budgetConstraintSchema = z
  .strictObject({
    asset: assetSchema,
    scope: usageScopeSchema,
    limitState: z.enum(BUDGET_LIMIT_STATES),
    stateObservation: budgetStateObservationSchema,
    limit: observedAmountSchema,
    used: observedAmountSchema,
    remaining: observedAmountSchema,
    reserved: observedAmountSchema,
    byokUsed: observedAmountSchema,
    enabled: observedBooleanSchema,
    enforcement: z.enum(BUDGET_ENFORCEMENT),
    includesByok: observedBooleanSchema,
    usedIncludesByok: observedBooleanSchema,
    window: budgetWindowSchema,
  })
  .superRefine((budget, ctx) => {
    if (
      (budget.limitState === BUDGET_LIMIT_STATES.Unlimited ||
        budget.limitState === BUDGET_LIMIT_STATES.Unconfigured) &&
      (isKnownOrStaleObservation(budget.limit) ||
        isKnownOrStaleObservation(budget.remaining))
    )
      ctx.addIssue({
        code: "custom",
        message: "Unbounded budgets cannot have a numeric limit or remaining",
      })
    if (
      budget.limitState === BUDGET_LIMIT_STATES.Finite &&
      !isKnownOrStaleObservation(budget.limit) &&
      !isKnownOrStaleObservation(budget.remaining)
    )
      ctx.addIssue({
        code: "custom",
        message: "Finite budgets require an observed limit or remaining",
      })
  })
export type BudgetConstraint = z.infer<typeof budgetConstraintSchema>

/** Missing observations preserve their identity; none are synthesized as zero. */
export function budgetConstraint(input: {
  asset: Asset
  scope: UsageScope
  source: EvidenceRef
  observedAt: number
  limitState: BudgetConstraint["limitState"]
  limit?: unknown
  used?: unknown
  remaining?: unknown
  reserved?: unknown
  byokUsed?: unknown
  enabled?: boolean
  includesByok?: boolean
  usedIncludesByok?: boolean
  enforcement?: BudgetConstraint["enforcement"]
  window?: BudgetWindow
}): BudgetConstraint {
  const { source, observedAt } = input
  const unknown = (): Observed<never> => ({
    status: OBSERVATION_STATUSES.Unknown,
    source,
    reason: "not-reported",
  })
  const amount = (value: unknown) =>
    value === undefined || value === null
      ? unknown()
      : observeAmount(value, source, observedAt)
  const boolean = (value: boolean | undefined): Observed<boolean> =>
    value === undefined
      ? unknown()
      : { status: OBSERVATION_STATUSES.Known, value, source, observedAt }
  const unbounded =
    input.limitState === BUDGET_LIMIT_STATES.Unlimited ||
    input.limitState === BUDGET_LIMIT_STATES.Unconfigured
  const limitState =
    input.limitState === BUDGET_LIMIT_STATES.Finite &&
    parseDecimal(input.limit) === undefined &&
    parseDecimal(input.remaining) === undefined
      ? BUDGET_LIMIT_STATES.Unknown
      : input.limitState
  return budgetConstraintSchema.parse({
    asset: input.asset,
    scope: input.scope,
    limitState,
    stateObservation:
      limitState === BUDGET_LIMIT_STATES.Unknown
        ? {
            status: OBSERVATION_STATUSES.Unknown,
            source,
            reason: "not-reported",
          }
        : { status: OBSERVATION_STATUSES.Known, source, observedAt },
    limit: unbounded ? unknown() : amount(input.limit),
    used: amount(input.used),
    remaining: unbounded ? unknown() : amount(input.remaining),
    reserved: amount(input.reserved),
    byokUsed: amount(input.byokUsed),
    enabled: boolean(input.enabled),
    includesByok: boolean(input.includesByok),
    usedIncludesByok: boolean(input.usedIncludesByok),
    enforcement: input.enforcement ?? BUDGET_ENFORCEMENT.Unknown,
    window: input.window ?? { kind: BUDGET_WINDOW_KINDS.Unknown },
  })
}
