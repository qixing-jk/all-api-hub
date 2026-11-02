import {
  PRICE_RATE_UNITS,
  PRICING_GROUP_MULTIPLIERS,
  TOKENS_PER_MILLION,
} from "./pricingConstants"
import type { PricingPlan } from "./pricingPlan"

export type PublishedPricing = Pick<PricingPlan, "source"> & {
  issues?: PricingPlan["issues"]
  schedule: PricingPlan["rules"]
}

/** Projects the selected group's rates without selecting scenario-dependent rules. */
export function readPublishedPricing(
  plan: PricingPlan,
  groupMultiplier: number,
): PublishedPricing {
  // Unverified rules expose the source schedule; they do not justify deriving account rates.
  const multiplier =
    plan.groupMultiplier === PRICING_GROUP_MULTIPLIERS.INCLUDED ||
    plan.issues.length > 0 ||
    plan.source.rulesUnavailable
      ? 1
      : groupMultiplier
  return {
    source: plan.source,
    issues: plan.issues,
    schedule: [
      { id: "base", conditions: [], rates: plan.rates },
      ...plan.rules,
    ].map((rule) => ({
      ...rule,
      rates: Object.fromEntries(
        Object.entries(rule.rates).map(([meter, rate]) => [
          meter,
          { ...rate, amount: rate.amount * multiplier },
        ]),
      ),
    })),
  }
}

/** Normalizes rate denominators without applying scenario conditions or currency conversion. */
export function normalizePublishedSchedule(schedule: PricingPlan["rules"]) {
  return schedule
    .map((rule) => ({
      ...rule,
      rates: Object.fromEntries(
        Object.entries(rule.rates).flatMap(([meter, rate]) => {
          const amount =
            (rate.amount / rate.per) *
            (rate.unit === PRICE_RATE_UNITS.TOKEN ? TOKENS_PER_MILLION : 1)
          return Number.isFinite(amount) && amount >= 0 && rate.per > 0
            ? [
                [
                  meter,
                  {
                    ...rate,
                    amount,
                    per:
                      rate.unit === PRICE_RATE_UNITS.TOKEN
                        ? TOKENS_PER_MILLION
                        : 1,
                  },
                ],
              ]
            : []
        }),
      ),
    }))
    .filter((rule) => Object.keys(rule.rates).length > 0)
}
