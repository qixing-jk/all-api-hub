import type { PricingPlan } from "./pricingPlan"

/** Applies a uniform multiplier without changing meter units or allowances. */
export function scalePricingRates(
  rates: PricingPlan["rates"],
  multiplier: number,
): PricingPlan["rates"] {
  return Object.fromEntries(
    Object.entries(rates).map(([meter, rate]) => [
      meter,
      { ...rate, amount: rate.amount * multiplier },
    ]),
  )
}
