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
  PRICING_SOURCE_KINDS,
  TOKENS_PER_MILLION,
} from "~/services/modelPricing/pricingConstants"
import { calculateModelPrice } from "~/services/models/utils/modelPricing"

import { TOKEN_METERS, type PricingPlan } from "./pricingPlan"

/** Normalizes published pricing independently of any usage scenario or quote. */
export function resolveCanonicalPricingPlan(
  model: ModelPricing,
  groupMultiplier: number,
): PricingPlan {
  if (model.pricingPlan) return model.pricingPlan
  if (model.quotaPricing || isModelPriceUnavailable(model))
    return {
      rates: {},
      rules: [],
      groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
      source: { kind: PRICING_SOURCE_KINDS.ACCOUNT },
      issues: [{ code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE }],
    }
  const calculated = calculateModelPrice(model, groupMultiplier)
  const plan: PricingPlan = {
    rates: {},
    rules: [],
    groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
    source: {
      ...(model.price_metadata?.source_url
        ? { url: model.price_metadata.source_url }
        : {}),
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
  } else {
    if (
      calculated.kind === CALCULATED_PRICE_KINDS.PER_CALL &&
      typeof calculated.usdPerCall === "object"
    ) {
      for (const meter of [
        PRICING_METERS.INPUT,
        PRICING_METERS.OUTPUT,
      ] as const) {
        plan.rates[meter] = {
          amount: calculated.usdPerCall[meter],
          currency: "USD",
          unit: PRICE_RATE_UNITS.REQUEST,
          per: 1,
        }
      }
    }
    // Separate per-call components are published facts, but have no verified usage basis for quotation.
    plan.issues.push({ code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE })
  }
  if (
    groupMultiplier === undefined ||
    !Number.isFinite(groupMultiplier) ||
    groupMultiplier < 0
  )
    plan.issues.push({ code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE })
  return plan
}
