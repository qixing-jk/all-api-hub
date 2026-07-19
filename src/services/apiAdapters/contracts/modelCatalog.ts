import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { ModelDescriptor } from "~/services/models/modelDescriptor"

export type ModelCatalogRequest = ApiServiceRequest & {
  auth: ApiServiceRequest["auth"] & {
    apiKey: string
  }
}

export type ModelCatalogCapability = {
  fetchModels(request: ModelCatalogRequest): Promise<ModelDescriptor[]>
}
