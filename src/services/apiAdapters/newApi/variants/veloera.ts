import * as veloera from "~/services/apiService/newApiFamily/variants/veloera"
import * as veloeraCheckIn from "~/services/apiService/newApiFamily/variants/veloeraCheckIn"

import type { CompatibleAccountVariant } from "../../compatibleAccountVariantContract"
import { veloeraTokenInventoryOverrides } from "../variantOperations/key"

export const veloeraVariant: CompatibleAccountVariant = {
  key: { transport: veloeraTokenInventoryOverrides },
  data: {
    fetchAccountData: veloera.fetchAccountData,
    refreshAccountData: veloera.refreshAccountData,
    fetchSupportCheckIn: veloera.fetchSupportCheckIn,
  },
  bootstrap: {
    extractCheckInSupport: veloeraCheckIn.extractCheckInSupport,
  },
}
