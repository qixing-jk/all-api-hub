import {
  isModelPriceUnavailable,
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  type ModelPricing,
} from "~/services/modelList/pricingModel"
import {
  CALCULATED_PRICE_KINDS,
  PRICE_RATE_UNITS,
  PRICING_GROUP_MULTIPLIERS,
  PRICING_ISSUE_CODES,
  PRICING_METERS,
  PRICING_PURPOSES,
  PRICING_SOURCE_KINDS,
  PRICING_USAGE_MODES,
  TOKENS_PER_MILLION,
} from "~/services/modelPricing/pricingConstants"
import { calculateModelPrice } from "~/services/models/utils/modelPricing"

import {
  TOKEN_METERS,
  type PricingCostContext,
  type PricingPlan,
  type PricingScenario,
} from "./pricingPlan"
import { quoteModelPrice } from "./quoteModelPrice"

/** Converts existing flat adapters at the migration boundary without changing their multiplier ownership. */
export function quoteCanonicalModelPrice(
  model: ModelPricing,
  scenario: PricingScenario,
  cost: PricingCostContext,
) {
  const isUnitComparison = scenario.purpose === PRICING_PURPOSES.TOKEN_INDEX
  // Legacy flat-price metadata must not replace a structured plan or its diagnostics.
  if (!model.pricingPlan && isModelPriceUnavailable(model))
    return quoteModelPrice(
      {
        rates: {},
        rules: [],
        groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
        source: { kind: PRICING_SOURCE_KINDS.ACCOUNT },
        issues: [{ code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE }],
      },
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
  const plan: PricingPlan = {
    rates: {},
    rules: [],
    groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
    source: {
      kind:
        model.price_metadata?.source ===
        MODEL_PRICE_SOURCE_KINDS.PROVIDER_CATALOG
          ? PRICING_SOURCE_KINDS.CATALOG
          : model.price_metadata?.precision ===
              MODEL_PRICE_PRECISION_KINDS.ESTIMATED
            ? PRICING_SOURCE_KINDS.ESTIMATE
            : PRICING_SOURCE_KINDS.ACCOUNT,
    },
    issues: [],
  }
  if (calculated.kind === CALCULATED_PRICE_KINDS.TOKEN) {
    for (const meter of TOKEN_METERS) {
      const amount =
        meter === PRICING_METERS.INPUT ||
        meter === PRICING_METERS.OUTPUT ||
        meter === PRICING_METERS.CACHE_READ ||
        meter === PRICING_METERS.CACHE_WRITE
          ? calculated.usdPerMillionTokens[meter]
          : undefined
      if (amount !== undefined && Number.isFinite(amount) && amount >= 0)
        plan.rates[meter] = {
          amount,
          currency: "USD",
          unit: PRICE_RATE_UNITS.TOKEN,
          per: TOKENS_PER_MILLION,
        }
    }
    // Existing flat token adapters describe token costs, not all request fees.
    if (scenario.purpose === PRICING_PURPOSES.REQUEST)
      plan.issues.push({ code: PRICING_ISSUE_CODES.UNKNOWN_FEES })
  } else if (
    calculated.kind === CALCULATED_PRICE_KINDS.PER_CALL &&
    typeof calculated.usdPerCall === "number"
  ) {
    plan.rates.request = {
      amount: calculated.usdPerCall,
      currency: "USD",
      unit: PRICE_RATE_UNITS.REQUEST,
      per: 1,
    }
  } else plan.issues.push({ code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE })
  if (
    cost.groupMultiplier === undefined ||
    !Number.isFinite(cost.groupMultiplier) ||
    cost.groupMultiplier < 0
  )
    plan.issues.push({ code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE })
  const usage =
    calculated.kind === CALCULATED_PRICE_KINDS.PER_CALL &&
    scenario.purpose === PRICING_PURPOSES.REQUEST
      ? { request: scenario.usage.request }
      : scenario.usage
  return quoteModelPrice(plan, { ...scenario, usage }, cost)
}
