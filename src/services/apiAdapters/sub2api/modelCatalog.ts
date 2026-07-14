import { fetchSub2ApiRuntimeModels } from "~/services/apiService/sub2api"
import { normalizeModelDescriptors } from "~/services/models/modelDescriptor"

import type { ModelCatalogCapability } from "../contracts/modelCatalog"

export const sub2ApiModelCatalog: ModelCatalogCapability = {
  fetchModels: async (request) =>
    normalizeModelDescriptors(
      (await fetchSub2ApiRuntimeModels(request)).map((id) => ({ id })),
    ),
}
