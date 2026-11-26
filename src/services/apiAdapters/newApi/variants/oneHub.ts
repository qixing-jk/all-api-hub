import { applyFamilyGroupEvidence } from "~/services/apiAdapters/newApi/account/groupEvidence"
import * as oneHub from "~/services/apiService/newApiFamily/variants/oneHub"

import type { CompatibleAccountVariant } from "../../compatibleAccountVariantContract"
import { oneHubOverrides } from "../variantOperations/key"
import { bindModelPricing } from "../variantOperations/pricing"

export const oneHubVariant: CompatibleAccountVariant = {
  key: { transport: oneHubOverrides },
  pricing: bindModelPricing(
    (request) => oneHub.fetchModelPricing(request, false),
    applyFamilyGroupEvidence,
  ),
}
