import { normalizeVApiModelPricingResponse } from "~/services/apiAdapters/newApi/pricing/modelPricingDto"
import * as vApi from "~/services/apiService/newApiFamily/variants/vApi"

import { compatibleTokenInventoryOverrides } from "../variantOperations/key"
import {
  bindModelPricing,
  fetchDefaultModelPricing,
} from "../variantOperations/pricing"
import type { NewApiVariantRegistration } from "../variantRegistration"

export const vApiVariant: NewApiVariantRegistration = {
  key: {
    transport: {
      ...compatibleTokenInventoryOverrides,
      fetchAccountAvailableModels: vApi.fetchAccountAvailableModels,
      fetchUserGroups: vApi.fetchUserGroups,
    },
  },
  pricing: bindModelPricing(
    fetchDefaultModelPricing,
    normalizeVApiModelPricingResponse,
  ),
}
