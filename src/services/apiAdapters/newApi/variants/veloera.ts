import * as veloera from "~/services/apiService/newApiFamily/variants/veloera"
import * as veloeraCheckIn from "~/services/apiService/newApiFamily/variants/veloeraCheckIn"

import { veloeraTokenInventoryOverrides } from "../variantOperations/key"
import type { NewApiVariantRegistration } from "../variantRegistration"

export const veloeraVariant: NewApiVariantRegistration = {
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
