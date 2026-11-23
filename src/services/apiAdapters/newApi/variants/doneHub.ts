import { applyFamilyGroupEvidence } from "~/services/apiAdapters/newApi/account/groupEvidence"
import * as doneHub from "~/services/apiService/newApiFamily/variants/doneHub"
import * as oneHub from "~/services/apiService/newApiFamily/variants/oneHub"

import type { CompatibleAccountVariant } from "../../compatibleAccountVariantContract"
import { oneHubOverrides } from "../variantOperations/key"
import { bindModelPricing } from "../variantOperations/pricing"

export const doneHubVariant: CompatibleAccountVariant = {
  key: { transport: oneHubOverrides },
  data: {
    fetchAccountData: doneHub.fetchAccountData,
    refreshAccountData: doneHub.refreshAccountData,
  },
  pricing: bindModelPricing(
    (request) => oneHub.fetchModelPricing(request, true),
    applyFamilyGroupEvidence,
  ),
}
