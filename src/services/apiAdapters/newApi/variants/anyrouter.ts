import * as anyrouter from "~/services/apiService/newApiFamily/variants/anyrouter"

import { compatibleTokenInventoryOverrides } from "../variantOperations/key"
import type { NewApiVariantRegistration } from "../variantRegistration"

export const anyrouterVariant: NewApiVariantRegistration = {
  key: { transport: compatibleTokenInventoryOverrides },
  data: {
    fetchAccountData: anyrouter.fetchAccountData,
    refreshAccountData: anyrouter.refreshAccountData,
    fetchSupportCheckIn: anyrouter.fetchSupportCheckIn,
  },
  bootstrap: {
    probeCheckInSupport: anyrouter.fetchSupportCheckIn,
  },
}
