import { isAccountKeyResourceRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import { fetchSub2ApiRuntimeModels } from "~/services/apiService/sub2api"
import { normalizeModelDescriptors } from "~/services/models/modelDescriptor"

import type { ModelCatalogCapability } from "../contracts/modelCatalog"
import {
  buildSub2ApiRuntimePricingResponse,
  loadSub2ApiEstimatedPricingResponse,
} from "./catalogPricing"

export const sub2ApiModelCatalog: ModelCatalogCapability = {
  enrichPricing: async ({ accountRequest, runtimeKey, models }) => {
    if (!isAccountKeyResourceRuntimeKey(runtimeKey)) {
      return buildSub2ApiRuntimePricingResponse(models)
    }
    return loadSub2ApiEstimatedPricingResponse({
      request: accountRequest,
      selectedRef: runtimeKey.resourceRef,
      resolvedKey: runtimeKey.secret,
      runtimeModels: models,
    })
  },
  fetchModels: async (request) =>
    normalizeModelDescriptors(
      (await fetchSub2ApiRuntimeModels(request)).map((id) => ({ id })),
    ),
}
