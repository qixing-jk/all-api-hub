import type { ModelCatalogSnapshot } from "~/services/modelCatalog/snapshot"
import {
  MODEL_CATALOG_SCOPES,
  MODEL_LIST_SOURCE_KINDS,
} from "~/services/modelList/pricingModel"

/** Identifies provider-wide fallback catalogs using the normalized response scope. */
export function isProviderCatalogFallback(
  pricing: ModelCatalogSnapshot | null,
) {
  return (
    pricing?.model_list_source?.kind ===
      MODEL_LIST_SOURCE_KINDS.CATALOG_FALLBACK &&
    pricing.model_list_source.catalogScope === MODEL_CATALOG_SCOPES.PROVIDER
  )
}
