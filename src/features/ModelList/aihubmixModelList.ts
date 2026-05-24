import { SITE_TYPES } from "~/constants/siteType"
import {
  toAihubmixCatalogFallbackCapabilities,
  toAihubmixModelListCapabilities,
  type ModelManagementAccountSource,
} from "~/features/ModelList/modelManagementSources"
import {
  MODEL_LIST_SOURCE_KINDS,
  type PricingResponse,
} from "~/services/apiService/common/type"
import type { DisplaySiteData } from "~/types"

/**
 * Check whether the pricing payload came from AIHubMix's model-list adapter.
 */
export function isAihubmixModelListPricing(
  account: DisplaySiteData | undefined,
  pricing: PricingResponse | null | undefined,
) {
  return (
    account?.siteType === SITE_TYPES.AIHUBMIX &&
    pricing?.model_list_source?.provider === SITE_TYPES.AIHUBMIX
  )
}

/**
 * Check whether AIHubMix returned the global catalog instead of account-scoped models.
 */
export function isAihubmixCatalogFallbackPricing(
  account: DisplaySiteData | undefined,
  pricing: PricingResponse | null | undefined,
) {
  return (
    isAihubmixModelListPricing(account, pricing) &&
    pricing?.model_list_source?.kind ===
      MODEL_LIST_SOURCE_KINDS.CATALOG_FALLBACK
  )
}

/**
 * Applies AIHubMix-specific model-list capability downgrades to an account row source.
 */
export function applyAihubmixModelListCapabilities<
  TSource extends ModelManagementAccountSource,
>(source: TSource, pricing: PricingResponse | null | undefined): TSource {
  if (isAihubmixCatalogFallbackPricing(source.account, pricing)) {
    return {
      ...source,
      capabilities: toAihubmixCatalogFallbackCapabilities(source.capabilities),
    }
  }

  if (isAihubmixModelListPricing(source.account, pricing)) {
    return {
      ...source,
      capabilities: toAihubmixModelListCapabilities(source.capabilities),
    }
  }

  return source
}
