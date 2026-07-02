import type { ModelCatalogCapability } from "~/services/apiAdapters/contracts/modelCatalog"
import { fetchCodexServiceModels } from "~/services/apiService/sharedchat"

export const sharedChatModelCatalog: ModelCatalogCapability = {
  fetchModels: (request) => fetchCodexServiceModels(request),
}
