import * as wong from "~/services/apiService/newApiFamily/variants/wong"

import { compatibleTokenInventoryOverrides } from "../variantOperations/key"
import type { NewApiVariantRegistration } from "../variantRegistration"

export const wongGongyiVariant: NewApiVariantRegistration = {
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
