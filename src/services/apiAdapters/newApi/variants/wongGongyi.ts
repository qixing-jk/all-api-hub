import * as wong from "~/services/apiService/newApiFamily/variants/wong"

import type { CompatibleAccountVariant } from "../../compatibleAccountVariantContract"
import { compatibleTokenInventoryOverrides } from "../variantOperations/key"

export const wongGongyiVariant: CompatibleAccountVariant = {
  key: {
    transport: {
      ...compatibleTokenInventoryOverrides,
      resolveApiTokenKey: wong.resolveApiTokenKey,
    },
  },
  data: {
    fetchAccountData: wong.fetchAccountData,
    refreshAccountData: wong.refreshAccountData,
    fetchSupportCheckIn: wong.fetchSupportCheckIn,
  },
  bootstrap: {
    probeCheckInSupport: wong.fetchSupportCheckIn,
  },
}
