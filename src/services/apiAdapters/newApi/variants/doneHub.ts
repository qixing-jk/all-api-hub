import { applyFamilyGroupEvidence } from "~/services/apiAdapters/newApi/account/groupEvidence"
import * as doneHub from "~/services/apiService/newApiFamily/variants/doneHub"
import * as oneHub from "~/services/apiService/newApiFamily/variants/oneHub"

import { oneHubOverrides } from "../variantOperations/key"
import { bindModelPricing } from "../variantOperations/pricing"
import type { NewApiVariantRegistration } from "../variantRegistration"

export const doneHubVariant: NewApiVariantRegistration = {
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
