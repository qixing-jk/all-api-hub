import type { TokenProvisioningCapability } from "~/services/apiAdapters/contracts/tokenProvisioning"
import * as tokenProvisioning from "~/services/apiService/newApiFamily/default/tokenProvisioning"

export const createNewApiTokenProvisioning = (): TokenProvisioningCapability =>
  tokenProvisioning.defaultTokenProvisioning
