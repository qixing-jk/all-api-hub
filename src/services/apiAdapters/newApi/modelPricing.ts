import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import type { ModelPricingCapability } from "~/services/apiAdapters/contracts/modelPricing"
import * as modelPricing from "~/services/apiService/newApiFamily/default/modelPricing"
import * as oneHub from "~/services/apiService/newApiFamily/variants/oneHub"

type ModelPricingImplementation =
  typeof modelPricing.defaultModelPricingImplementation

const oneHubModelPricingOverrides: Partial<ModelPricingImplementation> = {
  fetchModelPricing: oneHub.fetchModelPricing,
}

const modelPricingOverrides: Partial<
  Record<AccountSiteType, Partial<ModelPricingImplementation>>
> = {
  [SITE_TYPES.ONE_HUB]: oneHubModelPricingOverrides,
  [SITE_TYPES.DONE_HUB]: oneHubModelPricingOverrides,
}

/**
 * Create account model-pricing operations bound to the New API-family site type.
 */
export function createNewApiModelPricing(
  siteType: AccountSiteType,
): ModelPricingCapability {
  const implementation = {
    ...modelPricing.defaultModelPricingImplementation,
    ...modelPricingOverrides[siteType],
  }

  return {
    fetchPricing: (request) => implementation.fetchModelPricing(request),
  }
}
