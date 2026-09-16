import type { AccountRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { ModelCatalogSnapshot } from "~/services/modelCatalog/snapshot"
import type { ModelDescriptor } from "~/services/models/modelDescriptor"

export type ModelCatalogRequest = ApiServiceRequest & {
  auth: ApiServiceRequest["auth"] & {
    apiKey: string
  }
}

export type ModelCatalogCapability = {
  /** Enrich selected-key visibility with provider pricing facts and fallbacks. */
  enrichPricing?(params: {
    accountRequest: ApiServiceRequest
    runtimeKey: AccountRuntimeKey
    models: readonly ModelDescriptor[]
  }): Promise<ModelCatalogSnapshot>
  fetchModels(request: ModelCatalogRequest): Promise<ModelDescriptor[]>
}
