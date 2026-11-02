import {
  PRICING_CONDITION_KINDS,
  PRICING_SELECTION_AXES,
} from "./pricingConstants"
import type { PriceRate, PricingPlan } from "./pricingPlan"
import { normalizeVideoQuality } from "./videoQuality"

/** Rate identity follows charge fields, independent of object insertion order. */
function samePriceRate(left: PriceRate, right: PriceRate | undefined): boolean {
  return (
    right !== undefined &&
    left.amount === right.amount &&
    left.per === right.per &&
    left.currency === right.currency &&
    left.unit === right.unit &&
    left.freeQuantity === right.freeQuantity &&
    left.unverifiedReason === right.unverifiedReason
  )
}

/**
 * Compile a published table of exclusive variants, independent of row order.
 * Overriding/default rules belong outside this table; compatible overlapping
 * selectors cannot establish which published price applies.
 */
export function compileExclusiveSelectionRules(
  input: PricingPlan["rules"],
): PricingPlan["rules"] | undefined {
  if (
    input.some((rule) =>
      rule.conditions.some(
        (condition) => condition.kind !== PRICING_CONDITION_KINDS.SELECTION,
      ),
    )
  )
    return undefined
  return compileExclusiveVariantRules(input)
}

/** Compile mutually exclusive selections and exact measurements without defining rule precedence. */
export function compileExclusiveVariantRules(
  input: PricingPlan["rules"],
): PricingPlan["rules"] | undefined {
  const compiled: {
    rule: PricingPlan["rules"][number]
    selections: Map<string, string>
  }[] = []
  for (const rule of input) {
    if (!rule.conditions.length) return undefined
    const selections = new Map<string, string>()
    for (const condition of rule.conditions) {
      if (
        condition.kind !== PRICING_CONDITION_KINDS.SELECTION &&
        condition.kind !== PRICING_CONDITION_KINDS.MEASUREMENT
      )
        return undefined
      if (
        condition.kind === PRICING_CONDITION_KINDS.MEASUREMENT &&
        (condition.eq === undefined ||
          !Number.isFinite(condition.eq) ||
          condition.eq < 0 ||
          condition.gt !== undefined ||
          condition.lte !== undefined)
      )
        return undefined
      const key = `${condition.kind}:${condition.axis}`
      const value =
        condition.kind === PRICING_CONDITION_KINDS.MEASUREMENT
          ? String(condition.eq)
          : condition.axis === PRICING_SELECTION_AXES.VIDEO_QUALITY
            ? normalizeVideoQuality(condition.value)
            : condition.value.trim()
      if (!value || selections.has(key)) return undefined
      selections.set(key, value)
    }
    const conditions = rule.conditions.map((condition) =>
      condition.kind === PRICING_CONDITION_KINDS.SELECTION
        ? {
            ...condition,
            value: selections.get(`${condition.kind}:${condition.axis}`)!,
          }
        : condition,
    )
    let duplicate = false
    for (const { rule: existing, selections: other } of compiled) {
      const disjoint = [...selections].some(
        ([axis, value]) => other.has(axis) && other.get(axis) !== value,
      )
      if (disjoint) continue
      if (
        selections.size !== other.size ||
        [...selections].some(([axis, value]) => other.get(axis) !== value) ||
        Object.keys(rule.rates).length !== Object.keys(existing.rates).length ||
        Object.entries(rule.rates).some(
          ([meter, rate]) =>
            !samePriceRate(
              rate,
              existing.rates[meter as keyof typeof existing.rates],
            ),
        )
      )
        return undefined
      duplicate = true
    }
    if (!duplicate) {
      compiled.push({ rule: { ...rule, conditions }, selections })
    }
  }
  return compiled.map(({ rule }) => rule)
}
