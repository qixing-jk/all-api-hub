import * as anyrouter from "~/services/apiService/newApiFamily/variants/anyrouter"

import type { CompatibleAccountVariant } from "../../compatibleAccountVariantContract"
import { compatibleTokenInventoryOverrides } from "../variantOperations/key"

export const anyrouterVariant: CompatibleAccountVariant = {
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
