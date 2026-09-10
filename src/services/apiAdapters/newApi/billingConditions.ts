import { PRICING_CONDITION_KINDS } from "~/services/modelPricing/pricingConstants"
import type { PricingPlan } from "~/services/modelPricing/pricingPlan"

import { BILLING_EXPRESSION_LIMITS } from "./billingLimits"
import { parseBooleanConditions } from "./billingSyntax"

type CalendarCondition = Extract<
  PricingPlan["rules"][number]["conditions"][number],
  { kind: "calendar" }
>

export interface BillingRange {
  variable: "p" | "c" | "len" | CalendarCondition["part"]
  timeZone?: string
  min?: number
  maxExclusive?: number
}

/** Parse token and calendar predicates with boolean composition, without evaluation. */
export function parseBillingConditions(
  text: string,
): BillingRange[][] | undefined {
  return parseBooleanConditions(text, (term) => {
    const match =
      /^(p|c|len)\s*(<=|>=|<|>)\s*((?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?)$/.exec(
        term,
      )
    const calendar =
      /^(hour|minute|weekday|month|day)\("([^"\\]+)"\)\s*(<=|>=|<|>|==)\s*(\d+)$/.exec(
        term,
      )
    if (!match && !calendar) return undefined
    const variable = (match?.[1] ?? calendar![1]) as BillingRange["variable"]
    const operator = match?.[2] ?? calendar![3]
    const value = Number(match?.[3] ?? calendar![4])
    const boundary =
      operator === ">" || operator === "<="
        ? Math.floor(value) + 1
        : Math.ceil(value)
    if (!Number.isSafeInteger(boundary) || boundary < 0) return undefined
    return [
      [
        {
          variable,
          ...(calendar ? { timeZone: calendar[2] } : {}),
          ...(operator === "=="
            ? { min: value, maxExclusive: value + 1 }
            : operator.startsWith("<")
              ? { maxExclusive: boundary }
              : { min: boundary }),
        },
      ],
    ]
  })
}

/** Translate time ranges to the same calendar predicates used by request factors. */
export function calendarConditions(range: BillingRange): CalendarCondition[] {
  return [
    ...(range.min === undefined
      ? []
      : [{ operator: ">=" as const, value: range.min }]),
    ...(range.maxExclusive === undefined
      ? []
      : [{ operator: "<" as const, value: range.maxExclusive }]),
  ].map((bound) => ({
    kind: PRICING_CONDITION_KINDS.CALENDAR,
    part: range.variable as CalendarCondition["part"],
    timeZone: range.timeZone!,
    ...bound,
  }))
}

/** Intersect ranges and discard unreachable branches before expanding further. */
export function intersectBillingConditions(
  left: BillingRange[],
  right: BillingRange[],
): BillingRange[] | undefined {
  const merged = new Map<string, BillingRange>()
  for (const range of [...left, ...right]) {
    const key = JSON.stringify([range.variable, range.timeZone])
    const previous = merged.get(key)
    const min = Math.max(previous?.min ?? 0, range.min ?? 0)
    const maxExclusive = Math.min(
      previous?.maxExclusive ?? Infinity,
      range.maxExclusive ?? Infinity,
    )
    if (min >= maxExclusive) return undefined
    merged.set(key, {
      variable: range.variable,
      timeZone: range.timeZone,
      min,
      ...(Number.isFinite(maxExclusive) ? { maxExclusive } : {}),
    })
  }
  return [...merged.values()]
}

/** Negate an AND into disjoint alternatives, preserving first-match semantics. */
function negateBillingConditions(ranges: BillingRange[]): BillingRange[][] {
  return ranges.flatMap((range, index) => [
    ...(range.min === undefined
      ? []
      : [
          [
            ...ranges.slice(0, index),
            {
              variable: range.variable,
              timeZone: range.timeZone,
              maxExclusive: range.min,
            },
          ],
        ]),
    ...(range.maxExclusive === undefined
      ? []
      : [
          [
            ...ranges.slice(0, index),
            {
              variable: range.variable,
              timeZone: range.timeZone,
              min: range.maxExclusive,
            },
          ],
        ]),
  ])
}

/** Negate a disjunction of conjunctions without losing branch exclusions. */
export function negateBillingAlternatives(
  alternatives: BillingRange[][],
): BillingRange[][] | undefined {
  let result: BillingRange[][] = [[]]
  for (const group of alternatives) {
    result = result.flatMap((path) =>
      negateBillingConditions(group).flatMap((inverse) => {
        const merged = intersectBillingConditions(path, inverse)
        return merged ? [merged] : []
      }),
    )
    if (result.length > BILLING_EXPRESSION_LIMITS.ALTERNATIVES) return undefined
  }
  return result
}
