import { applyFamilyGroupEvidence } from "~/services/apiAdapters/newApi/account/groupEvidence"
import * as oneHub from "~/services/apiService/newApiFamily/variants/oneHub"

import { oneHubOverrides } from "../variantOperations/key"
import { bindModelPricing } from "../variantOperations/pricing"
import type { NewApiVariantRegistration } from "../variantRegistration"

export const oneHubVariant: NewApiVariantRegistration = {
  key: { transport: oneHubOverrides },
  pricing: bindModelPricing(
    (request) => oneHub.fetchModelPricing(request, false),
    applyFamilyGroupEvidence,
  ),
}
