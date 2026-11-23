import { normalizeVApiModelPricingResponse } from "~/services/apiAdapters/newApi/pricing/modelPricingDto"
import * as vApi from "~/services/apiService/newApiFamily/variants/vApi"

import type { CompatibleAccountVariant } from "../../compatibleAccountVariantContract"
import { compatibleTokenInventoryOverrides } from "../variantOperations/key"
import {
  bindModelPricing,
  fetchDefaultModelPricing,
} from "../variantOperations/pricing"

export const vApiVariant: CompatibleAccountVariant = {
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
