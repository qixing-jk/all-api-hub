import {
  PRICING_CONDITION_KINDS,
  PRICING_SELECTION_AXES,
} from "~/services/modelPricing/pricingConstants"
import {
  SERVICE_TIERS,
  type PricingPlan,
} from "~/services/modelPricing/pricingPlan"

import { calendarConditions, parseBillingConditions } from "./billingConditions"
import { BILLING_EXPRESSION_LIMITS } from "./billingLimits"
import { parseBooleanConditions, splitTopLevel, unwrap } from "./billingSyntax"

type Conditions = PricingPlan["rules"][number]["conditions"]

/** Expand verified AND/OR predicates into bounded alternative condition groups. */
function conditionsFor(text: string): Conditions[] | undefined {
  return parseBooleanConditions<Conditions[number]>(text, (unwrapped) => {
    const tier = /^param\("service_tier"\)\s*==\s*"([a-z]+)"$/.exec(unwrapped)
    if (tier && SERVICE_TIERS.some((value) => value === tier[1]))
      return [
        [
          {
            kind: PRICING_CONDITION_KINDS.SELECTION,
            axis: PRICING_SELECTION_AXES.SERVICE_TIER,
            value: tier[1],
          },
        ],
      ]
    const timeGroups = parseBillingConditions(unwrapped)
    if (
      timeGroups &&
      timeGroups.every((group) =>
        group.every((range) => range.timeZone !== undefined),
      )
    )
      return timeGroups.map((group) => group.flatMap(calendarConditions))
    return undefined
  })
}

/**
 * Current New API visual editor persists `(base) * (condition ? factor : 1)`.
 * web/src/features/pricing/lib/billing-expr.ts at bee45b58a3c0b77e8dc81e6b5aeb4474aa9058d1.
 * Request headers and arbitrary body probes need corresponding scenario data.
 */
export function splitBillingRequestFactors(expression: string):
  | {
      base: string
      factors: { alternatives: Conditions[]; multiplier: number }[]
    }
  | undefined {
  // A plain token formula also contains top-level multiplication. Only split
  // request factors when a conditional exists; the caller validates the base.
  if (!expression.includes("?"))
    return { base: unwrap(expression), factors: [] }
  const parts = splitTopLevel(expression, "*")
  if (!parts.length) return undefined
  if (parts.length === 1) return { base: unwrap(expression), factors: [] }
  if (parts.length > BILLING_EXPRESSION_LIMITS.REQUEST_FACTOR_PARTS)
    return undefined
  const factors: { alternatives: Conditions[]; multiplier: number }[] = []
  for (const part of parts.slice(1)) {
    const match =
      /^(.*)\?\s*([0-9]+(?:\.[0-9]+)?(?:e[+-]?\d+)?)\s*:\s*1$/i.exec(
        unwrap(part),
      )
    if (!match || !Number.isFinite(Number(match[2]))) return undefined
    const alternatives = conditionsFor(match[1])
    if (!alternatives) return undefined
    factors.push({ alternatives, multiplier: Number(match[2]) })
  }
  return { base: unwrap(parts[0]), factors }
}
