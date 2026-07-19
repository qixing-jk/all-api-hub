import type { ModelCatalogCapability } from "~/services/apiAdapters/contracts/modelCatalog"
import { fetchCodexServiceModels } from "~/services/apiService/sharedchat"
import { normalizeModelDescriptors } from "~/services/models/modelDescriptor"

export const sharedChatModelCatalog: ModelCatalogCapability = {
  fetchModels: async (request) =>
    normalizeModelDescriptors(
      (await fetchCodexServiceModels(request)).map((id) => ({ id })),
    ),
}
