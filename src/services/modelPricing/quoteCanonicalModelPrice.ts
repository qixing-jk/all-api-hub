import {
  isModelPriceUnavailable,
  type ModelPricing,
} from "~/services/modelList/pricingModel"
import {
  CALCULATED_PRICE_KINDS,
  PRICING_ISSUE_CODES,
  PRICING_METERS,
  PRICING_PURPOSES,
  PRICING_USAGE_MODES,
} from "~/services/modelPricing/pricingConstants"
import { calculateModelPrice } from "~/services/models/utils/modelPricing"

import { resolveCanonicalPricingPlan } from "./canonicalPricingPlan"
import { type PricingCostContext, type PricingScenario } from "./pricingPlan"
import { quoteModelPrice } from "./quoteModelPrice"

/** Converts existing flat adapters at the migration boundary without changing their multiplier ownership. */
export function quoteCanonicalModelPrice(
  model: ModelPricing,
  scenario: PricingScenario,
  cost: PricingCostContext,
) {
  const isUnitComparison = scenario.purpose === PRICING_PURPOSES.TOKEN_INDEX
  // Legacy flat-price metadata must not replace a structured plan or its diagnostics.
  if (
    model.quotaPricing ||
    (!model.pricingPlan && isModelPriceUnavailable(model))
  )
    return quoteModelPrice(
      resolveCanonicalPricingPlan(model, cost.groupMultiplier ?? NaN),
      scenario,
      cost,
    )
  // A fixed per-call price remains per call even in the token-price view.
  // Media plans require their own quantity and must not be treated as calls.
  if (
    (model.quota_type === 1 ||
      model.pricingPlan?.usageMode === PRICING_USAGE_MODES.REQUEST) &&
    (!model.pricingPlan?.usageMode ||
      [PRICING_USAGE_MODES.TOKENS, PRICING_USAGE_MODES.REQUEST].some(
        (mode) => mode === model.pricingPlan?.usageMode,
      )) &&
    scenario.purpose === PRICING_PURPOSES.TOKEN_INDEX
  ) {
    scenario = {
      ...scenario,
      purpose: PRICING_PURPOSES.REQUEST,
      usage: { request: 1 },
    }
  }
  if (model.pricingPlan)
    return quoteModelPrice(
      // Fixed-call comparisons use request quantities internally, but reference
      // lengths still select tiers rather than validate a real request.
      isUnitComparison
        ? { ...model.pricingPlan, limits: undefined }
        : model.pricingPlan,
      model.pricingPlan.usageMode === PRICING_USAGE_MODES.IMAGE &&
        scenario.purpose === PRICING_PURPOSES.REQUEST
        ? {
            ...scenario,
            usage: {
              image: scenario.usage.image,
              ...(Object.hasOwn(scenario.usage, PRICING_METERS.REFERENCE_IMAGE)
                ? { referenceImage: scenario.usage.referenceImage }
                : {}),
            },
          }
        : (model.quota_type === 1 ||
              model.pricingPlan.usageMode === PRICING_USAGE_MODES.REQUEST) &&
            scenario.purpose === PRICING_PURPOSES.REQUEST
          ? { ...scenario, usage: { request: scenario.usage.request } }
          : scenario,
      cost,
    )
  const calculated = calculateModelPrice(model, cost.groupMultiplier ?? NaN)
  const plan = resolveCanonicalPricingPlan(model, cost.groupMultiplier ?? NaN)
  // Flat token adapters do not publish all independent request fees.
  if (
    calculated.kind === CALCULATED_PRICE_KINDS.TOKEN &&
    scenario.purpose === PRICING_PURPOSES.REQUEST
  )
    plan.issues.push({ code: PRICING_ISSUE_CODES.UNKNOWN_FEES })
  const usage =
    calculated.kind === CALCULATED_PRICE_KINDS.PER_CALL &&
    scenario.purpose === PRICING_PURPOSES.REQUEST
      ? { request: scenario.usage.request }
      : scenario.usage
  return quoteModelPrice(plan, { ...scenario, usage }, cost)
}
