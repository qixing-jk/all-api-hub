import { z } from "zod"

import { assetIdentity, assetSchema } from "~/services/amounts/assets"
import {
  balancePositionSchema,
  isKnownOrStaleObservation,
  observeAmount,
  observedAmountSchema,
  usageScopeKey,
  usageScopeSchema,
  type EvidenceRef,
} from "~/services/amounts/balance"
import {
  compareDecimal,
  divideDecimalByInteger,
} from "~/services/amounts/decimal"
import {
  AWARD_FULFILLMENT,
  AWARD_TARGETS,
  BALANCE_VALIDITY_KINDS,
  EVIDENCE_KINDS,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"

const eventReferenceSchema = z.strictObject({
  namespace: z.string().min(1),
  id: z.string().min(1),
})

export const confirmedAwardSchema = z
  .strictObject({
    id: z.string().min(1),
    asset: assetSchema,
    amount: observedAmountSchema,
    scope: usageScopeSchema,
    validity: balancePositionSchema.shape.validity,
    target: z.enum(AWARD_TARGETS),
    fulfillment: z.enum(AWARD_FULFILLMENT),
    event: eventReferenceSchema.optional(),
    exchangedFrom: eventReferenceSchema.optional(),
  })
  .refine(
    (award) =>
      !isKnownOrStaleObservation(award.amount) ||
      compareDecimal(award.amount.value, "0") >= 0,
    "A grant cannot be negative",
  )

/** Confirmed grants retain their native asset independently of the overall operation's outcome. */
export type ConfirmedAward = z.infer<typeof confirmedAwardSchema>

/** Build grant facts without borrowing balance classifications or guessing missing values. */
export function confirmedAward(
  input: Omit<
    ConfirmedAward,
    "amount" | "validity" | "target" | "fulfillment"
  > &
    Partial<Pick<ConfirmedAward, "validity" | "target" | "fulfillment">> & {
      value: unknown
      source: EvidenceRef
      observedAt: number
      /** Verified protocol units in one unit of the declared asset. */
      nativeUnitsPerAsset?: number
    },
): ConfirmedAward {
  const { value, source, observedAt, nativeUnitsPerAsset, ...fields } = input
  let amount =
    value === undefined || value === null
      ? {
          status: OBSERVATION_STATUSES.Unknown,
          source,
          reason: "grant-amount-not-reported",
        }
      : observeAmount(value, source, observedAt)
  if (
    amount.status === OBSERVATION_STATUSES.Known &&
    compareDecimal(amount.value, "0") < 0
  )
    amount = {
      status: OBSERVATION_STATUSES.Unavailable,
      source,
      reason: "negative-grant",
    }
  if (
    amount.status === OBSERVATION_STATUSES.Known &&
    nativeUnitsPerAsset !== undefined
  ) {
    try {
      amount = {
        ...amount,
        value: divideDecimalByInteger(amount.value, nativeUnitsPerAsset),
      }
    } catch {
      amount = {
        status: OBSERVATION_STATUSES.Unavailable,
        source,
        reason: "unsupported-amount-precision",
      }
    }
  }
  return {
    validity: { kind: BALANCE_VALIDITY_KINDS.Unknown },
    target: AWARD_TARGETS.Unknown,
    fulfillment: AWARD_FULFILLMENT.Unknown,
    ...fields,
    amount,
  }
}

/** Merge only reliable event identities; matching values or labels alone do not identify a grant. */
export function mergeConfirmedAwards(
  previous: ConfirmedAward[],
  incoming: ConfirmedAward[],
): ConfirmedAward[] {
  const result: ConfirmedAward[] = []
  const seen = new Map<string, number[]>()
  for (const award of [...previous, ...incoming]) {
    const key =
      award.event &&
      award.amount.source.kind !== EVIDENCE_KINDS.Legacy &&
      award.amount.source.kind !== EVIDENCE_KINDS.Manual
        ? JSON.stringify([
            usageScopeKey(award.scope),
            award.event.namespace,
            award.event.id,
            award.id,
            assetIdentity(award.asset),
          ])
        : undefined
    const candidates = key ? seen.get(key) : undefined
    const existing = candidates?.find((index) => {
      const prior = result[index]
      return (
        !!prior &&
        (prior.amount.status !== OBSERVATION_STATUSES.Known ||
          award.amount.status !== OBSERVATION_STATUSES.Known ||
          prior.amount.value === award.amount.value)
      )
    })
    if (existing !== undefined) {
      if (award.amount.status === OBSERVATION_STATUSES.Known) {
        result[existing] = award
      }
    } else {
      // Preserve distinct conflicting evidence and recognize each on later readback.
      if (key) seen.set(key, [...(candidates ?? []), result.length])
      result.push(award)
    }
  }
  return result
}
