import { fetchSub2ApiRuntimeModels } from "~/services/apiService/sub2api"

import type { ModelCatalogCapability } from "../contracts/modelCatalog"

export const sub2ApiModelCatalog: ModelCatalogCapability = {
  fetchModels: fetchSub2ApiRuntimeModels,
}
