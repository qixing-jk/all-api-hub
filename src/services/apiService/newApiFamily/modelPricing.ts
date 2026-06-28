import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import * as commonModelPricing from "~/services/apiService/common"
import { type ApiServiceRequest } from "~/services/apiService/common/type"
import * as oneHubModelPricing from "~/services/apiService/oneHub"
import type { PricingResponse } from "~/services/modelList/pricingModel"

interface ModelPricingImplementation {
  fetchModelPricing: (request: ApiServiceRequest) => Promise<PricingResponse>
}

const defaultModelPricingImplementation: ModelPricingImplementation = {
  fetchModelPricing: commonModelPricing.fetchModelPricing,
}

const oneHubModelPricingOverrides: Partial<ModelPricingImplementation> = {
  fetchModelPricing: oneHubModelPricing.fetchModelPricing,
}

const modelPricingOverrides: Partial<
  Record<AccountSiteType, Partial<ModelPricingImplementation>>
> = {
  [SITE_TYPES.ONE_HUB]: oneHubModelPricingOverrides,
  [SITE_TYPES.DONE_HUB]: oneHubModelPricingOverrides,
}

const getModelPricingImplementation = (
  siteType: AccountSiteType,
): ModelPricingImplementation => ({
  ...defaultModelPricingImplementation,
  ...modelPricingOverrides[siteType],
})

/**
 * Create model-pricing operations bound to a New API-family site type.
 */
export function createModelPricingImplementation(
  siteType: AccountSiteType,
): ModelPricingImplementation {
  const implementation = getModelPricingImplementation(siteType)

  return {
    fetchModelPricing: (request) => implementation.fetchModelPricing(request),
  }
}
