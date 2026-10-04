import type { AccountRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { ModelCatalogSnapshot } from "~/services/modelCatalog/snapshot"
import type { ModelDescriptor } from "~/services/models/modelDescriptor"

export type ModelCatalogRequest = ApiServiceRequest & {
  auth: ApiServiceRequest["auth"] & {
    apiKey: string
  }
}

/** Route fallback affects provenance, not the live model identifiers. */
export type ModelCatalogResult =
  | ModelDescriptor[]
  | { models: ModelDescriptor[]; inferenceRouteFallback: true }

export type ModelCatalogCapability = {
  /** Enrich selected-key visibility with provider pricing facts and fallbacks. */
  enrichPricing?(params: {
    accountRequest: ApiServiceRequest
    runtimeKey: AccountRuntimeKey
    models: readonly ModelDescriptor[]
  }): Promise<ModelCatalogSnapshot>
  /** Console auth stays separate from the inference-key request. */
  fetchModels(
    request: ModelCatalogRequest,
    context?: { accountRequest: ApiServiceRequest },
  ): Promise<ModelCatalogResult>
}
