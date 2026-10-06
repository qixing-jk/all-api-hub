import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import * as apiyi from "~/services/apiService/newApiFamily/variants/apiyi"

import { compatibleTokenInventoryOverrides } from "../variantOperations/key"
import { apiyiPricing } from "../variantOperations/pricing"
import type { NewApiVariantRegistration } from "../variantRegistration"

export const apiyiVariant: NewApiVariantRegistration = {
  key: {
    transport: {
      // https://api.apiyi.com/ (v29.8.9) returns token arrays starting at p=0.
      ...compatibleTokenInventoryOverrides,
      fetchAccountAvailableModels: apiyi.fetchAccountAvailableModels,
      fetchUserGroups: apiyi.fetchUserGroups,
    },
  },
  credentials: {
    getOrCreateAccessToken: apiyi.getAccessToken,
    missingTokenReason:
      AUTO_DETECT_FAILURE_REASONS.AccessTokenVerificationRequired,
  },
  pricing: apiyiPricing,
}
