import type { AccountSiteType } from "~/constants/siteType"
import type { ProviderModelCatalogPricingResponse } from "~/services/modelList/providerCatalogAdmission"

export type ProviderModelCatalogRequest = {
  abortSignal?: AbortSignal
}

export type ProviderModelCatalogCapability = {
  source: {
    id: string
    provider: AccountSiteType
    displayName: string
    cacheTtlMs: number
  }
  fetchPricing(
    request: ProviderModelCatalogRequest,
  ): Promise<ProviderModelCatalogPricingResponse>
}
