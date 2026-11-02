import { readAimlApiCatalogPrices } from "~/services/apiService/aimlapi/apiPricing"
import type { AimlApiPublicModel } from "~/services/apiService/aimlapi/models"
import type { ModelPricing } from "~/services/modelList/pricingModel"
import type { PricingPlan } from "~/services/modelPricing/pricingPlan"

type TokenPriceUsdPerMillion = NonNullable<
  ModelPricing["token_price_usd_per_million"]
>
export type PublishedPrice = {
  requiredUsage?: PricingPlan["requiredUsage"]
  notes?: PricingPlan["source"]["notes"]
  hasUnpricedCharges?: boolean
  estimated?: boolean
  issues?: PricingPlan["issues"]
  sourceUrl?: string
  rules?: PricingPlan["rules"]
  requiresRuleMatch?: boolean
  rulesUnavailable?: boolean
  rates: PricingPlan["rates"]
  usageMode?: PricingPlan["usageMode"]
  comparison?: PricingPlan["comparison"]
  tokenPrices?: TokenPriceUsdPerMillion
}

/** Read published API declarations without starting optional webpage requests. */
export async function fetchAimlApiPrices(
  modelsInput:
    | readonly AimlApiPublicModel[]
    | Promise<readonly AimlApiPublicModel[]>,
) {
  const models = await modelsInput
  const published = models.filter((model) => Object.hasOwn(model, "pricing"))
  return {
    prices: readAimlApiCatalogPrices(published),
    publishedIds: new Set(published.map((model) => model.id)),
    sourceAvailable: true,
    missingPriceIds: new Set(
      models
        .filter((model) => !Object.hasOwn(model, "pricing"))
        .map((model) => model.id),
    ),
  }
}
