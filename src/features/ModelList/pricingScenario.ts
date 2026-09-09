import {
  PRICING_PURPOSES,
  PRICING_SERVICE_TIERS,
} from "~/services/modelPricing/pricingConstants"
import type { PricingScenario } from "~/services/modelPricing/pricingPlan"

import type { ModelPriceComparisonWeights } from "./priceComparison"

/** One comparison workload: meter proportions plus conditions for its price tiers. */
export interface ModelPricingScenarioSettings {
  purpose: typeof PRICING_PURPOSES.TOKEN_INDEX
  inputTokens: number | undefined
  outputTokens: number | undefined
  at: string
  serviceTier?: PricingScenario["serviceTier"]
  responseFormat?: PricingScenario["responseFormat"]
  imageSize?: PricingScenario["imageSize"]
  videoInput?: PricingScenario["videoInput"]
  imageQuality?: PricingScenario["imageQuality"]
  videoQuality?: PricingScenario["videoQuality"]
  imageMegapixels?: number
  taskUsage?: PricingScenario["taskUsage"]
}

/** A representative length for tier selection, not a prediction of personal usage. */
export function createDefaultPricingScenario(): ModelPricingScenarioSettings {
  return {
    purpose: PRICING_PURPOSES.TOKEN_INDEX,
    inputTokens: 32000,
    outputTokens: 2000,
    serviceTier: PRICING_SERVICE_TIERS.STANDARD,
    at: new Date().toISOString(),
  }
}

/** Shared comparison conditions apply to every model; weights never invent a request. */
export function resolvePricingScenario(
  settings: ModelPricingScenarioSettings,
  weights: ModelPriceComparisonWeights,
): PricingScenario {
  return { ...settings, purpose: PRICING_PURPOSES.TOKEN_INDEX, usage: weights }
}
