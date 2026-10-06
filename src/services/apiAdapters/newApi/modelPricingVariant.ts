import type { AccountSiteType } from "~/constants/siteType"

import type { ModelPricingCapability } from "../contracts/modelPricing"
import { defaultPricing } from "./variantOperations/pricing"
import { getNewApiVariantRegistration } from "./variantRegistration"

/** Transport and canonical admission are selected together by the site adapter. */
export function resolveNewApiModelPricingVariant(
  siteType: AccountSiteType,
): ModelPricingCapability["fetchPricing"] {
  return getNewApiVariantRegistration(siteType).pricing ?? defaultPricing
}
