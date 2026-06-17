import type { ApiServiceRequest } from "~/services/apiTransport/type"

export type ModelCatalogRequest = ApiServiceRequest & {
  auth: ApiServiceRequest["auth"] & {
    apiKey: string
  }
}

export type ModelCatalogCapability = {
  fetchModels(request: ModelCatalogRequest): Promise<string[]>
}
